import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: "#2B5F3E",
          color: "#FFFFFF",
          fontSize: 22,
          fontWeight: 700,
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          letterSpacing: "-0.02em",
          boxShadow: "2px 2px 0 #F4C95D",
          fontFamily: "sans-serif",
        }}
      >
        R
      </div>
    ),
    { ...size },
  );
}
