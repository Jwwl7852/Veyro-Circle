import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  plugins:[{name:"test-only-loan-export",transform(code,id){if(id === path.join(root,"app/page.tsx")) return code + "\nexport { RequestsView, DepositSummary, SignatureBox };";}}],
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

test("owner deposit is displayed in both languages with no borrower input",async()=>{
  const {DepositSummary}=await vite.ssrLoadModule("/app/page.tsx");
  for(const [lang,country,label,currency] of [["da","DK","Depositum fastsat af ejeren","DKK"],["sv","SE","Deposition bestämd av ägaren","SEK"]]) {
    const html=renderToStaticMarkup(React.createElement(DepositSummary,{amount:25050,country,lang,explain:true}));
    assert.ok(html.includes(label));assert.ok(html.includes(currency));assert.match(html,/250,50/);assert.doesNotMatch(html,/<input/);
  }
  const page=await readFile(path.join(root,"app/page.tsx"),"utf8");
  const request=page.slice(page.indexOf('<Dialog open={showRequest}'),page.indexOf('<Dialog open={notificationsOpen}'));
  assert.match(request,/<DepositSummary/);assert.doesNotMatch(request,/setDeposit|depositInput|newDepositInput/);
  assert.match(page,/open=\{!!selected && !showRequest\}/);
});
test("signing controls show actionable reasons rather than silently waiting for own signature",async()=>{
  const {SignatureBox}=await vite.ssrLoadModule("/app/page.tsx");
  const html=renderToStaticMarkup(React.createElement(SignatureBox,{title:"Ejer",name:"Owner",lang:"da",canSign:false,waitingReason:"Gem noten først",onSign(){}}));
  assert.match(html,/Gem noten først/);assert.doesNotMatch(html,/Afventer denne parts/);
  const ready=renderToStaticMarkup(React.createElement(SignatureBox,{title:"Ejer",name:"Owner",lang:"da",canSign:true,onSign(){}}));
  assert.match(ready,/<canvas/);assert.match(ready,/Godkend underskrift/);
});
test("tablet layout uses responsive columns without global zoom and caps listing images",async()=>{
  const css=await readFile(path.join(root,"app/globals.css"),"utf8");
  assert.doesNotMatch(css,/zoom:\s*\.8|width:\s*125%/);
  assert.match(css,/@media \(min-width:900px\) and \(max-width:1199px\)/);
  assert.match(css,/@media \(min-width:640px\) and \(max-width:899px\)/);
  assert.match(css,/\.listing-detail-gallery \{[^}]*grid-template-rows:minmax\(0,1fr\)[^}]*height:clamp\(100px,25dvh,220px\)[^}]*overflow:hidden/);
  assert.match(css,/\.listing-detail-gallery img \{[^}]*object-fit:contain/);
  assert.match(css,/\.auth-card input \{[^}]*font-size:16px/);
});

test("private photo controls are translated, camera-ready and do not expand the paper agreement",async()=>{
  const {AgreementPhotos}=await vite.ssrLoadModule("/components/agreement-photos.tsx");
  const common={id:"VC-2099-ABCDEF123456",phase:"handover",uid:"borrower",photos:[],editable:true,locked:false,busy:false,onBusy(){},onChange(){},reviewed:false,onReview(){}};
  for (const [lang,choose] of [["da","Vælg billede"],["sv","Välj bild"]]) {
    const html=renderToStaticMarkup(React.createElement(AgreementPhotos,{...common,lang}));
    assert.ok(html.includes(choose));assert.match(html,/capture="environment"/);assert.match(html,/class="no-print"/);
    const saved=renderToStaticMarkup(React.createElement(AgreementPhotos,{...common,lang,locked:true,photos:[{id:"uuid",bytes:1024,width:100,height:100}]}));
    assert.match(saved,/evidence-print-reference/);assert.match(saved,/type="checkbox" disabled=""/);
    assert.doesNotMatch(saved,/capture="environment"/);
  }
  const css=await readFile(path.join(root,"app/globals.css"),"utf8");
  assert.match(css,/\.evidence-actions button[^}]*min-height:44px/);
  assert.match(css,/@media\(max-width:480px\) \{ \.evidence-grid \{ grid-template-columns:minmax\(0,1fr\)/);
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the catalog's animation and scrolling utilities", async () => {
  const css = await readCssTree(path.join(root, "dist"));

  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /scroll-fade-reveal-b/);
  assert.match(css, /mask-image:/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("keeps the application width stable and prints agreements as A4", async () => {
  const css = await readFile(path.join(root, "app", "globals.css"), "utf8");
  assert.match(css, /html\s*\{\s*scrollbar-gutter:stable/);
  assert.match(css, /html,body\s*\{[^}]*overflow-x:clip/);
  assert.match(css, /\.profile-head\s*\{[^}]*display:grid[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\[data-slot="dialog-content"\][^{]*\{[^}]*max-height:calc\(100dvh - 1rem\)/);
  assert.match(css, /\.mobile-nav-item\s*\{[^}]*min-width:0[^}]*flex:1/);
  assert.match(css, /@page\s*\{\s*size:A4 portrait/);
  assert.match(css, /\.agreement-dialog\s*\{[^}]*position:absolute!important/);
  assert.match(css, /\.print-agreement\s*\{[^}]*position:static!important/);
});

test("agreement offers separate account storage and a standalone print document", async () => {
  const page = await readFile(path.join(root, "app", "page.tsx"), "utf8");
  assert.match(page, /Gem på min konto/);
  assert.match(page, /Udskriv aftalen/);
  assert.match(page, /function printAgreementDocument/);
  assert.match(page, /document\.createElement\("iframe"\)/);
  assert.match(page, /printWindow\.print\(\)/);
  assert.match(page, /12 måneder/);
  assert.match(page, /crypto\.randomUUID\(\)/);
  assert.match(page, /Ticket:/);
  assert.match(page, /formatAgreementDate/);
  assert.match(page, /Returkvittering/);
  assert.match(page, /Tilbageleveret i god stand/);
  assert.match(page, /borrowerReturnSignature/);
  assert.match(page, /lenderReturnSignature/);
  assert.match(page, /Tilstandsnote ved udlevering/);
  assert.match(page, /Tilstandsnote ved tilbagelevering/);
  assert.match(page, /Noten er låst/);
  assert.match(page, /Tilbageleveret med bemærkninger/);
});

test("map has dedicated desktop and mobile navigation and starts at own postcode", async () => {
  const page = await readFile(path.join(root, "app", "page.tsx"), "utf8");
  const map = await readFile(path.join(root, "components", "community-map.tsx"), "utf8");
  assert.match(page, /setRadius\("100"\)/);
  assert.match(page, /tab === "map" &&/);
  assert.match(page, /<SideNav icon=\{MapIcon\}/);
  assert.match(page, /<MobileNav icon=\{MapIcon\}/);
  assert.match(page, /<CommunityMap origin=\{profile.place\} radiusKm=\{100\}/);
  assert.doesNotMatch(page.slice(page.indexOf('{tab === "home" &&'),page.indexOf('{tab === "map" &&')), /<CommunityMap/);
  assert.match(map, /tile\.openstreetmap\.org/);
  assert.match(map, /bindMapWheel/);
  assert.doesNotMatch(map, /onWheel=/);
  assert.match(map, /Navne, adresser og telefonnumre vises ikke/);
  assert.match(map, /community-cluster/);
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("emits chart themes for the starter's media dark mode", async () => {
  const { ChartStyle } = await vite.ssrLoadModule("/components/ui/chart.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ChartStyle, {
      id: "contract",
      config: {
        latency: { theme: { light: "#ffffff", dark: "#000000" } },
      },
    }),
  );

  assert.match(html, /\[data-chart=contract\]/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /\.dark/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await vite.ssrLoadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});

test("loan overview renders owner actions, borrower next steps and translated archive",async()=>{
  const {RequestsView}=await vite.ssrLoadModule("/app/page.tsx");
  const loan={id:"VC-2099-TEST123456",borrowerUid:"borrower",lenderUid:"owner",from:"2099-04-10",to:"2099-04-12",days:3,total:0,message:"",requestStatus:"requested",borrower:{name:"Borrower"},item:{name:"Trailer",owner:"Owner",country:"DK",icon:"span"}};
  const props={t:{requests:"Mine lån",free:"Gratis",chat:"Skriv besked"},loans:[loan],lang:"da",userUid:"owner",direction:"lender",archive:false,setDirection(){},setArchive(){},onChat(){},onAgreement(){},onDecision(){},loading:false,loadError:false};
  const owner=renderToStaticMarkup(React.createElement(RequestsView,props));
  assert.match(owner,/Godkend forespørgsel/);assert.match(owner,/Afvis/);assert.match(owner,/VC-2099-TEST123456/);assert.match(owner,/Trailer/);
  const borrower=renderToStaticMarkup(React.createElement(RequestsView,{...props,userUid:"borrower",direction:"borrower"}));
  assert.doesNotMatch(borrower,/Godkend forespørgsel/);assert.match(borrower,/Afventer ejerens svar/);
  const accepted=renderToStaticMarkup(React.createElement(RequestsView,{...props,userUid:"borrower",direction:"borrower",loans:[{...loan,requestStatus:"accepted"}]}));
  assert.match(accepted,/Underskriv ved udlevering/);
  const archive=renderToStaticMarkup(React.createElement(RequestsView,{...props,lang:"sv",archive:true,loans:[{...loan,requestStatus:"declined"}]}));
  assert.match(archive,/Avböjd/);assert.match(archive,/Visa sparat avtal/);assert.doesNotMatch(archive,/Godkänn förfrågan/);
});

test("new loan and notification controls have mobile sizing and focus styling",async()=>{
  const css=await readFile(path.join(root,"app/globals.css"),"utf8");
  assert.match(css,/\.loan-actions button\s*\{[^}]*min-height:44px/);
  assert.match(css,/\.loan-filters button\s*\{[^}]*min-height:44px/);
  assert.match(css,/\.notification-entry[^}]*overflow-wrap:anywhere/);
  assert.match(css,/\.loan-filters button:focus-visible/);
});

test("map and loans omit visible page titles but retain accessible headings",async()=>{
  const page=await readFile(path.join(root,"app/page.tsx"),"utf8");
  const map=page.slice(page.indexOf('{tab === "map" &&'),page.indexOf('{tab === "map" &&')+1000);
  assert.match(map,/<h1 className="sr-only">\{lang === "da" \? "Kort" : "Karta"\}<\/h1>/);
  assert.doesNotMatch(map,/<header>|className="page-title"|className="eyebrow"/);
  const {RequestsView}=await vite.ssrLoadModule("/app/page.tsx");
  for (const [lang,title,refresh] of [["da","Mine lån","Opdatér"],["sv","Mina lån","Uppdatera"]]) {
    const html=renderToStaticMarkup(React.createElement(RequestsView,{
      t:{requests:title},loans:[],lang,userUid:"viewer",loading:false,loadError:false,
      direction:"borrower",archive:false,setDirection(){},setArchive(){},onChat(){},onAgreement(){},onDecision(){},
    }));
    assert.ok(html.includes(`<h1 class="sr-only">${title}</h1>`));
    assert.doesNotMatch(html,/Veyro Circle|class="page-title"|class="eyebrow"/);
    assert.ok(html.includes(refresh));
    assert.match(html,/class="loan-filters loan-direction"/);
    assert.match(html,/class="loan-toolbar"/);
    assert.match(html,/class="loan-search"/);
    assert.match(html,/type="search"/);
    assert.match(html,/class="loan-retention"/);
  }
});

test("agreement journey is accessible, translated and excluded from the print document",async()=>{
  const {AgreementJourney}=await vite.ssrLoadModule("/components/agreement-journey.tsx");
  const agreement={id:"test",borrowerUid:"borrower",lenderUid:"lender",from:"2026-10-08",to:"2026-10-09",requestStatus:"accepted"};
  for(const lang of ["da","sv"]) {
    const html=renderToStaticMarkup(React.createElement(AgreementJourney,{agreement,uid:"borrower",lang,names:{borrower:"Jørn",lender:"Mikkel"},onContinue(){}}));
    assert.match(html,/aria-current="step"/);assert.equal((html.match(/<li /g)||[]).length,4);
    assert.match(html,/agreement-journey no-print/);
    assert.ok(html.includes(lang === "da" ? "Gå til udlevering" : "Gå till utlämning"));
  }
  const page=await readFile(path.join(root,"app/page.tsx"),"utf8");
  assert.match(page,/<AgreementJourney[\s\S]*?<div className="print-agreement">/);
  assert.match(page,/Ejeren skal først godkende forespørgslen\. Derefter kan I gemme noten/);
  const css=await readFile(path.join(root,"app/globals.css"),"utf8");
  assert.match(css,/@media\(max-width:480px\) \{ \.journey-steps \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
