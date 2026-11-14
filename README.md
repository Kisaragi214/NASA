# Field Shift Map

Crop-rotation decision support built on NASA Earth observations.
NASA Space Apps Challenge 2026 · Challenge: *Field Shift: Adapting Farms with NASA Data*

Field Shift Map compares crop-rotation options for a farm area by:

- **soil health:** organic matter, nitrogen, erosion control, infiltration, pH
- **water need:** in an average year and in a 1-in-5 dry year
- **heat risk**
- **pest-cycle break**
- **income:** set by the user

The user sets their own priorities and farm constraints. It works for any point on Earth: it reads the last year of MODIS NDVI at the point, maps slope and erosion risk on a 60 m grid, and compares the last 90 days of weather with the 25-year normal. Every recommendation lists its reason, evidence, benefits, information gaps and risks to check locally.

> This tool supports, and does not replace, the judgment of farmers and local agricultural experts.

## Data

Nothing is precomputed. Every site is fetched live in the browser when the user clicks the map, types coordinates or uses their location.

| Role | Dataset | Access |
|---|---|---|
| Climate 2001–2025 and the last 90 days | **NASA POWER** daily (T2M_MAX, T2M_MIN, PRECTOTCORR) | POWER API |
| Vegetation at the point, last year | **MODIS MOD13Q1** NDVI 250 m + pixel reliability | ORNL DAAC MODIS Web Service |
| Slope, 60 m grid around the point | SRTM-derived elevation (AWS Terrain Tiles) | public tiles |
| Map layers by date | **NASA GIBS**: MODIS true colour, NDVI, land surface temperature, SMAP root-zone soil moisture, GPM IMERG rain, VIIRS fires | GIBS WMTS / WMS |
| Soil (supplementary) | SoilGrids 2.0 (ISRIC) | REST API + WMS |
| Base map (display only) | Esri World Imagery, OpenStreetMap | tiles |

Crop coefficients follow FAO-56 (Table 12). Plant-available water uses Saxton & Rawls (2006).

## Run locally

```bash
python -m http.server 8000          # open http://localhost:8000
```

`index.html` is generated from `index.src.html` by `python build.py`, which inlines the Leaflet CSS.

## Deploy

Push to GitHub, then **Settings → Pages → Deploy from branch** (`main`, root). The site is static.

## Limitations

- Climate (POWER) is ~50 km and soil is 250 m, so one value covers the whole 60 m grid. Cells differ only by slope.
- NDVI is one 250 m MODIS pixel. Small fields are mixed with their neighbours, and the pattern class is a simple rule that has not been checked in the field.
- The ORNL MODIS service is slow (about a minute). The rest of the page works while it loads.
- The five rotations are a starter set for tropical field crops. They are not yet screened per location (planned: ECOCROP screening, `data/crops.json`).
- Income and the soil-role scores are user-set or rule-based, not measured.
- GIBS layer colours in the legend are approximate.

## Future work

- Screen crops per location with ECOCROP and build rotations automatically.
- Draw a field polygon.
- SMAP and GPM IMERG values in the scoring (they are map layers only for now).
- Plug in higher-resolution national data where it exists (e.g. US CDL, SSURGO, OpenET).

## AI disclosure

Parts of this project were developed with an AI assistant (Claude, by Anthropic):

- data retrieval scripts
- the classification and scoring code
- the web interface
- draft text

The team reviewed, tested and is responsible for all content. *(Edit this section to describe exactly how your team used AI.)*
