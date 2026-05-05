import { chromium, type Browser, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RoomName } from "./bookings";

/**
 * Mapping rooms → Skedda spaceId. À compléter au fur et à mesure qu'on découvre les IDs.
 * Si un ID est null, on skip la salle pour l'instant.
 */
export const ROOM_SPACE_IDS: Record<RoomName, number | null> = {
  Venus: 1117995, // À confirmer (ID vu dans une URL du user)
  Mars: null,
  Mercury: null,
  Earth: null,
  Jupiter: null,
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
        | "unknown";
      errorMessage: string;
      screenshotPath: string | null;
    };

const SCREENSHOT_DIR = "/app/debug-screenshots";

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

/** YYYY-MM-DDTHH:MM:SS sans timezone (Skedda interprète en horaire venue) */
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

export async function bookSkedda(args: BookSkeddaArgs): Promise<BookSkeddaResult> {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    });
    const page = await ctx.newPage();

    const url = buildBookingUrl(args.spaceId, args.startsAt, args.endsAt);
    console.log("[skedda] navigate", { url, room: args.room });

    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });

    // ---- Email gate (Skedda demande l'email avant le formulaire principal) ----
    const emailInput = page.locator('input[type="email"]').first();
    if (await emailInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      console.log("[skedda] filling email gate");
      await emailInput.fill(args.email);
      // Bouton "Continue" / "Next" / "Submit"
      const nextBtn = page
        .getByRole("button", { name: /(continue|next|submit|suivant|valider)/i })
        .first();
      if (await nextBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await nextBtn.click();
      }
    }

    // ---- Formulaire principal ----
    // Wait for "First name" field — c'est le marqueur fiable que le form est ouvert
    const firstNameField = page.getByLabel(/first ?name/i).first();
    try {
      await firstNameField.waitFor({ state: "visible", timeout: 15_000 });
    } catch {
      const screenshot = await captureScreenshot(page, "form-not-shown");
      await dumpHtml(page, "form-not-shown");
      // Cas spécifique : "more than 10 day(s)" au top de la page
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
        errorMessage: "Booking form did not appear",
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

    // Terms checkbox — peut être identifié par "terms" ou "privacy"
    const termsCheckbox = page.locator('input[type="checkbox"]').first();
    if (await termsCheckbox.isVisible({ timeout: 1_000 }).catch(() => false)) {
      const checked = await termsCheckbox.isChecked().catch(() => false);
      if (!checked) await termsCheckbox.check();
    }

    // ---- Submit ----
    const confirmBtn = page
      .getByRole("button", { name: /confirm booking|confirmer|confirm/i })
      .first();
    await confirmBtn.click();

    // Wait for confirmation or error
    // Success markers: "booking confirmed", "thank you", "réservation confirmée"
    // Error markers: red banner, "already booked", "outside hours"
    const successPattern = /booking confirmed|réservation confirmée|thank you|merci|booking has been/i;
    const errorPattern = /already booked|conflict|already taken|outside|hors|not available|indisponible|more than \d+ day/i;

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

    if (result === "success") {
      // Try to extract a cancel link from the confirmation
      const cancelLink = await page
        .locator("a")
        .filter({ hasText: /cancel|annuler/i })
        .first()
        .getAttribute("href")
        .catch(() => null);

      console.log("[skedda] booking confirmed", { room: args.room, cancelLink });
      return { success: true, cancelLink };
    }

    const fullText = await page.locator("body").innerText().catch(() => "");
    const screenshot = await captureScreenshot(page, "booking-failed");

    if (/more than \d+ day/i.test(fullText)) {
      return {
        success: false,
        reason: "window_too_far",
        errorMessage: "Booking too far in the future (Skedda 10-day window)",
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
    console.error("[skedda] booking exception", { message });
    return {
      success: false,
      reason: "navigation_failed",
      errorMessage: message,
      screenshotPath: null,
    };
  } finally {
    if (browser) await browser.close();
  }
}
