import type { Projects } from "@sever/contracts";

// Days are stacked vertically. Inside a day, overlapping blocks are packed into
// columns; non-overlapping blocks stay full-width and read top-to-bottom.
interface Props {
  timings: Projects.TimingDTO[];
  userName: (id: string) => string;
}

interface PackedCluster {
  lanes: Projects.TimingDTO[][];
}

function overlaps(a: Projects.TimingDTO, b: Projects.TimingDTO): boolean {
  return Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(b.startsAt) < Date.parse(a.endsAt);
}

function packLanes(timings: Projects.TimingDTO[]): PackedCluster[] {
  const sorted = [...timings].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const clusters: Projects.TimingDTO[][] = [];
  let current: Projects.TimingDTO[] = [];
  let currentEnd = 0;

  for (const t of sorted) {
    const start = Date.parse(t.startsAt);
    const end = Date.parse(t.endsAt);
    if (current.length === 0 || start < currentEnd) {
      current.push(t);
      currentEnd = Math.max(currentEnd, end);
    } else {
      clusters.push(current);
      current = [t];
      currentEnd = end;
    }
  }
  if (current.length > 0) clusters.push(current);

  return clusters.map((cluster) => ({ lanes: packCluster(cluster) }));
}

function packCluster(timings: Projects.TimingDTO[]): Projects.TimingDTO[][] {
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
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("ru-RU", { weekday: "short", day: "2-digit", month: "2-digit" });
const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function groupByDay(timings: Projects.TimingDTO[]) {
  const byDay = new Map<string, Projects.TimingDTO[]>();
  for (const t of timings) {
    const key = dayKey(t.startsAt);
    byDay.set(key, [...(byDay.get(key) ?? []), t]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, items]) => items.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)));
}

export function TimingTimeline({ timings, userName }: Props) {
  if (timings.length === 0) return null;
  const days = groupByDay(timings);

  return (
    <div className="stack" style={{ gap: 10 }}>
      {days.map((day) => (
        <div key={dayKey(day[0]!.startsAt)}>
          <div className="card__subtitle" style={{ marginBottom: 6 }}>{fmtDay(day[0]!.startsAt)}</div>
          <div className="stack" style={{ gap: 6 }}>
            {packLanes(day).map((cluster, clusterIndex) => (
              <div
                key={clusterIndex}
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${cluster.lanes.length}, minmax(0, 1fr))`,
                  gap: 6,
                }}
              >
                {cluster.lanes.map((lane, laneIndex) => (
                  <div key={laneIndex} className="stack" style={{ gap: 6 }}>
                    {lane.map((t) => {
                      const who = t.assigneeIds.map(userName).filter(Boolean).join(", ");
                      const concurrent = day.some((other) => other.id !== t.id && overlaps(t, other));
                      return (
                        <div
                          key={t.id}
                          title={`${t.title} · ${fmtTime(t.startsAt)}–${fmtTime(t.endsAt)}${who ? ` · ${who}` : ""}`}
                          style={{
                            minHeight: 48,
                            background: concurrent ? "var(--accent)" : "var(--s2)",
                            color: concurrent ? "#fff" : "var(--text)",
                            borderRadius: 8,
                            padding: "7px 9px",
                            overflow: "hidden",
                            boxSizing: "border-box",
                            border: concurrent ? "none" : "1px solid var(--bdr)",
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {fmtTime(t.startsAt)}–{fmtTime(t.endsAt)} · {t.title}
                          </div>
                          <div style={{ fontSize: 11, opacity: 0.86, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
                            {who || "—"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
