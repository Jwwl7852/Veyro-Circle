"use client";

import { useEffect, useState } from "react";
import {
  browserLocalPersistence, createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification, setPersistence,
  sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateProfile,
  type User,
} from "firebase/auth";
import { AlertCircle, CheckCircle2, KeyRound, LoaderCircle, LogIn, UserPlus } from "lucide-react";
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
  return da ? "Handlingen kunne ikke gennemføres. Prøv igen." : "Åtgärden kunde inte genomföras. Försök igen.";
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
        await sendEmailVerification(credential.user);
      }
      if (mode === "reset") {
        await sendPasswordResetEmail(auth, email.trim());
        setMessage(da ? "Vi har sendt et link til nulstilling af adgangskoden." : "Vi har skickat en länk för att återställa lösenordet.");
      }
    } catch (reason) { setError(friendlyError(reason, lang)); }
    finally { setBusy(false); }
  }

  return <main className="auth-page">
    <section className="auth-brand"><img src="/branding/veyro-systems-logo.png" alt="Veyro Systems" /><p>Veyro Circle</p><small>{da ? "Et produkt fra Veyro Systems ApS" : "En produkt från Veyro Systems ApS"}</small></section>
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
  const da = lang === "da";
  return <main className="auth-page"><section className="auth-brand"><img src="/branding/veyro-systems-logo.png" alt="Veyro Systems" /><p>Veyro Circle</p><small>{da ? "Et produkt fra Veyro Systems ApS" : "En produkt från Veyro Systems ApS"}</small></section><section className="auth-card verification-card"><CheckCircle2 size={38} /><h1>{da ? "Bekræft din e-mail" : "Bekräfta din e-post"}</h1><p>{da ? `Vi har sendt en bekræftelsesmail til ${user.email ?? "din e-mail"}. Åbn linket og genindlæs derefter siden.` : `Vi har skickat ett bekräftelsemail till ${user.email ?? "din e-post"}. Öppna länken och ladda sedan om sidan.`}</p><Button onClick={async()=>{await user.reload(); window.location.reload();}}>{da ? "Jeg har bekræftet" : "Jag har bekräftat"}</Button><button className="text-link" onClick={async()=>{await sendEmailVerification(user);setSent(true);}}>{sent ? (da ? "Mailen er sendt igen" : "Mailet har skickats igen") : (da ? "Send mailen igen" : "Skicka mailet igen")}</button><button className="text-link" onClick={circleSignOut}>{da ? "Log ud" : "Logga ut"}</button></section></main>;
}
