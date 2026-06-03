import { ObjectId, type Collection } from "mongodb";
import { getDb } from "./db";

export type AuditAction =
  | "webhook_received"
  | "webhook_rejected_invalid_token"
  | "webhook_unknown_channel"
  | "webhook_sync_handshake"
  | "sync_started"
  | "sync_needs_resync"
  | "sync_completed"
  | "event_evaluated"
  | "booking_created_pending"
  | "booking_engine_started"
  | "booking_engine_finished"
  | "skedda_attempt"
  | "skedda_success"
  | "skedda_failure"
  | "buffer_applied"
  | "buffer_fallback"
  | "notify_sent"
  | "watch_activated"
  | "watch_deactivated"
  | "user_deleted"
  | "error";

export interface AuditDoc {
  _id: ObjectId;
  ts: Date;
  action: AuditAction;
  userId: ObjectId | null;
  iCalUID: string | null;
  details: Record<string, unknown>;
}

declare global {
  var __auditIndexCreated: boolean | undefined;
}

async function auditCol(): Promise<Collection<AuditDoc>> {
  const db = await getDb();
  const col = db.collection<AuditDoc>("auditLog");
  if (!global.__auditIndexCreated) {
    await col.createIndex({ ts: -1 });
    await col.createIndex({ userId: 1, ts: -1 });
    await col.createIndex({ iCalUID: 1, ts: -1 });
    global.__auditIndexCreated = true;
  }
  return col;
}

export async function audit(args: {
  action: AuditAction;
  userId?: ObjectId | null;
  iCalUID?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const col = await auditCol();
    await col.insertOne({
      _id: new ObjectId(),
      ts: new Date(),
      action: args.action,
      userId: args.userId ?? null,
      iCalUID: args.iCalUID ?? null,
      details: args.details ?? {},
    });
  } catch (err) {
    // Audit must never break the main flow
    console.error("[audit] failed to record", { action: args.action, err });
  }
}
