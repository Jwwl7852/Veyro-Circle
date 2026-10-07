import { Check } from "lucide-react";
import { agreementGuidance } from "@/lib/agreement-guidance";
import type { WorkflowAgreement } from "@/lib/agreement-workflow";

export function AgreementJourney({agreement,uid,lang,names,onContinue}: {agreement:WorkflowAgreement;uid:string;lang:"da"|"sv";names:{borrower:string;lender:string};onContinue:(phase:string)=>void}) {
  const guide=agreementGuidance(agreement,uid,lang,names);
  return <section className="agreement-journey no-print" aria-label={lang === "da" ? "Aftalens forløb" : "Avtalets förlopp"}>
    {guide.connected && !guide.stopped && <ol className="journey-steps">{guide.labels.map((label,index)=>{
      const done=guide.complete || index < guide.current;
      return <li key={label} className={done ? "is-done" : index === guide.current ? "is-current" : ""} aria-current={!guide.complete && index === guide.current ? "step" : undefined}><span className="journey-number" aria-hidden="true">{done ? <Check size={15} /> : index+1}</span><span>{label}{done && <span className="sr-only">{lang === "da" ? " — afsluttet" : " — klart"}</span>}</span></li>;
    })}</ol>}
    <div className={`journey-guidance ${!guide.connected ? "needs-attention" : ""}`}><p className="eyebrow">{lang === "da" ? "Status og næste skridt" : "Status och nästa steg"}</p><h3>{guide.title}</h3><p>{guide.detail}</p>{guide.target && <button type="button" onClick={()=>onContinue(guide.target!)}>{guide.target === "handover" ? (lang === "da" ? "Gå til udlevering" : "Gå till utlämning") : (lang === "da" ? "Gå til tilbagelevering" : "Gå till återlämning")} ↓</button>}</div>
  </section>;
}
