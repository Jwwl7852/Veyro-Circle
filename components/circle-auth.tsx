"use client";

import { useEffect, useState } from "react";
import {
  browserLocalPersistence, createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification, setPersistence,
  sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateProfile,
  type User,
} from "firebase/auth";
import { AlertCircle, CheckCircle2, KeyRound, LoaderCircle, LogIn, MapPin, PackageCheck, ShieldCheck, UserPlus } from "lucide-react";
import { auth, firebaseConfigured, missingFirebaseConfig } from "@/lib/firebase-client";
import { Button } from "@/components/ui/button";
import type { Lang } from "@/lib/marketplace";

type Mode = "login" | "register" | "reset";

function friendlyError(error: unknown, lang: Lang) {
  const code = typeof error === "object" && error && "code" in error ? String((error as {code: unknown}).code) : "";
  const da = lang === "da";
  if (code.includes("invalid-credential")) return da ? "E-mail eller adgangskode er forkert." : "E-postadress eller lösenord är fel.";
  if (code.includes("email-already-in-use")) return da ? "E-mailadressen er allerede i brug." : "E-postadressen används redan.";
  if (code.includes("weak-password")) return da ? "Vælg en stærkere adgangskode på mindst 8 tegn." : "Välj ett starkare lösenord med minst 8 tecken.";
  if (code.includes("too-many-requests")) return da ? "For mange forsøg. Vent lidt og prøv igen." : "För många försök. Vänta en stund och försök igen.";
  if (code.includes("unauthorized-continue-uri")) return da ? "Circle-domænet er ikke godkendt i Firebase. Tilføj veyro-circle.netlify.app under Authentication → Settings → Authorized domains." : "Circle-domänen är inte godkänd i Firebase. Lägg till veyro-circle.netlify.app under Authentication → Settings → Authorized domains.";
  if (code.includes("invalid-continue-uri")) return da ? "Returadressen til Circle er ugyldig. Kontakt support." : "Returadressen till Circle är ogiltig. Kontakta support.";
  return da ? "Handlingen kunne ikke gennemføres. Prøv igen." : "Åtgärden kunde inte genomföras. Försök igen.";
}

function prepareAuthEmail(lang: Lang) {
  if (auth) auth.languageCode = lang === "da" ? "da" : "sv";
  return {
    url: `${window.location.origin}/`,
    handleCodeInApp: false,
  };
}

export function useCircleAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseConfigured);
  useEffect(() => {
    if (!auth) return;
    setPersistence(auth, browserLocalPersistence).catch(() => undefined);
    return onAuthStateChanged(auth, next => { setUser(next); setLoading(false); });
  }, []);
  return { user, loading, configured: firebaseConfigured };
}

export async function circleSignOut() {
  const { disablePush } = await import("@/lib/firebase-push");
  await disablePush();
  if (auth) await signOut(auth);
}

export function FirebaseSetupNotice({ lang }: { lang: Lang }) {
  if (firebaseConfigured) return null;
  return <div className="firebase-setup" role="status"><AlertCircle size={18} /><div><b>{lang === "da" ? "Udviklingstilstand · Firebase mangler" : "Utvecklingsläge · Firebase saknas"}</b><p>{lang === "da" ? "Demoen virker fortsat, men rigtige konti aktiveres først, når Firebase-værdierne er indsat." : "Demon fungerar fortfarande, men riktiga konton aktiveras först när Firebase-värdena har lagts in."}</p><small>{missingFirebaseConfig.join(" · ")}</small></div></div>;
}

export function CircleAuthScreen({ lang, setLang }: { lang: Lang; setLang: (lang: Lang) => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const da = lang === "da";

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    if (!auth) { setError(da ? "Firebase er ikke konfigureret." : "Firebase är inte konfigurerat."); return; }
    if (mode === "register" && (name.trim().length < 2 || password.length < 8 || password !== repeat || !acceptedTerms)) {
      setError(da ? "Udfyld navn, brug to ens adgangskoder på mindst 8 tegn, og accepter betingelserne." : "Fyll i namn, använd två likadana lösenord med minst 8 tecken och acceptera villkoren."); return;
    }
    setBusy(true);
    try {
      if (mode === "login") await signInWithEmailAndPassword(auth, email.trim(), password);
      if (mode === "register") {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(credential.user, { displayName: name.trim() });
        await sendEmailVerification(credential.user, prepareAuthEmail(lang));
      }
      if (mode === "reset") {
        prepareAuthEmail(lang);
        await sendPasswordResetEmail(auth, email.trim());
        setMessage(da ? "Vi har sendt et link til nulstilling af adgangskoden." : "Vi har skickat en länk för att återställa lösenordet.");
      }
    } catch (reason) { setError(friendlyError(reason, lang)); }
    finally { setBusy(false); }
  }

  return <main className="auth-page">
    <section className="auth-brand">
      <img className="auth-company-logo" src="/branding/veyro-systems-logo.png" alt="Veyro Systems" />
      <div className="auth-promo-image" role="img" aria-label={da ? "Naboer der deler ting i lokalområdet" : "Grannar som delar saker i närområdet"}><span>{da ? "Del mere · køb mindre" : "Dela mer · köp mindre"}</span></div>
      <div className="auth-promo-copy">
        <p className="auth-product-name">Veyro Circle</p>
        <h2>{da ? <>Tingene findes sikkert allerede<br />Del dem med hinanden</> : <>Sakerna finns säkert redan<br />Dela dem med varandra</>}</h2>
        <p>{da ? "Circle gør det enkelt at finde, låne og leje ting i dit lokalområde – eller dele det, du ikke selv bruger hver dag." : "Circle gör det enkelt att hitta, låna och hyra saker i ditt närområde – eller dela det du inte använder varje dag."}</p>
        <ul>
          <li><PackageCheck /><span><b>{da ? "Lån gratis eller lej" : "Låna gratis eller hyr"}</b>{da ? "Find værktøj, trailer, fritidsudstyr og meget mere." : "Hitta verktyg, släp, fritidsutrustning och mycket mer."}</span></li>
          <li><MapPin /><span><b>{da ? "Find ting i nærheden" : "Hitta saker i närheten"}</b>{da ? "Søg efter kategori, land og afstand." : "Sök efter kategori, land och avstånd."}</span></li>
          <li><ShieldCheck /><span><b>{da ? "Lav en tydelig aftale" : "Skapa ett tydligt avtal"}</b>{da ? "Aftal periode, pris, depositum og underskrift." : "Avtala period, pris, deposition och signatur."}</span></li>
        </ul>
      </div>
      <small>{da ? "Et produkt fra Veyro Systems ApS" : "En produkt från Veyro Systems ApS"}</small>
    </section>
    <section className="auth-card">
      <div className="auth-language"><button className={lang === "da" ? "active" : ""} onClick={()=>setLang("da")}>Dansk</button><button className={lang === "sv" ? "active" : ""} onClick={()=>setLang("sv")}>Svenska</button></div>
      <div><p className="eyebrow">Veyro Circle</p><h1>{mode === "login" ? (da ? "Log ind" : "Logga in") : mode === "register" ? (da ? "Opret konto" : "Skapa konto") : (da ? "Glemt adgangskode" : "Glömt lösenord")}</h1><p>{mode === "reset" ? (da ? "Indtast din e-mail, så sender vi et sikkert nulstillingslink." : "Ange din e-postadress så skickar vi en säker återställningslänk.") : (da ? "Del, lån og lej ting i dit lokalområde." : "Dela, låna och hyr saker i ditt närområde.")}</p></div>
      <form onSubmit={submit}>
        {mode === "register" && <label className="field-label">{da ? "Fulde navn" : "Fullständigt namn"}<input autoComplete="name" required value={name} onChange={e=>setName(e.target.value)} /></label>}
        <label className="field-label">E-mail<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} /></label>
        {mode !== "reset" && <label className="field-label">{da ? "Adgangskode" : "Lösenord"}<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} /></label>}
        {mode === "register" && <label className="field-label">{da ? "Gentag adgangskode" : "Upprepa lösenord"}<input type="password" autoComplete="new-password" required minLength={8} value={repeat} onChange={e=>setRepeat(e.target.value)} /></label>}
        {mode === "register" && <label className="terms-check"><input type="checkbox" required checked={acceptedTerms} onChange={e=>setAcceptedTerms(e.target.checked)} /><span>{da ? "Jeg accepterer " : "Jag accepterar "}<a href="/legal#terms" target="_blank">{da ? "handelsbetingelserne" : "köpvillkoren"}</a>{da ? " og har læst " : " och har läst "}<a href="/legal#privacy" target="_blank">{da ? "privatlivspolitikken" : "integritetspolicyn"}</a>.</span></label>}
        {error && <p className="auth-error" role="alert"><AlertCircle size={17} />{error}</p>}
        {message && <p className="auth-success" role="status"><CheckCircle2 size={17} />{message}</p>}
        <Button type="submit" disabled={busy} className="auth-submit">{busy ? <LoaderCircle className="animate-spin" size={18} /> : mode === "login" ? <LogIn size={18} /> : mode === "register" ? <UserPlus size={18} /> : <KeyRound size={18} />}{mode === "login" ? (da ? "Log ind" : "Logga in") : mode === "register" ? (da ? "Opret konto" : "Skapa konto") : (da ? "Send nulstillingslink" : "Skicka återställningslänk")}</Button>
      </form>
      <div className="auth-actions">
        {mode !== "login" && <button onClick={()=>{setMode("login");setError("");setMessage("");}}>{da ? "Tilbage til login" : "Tillbaka till inloggning"}</button>}
        {mode === "login" && <><button onClick={()=>setMode("reset")}>{da ? "Glemt adgangskode?" : "Glömt lösenordet?"}</button><button onClick={()=>setMode("register")}>{da ? "Opret ny konto" : "Skapa nytt konto"}</button></>}
      </div>
      <p className="auth-legal"><a href="/legal#privacy">{da ? "Privatliv og GDPR" : "Integritet och GDPR"}</a><span>·</span><a href="/legal#terms">{da ? "Handelsbetingelser" : "Köpvillkor"}</a></p>
    </section>
  </main>;
}

export function EmailVerificationScreen({ lang, user }: { lang: Lang; user: User }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const da = lang === "da";
  async function checkVerification() {
    setChecking(true); setError("");
    try {
      await user.reload();
      if (user.emailVerified) window.location.reload();
      else setError(da ? "E-mailen er endnu ikke bekræftet. Åbn linket i mailen først." : "E-postadressen är ännu inte bekräftad. Öppna länken i mailet först.");
    } catch (reason) { setError(friendlyError(reason, lang)); }
    finally { setChecking(false); }
  }
  async function resendVerification() {
    setBusy(true); setSent(false); setError("");
    try {
      await sendEmailVerification(user, prepareAuthEmail(lang));
      setSent(true);
    } catch (reason) { setError(friendlyError(reason, lang)); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-brand"><img src="/branding/veyro-systems-logo.png" alt="Veyro Systems" /><p>Veyro Circle</p><small>{da ? "Et produkt fra Veyro Systems ApS" : "En produkt från Veyro Systems ApS"}</small></section><section className="auth-card verification-card"><CheckCircle2 size={38} /><h1>{da ? "Bekræft din e-mail" : "Bekräfta din e-post"}</h1><p>{da ? `Vi sender bekræftelsesmailen til ${user.email ?? "din e-mail"}. Åbn linket i mailen, og vend derefter tilbage hertil.` : `Vi skickar bekräftelsemailet till ${user.email ?? "din e-post"}. Öppna länken i mailet och gå sedan tillbaka hit.`}</p><p className="verification-help">{da ? "Kan du ikke se mailen? Tjek Spam/Uønsket post og fanen Promoveringer. Det kan tage et par minutter." : "Ser du inte mailet? Kontrollera skräppost och fliken Kampanjer. Det kan ta ett par minuter."}</p>{error && <p className="auth-error" role="alert"><AlertCircle size={17} />{error}</p>}{sent && <p className="auth-success" role="status"><CheckCircle2 size={17} />{da ? "En ny bekræftelsesmail er sendt. Tjek også Spam/Uønsket post." : "Ett nytt bekräftelsemail har skickats. Kontrollera även skräpposten."}</p>}<Button disabled={checking} onClick={checkVerification}>{checking && <LoaderCircle className="animate-spin" size={18} />}{da ? "Jeg har bekræftet" : "Jag har bekräftat"}</Button><button className="text-link" disabled={busy} onClick={resendVerification}>{busy ? (da ? "Sender…" : "Skickar…") : (da ? "Send en ny mail" : "Skicka ett nytt mail")}</button><button className="text-link" onClick={circleSignOut}>{da ? "Log ud" : "Logga ut"}</button></section></main>;
}
