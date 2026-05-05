import type { calendar_v3 } from "googleapis";

export type BookingDecision =
  | { shouldBook: true; reason: "matches_rules" }
  | { shouldBook: false; reason: BookingSkipReason };

export type BookingSkipReason =
  | "cancelled"
  | "recurring"
  | "not_organizer"
  | "no_external_attendee"
  | "location_already_set"
  | "missing_required_field";

export interface ShouldBookContext {
  userEmail: string;
  internalDomain: string;
}

/**
 * Décide si un event Google Calendar doit déclencher un booking de salle.
 * Spec figée :
 *  - status != cancelled
 *  - pas récurrent (recurringEventId absent)
 *  - location vide (pas déjà setté manuellement)
 *  - organizer.email == userEmail (sinon laisse l'organizer s'en occuper)
 *  - ≥ 1 attendee dont l'email n'est pas dans le domaine interne
 */
export function shouldBookRoom(
  event: calendar_v3.Schema$Event,
  ctx: ShouldBookContext,
): BookingDecision {
  if (event.status === "cancelled") {
    return { shouldBook: false, reason: "cancelled" };
  }

  if (event.recurringEventId) {
    return { shouldBook: false, reason: "recurring" };
  }

  if (event.location && event.location.trim().length > 0) {
    return { shouldBook: false, reason: "location_already_set" };
  }

  const organizerEmail = event.organizer?.email?.toLowerCase();
  const userEmail = ctx.userEmail.toLowerCase();
  if (!organizerEmail || organizerEmail !== userEmail) {
    return { shouldBook: false, reason: "not_organizer" };
  }

  const attendees = event.attendees ?? [];
  const internalDomain = ctx.internalDomain.toLowerCase();
  const hasExternal = attendees.some((a) => {
    const email = a.email?.toLowerCase();
    if (!email) return false;
    if (a.resource) return false; // skip salles déjà invitées en tant que ressource
    return !email.endsWith("@" + internalDomain);
  });

  if (!hasExternal) {
    return { shouldBook: false, reason: "no_external_attendee" };
  }

  if (!event.iCalUID || !event.start?.dateTime || !event.end?.dateTime) {
    return { shouldBook: false, reason: "missing_required_field" };
  }

  return { shouldBook: true, reason: "matches_rules" };
}
