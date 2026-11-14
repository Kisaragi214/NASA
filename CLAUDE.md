# Field Shift Map — notes for Claude Code

NASA Space Apps Challenge 2026, challenge **"Field Shift: Adapting Farms with NASA Data"**.
**Deadline:** Sun 15 Nov 2026, 23:59 Asia/Bangkok. Aim to submit by 20:00.

The tool is a static web app: HTML/JS + Leaflet + Chart.js, hosted on GitHub Pages. It recommends **crop-rotation strategies** that improve soil health and stay robust under changing climate and water conditions. The full task list is in `SPEC.md`. Read it before changing code.

## Files

| File | Role |
|---|---|
| `index.src.html` | Page markup and CSS. **Edit this, not `index.html`.** Then run `python build.py`, which inlines `leaflet.min.css` and writes `index.html` (full doc) + `artifact.html` (no doc skeleton, used for Claude previews). |
| `app.js` | All logic: live data loading, model, scoring, map, charts, i18n. |
| `data/crops.json` | 38 crops from FAO ECOCROP (via Recocrop) with type and role tags. Used by the crop screening and the rotation builder. |
| `LICENSE` | MIT for the code. |
| `data/site.json`, `pipeline/` | Left over from the old precomputed demo. **Not used by the app.** |
| `manifest.webmanifest`, `README.md` | PWA manifest, public readme (data list, limitations, AI disclosure). |

There is **no precomputed site data**. The app starts at a default point and fetches everything live (`loadLive` → `applySite`, then `loadRecent` and `loadNdvi` in the background).

To run locally: `python -m http.server 8000`.

## Rules that must not break

- **NASA data is primary.** Other sources only fill gaps or validate: SoilGrids, ECOCROP, FAO-56, Esri/OSM base maps. Label every number with its source in the UI.
- **Every rotation card shows all of these** (the challenge requires them): **why suggested · evidence · benefits · information gaps · risks to check locally**. Also keep forage, confidence and tags.
- **Keep the banner:** "supports, does not replace farmers / local experts".
- **Bilingual TH/EN everywhere.**
  - Static text: paired `<span class="th">` / `<span class="en">`.
  - Dynamic text: `t(th, en)`, or `{th, en}` objects read through `L2()`.
- **Never present guessed or user-set values as measured.** Income is user-set. ECOCROP ranges are global and coarse. Say so in the cards.
- **Keep the uncertainty outputs:** dry-year (P80) water need, years short > 150 mm, confidence line.
- **Failure handling:** POWER is required (show the error + Retry). SoilGrids, slope and NDVI are optional: the page must still work without each, and say what is missing or assumed.
- **No build step or framework.** Libraries come from cdnjs only, pinned to exact versions. Keep the whole app static.

## Live APIs

All of these allow CORS from any origin. Times were measured on 14 Nov 2026 from a browser.

| API | Example | Time |
|---|---|---|
| NASA POWER daily point | `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR&community=AG&longitude=LON&latitude=LAT&start=20010101&end=20251231&format=JSON` | ~2 s for 25 years |
| NASA POWER recent | same, `start` = today − 95 d, `end` = today − 3 d | ~1 s |
| ORNL MODIS web service | `https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset?latitude=..&longitude=..&band=250m_16_days_NDVI&startDate=A2025001&endDate=A2025145&kmAboveBelow=0&kmLeftRight=0` | **~26 s per request** (max 10 dates/request). Send header `Accept: application/json`. Never fetch a whole area live. |
| SoilGrids 2.0 | `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=..&lat=..&property=phh2o&property=soc&property=clay&property=sand&depth=0-5cm&depth=5-15cm&depth=15-30cm&depth=30-60cm&depth=60-100cm&value=mean` | ~2 s; values are scaled by `d_factor` |
| Terrain tiles (SRTM-derived) | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, elevation = R·256 + G + B/256 − 32768 | fast; use `crossOrigin='anonymous'` + canvas |
| NASA GIBS (display only) | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg` | maxNativeZoom 9. HLS 30 m exists only in EPSG:4326, so link to Worldview instead. |

**NDVI source order (changed 14 Nov):** the ORNL service was failing from the browser, so `loadNdvi` first reads `MODIS_Terra_L3_NDVI_16Day` tiles from GIBS (`gibsNdvi`: level 9 PNG tiles + `https://gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_NDVI.xml`, decoded on a canvas; takes seconds; no quality band). ORNL is only the fallback.

**SoilGrids is often slow.** `loadLive` waits 5 s, then goes on with assumed soil and re-renders when the real answer arrives.

**Do not let an editor overwrite `app.js`.** A stale VS Code buffer has reverted it twice. Check `git status` and `git diff --stat` before committing.

## Current state (14 Nov, late)

Done: live global mode, last-90-days panel, ECOCROP screening (38 crops, 8 types, one colour per type), rotation builder + user-made rotations, comparison table, k-means vs rules on live NDVI, 30 m image grid, dark/light toggle, mobile toggle. Automated tests use mocked APIs only.

Open: field polygon (T5 in `SPEC.md`), validation of the pattern classes, English project page, 30-second video.

SMAP, GPM IMERG and GRACE-FO need an Earthdata login. They are out of scope unless the team adds credentials.
