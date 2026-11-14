"""Process pipeline/raw/* into data/site.json for the web app.

Steps
  1. Climate: daily NASA POWER -> monthly rain, ET0 (Hargreaves) and days Tmax>=35C per year,
     plus 25-year climatology and annual series.
  2. NDVI: mask cloudy values (pixel_reliability not in {0,1}), interpolate gaps, 3-point smooth,
     average years into one 23-composite annual profile per pixel.
  3. SI classification, two methods:
       a) k-means (scikit-learn, k chosen from the SSE elbow, default 6)
       b) rule-based phenology (min/max NDVI, peak count, season length)
     and their agreement (each cluster mapped to its majority rule class).
  4. Soil: SoilGrids texture/SOC -> plant-available water (Saxton & Rawls 2006).
  5. Terrain: mean slope (%) per MODIS cell from the DEM mosaic.

Usage:  python build_site.py [--k 6]
Note: k-means uses random initialisation; cluster numbering may differ between runs,
so check the cluster names in app.js (KNAME) against the profiles after re-running.
"""
import argparse, json, math, pathlib
import numpy as np
from sklearn.cluster import KMeans

HERE = pathlib.Path(__file__).parent
RAW = HERE / "raw"
OUT = HERE.parent / "data" / "site.json"
R_SIN = 6371007.181


def climate(pw, lat):
    p = pw["properties"]["parameter"]
    phi = math.radians(lat)
    def ra(doy):
        dr = 1 + 0.033 * math.cos(2 * math.pi * doy / 365); d = 0.409 * math.sin(2 * math.pi * doy / 365 - 1.39)
        ws = math.acos(-math.tan(phi) * math.tan(d))
        return 24 * 60 / math.pi * 0.082 * dr * (ws * math.sin(phi) * math.sin(d) + math.cos(phi) * math.cos(d) * math.sin(ws))
    yearly = {}
    import datetime as dt
    for k, tx in p["T2M_MAX"].items():
        tn, pr = p["T2M_MIN"][k], p["PRECTOTCORR"][k]
        if min(tx, tn, pr) < -900: continue
        d = dt.date(int(k[:4]), int(k[4:6]), int(k[6:]))
        et0 = 0.0023 * 0.408 * ra(d.timetuple().tm_yday) * ((tx + tn) / 2 + 17.8) * math.sqrt(max(tx - tn, 0))
        m = yearly.setdefault(str(d.year), [[0.0, 0.0, 0] for _ in range(12)])[d.month - 1]
        m[0] += pr; m[1] += et0; m[2] += tx >= 35
    yearly = {y: [[round(a), round(b), c] for a, b, c in v] for y, v in yearly.items()}
    ys = list(yearly.values())
    clim = [[round(np.mean([y[m][0] for y in ys]), 1), round(np.mean([y[m][1] for y in ys]), 1), 0,
             round(np.mean([y[m][2] for y in ys]), 1), 0] for m in range(12)]
    annual = [[int(y), sum(r[0] for r in v), 0, sum(r[2] for r in v), sum(v[m][0] for m in range(4))] for y, v in yearly.items()]
    # mean annual Tmax for the trend tile
    tmax = {}
    for k, tx in p["T2M_MAX"].items():
        if tx > -900: tmax.setdefault(k[:4], []).append(tx)
    for a in annual: a[2] = round(float(np.mean(tmax[str(a[0])])), 2)
    return clim, annual, yearly


def ndvi_profiles(md):
    nd = sorted(md["ndvi"], key=lambda s: s["date"]); rl = sorted(md["rel"], key=lambda s: s["date"])
    X = np.array([s["data"] for s in nd], float).T * 1e-4          # pixels x time
    Q = np.array([s["data"] for s in rl]).T
    X[~np.isin(Q, [0, 1]) | (X < -0.2)] = np.nan
    t = np.arange(X.shape[1])
    for i in range(X.shape[0]):
        ok = ~np.isnan(X[i]); X[i] = np.interp(t, t[ok], X[i, ok]) if ok.any() else 0
    Xs = X.copy(); Xs[:, 1:-1] = 0.25 * X[:, :-2] + 0.5 * X[:, 1:-1] + 0.25 * X[:, 2:]
    K = 23; Y = Xs.shape[1] // K
    prof = Xs[:, :Y * K].reshape(-1, Y, K).mean(axis=1)
    return Xs, prof


def rule_class(a):
    mn, mx = a.min(), a.max(); amp = mx - mn; L = int((a >= mn + 0.5 * amp).sum()); K = len(a); pk = 0
    for i in range(K):
        if all(a[i] >= a[(i - j) % K] and a[i] >= a[(i + j) % K] for j in (1, 2, 3)):
            lo = min(min(a[(i - j) % K], a[(i + j) % K]) for j in range(1, 7))
            pk += a[i] - lo > 0.1
    if mn >= 0.55: return 0      # forest / perennial
    if mx < 0.35: return 1       # bare / built / water
    if pk >= 2: return 2         # two-season crop
    if L <= 9: return 3          # single short season
    return 4                     # long-season field crop


def soil_props(sg):
    lay = {l["name"]: [d["values"]["mean"] / l["unit_measure"]["d_factor"] for d in l["depths"]] for l in sg["properties"]["layers"]}
    th = [5, 10, 15, 30, 40]
    def sr(S, C, OM):
        t33 = -0.251*S + 0.195*C + 0.011*OM + 0.006*S*OM - 0.027*C*OM + 0.452*S*C + 0.299
        t15 = -0.024*S + 0.487*C + 0.006*OM + 0.005*S*OM - 0.013*C*OM + 0.068*S*C + 0.031
        return (t33 + 1.283*t33**2 - 0.374*t33 - 0.015) - (t15 + 0.14*t15 - 0.02)
    paw = [sr(lay["sand"][i] / 100, lay["clay"][i] / 100, min(lay["soc"][i] / 10 * 1.72, 8)) * th[i] * 10 for i in range(5)]
    w = lambda v: sum(v[i] * th[i] for i in range(3)) / 30
    return {"ph": round(w(lay["phh2o"]), 2), "om": round(w(lay["soc"]) / 10 * 1.72, 2), "clay": round(w(lay["clay"])),
            "sand": round(w(lay["sand"])), "paw": round(sum(paw)), "deepStore": round(paw[4] + 0.5 * paw[3])}


def slope_grid(meta, n=33):
    dem = np.load(RAW / "dem.npy"); dm = json.load(open(RAW / "dem_meta.json"))
    z, x0, y0 = dm["z"], dm["x0"], dm["y0"]; N = 2 ** z
    xll, yll, cs = float(meta["xllcorner"]), float(meta["yllcorner"]), float(meta["cellsize"])
    def px(la, lo):
        X = ((lo + 180) / 360 * N - x0) * 256
        r = math.radians(la); Yp = ((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * N - y0) * 256
        return X, Yp
    def at(X, Yp): return dem[min(max(round(Yp), 0), dem.shape[0] - 1), min(max(round(X), 0), dem.shape[1] - 1)]
    res = 156543.03392 * math.cos(math.radians(yll / R_SIN * 180 / math.pi)) / N
    out = []
    for r in range(n):
        row = []
        for c in range(n):
            s = []
            for i in range(6):
                for j in range(6):
                    x = xll + (c + (j + .5) / 6) * cs; y = yll + (n - r - (i + .5) / 6) * cs
                    la = math.degrees(y / R_SIN); lo = math.degrees(x / (R_SIN * math.cos(y / R_SIN)))
                    X, Yp = px(la, lo)
                    s.append(math.hypot((at(X + 1, Yp) - at(X - 1, Yp)) / (2 * res), (at(X, Yp + 1) - at(X, Yp - 1)) / (2 * res)) * 100)
            row.append(round(float(np.mean(s))))
        out.append(row)
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--k", type=int, default=6); a = ap.parse_args()
    site = json.load(open(RAW / "site.json")); md = json.load(open(RAW / "modis.json"))
    clim, annual, yearly = climate(json.load(open(RAW / "power.json")), site["lat"])
    Xs, prof = ndvi_profiles(md)
    n = md["meta"]["nrows"]
    sse = {k: round(float(KMeans(k, n_init=10, random_state=42).fit(prof).inertia_), 1) for k in range(3, 8)}
    km = KMeans(a.k, n_init=10, random_state=42).fit(prof)
    rules = np.array([rule_class(p) for p in prof])
    agree = sum(np.bincount(rules[km.labels_ == c], minlength=5).max() for c in range(a.k)) / len(rules)
    lc = np.array(md["lc"][0]["data"]); ln = md["lc_meta"]["nrows"]
    crop = [p for p in range(n * n) if lc[min(ln - 1, (p // n) * ln // n) * ln + min(ln - 1, (p % n) * ln // n)] in (12, 14)]
    rows = lambda lab: ["".join(chr(65 + int(v)) for v in lab[r * n:(r + 1) * n]) for r in range(n)]
    out = {
        "name": "Demo site", "lat": site["lat"], "lon": site["lon"],
        "clim": clim, "annual": annual, "yearly": yearly, "soil": soil_props(json.load(open(RAW / "soil.json"))),
        "ndviSeries": [round(float(v), 2) for v in Xs[crop].mean(axis=0)], "ndviStart": md["ndvi"][0]["date"],
        "kmeans": {"k": a.k, "sse": sse, "profiles": [[round(float(v), 2) for v in c] for c in km.cluster_centers_],
                   "grid": rows(km.labels_), "agreement": round(float(agree), 2)},
        "rules": {"grid": rows(rules)},
        "grid": {"proj": "MODIS sinusoidal", "R": R_SIN, "xll": float(md["meta"]["xllcorner"]), "yll": float(md["meta"]["yllcorner"]),
                 "cell": float(md["meta"]["cellsize"]), "n": n},
        "slope": slope_grid(md["meta"], n),
    }
    OUT.parent.mkdir(exist_ok=True)
    json.dump(out, open(OUT, "w"), separators=(",", ":"))
    print("wrote", OUT, "| k-means agreement with rules:", out["kmeans"]["agreement"])
