# Field Shift Map

Crop-rotation decision support built on NASA Earth observations.
NASA Space Apps Challenge 2026 · Challenge: *Field Shift: Adapting Farms with NASA Data*

Field Shift Map compares crop-rotation options for a farm area by:

- **soil health:** organic matter, nitrogen, erosion control, infiltration, pH
- **water need:** in an average year and in a 1-in-5 dry year
- **heat risk**
- **pest-cycle break**
- **income:** set by the user

The user sets their own priorities and farm constraints. It maps current cropping patterns (k-means and rule-based phenology on MODIS NDVI) and erosion risk (SRTM slope × MODIS ground cover). Every recommendation lists its reason, evidence, benefits, information gaps and risks to check locally.

> This tool supports, and does not replace, the judgment of farmers and local agricultural experts.

## Data

| Role | Dataset | Access |
|---|---|---|
| Climate 2001–2025 | **NASA POWER** daily (T2M_MAX, T2M_MIN, PRECTOTCORR) | POWER API |
| Vegetation / cropping pattern | **MODIS MOD13Q1** NDVI 250 m + pixel reliability | ORNL DAAC MODIS Web Service |
| Land cover | **MODIS MCD12Q1** LC_Type1 | ORNL DAAC MODIS Web Service |
| Terrain | SRTM-derived elevation (AWS Terrain Tiles) | public tiles |
| Imagery (display only) | **NASA GIBS** MODIS Terra true colour; HLS 30 m via Worldview link | GIBS WMTS |
| Soil (supplementary) | SoilGrids 2.0 (ISRIC) | REST API |
| Base map (display only) | Esri World Imagery, OpenStreetMap | tiles |

Crop coefficients follow FAO-56 (Table 12). Plant-available water uses Saxton & Rawls (2006).

## Run locally

```bash
# 1) data (several minutes; the ORNL service is slow)
cd pipeline
pip install requests numpy pillow scikit-learn
python fetch_data.py --lat 15.18 --lon 101.13 --km 4 --years 2022 2024
python build_site.py --k 6          # writes ../data/site.json

# 2) web app
cd ..
python -m http.server 8000          # open http://localhost:8000
```

`index.html` is generated from `index.src.html` by `python build.py`, which inlines the Leaflet CSS.

## Deploy

Push the repository to GitHub, then go to **Settings → Pages** and choose **Deploy from branch** (`main`, root). The site is static.

## Limitations

- Climate (POWER) is ~50 km and soil is a single point. Within the 8×8 km demo, cells differ only by slope and ground cover.
- At 250 m, MODIS never shows fully bare soil (NDVI < 0.3). Small fields may be bare but get averaged with their neighbours. HLS 30 m can confirm this.
- Cluster names are interpreted from NDVI curves and have not been verified with field data.
- Income and some soil-role scores are user-set or rule-based, not measured.
- k-means uses random initialisation, so cluster numbering can change between runs.

## Future work

- SMAP / SMAP L4 root-zone moisture and GPM IMERG rainfall (Earthdata login), and GRACE-FO water storage trends.
- Click-anywhere mode: live POWER + MODIS queries for any location.
- Plug in higher-resolution national data where it exists (e.g. US CDL, SSURGO, OpenET; Thai LDD soil series).
- HLS 30 m classification for field-level patterns.

## AI disclosure

Parts of this project were developed with an AI assistant (Claude, by Anthropic):

- data retrieval scripts
- the classification and scoring code
- the web interface
- draft text

The team reviewed, tested and is responsible for all content. *(Edit this section to describe exactly how your team used AI.)*
