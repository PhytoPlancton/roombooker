/**
 * Tiny realistic-ish planet SVGs. Each is a colored sphere with a soft highlight
 * and surface band/dot to suggest the planet's atmosphere/rocks.
 * Sized via the `size` prop (default 18 = matches body text).
 */

import type { RoomName } from "@/lib/bookings";

interface Props {
  size?: number;
  className?: string;
}

export function PlanetIcon({ planet, size = 18, className }: { planet: RoomName } & Props) {
  switch (planet) {
    case "Venus":
      return <Venus size={size} className={className} />;
    case "Mars":
      return <Mars size={size} className={className} />;
    case "Mercury":
      return <Mercury size={size} className={className} />;
    case "Earth":
      return <Earth size={size} className={className} />;
    case "Jupiter":
      return <Jupiter size={size} className={className} />;
  }
}

const ringedHighlight = (cx: number, cy: number, r: number) => (
  <circle cx={cx - r * 0.3} cy={cy - r * 0.4} r={r * 0.18} fill="rgba(255,255,255,0.55)" />
);

function Venus({ size = 18, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-label="Venus">
      <defs>
        <radialGradient id="venusG" cx="35%" cy="35%" r="80%">
          <stop offset="0%" stopColor="#FFE7B5" />
          <stop offset="55%" stopColor="#E5B05F" />
          <stop offset="100%" stopColor="#8C6122" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#venusG)" />
      <path d="M3,11 Q12,8 21,11" stroke="rgba(255,255,255,0.18)" strokeWidth="0.8" fill="none" />
      <path d="M4,15 Q12,13 20,15" stroke="rgba(0,0,0,0.10)" strokeWidth="0.8" fill="none" />
      {ringedHighlight(12, 12, 10)}
    </svg>
  );
}

function Mars({ size = 18, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-label="Mars">
      <defs>
        <radialGradient id="marsG" cx="35%" cy="35%" r="80%">
          <stop offset="0%" stopColor="#F38964" />
          <stop offset="55%" stopColor="#C24A38" />
          <stop offset="100%" stopColor="#5A1F18" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#marsG)" />
      <ellipse cx="9" cy="9" rx="1.6" ry="0.9" fill="rgba(255,255,255,0.15)" />
      <ellipse cx="15.5" cy="14" rx="2" ry="1.1" fill="rgba(0,0,0,0.18)" />
      {ringedHighlight(12, 12, 10)}
    </svg>
  );
}

function Mercury({ size = 18, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-label="Mercury">
      <defs>
        <radialGradient id="mercG" cx="35%" cy="35%" r="80%">
          <stop offset="0%" stopColor="#C8C9D2" />
          <stop offset="55%" stopColor="#8A8FB5" />
          <stop offset="100%" stopColor="#3F4350" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#mercG)" />
      <circle cx="9" cy="10" r="1.2" fill="rgba(0,0,0,0.20)" />
      <circle cx="15" cy="14" r="0.9" fill="rgba(0,0,0,0.14)" />
      <circle cx="13.5" cy="9" r="0.6" fill="rgba(0,0,0,0.10)" />
      {ringedHighlight(12, 12, 10)}
    </svg>
  );
}

function Earth({ size = 18, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-label="Earth">
      <defs>
        <radialGradient id="earthG" cx="35%" cy="35%" r="80%">
          <stop offset="0%" stopColor="#7BC4F0" />
          <stop offset="60%" stopColor="#3074B0" />
          <stop offset="100%" stopColor="#0C3155" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#earthG)" />
      <path d="M5,11 Q8,8 11,10 Q13,12 10,14 Q7,15 5,13 Z" fill="#2B7A4B" opacity="0.85" />
      <path d="M14,7 Q17,8 18,11 Q17,13 14,12 Z" fill="#2B7A4B" opacity="0.8" />
      <path d="M14,15 Q17,16 19,15 Q18,17 15,17 Z" fill="#2B7A4B" opacity="0.7" />
      {ringedHighlight(12, 12, 10)}
    </svg>
  );
}

function Jupiter({ size = 18, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-label="Jupiter">
      <defs>
        <radialGradient id="jupG" cx="35%" cy="35%" r="80%">
          <stop offset="0%" stopColor="#F5DDB7" />
          <stop offset="55%" stopColor="#D29766" />
          <stop offset="100%" stopColor="#7A4422" />
        </radialGradient>
        <clipPath id="jupClip">
          <circle cx="12" cy="12" r="10" />
        </clipPath>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#jupG)" />
      <g clipPath="url(#jupClip)">
        <rect x="0" y="7"  width="24" height="1.4" fill="rgba(255,255,255,0.18)" />
        <rect x="0" y="9.8" width="24" height="1.2" fill="rgba(120,60,20,0.35)" />
        <rect x="0" y="12.6" width="24" height="1.4" fill="rgba(255,255,255,0.14)" />
        <rect x="0" y="15.2" width="24" height="1" fill="rgba(120,60,20,0.30)" />
        <ellipse cx="14" cy="13.4" rx="1.6" ry="0.7" fill="#A0341B" opacity="0.85" />
      </g>
      {ringedHighlight(12, 12, 10)}
    </svg>
  );
}
