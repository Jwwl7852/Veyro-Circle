"use client";
import {useEffect,useState} from "react";
import {da,sv} from "date-fns/locale";
import {Calendar} from "@/components/ui/calendar";
import {changeCalendar,loadAvailability,loadOwnerCalendar} from "@/lib/firebase-calendar";
import {circleToday,overlaps} from "@/lib/agreement-workflow";
import {validPeriod,type CalendarBlock,type Period} from "@/lib/listing-calendar";
import type {Lang} from "@/lib/marketplace";
const date=(value:string)=>new Date(value+"T12:00:00");
const iso=(value:Date)=>`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`;
export function ListingCalendar({id,lang,owner=false,from,to,onRange}:{id:string;lang:Lang;owner?:boolean;from?:string;to?:string;onRange?:(from:string,to:string)=>void}) {
  const [periods,setPeriods]=useState<Period[]>([]),[blocks,setBlocks]=useState<CalendarBlock[]>([]);
  const [start,setStart]=useState(from??""),[end,setEnd]=useState(to??""),[error,setError]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[version,setVersion]=useState(0);
  const danish=lang==="da",today=circleToday();
  useEffect(()=>{
    let active=true;
    const refresh=()=>{setLoading(true);setError("");void (owner?loadOwnerCalendar(id):loadAvailability([id]).then(result=>{if(!result[id])throw Error();return {booked:result[id]!,blocks:[]};})).then(data=>{if(active){setPeriods(data.booked);setBlocks(data.blocks);}}).catch(()=>{if(active)setError(danish?"Kalenderen kunne ikke hentes. Prøv igen.":"Kalendern kunde inte hämtas. Försök igen.");}).finally(()=>{if(active)setLoading(false);});};
    refresh();window.addEventListener("circle:calendar-changed",refresh);return()=>{active=false;window.removeEventListener("circle:calendar-changed",refresh);};
  },[id,owner,danish,version]);
  const blocked=[...periods,...blocks];
  const conflict=blocked.some(p=>overlaps(p,{from:start,to:end||start}));
  const selectedFrom=owner?start:from,selectedTo=owner?end:to;
  async function change(action:"add"|"remove",blockId?:string) {
    setBusy(true);setError("");try{await changeCalendar(id,action,action==="add"?{from:start,to:end}:{blockId});setStart("");setEnd("");}
    catch(cause){const code=cause instanceof Error?cause.message:"";setError(code==="BOOKING_CONFLICT"?(danish?"Perioden er allerede booket og kan ikke blokeres.":"Perioden är redan bokad och kan inte blockeras."):(danish?"Ændringen kunne ikke gemmes. Opdatér kalenderen og prøv igen.":"Ändringen kunde inte sparas. Uppdatera kalendern och försök igen."));}
    finally{setBusy(false);}
  }
  return <section className="listing-calendar" aria-label={danish?"Tilgængelighedskalender":"Tillgänglighetskalender"}>
    <strong>{owner?(danish?"Din kalender":"Din kalender"):(danish?"Vælg ledige datoer":"Välj lediga datum")}</strong>
    <p>{owner?(danish?"Blokér dage, hvor du selv skal bruge tingen. Godkendte bookinger kan ikke fjernes her.":"Blockera dagar när du själv behöver saken. Godkända bokningar kan inte tas bort här."):(danish?"Grå datoer er ikke ledige. Ejeren skal stadig godkende din forespørgsel.":"Grå datum är inte lediga. Ägaren måste fortfarande godkänna din förfrågan.")}</p>
    {loading?<p role="status">{danish?"Henter kalender…":"Hämtar kalender…"}</p>:!error && <Calendar mode="range" locale={danish?da:sv} weekStartsOn={1} selected={selectedFrom?{from:date(selectedFrom),to:selectedTo?date(selectedTo):undefined}:undefined} defaultMonth={selectedFrom?date(selectedFrom):date(today)} disabled={[{before:date(today)},...blocked.map(p=>({from:date(p.from),to:date(p.to)}))]} onSelect={range=>{const f=range?.from?iso(range.from):"",t=range?.to?iso(range.to):"";if(owner){setStart(f);setEnd(t);}else onRange?.(f,t);}} />}
    {owner && <><div className="date-search-row"><label>{danish?"Fra":"Från"}<input type="date" min={today} value={start} onChange={e=>setStart(e.target.value)}/></label><label>{danish?"Til":"Till"}<input type="date" min={start||today} value={end} onChange={e=>setEnd(e.target.value)}/></label></div>{conflict && <p role="status">{danish?"Perioden indeholder optagede dage.":"Perioden innehåller upptagna dagar."}</p>}<button className="calendar-action" disabled={busy||loading||!!error||conflict||!validPeriod(start,end,today)} onClick={()=>void change("add")}>{danish?"Blokér perioden":"Blockera perioden"}</button><ul>{blocks.map(block=><li key={block.id}><span>{block.from} – {block.to}</span><button disabled={busy} onClick={()=>void change("remove",block.id)}>{danish?"Gør ledig igen":"Gör tillgänglig igen"}</button></li>)}</ul></>}
    {error && <p role="alert">{error} <button onClick={()=>setVersion(v=>v+1)}>{danish?"Prøv igen":"Försök igen"}</button></p>}
  </section>;
}
