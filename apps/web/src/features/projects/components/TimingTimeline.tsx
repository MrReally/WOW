import type { Projects } from "@sever/contracts";
import { useEffect, useState } from "react";
import { configuredDate, configuredTime } from "../../../lib/dateFormat.ts";

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
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  if (timings.length === 0) return null;
  const days = groupByDay(timings);
  const nowMs = now.getTime();

  return (
    <div className="stack" style={{ gap: 10 }}>
      {days.map((day) => {
        const dayStart = Math.min(...day.map((t) => Date.parse(t.startsAt)));
        const dayEnd = Math.max(...day.map((t) => Date.parse(t.endsAt)));
        const showNow = nowMs >= dayStart && nowMs <= dayEnd && dayKey(now.toISOString()) === dayKey(day[0]!.startsAt);
        const clusters = packLanes(day);
        const clusterRanges = clusters.map((cluster) => {
          const items = cluster.lanes.flat();
          return {
            start: Math.min(...items.map((item) => Date.parse(item.startsAt))),
            end: Math.max(...items.map((item) => Date.parse(item.endsAt))),
          };
        });
        const activeClusterIndex = showNow ? clusterRanges.findIndex((range) => nowMs >= range.start && nowMs <= range.end) : -1;
        const markerBeforeIndex = showNow && activeClusterIndex < 0
          ? clusterRanges.findIndex((range) => nowMs < range.start)
          : -1;
        return (
        <div key={dayKey(day[0]!.startsAt)}>
          <div className="card__subtitle" style={{ marginBottom: 6 }}>{configuredDate(day[0]!.startsAt)}</div>
          <div className="stack" style={{ gap: 6 }}>
            {clusters.map((cluster, clusterIndex) => {
              const range = clusterRanges[clusterIndex]!;
              const markerPercent = range.end === range.start ? 50 : Math.max(0, Math.min(100, ((nowMs - range.start) / (range.end - range.start)) * 100));
              return (
                <div key={clusterIndex} className="stack" style={{ gap: 6 }}>
                  {markerBeforeIndex === clusterIndex && <NowLine now={now} />}
                  <div className="timeline-cluster" style={{ gridTemplateColumns: `repeat(${cluster.lanes.length}, minmax(0, 1fr))` }}>
                    {activeClusterIndex === clusterIndex && <NowLine now={now} absolute top={markerPercent} />}
                    {cluster.lanes.map((lane, laneIndex) => (
                      <div key={laneIndex} className="stack" style={{ gap: 6 }}>
                        {lane.map((t) => {
                          const who = t.assigneeIds.map(userName).filter(Boolean).join(", ");
                          const concurrent = day.some((other) => other.id !== t.id && overlaps(t, other));
                          return (
                            <div key={t.id} title={`${t.title} · ${configuredTime(t.startsAt)}–${configuredTime(t.endsAt)}${who ? ` · ${who}` : ""}`} style={{ minHeight: 48, background: concurrent ? "var(--accent)" : "var(--s2)", color: concurrent ? "var(--accent-text)" : "var(--text)", borderRadius: 8, padding: "7px 9px", overflow: "hidden", boxSizing: "border-box", border: concurrent ? "none" : "1px solid var(--bdr)" }}>
                              <div style={{ fontWeight: 700, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{configuredTime(t.startsAt)}–{configuredTime(t.endsAt)} · {t.title}</div>
                              <div style={{ fontSize: 11, opacity: 0.86, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>{who || "—"}</div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        );
      })}
    </div>
  );
}

function NowLine({ now, absolute = false, top = 0 }: { now: Date; absolute?: boolean; top?: number }) {
  return (
    <div className={`timeline-now${absolute ? " timeline-now--absolute" : ""}`} style={absolute ? { top: `${top}%` } : undefined}>
      <span className="timeline-now__line" />
      <span className="timeline-now__label">{configuredTime(now)}</span>
    </div>
  );
}
