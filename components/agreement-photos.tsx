"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, ImagePlus, LockKeyhole, Trash2 } from "lucide-react";
import { MAX_AGREEMENT_PHOTOS, type AgreementPhoto, type PhotoPhase } from "@/lib/agreement-photos";
import { loadAgreementPhoto, photoError, removeAgreementPhoto, uploadAgreementPhoto } from "@/lib/firebase-agreement-photos";

export function AgreementPhotos({id,phase,photos,uid,lang,editable,locked,busy,onBusy,onChange,reviewed,onReview}: {
  id:string;phase:PhotoPhase;photos:AgreementPhoto[];uid:string;lang:"da"|"sv";editable:boolean;locked:boolean;busy:boolean;
  onBusy:(busy:boolean)=>void;onChange:(photos:AgreementPhoto[])=>void;reviewed:boolean;onReview:(reviewed:boolean)=>void;
}) {
  const fileInput=useRef<HTMLInputElement>(null),cameraInput=useRef<HTMLInputElement>(null);
  const [error,setError]=useState<unknown>(null),[working,setWorking]=useState(false);
  const [loaded,setLoaded]=useState<string[]>([]);
  const da=lang === "da";
  const allLoaded=photos.every(p=>loaded.includes(p.id));
  async function change(action:()=>Promise<AgreementPhoto[]>) {
    setError(null);setWorking(true);onBusy(true);onReview(false);
    try { onChange(await action()); } catch(cause) {setError(cause);}
    finally {setWorking(false);onBusy(false);}
  }
  function choose(input:HTMLInputElement) { const file=input.files?.[0];input.value="";if(file) void change(()=>uploadAgreementPhoto(id,phase,file)); }
  return <section className="agreement-photos" aria-label={da ? "Billeddokumentation" : "Bilddokumentation"}>
    <div className="no-print">
      <div className="evidence-heading"><h4>{da ? "Billeder af standen" : "Bilder på skicket"}</h4><span>{photos.length}/{MAX_AGREEMENT_PHOTOS}</span></div>
      <p>{da ? "Fotografér genstanden og eventuelle skader — undgå personer, ID og private papirer. Begge parter kan se billederne." : "Fotografera föremålet och eventuella skador — undvik personer, ID och privata papper. Båda parter kan se bilderna."}</p>
      {photos.length>0 && <div className="evidence-grid">{photos.map((photo,i)=><Photo key={`${id}:${phase}:${photo.id}`} id={id} phase={phase} photo={photo} number={i+1} lang={lang} onLoaded={()=>setLoaded(old=>old.includes(photo.id) ? old : [...old,photo.id])} remove={editable && !locked && photo.uploadedBy === uid ? ()=>{if(window.confirm(da ? "Fjern dette billede fra aftalen?" : "Ta bort bilden från avtalet?")) void change(()=>removeAgreementPhoto(id,phase,photo.id));} : undefined} disabled={busy}/>)}</div>}
      {editable && !locked && photos.length<MAX_AGREEMENT_PHOTOS && <div className="evidence-actions">
        <input ref={cameraInput} className="sr-only" tabIndex={-1} aria-label={da ? "Tag billede" : "Ta bild"} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e=>choose(e.currentTarget)} disabled={busy}/>
        <input ref={fileInput} className="sr-only" tabIndex={-1} aria-label={da ? "Vælg billede" : "Välj bild"} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>choose(e.currentTarget)} disabled={busy}/>
        <button type="button" disabled={busy} onClick={()=>cameraInput.current?.click()}><Camera size={17}/>{da ? "Tag billede" : "Ta bild"}</button>
        <button type="button" disabled={busy} onClick={()=>fileInput.current?.click()}><ImagePlus size={17}/>{da ? "Vælg billede" : "Välj bild"}</button>
      </div>}
      {working && <p role="status">{da ? "Behandler billede…" : "Behandlar bild…"}</p>}
      {error !== null && <p className="evidence-error" role="alert">{photoError(error,lang)}</p>}
      {locked ? <p className="evidence-locked"><LockKeyhole size={15}/>{da ? "Låst sammen med underskriften." : "Låst tillsammans med signaturen."}</p> : <p className="evidence-help">{da ? "Valgfrit · højst 2 billeder · komprimeres automatisk. Første underskrift låser billederne." : "Valfritt · högst 2 bilder · komprimeras automatiskt. Första signaturen låser bilderna."}</p>}
      {photos.length>0 && <label className="evidence-review"><input type="checkbox" checked={reviewed && allLoaded} disabled={busy || !allLoaded} onChange={e=>onReview(e.target.checked)}/><span>{da ? "Jeg har gennemgået billederne, før jeg underskriver." : "Jag har granskat bilderna innan jag signerar."}</span></label>}
    </div>
    {photos.length>0 && <p className="evidence-print-reference">{da ? "Billedbilag gemt digitalt" : "Bildbilaga sparad digitalt"}: {phase === "handover" ? (da ? "udlevering" : "utlämning") : (da ? "tilbagelevering" : "återlämning")} · {photos.length} {da ? "billeder" : "bilder"} · {da ? "se samme ticket på din konto" : "se samma ticket på ditt konto"}.</p>}
  </section>;
}

function Photo({id,phase,photo,number,lang,onLoaded,remove,disabled}:{id:string;phase:PhotoPhase;photo:AgreementPhoto;number:number;lang:"da"|"sv";onLoaded:()=>void;remove?:()=>void;disabled:boolean}) {
  const [src,setSrc]=useState(""),[error,setError]=useState<unknown>(null),[retry,setRetry]=useState(0),[expanded,setExpanded]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();let objectUrl="";
    loadAgreementPhoto(id,phase,photo.id,controller.signal).then(blob=>{
      if(controller.signal.aborted) return;
      objectUrl=URL.createObjectURL(blob);setSrc(objectUrl);
    }).catch(cause=>{if(!controller.signal.aborted)setError(cause);});
    return ()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[id,phase,photo.id,retry]);
  return <figure className={expanded ? "evidence-photo expanded" : "evidence-photo"}>
    {src ? <button type="button" className="evidence-preview" aria-expanded={expanded} aria-label={`${lang === "da" ? "Forstør/formindsk billede" : "Förstora/förminska bild"} ${number}`} onClick={()=>setExpanded(v=>!v)}><Image unoptimized src={src} width={photo.width} height={photo.height} alt={`${lang === "da" ? "Tilstandsbillede" : "Skickbild"} ${number}`} onLoad={onLoaded} onError={()=>{setError(new Error("PHOTO_INVALID"));setSrc("");}}/></button> : error ? <div role="alert"><p>{photoError(error,lang)}</p><button type="button" onClick={()=>{setError(null);setRetry(n=>n+1);}}>{lang === "da" ? "Prøv igen" : "Försök igen"}</button></div> : <p role="status">{lang === "da" ? "Henter billede…" : "Hämtar bild…"}</p>}
    <figcaption><span>{lang === "da" ? "Billede" : "Bild"} {number} · {Math.round(photo.bytes/1024)} KB</span>{remove && <button type="button" disabled={disabled} onClick={remove} aria-label={`${lang === "da" ? "Fjern billede" : "Ta bort bild"} ${number}`}><Trash2 size={16}/></button>}</figcaption>
  </figure>;
}
