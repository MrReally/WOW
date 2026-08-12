import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Register, type RegisterColumn } from "../src/features/backoffice/Register.tsx";

interface Row { id:string; status:string }
const rows:Row[]=[
  {id:"1",status:"Проведён"},
  {id:"2",status:"Проведён частично"},
  {id:"3",status:"Черновик"},
  {id:"4",status:"Проведён"},
];
const columns:RegisterColumn<Row>[]=[{id:"status",label:"Статус",value:row=>row.status}];

describe("register column filters",()=>{
  beforeEach(()=>localStorage.clear());

  it("offers every unique visible value and applies an exact match",()=>{
    render(<Register id="filter-test" rows={rows} columns={columns} rowKey={row=>row.id}/>);
    fireEvent.click(screen.getByRole("button",{name:"Фильтр: Статус"}));
    const select=screen.getByRole("combobox",{name:"Выбрать значение: Статус"});
    expect(within(select).getAllByRole("option").map(option=>option.textContent)).toEqual(["Все значения","Проведён","Проведён частично","Черновик"]);
    fireEvent.change(select,{target:{value:"Проведён"}});
    expect(screen.getByText("2 из 4")).toBeTruthy();
  });

  it("keeps substring filtering available",()=>{
    render(<Register id="contains-test" rows={rows} columns={columns} rowKey={row=>row.id}/>);
    fireEvent.click(screen.getByRole("button",{name:"Фильтр: Статус"}));
    fireEvent.change(screen.getByRole("textbox",{name:"Содержит: Статус"}),{target:{value:"Проведён"}});
    expect(screen.getByText("3 из 4")).toBeTruthy();
  });
});
