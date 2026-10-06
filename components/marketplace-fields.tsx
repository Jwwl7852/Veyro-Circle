"use client";
import { useId, useState } from "react";
import { Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty } from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TaxGuidance } from "@/components/tax-guidance";
import { hasReadTaxGuidance, TAX_GUIDANCE_VERSION } from "@/lib/tax-guidance";
import { type Country, type Lang, type Place, type Profile, searchPlaces, validProfile } from "@/lib/marketplace";

export function CountrySelect({ value, onChange, lang }: { value: Country | ""; onChange: (c: Country) => void; lang: Lang }) {
  return <Select value={value} onValueChange={v=>onChange(v as Country)}>
    <SelectTrigger aria-label={lang === "da" ? "Land" : "Land"} className="!h-12 w-full rounded-xl bg-white"><SelectValue placeholder={lang === "da" ? "Vælg ét land" : "Välj ett land"} /></SelectTrigger>
    <SelectContent><SelectItem value="DK">🇩🇰 Danmark</SelectItem><SelectItem value="SE">🇸🇪 Sverige</SelectItem></SelectContent>
  </Select>;
}

export function PlacePicker({ value, onChange, country, lang, label }: {
  value: Place | null; onChange: (p: Place | null) => void; country?: Country; lang: Lang; label: string;
}) {
  const [query, setQuery] = useState("");
  const id = useId();
  const matches = searchPlaces(query, country);
  return <div className="place-field">
    <label htmlFor={id}>{label}</label>
    <Combobox items={matches} value={value} onValueChange={onChange} filter={null}
      itemToStringLabel={(p: Place) => p ? p.postcode + " " + p.city : ""}
      onInputValueChange={(text, details) => { setQuery(text); if (details.reason === "input-change") onChange(null); }}>
      <ComboboxInput id={id} placeholder={lang === "da" ? "Skriv postnummer eller by…" : "Skriv postnummer eller ort…"} className="!h-12 w-full rounded-xl bg-white" />
      <ComboboxContent>
        <ComboboxEmpty className="p-4 text-sm">{lang === "da" ? "Ingen match. Prøv et postnummer eller en anden stavemåde." : "Ingen träff. Prova ett postnummer eller en annan stavning."}</ComboboxEmpty>
        <ComboboxList>{(p: Place) => <ComboboxItem key={p.id} value={p} className="min-h-11">
          <span>{p.country === "DK" ? "🇩🇰" : "🇸🇪"}</span><span>{p.postcode} {p.city}</span>
        </ComboboxItem>}</ComboboxList>
      </ComboboxContent>
    </Combobox>
  </div>;
}

export function ProfileForm({ profile, lang, onSave, authenticatedEmail }: { profile: Profile | null; lang: Lang; onSave: (p: Profile)=>void; authenticatedEmail?: string }) {
  const da = lang === "da";
  const [name, setName] = useState(profile?.name || "");
  const [email, setEmail] = useState(authenticatedEmail || profile?.email || "");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [street, setStreet] = useState(profile?.street || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [country, setCountry] = useState<Country | "">(profile?.place.country || "");
  const [place, setPlace] = useState<Place | null>(profile?.place || null);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [taxRead, setTaxRead] = useState(hasReadTaxGuidance(profile?.taxAcknowledgement, profile?.place.country || "DK"));
  const taxCheckId = useId();
  return <form className="profile-form" onSubmit={e=>{
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError(da ? "Indtast en gyldig e-mailadresse." : "Ange en giltig e-postadress."); return;
    }
    if (!authenticatedEmail && !profile && (password.length < 8 || password !== passwordRepeat)) {
      setError(da ? "Adgangskoden skal være på mindst 8 tegn, og de to felter skal være ens." : "Lösenordet måste vara minst 8 tecken och de två fälten måste vara lika."); return;
    }
    if (!country || !place || place.country !== country || !validProfile(name, street, place, phone)) {
      setError(da ? "Udfyld navn, telefonnummer, vej og husnummer, og vælg postnummer/by fra listen." : "Fyll i namn, telefonnummer, gata och husnummer och välj postnummer/ort från listan."); return;
    }
    if (!taxRead) {
      setError(da ? "Læs skatteinformationen, og bekræft, at du har læst den." : "Läs skatteinformationen och bekräfta att du har läst den."); return;
    }
    onSave({name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), street: street.trim(), place: place!, taxAcknowledgement: {version: TAX_GUIDANCE_VERSION, country, acceptedAt: new Date().toISOString()}}); setError("");
  }}>
    <h2>{profile ? (da ? "Konto og oplysninger" : "Konto och uppgifter") : (da ? "Opret konto og profil" : "Skapa konto och profil")}</h2>
    <p>{da ? "Din e-mail er dit login, så du behøver ikke et separat brugernavn. Adresse, postnummer og by er obligatoriske." : "Din e-postadress är din inloggning, så du behöver inget separat användarnamn. Adress, postnummer och ort är obligatoriska."}</p>
    <label className="field-label">E-mail *<input type="email" autoComplete="email" required readOnly={Boolean(authenticatedEmail)} maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder={da ? "navn@eksempel.dk" : "namn@exempel.se"} /></label>
    {!authenticatedEmail && !profile && <><div className="account-passwords"><label className="field-label">{da ? "Adgangskode" : "Lösenord"} *<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} /><small>{da ? "Mindst 8 tegn. Gem den aldrig i en besked eller annonce." : "Minst 8 tecken. Spara det aldrig i ett meddelande eller en annons."}</small></label><label className="field-label">{da ? "Gentag adgangskode" : "Upprepa lösenord"} *<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={passwordRepeat} onChange={e=>setPasswordRepeat(e.target.value)} /></label></div><div className="password-help"><button type="button" onClick={()=>{if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError(da ? "Indtast først den e-mailadresse, som hører til kontoen." : "Ange först e-postadressen som hör till kontot."); setResetSent(false); return; } setError(""); setResetSent(true);}}>{da ? "Glemt adgangskode?" : "Glömt lösenordet?"}</button>{resetSent && <p role="status">{da ? `Vi har simuleret et nulstillingslink til ${email.trim()}.` : `Vi har simulerat en återställningslänk till ${email.trim()}.`}</p>}</div></>}
    <label className="field-label">{da ? "Fulde navn" : "Fullständigt namn"} *<input autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)} /></label>
    <label className="field-label">{da ? "Telefonnummer" : "Telefonnummer"} *<input type="tel" inputMode="tel" autoComplete="tel" required minLength={8} maxLength={24} value={phone} onChange={e=>setPhone(e.target.value)} placeholder={da ? "+45 12 34 56 78" : "+46 70 123 45 67"} /><small>{da ? "Telefonnummeret vises kun i en låne-/lejeaftale mellem parterne." : "Telefonnumret visas endast i ett låne-/hyresavtal mellan parterna."}</small></label>
    <div className="field-label">{da ? "Dit profilland · vælg ét land" : "Ditt profilland · välj ett land"} *<CountrySelect lang={lang} value={country} onChange={c=>{if(c !== country) {setCountry(c);setPlace(null);setTaxRead(false);}}} /><small>{da ? "Din profil hører til enten Danmark eller Sverige. Adresse og by skal ligge i det valgte land." : "Din profil tillhör antingen Danmark eller Sverige. Adressen och orten ska ligga i det valda landet."}</small></div>
    <label className="field-label">{da ? "Adresse · vej og husnummer" : "Adress · gata och husnummer"} *<input autoComplete="street-address" required minLength={4} maxLength={200} value={street} onChange={e=>setStreet(e.target.value)} placeholder={da ? "Vejnavn 12, 1. tv." : "Gatunamn 12, lgh 1001"} /></label>
    {country && <PlacePicker key={country} lang={lang} country={country} value={place} onChange={setPlace} label={da ? "Postnummer og by *" : "Postnummer och ort *"} />}
    {place && <div className="address-summary"><span>{da ? "Postnummer" : "Postnummer"}<b>{place.postcode}</b></span><span>{da ? "By" : "Ort"}<b>{place.city}</b></span></div>}
    <p className="privacy-note">{da ? "Din vej og dit husnummer vises ikke på annoncer eller i søgeresultater. Afstand er et estimat mellem postområder, ikke mellem adresser." : "Din gata och ditt husnummer visas inte i annonser eller sökresultat. Avståndet är en uppskattning mellan postområden, inte mellan adresser."}</p>
    {country ? <><TaxGuidance lang={lang} country={country} />
    <div className={`tax-acknowledgement ${taxRead ? "is-checked" : ""}`}>
      <Checkbox id={taxCheckId} required checked={taxRead} onCheckedChange={checked=>setTaxRead(checked === true)} aria-describedby="tax-heading" />
      <label htmlFor={taxCheckId}>{da ? `Jeg har læst skatteinformationen for ${country === "DK" ? "Danmark" : "Sverige"} og ved, at jeg selv skal sikre korrekt oplysning og betaling af skat og eventuel moms.` : `Jag har läst skatteinformationen för ${country === "DK" ? "Danmark" : "Sverige"} och vet att jag själv ansvarar för korrekt redovisning och betalning av skatt och eventuell moms.`} *</label>
    </div></> : <p className="tax-country-prompt">{da ? "Vælg dit profilland for at se postnumre, byer og de relevante skatteregler." : "Välj ditt profilland för att se postnummer, orter och relevanta skatteregler."}</p>}
    <p className="demo-note">{authenticatedEmail ? (da ? "Profilen gemmes sikkert i Firestore. Din adgangskode håndteres kun af Firebase Authentication." : "Profilen sparas säkert i Firestore. Ditt lösenord hanteras bara av Firebase Authentication.") : (da ? "Demotilstand: Firebase er ikke konfigureret, så profilen gemmes kun i denne session." : "Demoläge: Firebase är inte konfigurerat, så profilen sparas bara i den här sessionen.")}</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    <Button type="submit" disabled={!country || !taxRead} className="h-12 rounded-xl">{profile || authenticatedEmail ? (da ? "Gem profil" : "Spara profil") : (da ? "Opret testkonto" : "Skapa testkonto")}</Button>
  </form>;
}
