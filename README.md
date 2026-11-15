# Field Shift Map

Crop-rotation decision support built on NASA Earth observations.
NASA Space Apps Challenge 2026 · Challenge: *Field Shift: Adapting Farms with NASA Data*

**Live site:** https://kisaragi214.github.io/NASA/

Click any point on Earth. Field Shift Map reads the climate, vegetation, slope and soil there, works out which crops fit, builds several rotation options around the crop grown now, and compares them by:

- **soil health:** organic matter, nitrogen, erosion control, infiltration, pH
- **water need:** in an average year and in a 1-in-5 dry year
- **heat risk**
- **pest-cycle break**
- **income:** set by the user

The user sets their own priorities and farm constraints, and can add their own rotations to the comparison. Every recommendation lists its reason, evidence, benefits, information gaps and risks to check locally.

> This tool supports, and does not replace, the judgment of farmers and local agricultural experts.

## How it works

1. **Climate.** 25 years of daily NASA POWER data give monthly rain, reference evapotranspiration (FAO-56 Penman-Monteith from POWER sunshine, humidity and wind; Hargreaves on days with missing data) and hot days. The last 90 days are compared with the same window in 2001–2025.
2. **Crop screening.** 38 crops in 8 types are checked against the site: monthly temperature, rain over the growing cycle, and soil pH, each as an ECOCROP tolerance range. The fit is the lowest of the three; a crop passes at 50 % or more.
3. **Rotation builder.** The current crop is chosen by the user (or guessed from climate and labelled as a guess). The tool finds the idle months and adds a passing crop for each role (nitrogen-fixing, cover, deep-rooted, drought-tolerant) from a different plant family, plus options that switch the main crop. Users can add up to four rotations of their own.
4. **Scoring.** Each rotation gets a water balance over all 25 years (average and 1-in-5 dry year), heat exposure, rain falling on bare soil, soil-health and pest-break scores. Sliders set the weights; scenario sliders change rain (±30 %) and temperature (+0–2 °C).
5. **Vegetation pattern.** One year of MODIS NDVI around the point is classified twice, by fixed phenology rules and by k-means clustering, and the two results are compared.
6. **Map.** Slope, erosion risk, the vegetation patterns and the best rotation per cell are drawn on one 30 m grid (133 × 133 cells, about 4 km across). Coarser data is resampled onto that grid; it does not become more detailed.

## Data

Nothing is precomputed. Every site is fetched live in the browser.

| Role | Dataset | Access |
|---|---|---|
| Climate 2001–2025 and the last 90 days | **NASA POWER** daily (T2M_MAX, T2M_MIN, PRECTOTCORR, ALLSKY_SFC_SW_DWN, RH2M, WS2M) | POWER API |
| Vegetation around the point, last year | **MODIS Terra 16-day NDVI, 250 m** (MOD13Q1) | **NASA GIBS** image tiles, decoded with the layer's own colour map. Fallback: ORNL DAAC MODIS Web Service (true values + pixel reliability) |
| Slope, 30 m grid | SRTM-derived elevation (AWS Terrain Tiles) | public tiles |
| Map layers by date | **NASA GIBS**: MODIS true colour, NDVI, land surface temperature, SMAP root-zone soil moisture, GPM IMERG rain, VIIRS fires | GIBS WMTS / WMS |
| Crop tolerance ranges (supplementary) | **FAO ECOCROP**, parameters as distributed in the R package Recocrop (R. J. Hijmans) | `data/crops.json` |
| Soil (supplementary) | SoilGrids 2.0 (ISRIC) | REST API + WMS |
| Base map (display only) | Esri World Imagery, OpenStreetMap | tiles |

Methods: reference evapotranspiration and crop coefficients follow FAO-56 (Allen et al. 1998). Frost risk compares the coldest night of each month with the ECOCROP killing temperature. Plant-available water uses Saxton & Rawls (2006). The slope factor is the RUSLE S factor (McCool et al.). Trends use Mann-Kendall with Sen's slope.

## Run locally

```bash
python -m http.server 8000          # open http://localhost:8000
```

`index.html` is generated from `index.src.html` by `python build.py`, which inlines the Leaflet CSS and stamps a version on `app.js`. Edit `index.src.html`, not `index.html`.

## Limitations

- **Resolution.** Climate (POWER) is about 50 km and soil (SoilGrids) is 250 m, so one value covers the whole grid. Cells differ only by slope and by the 250 m vegetation pixel they fall in.
- **NDVI from image tiles.** Values are read from the GIBS colour scale (about ±0.01) and have no per-pixel quality flags; sudden dips are removed instead. Small fields are mixed with their neighbours inside a 250 m pixel.
- **Pattern classes are not validated.** The rule classes and k-means groups describe greenness through the year, not crop names, and have not been checked in the field.
- **ECOCROP ranges are broad.** They are global and not variety-specific. Rain limits are scaled to the cycle length, which is our assumption. Screening says nothing about markets, pests, disease or local varieties.
- **Rule-based scores.** Soil-role scores (organic matter, nitrogen, deep roots) come from a small table by crop role, not from measurements. Income is set by the user.
- **Latency.** POWER is 1–3 days behind real time. Nothing here is a forecast.
- **Services can fail.** POWER is required. If SoilGrids, slope or NDVI do not answer, the page still works and says what is missing or assumed.
- **Testing.** Automated tests run against mocked API responses; live checks were done by hand at a small number of points.

## Future work

- Draw a field polygon (area, slope inside the field, water volume).
- Validate the pattern classes against field or high-resolution imagery.
- HLS 30 m vegetation for field-level patterns, and SMAP / GPM IMERG values in the scoring (they are map layers only for now). Both need an Earthdata login and a small backend.
- Plug in higher-resolution national data where it exists (e.g. US CDL, SSURGO, OpenET; Thai LDD soil series).

## Licence

Code: MIT, see `LICENSE`. `data/crops.json` is derived from FAO ECOCROP via the Recocrop package and stays under the terms of those sources. NASA data is open; other datasets keep their own terms (SoilGrids CC BY 4.0, OpenStreetMap ODbL, Esri imagery for display only).

## AI disclosure

This project was built with an AI assistant (Claude, by Anthropic). The AI was used for:

- writing most of the JavaScript, HTML and CSS, and the automated tests
- checking which NASA services can be read from a browser, and writing the code that reads them
- preparing `data/crops.json` from the ECOCROP parameters
- drafting text in the app and in this README

The team chose the challenge approach and the data sources, made the design decisions (GIS layout, live data only, rotations built from crop screening), tested the live site and is responsible for all content. No AI-generated images, video or audio are used.
