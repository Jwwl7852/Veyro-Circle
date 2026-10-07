"use client";
import { useEffect, useState } from "react";
import { enablePush, disablePush, hasPushConsent, pushConfigured, pushSupported } from "@/lib/firebase-push";

export function PushSettings({uid,lang}:{uid:string;lang:"da"|"sv"}) {
  const da=lang === "da";
  const [supported,setSupported]=useState(false);
  const [configured,setConfigured]=useState(false);
  const [enabled,setEnabled]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    void (async()=>{
      try {
        const supported=await pushSupported();
        const result=await fetch("/api/push",{cache:"no-store"}).then(r=>r.json());
        if (!active) return;
        setSupported(supported); setConfigured(pushConfigured && result.enabled);
        if (supported && pushConfigured && result.enabled && hasPushConsent(uid) && Notification.permission === "granted") {
          await enablePush(lang,false);
          if(active) setEnabled(true);
        }
      } catch { if(active) setError(da ? "Push kunne ikke forbindes. Prøv igen." : "Push kunde inte anslutas. Försök igen."); }
    })();
    return ()=>{active=false;};
  },[uid,lang,da]);
  async function toggle() {
    setBusy(true);setError("");
    try { if(enabled) await disablePush(); else await enablePush(lang); setEnabled(!enabled); }
    catch { setError(da ? "Push kunne ikke aktiveres eller ændres. Kontrollér notifikationstilladelsen i browserens indstillinger, og prøv igen." : "Push kunde inte aktiveras eller ändras. Kontrollera aviseringsbehörigheten i webbläsaren och försök igen."); }
    finally { setBusy(false); }
  }
  return <section className="push-settings"><strong>{da ? "Beskeder på denne enhed" : "Aviseringar på den här enheten"}</strong><p>{da ? "Få besked om nye forespørgsler og beskeder, også når Circle er lukket. Beskedens tekst vises ikke på låseskærmen." : "Få aviseringar om nya förfrågningar och meddelanden, även när Circle är stängt. Meddelandets text visas inte på låsskärmen."}</p><p>{da ? "På iPhone/iPad: Føj Circle til hjemmeskærmen via Del, åbn den derfra og slå notifikationer til (iOS/iPadOS 16.4 eller nyere)." : "På iPhone/iPad: Lägg till Circle på hemskärmen via Dela, öppna den därifrån och aktivera aviseringar (iOS/iPadOS 16.4 eller senare)."}</p>{!configured ? <p role="status">{da ? "Mobilnotifikationer afventer aktivering hos Circle. Beskeder vises fortsat her i appen." : "Mobilaviseringar väntar på aktivering hos Circle. Meddelanden visas fortfarande här i appen."}</p> : !supported ? <p>{da ? "Denne browser understøtter ikke push i den aktuelle visning." : "Den här webbläsaren stöder inte push i den aktuella vyn."}</p> : <button type="button" disabled={busy} onClick={()=>void toggle()}>{busy ? "…" : enabled ? (da ? "Slå push fra på denne enhed" : "Stäng av push på den här enheten") : (da ? "Slå push til på denne enhed" : "Aktivera push på den här enheten")}</button>}{error && <p role="alert">{error}</p>}</section>;
}
