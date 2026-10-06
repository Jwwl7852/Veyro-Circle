# Location data

Source: [GeoNames postal code exports](https://download.geonames.org/export/zip/), DK.zip and SE.zip, downloaded 5 September 2026.
License: [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
Converted into compact tuples by scripts/import-postal-data.mjs. Missing coordinates and duplicate country/postcode/place records are excluded.

Coordinates describe approximate postal areas, not verified street addresses. Radius filtering uses great-circle distance between these points, not driving distance. Coverage and accuracy follow the source dataset.
No private street address is sent to GeoNames. The bundled location lookup requires no third-party account.
