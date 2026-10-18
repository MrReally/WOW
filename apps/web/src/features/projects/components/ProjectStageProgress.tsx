import { projectStagePresentation as STAGES } from "../../../lib/labels.ts";
import type { Projects } from "@sever/contracts";

export const PROJECT_STAGE_ORDER: Projects.ProjectChecklistGroup[] = ["prep", "pickup", "delivery", "mount", "show", "dismantle", "return"];

export function projectStageOrder(dryRental: boolean): Projects.ProjectChecklistGroup[] {
  return dryRental
    ? PROJECT_STAGE_ORDER.filter((stage) => stage !== "delivery" && stage !== "mount" && stage !== "dismantle")
    : PROJECT_STAGE_ORDER;
}

export function ProjectStageProgress({ stage, complete, dryRental = false, compact = false }: { stage: Projects.ProjectChecklistGroup; complete: boolean; dryRental?: boolean; compact?: boolean }) {
  const stages = projectStageOrder(dryRental);
  const normalizedStage = dryRental && (stage === "delivery" || stage === "mount") ? "show" : dryRental && stage === "dismantle" ? "return" : stage;
  const activeIndex = stages.indexOf(normalizedStage);
  return <div className={`project-stage-progress${compact ? " project-stage-progress--compact" : ""}`} style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }} aria-label="Складской оборот">
    {stages.map((item, index) => {
      const state = complete || index < activeIndex ? "done" : index === activeIndex ? "active" : "upcoming";
      return <div className={`project-stage-progress__item project-stage-progress__item--${state}`} key={item} aria-current={state === "active" ? "step" : undefined} title={STAGES[item].label}>
        <span className="project-stage-progress__icon">{STAGES[item].icon}</span>
        {!compact && <span>{STAGES[item].label}</span>}
      </div>;
    })}
  </div>;
}
