import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectStageProgress } from "../src/features/projects/components/ProjectStageProgress.tsx";

describe("ProjectStageProgress", () => {
  it("marks previous, active and upcoming stages", () => {
    const { container } = render(<ProjectStageProgress stage="delivery" complete={false} />);
    expect(container.querySelectorAll(".project-stage-progress__item--done")).toHaveLength(2);
    expect(container.querySelectorAll(".project-stage-progress__item--active")).toHaveLength(1);
    expect(container.querySelectorAll(".project-stage-progress__item--upcoming")).toHaveLength(4);
  });

  it("dims every stage after turnover completion", () => {
    const { container } = render(<ProjectStageProgress stage="return" complete />);
    expect(container.querySelectorAll(".project-stage-progress__item--done")).toHaveLength(7);
    expect(container.querySelectorAll(".project-stage-progress__item--active")).toHaveLength(0);
  });
});
