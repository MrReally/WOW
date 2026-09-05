import { projectStagePresentation as STAGES } from "../../../lib/labels.ts";
import type { Projects } from "@sever/contracts";

export const PROJECT_STAGE_ORDER: Projects.ProjectChecklistGroup[] = ["prep", "pickup", "delivery", "mount", "show", "dismantle", "return"];


export function ProjectStageProgress({ stage, complete }: { stage: Projects.ProjectChecklistGroup; complete: boolean }) {
  const activeIndex = PROJECT_STAGE_ORDER.indexOf(stage);
  return <div className="project-stage-progress" aria-label="Стадии проекта">
    {PROJECT_STAGE_ORDER.map((item, index) => {
      const state = complete || index < activeIndex ? "done" : index === activeIndex ? "active" : "upcoming";
      return <div className={`project-stage-progress__item project-stage-progress__item--${state}`} key={item} aria-current={state === "active" ? "step" : undefined} title={STAGES[item].label}>
        <span className="project-stage-progress__icon">{STAGES[item].icon}</span>
        <span>{STAGES[item].label}</span>
      </div>;
    })}
  </div>;
}
