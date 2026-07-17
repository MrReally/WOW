import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Equipment, Plans } from "@sever/contracts";

const data=vi.hoisted(()=>{const now="2026-07-17T00:00:00.000Z";const fixture={id:"fixture",planId:"plan",layer:"light",kind:"fixture",label:"BAR1",x:50,y:50,rotation:0,w:null,h:null,fromId:null,toId:null,modelId:"model",unitId:"unit",attrs:{dmxUniverse:1,dmxAddress:101,dmxChannels:16,powerW:200,requiredOutlets:1,note:"Front truss"},createdAt:now};return {now,fixture,plan:{id:"plan",projectId:"project",venueId:null,name:"Main stage",version:1,isCurrent:true,stageW:400,stageH:300,createdAt:now,elements:[fixture]},model:{id:"model",typeId:"type",trackingMode:"serial",name:"Robe Bar",manufacturer:"Robe",imageUrl:null,unitCostEUR:0,dailyPriceEUR:0,attrs:{stageSymbol:{shape:"bar",code:"BAR",width:80,height:10,color:"#123456"}},requiredComponentModelIds:[],createdAt:now},unit:{id:"unit",modelId:"model",assetTag:"LIGHT-001",serial:null,status:"on_project",warehouseId:null,zoneId:null,currentProjectId:"project",notes:null,createdAt:now}};});

vi.mock("../src/app/session.ts",()=>({useSession:()=>({can:()=>true})}));
vi.mock("../src/features/plans/hooks.ts",()=>({
  useCurrentPlan:()=>({data:data.plan as Plans.PlanDTO,isLoading:false,error:null,refetch:vi.fn()}),
  usePlanVersions:()=>({data:[{id:"plan",projectId:"project",name:"Main stage",version:1,isCurrent:true,elementCount:1,createdAt:data.now}]}),
  useProjectModels:()=>({data:[data.model as Equipment.EquipmentModelDTO],isLoading:false,error:null,refetch:vi.fn()}),
  useProjectUnits:()=>({data:[data.unit as Equipment.EquipmentUnitDTO]}),
  useCreatePlan:()=>({mutate:vi.fn(),isPending:false}),useNewVersion:()=>({mutate:vi.fn(),isPending:false}),useSetCurrentPlan:()=>({mutate:vi.fn(),isPending:false}),useAddElement:()=>({mutate:vi.fn(),isPending:false}),useUpdateElement:()=>({mutate:vi.fn(),isPending:false}),useDeleteElement:()=>({mutate:vi.fn(),isPending:false}),useMoveElements:()=>({mutate:vi.fn(),isPending:false}),
}));

import { StagePlanPage } from "../src/features/plans/StagePlanPage.tsx";

describe("stage plan view/edit workflow",()=>{
  it("starts safely in view mode, opens a rich card, and explicitly enters edit mode",async()=>{
    const user=userEvent.setup();
    render(<MemoryRouter initialEntries={["/projects/project/plan"]}><Routes><Route path="/projects/:id/plan" element={<StagePlanPage/>}/></Routes></MemoryRouter>);
    expect(screen.getByRole("button",{name:"Просмотр"}).className).toContain("is-active");
    expect(screen.queryByText("Добавить на схему")).toBeNull();
    fireEvent.pointerDown(screen.getByText("BAR1"));
    expect(await screen.findByText("Robe Bar")).toBeTruthy();
    expect(screen.getByText("LIGHT-001")).toBeTruthy();
    expect(screen.getByText("U1 · 101–116")).toBeTruthy();
    expect(screen.getByText("Front truss")).toBeTruthy();
    await user.click(screen.getByRole("button",{name:"Редактирование"}));
    expect(screen.getByRole("button",{name:"Редактирование"}).className).toContain("is-active");
    expect(screen.getByText("Добавить на схему")).toBeTruthy();
    expect(screen.getByRole("button",{name:"Сохранить изменения"})).toBeTruthy();
  });
});
