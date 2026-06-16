import type { Projects } from "@sever/contracts";

// A compact Gantt: overlapping blocks are packed into separate lanes so parallel
// processes (доставка ∥ монтаж ∥ саундчек) read at a glance. Positions are a
// percentage of the whole timing window.
interface Props {
  timings: Projects.TimingDTO[];
  userName: (id: string) => string;
}

function packLanes(timings: Projects.TimingDTO[]): Projects.TimingDTO[][] {
  const sorted = [...timings].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const lanes: { end: number; items: Projects.TimingDTO[] }[] = [];
  for (const t of sorted) {
    const start = Date.parse(t.startsAt);
    const end = Date.parse(t.endsAt);
    const lane = lanes.find((l) => start >= l.end);
    if (lane) {
      lane.items.push(t);
      lane.end = end;
    } else {
      lanes.push({ end, items: [t] });
    }
  }
  return lanes.map((l) => l.items);
}

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
const fmtDate = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function TimingTimeline({ timings, userName }: Props) {
  if (timings.length === 0) return null;
  const min = Math.min(...timings.map((t) => Date.parse(t.startsAt)));
  const max = Math.max(...timings.map((t) => Date.parse(t.endsAt)));
  const span = Math.max(1, max - min);
  const lanes = packLanes(timings);
  const pct = (v: number) => ((v - min) / span) * 100;

  return (
    <div>
      <div className="row row--between" style={{ marginBottom: 6 }}>
        <span className="card__subtitle">{fmtDate(new Date(min).toISOString())}</span>
        <span className="card__subtitle">{fmtDate(new Date(max).toISOString())}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {lanes.map((lane, i) => (
          <div key={i} style={{ position: "relative", height: 48, background: "var(--s2)", borderRadius: 8 }}>
            {lane.map((t) => {
              const left = pct(Date.parse(t.startsAt));
              const width = Math.max(14, pct(Date.parse(t.endsAt)) - left);
              const who = t.assigneeIds.map(userName).filter(Boolean).join(", ");
              return (
                <div
                  key={t.id}
                  title={`${t.title} · ${fmtTime(t.startsAt)}–${fmtTime(t.endsAt)}${who ? ` · ${who}` : ""}`}
                  style={{
                    position: "absolute",
                    left: `${left}%`,
                    width: `${width}%`,
                    top: 4,
                    bottom: 4,
                    background: "var(--accent)",
                    color: "#fff",
                    borderRadius: 6,
                    padding: "4px 7px",
                    overflow: "hidden",
                    boxSizing: "border-box",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {t.title}
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {who || `${fmtTime(t.startsAt)}–${fmtTime(t.endsAt)}`}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
