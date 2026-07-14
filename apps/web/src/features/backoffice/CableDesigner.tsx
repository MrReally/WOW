import type { Equipment } from "@sever/contracts";

function ends(attrs:Equipment.CableAttrs,side:"A"|"B") {
  const explicit=side==="A"?attrs.sideAEnds:attrs.sideBEnds;
  if(explicit?.length)return explicit;
  const count=side==="A"?attrs.sideAQty:attrs.sideBQty, connector=side==="A"?attrs.sideAConnector:attrs.sideBConnector;
  return Array.from({length:Math.max(1,count)},()=>connector);
}

export function CableDesigner({value,connectors,onChange}:{value:Equipment.CableAttrs;connectors:Equipment.CableConnectorDTO[];onChange:(value:Equipment.CableAttrs)=>void}) {
  const sideA=ends(value,"A"),sideB=ends(value,"B");
  const updateEnds=(side:"A"|"B",next:string[])=>onChange({...value,[side==="A"?"sideAEnds":"sideBEnds"]:next,[side==="A"?"sideAQty":"sideBQty"]:next.length,[side==="A"?"sideAConnector":"sideBConnector"]:next[0]??""});
  const connector=(name:string)=>connectors.find(item=>item.name===name);
  const End=({side,index,name}:{side:"A"|"B";index:number;name:string})=>{const item=connector(name);return <label className="bo-cable-end"><span className="bo-cable-end__visual">{item?.imageDataUrl?<img src={item.imageDataUrl} alt=""/>:<b>{item?.designation||"+"}</b>}</span><select aria-label={`Разъём ${side}${index+1}`} value={name} onChange={event=>{const next=[...(side==="A"?sideA:sideB)];next[index]=event.target.value;updateEnds(side,next);}}><option value="">Выберите разъём</option>{connectors.filter(x=>x.active).map(item=><option key={item.id} value={item.name}>{item.name}</option>)}</select></label>};
  const Side=({side,values}:{side:"A"|"B";values:string[]})=><div className="bo-cable-side"><div className="bo-cable-side__tools"><strong>Сторона {side}</strong><button type="button" aria-label={`Уменьшить количество концов ${side}`} disabled={values.length<=1} onClick={()=>updateEnds(side,values.slice(0,-1))}>−</button><span>{values.length}</span><button type="button" aria-label={`Увеличить количество концов ${side}`} onClick={()=>updateEnds(side,[...values,""])}>+</button></div><div className="bo-cable-ends">{values.map((name,index)=><End key={`${side}-${index}`} side={side} index={index} name={name}/>)}</div></div>;
  return <div className="bo-cable-designer">
    <div className="bo-cable-diagram"><Side side="A" values={sideA}/><div className="bo-cable-core"><span/><label>Тип кабеля<input aria-label="Тип кабеля" value={value.cableType} onChange={event=>onChange({...value,cableType:event.target.value})} placeholder="DMX / Audio / Power"/></label><label>Длина, м<input aria-label="Длина кабеля" type="number" min="0.1" step="0.1" value={value.lengthM||""} onChange={event=>onChange({...value,lengthM:Math.max(0,Number(event.target.value)||0)})}/></label></div><Side side="B" values={sideB}/></div>
  </div>;
}

export function ModelImageInput({value,onChange}:{value:string|null;onChange:(value:string|null)=>void}) {
  const pick=(file:File|undefined)=>{if(!file)return;if(!["image/png","image/jpeg"].includes(file.type)||file.size>1_500_000){alert("Выберите PNG или JPEG до 1,5 МБ");return;}const reader=new FileReader();reader.onload=()=>onChange(String(reader.result));reader.readAsDataURL(file);};
  return <label className="bo-model-image-input"><span>Изображение модели</span><div>{value?<img src={value} alt="Превью модели"/>:<span className="bo-image-placeholder">Нет изображения</span>}<input type="file" accept="image/png,image/jpeg" onChange={event=>pick(event.target.files?.[0])}/>{value&&<button type="button" onClick={()=>onChange(null)}>Удалить</button>}</div></label>;
}
