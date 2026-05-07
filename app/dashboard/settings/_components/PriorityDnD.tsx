"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { ROOMS } from "@/lib/ui/rooms";
import type { RoomName } from "@/lib/bookings";

const HINT_KEY = "rb_priority_hint_dismissed";

interface Props {
  initialOrder: RoomName[];
  onChange: (next: RoomName[]) => void;
}

export function PriorityDnD({ initialOrder, onChange }: Props) {
  const [order, setOrder] = useState<RoomName[]>(initialOrder);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null);
  const [hintHidden, setHintHidden] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem(HINT_KEY) === "1") {
      setHintHidden(true);
    }
  }, []);

  const dismissHint = () => {
    if (hintHidden) return;
    setHintHidden(true);
    if (typeof window !== "undefined") localStorage.setItem(HINT_KEY, "1");
  };

  const liveRef = useRef<HTMLSpanElement | null>(null);
  const announce = (text: string) => {
    if (liveRef.current) liveRef.current.textContent = text;
  };

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setOrder(next);
    onChange(next);
    setJustDroppedId(item);
    setTimeout(() => setJustDroppedId(null), 250);
    announce(`${item} déplacée en position ${to + 1}`);
    dismissHint();
  };

  return (
    <>
      <p className="priority-hint" data-hidden={hintHidden}>
        On prend la salle en première position si libre. Si occupée, on monte d'un cran. Glisse les pastilles pour
        changer l'ordre.
      </p>
      <div
        className="priority-row"
        onDragOver={(e) => e.preventDefault()}
      >
        {order.map((id, idx) => {
          const room = ROOMS.find((r) => r.id === id);
          if (!room) return null;
          const isDragging = draggingId === id;
          const isOver = overId === id && draggingId !== id;
          return (
            <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                tabIndex={0}
                role="button"
                aria-grabbed={isDragging}
                aria-label={`${room.name}, priorité ${idx + 1}. Flèches gauche/droite pour réordonner.`}
                draggable
                className="priority-pill"
                data-dragging={isDragging}
                data-just-dropped={justDroppedId === id}
                style={isOver ? { outline: "2px dashed var(--brand)", outlineOffset: "2px" } : undefined}
                onDragStart={(e) => {
                  setDraggingId(id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", id);
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setOverId(null);
                }}
                onDragEnter={() => setOverId(id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overId !== id) setOverId(id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const sourceId = e.dataTransfer.getData("text/plain") as RoomName;
                  if (!sourceId) return;
                  const from = order.indexOf(sourceId);
                  const to = order.indexOf(id);
                  move(from, to);
                  setOverId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    const dir = e.key === "ArrowRight" ? 1 : -1;
                    move(idx, idx + dir);
                  }
                }}
              >
                <span className="priority-grip" aria-hidden>⋮⋮</span>
                <span className="room-icon" style={{ background: room.color, width: 16, height: 16 }}>
                  {room.name[0]}
                </span>
                <span>{room.name}</span>
              </button>
              {idx < order.length - 1 && (
                <span className="priority-arrow" aria-hidden>
                  <Icon.arrow size={14} />
                </span>
              )}
            </span>
          );
        })}
      </div>
      <span ref={liveRef} aria-live="polite" style={{ position: "absolute", left: -9999, top: -9999 }} />
    </>
  );
}
