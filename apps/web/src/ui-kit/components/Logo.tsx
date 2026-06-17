import { useId, useState } from "react";

// SEVER compass-star mark as vector: two overlapping, symmetric 4-point stars —
// long cardinal points over short diagonals — with a small 4-point star cut from
// the centre via a mask. Used as the fallback when no raster logo is present.
const CARD = "M 0 -100 L 17 -17 L 100 0 L 17 17 L 0 100 L -17 17 L -100 0 L -17 -17 Z";
const DIAG = "M 39.6 -39.6 L 16 0 L 39.6 39.6 L 0 16 L -39.6 39.6 L -16 0 L -39.6 -39.6 L 0 -16 Z";
const HOLE = "M 0 -15 L 2.8 -2.8 L 15 0 L 2.8 2.8 L 0 15 L -2.8 2.8 L -15 0 L -2.8 -2.8 Z";

export function SeverStar({ size = 28, color = "currentColor" }: { size?: number; color?: string }) {
  const maskId = useId();
  return (
    <svg width={size} height={size} viewBox="-112 -112 224 224" aria-hidden="true" style={{ display: "block" }}>
      <mask id={maskId}>
        <rect x="-112" y="-112" width="224" height="224" fill="#fff" />
        <path d={HOLE} fill="#000" />
      </mask>
      <g fill={color} mask={`url(#${maskId})`}>
        <path d={CARD} />
        <path d={DIAG} />
      </g>
    </svg>
  );
}

// Brand logo: prefers the real raster at /sever-logo.png (drop the exact file
// into apps/web/public/), and falls back to the vector mark if it isn't there.
export function BrandLogo({ size = 28, color = "#111" }: { size?: number; color?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <SeverStar size={size} color={color} />;
  return (
    <img
      src="/sever-logo.png"
      width={size}
      height={size}
      alt="SEVER"
      onError={() => setFailed(true)}
      style={{ display: "block", objectFit: "contain" }}
    />
  );
}
