'use strict';
/* Field Shift Map — crop-rotation decision support from NASA Earth observations.
   No precomputed data: every site is fetched live (NASA POWER, MODIS via ORNL DAAC, SRTM-derived DEM, SoilGrids).
   All scoring runs in the browser. */

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let LANG = 'th';
try { LANG = localStorage.getItem('fs-lang') || 'th'; } catch (e) {}
const t = (th, en) => (LANG === 'th' ? th : en);
const L2 = o => (typeof o === 'string' ? o : o[LANG]);

const MTH = {
  th: ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'],
  en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
};
const M1 = { th: ['ม','ก','มี','เม','พ','มิ','ก','ส','ก','ต','พ','ธ'], en: ['J','F','M','A','M','J','J','A','S','O','N','D'] };

/* Crops and rotations are built at run time from data/crops.json (FAO ECOCROP ranges + our role tags).
   Kc (crop coefficient) and heat sensitivity are typical values by crop group (FAO-56 Table 12); relative, not variety-specific. */
let CROPS = {}, R = [], planKey = '';
const TYPE = {
  cereal:    { kc: 1.15, sens: .8, col: '#d4a017', l: { th: 'ธัญพืช', en: 'Cereal' } },
  legume:    { kc: 1.05, sens: .7, col: '#2f8f4e', l: { th: 'ถั่วเมล็ด', en: 'Grain legume' } },
  cover:     { kc: .9,  sens: .3, col: '#8fbf3a', l: { th: 'พืชคลุมดิน / ปุ๋ยพืชสด', en: 'Cover / green manure' } },
  forage:    { kc: .95, sens: .4, col: '#3fa7a0', l: { th: 'พืชอาหารสัตว์', en: 'Forage' } },
  root:      { kc: .95, sens: .4, col: '#9a5f33', l: { th: 'พืชหัว', en: 'Root / tuber' } },
  oilseed:   { kc: 1.1, sens: .6, col: '#e07b2a', l: { th: 'พืชน้ำมัน', en: 'Oilseed' } },
  fiber:     { kc: 1.15, sens: .5, col: '#7a6fb0', l: { th: 'พืชเส้นใย', en: 'Fibre' } },
  perennial: { kc: 1.25, sens: .4, col: '#3f6f9a', l: { th: 'พืชอายุยาว', en: 'Perennial' } }
};
const typeDot = ty => `<i class="tdot" style="background:${TYPE[ty].col}"></i>`;
const fitCol = v => v >= .8 ? 'var(--crop)' : v >= .5 ? 'var(--warn)' : 'var(--heat)';
let CUSTOM = [], HIDE = new Set(), scrOpen = false, scrType = 'all';
const KC_OVERRIDE = { cassava: .8, rice_paddy: 1.2, sugarcane: 1.25 };
const PLAN_COL = ['#a7a39a','#2f7d4f','#9ab83a','#5b6fb0','#d98a2b','#8a5a33','#7a6fb0','#c4512b','#3fa7a0','#b98a12','#666'];
const RNAME = [
  {th:'ป่า / ไม้ยืนต้นเขียวทั้งปี',en:'Evergreen forest / trees'},{th:'โล่ง / ชุมชน / น้ำ',en:'Bare / built / water'},
  {th:'พืชสองฤดู',en:'Two-season crop'},{th:'พืชฤดูเดียว (สั้น)',en:'Single short season'},{th:'พืชไร่อายุยาว',en:'Long-season crop'},
  {th:'หญ้า / พุ่มไม้บาง',en:'Sparse grass / shrub'},{th:'สวน / ไม้ผลัดใบ',en:'Orchard / deciduous trees'},{th:'พืชสามฤดูขึ้นไป (มีน้ำทั้งปี)',en:'Three or more seasons (water all year)'}
];
const RCOL = ['#1f5e3a','#a7a39a','#2a6f9e','#c49a1c','#8a5a33','#c8cf86','#5fa36b','#7a4fa0'];
const RISK_COL = ['#2f7d4f','#9ab83a','#e2c044','#e08a3c','#c4512b'];
const PRIO = [
  { id:'wWater', v:3, l:{th:'ประหยัดน้ำ',en:'Save water'} },
  { id:'wSoil', v:4, l:{th:'สุขภาพดิน',en:'Soil health'}, h:{th:'อินทรียวัตถุ · N · กันดินพัง · ซึมน้ำ · pH',en:'Organic matter · N · erosion · infiltration · pH'} },
  { id:'wPest', v:2, l:{th:'ตัดวงจรศัตรูพืช',en:'Break pest cycles'} },
  { id:'wRisk', v:2, l:{th:'ลดความเสี่ยงอากาศร้อน',en:'Reduce heat risk'} },
  { id:'wIncome', v:2, l:{th:'รายได้',en:'Income'} }
];

let S = null, liveMarker = null, loadSeq = 0;
const DEFAULT_POINT = [15.18, 101.13];
/* Used only when SoilGrids has no value at the point (water, urban, ice); flagged in the UI */
const SOIL_DEFAULT = { ph: 6.5, om: 2, clay: 25, sand: 40, paw: 120, deepStore: 60 };
let mapMode = 'rec', map, gridOverlay = null, gridCanvas = null, baseLayers = {}, curBase = 'esri', tileErrors = 0;
const charts = {};

/* ---------- model ---------- */
const pct = (arr, q) => { const a = [...arr].sort((x, y) => x - y); const i = (a.length - 1) * q; const lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
function evalMonths(r, P, ET, HOT) {
  let deficit = 0, use = 0, heat = 0, eroNum = 0, eroDen = 0, bare = 0, store = S.soil.deepStore, phPen = 0, months = 0;
  const fams = new Set();
  for (let i = 0; i < 12; i++) {
    const c = r.m[i]; const kc = c ? c[1] : 0; const cover = c ? Math.min(1, 0.25 + 0.7 * kc) : 0;
    if (c) {
      const cr = CROPS[c[0]]; fams.add(cr.fam); months++;
      let d = Math.max(0, ET[i] * kc - 0.8 * P[i]);
      if (cr.deep) { const u = Math.min(d, store); store -= u; d -= u; }
      use += ET[i] * kc; deficit += d; heat += HOT[i] * cr.sens;
      const ph = S.soil.ph; phPen += ph < cr.ph[0] ? cr.ph[0] - ph : ph > cr.ph[1] ? ph - cr.ph[1] : 0;
    } else bare++;
    eroNum += P[i] * (1 - cover); eroDen += P[i];
  }
  return { deficit, use, heat, erosion: eroNum / eroDen, bare, fams: [...fams], phPen: months ? Math.min(.2, phPen / months) : 0 };
}
function evalRot(r, rf, dT) {
  const adj = rows => ({ P: rows.map(x => x[0] * (1 + rf)), ET: rows.map(x => x[1] * (1 + 0.022 * dT)), H: rows.map(x => Math.min(30, x[2] * (1 + 0.3 * dT))) });
  const c = adj(S.clim.map(x => [x[0], x[1], x[3]]));
  const base = evalMonths(r, c.P, c.ET, c.H);
  const yrs = Object.values(S.yearly).map(rows => { const a = adj(rows); return evalMonths(r, a.P, a.ET, a.H); });
  const defs = yrs.map(y => y.deficit);
  base.defMean = defs.reduce((a, b) => a + b, 0) / defs.length;
  base.defP80 = pct(defs, 0.8);
  base.dryYears = defs.filter(d => d > 150).length;
  base.nYears = defs.length;
  base.pest = Math.min(1, 0.15 + 0.55 * (base.fams.length - 1));
  base.infil = 0.4 * (1 - base.bare / 12) + 0.3 * r.om + 0.3 * r.deep;
  return base;
}
function norm(v, low) { const mn = Math.min(...v), mx = Math.max(...v); return v.map(x => mx === mn ? 1 : (low ? (mx - x) / (mx - mn) : (x - mn) / (mx - mn))); }
const incomeOf = i => { const el = $('inc' + i); return el ? +el.value / 10 : R[i].income; };
function readState() {
  const w = {}; PRIO.forEach(p => w[p.id] = +$(p.id).value);
  return { w, rf: +$('sRain').value / 100, dT: +$('sTemp').value, irr: $('cIrr').checked, mach: $('cMach').checked, base: 0, mainCrop: $('baseSel').value, mainMonth: $('baseMonth').value };
}
let evCache = null, evKey = '';
function evAll(st) { const k = st.rf + '|' + st.dT + '|' + S.lat + ',' + S.lon + '|' + planKey; if (k !== evKey) { evCache = R.map(r => evalRot(r, st.rf, st.dT)); evKey = k; } return evCache; }
function scoreAll(st, soilBoost = 0) {
  const ev = evAll(st), w = st.w;
  const nW = norm(ev.map(e => st.irr ? e.defMean : e.defP80), true);
  const nH = norm(ev.map(e => e.heat), true), nE = norm(ev.map(e => e.erosion), true);
  const omNeed = Math.max(0, Math.min(1, (4 - S.soil.om) / 3));
  const soil = R.map((r, i) => Math.max(0, (r.om * (1 + omNeed) + r.n + nE[i] + ev[i].infil) / (4 + omNeed) - ev[i].phPen));
  const ws = w.wSoil * (1 + soilBoost);
  const tw = w.wWater + ws + w.wPest + w.wRisk + w.wIncome || 1;
  const scores = R.map((r, i) => {
    let s = (w.wWater * nW[i] + ws * soil[i] + w.wPest * ev[i].pest + w.wRisk * nH[i] + w.wIncome * incomeOf(i)) / tw * 100;
    if (!st.mach && r.machine) s *= 0.85;
    return s;
  });
  return { ev, nW, nH, nE, soil, scores };
}

/* ---------- terrain & grids ---------- */
const sFactor = s => { const th = Math.atan(s / 100); return s < 9 ? 10.8 * Math.sin(th) + 0.03 : 16.8 * Math.sin(th) - 0.5; };
/* GRID = { n, cell (m), polys: [latlngs], info: [{ slope, farm, risk }] } */
let GRID = null, riskBreaks = [];
const cellInfo = p => GRID.info[p];
/* Live grid: n×n square cells of `cell` metres centred on the point (default 133 × 30 m ≈ 4 km).
   Slope comes from the DEM (~20–30 m). Each cell also takes the low-season cover of the 250 m MODIS pixel it falls in,
   so all layers share one grid (harmonised resolution). Drawn as a single image, not thousands of polygons. */
function liveGrid(site, n = 133, cell = 30) {
  const dLat = cell / 111320, dLon = cell / (111320 * Math.cos(site.lat * Math.PI / 180)), h = (n - 1) / 2, info = [];
  const A = site.ndvi && site.ndvi.area;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const la = site.lat + (h - r) * dLat, lo = site.lon + (c - h) * dLon;
    const slope = site.dem ? Math.round(site.dem.slope(la, lo) * 10) / 10 : NaN;
    let cover = null, px = -1;
    if (A) { const m = modisPix(A, la, lo); if (m.inside) { px = m.p; const nd = A.lowNd[px]; if (nd != null) cover = 1 - Math.max(0, Math.min(1, (nd - 0.2) / 0.6)); } }
    const sf = isNaN(slope) ? 0 : sFactor(slope);
    let fr = -1, fk = null;
    if (A && px >= 0 && A.prof) { const sr = resampleProf(A, la, lo); if (sr) { fr = classifyNdvi(sr); if (A.k) { let bd = 1e9; A.cents.forEach((c, i) => { let d = 0; for (let q = 0; q < sr.length; q++) { const e = sr[q] - c.prof[q]; d += e * e; } if (d < bd) { bd = d; fk = i; } }); } } else { fr = A.rule[px]; fk = A.km[px]; } }
    info.push({ slope, cover, px, fr, fk, risk: cover == null ? sf : sf * (0.15 + 0.85 * cover), farm: !isNaN(slope) });
  }
  const bounds = [[site.lat - (h + .5) * dLat, site.lon - (h + .5) * dLon], [site.lat + (h + .5) * dLat, site.lon + (h + .5) * dLon]];
  return { n, cell, info, bounds, dLat, dLon, lat0: site.lat + (h + .5) * dLat, lon0: site.lon - (h + .5) * dLon, hasCover: !!A };
}
function gridCell(lat, lon) {
  if (!GRID) return -1;
  const r = Math.floor((GRID.lat0 - lat) / GRID.dLat), c = Math.floor((lon - GRID.lon0) / GRID.dLon);
  return r >= 0 && r < GRID.n && c >= 0 && c < GRID.n ? r * GRID.n + c : -1;
}
/* MODIS sinusoidal grid helpers (ORNL subsets give xllcorner / yllcorner / cellsize in metres) */
const R_SIN = 6371007.181;
/* NDVI profile at any point: bilinear mix of the four nearest 250 m pixels. This smooths the picture between pixel
   centres so the layer lines up with the 30 m grid; it adds no real detail below 250 m. */
function resampleProf(A, lat, lon) {
  let fc, fr; const l = lat * Math.PI / 180;
  if (A.merc) { const n = 256 * 2 ** A.merc.z; fc = (lon + 180) / 360 * n - A.merc.x0 - .5; fr = (1 - Math.log(Math.tan(l) + 1 / Math.cos(l)) / Math.PI) / 2 * n - A.merc.y0 - .5; }
  else { fc = (R_SIN * lon * Math.PI / 180 * Math.cos(l) - A.xll) / A.cell - .5; fr = A.nrows - (R_SIN * l - A.yll) / A.cell - .5; }
  const c0 = Math.floor(fc), r0 = Math.floor(fr), tx = fc - c0, ty = fr - r0; let out = null, wsum = 0;
  for (const [dr, dc, w] of [[0, 0, (1 - tx) * (1 - ty)], [0, 1, tx * (1 - ty)], [1, 0, (1 - tx) * ty], [1, 1, tx * ty]]) {
    const r = Math.max(0, Math.min(A.nrows - 1, r0 + dr)), c = Math.max(0, Math.min(A.ncols - 1, c0 + dc)), pr = A.prof[r * A.ncols + c]; if (!pr || w <= 0) continue;
    if (!out) out = new Array(pr.length).fill(0); for (let i = 0; i < pr.length; i++) out[i] += pr[i] * w; wsum += w;
  }
  if (!out || wsum < 0.25) return null; for (let i = 0; i < out.length; i++) out[i] /= wsum; return out;
}
function modisPix(A, lat, lon) {
  if (A.merc) { /* GIBS web-mercator tile pixels */
    const n = 256 * 2 ** A.merc.z, l = lat * Math.PI / 180, c = Math.floor((lon + 180) / 360 * n) - A.merc.x0, r = Math.floor((1 - Math.log(Math.tan(l) + 1 / Math.cos(l)) / Math.PI) / 2 * n) - A.merc.y0;
    const cc = Math.max(0, Math.min(A.ncols - 1, c)), rr = Math.max(0, Math.min(A.nrows - 1, r));
    return { r: rr, c: cc, p: rr * A.ncols + cc, inside: Math.abs(c - cc) <= 2 && Math.abs(r - rr) <= 2 };
  }
  const la = lat * Math.PI / 180, x = R_SIN * lon * Math.PI / 180 * Math.cos(la), y = R_SIN * la;
  const c = Math.floor((x - A.xll) / A.cell), r = A.nrows - 1 - Math.floor((y - A.yll) / A.cell);
  const cc = Math.max(0, Math.min(A.ncols - 1, c)), rr = Math.max(0, Math.min(A.nrows - 1, r));
  return { r: rr, c: cc, p: rr * A.ncols + cc, inside: Math.abs(c - cc) <= 2 && Math.abs(r - rr) <= 2 };
}
function modisPolys(A) {
  const ll = (x, y) => { const la = y / R_SIN; return [la * 180 / Math.PI, x / (R_SIN * Math.cos(la)) * 180 / Math.PI]; }, out = [];
  for (let r = 0; r < A.nrows; r++) for (let c = 0; c < A.ncols; c++) {
    const x0 = A.xll + c * A.cell, x1 = x0 + A.cell, y1 = A.yll + (A.nrows - r) * A.cell, y0 = y1 - A.cell;
    out.push([ll(x0, y1), ll(x1, y1), ll(x1, y0), ll(x0, y0)]);
  }
  return out;
}
/* k-means on NDVI profiles; deterministic (seeded) k-means++ with restarts */
function kmeans(X, k, restarts = 8) {
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const d2 = (a, b) => { let v = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; v += d * d; } return v; };
  let best = null;
  for (let rs = 0; rs < restarts; rs++) {
    const C = [X[Math.floor(rnd() * X.length)].slice()];
    while (C.length < k) { const D = X.map(p => Math.min(...C.map(c => d2(p, c)))), tot = D.reduce((a, b) => a + b, 0); let r = rnd() * tot, i = 0; while (i < X.length - 1 && r > D[i]) { r -= D[i]; i++; } C.push(X[i].slice()); }
    let lab = new Array(X.length).fill(0);
    for (let it = 0; it < 60; it++) {
      let ch = 0;
      for (let p = 0; p < X.length; p++) { let bi = 0, bd = Infinity; for (let c = 0; c < k; c++) { const d = d2(X[p], C[c]); if (d < bd) { bd = d; bi = c; } } if (lab[p] !== bi) { lab[p] = bi; ch++; } }
      for (let c = 0; c < k; c++) { const m = new Array(X[0].length).fill(0); let n = 0; for (let p = 0; p < X.length; p++) if (lab[p] === c) { n++; for (let i = 0; i < m.length; i++) m[i] += X[p][i]; } if (n) C[c] = m.map(v => v / n); }
      if (!ch && it) break;
    }
    const sse = X.reduce((a, p, i) => a + d2(p, C[lab[i]]), 0);
    if (!best || sse < best.sse) best = { C, lab, sse };
  }
  return best;
}
const KM_COL = ['#1f5e3a', '#4f8f5a', '#8fbf6a', '#c8cf86', '#e2c044', '#d98a2b', '#b5603a', '#a7a39a'];
const kmName = (A, i) => { const c = A.cents[i], st = ndviStats(c.prof); return t(`กลุ่ม ${i + 1}: NDVI ${st.mn.toFixed(2)}–${st.mx.toFixed(2)} · ${c.amp < 0.15 ? 'เขียวคงที่ทั้งปี' : st.pk + ' พีค ต่ำสุด ' + MTH.th[c.lowM]} · คล้าย “${RNAME[c.rule].th}”`, `Group ${i + 1}: NDVI ${st.mn.toFixed(2)}–${st.mx.toFixed(2)} · ${c.amp < 0.15 ? 'steady all year' : st.pk + (st.pk === 1 ? ' peak' : ' peaks') + ', lowest in ' + MTH.en[c.lowM]} · like “${RNAME[c.rule].en}”`); };

/* ---------- UI build ---------- */
/* Priorities: the 0–5 sliders are only relative. What the score uses is each one's share of the total, shown as % */
const PRESET = [
  { l: { th: 'สมดุล', en: 'Balanced' }, v: [3, 4, 2, 2, 2] },
  { l: { th: 'น้ำน้อย', en: 'Little water' }, v: [5, 2, 1, 2, 1] },
  { l: { th: 'ฟื้นฟูดิน', en: 'Restore soil' }, v: [2, 5, 2, 1, 1] },
  { l: { th: 'อากาศร้อนแล้ง', en: 'Hot, dry climate' }, v: [4, 2, 1, 5, 1] },
  { l: { th: 'เน้นรายได้', en: 'Income first' }, v: [2, 2, 1, 1, 5] }
];
const PRIO_COL = ['#2a6f9e', '#8a5a33', '#7a6fb0', '#c4512b', '#b98a12'];
const PRIO_WORD = [{ th: 'ไม่นับ', en: 'ignored' }, { th: 'น้อย', en: 'low' }, { th: 'ค่อนข้างน้อย', en: 'fairly low' }, { th: 'ปานกลาง', en: 'medium' }, { th: 'มาก', en: 'high' }, { th: 'มากที่สุด', en: 'highest' }];
function prioShow(st) {
  const tot = PRIO.reduce((a, p) => a + st.w[p.id], 0), sh = PRIO.map(p => tot ? st.w[p.id] / tot * 100 : 0);
  PRIO.forEach((p, i) => { const o = $('o' + p.id); if (o) o.innerHTML = `${L2(PRIO_WORD[st.w[p.id]])} · <b>${Math.round(sh[i])}%</b>`; });
  const bar = $('prioBar'); if (bar) bar.innerHTML = tot ? PRIO.map((p, i) => sh[i] ? `<i style="width:${sh[i]}%;background:${PRIO_COL[i]}" title="${L2(p.l)} ${Math.round(sh[i])}%"></i>` : '').join('') : '';
  document.querySelectorAll('[data-pre]').forEach(b => b.setAttribute('aria-pressed', PRESET[+b.dataset.pre].v.every((v, i) => v === st.w[PRIO[i].id])));
  const n = $('prioNote'); if (n) n.textContent = tot ? t('% = สัดส่วนที่ใช้คิดคะแนนรวมจริง (รวมกัน 100%) · เลือกแบบสำเร็จด้านบน หรือเลื่อนเอง', '% = the share actually used in the overall score (adds to 100%) · pick a preset above or move the sliders') : t('ทุกข้อเป็น "ไม่นับ" คะแนนรวมจะเป็น 0', 'Everything is "ignored", so the overall score is 0');
}
function buildControls() {
  $('prioBox').innerHTML = `<div class="row" id="prioPre">${PRESET.map((q, i) => `<button type="button" class="btn" data-pre="${i}">${L2(q.l)}</button>`).join('')}</div><div id="prioBar" class="pbar" role="img" aria-label="weights"></div>` + PRIO.map(p => `<div class="ctl"><label for="${p.id}"><span>${L2(p.l)}</span><output id="o${p.id}"></output></label><input id="${p.id}" type="range" min="0" max="5" value="${$(p.id) ? $(p.id).value : p.v}" style="accent-color:${PRIO_COL[PRIO.indexOf(p)]}">${p.h ? `<p class="note">${L2(p.h)}</p>` : ''}</div>`).join('') + '<p class="note" id="prioNote"></p>';
  if (R.length) { const keep = R.map((_, i) => $('inc' + i) ? $('inc' + i).value : null); buildIncome(); keep.forEach((v, i) => { if (v != null && $('inc' + i)) $('inc' + i).value = v; }); }
  baseOptions();
  PRIO.forEach(p => $(p.id).addEventListener('input', update));
  document.querySelectorAll('[data-pre]').forEach(b => b.onclick = () => { PRESET[+b.dataset.pre].v.forEach((v, i) => $(PRIO[i].id).value = v); update(); });
  const bb = [['esri', {th:'ภาพละเอียดสูง',en:'High-res imagery'}], ['osm', {th:'แผนที่ถนน',en:'Street map'}], ['blank', {th:'ไม่มี',en:'None'}]];
  $('baseBtns').innerHTML = bb.map(([k, l]) => `<button type="button" class="btn" data-base="${k}" aria-pressed="${k === curBase}">${L2(l)}</button>`).join('');
  const lb = [['rec', {th:'แผนแนะนำ',en:'Recommended plan'}], ['erosion', {th:'เสี่ยงดินพัง',en:'Erosion risk'}], ['slope', {th:'ความลาดชัน',en:'Slope'}], ['km', {th:'รูปแบบพืชพรรณ (k-means)',en:'Vegetation pattern (k-means)'}], ['rules', {th:'รูปแบบ (กฎ)',en:'Pattern (rules)'}], ['none', {th:'ไม่แสดง',en:'None'}]];
  $('layerBtns').innerHTML = lb.map(([k, l]) => `<button type="button" class="btn" data-layer="${k}" aria-pressed="${k === mapMode}">${L2(l)}</button>`).join('');
  $('satBtns').innerHTML = SAT.map(o => `<button type="button" class="btn" data-sat="${o.id}" aria-pressed="${o.id === curSat}">${L2(o.l)}</button>`).join('');
  document.querySelectorAll('[data-base]').forEach(b => b.onclick = () => setBase(b.dataset.base));
  document.querySelectorAll('[data-layer]').forEach(b => b.onclick = () => { mapMode = b.dataset.layer; document.querySelectorAll('[data-layer]').forEach(x => x.setAttribute('aria-pressed', x.dataset.layer === mapMode)); paintCells(); });
  document.querySelectorAll('[data-sat]').forEach(b => b.onclick = () => setSat(b.dataset.sat));
}
function setLang(l) {
  LANG = l; document.body.dataset.lang = l; document.documentElement.lang = l;
  try { localStorage.setItem('fs-lang', l); } catch (e) {}
  $('lTH').setAttribute('aria-pressed', l === 'th'); $('lEN').setAttribute('aria-pressed', l === 'en');
  buildControls(); satLegend();
  if (!S) { if (!$('summary').dataset.err) $('summary').textContent = t('กำลังดึงข้อมูล NASA ของจุดเริ่มต้น…', 'Fetching NASA data for the starting point…'); return; }
  renderAll();
  if (S.recentJSON) loadRecent(S);
  $('liveList').innerHTML = liveStatusHTML(); restoreStatus();
}
function renderAll() { update(); drawCharts(); trends(); soilTiles(); paintCells(); links(); setLoc(); ndviNote(); siBlock(); }

/* ---------- render ---------- */
function update() {
  if (!S) return;
  const st = readState();
  prioShow(st);
  R.forEach((r, i) => { const o = $('oInc' + i); if (o) o.textContent = Math.round(incomeOf(i) * 10); });
  $('oRain').textContent = (st.rf > 0 ? '+' : '') + Math.round(st.rf * 100) + '%';
  $('oTemp').textContent = '+' + st.dT.toFixed(1) + ' °C';
  buildPlans(st);
  if (!R.length) { $('cards').innerHTML = `<p class="note">${t('กำลังโหลดฐานข้อมูลพืชเพื่อสร้างแผน…', 'Loading the crop database to build rotations…')}</p>`; screenBlock(st); return; }
  const { ev, nW, nH, nE, soil, scores } = scoreAll(st);
  const scr = screenBlock(st), scrBy = scr ? Object.fromEntries(scr.map(x => [x.c.id, x])) : null;
  const best = scores.indexOf(Math.max(...scores)), b0 = st.base, base = ev[b0];
  const bar = (lab, v, col) => `<div class="bar"><span>${lab}</span><i><b style="width:${Math.round(v * 100)}%;background:${col}"></b></i><em>${Math.round(v * 100)}</em></div>`;
  $('cards').innerHTML = R.map((r, i) => {
    const e = ev[i];
    const d = x => i === b0 ? '' : ` <span style="color:var(--muted)">(${x >= 0 ? '+' : ''}${Math.round(x)})</span>`;
    const seq = Array.from({ length: 12 }, (_, m) => { const c = r.m[m]; return `<span style="background:${c ? CROPS[c[0]].color : 'var(--chip)'}" title="${MTH[LANG][m]}: ${c ? L2(CROPS[c[0]].name) : t('ว่าง', 'fallow')}"></span>`; }).join('');
    const tags = [];
    if (i === b0) tags.push(`<span class="tag">${t('แผนปัจจุบัน', 'current')}${S.guess && S.guess.auto ? t(' (เดา)', ' (guessed)') : ''}</span>`);
    if (r.custom) tags.push(`<span class="tag" style="background:var(--water);color:#fff">${t('แผนของคุณ', 'your plan')}</span>`);
    if (r.kind === 'add' && r.role) tags.push(`<span class="tag">${t('เติมพืช: ', 'adds: ')}${L2(ROLE[r.role])}</span>`);
    if (r.kind === 'switch') tags.push(`<span class="tag">${t('เปลี่ยนพืชหลัก', 'switch main crop')}</span>`);
    if (i === best) tags.push(`<span class="tag best">${t('เหมาะสุดตามน้ำหนักที่เลือก', 'best for these priorities')}</span>`);
    if (r.machine && !st.mach) tags.push(`<span class="tag warn">${t('ต้องใช้เครื่องไถกลบ', 'needs tillage machinery')}</span>`);
    if (r.labor) tags.push(`<span class="tag">${t('ใช้แรงงานเพิ่ม', 'extra labour')}</span>`);
    if (scrBy) { const badC = r.crops.filter(k => scrBy[k] && !scrBy[k].pass && (r.kind === 'current' || st.rf || st.dT)); if (badC.length) tags.push(`<span class="tag warn">${t('ไม่เหมาะกับจุดนี้: ', 'poor fit here: ')}${badC.map(k => L2(CROPS[k].name)).join(', ')}</span>`); }
    if (!st.irr && e.dryYears >= 10) tags.push(`<span class="tag warn">${t('เสี่ยงถ้าไม่มีน้ำ', 'risky without irrigation')}</span>`);
    return `<article class="card${i === best ? ' best' : ''}">
      <div class="card-head"><div><h3>${r.id} · ${L2(r.name)}</h3><div>${tags.join('')}</div></div><div class="score">${Math.round(scores[i])}</div></div>
      <div><div class="seq">${seq}</div><div class="months">${M1[LANG].map(x => `<span>${x}</span>`).join('')}</div></div>
      <div class="bars">${bar(t('ประหยัดน้ำ', 'Water'), nW[i], 'var(--water)')}${bar(t('อินทรียวัตถุ', 'Organic matter'), r.om, 'var(--soil)')}${bar(t('ไนโตรเจน', 'Nitrogen'), r.n, 'var(--soil)')}${bar(t('กันดินพัง', 'Erosion ctrl'), nE[i], 'var(--soil)')}${bar(t('การซึมน้ำ', 'Infiltration'), e.infil, 'var(--soil)')}${bar(t('ตัดวงจรแมลง', 'Pest break'), e.pest, 'var(--crop)')}${bar(t('ทนร้อน', 'Heat'), nH[i], 'var(--heat)')}${bar(t('รายได้', 'Income'), incomeOf(i), 'var(--warn)')}</div>
      <dl class="kv">
        <dt>${t('น้ำที่ต้องเติม ปีปกติ (mm)', 'Irrigation need, average (mm)')}</dt><dd>${Math.round(e.defMean)}${d(e.defMean - base.defMean)}</dd>
        <dt>${t('ปีแล้ง 1 ใน 5 (mm)', '1-in-5 dry year (mm)')}</dt><dd>${Math.round(e.defP80)}</dd>
        <dt>${t('ปีที่ขาดน้ำเกิน 150 mm', 'Years short > 150 mm')}</dt><dd>${e.dryYears}/${e.nYears}</dd>
        <dt>${t('วันร้อน ≥35 °C ตอนมีพืช', 'Days ≥35 °C with crop')}</dt><dd>${e.heat.toFixed(1)}</dd>
        <dt>${t('ฝนตกตอนดินโล่ง', 'Rain on bare soil')}</dt><dd>${Math.round(e.erosion * 100)}%</dd>
        <dt>${t('คะแนนสุขภาพดิน', 'Soil-health score')}</dt><dd>${Math.round(soil[i] * 100)}</dd>
      </dl>
      <details><summary>${t('เหตุผล หลักฐาน และความเสี่ยง', 'Reasons, evidence and risks')}</summary><dl>
        <dt>${t('ทำไมแนะนำ', 'Why suggested')}</dt><dd>${L2(r.why)}</dd>
        <dt>${t('หลักฐาน', 'Evidence')}</dt><dd>${t('NASA POWER 25 ปี: ', 'NASA POWER, 25 years: ')}${t('น้ำที่ต้องเติมเฉลี่ย', 'mean irrigation need')} ${Math.round(e.defMean)} mm, ${t('ปีแล้ง', 'dry year')} ${Math.round(e.defP80)} mm${S.ndvi ? ` · MODIS: ${L2(RNAME[S.ndvi.cls])}, ${t('พืชคลุมดินน้อยสุด', 'lowest cover')} ${S.ndvi.lowMonths.map(m => MTH[LANG][m]).join('–')}` : ''} · ${t('ดิน', 'soil')} pH ${S.soil.ph}, OM ~${S.soil.om}%${S.soilFallback ? t(' (ค่าสมมติ เพราะไม่มีข้อมูลดินที่จุดนี้)', ' (assumed values; no soil data at this point)') : ''}</dd>
        <dt>${t('ประโยชน์', 'Benefits')}</dt><dd>${L2(r.benefit)}</dd>
        <dt>${t('อาหารสัตว์', 'Forage')}</dt><dd>${L2(r.forage)}</dd>
        <dt>${t('ข้อมูลที่ยังขาด', 'Information gaps')}</dt><dd>${L2(r.gap)}</dd>
        <dt>${t('ความเสี่ยงที่ต้องตรวจในพื้นที่', 'Risks to check locally')}</dt><dd>${L2(r.risk)}</dd>
      </dl></details>
      <span class="conf">${t('ความมั่นใจ', 'Confidence')}: ${i === b0 ? t('กลาง', 'medium') : t('กลาง–ต่ำ', 'medium–low')} · ${t('ภูมิอากาศ ~50 km · ดิน 250 m (ไม่ใช่ผลตรวจดินในแปลง) · รายได้ตั้งเอง', 'climate ~50 km · soil 250 m (not a field test) · income user-set')}${t(' · แผน 5 แบบเป็นชุดตั้งต้นสำหรับพืชไร่เขตร้อน ยังไม่ได้คัดพืชตามจุดนี้', ' · the 5 rotations are a starter set for tropical field crops, not yet screened for this point')}</span>
    </article>`;
  }).join('');
  const bb = R[best], eb = ev[best];
  $('summary').innerHTML = t('ด้วยน้ำหนักที่เลือก ', 'With these priorities, ') + `<b>${bb.id} · ${L2(bb.name)}</b> ` + t('ได้คะแนนสูงสุด', 'scores highest') + ` (${Math.round(scores[best])}/100). ` +
    (best === b0 ? t('แผนปัจจุบันยังเหมาะที่สุดในเงื่อนไขนี้', 'The current rotation is still the best fit here.') :
      t(`เทียบกับแผนปัจจุบัน (${R[b0].id}): น้ำที่ต้องเติมในปีแล้ง ${eb.defP80 - base.defP80 >= 0 ? '+' : ''}${Math.round(eb.defP80 - base.defP80)} mm, ฝนที่ตกตอนดินโล่ง ${Math.round(base.erosion * 100)}% → ${Math.round(eb.erosion * 100)}%`,
        `Versus the current rotation (${R[b0].id}): dry-year irrigation need ${eb.defP80 - base.defP80 >= 0 ? '+' : ''}${Math.round(eb.defP80 - base.defP80)} mm, rain on bare soil ${Math.round(base.erosion * 100)}% → ${Math.round(eb.erosion * 100)}%`)) +
    `<br><span style="color:var(--muted);font-size:.88rem">${t('ข้อควรตรวจก่อนตัดสินใจ', 'Check before deciding')}: ${L2(bb.risk)}</span>`;
  compareTable(st, ev, soil, scores, scrBy);
  fieldUI(); fieldInfo(st, ev, scores);
  if (mapMode === 'rec') paintCells();
}

/* ---------- map ---------- */
/* NASA GIBS overlays (daily global imagery, no login) + SoilGrids WMS. `levels` = candidate tile-matrix levels; the first that loads is kept. */
const GIBS_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi';
/* lag = days the product usually trails real time; level = GIBS tile-matrix level (checked against WMTS capabilities, Nov 2026) */
const SAT = [
  { id: 'none', l: { th: 'ไม่แสดง', en: 'None' } },
  { id: 'truecolor', gibs: 'MODIS_Terra_CorrectedReflectance_TrueColor', level: 9, fmt: 'jpg', lag: 1, res: '250 m', src: 'NASA MODIS Terra', l: { th: 'ภาพสีจริง', en: 'True colour' },
    key: { th: 'ภาพถ่ายจริงของวันนั้น (หน้าฝนมักมีเมฆ)', en: 'Actual image for that day (often cloudy in the rainy season)' } },
  { id: 'ndvi', gibs: 'MODIS_Terra_NDVI_8Day', level: 9, fmt: 'png', lag: 3, res: '250 m', src: 'NASA MODIS Terra NDVI 8-day', l: { th: 'พืชพรรณ NDVI', en: 'Vegetation NDVI' },
    grad: ['#a9805a', '#e6d27a', '#9cc95a', '#2f8a3a', '#0d4f22'], lo: { th: 'ดินโล่ง', en: 'bare' }, hi: { th: 'พืชหนาแน่น', en: 'dense' } },
  { id: 'lst', gibs: 'MODIS_Terra_Land_Surface_Temp_Day', level: 7, fmt: 'png', lag: 2, res: '1 km', src: 'NASA MODIS Terra LST (day)', l: { th: 'อุณหภูมิพื้นผิว', en: 'Land surface temp.' },
    grad: ['#3b4cc0', '#7aa6f7', '#f2e6a0', '#f08a4b', '#b40426'], lo: { th: 'เย็น', en: 'cool' }, hi: { th: 'ร้อน', en: 'hot' } },
  { id: 'smap', gibs: 'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture', level: 6, fmt: 'png', lag: 5, res: '9 km', src: 'NASA SMAP L4 root zone', l: { th: 'ความชื้นดิน', en: 'Soil moisture' },
    grad: ['#a0522d', '#e8c27a', '#cfe8c0', '#5fa8d3', '#1d3f8f'], lo: { th: 'แห้ง', en: 'dry' }, hi: { th: 'ชื้น', en: 'wet' } },
  { id: 'imerg', gibs: 'IMERG_Precipitation_Rate', level: 6, fmt: 'png', lag: 2, res: '10 km', src: 'NASA GPM IMERG (daily)', l: { th: 'ฝน', en: 'Rain' },
    grad: ['#a6e3f5', '#3fa0d6', '#2b56c4', '#c43dc4', '#e8333a'], lo: { th: 'น้อย', en: 'light' }, hi: { th: 'หนัก', en: 'heavy' } },
  { id: 'fire', gwms: 'VIIRS_NOAA20_Thermal_Anomalies_375m_All', lag: 1, res: '375 m', src: 'NASA VIIRS (NOAA-20) active fires', l: { th: 'ไฟ / การเผา', en: 'Fires / burning' },
    key: { th: 'จุดแดง = ตรวจพบความร้อนผิดปกติ (ไฟหรือการเผาตอซัง)', en: 'Red dots = thermal anomalies (fires or stubble burning)' } },
  { id: 'soil_ph', wms: 'https://maps.isric.org/mapserv?map=/map/phh2o.map', layer: 'phh2o_0-5cm_mean', res: '250 m', src: 'SoilGrids 2.0 (ISRIC)', l: { th: 'pH ดิน', en: 'Soil pH' },
    grad: ['#d7191c', '#fdae61', '#ffffbf', '#abd9e9', '#2c7bb6'], lo: { th: 'กรด', en: 'acid' }, hi: { th: 'ด่าง', en: 'alkaline' } },
  { id: 'soil_soc', wms: 'https://maps.isric.org/mapserv?map=/map/soc.map', layer: 'soc_0-5cm_mean', res: '250 m', src: 'SoilGrids 2.0 (ISRIC)', l: { th: 'คาร์บอนในดิน', en: 'Soil organic carbon' },
    grad: ['#fff5d6', '#e3c08a', '#a8763e', '#6b4423', '#3a2410'], lo: { th: 'ต่ำ', en: 'low' }, hi: { th: 'สูง', en: 'high' } },
  { id: 'soil_clay', wms: 'https://maps.isric.org/mapserv?map=/map/clay.map', layer: 'clay_0-5cm_mean', res: '250 m', src: 'SoilGrids 2.0 (ISRIC)', l: { th: 'ดินเหนียว %', en: 'Clay %' },
    grad: ['#fff7bc', '#fec44f', '#ec7014', '#993404', '#4d1a02'], lo: { th: 'น้อย', en: 'low' }, hi: { th: 'มาก', en: 'high' } }
];
let curSat = 'none', satLayer = null, satBack = 0, satErr = 0;
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
/* The date actually requested: the chosen day, capped at (today − product lag), then stepped back if tiles are missing */
function satDate(o) {
  const chosen = Date.parse($('gibsDate').value + 'T00:00:00Z'), cap = Date.now() - (o.lag || 0) * 864e5;
  return isoDay(Math.min(chosen, cap) - satBack * 864e5);
}
function makeSat(o) {
  const op = +$('satOpac').value / 100;
  if (o.wms) return L.tileLayer.wms(o.wms, { layers: o.layer, format: 'image/png', transparent: true, pane: 'sat', opacity: op, attribution: o.src });
  if (o.gwms) return L.tileLayer.wms(GIBS_WMS, { layers: o.gwms, format: 'image/png', transparent: true, version: '1.3.0', time: satDate(o), pane: 'sat', opacity: op, attribution: 'NASA GIBS / ' + o.src });
  return L.tileLayer(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${o.gibs}/default/${satDate(o)}/GoogleMapsCompatible_Level${o.level}/{z}/{y}/{x}.${o.fmt}`,
    { maxNativeZoom: o.level, maxZoom: 18, pane: 'sat', opacity: op, attribution: 'NASA GIBS / ' + o.src });
}
function setSat(id) {
  curSat = id; satBack = 0; satErr = 0;
  document.querySelectorAll('[data-sat]').forEach(b => b.setAttribute('aria-pressed', b.dataset.sat === id));
  drawSat();
}
function drawSat() {
  if (!map) return;
  if (satLayer) { map.removeLayer(satLayer); satLayer = null; }
  const o = SAT.find(x => x.id === curSat); $('satMsg').textContent = '';
  $('dateBox').hidden = !o || !(o.gibs || o.gwms);
  satLegend();
  if (!o || o.id === 'none') return;
  const layer = satLayer = makeSat(o).addTo(map);
  let ok = 0;
  layer.on('tileload', () => { ok++; });
  layer.on('tileerror', () => {
    if (layer !== satLayer) return;
    satErr++;
    if (satErr >= 3 && !ok && o.gibs && satBack < 6) { satBack++; satErr = 0; drawSat(); }
    else if (satErr >= 3 && !ok) $('satMsg').textContent = o.wms ? t('โหลดชั้นข้อมูลนี้ไม่ได้ในตอนนี้', 'This layer cannot be loaded right now') : t('ไม่มีภาพช่วงวันที่นี้ ลองเลือกวันอื่น', 'No image around this date; try another day');
  });
}
function satLegend() {
  const o = SAT.find(x => x.id === curSat); let h = '';
  if (o && o.id !== 'none') {
    h = o.grad ? `<div style="height:10px;border-radius:5px;background:linear-gradient(90deg,${o.grad.join(',')})"></div><div class="row" style="justify-content:space-between;font-size:.75rem;color:var(--muted)"><span>${L2(o.lo)}</span><span>${L2(o.hi)}</span></div>` : `<p class="note">${L2(o.key)}</p>`;
    const dated = (o.gibs || o.gwms) && $('gibsDate').value ? ` · ${t('ภาพวันที่', 'image date')} ${satDate(o)}` : '';
    h += `<p class="note">${o.src} · ${o.res}${dated}${o.grad ? (o.gibs ? t(' · สีโดยประมาณ ดูสเกลเต็มใน Worldview', ' · approximate colours; full scale in Worldview') : t(' · สีโดยประมาณ', ' · approximate colours')) : ''}</p>`;
  }
  $('satLegend').innerHTML = h;
}
function initMap() {
  if (!window.L) { $('map').innerHTML = `<p style="padding:16px">${t('โหลดแผนที่ไม่ได้', 'Map library failed to load')}</p>`; return; }
  map = L.map('map', { preferCanvas: true, scrollWheelZoom: false, worldCopyJump: true }).setView(DEFAULT_POINT, 12);
  map.createPane('sat').style.zIndex = 350;
  map.createPane('gridp').style.zIndex = 380; map.getPane('gridp').style.pointerEvents = 'none';
  const onErr = () => { tileErrors++; if (tileErrors > 6) { $('tileMsg').hidden = false; $('tileMsg').textContent = t('โหลดภาพพื้นหลังไม่ได้ในหน้านี้ (ใช้ได้เมื่อเปิดผ่าน GitHub Pages)', 'Base-map tiles cannot load in this viewer (they work on the hosted site)'); } };
  baseLayers.esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }).on('tileerror', onErr);
  baseLayers.osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).on('tileerror', onErr);
  baseLayers.blank = L.layerGroup();
  baseLayers[curBase].addTo(map);
  $('gibsDate').value = isoDay(Date.now() - 864e5);
  $('gibsDate').max = new Date().toISOString().slice(0, 10);
  $('gibsDate').addEventListener('change', () => { satBack = 0; satErr = 0; drawSat(); if (S) links(); });
  $('satOpac').addEventListener('input', () => { $('oSatOpac').textContent = $('satOpac').value + '%'; if (satLayer) satLayer.setOpacity(+$('satOpac').value / 100); });
  map.on('click', onMapClick);
}
function setGrid(grid) {
  GRID = grid;
  if (!gridCanvas) gridCanvas = document.createElement('canvas');
  gridCanvas.width = gridCanvas.height = grid.n;
  if (gridOverlay) { map.removeLayer(gridOverlay); gridOverlay = null; }
  const all = grid.info.filter(x => x.farm).map(x => x.risk);
  riskBreaks = all.length ? [0.2, 0.4, 0.6, 0.8].map(q => pct(all, q)) : [0, 0, 0, 0];
  recCache.key = '';
  paintCells();
}
function setBase(k) {
  if (map) { map.removeLayer(baseLayers[curBase]); baseLayers[k].addTo(map); if (baseLayers[k].bringToBack) baseLayers[k].bringToBack(); }
  curBase = k;
  document.querySelectorAll('[data-base]').forEach(b => b.setAttribute('aria-pressed', b.dataset.base === k));
}
let recCache = { key: '', best: [] };
function recFor(st) {
  const key = JSON.stringify(st) + R.map((_, i) => incomeOf(i)).join() + S.lat + ',' + S.lon;
  if (recCache.key === key) return recCache.best;
  const memo = {}; const sMed = sFactor(3);
  const best = GRID.info.map((_, p) => {
    const ci = cellInfo(p); if (!ci.farm) return -1;
    const boost = Math.max(-0.3, Math.min(1.5, (sFactor(ci.slope) / sMed - 1) * 0.5));
    const kb = boost.toFixed(2);
    if (!(kb in memo)) { const sc = scoreAll(st, +kb).scores; memo[kb] = sc.indexOf(Math.max(...sc)); }
    return memo[kb];
  });
  recCache = { key, best }; return best;
}
const SLOPE_BRK = [2, 5, 8, 12], SLOPE_COL = ['#e8f1d8', '#b9d98a', '#e2c044', '#e08a3c', '#a83a1e'];
const hexRGB = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function paintCells() {
  if (!map || !GRID || !S) return;
  const op = +$('opac').value / 100; $('oOpac').textContent = Math.round(op * 100) + '%';
  const st = readState(); const rec = mapMode === 'rec' && R.length ? recFor(st) : null;
  const A = S.ndvi && S.ndvi.area, img = new ImageData(GRID.n, GRID.n), cache = {};
  GRID.info.forEach((ci, p) => {
    let col = null;
    if (mapMode === 'erosion') col = ci.farm ? RISK_COL[riskBreaks.filter(b => ci.risk > b).length] : null;
    else if (mapMode === 'slope') col = isNaN(ci.slope) ? null : SLOPE_COL[SLOPE_BRK.filter(b => ci.slope > b).length];
    else if (mapMode === 'rec') col = rec && rec[p] >= 0 ? PLAN_COL[rec[p]] : null;
    else if (mapMode === 'km') col = A && ci.fk != null ? KM_COL[ci.fk] : null;
    else if (mapMode === 'rules') col = A && ci.fr >= 0 ? RCOL[ci.fr] : null;
    if (!col) return;
    const c = cache[col] || (cache[col] = hexRGB(col)), k = p * 4;
    img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
  });
  gridCanvas.getContext('2d').putImageData(img, 0, 0);
  const url = gridCanvas.toDataURL();
  if (!gridOverlay) gridOverlay = L.imageOverlay(url, GRID.bounds, { opacity: op, className: 'gridimg', interactive: false, pane: 'gridp' }).addTo(map);
  else { gridOverlay.setUrl(url); gridOverlay.setOpacity(op); }
  legend(rec);
}
function legend(rec) {
  const n = GRID.info.length; const count = f => { let c = 0; for (let p = 0; p < n; p++) if (f(p)) c++; return Math.round(c / n * 100) + '%'; };
  const gridNote = t(`กริด ${GRID.n}×${GRID.n} ช่อง ช่องละ ${GRID.cell} m รอบจุดที่เลือก`, `${GRID.n}×${GRID.n} grid of ${GRID.cell} m cells around the point`);
  let h = '';
  if (mapMode === 'km' || mapMode === 'rules') {
    const A = S.ndvi && S.ndvi.area;
    if (!A) h = `<p class="note">${S.ndviFailed ? t('ดึง NDVI จาก MODIS ไม่ได้ ชั้นนี้จึงไม่มีข้อมูล', 'MODIS NDVI could not be fetched, so this layer is empty') : t('กำลังดึง NDVI จาก MODIS… (~1 นาที)', 'Fetching MODIS NDVI… (~1 min)')}</p>`;
    else {
      const cl = GRID.info.filter(ci => ci.fr >= 0), share = f => Math.round(cl.filter(f).length / (cl.length || 1) * 100) + '%';
      if (mapMode === 'km') h = A.k ? A.cents.map((_, i) => `<span><i style="background:${KM_COL[i]}"></i>${kmName(A, i)}<b>${share(ci => ci.fk === i)}</b></span>`).join('') : `<p class="note">${t('pixel ที่ใช้ได้น้อยเกินไปสำหรับ k-means', 'Too few usable pixels for k-means')}</p>`;
      else h = RNAME.map((nm, i) => cl.some(ci => ci.fr === i) ? `<span><i style="background:${RCOL[i]}"></i>${L2(nm)}<b>${share(ci => ci.fr === i)}</b></span>` : '').join('');
      h += `<p class="note">${t(`ข้อมูลจริงละเอียด 250 m (MODIS ${A.nrows}×${A.ncols} pixel, NDVI 1 ปีล่าสุด) · แต่ละช่อง 30 m ใช้กราฟ NDVI ที่เฉลี่ยตามระยะจาก 4 pixel ที่ใกล้สุด (bilinear) แล้วจำแนกใหม่ ขอบเขตจึงเรียบขึ้น แต่ไม่ได้เห็นรายละเอียดเล็กกว่า 250 m จริง`, `True resolution is 250 m (MODIS ${A.nrows}×${A.ncols} pixels, last year of NDVI) · each 30 m cell uses an NDVI curve blended by distance from the 4 nearest pixels (bilinear) and is classified again, so edges are smoother, but nothing smaller than 250 m is really resolved`)}</p>`;
    }
    $('legend').innerHTML = h; return;
  }
  if (mapMode === 'erosion') h = [t('ต่ำมาก', 'Very low'), t('ต่ำ', 'Low'), t('ปานกลาง', 'Medium'), t('สูง', 'High'), t('สูงมาก', 'Very high')].map((nm, i) => `<span><i style="background:${RISK_COL[i]}"></i>${nm}</span>`).join('') + `<p class="note">${(GRID.hasCover ? t('ปัจจัยความลาดชัน S ของ RUSLE (SRTM 30 m) × พืชคลุมดินช่วงต่ำสุด (MODIS 250 m ปรับลงกริดเดียวกัน) จัด 5 ระดับเทียบกันในกริด', 'RUSLE slope factor S (SRTM, 30 m) × low-season ground cover (MODIS 250 m resampled to the same grid), quintiles within the grid') : t('ปัจจัยความลาดชัน S ของ RUSLE (SRTM) จัด 5 ระดับเทียบกันในกริด · จะคูณด้วยพืชคลุมดินเมื่อ NDVI โหลดเสร็จ', 'RUSLE slope factor S (SRTM), quintiles within the grid · ground cover is applied once NDVI has loaded'))}</p>`;
  else if (mapMode === 'slope') h = [['< 2%'], ['2–5%'], ['5–8%'], ['8–12%'], ['> 12%']].map(([nm], i) => `<span><i style="background:${SLOPE_COL[i]}"></i>${nm}<b>${count(p => !isNaN(cellInfo(p).slope) && SLOPE_BRK.filter(b => cellInfo(p).slope > b).length === i)}</b></span>`).join('') + `<p class="note">${t('ความชันเฉลี่ยในแต่ละช่อง จาก DEM ที่ทำจาก SRTM', 'Mean slope per cell from the SRTM-derived DEM')}</p>`;
  else if (mapMode === 'rec' && !rec) h = `<p class="note">${t('กำลังสร้างแผน…', 'Building rotations…')}</p>`;
  else if (mapMode === 'rec' && rec) h = R.map((r, i) => `<span><i style="background:${PLAN_COL[i]}"></i>${r.id} · ${L2(r.name)}<b>${count(p => rec[p] === i)}</b></span>`).join('') + (rec.some(v => v < 0) ? `<span><i style="background:#888;opacity:.4"></i>${t('ไม่มีข้อมูลความสูง', 'No elevation data')}<b>${count(p => rec[p] < 0)}</b></span>` : '') + `<p class="note">${t('ภูมิอากาศและดินเป็นค่าเดียวทั้งกริด ความต่างระหว่างช่องมาจากความลาดชัน', 'Climate and soil are uniform across the grid; cells differ by slope')}</p>`;
  $('legend').innerHTML = h + `<p class="note">${gridNote}</p>`;
}
function cellHTML(p) {
  const ci = cellInfo(p), st = readState(), A = S.ndvi && S.ndvi.area;
  const lvl = [t('ต่ำมาก', 'very low'), t('ต่ำ', 'low'), t('ปานกลาง', 'medium'), t('สูง', 'high'), t('สูงมาก', 'very high')][riskBreaks.filter(b => ci.risk > b).length];
  let h = `${t('ความลาดชัน', 'Slope')}: ${isNaN(ci.slope) ? '—' : ci.slope + '%'}`;
  if (ci.farm) h += `<br>${t('เสี่ยงดินพัง', 'Erosion risk')}: ${lvl}`;
  if (ci.cover != null) h += `<br>${t('พืชคลุมดินช่วงต่ำสุด', 'Low-season cover')}: ${Math.round((1 - ci.cover) * 100)}%`;
  if (A && ci.fr >= 0) h += `<br>${t('รูปแบบ (กฎ)', 'Pattern (rules)')}: ${L2(RNAME[ci.fr])}` + (ci.fk != null ? `<br>k-means: ${kmName(A, ci.fk)}` : '');
  if (ci.farm && R.length) { const rec = recFor(st)[p]; if (rec >= 0) h += `<br><b>${t('แนะนำ', 'Suggested')}: ${R[rec].id} · ${L2(R[rec].name)}</b>`; }
  return h;
}
function links() {
  const d = $('gibsDate').value;
  const bb = [S.lon - 0.08, S.lat - 0.06, S.lon + 0.08, S.lat + 0.06].map(v => v.toFixed(3)).join(',');
  $('lnkWV').href = `https://worldview.earthdata.nasa.gov/?v=${bb}&l=HLS_S30_Nadir_BRDF_Adjusted_Reflectance,HLS_L30_Nadir_BRDF_Adjusted_Reflectance,MODIS_Terra_CorrectedReflectance_TrueColor&t=${d}-T00:00:00Z`;
  $('lnkGE').href = `https://earth.google.com/web/@${S.lat},${S.lon},80a,9000d,35y,0h,0t,0r`;
}

/* ---------- charts & tiles ---------- */
function drawCharts() {
  if (!window.Chart) return;
  Chart.defaults.color = css('--muted'); Chart.defaults.borderColor = css('--line'); Chart.defaults.font.family = 'IBM Plex Sans Thai, system-ui, sans-serif';
  for (const k in charts) { charts[k].destroy(); delete charts[k]; }
  const lg = { legend: { labels: { boxWidth: 12 } } };
  charts.clim = new Chart($('cClim'), { data: { labels: MTH[LANG], datasets: [
    { type: 'bar', label: t('ฝน (mm)', 'Rain (mm)'), data: S.clim.map(c => c[0]), backgroundColor: css('--water'), yAxisID: 'y' },
    { type: 'line', label: 'ET₀ (mm)', data: S.clim.map(c => c[1]), borderColor: css('--heat'), backgroundColor: css('--heat'), tension: .3, pointRadius: 2, yAxisID: 'y' },
    { type: 'line', label: t('วัน ≥35 °C', 'Days ≥35 °C'), data: S.clim.map(c => c[3]), borderColor: css('--warn'), backgroundColor: css('--warn'), borderDash: [4, 3], pointRadius: 2, yAxisID: 'y2' }] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true, title: { display: true, text: t('mm/เดือน', 'mm/month') } }, y2: { position: 'right', beginAtZero: true, max: 31, grid: { display: false } } }, plugins: lg } });
  if (S.ndvi) charts.ndvi = new Chart($('cNdvi'), { type: 'line', data: { labels: S.ndvi.dates.map(d => `${+d.slice(8, 10)} ${MTH[LANG][+d.slice(5, 7) - 1]} ${d.slice(2, 4)}`), datasets: [
    { label: t('NDVI ของ pixel นี้', 'NDVI at this pixel'), data: S.ndvi.smooth, borderColor: css('--crop'), backgroundColor: css('--crop'), tension: .3, pointRadius: 0, borderWidth: 2.5 },
    { label: t('ค่าดิบที่ใช้ได้', 'Raw, usable'), data: S.ndvi.raw, borderColor: 'transparent', backgroundColor: css('--muted'), pointRadius: 3, showLine: false },
    { label: t('เกณฑ์ดินโล่ง 0.3', 'Bare-soil threshold 0.3'), data: S.ndvi.dates.map(() => .3), borderColor: css('--soil'), borderDash: [5, 4], pointRadius: 0 }] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { min: 0, max: 1 }, x: { ticks: { maxTicksLimit: 8 } } }, plugins: lg } });
  { const A = S.ndvi && S.ndvi.area; if (A && A.k) charts.prof = new Chart($('cProf'), { type: 'line', data: { labels: S.ndvi.dates.map(d => `${+d.slice(8, 10)} ${MTH[LANG][+d.slice(5, 7) - 1]}`), datasets: A.cents.map((c, i) => ({ label: kmName(A, i), data: c.prof, borderColor: KM_COL[i], backgroundColor: KM_COL[i], pointRadius: 0, tension: .3, borderWidth: 2 })) },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { min: 0, max: 1 }, x: { ticks: { maxTicksLimit: 8 } } }, plugins: { legend: { labels: { boxWidth: 10, font: { size: 10 } } } } } }); }
  charts.trend = new Chart($('cTrend'), { data: { labels: S.annual.map(a => a[0]), datasets: [
    { type: 'bar', label: t('ฝนรายปี (mm)', 'Annual rain (mm)'), data: S.annual.map(a => a[1]), backgroundColor: css('--water'), yAxisID: 'y' },
    { type: 'line', label: t('วัน ≥35 °C', 'Days ≥35 °C'), data: S.annual.map(a => a[3]), borderColor: css('--heat'), backgroundColor: css('--heat'), pointRadius: 2, yAxisID: 'y2' }] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true }, y2: { position: 'right', beginAtZero: true, grid: { display: false } } }, plugins: lg } });
  drawRecent();
}
function sen(xs, ys) { const s = []; for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) s.push((ys[j] - ys[i]) / (xs[j] - xs[i])); return pct(s, .5); }
function erfc(x) { const z = 1 / (1 + .5 * x); return z * Math.exp(-x * x - 1.26551223 + z * (1.00002368 + z * (.37409196 + z * (.09678418 + z * (-.18628806 + z * (.27886807 + z * (-1.13520398 + z * (1.48851587 + z * (-.82215223 + z * .17087277))))))))); }
function mk(ys) { const n = ys.length; let s = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) s += Math.sign(ys[j] - ys[i]); const v = n * (n - 1) * (2 * n + 5) / 18; return erfc(Math.abs((s - Math.sign(s)) / Math.sqrt(v)) / Math.SQRT2); }
function trends() {
  const xs = S.annual.map(a => a[0]);
  const items = [[t('ฝนรายปี', 'Annual rain'), 1, t('mm/ทศวรรษ', 'mm/decade'), 0], [t('Tmax เฉลี่ย', 'Mean Tmax'), 2, t('°C/ทศวรรษ', '°C/decade'), 2], [t('วันร้อน ≥35 °C', 'Days ≥35 °C'), 3, t('วัน/ทศวรรษ', 'days/decade'), 0], [t('ฝน ม.ค.–เม.ย.', 'Jan–Apr rain'), 4, t('mm/ทศวรรษ', 'mm/decade'), 0]];
  $('trend').innerHTML = items.map(([n, i, u, dp]) => { const ys = S.annual.map(a => a[i]); const s = sen(xs, ys) * 10, p = mk(ys);
    return `<div>${n}<b>${s >= 0 ? '+' : ''}${s.toFixed(dp)} ${u}</b><span class="pill ${p < .05 ? 'sig' : 'ns'}">p=${p.toFixed(2)} ${p < .05 ? t('มีนัยสำคัญ', 'significant') : t('ไม่ชัด', 'not significant')}</span></div>`; }).join('');
}
function soilTiles() {
  const sl = S.slopeSamples || []; const s = S.soil;
  const tex = s.clay >= 40 ? t('ดินเหนียว', 'clay') : s.clay >= 27 ? t('ดินร่วนเหนียว', 'clay loam') : s.sand >= 70 ? t('ดินทราย / ร่วนปนทราย', 'sand / loamy sand') : s.sand >= 50 ? t('ดินร่วนปนทราย', 'sandy loam') : t('ดินร่วน', 'loam');
  const phNote = s.ph < 5.5 ? t('เป็นกรด พืชตระกูลถั่วหลายชนิดไม่ชอบ', 'acidic; many legumes dislike it') : s.ph > 7.8 ? t('เป็นด่าง', 'alkaline') : t('อยู่ในช่วงที่พืชส่วนใหญ่ปลูกได้', 'suits most crops');
  const omNote = s.om < 1.5 ? t('ต่ำ ควรเพิ่มอินทรียวัตถุ', 'low; worth building up') : s.om < 3 ? t('ปานกลาง', 'moderate') : t('ดี', 'good');
  const rows = [
    [t('ดินเหนียว 0–30 cm', 'Clay 0–30 cm'), s.clay + '%', tex],
    ['pH 0–30 cm', s.ph, phNote],
    [t('อินทรียวัตถุ 0–30 cm', 'Organic matter 0–30 cm'), '~' + s.om + '%', omNote],
    [t('น้ำที่พืชใช้ได้ 0–100 cm', 'Plant-available water 0–100 cm'), s.paw + ' mm', t(`ชั้นล่าง >45 cm ~${s.deepStore} mm`, `below 45 cm ~${s.deepStore} mm`)]
  ];
  if (sl.length) rows.push([t('ความลาดชัน (มัธยฐาน)', 'Slope (median)'), pct(sl, .5).toFixed(0) + '%', t(`ในรัศมี ~125 m · สูงสุด ${Math.max(...sl).toFixed(0)}%`, `within ~125 m · max ${Math.max(...sl).toFixed(0)}%`)]);
  $('soilTiles').innerHTML = rows.map(([a, b, c]) => `<div>${a}<b>${b}</b>${c}</div>`).join('') + (S.soilFallback ? `<div>${t('หมายเหตุ', 'Note')}<b class="d">${t('ค่าดินเป็นค่าสมมติ', 'Soil values are assumed')}</b>${t('SoilGrids ไม่มีค่าที่จุดนี้ (เช่น เป็นน้ำหรือเมือง) จึงใช้ค่ากลางๆ แทน ควรตรวจดินจริง', 'SoilGrids has no value here (e.g. water or urban), so mid-range values are used; test the soil')}</div>` : '');
}

/* ---------- live NASA data (T1, T2) ---------- */
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const liveCache = new Map();
async function getJSON(url, ms = 30000, opts = {}) {
  const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { ...opts, signal: ac.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(tm); }
}
const powerURL = (lat, lon, start, end, params = 'T2M_MAX,T2M_MIN,PRECTOTCORR') =>
  `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=${params}&community=AG&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}&start=${start}&end=${end}&format=JSON`;
function raFn(lat) {
  const phi = lat * Math.PI / 180;
  return doy => { const dr = 1 + 0.033 * Math.cos(2 * Math.PI * doy / 365), d = 0.409 * Math.sin(2 * Math.PI * doy / 365 - 1.39);
    const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(d))));
    return 24 * 60 / Math.PI * 0.082 * dr * (ws * Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.sin(ws)); };
}
/* Daily POWER → {days:[{k,y,m,tx,tn,p,et}], clim, annual, yearly}. ET0 = Hargreaves; same method as pipeline/build_site.py */
function buildClimate(param, lat) {
  const Ra = raFn(lat), days = [];
  for (const k of Object.keys(param.T2M_MAX)) {
    const tx = param.T2M_MAX[k], tn = param.T2M_MIN[k], p = param.PRECTOTCORR[k];
    if (tx < -900 || tn < -900 || p < -900) continue;
    const y = +k.slice(0, 4), m = +k.slice(4, 6) - 1, dt = Date.UTC(y, m, +k.slice(6, 8));
    const doy = Math.floor((dt - Date.UTC(y, 0, 0)) / 864e5);
    const et = 0.0023 * 0.408 * Ra(doy) * ((tx + tn) / 2 + 17.8) * Math.sqrt(Math.max(tx - tn, 0));
    days.push({ k, y, m, tx, tn, p, et });
  }
  const yearly = {}, tx = {};
  for (const d of days) {
    const Y = (yearly[d.y] = yearly[d.y] || Array.from({ length: 12 }, () => [0, 0, 0]))[d.m];
    Y[0] += d.p; Y[1] += d.et; if (d.tx >= 35) Y[2]++;
    (tx[d.y] = tx[d.y] || []).push(d.tx);
  }
  for (const y in yearly) yearly[y] = yearly[y].map(r => [Math.round(r[0]), Math.round(r[1]), r[2]]);
  const ys = Object.values(yearly), mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const tmaxM = Array.from({ length: 12 }, (_, m) => mean(days.filter(d => d.m === m).map(d => d.tx)));
  const clim = Array.from({ length: 12 }, (_, m) => [+mean(ys.map(y => y[m][0])).toFixed(1), +mean(ys.map(y => y[m][1])).toFixed(1), +tmaxM[m].toFixed(1), +mean(ys.map(y => y[m][2])).toFixed(1), 0]);
  const annual = Object.keys(yearly).map(y => [+y, yearly[y].reduce((s, r) => s + r[0], 0), +mean(tx[y]).toFixed(2), yearly[y].reduce((s, r) => s + r[2], 0), yearly[y].slice(0, 4).reduce((s, r) => s + r[0], 0)]);
  return { days, clim, annual, yearly };
}
/* SoilGrids → soil props (port of soil_props in build_site.py; Saxton & Rawls 2006) */
function soilFromGrids(j) {
  const lay = {};
  for (const l of j.properties.layers) lay[l.name] = l.depths.map(d => d.values.mean == null ? null : d.values.mean / l.unit_measure.d_factor);
  const need = ['phh2o', 'soc', 'clay', 'sand'];
  if (need.some(n => !lay[n] || lay[n].some(v => v == null))) return null;
  const th = [5, 10, 15, 30, 40];
  const sr = (S_, C, OM) => { const t33 = -0.251*S_ + 0.195*C + 0.011*OM + 0.006*S_*OM - 0.027*C*OM + 0.452*S_*C + 0.299;
    const t15 = -0.024*S_ + 0.487*C + 0.006*OM + 0.005*S_*OM - 0.013*C*OM + 0.068*S_*C + 0.031;
    return Math.max(0, (t33 + 1.283*t33*t33 - 0.374*t33 - 0.015) - (t15 + 0.14*t15 - 0.02)); };
  const paw = th.map((h, i) => sr(lay.sand[i] / 100, lay.clay[i] / 100, Math.min(lay.soc[i] / 10 * 1.72, 8)) * h * 10);
  const w = v => (v[0] * 5 + v[1] * 10 + v[2] * 15) / 30;
  return { ph: +w(lay.phh2o).toFixed(2), om: +(w(lay.soc) / 10 * 1.72).toFixed(2), clay: Math.round(w(lay.clay)), sand: Math.round(w(lay.sand)), paw: Math.round(paw.reduce((a, b) => a + b, 0)), deepStore: Math.round(paw[4] + 0.5 * paw[3]) };
}
/* DEM sampler around a point from SRTM-derived terrain tiles (terrarium, zoom 13, 3×3 tiles ≈ ±7 km). slope(la, lo) → % */
async function demSampler(lat, lon) {
  const z = 13, n = 2 ** z, fx = (lon + 180) / 360 * n, r = lat * Math.PI / 180, fy = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
  const x0 = Math.floor(fx) - 1, y0 = Math.floor(fy) - 1, cv = document.createElement('canvas'); cv.width = cv.height = 768;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  await Promise.all([0, 1, 2].flatMap(i => [0, 1, 2].map(j => new Promise((ok, no) => {
    const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { ctx.drawImage(im, i * 256, j * 256); ok(); }; im.onerror = no;
    im.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${(x0 + i + n) % n}/${y0 + j}.png`; }))));
  const px = ctx.getImageData(0, 0, 768, 768).data;
  const el = (X, Y) => { X = Math.max(0, Math.min(767, Math.round(X))); Y = Math.max(0, Math.min(767, Math.round(Y))); const k = (Y * 768 + X) * 4; return px[k] * 256 + px[k + 1] + px[k + 2] / 256 - 32768; };
  const res = 156543.03392 * Math.cos(r) / n;
  const toXY = (la, lo) => { const rr = la * Math.PI / 180; return [((lo + 180) / 360 * n - x0) * 256, ((1 - Math.log(Math.tan(rr) + 1 / Math.cos(rr)) / Math.PI) / 2 * n - y0) * 256]; };
  const slope = (la, lo) => { const [X, Y] = toXY(la, lo); return Math.hypot((el(X + 1, Y) - el(X - 1, Y)) / (2 * res), (el(X, Y + 1) - el(X, Y - 1)) / (2 * res)) * 100; };
  const samples = [], dLat = 125 / 111320 / 3, dLon = 125 / (111320 * Math.cos(r)) / 3;
  for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) samples.push(slope(lat + a * dLat, lon + b * dLon));
  return { slope, samples };
}
const sMsg = m => typeof m === 'function' ? m() : (m || '');
/* msg may be a function so the text follows the language toggle */
function setStatus(id, state, msg) {
  statusMem[id] = [state, msg];
  const el = $('st-' + id); if (!el) return;
  el.dataset.state = state; el.querySelector('em').textContent = sMsg(msg);
}
const STATUS_ROWS = () => [['power', t('NASA POWER ภูมิอากาศ 2001–2025', 'NASA POWER climate 2001–2025')], ['recent', t('NASA POWER 90 วันล่าสุด', 'NASA POWER last 90 days')], ['soil', t('ดิน (SoilGrids)', 'Soil (SoilGrids)')], ['slope', t('ความลาดชัน (SRTM)', 'Slope (SRTM)')], ['ndvi', t('NDVI 1 ปีล่าสุด (MODIS)', 'NDVI, last year (MODIS)')]];
const statusMem = {};
function liveStatusHTML() { return STATUS_ROWS().map(([k, l]) => `<li id="st-${k}" data-state="wait"><i></i>${l}<em></em></li>`).join(''); }
function restoreStatus() { for (const k in statusMem) { const el = $('st-' + k); if (el) { el.dataset.state = statusMem[k][0]; el.querySelector('em').textContent = sMsg(statusMem[k][1]); } } }
const fmtLat = v => `${Math.abs(v).toFixed(3)}°${v >= 0 ? 'N' : 'S'}`;
const fmtLon = v => `${Math.abs(v).toFixed(3)}°${v >= 0 ? 'E' : 'W'}`;
const fmtLL = (la, lo) => `${fmtLat(la)} ${fmtLon(lo)}`;
function onMapClick(e) {
  const lat = e.latlng.lat, lng = ((e.latlng.lng + 540) % 360) - 180;
  if (drawing) { drawPoint(e.latlng); return; }
  const box = document.createElement('div');
  const head = document.createElement('b'); head.textContent = fmtLL(lat, lng);
  const p = S ? gridCell(lat, lng) : -1, infoEl = document.createElement('div'); if (p >= 0) infoEl.innerHTML = cellHTML(p);
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn'; btn.style.marginTop = '6px'; btn.style.display = 'block';
  btn.textContent = t('วิเคราะห์จุดนี้', 'Analyse this point');
  L.DomEvent.on(btn, 'click', ev => { L.DomEvent.stop(ev); map.closePopup(); loadLive(lat, lng); });
  box.append(head, infoEl, btn);
  L.popup().setLatLng(e.latlng).setContent(box).openOn(map);
}
async function loadLive(lat, lon) {
  lon = ((lon + 540) % 360) - 180;
  const seq = ++loadSeq, key = lat.toFixed(3) + ',' + lon.toFixed(3);
  for (const k in statusMem) delete statusMem[k];
  $('liveList').innerHTML = liveStatusHTML(); $('retryBtn').hidden = true;
  $('liveTitle').textContent = t(`กำลังดึงข้อมูลของ ${fmtLL(lat, lon)}…`, `Fetching data for ${fmtLL(lat, lon)}…`);
  try { history.replaceState(null, '', '#p=' + lat.toFixed(4) + ',' + lon.toFixed(4)); } catch (e) {}
  if (map) { if (liveMarker) liveMarker.setLatLng([lat, lon]); else liveMarker = L.circleMarker([lat, lon], { radius: 7, color: '#ffffff', weight: 3, fillColor: '#c4512b', fillOpacity: 1, interactive: false }).addTo(map); map.setView([lat, lon], Math.max(map.getZoom(), 14)); }
  let site = liveCache.get(key);
  if (!site) {
    ['power', 'soil', 'slope'].forEach(k => setStatus(k, 'load', '…'));
    /* SoilGrids is often slow: it gets 5 s, then the page goes on with assumed soil and updates when the answer arrives */
    const soilP = getJSON(`https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon.toFixed(4)}&lat=${lat.toFixed(4)}&property=phh2o&property=soc&property=clay&property=sand&depth=0-5cm&depth=5-15cm&depth=15-30cm&depth=30-60cm&depth=60-100cm&value=mean`, 45000).then(soilFromGrids).catch(() => null);
    const [pw, slp] = await Promise.allSettled([getJSON(powerURL(lat, lon, '20010101', '20251231'), 60000), demSampler(lat, lon)]);
    const sgv = await Promise.race([soilP, new Promise(r => setTimeout(() => r(undefined), 5000))]);
    if (seq !== loadSeq) return;
    let cl = null;
    if (pw.status === 'fulfilled') { try { cl = buildClimate(pw.value.properties.parameter, lat); } catch (e) {} }
    if (!cl || cl.days.length < 3650) {
      setStatus('power', 'err', () => t('ดึงไม่ได้', 'failed')); ['soil', 'slope'].forEach(k => setStatus(k, 'wait', ''));
      $('liveTitle').textContent = t('ดึงข้อมูลภูมิอากาศจาก NASA POWER ไม่ได้ (อาจเป็นจุดในทะเล หรือเซิร์ฟเวอร์ไม่ตอบ)', 'Could not get climate from NASA POWER (ocean point, or the server did not answer)');
      $('retryBtn').hidden = false; $('retryBtn').onclick = () => loadLive(lat, lon);
      if (!S) { $('summary').dataset.err = '1'; $('summary').textContent = t('ยังไม่มีข้อมูล: ดึง NASA POWER ไม่ได้ กด "ลองใหม่" ในแผงแผนที่ หรือเลือกจุดอื่น', 'No data yet: NASA POWER did not respond. Press "Retry" in the map panel or pick another point.'); }
      return;
    }
    { const nd = cl.days.length.toLocaleString(); setStatus('power', 'ok', () => nd + t(' วัน', ' days')); }
    let soil = sgv || null, soilFallback = false;
    if (soil) setStatus('soil', 'ok', 'pH ' + soil.ph);
    else { soil = { ...SOIL_DEFAULT }; soilFallback = true;
      if (sgv === undefined) { setStatus('soil', 'load', () => t('ช้า ใช้ค่าสมมติไปก่อน', 'slow; assumed for now'));
        soilP.then(s2 => { const st0 = liveCache.get(key); if (!st0) return;
          if (s2) { st0.soil = s2; st0.soilFallback = false; if (st0 === S) { setStatus('soil', 'ok', 'pH ' + s2.ph); planKey = ''; evKey = ''; renderAll(); } }
          else if (st0 === S) setStatus('soil', 'err', () => t('ไม่มีค่า ใช้ค่าสมมติ', 'no value; assumed')); });
      } else setStatus('soil', 'err', () => t('ไม่มีค่า ใช้ค่าสมมติ', 'no value; assumed')); }
    const dem = slp.status === 'fulfilled' ? slp.value : null, slopeSamples = dem ? dem.samples : [];
    setStatus('slope', slopeSamples.length ? 'ok' : 'err', slopeSamples.length ? pct(slopeSamples, .5).toFixed(0) + '%' : () => t('ดึงไม่ได้', 'failed'));
    site = { lat, lon, clim: cl.clim, annual: cl.annual, yearly: cl.yearly, days: cl.days, soil, soilFallback, slopeSamples, dem, fetched: isoDay(Date.now()) };
    liveCache.set(key, site);
  } else { setStatus('power', 'ok', () => t('จากแคช', 'cached')); setStatus('soil', site.soilFallback ? 'err' : 'ok', 'pH ' + site.soil.ph); setStatus('slope', site.slopeSamples.length ? 'ok' : 'err', ''); }
  applySite(site);
  loadRecent(site);
  loadNdvi(site);
}
function setLoc() {
  if (!S) return;
  $('locText').innerHTML = t(`จุดที่วิเคราะห์ (ข้อมูลสด)<br>${fmtLL(S.lat, S.lon)}`, `Analysed point (live data)<br>${fmtLL(S.lat, S.lon)}`);
  $('liveTitle').textContent = t(`จุด ${fmtLL(S.lat, S.lon)} · ดึงเมื่อ ${S.fetched}`, `Point ${fmtLL(S.lat, S.lon)} · fetched ${S.fetched}`);
}
function applySite(site) {
  S = site; evKey = ''; recCache.key = ''; delete $('summary').dataset.err;
  if (map) setGrid(liveGrid(S));
  renderAll();
}
/* MODIS NDVI at the clicked pixel for the last year (ORNL DAAC web service; slow: ~30–60 s). Cloud-screened with pixel_reliability. */
function modisDates(off = 0) {
  const out = [], end = Date.now() - 12 * 864e5, start = end - 372 * 864e5;
  for (let y = new Date(start).getUTCFullYear(); y <= new Date(end).getUTCFullYear(); y++) for (let doy = 1 + off; doy <= 353 + off && doy <= 365; doy += 16) {
    const ms = Date.UTC(y, 0, doy); if (ms >= start && ms <= end) out.push({ a: `A${y}${String(doy).padStart(3, '0')}`, iso: isoDay(ms) });
  }
  return out;
}
/* Phenology rules on one year of NDVI. f scales the windows when the series is 8-day (Terra + Aqua) instead of 16-day. */
function ndviStats(a) {
  const K = a.length, f = Math.max(1, Math.round(K / 23)), mn = Math.min(...a), mx = Math.max(...a), amp = mx - mn, len = a.filter(v => v >= mn + 0.5 * amp).length / f; let pk = 0;
  const rng = n => Array.from({ length: n }, (_, j) => j + 1);
  for (let i = 0; i < K; i++) { if (rng(3 * f).every(j => a[i] > a[(i - j + K) % K] && a[i] >= a[(i + j) % K])) { const lo = Math.min(...rng(6 * f).map(j => Math.min(a[(i - j + K) % K], a[(i + j) % K]))); if (a[i] - lo > 0.1) pk++; } }
  return { mn, mx, amp, len, pk };
}
function classifyNdvi(a) {
  const { mn, mx, amp, len, pk } = ndviStats(a);
  if (mx < 0.35) return 1;                      /* never green */
  if (mn >= 0.55) return 0;                     /* always dense green */
  if (amp < 0.2 && mx < 0.5) return 5;          /* low and steady */
  if (amp < 0.25 && mn >= 0.4) return 6;        /* fairly green, small seasonal swing */
  if (pk >= 3) return 7; if (pk >= 2) return 2; if (len <= 9) return 3; return 4;
}
/* NASA GIBS: NDVI decoded from the MODIS_Terra_L3_NDVI_16Day image tiles with the layer's own colour map.
   Takes seconds instead of a minute and does not depend on the ORNL service; no per-pixel quality flags. */
let gibsCM = null;
async function gibsColormap() {
  if (gibsCM) return gibsCM;
  const r = await fetch('https://gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_NDVI.xml'); if (!r.ok) throw new Error('colormap ' + r.status);
  const x = await r.text(), ex = new Map(), list = [];
  for (const m of x.matchAll(/<ColorMapEntry rgb="(\d+),(\d+),(\d+)"[^>]*?\svalue="[\[(]([-\d.]+),([-\d.]+)[\])]"[^>]*>/g)) {
    if (/nodata="true"/.test(m[0])) continue;
    const v = (+m[4] + +m[5]) / 2, rgb = [+m[1], +m[2], +m[3]]; ex.set(rgb.join(), v); list.push([rgb, v]);
  }
  if (list.length < 20) throw new Error('colormap empty');
  return gibsCM = { ex, list };
}
function loadImg(u, ms = 20000) { return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; const to = setTimeout(() => rej(new Error('timeout')), ms); im.onload = () => { clearTimeout(to); res(im); }; im.onerror = () => { clearTimeout(to); rej(new Error('tile')); }; im.src = u; }); }
async function gibsNdvi(site, ds, layer = 'MODIS_Terra_L3_NDVI_16Day') {
  if (Math.abs(site.lat) > 80) throw new Error('latitude');
  const cm = await gibsColormap(), z = 9, n = 256 * 2 ** z, la = site.lat * Math.PI / 180;
  const gx = (site.lon + 180) / 360 * n, gy = (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n;
  const cell = 40075016.686 / n * Math.cos(la), hw = Math.max(4, Math.min(12, Math.ceil(2000 / cell)));
  const x0 = Math.floor(gx) - hw, y0 = Math.floor(gy) - hw, w = 2 * hw + 1, tiles = [];
  for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + w - 1) / 256); ty++) for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + w - 1) / 256); tx++) if (tx >= 0 && ty >= 0 && tx < 2 ** z && ty < 2 ** z) tiles.push([tx, ty]);
  const dec = (r, g, b, a) => {
    if (a < 128) return null; const k = r + ',' + g + ',' + b; let v = cm.ex.get(k);
    if (v === undefined) { let bd = 1e9; for (const [c, cv] of cm.list) { const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2; if (d < bd) { bd = d; v = cv; } } if (bd > 900) v = null; cm.ex.set(k, v); }
    return v;
  };
  const one = async d => {
    try {
      const cv = document.createElement('canvas'); cv.width = cv.height = w; const cx = cv.getContext('2d', { willReadFrequently: true });
      const ims = await Promise.all(tiles.map(([tx, ty]) => loadImg(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${d.iso}/GoogleMapsCompatible_Level9/${z}/${ty}/${tx}.png`)));
      ims.forEach((im, i) => cx.drawImage(im, tiles[i][0] * 256 - x0, tiles[i][1] * 256 - y0));
      const px = cx.getImageData(0, 0, w, w).data, data = []; let ok = 0;
      for (let i = 0; i < w * w; i++) { const v = dec(px[i * 4], px[i * 4 + 1], px[i * 4 + 2], px[i * 4 + 3]); if (v != null) ok++; data.push(v == null ? -3000 : Math.round(v * 1e4)); }
      return ok >= w * w * 0.3 ? { modis_date: d.a, calendar_date: d.iso, data } : null;
    } catch (e) { return null; }
  };
  const nd = (await Promise.all(ds.map(one))).filter(Boolean);
  return { nrows: w, ncols: w, nd, geo: { merc: { z, x0, y0 }, cell, src: 'gibs' } };
}
async function loadNdvi(site) {
  const after = () => { if (site !== S) return; if (map) setGrid(liveGrid(S)); drawCharts(); ndviNote(); siBlock(); update(); };
  if (site.ndvi || site.ndviFailed) { setStatus('ndvi', site.ndvi ? 'ok' : 'err', () => site.ndvi ? L2(RNAME[site.ndvi.cls]) : t('ดึงไม่ได้', 'failed')); after(); return; }
  setStatus('ndvi', 'load', '…'); if (site === S) { ndviNote(); siBlock(); }
  try {
    const ds = modisDates(); let nrows, ncols, nd, rel = null, geo;
    /* 1) NASA GIBS tiles: fast. 2) ORNL DAAC subset (true 250 m values + quality band) if GIBS gives too little. */
    /* Terra and Aqua composites are offset by 8 days: together they give an 8-day series (finer in time, same 250 m pixels) */
    const [g, ga] = await Promise.all([gibsNdvi(site, ds).catch(e => { console.warn('NDVI via GIBS', e); return null; }), gibsNdvi(site, modisDates(8), 'MODIS_Aqua_L3_NDVI_16Day').catch(() => null)]);
    if (g && g.nd.length >= 12) { ({ nrows, ncols, nd, geo } = g); if (ga && ga.nd.length >= 12 && ga.nrows === nrows) { nd = nd.concat(ga.nd); geo.aqua = true; } }
    else {
      if (site === S) setStatus('ndvi', 'load', () => t('~1 นาที (ORNL)', '~1 min (ORNL)'));
      const chunks = []; for (let i = 0; i < ds.length; i += 10) chunks.push(ds.slice(i, i + 10));
      const url = (band, ch) => `https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset?latitude=${site.lat.toFixed(5)}&longitude=${site.lon.toFixed(5)}&band=${band}&startDate=${ch[0].a}&endDate=${ch.at(-1).a}&kmAboveBelow=2&kmLeftRight=2`;
      const one = async (band, ch) => { for (let a = 0; a < 2; a++) { try { const j = await getJSON(url(band, ch), 90000, { headers: { Accept: 'application/json' } }); if (j && j.subset) return j; } catch (e) { } } return null; };
      const get = band => Promise.all(chunks.map(ch => one(band, ch))).then(a => a.filter(Boolean));
      const ndJ = await get('250m_16_days_NDVI');
      const meta = ndJ.find(x => x.subset.length); if (!meta) throw new Error(t('NASA GIBS และ ORNL ไม่ตอบ', 'neither NASA GIBS nor ORNL answered'));
      let rlJ = await get('250m_16_days_pixel_reliability'); if (!rlJ.length) rlJ = null;
      nrows = +meta.nrows; ncols = +meta.ncols; geo = { cell: +meta.cellsize, xll: +meta.xllcorner, yll: +meta.yllcorner, src: 'ornl' };
      nd = ndJ.flatMap(x => x.subset || []);
      rel = rlJ ? new Map(rlJ.flatMap(x => x.subset || []).map(x => [x.modis_date, x.data])) : null;
    }
    const N = nrows * ncols; nd.sort((a, b) => a.calendar_date < b.calendar_date ? -1 : 1);
    if (nd.length < 8) throw new Error(t('ได้ภาพ NDVI น้อยเกินไป', 'too few NDVI composites returned'));
    const dates = nd.map(x => x.calendar_date);
    const series = p => {
      let raw = nd.map(x => { const v = +x.data[p], q = rel && rel.get(x.modis_date); return (!q || +q[p] === 0 || +q[p] === 1) && v > -2000 ? v * 1e-4 : null; });
      /* no quality band: drop sudden dips (cloud lowers NDVI) and let them be interpolated */
      if (!rel) raw = raw.map((v, i) => v != null && raw[i - 1] != null && raw[i + 1] != null && v < (raw[i - 1] + raw[i + 1]) / 2 - 0.12 ? null : v);
      let clear = raw.filter(v => v != null).length, loose = false;
      if (clear < 6) {
        /* very cloudy pixel: use every valid value and keep the upper envelope (cloud only lowers NDVI) */
        const all = nd.map(x => +x.data[p] > -2000 ? +x.data[p] * 1e-4 : null); if (all.filter(v => v != null).length < 6) return { raw, clear, smooth: null };
        raw = all.map((v, i) => v == null ? null : Math.max(v, all[i - 1] ?? v, all[i + 1] ?? v)); loose = true;
      }
      const x = raw.slice(); let last = -1;
      for (let i = 0; i < x.length; i++) if (x[i] != null) { if (last < 0) for (let k = 0; k < i; k++) x[k] = x[i]; else for (let k = last + 1; k < i; k++) x[k] = x[last] + (x[i] - x[last]) * (k - last) / (i - last); last = i; }
      for (let k = last + 1; k < x.length; k++) x[k] = x[last];
      let sm = x; for (let pass = 0; pass < (geo.aqua ? 2 : 1); pass++) sm = sm.map((v, i) => i === 0 || i === sm.length - 1 ? v : 0.25 * sm[i - 1] + 0.5 * v + 0.25 * sm[i + 1]);
      return { raw, clear, loose, smooth: sm };
    };
    const px = Array.from({ length: N }, (_, p) => series(p));
    const cen = px[Math.floor(nrows / 2) * ncols + Math.floor(ncols / 2)];
    if (!cen.smooth) throw new Error(t('pixel นี้ไม่มีค่า NDVI ที่ใช้ได้ (น้ำ หรือเมฆทั้งปี)', 'no usable NDVI at this pixel (water, or cloud all year)'));
    const monthMean = sm => { const by = Array.from({ length: 12 }, () => []); dates.forEach((d, i) => by[+d.slice(5, 7) - 1].push(sm[i])); return by.map(a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN); };
    const lowOf = sm => { const a = [...sm].sort((x, y) => x - y).slice(0, 4); return a.reduce((s, v) => s + v, 0) / a.length; };
    const mMean = monthMean(cen.smooth), order = mMean.map((v, m) => [v, m]).filter(p => !isNaN(p[0])).sort((a, b) => a[0] - b[0]);
    const lowM = order[0][1], lowMonths = [lowM, (lowM + 1) % 12].filter(m => !isNaN(mMean[m]) && mMean[m] <= order[0][0] + 0.08);
    /* Two classifications of every pixel: fixed phenology rules, and k-means on the NDVI profiles */
    const rule = px.map(q => q.smooth ? classifyNdvi(q.smooth) : -1), valid = px.map((q, p) => q.smooth ? p : -1).filter(p => p >= 0);
    const area = { nrows, ncols, ...geo, prof: px.map(q => q.smooth), rule, loose: px.filter(q => q.loose).length, km: new Array(N).fill(null), lowNd: px.map(q => q.smooth ? lowOf(q.smooth) : null), k: 0, cents: [], agree: null, valid: valid.length, noQA: !rel };
    /* k from the data: try 2..8 and stop when one more group no longer cuts the within-group spread by 8 % of the k=2 spread */
    const kMax = Math.min(8, Math.floor(valid.length / 8)), X = valid.map(p => px[p].smooth); let k = 0, res = null;
    if (kMax >= 2) { const runs = []; for (let q = 2; q <= kMax; q++) runs[q] = kmeans(X, q, 4); k = kMax; for (let q = 3; q < kMax; q++) if ((runs[q].sse - runs[q + 1].sse) < 0.08 * runs[2].sse) { k = q; break; } if (kMax < 3) k = kMax; res = runs[k]; area.kTried = kMax; }
    if (k >= 2) {
      const ord = res.C.map((c, i) => [c.reduce((a, b) => a + b, 0) / c.length, i]).sort((a, b) => b[0] - a[0]).map(x => x[1]), pos = []; ord.forEach((o, i) => pos[o] = i);
      valid.forEach((p, i) => area.km[p] = pos[res.lab[i]]);
      area.cents = ord.map(o => { const c = res.C[o], mm = monthMean(c), lo = mm.map((v, m) => [v, m]).filter(q => !isNaN(q[0])).sort((a, b) => a[0] - b[0])[0][1]; return { prof: c.map(v => +v.toFixed(3)), mean: c.reduce((a, b) => a + b, 0) / c.length, amp: Math.max(...c) - Math.min(...c), lowM: lo, rule: classifyNdvi(c) }; });
      let agreeN = 0; for (let c = 0; c < k; c++) { const cnt = new Array(RNAME.length).fill(0); valid.forEach(p => { if (area.km[p] === c) cnt[rule[p]]++; }); agreeN += Math.max(...cnt); }
      area.k = k; area.agree = agreeN / valid.length; area.sse = res.sse;
    }
    site.ndvi = { dates, raw: cen.raw, smooth: cen.smooth.map(v => +v.toFixed(3)), cls: classifyNdvi(cen.smooth), min: Math.min(...cen.smooth), max: Math.max(...cen.smooth), clear: cen.clear, total: dates.length,
      bareMonths: mMean.map((v, m) => v < 0.3 ? m : -1).filter(m => m >= 0), lowMonths, area };
    setStatus('ndvi', 'ok', () => L2(RNAME[site.ndvi.cls]));
  } catch (e) { console.warn('NDVI', e); site.ndviFailed = (e && e.name === 'AbortError') ? t('หมดเวลารอบริการ MODIS', 'the MODIS service timed out') : ((e && e.message) || 'error'); setStatus('ndvi', 'err', () => t('ดึงไม่ได้', 'failed')); }
  after();
}
/* SI section: k-means vs rules for the pixels around the point */
function siBlock() {
  const el = $('siBody'); if (!el || !S) return;
  const A = S.ndvi && S.ndvi.area;
  $('cProf').closest('.chartbox').style.display = A && A.k ? '' : 'none';
  if (!A) { el.innerHTML = `<p class="note">${S.ndviFailed ? t('ดึง NDVI จาก MODIS ไม่ได้ จึงเทียบ 2 วิธีที่จุดนี้ไม่ได้', 'MODIS NDVI could not be fetched, so the two methods cannot be compared here') : t('กำลังดึง NDVI ของ pixel รอบจุดนี้จาก MODIS… (~1 นาที)', 'Fetching MODIS NDVI for the pixels around this point… (~1 min)')}</p>`; return; }
  const row = (a, b, c) => `<tr><td>${a}</td><td>${b}</td><td>${c}</td></tr>`;
  const ruleShare = RNAME.map((nm, i) => [L2(nm), A.rule.filter(v => v === i).length]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).map(x => `${x[0]} ${Math.round(x[1] / A.rule.length * 100)}%`).join(' · ');
  el.innerHTML = `<div class="tbl"><table>
    <thead><tr><th></th><th>k-means${A.k ? ` (k=${A.k})` : ''}</th><th>${t('กฎ phenology', 'Phenology rules')}</th></tr></thead><tbody>
    ${row(t('หลักการ', 'Idea'), t('จัดกลุ่ม pixel ที่กราฟ NDVI 1 ปีคล้ายกัน ไม่ต้องมีป้ายกำกับ', 'Groups pixels with similar 1-year NDVI curves; no labels needed'), t('เกณฑ์ตายตัว: NDVI ต่ำสุด สูงสุด จำนวนพีค ความยาวฤดู', 'Fixed thresholds: min / max NDVI, peak count, season length'))}
    ${row(t('ข้อดี', 'Strength'), t('แยกระดับความหนาแน่นของพืชได้ ปรับตามพื้นที่เอง', 'Separates canopy-density levels; adapts to the place'), t('อธิบายได้ทันที ใช้ได้กับ pixel เดียว', 'Directly interpretable; works on a single pixel'))}
    ${row(t('ข้อเสีย', 'Weakness'), t('ต้องตีความกลุ่มเอง และ pixel น้อยผลจะหยาบ', 'Groups need interpreting; coarse with few pixels'), t('เกณฑ์เดียวใช้ทั้งโลก pixel ปนถูกรวมกลุ่ม', 'One set of thresholds worldwide; mixed pixels collapse'))}
    ${row(t('ผลที่จุดนี้', 'Result here'), A.k ? A.cents.map((_, i) => `${kmName(A, i)} (${Math.round(A.km.filter(v => v === i).length / A.rule.length * 100)}%)`).join('<br>') : t('pixel ที่ใช้ได้น้อยเกินไป', 'too few usable pixels'), ruleShare)}
    <tr><td>${t('ผลตรงกัน', 'Agreement')}</td><td colspan="2">${A.agree == null ? '—' : `<b>${Math.round(A.agree * 100)}%</b> ` + t('ของ pixel (แต่ละกลุ่ม k-means จับคู่กับคลาสกฎที่พบมากสุด)', 'of pixels (each k-means group matched to its most common rule class)')}</td></tr>
    </tbody></table></div>
    <p class="note" style="margin-top:6px">${t(`MODIS MOD13Q1 250 m · ${A.nrows}×${A.ncols} pixel (ใช้ได้ ${A.valid}) · ดูผลบนแผนที่ที่ชั้น "รูปแบบพืชพรรณ (k-means)" และ "รูปแบบ (กฎ)" · ทั้งสองวิธีบอกรูปแบบความเขียว ไม่ได้บอกชื่อพืช`, `MODIS MOD13Q1 250 m · ${A.nrows}×${A.ncols} pixels (${A.valid} usable) · see both on the map layers "Vegetation pattern (k-means)" and "Pattern (rules)" · both describe greenness patterns, not crop names`)}${A.noQA ? t(' · ไม่ได้กรองเมฆ (ดึงแถบคุณภาพไม่ได้)', ' · not cloud-screened (quality band unavailable)') : ''}</p>`;
}

/* ---------- crop screening: ECOCROP ranges × NASA POWER climate × soil pH ---------- */
let CROPDB = null;
const ROLE = { nfix: { th: 'ตรึง N', en: 'N-fixing' }, cover: { th: 'คลุมดิน', en: 'cover' }, deep: { th: 'รากลึก', en: 'deep roots' }, drought: { th: 'ทนแล้ง', en: 'drought-tolerant' } };
const trap = (v, a, b, c, d) => v <= a || v >= d ? 0 : v < b ? (v - a) / (b - a) : v <= c ? 1 : (d - v) / (d - c);
function siteTP(st) {
  if (!S.tmean) { const sum = new Array(12).fill(0), n = new Array(12).fill(0); for (const d of S.days) { sum[d.m] += (d.tx + d.tn) / 2; n[d.m]++; } S.tmean = sum.map((v, m) => v / n[m]); }
  return { T: S.tmean.map(v => v + st.dT), P: S.clim.map(c => c[0] * (1 + st.rf)), ph: S.soil.ph, irr: st.irr };
}
const cycleMonths = c => Math.max(1, Math.min(12, Math.round(c.days / 30)));
/* Fit of crop c sown in month s0: min of three ECOCROP trapezoids (monthly temperature, rain over the cycle, soil pH).
   ECOCROP rain limits describe a typical full cycle; they are scaled when our cycle is shorter (assumption, floor 0.3). */
function fitAt(c, s0, E) {
  const nm = cycleMonths(c), f = Math.min(1, Math.max(0.3, c.days / ((c.gmin + c.gmax) / 2)));
  const ms = Array.from({ length: nm }, (_, i) => (s0 + i) % 12);
  let ts = 1, tm = ms[0]; for (const m of ms) { const v = trap(E.T[m], c.tmin, c.topmn, c.topmx, c.tmax); if (v < ts) { ts = v; tm = m; } }
  const rain = ms.reduce((a, m) => a + E.P[m], 0);
  let rs = trap(rain, c.rmin * f, c.ropmn * f, c.ropmx * f, c.rmax * f); if (E.irr && rain < c.ropmn * f) rs = 1;
  const ps = trap(E.ph, c.phmin, c.phopmn, c.phopmx, c.phmax), suit = Math.min(ts, rs, ps);
  let why = null;
  if (suit < 1) {
    if (ts <= rs && ts <= ps) { const v = E.T[tm]; why = v > c.topmx ? { th: `${MTH.th[tm]} ร้อนเกิน (${v.toFixed(0)} °C, เหมาะสุดไม่เกิน ${c.topmx})`, en: `${MTH.en[tm]} too hot (${v.toFixed(0)} °C, optimum ≤ ${c.topmx})` } : { th: `${MTH.th[tm]} เย็นเกิน (${v.toFixed(0)} °C, เหมาะสุดตั้งแต่ ${c.topmn})`, en: `${MTH.en[tm]} too cool (${v.toFixed(0)} °C, optimum ≥ ${c.topmn})` }; }
    else if (rs <= ps) why = rain < c.ropmn * f ? { th: `ฝนช่วงปลูกน้อยเกิน (${Math.round(rain)} mm, ต้องการ ≥ ${Math.round(c.ropmn * f)})`, en: `too little rain in the cycle (${Math.round(rain)} mm, needs ≥ ${Math.round(c.ropmn * f)})` } : { th: `ฝนช่วงปลูกมากเกิน (${Math.round(rain)} mm, เหมาะสุด ≤ ${Math.round(c.ropmx * f)})`, en: `too much rain in the cycle (${Math.round(rain)} mm, optimum ≤ ${Math.round(c.ropmx * f)})` };
    else why = { th: `pH ดิน ${E.ph} อยู่นอกช่วงเหมาะสุด ${c.phopmn}–${c.phopmx}`, en: `soil pH ${E.ph} outside the optimum ${c.phopmn}–${c.phopmx}` };
  }
  return { c, suit, start: s0, nm, ts, rs, ps, tm, rain, f, why, pass: suit >= 0.5 };
}
function screenCrops(st) {
  if (!CROPDB || !S) return null;
  const E = siteTP(st);
  return CROPDB.map(c => { let best = null; for (let s0 = 0; s0 < 12; s0++) { const r = fitAt(c, s0, E); if (!best || r.suit > best.suit || (r.suit === best.suit && r.rain > best.rain)) best = r; } return best; }).sort((a, b) => b.suit - a.suit);
}
/* ---------- rotation builder: current crop + screened crops that fit the idle window ---------- */
const winTxt = (s0, nm, lang) => nm >= 12 ? (lang === 'th' ? 'ทั้งปี' : 'all year') : `${MTH[lang][s0]}–${MTH[lang][(s0 + nm - 1) % 12]}`;
function kcSeq(c, nm) {
  const mid = KC_OVERRIDE[c.id] || TYPE[c.type].kc, end = c.type === 'cover' || c.type === 'forage' ? mid * .9 : .6;
  if (nm === 1) return [mid * .8]; if (nm === 2) return [.6, mid];
  return Array.from({ length: nm }, (_, i) => i === 0 ? .4 : i === nm - 1 ? end : mid);
}
function makePlan(parts, kind, role) {
  const m = {}; parts.forEach(pt => kcSeq(pt.c, pt.nm).forEach((kc, i) => { m[(pt.start + i) % 12] = [pt.c.id, kc]; }));
  const main = parts[0], add = parts[1], comb = k => 1 - parts.reduce((a, pt) => a * (1 - pt.c[k]), 1);
  const nameOf = l => parts.map(pt => `${pt.c[l]} (${winTxt(pt.start, pt.nm, l)})`).join(' + ');
  const idle = 12 - Object.keys(m).length, rolesOf = (c, l) => c.roles.filter(x => ROLE[x]).map(x => ROLE[x][l]).join(', ');
  const p = { kind, role, parts, crops: parts.map(pt => pt.c.id), m, name: { th: nameOf('th'), en: nameOf('en') }, om: comb('om'), n: comb('n'), deep: Math.max(...parts.map(pt => pt.c.deep)),
    income: Math.min(1, main.c.income + (add ? .35 * add.c.income : 0)), machine: !!add && add.c.type === 'cover', labor: !!add && add.c.type !== 'cover' };
  const forage = c => c.type === 'legume' || c.type === 'cover' || c.type === 'forage' ? { th: `${c.th}: ใบและต้นใช้เป็นอาหารสัตว์ได้ (ตรวจชนิดก่อน บางชนิดเมล็ดเป็นพิษ)`, en: `${c.en}: foliage can be used as fodder (check the species; some seeds are toxic)` } : { th: `${c.th}: เศษซากหลังเก็บเกี่ยวใช้เลี้ยงสัตว์หรือคลุมดินได้`, en: `${c.en}: residues can feed livestock or mulch the soil` };
  p.forage = forage((add || main).c);
  if (kind === 'current') {
    p.why = { th: 'พืชที่ปลูกอยู่ตอนนี้ ใช้เป็นเส้นฐานในการเทียบ', en: 'What is grown now; the baseline for comparison' };
    p.benefit = { th: 'คุ้นเคย มีตลาดและเครื่องมืออยู่แล้ว', en: 'Familiar, with an existing market and equipment' };
    p.gap = { th: 'ผลผลิตและราคาจริงของแปลง เดือนปลูกจริง', en: 'Actual field yield and price; actual sowing month' };
    p.risk = idle > 0 ? { th: `แปลงว่าง ${idle} เดือน เสี่ยงดินพังและวัชพืช ปลูกพืชเดิมซ้ำทำให้ศัตรูพืชสะสม${main.why ? ' · ' + main.why.th : ''}`, en: `Field idle for ${idle} months: erosion and weeds; repeating one crop builds up pests${main.why ? ' · ' + main.why.en : ''}` } : { th: 'พืชเดิมอยู่ในแปลงทั้งปี ศัตรูพืชและโรคสะสม ดึงธาตุอาหารต่อเนื่อง', en: 'One crop occupies the field all year: pests and disease build up, nutrients are drawn down' };
  } else if (kind === 'add') {
    p.why = { th: `เติม ${add.c.th} (${rolesOf(add.c, 'th')}) ในช่วงแปลงว่าง ${winTxt(add.start, add.nm, 'th')} · เข้ากับอากาศช่วงนั้น ${Math.round(add.suit * 100)}%`, en: `Adds ${add.c.en} (${rolesOf(add.c, 'en')}) in the idle window ${winTxt(add.start, add.nm, 'en')} · ${Math.round(add.suit * 100)}% fit to that season` };
    const b = { nfix: { th: 'ตรึงไนโตรเจนให้พืชรอบถัดไป ลดปุ๋ย', en: 'fixes nitrogen for the next crop, less fertiliser' }, cover: { th: 'คลุมดินช่วงที่เคยว่าง ลดดินพัง เพิ่มอินทรียวัตถุ', en: 'covers soil that used to be bare, less erosion, more organic matter' }, deep: { th: 'รากลึกใช้น้ำชั้นล่างและช่วยให้น้ำซึมดีขึ้น', en: 'deep roots use stored water and improve infiltration' }, drought: { th: 'ทนฝนทิ้งช่วง', en: 'tolerates dry spells' } };
    p.benefit = { th: add.c.roles.filter(x => b[x]).map(x => b[x].th).join(' · ') + ' · เปลี่ยนวงศ์พืช ตัดวงจรศัตรูพืช', en: add.c.roles.filter(x => b[x]).map(x => b[x].en).join(' · ') + ' · a different plant family breaks pest cycles' };
    p.gap = { th: `พันธุ์และตลาดของ${add.c.th}ในพื้นที่ · ผลตรวจดินในแปลง · ความชื้นดินตอนปลูกจริง`, en: `Local varieties and market for ${add.c.en} · a field soil test · actual soil moisture at sowing` };
    p.risk = { th: `${add.why ? add.why.th + ' · ' : ''}${p.machine ? 'ต้องไถกลบให้ทันก่อนพืชหลัก ไม่มีรายได้โดยตรง' : 'ต้องใช้แรงงานและเมล็ดพันธุ์เพิ่ม'} · ช่วงเปลี่ยนพืชต้องไม่ชนกับเก็บเกี่ยวพืชหลัก`, en: `${add.why ? add.why.en + ' · ' : ''}${p.machine ? 'must be incorporated in time before the main crop; no direct income' : 'needs extra labour and seed'} · the changeover must not clash with the main harvest` };
  } else {
    p.why = { th: `เปลี่ยนพืชหลักเป็น ${main.c.th}${rolesOf(main.c, 'th') ? ' (' + rolesOf(main.c, 'th') + ')' : ''} ซึ่งเข้ากับอากาศของจุดนี้ ${Math.round(main.suit * 100)}%`, en: `Switches the main crop to ${main.c.en}${rolesOf(main.c, 'en') ? ' (' + rolesOf(main.c, 'en') + ')' : ''}, a ${Math.round(main.suit * 100)}% fit to this climate` };
    p.benefit = { th: 'ทางเลือกเมื่อพืชเดิมเสี่ยงขึ้นจากอากาศที่เปลี่ยน · เปลี่ยนวงศ์พืชช่วยตัดวงจรศัตรูพืช', en: 'An option when the current crop becomes riskier as climate shifts · a new family breaks pest cycles' };
    p.gap = { th: `ตลาด ราคา และพันธุ์ของ${main.c.th}ในพื้นที่ · ต้นทุนเปลี่ยนเครื่องมือ`, en: `Local market, price and varieties for ${main.c.en} · cost of changing equipment` };
    p.risk = { th: `${main.why ? main.why.th + ' · ' : ''}การเปลี่ยนพืชหลักต้องมีตลาดรองรับและความรู้ใหม่ ควรลองบางส่วนของแปลงก่อน`, en: `${main.why ? main.why.en + ' · ' : ''}switching the main crop needs a market and new know-how; trial it on part of the field first` };
  }
  return p;
}
function buildPlans(st) {
  if (!CROPDB || !S) return;
  const key = [S.lat, S.lon, st.mainCrop, st.mainMonth, st.irr, JSON.stringify(CUSTOM)].join('|');
  if (key === planKey) return;
  const E = siteTP({ rf: 0, dT: 0, irr: st.irr }), scr = screenCrops({ rf: 0, dT: 0, irr: st.irr }), by = Object.fromEntries(scr.map(x => [x.c.id, x]));
  const cash = x => !['cover', 'forage'].includes(x.c.type);
  /* current crop: the user's choice, else a guess = best-fitting grain / root / cash crop */
  const guess = scr.filter(cash).sort((a, b) => b.suit - a.suit || CROPDB.indexOf(a.c) - CROPDB.indexOf(b.c))[0];
  const mainC = (st.mainCrop && by[st.mainCrop] ? by[st.mainCrop] : guess).c;
  const main = st.mainMonth !== 'auto' ? fitAt(mainC, +st.mainMonth, E) : by[mainC.id];
  S.guess = { id: mainC.id, auto: !st.mainCrop, start: main.start };
  const plans = [makePlan([main], 'current')], used = new Set([mainC.id]);
  const busy = new Set(Array.from({ length: main.nm }, (_, i) => (main.start + i) % 12)), idleLen = 12 - main.nm, idle0 = (main.start + main.nm) % 12;
  for (const role of ['nfix', 'cover', 'deep', 'drought']) {
    let best = null;
    for (const x of scr) {
      const c = x.c; if (used.has(c.id) || !c.roles.includes(role) || c.fam === mainC.fam) continue;
      const nm = cycleMonths(c); if (nm > idleLen) continue;
      for (let o = 0; o + nm <= idleLen; o++) { const r = fitAt(c, (idle0 + o) % 12, E); if (!r.pass) continue; const sc = r.suit + .15 * (c.om + c.n) + (role === 'deep' ? .2 * c.deep : 0); if (!best || sc > best.sc) best = { r, sc }; }
    }
    if (best) { used.add(best.r.c.id); plans.push(makePlan([main, best.r], 'add', role)); }
  }
  const sw = scr.filter(x => x.pass && cash(x) && !used.has(x.c.id));
  const pick = f => sw.filter(f).sort((a, b) => b.suit - a.suit || b.c.income - a.c.income)[0];
  for (const f of [x => x.c.roles.includes('drought') && x.c.fam !== mainC.fam, x => x.c.roles.includes('nfix'), x => true]) {
    if (plans.length >= 6 || (plans.length >= 4 && plans.some(p => p.kind === 'switch'))) break;
    const x = pick(y => f(y) && !used.has(y.c.id)); if (x) { used.add(x.c.id); plans.push(makePlan([x], 'switch')); }
  }
  /* user-defined rotations */
  CUSTOM.forEach(cu => {
    cu.err = null;
    const mp = cu.main && by[cu.main] ? by[cu.main] : main, parts = [mp];
    if (cu.add && by[cu.add]) {
      const c = by[cu.add].c, nm = cycleMonths(c), busyM = new Set(Array.from({ length: mp.nm }, (_, i) => (mp.start + i) % 12)), free = s0 => Array.from({ length: nm }, (_, i) => (s0 + i) % 12).every(m => !busyM.has(m));
      let r = null;
      if (cu.month !== 'auto') { if (free(+cu.month)) r = fitAt(c, +cu.month, E); }
      else for (let s0 = 0; s0 < 12; s0++) if (free(s0)) { const x = fitAt(c, s0, E); if (!r || x.suit > r.suit || (x.suit === r.suit && x.rain > r.rain)) r = x; }
      if (!r) { cu.err = { th: `${c.th} (${nm} เดือน) ลงในช่วงว่างของ${mp.c.th}ไม่ได้`, en: `${c.en} (${nm} months) does not fit in the idle window of ${mp.c.en}` }; return; }
      parts.push(r);
    } else if (mp === main) { cu.err = { th: 'เหมือนแผนปัจจุบัน เลือกพืชอื่น', en: 'Same as the current rotation; pick another crop' }; return; }
    const p = makePlan(parts, parts.length > 1 ? 'add' : 'switch', parts.length > 1 ? (parts[1].c.roles.find(x => ROLE[x]) || null) : null); p.custom = true; plans.push(p);
  });
  plans.forEach((p, i) => p.id = 'ABCDEFGHIJK'[i]);
  HIDE = new Set([...HIDE].filter(id => plans.some(p => p.id === id)));
  R = plans; planKey = key; evKey = ''; recCache.key = '';
  CROPS = {}; CROPDB.forEach(c => CROPS[c.id] = { name: { th: c.th, en: c.en }, color: TYPE[c.type].col, sens: TYPE[c.type].sens, fam: c.fam, ph: [c.phopmn, c.phopmx], deep: c.roles.includes('deep') });
  buildIncome(); baseOptions(); customUI();
}
function buildIncome() {
  $('incomeBox').innerHTML = R.map((r, i) => `<div class="ctl"><label for="inc${i}"><span>${r.id} · ${L2(r.name)}</span><output id="oInc${i}">${Math.round(r.income * 10)}</output></label><input id="inc${i}" type="range" min="0" max="10" value="${Math.round(r.income * 10)}"></div>`).join('');
  R.forEach((_, i) => $('inc' + i).addEventListener('input', update));
}
function baseOptions() {
  if (!CROPDB) return;
  const cur = $('baseSel').value, g = S && S.guess;
  $('baseSel').innerHTML = `<option value="">${t('เดาให้จากอากาศ', 'Guess from climate')}${g && g.auto ? ': ' + L2(CROPS[g.id] ? CROPS[g.id].name : { th: '', en: '' }) : ''}</option>` + CROPDB.map(c => `<option value="${c.id}"${c.id === cur ? ' selected' : ''}>${L2(c)}</option>`).join('');
  const cm = $('baseMonth').value || 'auto';
  $('baseMonth').innerHTML = `<option value="auto">${t('เดือนเริ่มปลูก: ช่วงที่เหมาะสุด', 'Sowing month: best window')}${g ? ' (' + MTH[LANG][g.start] + ')' : ''}</option>` + MTH[LANG].map((m, i) => `<option value="${i}"${String(i) === cm ? ' selected' : ''}>${t('เริ่มปลูก ', 'Sown in ')}${m}</option>`).join('');
}
function screenBlock(st) {
  const el = $('screenBody'); if (!el) return null;
  const res = screenCrops(st);
  if (!res) { el.innerHTML = `<p class="note">${t('กำลังโหลดฐานข้อมูลพืช…', 'Loading the crop database…')}</p>`; return null; }
  const ok = res.filter(r => r.pass), types = Object.keys(TYPE).filter(ty => res.some(r => r.c.type === ty));
  const rows = res.filter(r => scrType === 'all' || r.c.type === scrType);
  const roles = c => c.roles.filter(x => ROLE[x]).map(x => `<span class="tag">${L2(ROLE[x])}</span>`).join('') || '—';
  const top = ok.slice(0, 6).map(r => `<span class="chipc">${typeDot(r.c.type)}${L2(r.c)} ${Math.round(r.suit * 100)}%</span>`).join('');
  el.innerHTML = `<p style="margin:0 0 6px">${t(`<b>${ok.length} จาก ${res.length} ชนิด</b> ปลูกได้ที่จุดนี้ตามอุณหภูมิ ฝน และ pH ดิน`, `<b>${ok.length} of ${res.length} crops</b> fit this point on temperature, rainfall and soil pH`)}${st.irr ? t(' (มีชลประทาน)', ' (irrigated)') : ''}${st.rf || st.dT ? t(' · ตาม scenario ที่ตั้งไว้', ' · under the chosen scenario') : ''}</p>
    <div class="row" style="margin-bottom:6px">${top}${ok.length > 6 ? `<span class="chipc">+${ok.length - 6}</span>` : ''}</div>
    <details id="scrDet"${scrOpen ? ' open' : ''}><summary>${t(`ดูทั้ง ${res.length} ชนิด แยกตามประเภท และเหตุผลที่ผ่าน / ไม่ผ่าน`, `See all ${res.length} crops by type, and why each passes or fails`)}</summary>
    <div class="row" style="margin:8px 0" role="group">${[['all', t('ทั้งหมด', 'All')], ...types.map(ty => [ty, L2(TYPE[ty].l)])].map(([k, l]) => `<button type="button" class="btn" data-scrtype="${k}" aria-pressed="${k === scrType}">${k === 'all' ? '' : typeDot(k)}${l} <b>${k === 'all' ? ok.length : ok.filter(r => r.c.type === k).length}/${k === 'all' ? res.length : res.filter(r => r.c.type === k).length}</b></button>`).join('')}</div>
    <div class="tbl"><table><thead><tr><th>${t('พืช', 'Crop')}</th><th>${t('ประเภท', 'Type')}</th><th>${t('เหมาะสม', 'Fit')}</th><th>${t('ช่วงปลูกที่ดีสุด', 'Best window')}</th><th>${t('บทบาท', 'Role')}</th><th>${t('ข้อจำกัดหลัก', 'Main limit')}</th></tr></thead><tbody>
    ${rows.map(r => `<tr${r.pass ? '' : ' style="opacity:.6"'}><td>${typeDot(r.c.type)}<b>${L2(r.c)}</b></td><td>${L2(TYPE[r.c.type].l)}</td><td style="white-space:nowrap"><span class="fitbar"><i style="width:${Math.round(r.suit * 100)}%;background:${fitCol(r.suit)}"></i></span> ${Math.round(r.suit * 100)}%${r.pass ? '' : ' ✕'}</td><td>${winTxt(r.start, r.nm, LANG)}</td><td>${roles(r.c)}</td><td>${r.why ? L2(r.why) : '—'}</td></tr>`).join('')}</tbody></table></div>
    <p class="note" style="margin-top:8px">${t('แถบ: เขียว ≥ 80% · เหลือง 50–79% · แดง < 50% (ไม่ผ่าน ✕) · จุดสี = ประเภทพืช · ช่วงที่พืชทนได้มาจาก FAO ECOCROP (ช่วงกว้างระดับโลก ไม่แยกพันธุ์) เทียบกับอุณหภูมิและฝนรายเดือนจาก NASA POWER และ pH จาก SoilGrids · ไม่ได้บอกเรื่องตลาด โรค หรือพันธุ์ในพื้นที่', 'Bar: green ≥ 80% · yellow 50–79% · red < 50% (fails ✕) · dot = crop type · tolerance ranges are from FAO ECOCROP (broad, global, not variety-specific), compared with monthly temperature and rain from NASA POWER and pH from SoilGrids · says nothing about markets, disease or local varieties')}</p></details>`;
  $('scrDet').addEventListener('toggle', e => { scrOpen = e.target.open; });
  el.querySelectorAll('[data-scrtype]').forEach(b => b.onclick = () => { scrType = b.dataset.scrtype; scrOpen = true; screenBlock(readState()); });
  return res;
}
/* ---------- custom rotations + comparison table ---------- */
function customUI() {
  const el = $('customBox'); if (!el || !CROPDB) return;
  const opts = (sel, first) => `<option value="">${first}</option>` + Object.keys(TYPE).map(ty => { const cs = CROPDB.filter(c => c.type === ty); return cs.length ? `<optgroup label="${L2(TYPE[ty].l)}">${cs.map(c => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${L2(c)}</option>`).join('')}</optgroup>` : ''; }).join('');
  const keep = { m: $('cuMain') ? $('cuMain').value : '', a: $('cuAdd') ? $('cuAdd').value : '', mo: $('cuMonth') ? $('cuMonth').value : 'auto' };
  el.innerHTML = `<div class="row" style="align-items:flex-end">
      <div class="ctl" style="flex:1;min-width:150px"><label for="cuMain">${t('พืชหลัก', 'Main crop')}</label><select id="cuMain">${opts(keep.m, t('เหมือนที่ปลูกอยู่', 'Same as current'))}</select></div>
      <div class="ctl" style="flex:1;min-width:150px"><label for="cuAdd">${t('พืชเสริมในช่วงว่าง', 'Extra crop in the idle window')}</label><select id="cuAdd">${opts(keep.a, t('ไม่มี', 'None'))}</select></div>
      <div class="ctl" style="flex:1;min-width:130px"><label for="cuMonth">${t('เดือนปลูกพืชเสริม', 'Extra crop sown in')}</label><select id="cuMonth"><option value="auto">${t('ช่วงที่เหมาะสุด', 'Best window')}</option>${MTH[LANG].map((m, i) => `<option value="${i}"${String(i) === keep.mo ? ' selected' : ''}>${m}</option>`).join('')}</select></div>
      <button type="button" class="btn" id="cuGo" aria-pressed="true">${t('+ เพิ่มแผนนี้', '+ Add this rotation')}</button>
    </div>
    <div id="cuList" style="margin-top:6px">${CUSTOM.map((cu, i) => `<span class="chipc">${cu.err ? '⚠ ' + L2(cu.err) : t('แผนของคุณ ', 'Your plan ') + (i + 1)} <button type="button" class="x" data-cudel="${i}" aria-label="remove">×</button></span>`).join('')}</div>`;
  $('cuGo').onclick = () => { if (!$('cuMain').value && !$('cuAdd').value) return; if (CUSTOM.length >= 4) CUSTOM.shift(); CUSTOM.push({ main: $('cuMain').value, add: $('cuAdd').value, month: $('cuMonth').value }); update(); };
  el.querySelectorAll('[data-cudel]').forEach(b => b.onclick = () => { CUSTOM.splice(+b.dataset.cudel, 1); update(); });
}
function compareTable(st, ev, soil, scores, scrBy) {
  const el = $('cmpBody'); if (!el) return;
  const idx = R.map((_, i) => i).filter(i => !HIDE.has(R[i].id));
  const fitOf = r => scrBy ? Math.min(...r.crops.map(k => scrBy[k] ? scrBy[k].suit : 1)) : NaN;
  const rowsDef = [
    [t('คะแนนรวม (ตามน้ำหนักที่ตั้ง)', 'Overall score (your weights)'), i => scores[i], v => Math.round(v), true],
    [t('พืชเข้ากับอากาศ (ตัวที่ต่ำสุดในแผน)', 'Climate fit (lowest crop in plan)'), i => fitOf(R[i]) * 100, v => Math.round(v) + '%', true],
    [t('น้ำที่ต้องเติม ปีปกติ (mm)', 'Irrigation need, average year (mm)'), i => ev[i].defMean, v => Math.round(v), false],
    [t('น้ำที่ต้องเติม ปีแล้ง 1 ใน 5 (mm)', 'Irrigation need, 1-in-5 dry year (mm)'), i => ev[i].defP80, v => Math.round(v), false],
    [t('ปีที่ขาดน้ำเกิน 150 mm', 'Years short > 150 mm'), i => ev[i].dryYears, v => v, false],
    [t('วันร้อน ≥35 °C ตอนมีพืช', 'Days ≥35 °C with crop'), i => ev[i].heat, v => (+v).toFixed(1), false],
    [t('ฝนที่ตกตอนดินโล่ง', 'Rain falling on bare soil'), i => ev[i].erosion * 100, v => Math.round(v) + '%', false],
    [t('เดือนที่แปลงว่าง', 'Idle months'), i => ev[i].bare, v => v, false],
    [t('สุขภาพดิน (0–100)', 'Soil health (0–100)'), i => soil[i] * 100, v => Math.round(v), true],
    [t('เพิ่มอินทรียวัตถุ (0–100)', 'Organic-matter gain (0–100)'), i => R[i].om * 100, v => Math.round(v), true],
    [t('ไนโตรเจนจากพืช (0–100)', 'Nitrogen from crops (0–100)'), i => R[i].n * 100, v => Math.round(v), true],
    [t('ตัดวงจรศัตรูพืช (0–100)', 'Pest-cycle break (0–100)'), i => ev[i].pest * 100, v => Math.round(v), true],
    [t('รายได้ (ตั้งเอง 0–10)', 'Income (user-set 0–10)'), i => incomeOf(i) * 10, v => Math.round(v), true]
  ].filter(d => idx.some(i => typeof d[1](i) === 'number' && !isNaN(d[1](i))));
  const chips = R.map((r, i) => `<label class="chipc" style="cursor:pointer"><input type="checkbox" data-cmp="${r.id}"${HIDE.has(r.id) ? '' : ' checked'}> <i class="tdot" style="background:${PLAN_COL[i]}"></i>${r.id}${r.custom ? ' ★' : ''}</label>`).join('');
  const head = idx.map(i => `<th><i class="tdot" style="background:${PLAN_COL[i]}"></i>${R[i].id}${i === 0 ? t(' (ปัจจุบัน)', ' (current)') : R[i].custom ? ' ★' : ''}<br><span style="font-weight:400;font-size:.74rem">${R[i].parts.map(pt => typeDot(pt.c.type) + L2(pt.c)).join('<br>')}</span></th>`).join('');
  const typeRow = `<tr><td>${t('ประเภทพืช', 'Crop types')}</td>${idx.map(i => `<td style="font-size:.76rem">${[...new Set(R[i].parts.map(pt => pt.c.type))].map(ty => typeDot(ty) + L2(TYPE[ty].l)).join('<br>')}</td>`).join('')}</tr>`;
  const body = rowsDef.map(([lab, f, fmt, hi]) => { const vals = idx.map(f), ok = vals.filter(v => !isNaN(v)), bestV = hi ? Math.max(...ok) : Math.min(...ok), same = ok.every(v => v === ok[0]);
    return `<tr><td>${lab}</td>${vals.map(v => `<td class="num${!same && v === bestV ? ' bestc' : ''}">${isNaN(v) ? '—' : fmt(v)}</td>`).join('')}</tr>`; }).join('');
  el.innerHTML = `<div class="row" style="margin-bottom:8px">${chips}</div>` + (idx.length ? `<div class="tbl"><table class="cmp"><thead><tr><th></th>${head}</tr></thead><tbody>${typeRow}${body}</tbody></table></div>
    <p class="note" style="margin-top:6px">${t('ติ๊กเลือกแผนที่จะเทียบ · ช่องเขียว = ดีที่สุดในแถวนั้น · ★ = แผนที่คุณสร้างเอง · ตัวเลขเปลี่ยนตามน้ำหนักและ scenario ทางซ้าย', 'Tick the rotations to compare · green cell = best in that row · ★ = your own rotation · numbers follow the weights and scenario on the left')}</p>` : `<p class="note">${t('เลือกอย่างน้อย 1 แผน', 'Select at least one rotation')}</p>`);
  el.querySelectorAll('[data-cmp]').forEach(c => c.onchange = () => { c.checked ? HIDE.delete(c.dataset.cmp) : HIDE.add(c.dataset.cmp); compareTable(st, ev, soil, scores, scrBy); });
}
function ndviNote() {
  if (!S) return; const n = S.ndvi; let h;
  if (n) h = `<b>${L2(RNAME[n.cls])}</b> · NDVI ${n.min.toFixed(2)}–${n.max.toFixed(2)} · ${n.bareMonths.length ? t('ดินโล่ง (NDVI < 0.3): ', 'bare soil (NDVI < 0.3): ') + n.bareMonths.map(m => MTH[LANG][m]).join(', ') : t('ไม่มีเดือนที่ NDVI ต่ำกว่า 0.3 · พืชคลุมดินน้อยสุด: ', 'no month below NDVI 0.3 · lowest cover: ') + n.lowMonths.map(m => MTH[LANG][m]).join('–')}<br>${n.area.src === 'gibs' ? (n.area.aqua ? t('MODIS Terra + Aqua 250 m ทุก 8 วัน', 'MODIS Terra + Aqua 250 m, every 8 days') : t('MODIS Terra 250 m ทุก 16 วัน', 'MODIS Terra 250 m, every 16 days')) + t(' อ่านจากภาพ NASA GIBS (ค่าจากแถบสี ±0.01 ไม่มีแถบคุณภาพ ตัดค่าที่ตกผิดปกติออก)', ', read from NASA GIBS imagery (values from the colour scale, ±0.01; no quality band, sudden dips removed)') : 'MODIS MOD13Q1 250 m (ORNL DAAC)'} · ${t(`ภาพที่ใช้ได้ ${n.clear}/${n.total}`, `${n.clear}/${n.total} usable composites`)} · ${t('pixel 250 m อาจรวมแปลงข้างเคียง การจำแนกเป็นกฎอย่างง่าย ควรเทียบกับภาพจริง', 'a 250 m pixel may mix neighbouring fields; the class is a simple rule, check it against imagery')}`;
  else if (S.ndviFailed) h = t(`ดึง NDVI ของจุดนี้จาก MODIS ไม่ได้ (${S.ndviFailed}) ส่วนอื่นยังใช้ได้ตามปกติ`, `Could not get MODIS NDVI for this point (${S.ndviFailed}). Everything else still works.`);
  else h = t('กำลังดึง NDVI 1 ปีล่าสุดรอบจุดนี้จาก MODIS… ส่วนอื่นใช้งานได้ระหว่างรอ', 'Fetching the last year of MODIS NDVI around this point… the rest of the page works meanwhile.');
  $('ndviNote').innerHTML = h;
  $('cNdvi').closest('.chartbox').style.display = n ? '' : 'none';
  $('baseNote').innerHTML = (n ? t(`MODIS เห็นจุดนี้เป็น <b>${L2(RNAME[n.cls])}</b> · `, `MODIS sees this point as <b>${L2(RNAME[n.cls])}</b> · `) : '') + t('ดาวเทียมบอกชื่อพืชไม่ได้ เลือกพืชที่ปลูกจริงเพื่อให้แผนทางเลือกตรงกับแปลง ถ้าไม่เลือก ระบบจะเดาจากอากาศ', 'Satellites cannot name the crop. Pick what is actually grown so the alternatives match the field; otherwise the tool guesses from climate.');
}
/* T2 — last 90 days vs the same calendar window in 2001–2025 */
/* Kept separate so a full chart redraw (NDVI arriving, language or theme change) redraws this one too */
function drawRecent() {
  const d = S && S.recentChart, cv = $('cRecent'); if (!window.Chart || !d || !cv) return;
  if (charts.recent) { charts.recent.destroy(); delete charts.recent; }
  charts.recent = new Chart(cv, { type: 'line', data: { labels: d.last.map(k => `${+k.slice(6, 8)} ${MTH[LANG][+k.slice(4, 6) - 1]}`), datasets: [
    { label: t('ฝนสะสมปีนี้ (mm)', 'Cumulative rain now (mm)'), data: d.nowCum, borderColor: css('--water'), backgroundColor: css('--water'), pointRadius: 0, borderWidth: 2.5 },
    { label: t('ค่าปกติ 2001–2025', 'Normal 2001–2025'), data: d.normCum, borderColor: css('--muted'), borderDash: [5, 4], pointRadius: 0 },
    { label: t('ช่วง 20–80%', '20–80% range'), data: d.hi, borderColor: 'transparent', backgroundColor: 'rgba(42,111,158,.18)', fill: '+1', pointRadius: 0 },
    { label: '_lo', data: d.lo, borderColor: 'transparent', pointRadius: 0 }] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true }, x: { ticks: { maxTicksLimit: 8 } } }, plugins: { legend: { labels: { boxWidth: 12, filter: i => i.text !== '_lo' } } } } });
}
async function loadRecent(site) {
  const box = $('recentBody'); setStatus('recent', 'load', '…');
  const mine = () => site === S;
  box.innerHTML = `<p class="note">${t('กำลังดึงข้อมูล 90 วันล่าสุดจาก NASA POWER…', 'Fetching the last 90 days from NASA POWER…')}</p>`;
  try {
    const end = new Date(Date.now() - 2 * 864e5), start = new Date(end.getTime() - 94 * 864e5);
    const j = site.recentJSON || await getJSON(powerURL(site.lat, site.lon, ymd(start), ymd(end)), 30000); site.recentJSON = j;
    const P = j.properties.parameter, keys = Object.keys(P.PRECTOTCORR).filter(k => P.PRECTOTCORR[k] > -900 && P.T2M_MAX[k] > -900);
    if (keys.length < 30) throw new Error('too few days');
    const last = keys.slice(-90), first = last[0], lastK = last.at(-1);
    const byKey = new Map(site.days.map(d => [d.k, d]));
    const sFirst = Date.UTC(+first.slice(0, 4), +first.slice(4, 6) - 1, +first.slice(6, 8));
    const yearsCum = [], norm = { p: [], tx: [], hot: [] };
    for (let y = 2001; y <= 2025; y++) {
      const off = new Date(sFirst); off.setUTCFullYear(y);
      let cum = 0, sp = 0, stx = 0, n = 0, hot = 0; const c = [];
      for (let i = 0; i < last.length; i++) { const d = byKey.get(ymd(new Date(off.getTime() + i * 864e5))); if (d) { cum += d.p; stx += d.tx; n++; if (d.tx >= 35) hot++; } c.push(cum); }
      if (n > last.length * 0.8) { yearsCum.push(c); norm.p.push(cum); norm.tx.push(stx / n); norm.hot.push(hot); }
    }
    const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
    let cum = 0; const nowCum = last.map(k => (cum += P.PRECTOTCORR[k]));
    const nowTx = mean(last.map(k => P.T2M_MAX[k])), nowHot = last.filter(k => P.T2M_MAX[k] >= 35).length;
    const nP = mean(norm.p), pctP = nP > 0 ? (cum / nP - 1) * 100 : 0, dTx = nowTx - mean(norm.tx);
    const rank = norm.p.filter(v => v < cum).length;
    const normCum = last.map((_, i) => mean(yearsCum.map(c => c[i])));
    const lo = last.map((_, i) => pct(yearsCum.map(c => c[i]), .2)), hi = last.map((_, i) => pct(yearsCum.map(c => c[i]), .8));
    const fmt = k => `${+k.slice(6, 8)} ${MTH[LANG][+k.slice(4, 6) - 1]} ${k.slice(0, 4)}`;
    const verdict = pctP <= -25 ? t('แห้งกว่าปกติชัดเจน: ดินน่าจะชื้นน้อย พืชที่ปลูกช่วงนี้เสี่ยงขาดน้ำ ให้ดูค่าน้ำ "ปีแล้ง" ในการ์ด', 'Clearly drier than normal: soil is likely dry, so crops sown now risk water stress; check the "dry year" figures in the cards')
      : pctP >= 25 ? t('ฝนมากกว่าปกติ: เสี่ยงน้ำขังและดินพังในแปลงที่ดินโล่ง', 'Wetter than normal: waterlogging and erosion risk on bare fields')
      : t('ใกล้เคียงปกติ', 'Close to normal');
    site.recent = { pctP, dTx };
    if (!mine()) return;
    box.innerHTML = `<div class="tiles">
      <div>${t('ฝน 90 วัน', 'Rain, 90 days')}<b>${Math.round(cum)} mm</b>${t('ปกติ', 'normal')} ${Math.round(nP)} mm <span class="pill ${Math.abs(pctP) >= 25 ? 'sig' : 'ns'}">${pctP >= 0 ? '+' : ''}${Math.round(pctP)}%</span></div>
      <div>${t('Tmax เฉลี่ย', 'Mean Tmax')}<b>${nowTx.toFixed(1)} °C</b>${dTx >= 0 ? '+' : ''}${dTx.toFixed(1)} °C ${t('เทียบปกติ', 'vs normal')}</div>
      <div>${t('วัน ≥35 °C', 'Days ≥35 °C')}<b>${nowHot}</b>${t('ปกติ', 'normal')} ${mean(norm.hot).toFixed(1)}</div>
      <div>${t('อันดับฝน', 'Rain rank')}<b>${rank + 1}/${norm.p.length + 1}</b>${t('เทียบช่วงเดียวกันปี 2001–2025 (1 = แห้งสุด)', 'vs same window 2001–2025 (1 = driest)')}</div>
    </div>
    <p style="margin:10px 0 0"><b>${verdict}</b></p>
    <div class="chartbox" style="height:220px;margin-top:10px"><canvas id="cRecent"></canvas></div>
    <p class="src">NASA POWER PRECTOTCORR / T2M_MAX · ${fmt(first)} – ${fmt(lastK)} · ${t('ข้อมูลช้ากว่าวันจริง 1–3 วัน ไม่ใช่พยากรณ์', 'about 1–3 days behind real time; not a forecast')}</p>`;
    setStatus('recent', 'ok', `${Math.round(pctP)}%`);
    site.recentChart = { last, nowCum, normCum, lo, hi }; drawRecent();
  } catch (e) {
    if (!mine()) return;
    setStatus('recent', 'err', () => t('ดึงไม่ได้', 'failed'));
    box.innerHTML = `<p class="note">${t('ดึงข้อมูลล่าสุดจาก NASA POWER ไม่ได้ ลองใหม่ภายหลัง', 'Could not fetch recent NASA POWER data; try again later')} (${e.message})</p>`;
  }
}

/* ---------- field polygon: draw your own field (T5) ---------- */
let FIELD = null, drawing = null, fieldLayer = null, fieldMsg = null;
const FIELD_MAX = 25e6, MODIS_PX = 62500;
function polyGeom(pts) {
  const la0 = pts.reduce((a, p) => a + p[0], 0) / pts.length * Math.PI / 180, kx = 111320 * Math.cos(la0), ky = 110540;
  const xy = pts.map(p => [(p[1] - pts[0][1]) * kx, (p[0] - pts[0][0]) * ky]); let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < xy.length; i++) { const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length], f = x1 * y2 - x2 * y1; a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f; }
  a /= 2; if (Math.abs(a) < 1) return { area: 0, lat: pts[0][0], lon: pts[0][1], kx, ky };
  return { area: Math.abs(a), lat: pts[0][0] + cy / (6 * a) / ky, lon: pts[0][1] + cx / (6 * a) / kx, kx, ky };
}
const inPoly = (la, lo, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [yi, xi] = pts[i], [yj, xj] = pts[j]; if ((yi > la) !== (yj > la) && lo < (xj - xi) * (la - yi) / (yj - yi) + xi) c = !c; } return c; };
function drawStart() {
  if (!map) return; map.closePopup();
  drawing = { pts: [], line: L.polyline([], { color: '#ffffff', weight: 3, dashArray: '6 5', interactive: false }).addTo(map), dots: L.layerGroup().addTo(map) };
  map.getContainer().style.cursor = 'crosshair'; fieldMsg = null; fieldUI();
}
function drawPoint(ll) {
  const d = drawing;
  if (d.pts.length >= 3 && map.latLngToContainerPoint(ll).distanceTo(map.latLngToContainerPoint(d.pts[0])) < 14) { drawFinish(); return; }
  d.pts.push([ll.lat, ((ll.lng + 540) % 360) - 180]); drawRedraw();
}
function drawRedraw() {
  const d = drawing; d.line.setLatLngs(d.pts.length > 2 ? [...d.pts, d.pts[0]] : d.pts); d.dots.clearLayers();
  d.pts.forEach((p, i) => L.circleMarker(p, { radius: i ? 4 : 7, color: '#ffffff', weight: 2, fillColor: i ? '#2f7d4f' : '#c4512b', fillOpacity: 1, interactive: false }).addTo(d.dots));
  fieldUI();
}
function drawStop() { if (!drawing) return; map.removeLayer(drawing.line); map.removeLayer(drawing.dots); drawing = null; map.getContainer().style.cursor = ''; }
function drawFinish() { if (!drawing || drawing.pts.length < 3) return; const pts = drawing.pts; drawStop(); setField(pts, true); }
function setField(pts, analyse) {
  const g = polyGeom(pts);
  if (g.area < 100) { fieldMsg = { th: 'แปลงเล็กเกินไปหรือจุดซ้อนกัน ลองวาดใหม่', en: 'The shape is too small or the points overlap; draw again' }; fieldUI(); return; }
  if (g.area > FIELD_MAX) { fieldMsg = { th: `พื้นที่ ${(g.area / 1e6).toFixed(1)} km² ใหญ่เกิน 25 km² · ข้อมูลอากาศจุดเดียวใช้แทนพื้นที่ขนาดนี้ไม่ได้ วาดให้เล็กลง`, en: `${(g.area / 1e6).toFixed(1)} km² is over the 25 km² limit · one climate point cannot stand for an area this large; draw a smaller field` }; fieldUI(); return; }
  FIELD = { pts, area: g.area, lat: g.lat, lon: g.lon }; fieldMsg = null;
  if (fieldLayer) map.removeLayer(fieldLayer);
  fieldLayer = L.polygon(pts, { color: '#ffffff', weight: 3, fillColor: '#ffffff', fillOpacity: .08, interactive: false }).addTo(map);
  map.fitBounds(fieldLayer.getBounds(), { padding: [40, 40], maxZoom: 17 });
  const far = !S || Math.hypot((S.lat - g.lat) * 110540, (S.lon - g.lon) * g.kx) > 250;
  if (analyse && far) loadLive(g.lat, g.lon); else update();
}
function fieldClear() { drawStop(); if (fieldLayer) { map.removeLayer(fieldLayer); fieldLayer = null; } FIELD = null; fieldMsg = null; update(); }
function fieldExport() {
  if (!FIELD) return;
  const gj = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Field Shift Map field', area_m2: Math.round(FIELD.area) }, geometry: { type: 'Polygon', coordinates: [[...FIELD.pts, FIELD.pts[0]].map(p => [+p[1].toFixed(6), +p[0].toFixed(6)])] } }] };
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(gj)], { type: 'application/geo+json' })); a.download = 'field.geojson'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function fieldImport(file) {
  const rd = new FileReader();
  rd.onload = () => { try {
    const j = JSON.parse(rd.result), geoms = j.type === 'FeatureCollection' ? j.features.map(f => f.geometry) : [j.type === 'Feature' ? j.geometry : j];
    const g = geoms.find(x => x && (x.type === 'Polygon' || x.type === 'MultiPolygon')); if (!g) throw 0;
    let ring = (g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0]).map(c => [+c[1], +c[0]]);
    if (ring.length > 3 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring = ring.slice(0, -1);
    if (ring.length < 3 || ring.some(p => !(Math.abs(p[0]) <= 90) || !(Math.abs(p[1]) <= 180))) throw 0;
    drawStop(); setField(ring, true);
  } catch (e) { fieldMsg = { th: 'อ่านไฟล์ไม่ได้ ต้องเป็น GeoJSON ที่มี Polygon (พิกัด lon, lat)', en: 'Could not read the file; it must be GeoJSON with a Polygon (lon, lat)' }; fieldUI(); } };
  rd.readAsText(file);
}
function fieldUI() {
  const el = $('fieldCtl'); if (!el) return;
  const n = drawing ? drawing.pts.length : 0;
  el.innerHTML = (drawing
    ? `<button type="button" class="btn" id="fDone" aria-pressed="true"${n < 3 ? ' disabled' : ''}>${t('เสร็จ', 'Finish')} (${n})</button><button type="button" class="btn" id="fUndo"${n ? '' : ' disabled'}>${t('ถอยจุด', 'Undo')}</button><button type="button" class="btn" id="fCancel">${t('ยกเลิก', 'Cancel')}</button>`
    : `<button type="button" class="btn" id="fDraw">${FIELD ? t('วาดใหม่', 'Redraw') : t('วาดแปลงของฉัน', 'Draw my field')}</button>${FIELD ? `<button type="button" class="btn" id="fClear">${t('ลบแปลง', 'Remove')}</button><button type="button" class="btn" id="fExp">${t('บันทึก GeoJSON', 'Save GeoJSON')}</button>` : ''}<button type="button" class="btn" id="fImp">${t('เปิดไฟล์ GeoJSON', 'Open GeoJSON')}</button>`)
    + `<p class="note" style="margin:6px 0 0;flex-basis:100%">${fieldMsg ? '⚠ ' + L2(fieldMsg) : drawing ? t('แตะบนแผนที่ทีละมุมของแปลง อย่างน้อย 3 จุด แล้วกด "เสร็จ" หรือแตะจุดแรกอีกครั้ง', 'Tap each corner of the field on the map, at least 3 points, then press "Finish" or tap the first point again') : FIELD ? '' : t('วาดขอบแปลงเพื่อดูพื้นที่ ความลาดชัน และปริมาณน้ำเป็นลูกบาศก์เมตร', 'Outline your field to get its area, slope and water volumes in cubic metres')}</p>`;
  const on = (id, f) => { const b = $(id); if (b) b.onclick = f; };
  on('fDraw', drawStart); on('fDone', drawFinish); on('fUndo', () => { drawing.pts.pop(); drawRedraw(); }); on('fCancel', () => { drawStop(); fieldUI(); });
  on('fClear', fieldClear); on('fExp', fieldExport); on('fImp', () => $('fieldFile').click());
}
function fieldInfo(st, ev, scores) {
  const sec = $('fieldSec'); if (!sec) return; sec.hidden = !FIELD; if (!FIELD || !S) return;
  const F = FIELD, ha = F.area / 1e4, rai = F.area / 1600, kx = 111320 * Math.cos(F.lat * Math.PI / 180);
  const distKm = Math.hypot((S.lat - F.lat) * 110540, (S.lon - F.lon) * kx) / 1000;
  /* slope inside the field, sampled from the DEM */
  let sl = [];
  if (S.dem) {
    const las = F.pts.map(p => p[0]), los = F.pts.map(p => p[1]), step = Math.max(15, Math.sqrt(F.area / 1500)), dLa = step / 110540, dLo = step / kx;
    for (let la = Math.min(...las) + dLa / 2; la < Math.max(...las); la += dLa) for (let lo = Math.min(...los) + dLo / 2; lo < Math.max(...los); lo += dLo) if (inPoly(la, lo, F.pts)) { const v = S.dem.slope(la, lo); if (!isNaN(v)) sl.push(v); }
    if (!sl.length) { const v = S.dem.slope(F.lat, F.lon); if (!isNaN(v)) sl.push(v); }
  }
  /* grid cells whose centre is inside the field */
  let cells = [];
  if (GRID) { GRID.info.forEach((ci, p) => { const r = Math.floor(p / GRID.n), c = p % GRID.n; if (inPoly(GRID.lat0 - (r + .5) * GRID.dLat, GRID.lon0 + (c + .5) * GRID.dLon, F.pts)) cells.push(ci); }); if (!cells.length) { const p = gridCell(F.lat, F.lon); if (p >= 0) cells.push(GRID.info[p]); } }
  const A = S.ndvi && S.ndvi.area, hiRisk = cells.length && typeof riskBreaks !== 'undefined' ? cells.filter(ci => ci.farm && riskBreaks.filter(b => ci.risk > b).length >= 3).length / cells.length : null;
  let pat = '—';
  if (A && cells.length) { const cnt = {}; cells.forEach(ci => { if (ci.fr >= 0) cnt[ci.fr] = (cnt[ci.fr] || 0) + 1; }); const tot = Object.values(cnt).reduce((a, b) => a + b, 0); if (tot) pat = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${L2(RNAME[k])} ${Math.round(v / tot * 100)}%`).join(' · '); }
  const best = scores.indexOf(Math.max(...scores)), m3 = mm => Math.round(mm * F.area / 1000).toLocaleString();
  const warn = [];
  if (F.area < MODIS_PX) warn.push(t(`แปลงเล็กกว่า pixel ดาวเทียม MODIS 1 ช่อง (6.25 ha ≈ 39 ไร่): NDVI และรูปแบบพืชพรรณที่เห็นรวมแปลงข้างเคียงด้วย ใช้ดูแนวโน้มของละแวกนี้ ไม่ใช่ของแปลงนี้โดยเฉพาะ`, `The field is smaller than one MODIS satellite pixel (6.25 ha): the NDVI and vegetation pattern include neighbouring fields. Read them as the neighbourhood, not this field alone`));
  if (distKm > 0.5) warn.push(t(`อากาศและดินที่ใช้คำนวณเป็นของจุดที่วิเคราะห์ ซึ่งห่างจากกลางแปลง ${distKm.toFixed(1)} km`, `Climate and soil are for the analysed point, ${distKm.toFixed(1)} km from the field centre`) + ` <button type="button" class="btn" id="fRe">${t('วิเคราะห์ที่กลางแปลง', 'Analyse at the field centre')}</button>`);
  $('fieldBody').innerHTML = `<div class="tiles">
      <div>${t('พื้นที่', 'Area')}<b>${rai >= 100 ? Math.round(rai).toLocaleString() : rai.toFixed(1)} ${t('ไร่', 'rai')}</b>${ha.toFixed(2)} ha · ${t('กลางแปลง', 'centre')} ${fmtLL(F.lat, F.lon)}</div>
      <div>${t('ความลาดชันในแปลง', 'Slope inside the field')}<b>${sl.length ? (sl.reduce((a, b) => a + b, 0) / sl.length).toFixed(1) + '%' : '—'}</b>${sl.length ? t('สูงสุด ', 'max ') + Math.max(...sl).toFixed(1) + '% · ' + sl.length + t(' จุด (SRTM 30 m)', ' samples (SRTM 30 m)') : t('ไม่มีข้อมูลความสูง', 'no elevation data')}</div>
      <div>${t('ช่องที่เสี่ยงดินพังสูง', 'Cells at high erosion risk')}<b>${hiRisk == null ? '—' : Math.round(hiRisk * 100) + '%'}</b>${cells.length} ${t('ช่อง 30 m ในแปลง · เทียบกันในกริดรอบจุด', 'cells of 30 m in the field · relative to the grid around the point')}</div>
      <div>${t('รูปแบบพืชพรรณ (กฎ)', 'Vegetation pattern (rules)')}<b style="font-size:.9rem">${pat}</b>MODIS 250 m</div>
    </div>
    <div class="tbl" style="margin-top:10px"><table class="cmp"><thead><tr><th>${t('น้ำที่ต้องเติมทั้งแปลง (m³ ต่อปี)', 'Irrigation water for the whole field (m³ per year)')}</th><th>${t('ปีปกติ', 'Average year')}</th><th>${t('ปีแล้ง 1 ใน 5', '1-in-5 dry year')}</th></tr></thead><tbody>
      ${[...new Set([0, best])].map(i => `<tr><td><i class="tdot" style="background:${PLAN_COL[i]}"></i>${R[i].id} · ${R[i].parts.map(pt => L2(pt.c)).join(' + ')}${i === 0 ? t(' (ปัจจุบัน)', ' (current)') : t(' (คะแนนสูงสุด)', ' (top score)')}</td><td class="num">${m3(ev[i].defMean)}</td><td class="num">${m3(ev[i].defP80)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="note" style="margin-top:6px">${t('m³ = mm ที่ขาด × พื้นที่แปลง (1 mm บน 1 ไร่ = 1.6 m³) · เป็นน้ำที่พืชต้องการเพิ่มจากฝน ยังไม่รวมการสูญเสียในระบบส่งน้ำ', 'm³ = mm of deficit × field area (1 mm on 1 ha = 10 m³) · this is crop water beyond rainfall, before losses in the irrigation system')}</p>
    ${warn.map(w => `<p class="note" style="margin-top:6px;border-left:3px solid var(--warn);padding-left:8px">⚠ ${w}</p>`).join('')}`;
  const b = $('fRe'); if (b) b.onclick = () => loadLive(F.lat, F.lon);
}
{ const f = $('fieldFile'); if (f) f.onchange = () => { if (f.files[0]) fieldImport(f.files[0]); f.value = ''; }; }
/* ---------- boot ---------- */
['sRain', 'sTemp'].forEach(id => $(id).addEventListener('input', update));
fetch('data/crops.json').then(r => r.ok ? r.json() : Promise.reject()).then(d => { CROPDB = d; if (S) update(); }).catch(() => { const el = $('screenBody'); if (el) el.innerHTML = `<p class="note">${t('โหลดฐานข้อมูลพืชไม่ได้', 'Could not load the crop database')}</p>`; });
{ const b = $('mobToggle'); if (b) { const lab = () => { const atMap = window.scrollY < $('summary').getBoundingClientRect().top + window.scrollY - 200; b.textContent = atMap ? t('ดูผล ↓', 'Results ↓') : t('แผนที่ ↑', 'Map ↑'); b.dataset.to = atMap ? 'res' : 'map'; }; b.onclick = () => (b.dataset.to === 'res' ? $('summary') : $('map')).scrollIntoView({ behavior: 'smooth', block: 'start' }); window.addEventListener('scroll', lab, { passive: true }); lab(); } }
['cIrr', 'cMach', 'baseSel', 'baseMonth'].forEach(id => $(id).addEventListener('change', update));
$('opac').addEventListener('input', paintCells);
$('lTH').onclick = () => setLang('th'); $('lEN').onclick = () => setLang('en');
function parseCoord(txt) {
  const m = txt.trim().toUpperCase().replace(/,/g, ' ').match(/^(-?\d+(?:\.\d+)?)\s*°?\s*([NS])?\s+(-?\d+(?:\.\d+)?)\s*°?\s*([EW])?$/);
  if (!m) return null;
  let la = +m[1], lo = +m[3];
  if (m[2] === 'S') la = -Math.abs(la); if (m[4] === 'W') lo = -Math.abs(lo);
  return Math.abs(la) <= 90 && Math.abs(lo) <= 180 ? [la, lo] : null;
}
$('coordForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const c = parseCoord($('coordIn').value);
  if (!c) { $('coordMsg').textContent = t('อ่านพิกัดไม่ได้ ใช้รูปแบบ 30.9N 75.85E', 'Could not read that; use 30.9N 75.85E'); return; }
  loadLive(c[0], c[1]);
});
$('geoBtn').onclick = () => {
  if (!navigator.geolocation) { $('coordMsg').textContent = t('เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง', 'This browser has no geolocation'); return; }
  $('coordMsg').textContent = t('กำลังขอตำแหน่ง…', 'Requesting location…');
  navigator.geolocation.getCurrentPosition(p => { $('coordMsg').textContent = ''; loadLive(p.coords.latitude, p.coords.longitude); },
    () => { $('coordMsg').textContent = t('ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง พิมพ์พิกัดหรือคลิกแผนที่แทน', 'Location not allowed; type coordinates or click the map instead'); }, { timeout: 15000, maximumAge: 600000 });
};
document.body.dataset.lang = LANG;
setLang(LANG); initMap();
$('liveList').innerHTML = liveStatusHTML();
{ const mq = matchMedia('(prefers-color-scheme: dark)'), root = document.documentElement, btn = $('themeBtn');
  const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : mq.matches;
  const label = () => { btn.textContent = isDark() ? '☀ Light' : '☾ Dark'; btn.setAttribute('aria-pressed', isDark()); };
  btn.onclick = () => { root.dataset.theme = isDark() ? 'light' : 'dark'; try { localStorage.setItem('fs-theme', root.dataset.theme); } catch (e) {} label(); if (S) { drawCharts(); if (typeof loadRecent === 'function' && S.recent) loadRecent(S); } };
  mq.addEventListener && mq.addEventListener('change', () => { label(); S && drawCharts(); });
  label(); }
{ const m = location.hash.match(/^#p=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/); if (m) loadLive(+m[1], +m[2]); else loadLive(DEFAULT_POINT[0], DEFAULT_POINT[1]); }
