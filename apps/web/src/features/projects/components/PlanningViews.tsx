import { useState } from "react";
import type { Projects } from "@sever/contracts";
import { StatusBadge } from "../../../ui-kit/index.ts";
import { configuredDate, configuredTime } from "../../../lib/dateFormat.ts";
import { projectStatusLabel, projectStatusTone } from "../../../lib/labels.ts";
import {
  groupProjectsByStartDay,
  planningCalendarMonths,
  projectDayKey,
  projectsOnCalendarDay,
} from "../projectList.ts";

type PlanningViewProps = {
  projects: Projects.ProjectDTO[];
  clientName: (id: string) => string;
  onOpen: (id: string) => void;
};

const WEEKDAYS = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];

function dayHeading(key: string) {
  if (key === "undated") return "Без даты";
  const date = new Date(`${key}T12:00:00`);
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function eventTime(project: Projects.ProjectDTO) {
  if (!project.startsAt) return "—";
  const start = configuredTime(project.startsAt);
  if (!project.endsAt || projectDayKey(project.startsAt) !== projectDayKey(project.endsAt)) return start;
  return `${start}–${configuredTime(project.endsAt)}`;
}

function PlanningEvent({ project, clientName, onOpen, compact = false }: {
  project: Projects.ProjectDTO;
  clientName: (id: string) => string;
  onOpen: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <button
      className={`planning-event planning-event--${projectStatusTone[project.status]}${compact ? " planning-event--compact" : ""}`}
      onClick={() => onOpen(project.id)}
    >
      <span className="planning-event__rail" aria-hidden="true" />
      <span className="planning-event__body">
        <strong>{project.name}</strong>
        <small>{clientName(project.clientId)}</small>
      </span>
      <span className="planning-event__meta">
        <span>{eventTime(project)}</span>
        {!compact && <StatusBadge tone={projectStatusTone[project.status]}>{projectStatusLabel[project.status]}</StatusBadge>}
      </span>
    </button>
  );
}

export function PlanningAgendaView({ projects, clientName, onOpen }: PlanningViewProps) {
  const groups = groupProjectsByStartDay(projects);
  return (
    <div className="planning-agenda">
      {groups.map((group) => (
        <section className="planning-agenda__day" key={group.key}>
          <header>
            <strong>{dayHeading(group.key)}</strong>
            <span>{group.projects.length}</span>
          </header>
          <div className="planning-agenda__events">
            {group.projects.map((project) => (
              <PlanningEvent key={project.id} project={project} clientName={clientName} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function PlanningCalendarView({ projects, clientName, onOpen }: PlanningViewProps) {
  const now = new Date();
  const [calendarAnchor, setCalendarAnchor] = useState(now);
  const [month] = planningCalendarMonths(calendarAnchor, 1);
  const [selectedDay, setSelectedDay] = useState(() => projectDayKey(now));
  const selectedProjects = projectsOnCalendarDay(projects, selectedDay);
  const todayKey = projectDayKey(now);
  const moveCalendar = (monthDelta: number) => {
    const next = new Date(calendarAnchor.getFullYear(), calendarAnchor.getMonth() + monthDelta, 1, 12);
    setCalendarAnchor(next);
    setSelectedDay(projectDayKey(next));
  };
  const showToday = () => {
    setCalendarAnchor(now);
    setSelectedDay(todayKey);
  };

  return (
    <div className="planning-calendar-layout">
      <div className="planning-calendar" aria-label="Календарь мероприятий">
        <nav className="planning-calendar__nav" aria-label="Навигация по календарю">
          <button aria-label="Предыдущий месяц" onClick={() => moveCalendar(-1)}>‹</button>
          <button onClick={showToday}>
            <span>{month?.label}</span>
            <small>Сегодня</small>
          </button>
          <button aria-label="Следующий месяц" onClick={() => moveCalendar(1)}>›</button>
        </nav>
        {month && (
          <section className="planning-month" key={month.key}>
            <div className="planning-month__weekdays" aria-hidden="true">
              {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="planning-month__days">
              {month.days.map((day, index) => {
                if (!day) return <span className="planning-month__blank" key={`blank-${index}`} />;
                const dayProjects = projectsOnCalendarDay(projects, day.key);
                return (
                  <button
                    key={day.key}
                    className={`${day.key === selectedDay ? "is-selected" : ""}${day.key === todayKey ? " is-today" : ""}`}
                    aria-label={`${configuredDate(day.date)}, мероприятий: ${dayProjects.length}`}
                    aria-pressed={day.key === selectedDay}
                    onClick={() => setSelectedDay(day.key)}
                  >
                    <span>{day.day}</span>
                    {dayProjects.length > 0 && <i aria-hidden="true">{dayProjects.length > 1 ? dayProjects.length : ""}</i>}
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
      <aside className="planning-calendar__selection">
        <header>
          <span className="t-label">ВЫБРАННЫЙ ДЕНЬ</span>
          <strong>{dayHeading(selectedDay)}</strong>
        </header>
        {selectedProjects.length > 0 ? selectedProjects.map((project) => (
          <PlanningEvent key={project.id} project={project} clientName={clientName} onOpen={onOpen} compact />
        )) : <p>Мероприятий нет</p>}
      </aside>
    </div>
  );
}
