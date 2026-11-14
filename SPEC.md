# SPEC — next iteration: global, dynamic crop-rotation advice

> **Status, 14 Nov evening:** T1, T2 and T6 are done, and the app is live-only: the Lopburi demo data, the k-means layers and `pipeline/` were removed. The satellite layer panel (NASA GIBS + SoilGrids) and the 60 m slope grid are in. **Next: T3, then T4.** Where the text below mentions the demo area or `site.json`, ignore it.

## Goal

The user clicks anywhere on Earth, or draws their field. The app then:

1. pulls NASA climate (25-year baseline + the last 90 days), soil and slope live;
2. screens candidate crops against that climate with ECOCROP;
3. builds several rotation strategies automatically: the current one plus adapted ones;
4. scores and explains them, including how robust each one is under drier or hotter scenarios.

The east Lopburi demo stays as the default view and as the offline fallback.

The challenge asks for **rotation strategies**, not single crops. A recommendation reads like this:
"you grow X; add Y in the idle window Mar–May because …; it stays better than your current plan even with 20 % less rain."

## Current state (already done, keep working)

- Demo-area map with 4 layers, all precomputed in `data/site.json`:
  - k-means cropping pattern
  - rule-based pattern
  - erosion risk (slope × Mar–May NDVI cover)
  - per-cell recommendation
- 5 rotations, **hard-coded** in `app.js` (`R`), scored by MCDA:
  - **water:** mean deficit, or P80 deficit when there is no irrigation
  - **soil:** organic matter, N, erosion and infiltration; organic matter is weighted up when soil OM is low; pH penalty
  - **pest:** plant-family count
  - **heat:** days ≥ 35 °C × crop sensitivity
  - **income:** user-set
- Constraints: irrigation and machinery checkboxes. Scenario sliders: rain ±30 %, +0–2 °C.
- Charts and sections: climate climatology, 3-year NDVI series, 25-year trends (Mann-Kendall / Sen's slope), SI comparison (k-means vs rules), soil tiles, methods, glossary.
- The cards already have all five required fields plus forage.

## Tasks, in priority order

Each task is done when its acceptance criteria pass. If time runs short, cut from the bottom (T7 and T8 first).

### T1 — Live site mode (click anywhere)

1. A map click outside the demo grid (or a "Analyse this point" button) starts a live load. The demo grid stays clickable as before.
2. Fetch in parallel:
   - POWER daily 2001-01-01 → 2025-12-31
   - POWER recent: last 95 days ending 3 days ago
   - SoilGrids (5 depths)
   - terrain tiles at zoom 12 around the point
3. Build a `site` object with the **same shape as `site.json`** so the existing model runs unchanged. Port these Python functions from `pipeline/build_site.py`:
   - `clim`, `annual`, `yearly` — port `climate()`, including Hargreaves ET₀ and the hot-day count
   - `soil` — port `soil_props()`, including Saxton & Rawls PAW and `deepStore`
   - slope — mean, median and max within ~250 m of the point
   - `kmeans`, `rules`, `grid` — absent in live mode; hide the layers that need them
4. Show a loading state per source, a "Live data · fetched <date>" badge, and a per-source error message. Fall back to the demo area if POWER fails.
5. Cache results in memory by lat/lon rounded to 0.01°.
6. Use `location.hash` = `#p=<lat>,<lon>` so a site can be shared and reloaded.

**Acceptance:**

- Clicking Lopburi, Punjab (30.9, 75.85), central Kenya (−0.3, 36.07) and Pampas (−31.2, −60.5) each finishes in < 10 s, with no console errors.
- Rain and ET₀ climatology look plausible for each place.

### T2 — "Live now" panel

- The last 90 days of rain and mean Tmax vs the same calendar window in 2001–2025, as % of normal plus a one-line plain-language note.
- Label it "NASA POWER, ~1–3 day latency". It is not a forecast.

### T3 — ECOCROP screening

**Data**

> **Already started:** `data/crops.json` exists with 38 crops taken from the ECOCROP table in Recocrop (`ecocrop.rds`), plus our role tags (`roles`, `om`, `n`, `deep`, `income`). `data/site.json` also has `tmean` / `tmin` monthly arrays for temperature screening. Check the fields, then add `kc`, `heatSens`, `machine` / `labor`, `forage` and the family names in the format below, and verify the Recocrop/ECOCROP licence before publishing.

- Build `data/crops.json` (~40–60 crops useful in rotations) from the ECOCROP parameters in the R package **Recocrop** (`ecocropPars`).
- Check the data licence and attribute FAO ECOCROP.
- Fields per crop:
  - names TH/EN, family
  - Tmin, Topmin, Topmax, Tmax (°C)
  - Rmin, Ropmin, Ropmax, Rmax (mm per growing cycle)
  - pH min / opt / max
  - cycle days min / max
  - kill temperature, if present
- Add our own tags: `roles` ∈ {nfix, cover, deep, drought, cash}, `kc` [ini, mid, end] (FAO-56 Table 12 where listed, otherwise by crop type), `heatSens` 0–1, `machine` / `labor` flags, `forage` text, and a market note placeholder.
- Keep the crops already used (maize, mung bean, sunn hemp, cassava, pigeon pea) and add common ones: sorghum, cowpea, peanut, soybean, sesame, rice, sugarcane, wheat, chickpea, lablab, velvet bean, millet …

**Algorithm**

For each crop and each start month: cycle length = mid of the cycle range, rounded to months. Over those months:

- temperature suitability: ECOCROP trapezoid on the monthly mean of (Tmax + Tmin) / 2;
- rainfall suitability: trapezoid on the summed rain of the cycle;
- pH suitability: trapezoid on soil pH.

Suitability = min of the three (0–1). A crop *fits a window* when suitability ≥ 0.5.

**UI**

A "Crops screened for this site" panel: a table of passed crops by role, plus a collapsible list of rejected crops with the limiting factor (e.g. "Soybean: Apr too hot (36 °C > Tmax 35)").

**Acceptance:**

- Lopburi passes mung bean, sunn hemp, cowpea and cassava. It rejects wheat for heat.
- Punjab passes wheat in the rabi season.
- Each rejection names its limiting factor.

### T4 — Current rotation input and automatic rotation builder

**Current rotation**

- The user picks the main crop and its months from a dropdown (common crops + "custom months").
- The default is a guess: in demo mode, from the cell's k-means class; in live mode, from T6 when it is done, otherwise from the climate wet season. Label the default as a guess.

**Builder**

- Idle windows = months not occupied by the current rotation.
- Generate:
  - (a) the current rotation;
  - (b) for each role (nfix, cover, deep, drought), current + the best-scoring screened crop of that role that fits an idle window;
  - (c) one "switch" plan that replaces the main crop with the best drought-tolerant screened crop.
- Rules:
  - never two consecutive crops of the same family;
  - a crop must fit inside its window (cycle ≤ window length);
  - drop duplicate plans;
  - output 3–6 plans.
- Plans use the same structure as `R` (`m`, `om`, `n`, `deep`, `income`, `machine`, `labor`). Derive `om` / `n` / `deep` from the crop roles with a small documented table.

**Card text**

Generate it from templates plus computed numbers, bilingual:

- **why:** role + idle window + climate fit
- **evidence:** suitability, mm, days ≥ 35 °C, dry-year deficit, sources
- **benefits:** from the roles
- **gaps:** local variety, market, field soil test, plus anything not measured
- **risks:** the limiting factor nearest its threshold, labour / machinery, pests

**Acceptance:**

- The demo site produces plans comparable to today's A–E.
- A Punjab click produces a rice–wheat baseline plus at least two legume or cover alternatives.
- No plan breaks the rules above.

### T5 — Polygon drawing

1. Add Leaflet-Geoman (or Leaflet.draw) and Turf.js from cdnjs, with exact versions. Make sure drawing works on touch.
2. Polygon gives:
   - area (rai + ha);
   - centroid → used for climate and soil;
   - slope mean / max inside the polygon (sample the terrain tiles at the DEM resolution);
   - in demo mode, the MODIS cells it overlaps, area-weighted.
3. Area < 6.25 ha (one MODIS pixel) → show the warning "field smaller than satellite pixel; NDVI includes surroundings" and draw the overlapping pixel outlines.
4. Max 25 km². Larger polygons are refused with a message.
5. Export / import GeoJSON (download through a Blob link is fine on GitHub Pages). The hash stores the polygon centroid; storing the full polygon is optional.
6. Volume results: water need in m³ = mm × area.

**Acceptance:**

- Drawing a ~10-rai field in the demo area shows the area, slope stats, the small-field warning and the cards.
- The drawing can be deleted and redrawn.

### T6 — NDVI at the clicked point (live, async)

- After T1 finishes, fetch MOD13Q1 NDVI + pixel_reliability for the last 23 composites at 1 pixel. That is 3 requests; show a progress bar of about 1–1.5 min.
- Mask, interpolate and smooth as in `build_site.py`. Classify with the same rules as `rule_class()`.
- Use the result to suggest the current-rotation type (T4) and to show the lowest-cover months. If it fails, nothing breaks.

### T7 — Mobile map/results toggle

A floating button at ≤ 640 px switches between the map view and the results view, like OpenET FARMS.

### T8 — README and methods updates

Document T1–T6 in the Methods table and in `README.md`:

- ECOCROP and its citation
- the rotation builder rules
- the live-data latency
- the polygon limits

## Non-goals (this round)

- No backend, no accounts, no AppEEARS / Earthdata-login data.
- No weather forecast.
- No yield prediction.

## Test checklist (run before each commit)

- `python build.py` → open `http://localhost:8000` → no console errors.
- The demo loads in < 2 s with every layer working. The TH/EN toggle changes all text.
- Live clicks at the 4 test points (T1) work. A failed fetch shows a message and the demo still works.
- At a 400 px width, nothing scrolls sideways, and the map and cards are usable.
- Every card shows the 5 required fields, and its numbers change when the sliders move.
