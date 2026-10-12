import { useEffect, useState } from "react";

const clamp=(value:number)=>Math.max(0,Math.min(100,value));
export function LiquidLevelControl({label,capacityLiters,value,disabled,onCommit}:{label:string;capacityLiters:number;value:number;disabled?:boolean;onCommit:(value:number)=>void}){
  const[draft,setDraft]=useState(clamp(value));
  useEffect(()=>setDraft(clamp(value)),[value]);
  const liters=Math.round(capacityLiters*draft*1000/100)/1000;
  const commit=()=>{const next=clamp(draft);if(Math.abs(next-value)>=0.05)onCommit(next);};
  return <div className="liquid-level">
    <div className="liquid-level__name">{label}</div>
    <div className="liquid-level__control" style={{["--liquid-fill" as string]:`${draft}%`}}>
      <div className="liquid-level__fill"/>
      <div className="liquid-level__shine"/>
      <input className="liquid-level__input" type="range" min="0" max="100" step="1" value={draft} disabled={disabled} aria-label={`Уровень ${label}`} aria-valuetext={`${Math.round(draft)} процентов, примерно ${liters.toFixed(3)} литра`} onChange={event=>setDraft(Number(event.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit}/>
      <span className="liquid-level__percent">{Math.round(draft)}%</span>
    </div>
    <strong>{liters.toLocaleString("ru-RU",{minimumFractionDigits:3,maximumFractionDigits:3})} л</strong>
    <small>≈ {Math.round(liters*1000).toLocaleString("ru-RU")} мл из {capacityLiters.toLocaleString("ru-RU")} л</small>
  </div>;
}
