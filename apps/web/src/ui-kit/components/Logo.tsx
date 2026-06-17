import { useId } from "react";

// SEVER compass-star mark, rebuilt as vector. It's two overlapping 4-point stars
// — long cardinal points (bottom longest) over short diagonals — with a small
// 4-point star cut out of the centre via a mask.
const CARD = "M 0 -96 L 15.6 -15.6 L 70 0 L 15.6 15.6 L 0 110 L -15.6 15.6 L -70 0 L -15.6 -15.6 Z";
const DIAG = "M 32.5 -32.5 L 15 0 L 32.5 32.5 L 0 15 L -32.5 32.5 L -15 0 L -32.5 -32.5 L 0 -15 Z";
const HOLE = "M 0 -22 L 4.2 -4.2 L 22 0 L 4.2 4.2 L 0 22 L -4.2 4.2 L -22 0 L -4.2 -4.2 Z";

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
