import { ImageResponse } from "next/og";

export const alt = "Roombooker — Une salle, à chaque meeting. Sans double saisie.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#FBFAF7",
          display: "flex",
          flexDirection: "column",
          padding: "80px",
          fontFamily: "sans-serif",
          color: "#1B1A17",
          position: "relative",
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              background: "#2B5F3E",
              color: "#FFFFFF",
              borderRadius: 14,
              fontSize: 32,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              letterSpacing: "-0.02em",
              boxShadow: "4px 4px 0 #F4C95D",
            }}
          >
            R
          </div>
          <span style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.02em" }}>roombooker</span>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <h1
              style={{
                fontSize: 72,
                fontWeight: 600,
                lineHeight: 1.05,
                letterSpacing: "-0.03em",
                margin: 0,
                maxWidth: 920,
              }}
            >
              Une salle physique réservée à chaque meeting Google Calendar.
            </h1>
            <p
              style={{
                fontSize: 28,
                color: "#4A4842",
                margin: 0,
                lineHeight: 1.4,
                maxWidth: 880,
              }}
            >
              Plus jamais de double saisie entre Google Cal et Skedda. Tu poses ton meeting, on
              s'occupe de la salle.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            color: "#8A867E",
          }}
        >
          <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: "#2B7A4B" }} />
            Sync active
          </span>
          <span>roombooker.nmt.ovh</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
