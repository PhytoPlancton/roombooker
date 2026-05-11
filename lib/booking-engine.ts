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
      type: "booking_success",
      iCalUID: args.iCalUID,
      smsText: `RoomBooker: meeting du ${meetingDateFr} hors fenetre Skedda (max 10j). Reservation auto le ${willTryDateFr}.`,
      emailSubject: `RoomBooker — réservation différée pour le ${meetingDateFr}`,
      emailHtml: `<p>Bonjour ${user.firstName},</p><p>Ton meeting du ${meetingDateFr} est trop loin pour Skedda (max 10 jours à l'avance). Je le réserverai automatiquement le <strong>${willTryDateFr}</strong>.</p><p>Aucune action de ta part — je m'en occupe.</p>`,
    });

    await audit({
      action: "booking_engine_finished",
      userId: args.userId,
      iCalUID: args.iCalUID,
      details: { result: "deferred_window", daysAhead, willTryAt: willTryAt.toISOString() },
    });
    return;
  }

  const priorityList = (user.roomPriority && user.roomPriority.length > 0)
    ? user.roomPriority
    : ROOM_PRIORITY;
  const roomsToTry = priorityList.map((name) => ({
    name,
    spaceId: ROOM_SPACE_IDS[name],
  }));

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
      startsAt: args.meeting.startsAt,
      endsAt: args.meeting.endsAt,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      telephone: user.telephone || "",
      title: args.meeting.title,
      iCalUID: args.iCalUID,
      userId: args.userId,
    });

    lastResult = result;
    lastRoom = room.name;

    if (result.success) {
      await audit({
        action: "skedda_success",
        userId: args.userId,
        iCalUID: args.iCalUID,
        details: { room: room.name, skeddaBookingId: result.skeddaBookingId },
      });
      await markBookingResult({
        iCalUID: args.iCalUID,
        status: "booked",
        room: room.name,
        skeddaBookingRef: result.skeddaBookingId,
        skeddaCancelToken: result.cancelToken,
        skeddaCookies: result.cookies,
      });
      await applyRoomToCalendarEvent({
        user,
        eventId: args.googleEventId,
        room: room.name,
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
        await notifySuccess(user, args, room.name, persisted._id);
      }
      await audit({
        action: "booking_engine_finished",
        userId: args.userId,
        iCalUID: args.iCalUID,
        details: { result: "booked", room: room.name },
      });
      return;
    }

    await audit({
      action: "skedda_failure",
      userId: args.userId,
      iCalUID: args.iCalUID,
      details: { room: room.name, reason: result.reason, errorMessage: result.errorMessage },
    });

    // Only retry the next room if this one was specifically unavailable.
    // For form/navigation/timeout/window errors, retrying gives the same result.
    if (result.reason !== "slot_unavailable") {
      break;
    }
  }

  // All attempts failed
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

function errorReasonText(reason: string, lastRoom: RoomName | null): string {
  switch (reason) {
    case "slot_unavailable":
      return "Toutes les salles sont déjà prises sur ce créneau.";
    case "outside_hours":
      return "Le créneau est en dehors des horaires d'ouverture de l'incubateur.";
    case "window_too_far":
      return "Le booking est trop loin dans le futur (Skedda limite à 10 jours).";
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
    smsText: `RoomBooker: salle ${room} reservee pour ${time}. Annuler: ${cancelUrl}`,
    emailSubject: `Salle ${room} réservée — ${time}`,
    emailHtml: `
      <p>Bonjour ${user.firstName},</p>
      <p>La salle <strong>${room}</strong> est réservée :</p>
      <p>🕐 ${time}</p>
      <p>L'event Google Calendar a été mis à jour avec la salle.</p>
      <p><a href="${cancelUrl}">Annuler la réservation</a></p>
    `,
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
    smsText: `RoomBooker: echec resa pour "${args.meeting.title}" (${time}). ${reasonText}`,
    emailSubject: `Échec de réservation pour ${args.meeting.title}`,
    emailHtml: `
      <p>Bonjour ${user.firstName},</p>
      <p>Je n'ai pas pu réserver de salle pour :</p>
      <p>📅 ${args.meeting.title}<br/>🕐 ${time}</p>
      <p><strong>Raison</strong> : ${reasonText}</p>
      <p>Tu peux réserver manuellement sur <a href="https://antlerfrance.skedda.com/booking">Skedda</a>.</p>
    `,
  });
}
