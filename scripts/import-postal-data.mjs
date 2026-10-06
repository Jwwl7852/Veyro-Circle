// Converts official GeoNames tab-delimited exports into compact country/postcode/place tuples.
// Usage: node scripts/import-postal-data.mjs /absolute/path/to/extracted-exports
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const directory = process.argv[2];
if (!directory) throw new Error("An extracted GeoNames directory is required");
const records = [];
const seen = new Set();
for (const country of ["DK", "SE"]) {
  for (const line of readFileSync(resolve(directory, country + ".txt"), "utf8").trim().split("\n")) {
    const f = line.split("\t");
    const lat = Number(f[9]), lon = Number(f[10]);
    if (!f[9] || !f[10] || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const key = [f[0], f[1], f[2]].join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    records.push([f[0], f[1], f[2], lat, lon]);
  }
}
mkdirSync("data", { recursive: true });
writeFileSync("data/postal-places.json", JSON.stringify(records));
console.log(JSON.stringify({ DK: records.filter(x=>x[0]==="DK").length, SE: records.filter(x=>x[0]==="SE").length }));
