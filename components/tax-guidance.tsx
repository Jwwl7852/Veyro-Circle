import { BookOpen, ExternalLink } from "lucide-react";
import type { Country, Lang } from "@/lib/marketplace";
import { taxRows, taxSources } from "@/lib/tax-guidance";

export function TaxGuidance({ lang, country }: { lang: Lang; country: Country }) {
  const da = lang === "da";
  const countryName = country === "DK" ? "Danmark" : "Sverige";
  return <section className="tax-guidance" aria-labelledby="tax-heading" lang={lang}>
    <div className="tax-heading"><BookOpen size={23} aria-hidden="true" /><h2 id="tax-heading">{da ? "Godt at vide om skat" : "Bra att veta om skatt"}</h2><span>2026</span></div>
    <div className="tax-country">{country === "DK" ? "🇩🇰" : "🇸🇪"} {countryName}</div>
    <p className="tax-intro">{da ? "Læs reglerne for betalt udlejning af private ting og transportmidler, før du opretter din profil. Boligudlejning har andre regler." : "Läs reglerna för uthyrning av privata saker och fordon mot betalning innan du skapar din profil. Bostadsuthyrning har andra regler."}</p>
    <dl className="tax-rules">{taxRows[lang].map(row=><div key={row.label}><dt>{row.label}</dt><dd>{row[country]}</dd></div>)}</dl>
    <details className="tax-details">
      <summary>{da ? "Betingelser og officielle kilder" : "Villkor och officiella källor"}</summary>
      {country === "DK" ? <p>{da ? "Det høje bilfradrag gælder el-/brintbiler og hybridbiler under 50 g CO₂/km. Ved bundfradrag fratrækkes udgifter ikke også. For andre ting findes ikke dette generelle bundfradrag; indtægter fra ting købt med udlejning for øje er skattepligtige." : "Det högre bilavdraget gäller el-/vätgasbilar och hybridbilar under 50 g CO₂/km. Utgifter dras inte av samtidigt med grundavdraget. Andra saker omfattas inte av detta generella grundavdrag; inkomster från saker köpta för uthyrning är skattepliktiga."}</p> : <p>{da ? "Moms vurderes særskilt. Få udlejninger om året er normalt ikke økonomisk virksomhed. Momsvilkårene her vedrører virksomhed med hjemsted i Sverige; se kilden for beregning af afgiftsgrundlag og øvrige betingelser." : "Moms bedöms separat. Enstaka uthyrningar per år är normalt inte ekonomisk verksamhet. Momsvillkoren här gäller företag med säte i Sverige; se källan för beräkning av beskattningsunderlaget och övriga villkor."}</p>}
      <ul className="tax-sources">{taxSources.filter(source=>source.id.startsWith(country.toLowerCase())).map(source=><li key={source.id}><a href={source.href} target="_blank" rel="noopener noreferrer">{source.label[lang]}<ExternalLink size={13} aria-hidden="true" /></a></li>)}</ul>
    </details>
    <p className="tax-demo"><strong>{da ? "Om denne prøveversion" : "Om denna demoversion"}</strong>{da ? "Veyro Circle indberetter ikke lejeindtægter til skat i prøveversionen." : "Veyro Circle rapporterar inte hyresinkomster till skattemyndigheterna i demoversionen."}{country === "DK" && (da ? " Profiloprettelsen giver ikke i sig selv ret til platformfradrag." : " Att skapa en profil ger inte i sig rätt till plattformsavdrag.")}</p>
    <p className="tax-footnote">{da ? "Kontrolleret 5. september 2026. Generel vejledning, ikke individuel skatterådgivning. Dit bopælsland i profilen afgør ikke alene din skattepligt. Ved erhverv eller udlejning over grænserne: spørg skattemyndigheden." : "Kontrollerat 5 september 2026. Allmän information, inte individuell skatterådgivning. Ditt adressland i profilen avgör inte ensamt din skattskyldighet. Vid näringsverksamhet eller uthyrning över gränserna: fråga skattemyndigheten."}</p>
  </section>;
}
