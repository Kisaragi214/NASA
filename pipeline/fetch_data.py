"""Download all inputs for one demo site and save them under pipeline/raw/.

Sources (no login needed):
  - NASA POWER daily point API (climate)
  - ORNL DAAC MODIS Web Service (MOD13Q1 NDVI + pixel reliability, MCD12Q1 land cover)
  - SoilGrids 2.0 REST API (supplementary soil)
  - AWS Terrain Tiles, terrarium encoding (SRTM-derived elevation in this region)

Usage:  python fetch_data.py --lat 15.18 --lon 101.13 --km 4 --years 2022 2024
The ORNL service is slow (~10 s per request); a full run takes several minutes.
"""
import argparse, io, json, math, pathlib, time
import requests

RAW = pathlib.Path(__file__).parent / "raw"
ORNL = "https://modis.ornl.gov/rst/api/v1/"
H = {"Accept": "application/json"}


def power(lat, lon):
    url = ("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR"
           f"&community=AG&longitude={lon}&latitude={lat}&start=20010101&end=20251231&format=JSON")
    return requests.get(url, timeout=120).json()


def modis_subset(product, band, lat, lon, km, dates):
    out = []
    for i in range(0, len(dates), 10):  # service limit: 10 dates per request
        ch = dates[i:i + 10]
        url = (f"{ORNL}{product}/subset?latitude={lat}&longitude={lon}&band={band}"
               f"&startDate={ch[0]}&endDate={ch[-1]}&kmAboveBelow={km}&kmLeftRight={km}")
        j = requests.get(url, headers=H, timeout=300).json()
        meta = {k: j[k] for k in ("nrows", "ncols", "cellsize", "xllcorner", "yllcorner")}
        out += [{"date": s["modis_date"], "data": s["data"]} for s in j["subset"]]
        time.sleep(0.5)
    return meta, out


def modis(lat, lon, km, y0, y1):
    dates = [d["modis_date"] for d in requests.get(f"{ORNL}MOD13Q1/dates?latitude={lat}&longitude={lon}", headers=H).json()["dates"]]
    dates = [d for d in dates if y0 <= int(d[1:5]) <= y1]
    meta, ndvi = modis_subset("MOD13Q1", "250m_16_days_NDVI", lat, lon, km, dates)
    _, rel = modis_subset("MOD13Q1", "250m_16_days_pixel_reliability", lat, lon, km, dates)
    lcd = [d["modis_date"] for d in requests.get(f"{ORNL}MCD12Q1/dates?latitude={lat}&longitude={lon}", headers=H).json()["dates"]]
    lmeta, lc = modis_subset("MCD12Q1", "LC_Type1", lat, lon, km, lcd[-1:])
    return {"meta": meta, "ndvi": ndvi, "rel": rel, "lc_meta": lmeta, "lc": lc}


def soilgrids(lat, lon):
    props = "&".join(f"property={p}" for p in ("soc", "phh2o", "clay", "sand", "nitrogen", "bdod"))
    depths = "&".join(f"depth={d}" for d in ("0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm"))
    url = f"https://rest.isric.org/soilgrids/v2.0/properties/query?lon={lon}&lat={lat}&{props}&{depths}&value=mean"
    return requests.get(url, timeout=120).json()


def terrain(lat, lon, z=12, pad=0.06):
    """Mosaic terrarium tiles around the site; returns elevation array (m) and tile origin."""
    import numpy as np
    from PIL import Image
    n = 2 ** z
    tx = lambda x: (x + 180) / 360 * n
    ty = lambda la: (1 - math.log(math.tan(math.radians(la)) + 1 / math.cos(math.radians(la))) / math.pi) / 2 * n
    x0, x1 = int(tx(lon - pad)), int(tx(lon + pad))
    y0, y1 = int(ty(lat + pad)), int(ty(lat - pad))
    img = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256), dtype="float32")
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            b = requests.get(f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", timeout=60).content
            a = np.asarray(Image.open(io.BytesIO(b)).convert("RGB")).astype("float32")
            img[(y - y0) * 256:(y - y0 + 1) * 256, (x - x0) * 256:(x - x0 + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    np.save(RAW / "dem.npy", img)
    return {"z": z, "x0": x0, "y0": y0}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--lat", type=float, default=15.18)
    ap.add_argument("--lon", type=float, default=101.13)
    ap.add_argument("--km", type=int, default=4)
    ap.add_argument("--years", type=int, nargs=2, default=[2022, 2024])
    a = ap.parse_args()
    RAW.mkdir(exist_ok=True)
    json.dump({"lat": a.lat, "lon": a.lon, "km": a.km}, open(RAW / "site.json", "w"))
    print("POWER..."); json.dump(power(a.lat, a.lon), open(RAW / "power.json", "w"))
    print("SoilGrids..."); json.dump(soilgrids(a.lat, a.lon), open(RAW / "soil.json", "w"))
    print("Terrain..."); json.dump(terrain(a.lat, a.lon), open(RAW / "dem_meta.json", "w"))
    print("MODIS (slow)..."); json.dump(modis(a.lat, a.lon, a.km, *a.years), open(RAW / "modis.json", "w"))
    print("done ->", RAW)
