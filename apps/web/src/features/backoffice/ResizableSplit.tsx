import { Children, useEffect, useRef, useState, type ReactNode } from "react";

export function ResizableSplit({ id, children }: { id: string; children: ReactNode }) {
  const items = Children.toArray(children);
  const rootRef = useRef<HTMLDivElement>(null);
  const storageKey = `sever.backoffice.split.${id}`;
  const [leftPercent, setLeftPercent] = useState(() => {
    const stored = Number(localStorage.getItem(storageKey));
    return Number.isFinite(stored) && stored >= 25 && stored <= 80 ? stored : 62;
  });
  useEffect(() => localStorage.setItem(storageKey, String(leftPercent)), [leftPercent, storageKey]);
  if (items.length < 2) return <>{items}</>;
  const resizeAt = (clientX: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect?.width) setLeftPercent(Math.min(80, Math.max(25, ((clientX - rect.left) / rect.width) * 100)));
  };
  return <div ref={rootRef} className="bo-split" style={{ ["--bo-split-left" as string]: `${leftPercent}%` }}>
    <div className="bo-split__pane">{items[0]}</div>
    <div className="bo-split__handle" role="separator" aria-label="Изменить ширину окон" aria-orientation="vertical" aria-valuemin={25} aria-valuemax={80} aria-valuenow={Math.round(leftPercent)} tabIndex={0}
      onDoubleClick={() => setLeftPercent(62)}
      onKeyDown={(event) => { if (!["ArrowLeft","ArrowRight","Home"].includes(event.key)) return; event.preventDefault(); setLeftPercent(value => event.key === "Home" ? 62 : Math.min(80, Math.max(25, value + (event.key === "ArrowLeft" ? -2 : 2)))); }}
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); document.body.classList.add("bo-is-resizing"); resizeAt(event.clientX); }}
      onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resizeAt(event.clientX); }}
      onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId); document.body.classList.remove("bo-is-resizing"); }}
      onPointerCancel={() => document.body.classList.remove("bo-is-resizing")}
    ><span /></div>
    <div className="bo-split__pane">{items.slice(1)}</div>
  </div>;
}

/** Adds a real divider to legacy split workspaces without coupling their content. */
export function useBackofficeSplitResize() {
  useEffect(() => {
    const storageKey="sever.backoffice.split.default";
    const install=()=>document.querySelectorAll<HTMLElement>(".bo-split").forEach((split,index)=>{
      if(split.querySelector(":scope > .bo-split__handle")||split.children.length<2)return;
      const handle=document.createElement("div");
      handle.className="bo-split__handle";handle.tabIndex=0;handle.role="separator";handle.ariaLabel="Изменить ширину окон";handle.dataset.split=String(index);
      const stored=Number(localStorage.getItem(storageKey));
      let value=Number.isFinite(stored)&&stored>=25&&stored<=80?stored:62;
      const set=(next:number)=>{value=Math.min(80,Math.max(25,next));split.style.setProperty("--bo-split-left",`${value}%`);handle.setAttribute("aria-valuenow",String(Math.round(value)));localStorage.setItem(storageKey,String(value));};
      set(value);
      const at=(clientX:number)=>{const rect=split.getBoundingClientRect();if(rect.width)set(((clientX-rect.left)/rect.width)*100);};
      handle.addEventListener("pointerdown",event=>{handle.setPointerCapture(event.pointerId);document.body.classList.add("bo-is-resizing");at(event.clientX);});
      handle.addEventListener("pointermove",event=>{if(handle.hasPointerCapture(event.pointerId))at(event.clientX);});
      handle.addEventListener("pointerup",event=>{handle.releasePointerCapture(event.pointerId);document.body.classList.remove("bo-is-resizing");});
      handle.addEventListener("dblclick",()=>set(62));
      handle.addEventListener("keydown",event=>{if(!["ArrowLeft","ArrowRight","Home"].includes(event.key))return;event.preventDefault();set(event.key==="Home"?62:value+(event.key==="ArrowLeft"?-2:2));});
      split.append(handle);
    });
    install();
    const observer=new MutationObserver(install);observer.observe(document.body,{childList:true,subtree:true});
    return()=>{observer.disconnect();document.querySelectorAll(".bo-split__handle").forEach(node=>node.remove());document.body.classList.remove("bo-is-resizing");};
  },[]);
}
