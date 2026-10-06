import postalRecords from "../data/postal-places.json";
import type { TaxAcknowledgement } from "./tax-guidance";

export type Country = "DK" | "SE";
export type Lang = "da" | "sv";
export type ListingPlan = "free" | "plus";
export const FREE_LISTING_LIMIT = 1;
export const PLUS_LISTING_LIMIT = 20;
export function listingLimit(plan: ListingPlan) {
  return plan === "plus" ? PLUS_LISTING_LIMIT : FREE_LISTING_LIMIT;
}
export function canCreateListing(activeListings: number, plan: ListingPlan) {
  return activeListings < listingLimit(plan);
}
export type Place = { id: string; country: Country; postcode: string; city: string; lat: number; lon: number };
export type Profile = { name: string; email: string; street: string; place: Place; taxAcknowledgement?: TaxAcknowledgement };
export const places: Place[] = postalRecords.map((row, index) => ({
  id: String(index), country: row[0] as Country, postcode: String(row[1]),
  city: String(row[2]), lat: Number(row[3]), lon: Number(row[4]),
}));
export function normalizePlace(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/æ/g, "ae").replace(/ø/g, "o").replace(/[^a-z0-9]/g, "");
}
export function searchPlaces(query: string, country?: Country, limit = 40) {
  const q = normalizePlace(query);
  return places.filter(p => (!country || p.country === country) &&
    (!q || normalizePlace(p.city).includes(q) || normalizePlace(p.postcode).startsWith(q) || normalizePlace(p.postcode + p.city).includes(q))).slice(0, limit);
}
export function seedPlace(city: string, country: Country) {
  const p = places.find(p => p.country === country && normalizePlace(p.city) === normalizePlace(city)) ||
    places.find(p => p.country === country && normalizePlace(p.city).startsWith(normalizePlace(city)));
  if (!p) throw new Error("Missing demonstration place: " + city);
  return p;
}
export const defaultPlace = seedPlace("Jystrup", "DK");
export function distanceKm(a: Pick<Place, "lat" | "lon">, b: Pick<Place, "lat" | "lon">) {
  const rad = (degrees: number) => degrees * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}
export function parseDailyPrice(value: string): number | null {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const amount = Number(value.trim().replace(",", "."));
  return Number.isFinite(amount) && amount > 0 && amount <= 100000 ? Math.round(amount * 100) : null;
}
export function money(minorUnits: number, country: Country, lang: Lang) {
  return new Intl.NumberFormat(lang === "da" ? "da-DK" : "sv-SE", {
    style: "currency", currency: country === "DK" ? "DKK" : "SEK", currencyDisplay: "code",
    minimumFractionDigits: minorUnits % 100 ? 2 : 0, maximumFractionDigits: 2,
  }).format(minorUnits / 100);
}
export function dayCount(from: string, to: string): number | null {
  const dateValue = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const ms = Date.parse(value + "T00:00:00Z");
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) return NaN;
    return ms;
  };
  const start = dateValue(from), end = dateValue(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  // Inclusive calendar days: same day = 1; Monday–Tuesday = 2.
  return Math.round((end - start) / 86400000) + 1;
}
export function todayLocal() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}
export function validProfile(name: string, street: string, place: Place | null) {
  return name.trim().length >= 2 && name.trim().length <= 100 && street.trim().length >= 4 &&
    street.trim().length <= 200 && /\d/.test(street) && Boolean(place && places.some(p=>p.id === place.id));
}
