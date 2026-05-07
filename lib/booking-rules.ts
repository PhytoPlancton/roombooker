import type { calendar_v3 } from "googleapis";
import { DEFAULT_BOOKING_RULES, type BookingRules } from "./users";

export type BookingDecision =
  | { shouldBook: true; reason: "matches_rules"; matchedRules: string[] }
  | { shouldBook: false; reason: BookingSkipReason };

export type BookingSkipReason =
  | "cancelled"
  | "recurring"
  | "not_organizer"
  | "no_rule_matched"
  | "location_already_set"
  | "missing_required_field";

export interface ShouldBookContext {
  userEmail: string;
  internalDomain: string;
  rules?: BookingRules;
}

/**
 * Decides whether a Google Calendar event should trigger a Skedda booking.
 *
 * Hardcoded prerequisites (always required):
 *  - status != cancelled
 *  - not recurring (no recurringEventId)
 *  - location is empty (sales hasn't filled it manually)
 *  - organizer.email == user.email (the user is the host of the meeting)
 *
 * Then at least one of the user's enabled rules must match (OR logic).
 * If no rules are enabled, nothing books — that's an explicit opt-out.
 */
export function shouldBookRoom(
  event: calendar_v3.Schema$Event,
  ctx: ShouldBookContext,
): BookingDecision {
  if (event.status === "cancelled") return { shouldBook: false, reason: "cancelled" };
  if (event.recurringEventId) return { shouldBook: false, reason: "recurring" };
  if (event.location && event.location.trim().length > 0) {
    return { shouldBook: false, reason: "location_already_set" };
  }
  const organizerEmail = event.organizer?.email?.toLowerCase();
  const userEmail = ctx.userEmail.toLowerCase();
  if (!organizerEmail || organizerEmail !== userEmail) {
    return { shouldBook: false, reason: "not_organizer" };
  }
  if (!event.iCalUID || !event.start?.dateTime || !event.end?.dateTime) {
    return { shouldBook: false, reason: "missing_required_field" };
  }

  const rules = ctx.rules ?? DEFAULT_BOOKING_RULES;
  const matched: string[] = [];
  const internalDomain = ctx.internalDomain.toLowerCase();
  const attendees = event.attendees ?? [];
  const title = (event.summary || "").toLowerCase();
  const description = (event.description || "").toLowerCase();

  if (rules.externalAttendee.enabled) {
    const hasExternal = attendees.some((a) => {
      const email = a.email?.toLowerCase();
      if (!email) return false;
      if (a.resource) return false;
      return !email.endsWith("@" + internalDomain);
    });
    if (hasExternal) matched.push("externalAttendee");
  }

  if (rules.titleKeywords.enabled && rules.titleKeywords.keywords.length > 0) {
    const hit = rules.titleKeywords.keywords.some((kw) =>
      title.includes(kw.toLowerCase().trim()),
    );
    if (hit) matched.push("titleKeywords");
  }

  if (rules.invitedEmails.enabled && rules.invitedEmails.emails.length > 0) {
    const targetSet = new Set(rules.invitedEmails.emails.map((e) => e.toLowerCase().trim()));
    const hit = attendees.some((a) => a.email && targetSet.has(a.email.toLowerCase()));
    if (hit) matched.push("invitedEmails");
  }

  if (rules.descriptionKeywords.enabled && rules.descriptionKeywords.keywords.length > 0) {
    const hit = rules.descriptionKeywords.keywords.some((kw) =>
      description.includes(kw.toLowerCase().trim()),
    );
    if (hit) matched.push("descriptionKeywords");
  }

  if (matched.length === 0) {
    return { shouldBook: false, reason: "no_rule_matched" };
  }
  return { shouldBook: true, reason: "matches_rules", matchedRules: matched };
}
