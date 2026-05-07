import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: "#2B5F3E",
          color: "#FFFFFF",
          fontSize: 120,
          fontWeight: 700,
          borderRadius: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          letterSpacing: "-0.02em",
          fontFamily: "sans-serif",
        }}
      >
        R
      </div>
    ),
    { ...size },
  );
}
