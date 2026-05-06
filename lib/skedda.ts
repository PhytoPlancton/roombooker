import { chromium, type Browser, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RoomName } from "./bookings";
import { audit } from "./audit";

export const ROOM_SPACE_IDS: Record<RoomName, number> = {
  Venus: 1117978,
  Mars: 1117995,
  Mercury: 1119104,
  Earth: 1117994,
  Jupiter: 1117977,
};

export interface BookSkeddaArgs {
  room: RoomName;
  spaceId: number;
  startsAt: Date;
  endsAt: Date;
  firstName: string;
  lastName: string;
  email: string;
  telephone: string;
  organization: string;
  title: string;
  // Optional context to thread audit logs back to the right booking
  iCalUID?: string;
  userId?: import("mongodb").ObjectId;
}

export type BookSkeddaResult =
  | { success: true; cancelLink: string | null }
  | {
      success: false;
      reason:
        | "slot_unavailable"
        | "outside_hours"
        | "window_too_far"
        | "form_unexpected"
        | "navigation_failed"
        | "timeout"
        | "unknown";
      errorMessage: string;
      screenshotPath: string | null;
    };

const SCREENSHOT_DIR = "/app/debug-screenshots";
const GLOBAL_TIMEOUT_MS = 90_000; // hard ceiling : kill l'opération après 90s

function buildBookingUrl(spaceId: number, startsAt: Date, endsAt: Date): string {
  const venueUrl = process.env.SKEDDA_VENUE_URL || "https://antlerfrance.skedda.com";
  const startISO = formatLocalIso(startsAt);
  const endISO = formatLocalIso(endsAt);
  const params = new URLSearchParams({
    nbstart: startISO,
    nbend: endISO,
    nbspaces: String(spaceId),
    viewdate: startISO.slice(0, 10),
  });
  return `${venueUrl}/booking?${params.toString()}`;
}

function formatLocalIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    "-" + pad(d.getUTCMonth() + 1) +
    "-" + pad(d.getUTCDate()) +
    "T" + pad(d.getUTCHours()) +
    ":" + pad(d.getUTCMinutes()) +
    ":" + pad(d.getUTCSeconds())
  );
}

async function captureScreenshot(page: Page, name: string): Promise<string | null> {
  try {
    await mkdir(SCREENSHOT_DIR, { recursive: true });
    const path = join(SCREENSHOT_DIR, `${name}-${Date.now()}.png`);
    await page.screenshot({ path, fullPage: true });
    return path;
  } catch {
    return null;
  }
}

async function dumpHtml(page: Page, name: string): Promise<string | null> {
  try {
    await mkdir(SCREENSHOT_DIR, { recursive: true });
    const path = join(SCREENSHOT_DIR, `${name}-${Date.now()}.html`);
    const html = await page.content();
    await writeFile(path, html, "utf8");
    return path;
  } catch {
    return null;
  }
}

async function step(args: BookSkeddaArgs, label: string, extra: Record<string, unknown> = {}) {
  await audit({
    action: "skedda_attempt",
    userId: args.userId ?? null,
    iCalUID: args.iCalUID ?? null,
    details: { step: label, room: args.room, ...extra },
  });
}

export async function bookSkedda(args: BookSkeddaArgs): Promise<BookSkeddaResult> {
  // Hard global timeout — Promise.race against the booking flow
  const timeoutPromise = new Promise<BookSkeddaResult>((resolve) => {
    setTimeout(() => {
      resolve({
        success: false,
        reason: "timeout",
        errorMessage: `Global timeout (${GLOBAL_TIMEOUT_MS}ms)`,
        screenshotPath: null,
      });
    }, GLOBAL_TIMEOUT_MS);
  });

  return Promise.race([bookSkeddaInner(args), timeoutPromise]);
}

async function bookSkeddaInner(args: BookSkeddaArgs): Promise<BookSkeddaResult> {
  let browser: Browser | null = null;
  try {
    await step(args, "launching_browser");
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });

    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    });
    const page = await ctx.newPage();

    const url = buildBookingUrl(args.spaceId, args.startsAt, args.endsAt);
    await step(args, "goto", { url });

    // domcontentloaded est plus robuste que networkidle pour les SPAs qui font du polling
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await step(args, "loaded");

    // ---- Email gate ----
    const emailInput = page.locator('input[type="email"]').first();
    const hasEmailGate = await emailInput
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasEmailGate) {
      await step(args, "email_gate_visible");
      await emailInput.fill(args.email);
      const nextBtn = page
        .getByRole("button", { name: /(continue|next|submit|suivant|valider|next|c'est parti|let's go)/i })
        .first();
      if (await nextBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await nextBtn.click();
        await step(args, "email_gate_submitted");
      }
    } else {
      await step(args, "no_email_gate");
    }

    // ---- Form principal ----
    const firstNameField = page.getByLabel(/first ?name/i).first();
    try {
      await firstNameField.waitFor({ state: "visible", timeout: 15_000 });
      await step(args, "form_visible");
    } catch {
      const screenshot = await captureScreenshot(page, "form-not-shown");
      await dumpHtml(page, "form-not-shown");
      const errorText = await page.locator("body").innerText().catch(() => "");
      if (/more than \d+ day/i.test(errorText)) {
        return {
          success: false,
          reason: "window_too_far",
          errorMessage: "Booking too far in the future (Skedda 10-day window)",
          screenshotPath: screenshot,
        };
      }
      return {
        success: false,
        reason: "form_unexpected",
        errorMessage: `Form did not appear. Body excerpt: ${errorText.slice(0, 300)}`,
        screenshotPath: screenshot,
      };
    }

    await firstNameField.fill(args.firstName);
    await page.getByLabel(/last ?name/i).first().fill(args.lastName);
    await page.getByLabel(/telephone|téléphone|phone/i).first().fill(args.telephone);

    const orgField = page.getByLabel(/organization|organisation/i).first();
    if (await orgField.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await orgField.fill(args.organization);
    }

    const titleField = page.getByLabel(/booking title|title|titre/i).first();
    if (await titleField.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await titleField.fill(args.title);
    }

    const termsCheckbox = page.locator('input[type="checkbox"]').first();
    if (await termsCheckbox.isVisible({ timeout: 1_000 }).catch(() => false)) {
      const checked = await termsCheckbox.isChecked().catch(() => false);
      if (!checked) await termsCheckbox.check();
    }

    await step(args, "form_filled");

    const confirmBtn = page
      .getByRole("button", { name: /confirm booking|confirmer|confirm/i })
      .first();
    await confirmBtn.click();
    await step(args, "confirm_clicked");

    const successPattern =
      /booking confirmed|réservation confirmée|thank you|merci|booking has been|successfully/i;
    const errorPattern =
      /already booked|conflict|already taken|outside|hors|not available|indisponible|more than \d+ day/i;

    const result = await Promise.race([
      page
        .getByText(successPattern)
        .first()
        .waitFor({ state: "visible", timeout: 20_000 })
        .then(() => "success" as const),
      page
        .getByText(errorPattern)
        .first()
        .waitFor({ state: "visible", timeout: 20_000 })
        .then(() => "error" as const),
    ]).catch(() => "timeout" as const);

    await step(args, "submit_resolved", { result });

    if (result === "success") {
      const cancelLink = await page
        .locator("a")
        .filter({ hasText: /cancel|annuler/i })
        .first()
        .getAttribute("href")
        .catch(() => null);
      return { success: true, cancelLink };
    }

    const fullText = await page.locator("body").innerText().catch(() => "");
    const screenshot = await captureScreenshot(page, "booking-failed");

    if (/more than \d+ day/i.test(fullText)) {
      return {
        success: false,
        reason: "window_too_far",
        errorMessage: "Booking too far in the future",
        screenshotPath: screenshot,
      };
    }
    if (/outside|hors/i.test(fullText)) {
      return {
        success: false,
        reason: "outside_hours",
        errorMessage: "Booking outside venue hours",
        screenshotPath: screenshot,
      };
    }
    if (/already|conflict|not available|indisponible/i.test(fullText)) {
      return {
        success: false,
        reason: "slot_unavailable",
        errorMessage: "Slot already booked",
        screenshotPath: screenshot,
      };
    }

    return {
      success: false,
      reason: "unknown",
      errorMessage: fullText.slice(0, 500),
      screenshotPath: screenshot,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return {
      success: false,
      reason: "navigation_failed",
      errorMessage: message,
      screenshotPath: null,
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
