import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
// Load the pure TypeScript module without starting a browser or development server.
const source = new URL("../lib/marketplace.ts", import.meta.url);
const compiled = ts.transpileModule(readFileSync(source, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const m = {};
new Function("require", "exports", compiled)(createRequire(source), m);
test("owner deposit accepts empty or zero and bounded decimal amounts",()=>{
  for(const input of ["","0","0,00"," 0.0 "]) assert.equal(m.parseDeposit(input),0);
  assert.equal(m.parseDeposit("250,50"),25050);assert.equal(m.parseDeposit("100000"),10000000);
  for(const input of ["-10","2.999","100001","NaN","1e4"]) assert.equal(m.parseDeposit(input),null);
});

test("nationwide postcode sources contain both countries and expected cities", () => {
  assert.ok(m.places.filter(p=>p.country === "DK").length > 1000);
  assert.ok(m.places.filter(p=>p.country === "SE").length > 18000);
  assert.equal(m.seedPlace("Malmö", "SE").city, "Malmö");
  assert.equal(m.seedPlace("Lund", "SE").city, "Lund");
  assert.equal(m.seedPlace("Ringsted", "DK").postcode, "4100");
});
test("postcode and city search accepts Danish/Swedish spelling and spacing", () => {
  assert.ok(m.searchPlaces("4174", "DK").some(p=>p.city.includes("Jystrup")));
  assert.ok(m.searchPlaces("malmo", "SE").some(p=>p.city === "Malmö"));
  assert.ok(m.searchPlaces("20001", "SE").some(p=>p.postcode === "200 01"));
  assert.ok(m.searchPlaces("Køge", "DK").every(p=>p.country === "DK"));
  assert.equal(m.searchPlaces("malmo", "DK").length, 0);
  assert.equal(m.searchPlaces("not-a-real-postal-place", "SE").length, 0);
});
test("great-circle radius changes with origin, including across the border", () => {
  const j = m.defaultPlace, r = m.seedPlace("Ringsted", "DK"), k = m.seedPlace("Køge", "DK"), mal = m.seedPlace("Malmö", "SE");
  assert.equal(m.distanceKm(j,j), 0);
  assert.ok(m.distanceKm(j,r) > 5 && m.distanceKm(j,r) < 10);
  assert.ok(m.distanceKm(j,k) > 10 && m.distanceKm(j,k) < 25);
  assert.ok(m.distanceKm(j,mal) > 50 && m.distanceKm(j,mal) < 100);
  assert.ok(Math.abs(m.distanceKm(j,mal) - m.distanceKm(mal,j)) < 1e-9);
  assert.equal([j,r,k,mal].filter(p=>m.distanceKm(j,p)<=10).length, 2);
  assert.equal([j,r,k,mal].filter(p=>m.distanceKm(mal,p)<=10).length, 1);
});
test("paid prices accept comma/decimal precision, reject zero, negatives and malformed amounts", () => {
  assert.equal(m.parseDailyPrice("50"), 5000);
  assert.equal(m.parseDailyPrice("12,50"), 1250);
  assert.equal(m.parseDailyPrice("12.50"), 1250);
  for (const value of ["", "0", "-5", "12.345", "NaN", "Infinity", "1e3", "100001"]) assert.equal(m.parseDailyPrice(value), null);
});
test("currency belongs to listing country independently of interface language", () => {
  assert.match(m.money(5000, "DK", "sv"), /DKK/);
  assert.match(m.money(7500, "SE", "da"), /SEK/);
});
test("rental period counts inclusive dates and handles invalid/DST/leap dates", () => {
  assert.equal(m.dayCount("2026-09-12","2026-09-12"), 1);
  assert.equal(m.dayCount("2026-09-12","2026-09-13"), 2);
  assert.equal(m.dayCount("2026-10-24","2026-10-26"), 3);
  assert.equal(m.dayCount("2028-02-28","2028-03-01"), 3);
  assert.equal(m.dayCount("2026-02-30","2026-03-01"), null);
  assert.equal(m.dayCount("2026-09-13","2026-09-12"), null);
  assert.equal(m.dayCount("",""), null);
  assert.equal(m.parseDailyPrice("50") * m.dayCount("2026-09-12","2026-09-14"), 15000);
});
test("registration requires name, phone, street/number and recognized postcode/city", () => {
  assert.equal(m.validProfile("Test Person", "Testvej 12", m.defaultPlace, "+45 12 34 56 78"), true);
  assert.equal(m.validProfile("", "Testvej 12", m.defaultPlace, "+45 12 34 56 78"), false);
  assert.equal(m.validProfile("Test Person", " ", m.defaultPlace, "+45 12 34 56 78"), false);
  assert.equal(m.validProfile("Test Person", "Testvej", m.defaultPlace, "+45 12 34 56 78"), false);
  assert.equal(m.validProfile("Test Person", "Testvej 12", null, "+45 12 34 56 78"), false);
  assert.equal(m.validProfile("Test Person", "Testvej 12", m.defaultPlace, "123"), false);
});
test("address check works for recognized Danish and Swedish postcodes", () => {
  const dk = m.seedPlace("Jystrup", "DK"), se = m.seedPlace("Malmö", "SE");
  assert.equal(m.validAddress("Skellet 8", dk), true);
  assert.equal(m.validAddress("Storgatan 12A", se), true);
  assert.equal(m.validAddress("Storgatan", se), false);
  assert.equal(m.validAddress("Skellet 8", {...dk, city:"Forkert by"}), false);
});
test("listing plans require Plus and never allow more than 20 active things", () => {
  assert.equal(m.FREE_LISTING_LIMIT, 0);
  assert.equal(m.PLUS_LISTING_LIMIT, 20);
  assert.equal(m.canCreateListing(0, "free"), false);
  assert.equal(m.canCreateListing(1, "free"), false);
  assert.equal(m.canCreateListing(19, "plus"), true);
  assert.equal(m.canCreateListing(20, "plus"), false);
});
