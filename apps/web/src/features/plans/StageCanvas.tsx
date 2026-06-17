import { useRef, useState } from "react";
import type { Plans } from "@sever/contracts";

type PlanLayer = Plans.PlanLayer;

const LAYER_COLOR: Record<PlanLayer, string> = {
  light: "var(--accent)",
  sound: "var(--ok)",
  dmx: "var(--info)",
  power: "var(--alert)",
  audio: "var(--warn)",
};

interface Props {
  plan: Plans.PlanDTO;
  elements: Plans.PlanElementDTO[]; // may be a local (optimistic) copy
  visible: Set<PlanLayer>;
  editable: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDrag: (id: string, x: number, y: number) => void;
  onDrop: (id: string) => void;
}

function Marker({ el, color, selected }: { el: Plans.PlanElementDTO; color: string; selected: boolean }) {
  const ring = selected ? <circle r={18} fill="none" stroke={color} strokeWidth={1.5} opacity={0.6} /> : null;
  let shape;
  if (el.kind === "fixture") {
    shape = (
      <>
        <circle r={11} fill={color + "26"} stroke={color} strokeWidth={1.6} />
        <circle r={3} fill={color} />
      </>
    );
  } else if (el.kind === "truss") {
    const w = el.w ?? 120;
    shape = <rect x={-w / 2} y={-5} width={w} height={10} rx={2} fill={color + "26"} stroke={color} strokeWidth={1.4} />;
  } else if (el.kind === "label") {
    shape = null;
  } else {
    shape = <rect x={-7} y={-7} width={14} height={14} rx={2} fill={color + "26"} stroke={color} strokeWidth={1.4} transform="rotate(45)" />;
  }
  return (
    <g transform={`translate(${el.x},${el.y}) rotate(${el.rotation})`}>
      {ring}
      {shape}
      {el.label && (
        <text y={22} textAnchor="middle" fontSize={9} fill={color} fontFamily="var(--font-mono)" transform={`rotate(${-el.rotation})`}>
          {el.label}
        </text>
      )}
    </g>
  );
}

export function StageCanvas({ plan, elements, visible, editable, selectedId, onSelect, onDrag, onDrop }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const toStage = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * plan.stageW;
    const y = ((clientY - rect.top) / rect.height) * plan.stageH;
    return { x: Math.max(0, Math.min(plan.stageW, x)), y: Math.max(0, Math.min(plan.stageH, y)) };
  };

  const byId = new Map(elements.map((e) => [e.id, e]));
  const cables = elements.filter((e) => e.kind === "cable" && visible.has(e.layer));
  const points = elements.filter((e) => e.kind !== "cable");

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${plan.stageW} ${plan.stageH}`}
      style={{ width: "100%", display: "block", background: "var(--canvas-bg, var(--s2))", borderRadius: 14, border: "1px solid var(--bdr)", touchAction: "none" }}
      onPointerMove={(e) => {
        if (!dragging) return;
        const { x, y } = toStage(e.clientX, e.clientY);
        onDrag(dragging, x, y);
      }}
      onPointerUp={() => {
        if (dragging) {
          onDrop(dragging);
          setDragging(null);
        }
      }}
      onPointerLeave={() => {
        if (dragging) {
          onDrop(dragging);
          setDragging(null);
        }
      }}
    >
      {/* grid */}
      <defs>
        <pattern id="plan-grid" width={20} height={20} patternUnits="userSpaceOnUse">
          <path d={`M 20 0 L 0 0 0 20`} fill="none" stroke="var(--bdr)" strokeWidth={0.6} />
        </pattern>
      </defs>
      <rect width={plan.stageW} height={plan.stageH} fill="url(#plan-grid)" />
      <rect x={6} y={6} width={plan.stageW - 12} height={plan.stageH - 12} rx={2} fill="none" stroke="var(--text3)" strokeWidth={1} strokeDasharray="5 4" />
      <text x={plan.stageW / 2} y={18} textAnchor="middle" fontSize={9} fill="var(--text3)" fontFamily="var(--font-mono)">СЦЕНА</text>

      {/* Cables first, so the lines sit under the devices they connect. A cable
          tracks its two endpoints live (positions include drag overrides). */}
      {cables.map((el) => {
        const a = byId.get(el.fromId ?? "");
        const b = byId.get(el.toId ?? "");
        if (!a || !b) return null;
        const color = LAYER_COLOR[el.layer];
        const sel = selectedId === el.id;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        return (
          <g key={el.id} style={{ cursor: "pointer" }} onPointerDown={() => onSelect(el.id)}>
            {/* fat transparent hit-line */}
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={14} />
            <line
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={color} strokeWidth={sel ? 3 : 1.8} strokeLinecap="round"
              strokeDasharray={el.layer === "power" ? "6 3" : undefined} opacity={sel ? 1 : 0.85}
            />
            {el.label && (
              <text x={mx} y={my - 4} textAnchor="middle" fontSize={8} fill={color} fontFamily="var(--font-mono)">{el.label}</text>
            )}
          </g>
        );
      })}

      {points
        .filter((el) => visible.has(el.layer))
        .map((el) => (
          <g
            key={el.id}
            style={{ cursor: editable ? "grab" : "pointer" }}
            onPointerDown={(e) => {
              onSelect(el.id);
              if (editable) {
                (e.target as Element).setPointerCapture?.(e.pointerId);
                setDragging(el.id);
              }
            }}
          >
            <Marker el={el} color={LAYER_COLOR[el.layer]} selected={selectedId === el.id} />
          </g>
        ))}
    </svg>
  );
}

export { LAYER_COLOR };
