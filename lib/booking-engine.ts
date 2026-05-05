import { ObjectId } from "mongodb";
import { differenceInDays } from "date-fns";
import { ROOM_PRIORITY, type RoomName, markBookingResult } from "./bookings";
import { ROOM_SPACE_IDS, bookSkedda, type BookSkeddaResult } from "./skedda";
import { notifyUser } from "./notify";
import { updateEventLocation } from "./calendar";
import { findUserById, type UserDoc } from "./users";

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
  const user = await findUserById(args.userId);
  if (!user) {
    console.error("[engine] user not found", { userId: args.userId.toString() });
    await markBookingResult({
      iCalUID: args.iCalUID,
      status: "failed",
      failureReason: "user_not_found",
    });
    return;
  }

  const daysAhead = differenceInDays(args.meeting.startsAt, new Date());
  if (daysAhead > MAX_DAYS_AHEAD) {
    console.log("[engine] meeting too far ahead, will be picked up by cron later", {
      iCalUID: args.iCalUID,
      daysAhead,
    });
    // On laisse le booking en status "pending" — un cron viendra le re-tenter
    // quand on entrera dans la window de 10 jours
    return;
  }

  const roomsToTry: { name: RoomName; spaceId: number }[] = ROOM_PRIORITY
    .map((name) => ({ name, spaceId: ROOM_SPACE_IDS[name] }))
    .filter((r): r is { name: RoomName; spaceId: number } => r.spaceId !== null);

  if (roomsToTry.length === 0) {
    console.error("[engine] no Skedda spaceId configured for any room");
    await markBookingResult({
      iCalUID: args.iCalUID,
      status: "failed",
      failureReason: "no_room_id_configured",
    });
    await notifyFailure(user, args, "Aucun ID de salle Skedda configuré côté admin.");
    return;
  }

  let lastResult: BookSkeddaResult | null = null;
  let lastRoom: RoomName | null = null;

  for (const room of roomsToTry) {
    console.log("[engine] trying room", { iCalUID: args.iCalUID, room: room.name });
    const result = await bookSkedda({
      room: room.name,
      spaceId: room.spaceId,
      startsAt: args.meeting.startsAt,
      endsAt: args.meeting.endsAt,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      telephone: user.telephone || "",
      organization: process.env.INTERNAL_EMAIL_DOMAIN || "muchbetter.ai",
      title: args.meeting.title,
    });

    lastResult = result;
    lastRoom = room.name;

    if (result.success) {
      await markBookingResult({
        iCalUID: args.iCalUID,
        status: "booked",
        room: room.name,
        skeddaCancelLink: result.cancelLink ?? undefined,
      });
      await updateEventLocation({
        user,
        eventId: args.googleEventId,
        location: room.name,
      }).catch((err) => {
        console.error("[engine] failed to update event location", { err });
      });
      await notifySuccess(user, args, room.name);
      return;
    }

    // If reason is "slot_unavailable" → try next room.
    // For other reasons (window, hours, navigation) → no point trying more rooms.
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

async function notifySuccess(user: UserDoc, args: ProcessBookingArgs, room: RoomName) {
  const time = args.meeting.startsAt.toLocaleString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  await notifyUser({
    user: { ...user, telephone: user.telephone, notifChannels: user.notifChannels },
    smsText: `RoomBooker: salle ${room} reservée pour "${args.meeting.title}" - ${time}`,
    emailSubject: `Salle ${room} réservée pour ${args.meeting.title}`,
    emailHtml: `
      <p>Bonjour ${user.firstName},</p>
      <p>La salle <strong>${room}</strong> est réservée pour ton meeting :</p>
      <p>📅 ${args.meeting.title}<br/>🕐 ${time}</p>
      <p>L'event Google Calendar a été mis à jour avec la salle.</p>
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
  });
  await notifyUser({
    user: { ...user, telephone: user.telephone, notifChannels: user.notifChannels },
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
