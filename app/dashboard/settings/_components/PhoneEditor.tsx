"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/Icon";
import { updatePhoneAction } from "../../actions";

export function PhoneEditor({ initial }: { initial: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [current, setCurrent] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const cancel = () => {
    setEditing(false);
    setValue(current);
    setError(null);
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("telephone", value);
      const result = await updatePhoneAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCurrent(result.phone);
      setValue(result.phone);
      setEditing(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1600);
    });
  };

  if (editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            className="input"
            type="tel"
            value={value}
            autoFocus
            disabled={isPending}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancel();
            }}
            style={{ width: 200, padding: "6px 10px", fontSize: 13 }}
          />
          <button className="btn btn-primary" onClick={save} disabled={isPending} type="button" style={{ padding: "5px 12px", fontSize: 12 }}>
            {isPending ? "…" : "Enregistrer"}
          </button>
          <button className="btn btn-ghost" onClick={cancel} disabled={isPending} type="button" style={{ padding: "5px 8px", fontSize: 12 }}>
            Annuler
          </button>
        </div>
        {error && (
          <span style={{ color: "var(--danger)", fontSize: 12 }}>{error}</span>
        )}
      </div>
    );
  }

  return (
    <span className="inline-edit">
      <span style={{ fontSize: 13, color: "var(--ink-3)" }}>{current} · vérifié</span>
      <button
        type="button"
        className="inline-edit-pencil"
        onClick={() => setEditing(true)}
        title="Modifier le numéro"
        aria-label="Modifier le numéro"
      >
        <PencilIcon />
      </button>
      {showSuccess && (
        <span className="inline-edit-success">
          <Icon.check size={11} /> enregistré
        </span>
      )}
    </span>
  );
}

function PencilIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}
