import { ObjectId } from "mongodb";
import { differenceInDays } from "date-fns";
import { ROOM_PRIORITY, type RoomName, markBookingResult, findBookingByICalUID } from "./bookings";
import { ROOM_SPACE_IDS, bookSkeddaHttp, type BookSkeddaResult } from "./skedda-http";
import { notifyUser } from "./notify";
import { applyRoomToCalendarEvent } from "./calendar";
import { findUserById, type UserDoc } from "./users";
import { audit } from "./audit";
import { signCancelToken } from "./magic-link";

const MAX_DAYS_AHEAD = 10;

export interface ProcessBookingArgs {
  iCalUID: string;
  googleEventId: string;
  userId: ObjectId;
  meeting: {
    title: string;
    startsAt: Date;
    endsAt: Date;
  };
}

/**
 * Orchestre :
 *  - Si le meeting est > 10 jours dans le futur, on ne peut pas booker maintenant
 *    (Skedda interdit). À implémenter : queue pendingBookings + cron.
 *  - Sinon, on essaye chaque salle dans l'ordre de priorité jusqu'à ce que ça matche.
 *  - On notifie le sales du résultat (succès / échec).
 *  - Si succès, on met à jour le `location` de l'event Calendar avec le nom de la salle.
 */
export async function processBookingForEvent(args: ProcessBookingArgs): Promise<void> {
  await audit({
    action: "booking_engine_started",
    userId: args.userId,
    iCalUID: args.iCalUID,
    details: { startsAt: args.meeting.startsAt.toISOString() },
  });

  const user = await findUserById(args.userId);
  if (!user) {
    await audit({
      action: "error",
      iCalUID: args.iCalUID,
      details: { where: "engine", reason: "user_not_found" },
    });
    await markBookingResult({
      iCalUID: args.iCalUID,
      status: "failed",
      failureReason: "user_not_found",
    });
    return;
  }

  const daysAhead = differenceInDays(args.meeting.startsAt, new Date());
  if (daysAhead > MAX_DAYS_AHEAD) {
    // Compute the date when the cron will pick it up (10 days before the meeting).
    const willTryAt = new Date(args.meeting.startsAt.getTime() - MAX_DAYS_AHEAD * 86400_000);
    const meetingDateFr = args.meeting.startsAt.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      timeZone: "Europe/Paris",
    });
    const willTryDateFr = willTryAt.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      timeZone: "Europe/Paris",
    });

    await notifyUser({
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        telephone: user.telephone,
        notifPrefs: user.notifPrefs,
      },
      type: "booking_deferred",
      iCalUID: args.iCalUID,
      smsText: `RoomBooker : on a bien reçu ta réu du ${meetingDateFr}. Skedda n'ouvre les résas que 10 jours avant — je m'en occupe le ${willTryDateFr} au matin. Rien à faire.`,
      emailSubject: `On s'occupe de ta salle pour le ${meetingDateFr}`,
      emailHtml: `<p>Bien reçu ta réu du <strong>${meetingDateFr}</strong>.</p><p>Skedda n'ouvre les réservations que 10 jours avant — je m'en occupe le <strong>${willTryDateFr} au matin</strong>. Tu seras prévenu dès que la salle est bloquée.</p>`,
    });

    await audit({
      action: "booking_engine_finished",
      userId: args.userId,
      iCalUID: args.iCalUID,
      details: { result: "deferred_window", daysAhead, willTryAt: willTryAt.toISOString() },
    });
    return;
  }

  const globalPriority = (user.roomPriority && user.roomPriority.length > 0)
    ? user.roomPriority
    : ROOM_PRIORITY;

  // Per-keyword room override. If the meeting title matches a keyword in
  // one of the user's `roomExceptions` entries (first-match-wins on
  // case-insensitive substring), we use THAT entry's room list verbatim
  // and skip the global priority. No fallback: an exception with no
  // available room fails the booking — surprise rooms are worse than a
  // clean failure notification.
  const title = (args.meeting.title || "").toLowerCase();
  const matchedException = (user.roomExceptions ?? []).find((ex) =>
    ex.keywords.some((kw) => {
      const k = kw.toLowerCase().trim();
      return k.length > 0 && title.includes(k);
    }),
  );
  const effectiveRooms = matchedException ? matchedException.rooms : globalPriority;
  if (matchedException) {
    await audit({
      action: "room_exception_matched",
      userId: args.userId,
      iCalUID: args.iCalUID,
      details: {
        title: args.meeting.title,
        matchedKeywords: matchedException.keywords,
        rooms: matchedException.rooms,
      },
    });
  }
  const roomsToTry = effectiveRooms.map((name) => ({
    name,
    spaceId: ROOM_SPACE_IDS[name],
  }));

  // Safety buffer: when enabled, extend the Skedda booking by `bufferMinutes`
  // before AND after the Calendar event. Calendar event stays untouched —
  // only the Skedda reservation gets the wider slot. Useful for setup,
  // demo overruns, or walking to the next room.
  const bufferMin = Math.max(0, user.bufferMinutes ?? 0);
  const skeddaStartsAt = bufferMin > 0
    ? new Date(args.meeting.startsAt.getTime() - bufferMin * 60_000)
    : args.meeting.startsAt;
  const skeddaEndsAt = bufferMin > 0
    ? new Date(args.meeting.endsAt.getTime() + bufferMin * 60_000)
    : args.meeting.endsAt;
  if (bufferMin > 0) {
    await audit({
      action: "buffer_applied",
      userId: args.userId,
      iCalUID: args.iCalUID,
      details: {
        bufferMinutes: bufferMin,
        calendarStartsAt: args.meeting.startsAt.toISOString(),
        calendarEndsAt: args.meeting.endsAt.toISOString(),
        skeddaStartsAt: skeddaStartsAt.toISOString(),
        skeddaEndsAt: skeddaEndsAt.toISOString(),
      },
    });
  }

  /**
   * Walk the priority list, attempting to book each room for the given
   * Skedda slot. Returns as soon as one room succeeds, or when a
   * non-retryable error breaks the chain. Pure side-effects: audits
   * each attempt + per-room failure, but doesn't flip the booking
   * status itself — the caller is responsible for that.
   */
  const tryAllRoomsForSlot = async (
    startsAt: Date,
    endsAt: Date,
  ): Promise<
    | { success: true; room: RoomName; result: BookSkeddaResult & { success: true } }
    | { success: false; lastResult: BookSkeddaResult | null; lastRoom: RoomName | null }
  > => {
    let lastResult: BookSkeddaResult | null = null;
    let lastRoom: RoomName | null = null;
    for (const room of roomsToTry) {
      await audit({
        action: "skedda_attempt",
        userId: args.userId,
        iCalUID: args.iCalUID,
        details: { room: room.name, spaceId: room.spaceId },
      });
      const result = await bookSkeddaHttp({
        room: room.name,
        spaceId: room.spaceId,
        startsAt,
        endsAt,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        telephone: user.telephone || "",
        skeddaTitle: computeSkeddaTitle(args.meeting.title, user.skeddaTitleMode ?? "none"),
        iCalUID: args.iCalUID,
        userId: args.userId,
      });
      lastResult = result;
      lastRoom = room.name;
      if (result.success) {
        return { success: true, room: room.name, result };
      }
      await audit({
        action: "skedda_failure",
        userId: args.userId,
        iCalUID: args.iCalUID,
        details: { room: room.name, reason: result.reason, errorMessage: result.errorMessage },
      });
      // Only retry the next room when this one is room-specific:
      //  - slot_unavailable   : someone else has it for this slot
      //  - duration_too_long  : Antler caps some rooms to 1h30 (Mars), so a
      //                          longer meeting needs to try a different room
      // For form/navigation/timeout/window errors, retrying gives the same result.
      if (result.reason !== "slot_unavailable" && result.reason !== "duration_too_long") {
        break;
      }
    }
    return { success: false, lastResult, lastRoom };
  };

  /** Finalize a successful Skedda booking — DB write, calendar update, notify. */
  const finalizeSuccess = async (
    room: RoomName,
    result: BookSkeddaResult & { success: true },
  ) => {
    await audit({
      action: "skedda_success",
      userId: args.userId,
      iCalUID: args.iCalUID,
      details: { room, skeddaBookingId: result.skeddaBookingId },
    });
    await markBookingResult({
      iCalUID: args.iCalUID,
      status: "booked",
      room,
      skeddaBookingRef: result.skeddaBookingId,
      skeddaCancelToken: result.cancelToken,
      skeddaCookies: result.cookies,
    });
    await applyRoomToCalendarEvent({
      user,
      eventId: args.googleEventId,
      room,
    }).catch((err) => {
      audit({
        action: "error",
        userId: args.userId,
        iCalUID: args.iCalUID,
        details: { where: "applyRoomToCalendarEvent", message: String(err) },
      });
    });
    const persisted = await findBookingByICalUID(args.iCalUID);
    if (persisted) {
      await notifySuccess(user, args, room, persisted._id);
    }
  };

  // 1st pass: try with the user's preferred slot (buffered if bufferMin > 0,
  // exact otherwise).
  let attempt = await tryAllRoomsForSlot(skeddaStartsAt, skeddaEndsAt);

  // 2nd pass — buffer fallback. If the buffered slot failed everywhere with
  // a reason that *could* be buffer-induced (someone holds the wider window,
  // buffer pushed start before opening, buffer pushed duration past a room's
  // cap), retry the whole priority list with the exact Calendar times. The
  // user explicitly opted for graceful degradation: prefer "booked without
  // buffer" over "not booked at all".
  const bufferFallbackReasons = new Set(["slot_unavailable", "duration_too_long", "outside_hours"]);
  if (
    !attempt.success &&
    bufferMin > 0 &&
    attempt.lastResult &&
    !attempt.lastResult.success &&
    bufferFallbackReasons.has(attempt.lastResult.reason)
  ) {
    await audit({
      action: "buffer_fallback",
      userId: args.userId,
      iCalUID: args.iCalUID,
      details: {
        reason: attempt.lastResult.reason,
        lastRoomTried: attempt.lastRoom,
        bufferMinutes: bufferMin,
        retryWithExactTimes: true,
      },
    });
    attempt = await tryAllRoomsForSlot(args.meeting.startsAt, args.meeting.endsAt);
  }

  if (attempt.success) {
    await finalizeSuccess(attempt.room, attempt.result);
    await audit({
      action: "booking_engine_finished",
      userId: args.userId,
      iCalUID: args.iCalUID,
      details: { result: "booked", room: attempt.room },
    });
    return;
  }

  // All attempts failed (both buffered and, if applicable, exact-time fallback)
  const lastResult = attempt.lastResult;
  const lastRoom = attempt.lastRoom;
  const failure = lastResult && !lastResult.success ? lastResult : null;
  await markBookingResult({
    iCalUID: args.iCalUID,
    status: "failed",
    failureReason: failure?.reason || "unknown",
  });

  const reason = failure?.reason ?? "unknown";
  await notifyFailure(user, args, errorReasonText(reason, lastRoom));
  await audit({
    action: "booking_engine_finished",
    userId: args.userId,
    iCalUID: args.iCalUID,
    details: { result: "failed", reason, lastRoom },
  });
}

/**
 * Compute the title to send to Skedda based on the user's privacy preference.
 *  - "none"       → null (no title sent; Skedda lists just the booker's name)
 *  - "anonymized" → keep only the first word, append "client" if there were more
 *                   ("Demo Mondial Relay" → "Demo client", "Sync" → "Sync")
 *  - "full"       → send the raw title verbatim
 */
export function computeSkeddaTitle(
  rawTitle: string,
  mode: "none" | "anonymized" | "full",
): string | null {
  if (mode === "none") return null;
  const raw = (rawTitle || "").trim();
  if (mode === "full") return raw || null;
  if (!raw) return null;
  const words = raw.split(/\s+/);
  const first = words[0].replace(/[·•:|,;.]+$/g, "");
  if (!first) return null;
  return words.length === 1 ? first : `${first} client`;
}

function errorReasonText(reason: string, lastRoom: RoomName | null): string {
  switch (reason) {
    case "slot_unavailable":
      return "Toutes les salles sont déjà prises sur ce créneau.";
    case "outside_hours":
      return "Le créneau est en dehors des horaires d'ouverture de l'incubateur.";
    case "window_too_far":
      return "Le booking est trop loin dans le futur (Skedda limite à 10 jours).";
    case "duration_too_long":
      return "Ton meeting est trop long pour les salles disponibles (Antler limite certaines salles à 1h30). Raccourcis-le ou réserve manuellement dans une grande salle.";
    case "quota_exceeded":
      return "T'as atteint ton quota Skedda (crédits ou limite mensuelle). Réserve manuellement sur Skedda si t'as encore des crédits, ou attends le prochain mois.";
    case "form_unexpected":
      return `Le formulaire Skedda a un format inattendu (salle ${lastRoom ?? "?"}).`;
    case "navigation_failed":
      return `Erreur de connexion à Skedda (salle ${lastRoom ?? "?"}).`;
    default:
      return `Erreur Skedda inconnue (salle ${lastRoom ?? "?"}).`;
  }
}

async function notifySuccess(
  user: UserDoc,
  args: ProcessBookingArgs,
  room: RoomName,
  bookingDocId: ObjectId,
) {
  const time = args.meeting.startsAt.toLocaleString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
  const base = (process.env.PUBLIC_APP_URL || "https://roombooker.nmt.ovh").replace(/\/$/, "");
  const cancelUrl = `${base}/c/${signCancelToken(bookingDocId.toString())}`;

  await notifyUser({
    user: {
      _id: user._id,
      email: user.email,
      firstName: user.firstName,
      telephone: user.telephone,
      notifPrefs: user.notifPrefs,
    },
    type: "booking_success",
    iCalUID: args.iCalUID,
    smsText: `RoomBooker : salle ${room} réservée pour ${time}. Annuler : ${cancelUrl}`,
    emailSubject: `${room} bloquée · ${time}`,
    emailHtml: `<p>Salle <strong>${room}</strong> bloquée sur Skedda · ${time}.</p><p><a href="${cancelUrl}">Annuler en 1 clic</a></p>`,
  });
}

async function notifyFailure(user: UserDoc, args: ProcessBookingArgs, reasonText: string) {
  const time = args.meeting.startsAt.toLocaleString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
  await notifyUser({
    user: {
      _id: user._id,
      email: user.email,
      firstName: user.firstName,
      telephone: user.telephone,
      notifPrefs: user.notifPrefs,
    },
    type: "booking_failure",
    iCalUID: args.iCalUID,
    smsText: `RoomBooker : échec résa pour « ${args.meeting.title} » (${time}). ${reasonText}`,
    emailSubject: `Échec réservation · ${args.meeting.title}`,
    emailHtml: `<p>Pas de salle pour <strong>${args.meeting.title}</strong> · ${time}.</p><p>${reasonText}</p><p><a href="https://antlerfrance.skedda.com/booking">Réserver manuellement sur Skedda →</a></p>`,
  });
}
