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
 * Then ALL of the user's active rules must match (AND logic). A rule is
 * "active" when it's both enabled AND has the data it needs to be
 * meaningful (e.g. titleKeywords with at least one keyword). Enabling
 * more rules → more restrictive booking. If no rules are active, nothing
 * books — that's an explicit opt-out.
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
  // Count rules that actually gate something. A "titleKeywords" toggle with
  // an empty keyword list isn't a filter — we skip it for both the active
  // count and the match check, so it doesn't silently block all bookings.
  let activeRules = 0;

  if (rules.externalAttendee.enabled) {
    activeRules++;
    const hasExternal = attendees.some((a) => {
      const email = a.email?.toLowerCase();
      if (!email) return false;
      if (a.resource) return false;
      return !email.endsWith("@" + internalDomain);
    });
    if (hasExternal) matched.push("externalAttendee");
  }

  if (rules.titleKeywords.enabled && rules.titleKeywords.keywords.length > 0) {
    activeRules++;
    const hit = rules.titleKeywords.keywords.some((kw) =>
      title.includes(kw.toLowerCase().trim()),
    );
    if (hit) matched.push("titleKeywords");
  }

  if (rules.invitedEmails.enabled && rules.invitedEmails.emails.length > 0) {
    activeRules++;
    const targetSet = new Set(rules.invitedEmails.emails.map((e) => e.toLowerCase().trim()));
    const hit = attendees.some((a) => a.email && targetSet.has(a.email.toLowerCase()));
    if (hit) matched.push("invitedEmails");
  }

  if (rules.descriptionKeywords.enabled && rules.descriptionKeywords.keywords.length > 0) {
    activeRules++;
    const hit = rules.descriptionKeywords.keywords.some((kw) =>
      description.includes(kw.toLowerCase().trim()),
    );
    if (hit) matched.push("descriptionKeywords");
  }

  if (activeRules === 0) {
    return { shouldBook: false, reason: "no_rule_matched" };
  }
  // AND: every active rule must contribute a match.
  if (matched.length < activeRules) {
    return { shouldBook: false, reason: "no_rule_matched" };
  }
  return { shouldBook: true, reason: "matches_rules", matchedRules: matched };
}
