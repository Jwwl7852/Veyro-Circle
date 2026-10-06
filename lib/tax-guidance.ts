import type { Country, Lang } from "./marketplace";

export const TAX_GUIDANCE_VERSION = "2026-09-05";
export type TaxAcknowledgement = { version: string; country: Country; acceptedAt: string };
export function hasReadTaxGuidance(ack: TaxAcknowledgement | undefined, country: Country) {
  return !!ack && ack.version === TAX_GUIDANCE_VERSION && ack.country === country && Number.isFinite(Date.parse(ack.acceptedAt));
}

export const taxSources = [
  { id: "dkVehicles", label: { da: "Skattestyrelsen · transportmidler", sv: "Skattestyrelsen · fordon" }, href: "https://skat.dk/borger/deleoekonomi/udlejning-af-bil-baad-eller-campingvogn" },
  { id: "dkThings", label: { da: "Skattestyrelsen · private ting", sv: "Skattestyrelsen · privata saker" }, href: "https://skat.dk/borger/deleoekonomi/salg-bytte-og-udlejning-af-private-ejendele" },
  { id: "dkVat", label: { da: "Skattestyrelsen · moms", sv: "Skattestyrelsen · moms" }, href: "https://skat.dk/erhverv/moms/moms-saadan-goer-du/saadan-registrerer-du-din-virksomhed-for-moms" },
  { id: "seThings", label: { da: "Skatteverket · udlejning", sv: "Skatteverket · uthyrning" }, href: "https://www.skatteverket.se/privat/skatter/arbeteochinkomst/inkomster/hyrautbostadbilochsaker/hyrautbilbatochsaker.4.2cf1b5cd163796a5c8bc0b7.html" },
  { id: "seVat", label: { da: "Skatteverket · momsfritagelse", sv: "Skatteverket · momsbefrielse" }, href: "https://www.skatteverket.se/foretag/moms/momsregistrering/ivissafallbehoverduinteregistreradittforetagformoms.4.3152d9ac158968eb8fd1efe.html" },
];

type TaxRow = { label: string; DK: string; SE: string };
export const taxRows: Record<Lang, TaxRow[]> = {
  da: [
    { label: "Fradrag", DK: "Biler, både og campingvogne: 12.500 DKK. Kvalificerende lavemissionsbiler: 23.500 DKK. Årlige fradrag i 2026, som kræver, at platformen indberetter indtægten. Gælder ikke almindelige ting.", SE: "Intet fast bundfradrag. Udgifter direkte knyttet til udlejningen kan fratrækkes, men ikke almindelige ejerudgifter." },
    { label: "Skat af indtægten", DK: "Ved bundfradragsmetoden beskattes 60 % af indtægten over fradraget som personlig indkomst. 60 % er ikke skattesatsen. Ordningen gælder ikke fx værktøj.", SE: "Overskuddet beskattes normalt med 30 % som kapitalindkomst. Omfattende udlejning kan være erhvervsvirksomhed." },
    { label: "Moms", DK: "Momspligtig omsætning over 50.000 DKK pr. kalenderår kræver som udgangspunkt momsregistrering. Grænsen gælder omsætning, ikke overskud.", SE: "Løbende økonomisk virksomhed kan være momspligtig. Fritagelse kan gælde ved højst 120.000 SEK i årligt afgiftsgrundlag i indeværende og hvert af de to foregående kalenderår, med øvrige betingelser." },
  ],
  sv: [
    { label: "Avdrag", DK: "Bilar, båtar och husvagnar: 12 500 DKK. Kvalificerade lågutsläppsbilar: 23 500 DKK. Årliga avdrag 2026 kräver att plattformen rapporterar inkomsten. Gäller inte vanliga saker.", SE: "Inget fast grundavdrag. Utgifter direkt kopplade till uthyrningen får dras av, men inte vanliga ägarkostnader." },
    { label: "Skatt på inkomsten", DK: "Med grundavdragsmetoden beskattas 60 % av inkomsten över avdraget som personlig inkomst. 60 % är inte skattesatsen. Reglerna gäller inte exempelvis verktyg.", SE: "Överskottet beskattas normalt med 30 % som kapitalinkomst. Omfattande uthyrning kan vara näringsverksamhet." },
    { label: "Moms", DK: "Momspliktig omsättning över 50 000 DKK per kalenderår kräver som huvudregel momsregistrering. Gränsen gäller omsättning, inte vinst.", SE: "Kontinuerlig ekonomisk verksamhet kan vara momspliktig. Befrielse kan gälla vid högst 120 000 SEK i årligt beskattningsunderlag under innevarande och vart och ett av de två föregående kalenderåren, med övriga villkor." },
  ],
};
