// SEVER compass-star mark, rebuilt as vector so it stays crisp on screen and in
// printed documents. An 8-point star (long vertical axis) with a small 4-point
// star cut out of the centre (even-odd fill).
export function SeverStar({ size = 28, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="-110 -110 220 220" aria-hidden="true" style={{ display: "block" }}>
      <path
        fillRule="evenodd"
        fill={color}
        d="M 0 -100 L 4.6 -11.1 L 28.3 -28.3 L 11.1 -4.6 L 78 0 L 11.1 4.6 L 28.3 28.3 L 4.6 11.1 L 0 100 L -4.6 11.1 L -28.3 28.3 L -11.1 4.6 L -78 0 L -11.1 -4.6 L -28.3 -28.3 L -4.6 -11.1 Z M -4.9 -4.9 L -26 0 L -4.9 4.9 L 0 26 L 4.9 4.9 L 26 0 L 4.9 -4.9 L 0 -26 Z"
      />
    </svg>
  );
}
