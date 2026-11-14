'use strict';
/* Field Shift Map — crop-rotation decision support from NASA Earth observations.
   Data: data/site.json (built by pipeline/build_site.py). All scoring runs in the browser. */

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

/* Crop parameters. Kc shapes follow FAO-56 Table 12 (maize ini 0.3–0.4 / mid 1.20 / end 0.6;
   mung bean 0.4 / 1.05 / 0.6; cassava 0.3 / 0.8 / 0.3; pigeon pea uses "beans, dry").
   Sunn hemp is not in FAO-56: generic green-manure legume. Heat sensitivity is relative (0–1). */
const CROPS = {
  maize:   { name:{th:'ข้าวโพด',en:'Maize'}, color:'#c49a1c', sens:1.0, fam:'Poaceae', ph:[5.5,7.5] },
  mung:    { name:{th:'ถั่วเขียว',en:'Mung bean'}, color:'#2f7d4f', sens:0.8, fam:'Fabaceae', ph:[6.2,7.2] },
  hemp:    { name:{th:'ปอเทือง',en:'Sunn hemp'}, color:'#7a9a2e', sens:0.3, fam:'Fabaceae', ph:[5.0,7.5] },
  cassava: { name:{th:'มันสำปะหลัง',en:'Cassava'}, color:'#8a5a33', sens:0.2, fam:'Euphorbiaceae', ph:[4.5,7.5] },
  pp:      { name:{th:'ถั่วมะแฮะ',en:'Pigeon pea'}, color:'#5b6fb0', sens:0.4, fam:'Fabaceae', ph:[5.0,7.0], deep:true }
};
const MAIZE = {6:['maize',.4],7:['maize',.9],8:['maize',1.2],9:['maize',.6]};
const R = [
  { id:'A', name:{th:'ข้าวโพดรอบเดียว',en:'Single maize'}, m:{...MAIZE}, om:.2, n:0, deep:0, income:.5, machine:false,
    why:{th:'แผนที่ปลูกกันทั่วไป ใช้เป็นเส้นฐาน',en:'Common practice; used as a baseline'},
    benefit:{th:'คุ้นเคย มีตลาดรับซื้อ ลงทุนต่ำ',en:'Familiar, established market, low cost'},
    gap:{th:'ผลผลิตจริงของแปลง ราคารับซื้อปีนี้',en:'Actual field yield; this year\'s price'},
    risk:{th:'ดินโล่งช่วง มี.ค.–มิ.ย. ตอนฝนแรกตกหนัก ปลูกซ้ำทำให้ดินเสื่อมและศัตรูพืชสะสม',en:'Soil bare in Mar–Jun when the first heavy rains fall; monocropping degrades soil and builds up pests'},
    forage:{th:'ต้นข้าวโพดหลังเก็บทำข้าวโพดหมักเลี้ยงสัตว์ได้',en:'Stover can be ensiled for livestock'} },
  { id:'B', name:{th:'ถั่วเขียวต้นฝน → ข้าวโพด',en:'Early-rain mung bean → maize'}, m:{3:['mung',.4],4:['mung',1.05],5:['mung',.6],...MAIZE}, om:.45, n:.7, deep:0, income:.8, machine:false,
    why:{th:'ใช้ช่วงต้นฝนที่ปกติว่าง ถั่วตรึง N ให้ข้าวโพดรอบถัดไป',en:'Uses the early-rain window that is usually idle; the legume fixes N for the following maize'},
    benefit:{th:'รายได้เพิ่มอีกรอบ ลดปุ๋ย N ดินมีพืชคลุมช่วงฝนแรก',en:'Extra harvest, less N fertiliser, cover during the first rains'},
    gap:{th:'ความชื้นดินตอนปลูกจริง (SMAP) ตลาดถั่วเขียวในพื้นที่',en:'Soil moisture at sowing (SMAP); local mung bean market'},
    risk:{th:'เม.ย. ร้อนจัดบ่อย ถ้าฝนต้นฤดูมาช้า ถั่วเสียหายช่วงออกดอก pH ดินต่ำกว่าช่วงที่ถั่วเขียวชอบเล็กน้อย',en:'April is often very hot; a late rainy-season start can hurt flowering. Soil pH is slightly below mung bean\'s preferred range'},
    forage:{th:'ต้นถั่วหลังเก็บฝักใช้เลี้ยงสัตว์หรือไถกลบได้',en:'Haulms after harvest can feed livestock or be incorporated'} },
  { id:'C', name:{th:'ปอเทือง (ไถกลบ) → ข้าวโพด',en:'Sunn hemp green manure → maize'}, m:{3:['hemp',.4],4:['hemp',.9],5:['hemp',.8],...MAIZE}, om:.9, n:.8, deep:.3, income:.4, machine:true,
    why:{th:'ปุ๋ยพืชสด เพิ่มอินทรียวัตถุและ N คลุมดินช่วงต้นฝน',en:'Green manure adds organic matter and N and covers soil in the early rains'},
    benefit:{th:'บำรุงดินมากที่สุด ทนแล้งกว่าถั่วเขียว ลดดินพังทลาย',en:'Largest soil benefit, more drought-tolerant than mung bean, less erosion'},
    gap:{th:'อินทรียวัตถุในดินจริงจากการตรวจดิน ต้นทุนเมล็ดและการไถกลบ',en:'Field soil test for organic matter; seed and tillage cost'},
    risk:{th:'ไม่มีรายได้โดยตรง ต้องไถกลบให้ทันก่อนปลูกข้าวโพด',en:'No direct income; must be incorporated in time before maize'},
    forage:{th:'ใช้ตัดเป็นอาหารสัตว์บางส่วนได้ แต่เมล็ดมีพิษต่อสัตว์บางชนิด',en:'Some foliage can be cut for fodder, but seeds are toxic to some livestock'} },
  { id:'D', name:{th:'มันสำปะหลัง',en:'Cassava'}, m:{4:['cassava',.3],5:['cassava',.4],6:['cassava',.6],7:['cassava',.8],8:['cassava',.8],9:['cassava',.8],10:['cassava',.7],11:['cassava',.6],0:['cassava',.5],1:['cassava',.4],2:['cassava',.3]}, om:.15, n:0, deep:.4, income:.7, machine:false,
    why:{th:'ทนแล้งและร้อน อยู่ในแปลงเกือบทั้งปี',en:'Tolerates drought and heat; occupies the field most of the year'},
    benefit:{th:'ทนฝนทิ้งช่วง มีพืชคลุมดินเกือบตลอดปี',en:'Withstands dry spells; ground covered most of the year'},
    gap:{th:'ราคาหัวมันสด ระยะทางถึงลานมัน',en:'Fresh-root price; distance to a buying yard'},
    risk:{th:'ดึงธาตุอาหาร (K) ออกมาก ช่วงปลูกดินโล่ง ปลูกซ้ำทุกปีเสี่ยงเพลี้ยแป้ง',en:'Removes many nutrients (K); bare at planting; yearly repetition raises mealybug risk'},
    forage:{th:'ใบมันแห้งใช้เสริมอาหารสัตว์ได้',en:'Dried leaves can supplement livestock feed'} },
  { id:'E', name:{th:'ข้าวโพด + ถั่วมะแฮะแซมปลายฝน',en:'Maize + relay pigeon pea'}, m:{...MAIZE,10:['pp',.8],11:['pp',.9],0:['pp',.7],1:['pp',.5]}, om:.6, n:.7, deep:1, income:.65, machine:false, labor:true,
    why:{th:'ถั่วมะแฮะรากลึก ใช้น้ำที่ค้างในดินหลังหมดฝน คลุมดินต่อหลังเก็บข้าวโพด',en:'Deep-rooted pigeon pea uses water left after the rains and keeps the soil covered after maize'},
    benefit:{th:'ตรึง N เปิดช่องให้น้ำซึม ได้เมล็ดเพิ่ม',en:'Fixes N, improves infiltration, extra grain'},
    gap:{th:'ความชื้นเขตราก (SMAP L4) ความลึกหน้าดิน ตลาดถั่วมะแฮะ',en:'Root-zone moisture (SMAP L4), soil depth, pigeon pea market'},
    risk:{th:'ต้องใช้แรงงานปลูกแซม ถ้าดินตื้นหรือมีชั้นดาน รากลงไม่ได้',en:'Needs labour for relay planting; shallow or compacted soil blocks the roots'},
    forage:{th:'ใบและเมล็ดเป็นอาหารสัตว์ได้ดี',en:'Leaves and grain are good fodder'} }
];
const PLAN_COL = ['#a7a39a','#2f7d4f','#9ab83a','#8a5a33','#5b6fb0'];
const KNAME = [
  {th:'พืชไร่อายุยาว (ต่ำสุด มี.ค.–เม.ย.)',en:'Long-season field crop (low Mar–Apr)'},
  {th:'พืชพรรณบาง / ชุมชน',en:'Sparse vegetation / settlement'},
  {th:'พืชปน คลุมดินน้อย',en:'Mixed crops, low cover'},
  {th:'ป่า / ไม้ยืนต้น',en:'Forest / tree cover'},
  {th:'พืชปนไม้ คลุมดินปานกลาง',en:'Crops with trees, medium cover'},
  {th:'พืชไร่อายุยาว (ต่ำสุด เม.ย.–พ.ค.)',en:'Long-season field crop (low Apr–May)'}
];
const KCOL = ['#c49a1c','#a7a39a','#c8cf86','#1f5e3a','#6f9a5a','#8a5a33'];
const RNAME = [
  {th:'ป่า / ไม้ยืนต้น',en:'Forest / trees'},{th:'โล่ง / ชุมชน / น้ำ',en:'Bare / built / water'},
  {th:'พืชสองฤดู',en:'Two-season crop'},{th:'พืชฤดูเดียว (สั้น)',en:'Single short season'},{th:'พืชไร่อายุยาว',en:'Long-season crop'}
];
const RCOL = ['#1f5e3a','#a7a39a','#2a6f9e','#c49a1c','#8a5a33'];
const FARM = new Set([0,2,4,5]);
const CLASS_BASE = {0:3, 5:3, 2:0, 4:0};
const RISK_COL = ['#2f7d4f','#9ab83a','#e2c044','#e08a3c','#c4512b'];
const PRIO = [
  { id:'wWater', v:3, l:{th:'ประหยัดน้ำ',en:'Save water'} },
  { id:'wSoil', v:4, l:{th:'สุขภาพดิน',en:'Soil health'}, h:{th:'อินทรียวัตถุ · N · กันดินพัง · ซึมน้ำ · pH',en:'Organic matter · N · erosion · infiltration · pH'} },
  { id:'wPest', v:2, l:{th:'ตัดวงจรศัตรูพืช',en:'Break pest cycles'} },
  { id:'wRisk', v:2, l:{th:'ลดความเสี่ยงอากาศร้อน',en:'Reduce heat risk'} },
  { id:'wIncome', v:2, l:{th:'รายได้',en:'Income'} }
];

let S = null, DEMO = null, MODE = 'demo', liveMarker = null;
let mapMode = 'kmeans', map, cellLayer, cells = [], baseLayers = {}, curBase = 'esri', tileErrors = 0;
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
  return { w, rf: +$('sRain').value / 100, dT: +$('sTemp').value, irr: $('cIrr').checked, mach: $('cMach').checked, base: +$('baseSel').value };
}
let evCache = null, evKey = '';
function evAll(st) { const k = st.rf + '|' + st.dT + '|' + S.lat + ',' + S.lon; if (k !== evKey) { evCache = R.map(r => evalRot(r, st.rf, st.dT)); evKey = k; } return evCache; }
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

/* ---------- terrain & cells ---------- */
const sFactor = s => { const th = Math.atan(s / 100); return s < 9 ? 10.8 * Math.sin(th) + 0.03 : 16.8 * Math.sin(th) - 0.5; };
function cellInfo(p) {
  const n = DEMO.grid.n, r = Math.floor(p / n), c = p % n;
  const k = DEMO.kmeans.grid[r].charCodeAt(c) - 65, rule = DEMO.rules.grid[r].charCodeAt(c) - 65, slope = DEMO.slope[r][c];
  const prof = DEMO.kmeans.profiles[k]; const nd = (prof[4] + prof[5] + prof[6] + prof[7] + prof[8]) / 5;
  const C = 1 - Math.max(0, Math.min(1, (nd - 0.2) / 0.6));
  return { r, c, k, rule, slope, risk: sFactor(slope) * C, farm: FARM.has(k), base: CLASS_BASE[k] };
}
let riskBreaks = [];
function cellPolys() {
  const g = DEMO.grid, n = g.n, toLL = (x, y) => { const lat = y / g.R; return [lat * 180 / Math.PI, x / (g.R * Math.cos(lat)) * 180 / Math.PI]; };
  const out = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const x0 = g.xll + c * g.cell, x1 = x0 + g.cell, yT = g.yll + (n - r) * g.cell, yB = yT - g.cell;
    out.push([toLL(x0, yT), toLL(x1, yT), toLL(x1, yB), toLL(x0, yB)]);
  }
  return out;
}

/* ---------- UI build ---------- */
function buildControls() {
  $('prioBox').innerHTML = PRIO.map(p => `<div class="ctl"><label for="${p.id}"><span>${L2(p.l)}</span><output id="o${p.id}">${$(p.id) ? $(p.id).value : p.v}</output></label><input id="${p.id}" type="range" min="0" max="5" value="${$(p.id) ? $(p.id).value : p.v}">${p.h ? `<p class="note">${L2(p.h)}</p>` : ''}</div>`).join('');
  const bs = $('baseSel').value || '3';
  $('baseSel').innerHTML = R.map((r, i) => `<option value="${i}"${String(i) === bs ? ' selected' : ''}>${r.id} · ${L2(r.name)}</option>`).join('');
  const prevInc = R.map((r, i) => $('inc' + i) ? $('inc' + i).value : Math.round(r.income * 10));
  $('incomeBox').innerHTML = R.map((r, i) => `<div class="ctl"><label for="inc${i}"><span>${r.id} · ${L2(r.name)}</span><output id="oInc${i}">${prevInc[i]}</output></label><input id="inc${i}" type="range" min="0" max="10" value="${prevInc[i]}"></div>`).join('');
  [...PRIO.map(p => p.id), ...R.map((_, i) => 'inc' + i)].forEach(id => $(id).addEventListener('input', update));
  const bb = [['esri', {th:'ภาพละเอียดสูง',en:'High-res imagery'}], ['gibs', {th:'NASA MODIS ตามวันที่',en:'NASA MODIS by date'}], ['osm', {th:'แผนที่ถนน',en:'Street map'}]];
  $('baseBtns').innerHTML = bb.map(([k, l]) => `<button type="button" class="btn" data-base="${k}" aria-pressed="${k === curBase}">${L2(l)}</button>`).join('');
  const lb = [['rec', {th:'แผนแนะนำ',en:'Recommended'}], ['kmeans', {th:'รูปแบบการปลูก (k-means)',en:'Cropping pattern (k-means)'}], ['rules', {th:'รูปแบบ (กฎ)',en:'Pattern (rules)'}], ['erosion', {th:'เสี่ยงดินพัง',en:'Erosion risk'}], ['none', {th:'ไม่แสดง',en:'None'}]];
  $('layerBtns').innerHTML = lb.map(([k, l]) => `<button type="button" class="btn" data-layer="${k}" aria-pressed="${k === mapMode}">${L2(l)}</button>`).join('');
  document.querySelectorAll('[data-base]').forEach(b => b.onclick = () => setBase(b.dataset.base));
  document.querySelectorAll('[data-layer]').forEach(b => b.onclick = () => { mapMode = b.dataset.layer; document.querySelectorAll('[data-layer]').forEach(x => x.setAttribute('aria-pressed', x.dataset.layer === mapMode)); paintCells(); });
}
function setLang(l) {
  LANG = l; document.body.dataset.lang = l; document.documentElement.lang = l;
  try { localStorage.setItem('fs-lang', l); } catch (e) {}
  $('lTH').setAttribute('aria-pressed', l === 'th'); $('lEN').setAttribute('aria-pressed', l === 'en');
  if (!S) return;
  buildControls(); update(); drawCharts(); trends(); soilTiles(); paintCells(); links(); setLoc();
  if (S.recentJSON) loadRecent(S);
  if (MODE === 'live' && $('liveList').children.length) $('liveList').innerHTML = liveStatusHTML().replace(/data-state="wait"/g, 'data-state="ok"');
}

/* ---------- render ---------- */
function update() {
  const st = readState();
  PRIO.forEach(p => $('o' + p.id).textContent = st.w[p.id]);
  R.forEach((r, i) => { const o = $('oInc' + i); if (o) o.textContent = Math.round(incomeOf(i) * 10); });
  $('oRain').textContent = (st.rf > 0 ? '+' : '') + Math.round(st.rf * 100) + '%';
  $('oTemp').textContent = '+' + st.dT.toFixed(1) + ' °C';
  const { ev, nW, nH, nE, soil, scores } = scoreAll(st);
  const best = scores.indexOf(Math.max(...scores)), b0 = st.base, base = ev[b0];
  const bar = (lab, v, col) => `<div class="bar"><span>${lab}</span><i><b style="width:${Math.round(v * 100)}%;background:${col}"></b></i><em>${Math.round(v * 100)}</em></div>`;
  $('cards').innerHTML = R.map((r, i) => {
    const e = ev[i];
    const d = x => i === b0 ? '' : ` <span style="color:var(--muted)">(${x >= 0 ? '+' : ''}${Math.round(x)})</span>`;
    const seq = Array.from({ length: 12 }, (_, m) => { const c = r.m[m]; return `<span style="background:${c ? CROPS[c[0]].color : 'var(--chip)'}" title="${MTH[LANG][m]}: ${c ? L2(CROPS[c[0]].name) : t('ว่าง', 'fallow')}"></span>`; }).join('');
    const tags = [];
    if (i === b0) tags.push(`<span class="tag">${t('แผนปัจจุบัน', 'current')}</span>`);
    if (i === best) tags.push(`<span class="tag best">${t('เหมาะสุดตามน้ำหนักที่เลือก', 'best for these priorities')}</span>`);
    if (r.machine && !st.mach) tags.push(`<span class="tag warn">${t('ต้องใช้เครื่องไถกลบ', 'needs tillage machinery')}</span>`);
    if (r.labor) tags.push(`<span class="tag">${t('ใช้แรงงานเพิ่ม', 'extra labour')}</span>`);
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
        <dt>${t('หลักฐาน', 'Evidence')}</dt><dd>${t('NASA POWER 25 ปี: ', 'NASA POWER, 25 years: ')}${t('น้ำที่ต้องเติมเฉลี่ย', 'mean irrigation need')} ${Math.round(e.defMean)} mm, ${t('ปีแล้ง', 'dry year')} ${Math.round(e.defP80)} mm${MODE === 'demo' ? ` · MODIS: ${t('พืชคลุมดินน้อยสุด มี.ค.–พ.ค.', 'lowest cover Mar–May')}` : ''} · ${t('ดิน', 'soil')} pH ${S.soil.ph}, OM ~${S.soil.om}%${S.soilFallback ? t(' (ค่าดินของพื้นที่เดโม เพราะดึงข้อมูลดินจุดนี้ไม่ได้)', ' (demo-area soil; live soil unavailable)') : ''}</dd>
        <dt>${t('ประโยชน์', 'Benefits')}</dt><dd>${L2(r.benefit)}</dd>
        <dt>${t('อาหารสัตว์', 'Forage')}</dt><dd>${L2(r.forage)}</dd>
        <dt>${t('ข้อมูลที่ยังขาด', 'Information gaps')}</dt><dd>${L2(r.gap)}</dd>
        <dt>${t('ความเสี่ยงที่ต้องตรวจในพื้นที่', 'Risks to check locally')}</dt><dd>${L2(r.risk)}</dd>
      </dl></details>
      <span class="conf">${t('ความมั่นใจ', 'Confidence')}: ${i === b0 ? t('กลาง', 'medium') : t('กลาง–ต่ำ', 'medium–low')} · ${t('ภูมิอากาศ ~50 km · ดิน 250 m (ไม่ใช่ผลตรวจดินในแปลง) · รายได้ตั้งเอง', 'climate ~50 km · soil 250 m (not a field test) · income user-set')}${MODE === 'live' ? t(' · แผน 5 แบบเป็นตัวอย่างจากพื้นที่เดโม ยังไม่ได้คัดตามพืชของจุดนี้', ' · these 5 rotations are demo-area examples, not yet screened for this point') : ''}</span>
    </article>`;
  }).join('');
  const bb = R[best], eb = ev[best];
  $('summary').innerHTML = t('ด้วยน้ำหนักที่เลือก ', 'With these priorities, ') + `<b>${bb.id} · ${L2(bb.name)}</b> ` + t('ได้คะแนนสูงสุด', 'scores highest') + ` (${Math.round(scores[best])}/100). ` +
    (best === b0 ? t('แผนปัจจุบันยังเหมาะที่สุดในเงื่อนไขนี้', 'The current rotation is still the best fit here.') :
      t(`เทียบกับแผนปัจจุบัน (${R[b0].id}): น้ำที่ต้องเติมในปีแล้ง ${eb.defP80 - base.defP80 >= 0 ? '+' : ''}${Math.round(eb.defP80 - base.defP80)} mm, ฝนที่ตกตอนดินโล่ง ${Math.round(base.erosion * 100)}% → ${Math.round(eb.erosion * 100)}%`,
        `Versus the current rotation (${R[b0].id}): dry-year irrigation need ${eb.defP80 - base.defP80 >= 0 ? '+' : ''}${Math.round(eb.defP80 - base.defP80)} mm, rain on bare soil ${Math.round(base.erosion * 100)}% → ${Math.round(eb.erosion * 100)}%`)) +
    `<br><span style="color:var(--muted);font-size:.88rem">${t('ข้อควรตรวจก่อนตัดสินใจ', 'Check before deciding')}: ${L2(bb.risk)}</span>`;
  if (mapMode === 'rec') paintCells();
}

/* ---------- map ---------- */
function initMap() {
  if (!window.L) { $('map').innerHTML = `<p style="padding:16px">${t('โหลดแผนที่ไม่ได้', 'Map library failed to load')}</p>`; return; }
  map = L.map('map', { preferCanvas: true, scrollWheelZoom: false }).setView([DEMO.lat, DEMO.lon], 13);
  const onErr = () => { tileErrors++; if (tileErrors > 6) { $('tileMsg').hidden = false; $('tileMsg').textContent = t('โหลดภาพพื้นหลังไม่ได้ในหน้านี้ (ใช้ได้เมื่อเปิดผ่าน GitHub Pages)', 'Base-map tiles cannot load in this viewer (they work on the hosted site)'); } };
  baseLayers.esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }).on('tileerror', onErr);
  baseLayers.osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).on('tileerror', onErr);
  baseLayers.gibs = L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg', { maxNativeZoom: 9, maxZoom: 18, time: $('gibsDate').value, attribution: 'NASA GIBS / EOSDIS · MODIS Terra' }).on('tileerror', onErr);
  baseLayers[curBase].addTo(map);
  const polys = cellPolys();
  cellLayer = L.layerGroup().addTo(map);
  cells = polys.map((ll, p) => { const pl = L.polygon(ll, { weight: 0.3, color: '#ffffff', fillOpacity: .7, bubblingMouseEvents: false }); pl.on('click', e => cellPopup(p, e.latlng)); pl.addTo(cellLayer); return pl; });
  const all = cells.map((_, p) => cellInfo(p)).filter(x => x.farm).map(x => x.risk);
  riskBreaks = [0.2, 0.4, 0.6, 0.8].map(q => pct(all, q));
  L.circleMarker([DEMO.lat, DEMO.lon], { radius: 6, color: '#ffffff', weight: 2, fillOpacity: 0 }).addTo(map);
  $('gibsDate').max = new Date().toISOString().slice(0, 10);
  $('gibsDate').addEventListener('change', () => { baseLayers.gibs.options.time = $('gibsDate').value; baseLayers.gibs.redraw(); links(); });
  map.on('click', onMapClick);
  paintCells();
}
function setBase(k) {
  if (map) { map.removeLayer(baseLayers[curBase]); baseLayers[k].addTo(map); baseLayers[k].bringToBack(); }
  curBase = k; $('dateBox').hidden = k !== 'gibs';
  document.querySelectorAll('[data-base]').forEach(b => b.setAttribute('aria-pressed', b.dataset.base === k));
}
let recCache = { key: '', best: [] };
function recFor(st) {
  const key = JSON.stringify(st) + R.map((_, i) => incomeOf(i)).join() + S.lat + ',' + S.lon;
  if (recCache.key === key) return recCache.best;
  const memo = {}; const sMed = sFactor(3);
  const best = cells.map((_, p) => {
    const ci = cellInfo(p); if (!ci.farm) return -1;
    const boost = Math.max(-0.3, Math.min(1.5, (sFactor(ci.slope) / sMed - 1) * 0.5));
    const kb = boost.toFixed(2);
    if (!(kb in memo)) { const sc = scoreAll(st, +kb).scores; memo[kb] = sc.indexOf(Math.max(...sc)); }
    return memo[kb];
  });
  recCache = { key, best }; return best;
}
function paintCells() {
  if (MODE === 'live') { legend(); return; }
  if (!map) { legend(); return; }
  const op = +$('opac').value / 100; $('oOpac').textContent = Math.round(op * 100) + '%';
  const st = readState(); const rec = mapMode === 'rec' ? recFor(st) : null;
  cells.forEach((pl, p) => {
    const ci = cellInfo(p); let col = null;
    if (mapMode === 'kmeans') col = KCOL[ci.k];
    else if (mapMode === 'rules') col = RCOL[ci.rule];
    else if (mapMode === 'erosion') col = ci.farm ? RISK_COL[riskBreaks.filter(b => ci.risk > b).length] : null;
    else if (mapMode === 'rec') col = rec[p] >= 0 ? PLAN_COL[rec[p]] : null;
    pl.setStyle(col ? { fillColor: col, fillOpacity: op, opacity: op > 0 ? .35 : 0 } : { fillOpacity: mapMode === 'none' ? 0 : op * .25, fillColor: '#888888', opacity: 0 });
  });
  legend(rec);
}
function legend(rec) {
  const n = DEMO.grid.n * DEMO.grid.n; const count = f => { let c = 0; for (let p = 0; p < n; p++) if (f(p)) c++; return Math.round(c / n * 100) + '%'; };
  let h = '';
  if (MODE === 'live') { $('legend').innerHTML = `<p class="note">${t('ชั้นกริด (รูปแบบการปลูก, เสี่ยงดินพัง, แผนแนะนำ) มีเฉพาะพื้นที่เดโม จุดนี้ใช้ข้อมูล NASA สด ด้านล่าง', 'Grid layers (cropping pattern, erosion, recommendation) exist only for the demo area. This point uses live NASA data below.')}</p>`; return; }
  if (mapMode === 'kmeans') h = KNAME.map((nm, i) => `<span><i style="background:${KCOL[i]}"></i>${L2(nm)}<b>${count(p => cellInfo(p).k === i)}</b></span>`).join('');
  else if (mapMode === 'rules') h = RNAME.map((nm, i) => `<span><i style="background:${RCOL[i]}"></i>${L2(nm)}<b>${count(p => cellInfo(p).rule === i)}</b></span>`).join('');
  else if (mapMode === 'erosion') h = [t('ต่ำมาก', 'Very low'), t('ต่ำ', 'Low'), t('ปานกลาง', 'Medium'), t('สูง', 'High'), t('สูงมาก', 'Very high')].map((nm, i) => `<span><i style="background:${RISK_COL[i]}"></i>${nm}</span>`).join('') + `<p class="note">${t('ความลาดชัน (SRTM) × พืชคลุมดินช่วง มี.ค.–พ.ค. (MODIS) จัดเป็น 5 ระดับเทียบกันในพื้นที่', 'Slope (SRTM) × Mar–May ground cover (MODIS), in local quintiles')}</p>`;
  else if (mapMode === 'rec' && rec) h = R.map((r, i) => `<span><i style="background:${PLAN_COL[i]}"></i>${r.id} · ${L2(r.name)}<b>${count(p => rec[p] === i)}</b></span>`).join('') + `<span><i style="background:#888;opacity:.4"></i>${t('ไม่ใช่พื้นที่เกษตร', 'Not farmland')}<b>${count(p => rec[p] < 0)}</b></span><p class="note">${t('ภูมิอากาศและดินเป็นค่าเดียวทั้งพื้นที่ ความต่างระหว่างช่องจึงมาจากความลาดชันเท่านั้น', 'Climate and soil are uniform here, so cells differ only by slope')}</p>`;
  $('legend').innerHTML = h;
}
function cellPopup(p, ll) {
  const ci = cellInfo(p), st = readState();
  const lvl = [t('ต่ำมาก', 'very low'), t('ต่ำ', 'low'), t('ปานกลาง', 'medium'), t('สูง', 'high'), t('สูงมาก', 'very high')][riskBreaks.filter(b => ci.risk > b).length];
  let h = `<b>${L2(KNAME[ci.k])}</b><br>${t('รูปแบบตามกฎ', 'Rule class')}: ${L2(RNAME[ci.rule])}<br>${t('ความลาดชัน', 'Slope')}: ${ci.slope}%`;
  if (ci.farm) {
    const rec = recFor(st)[p];
    h += `<br>${t('เสี่ยงดินพัง', 'Erosion risk')}: ${lvl}<br>${t('แผนที่น่าจะใช้อยู่', 'Likely current')}: ${R[ci.base].id} · ${L2(R[ci.base].name)}<br><b>${t('แนะนำ', 'Suggested')}: ${R[rec].id} · ${L2(R[rec].name)}</b>`;
  } else h += `<br>${t('ไม่ใช่พื้นที่เกษตร ไม่แนะนำแผน', 'Not farmland; no suggestion')}`;
  L.popup().setLatLng(ll).setContent(h).openOn(map);
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
  Object.values(charts).forEach(c => c.destroy());
  const lg = { legend: { labels: { boxWidth: 12 } } };
  charts.clim = new Chart($('cClim'), { data: { labels: MTH[LANG], datasets: [
    { type: 'bar', label: t('ฝน (mm)', 'Rain (mm)'), data: S.clim.map(c => c[0]), backgroundColor: css('--water'), yAxisID: 'y' },
    { type: 'line', label: 'ET₀ (mm)', data: S.clim.map(c => c[1]), borderColor: css('--heat'), backgroundColor: css('--heat'), tension: .3, pointRadius: 2, yAxisID: 'y' },
    { type: 'line', label: t('วัน ≥35 °C', 'Days ≥35 °C'), data: S.clim.map(c => c[3]), borderColor: css('--warn'), backgroundColor: css('--warn'), borderDash: [4, 3], pointRadius: 2, yAxisID: 'y2' }] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true, title: { display: true, text: t('mm/เดือน', 'mm/month') } }, y2: { position: 'right', beginAtZero: true, max: 31, grid: { display: false } } }, plugins: lg } });
  const sl = DEMO.ndviSeries.map((_, i) => { const y = 2022 + Math.floor(i / 23), k = i % 23; return MTH[LANG][Math.min(11, Math.floor((k * 16 + 8) / 365.25 * 12))] + ' ' + String(y).slice(2); });
  charts.ndvi = new Chart($('cNdvi'), { type: 'line', data: { labels: sl, datasets: [
    { label: t('NDVI พื้นที่เกษตร', 'Cropland NDVI'), data: DEMO.ndviSeries, borderColor: css('--crop'), backgroundColor: css('--crop'), tension: .3, pointRadius: 0 },
    { label: t('เกณฑ์ดินโล่ง 0.3', 'Bare-soil threshold 0.3'), data: DEMO.ndviSeries.map(() => .3), borderColor: css('--soil'), borderDash: [5, 4], pointRadius: 0 }] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { min: 0, max: .9 }, x: { ticks: { maxTicksLimit: 9 } } }, plugins: lg } });
  charts.trend = new Chart($('cTrend'), { data: { labels: S.annual.map(a => a[0]), datasets: [
    { type: 'bar', label: t('ฝนรายปี (mm)', 'Annual rain (mm)'), data: S.annual.map(a => a[1]), backgroundColor: css('--water'), yAxisID: 'y' },
    { type: 'line', label: t('วัน ≥35 °C', 'Days ≥35 °C'), data: S.annual.map(a => a[3]), borderColor: css('--heat'), backgroundColor: css('--heat'), pointRadius: 2, yAxisID: 'y2' }] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true }, y2: { position: 'right', beginAtZero: true, grid: { display: false } } }, plugins: lg } });
  const pl = Array.from({ length: 23 }, (_, k) => MTH[LANG][Math.min(11, Math.floor((k * 16 + 8) / 365.25 * 12))]);
  charts.prof = new Chart($('cProf'), { type: 'line', data: { labels: pl, datasets: DEMO.kmeans.profiles.map((p, i) => ({ label: L2(KNAME[i]), data: p, borderColor: KCOL[i], backgroundColor: KCOL[i], pointRadius: 0, tension: .3, borderWidth: 2 })) },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { min: .3, max: .8 }, x: { ticks: { maxTicksLimit: 12 } } }, plugins: { legend: { labels: { boxWidth: 10, font: { size: 10 } } } } } });
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
  const sl = MODE === 'demo' ? DEMO.slope.flat() : (S.slopeSamples || []); const s = S.soil;
  const tex = s.clay >= 40 ? t('ดินเหนียว', 'clay') : s.clay >= 27 ? t('ดินร่วนเหนียว', 'clay loam') : s.sand >= 70 ? t('ดินทราย / ร่วนปนทราย', 'sand / loamy sand') : s.sand >= 50 ? t('ดินร่วนปนทราย', 'sandy loam') : t('ดินร่วน', 'loam');
  const phNote = s.ph < 5.5 ? t('เป็นกรด พืชตระกูลถั่วหลายชนิดไม่ชอบ', 'acidic; many legumes dislike it') : s.ph > 7.8 ? t('เป็นด่าง', 'alkaline') : t('อยู่ในช่วงที่พืชส่วนใหญ่ปลูกได้', 'suits most crops');
  const omNote = s.om < 1.5 ? t('ต่ำ ควรเพิ่มอินทรียวัตถุ', 'low; worth building up') : s.om < 3 ? t('ปานกลาง', 'moderate') : t('ดี', 'good');
  const rows = [
    [t('ดินเหนียว 0–30 cm', 'Clay 0–30 cm'), s.clay + '%', tex],
    ['pH 0–30 cm', s.ph, phNote],
    [t('อินทรียวัตถุ 0–30 cm', 'Organic matter 0–30 cm'), '~' + s.om + '%', omNote],
    [t('น้ำที่พืชใช้ได้ 0–100 cm', 'Plant-available water 0–100 cm'), s.paw + ' mm', t(`ชั้นล่าง >45 cm ~${s.deepStore} mm`, `below 45 cm ~${s.deepStore} mm`)]
  ];
  if (sl.length) rows.push([t('ความลาดชัน (มัธยฐาน)', 'Slope (median)'), pct(sl, .5).toFixed(0) + '%', MODE === 'demo' ? t(`90% ของพื้นที่ ≤ ${pct(sl, .9).toFixed(0)}%`, `90% of cells ≤ ${pct(sl, .9).toFixed(0)}%`) : t(`ในรัศมี ~125 m · สูงสุด ${Math.max(...sl).toFixed(0)}%`, `within ~125 m · max ${Math.max(...sl).toFixed(0)}%`)]);
  $('soilTiles').innerHTML = rows.map(([a, b, c]) => `<div>${a}<b>${b}</b>${c}</div>`).join('') + (S.soilFallback ? `<div>${t('หมายเหตุ', 'Note')}<b class="d">${t('ใช้ค่าดินพื้นที่เดโม', 'Demo-area soil used')}</b>${t('ดึง SoilGrids ของจุดนี้ไม่ได้ (เช่น เป็นน้ำหรือเมือง)', 'SoilGrids had no value here (e.g. water or urban)')}</div>` : '');
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
/* Slope (%) samples within ~125 m of the point from SRTM-derived terrain tiles (terrarium) */
async function slopeAt(lat, lon) {
  const z = 13, n = 2 ** z, fx = (lon + 180) / 360 * n, r = lat * Math.PI / 180, fy = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
  const x0 = Math.floor(fx) - 1, y0 = Math.floor(fy) - 1, cv = document.createElement('canvas'); cv.width = cv.height = 768;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  await Promise.all([0, 1, 2].flatMap(i => [0, 1, 2].map(j => new Promise((ok, no) => {
    const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { ctx.drawImage(im, i * 256, j * 256); ok(); }; im.onerror = no;
    im.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x0 + i}/${y0 + j}.png`; }))));
  const px = ctx.getImageData(0, 0, 768, 768).data, el = (X, Y) => { const k = (Math.round(Y) * 768 + Math.round(X)) * 4; return px[k] * 256 + px[k + 1] + px[k + 2] / 256 - 32768; };
  const res = 156543.03392 * Math.cos(r) / n, cX = (fx - x0) * 256, cY = (fy - y0) * 256, step = 125 / res / 3, out = [];
  for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) { const X = cX + a * step, Y = cY + b * step;
    out.push(Math.hypot((el(X + 1, Y) - el(X - 1, Y)) / (2 * res), (el(X, Y + 1) - el(X, Y - 1)) / (2 * res)) * 100); }
  return out;
}
function setStatus(id, state, msg) {
  const el = $('st-' + id); if (!el) return;
  el.dataset.state = state; el.querySelector('em').textContent = msg || '';
}
function liveStatusHTML() {
  const rows = [['power', t('NASA POWER ภูมิอากาศ 2001–2025', 'NASA POWER climate 2001–2025')], ['recent', t('NASA POWER 90 วันล่าสุด', 'NASA POWER last 90 days')], ['soil', t('ดิน (SoilGrids)', 'Soil (SoilGrids)')], ['slope', t('ความลาดชัน (SRTM)', 'Slope (SRTM)')]];
  return rows.map(([k, l]) => `<li id="st-${k}" data-state="wait"><i></i>${l}<em></em></li>`).join('');
}
function onMapClick(e) {
  const { lat, lng } = e.latlng;
  const btn = `<button type="button" class="btn" id="goLive" style="margin-top:6px">${t('วิเคราะห์จุดนี้ด้วยข้อมูล NASA สด', 'Analyse this point with live NASA data')}</button>`;
  L.popup().setLatLng(e.latlng).setContent(`<b>${lat.toFixed(4)}, ${lng.toFixed(4)}</b><br>${btn}`).openOn(map);
  setTimeout(() => { const b = $('goLive'); if (b) b.onclick = () => { map.closePopup(); loadLive(lat, lng); }; }, 0);
}
async function loadLive(lat, lon) {
  lon = ((lon + 540) % 360) - 180;
  const key = lat.toFixed(2) + ',' + lon.toFixed(2);
  $('liveBox').hidden = false; $('liveList').innerHTML = liveStatusHTML();
  $('liveTitle').textContent = t('กำลังโหลดข้อมูล NASA สด…', 'Loading live NASA data…');
  try { history.replaceState(null, '', '#p=' + lat.toFixed(4) + ',' + lon.toFixed(4)); } catch (e) {}
  let site = liveCache.get(key);
  if (!site) {
    ['power', 'soil', 'slope'].forEach(k => setStatus(k, 'load', '…'));
    const [pw, sg, slp] = await Promise.allSettled([
      getJSON(powerURL(lat, lon, '20010101', '20251231'), 60000),
      getJSON(`https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon.toFixed(4)}&lat=${lat.toFixed(4)}&property=phh2o&property=soc&property=clay&property=sand&depth=0-5cm&depth=5-15cm&depth=15-30cm&depth=30-60cm&depth=60-100cm&value=mean`, 30000),
      slopeAt(lat, lon)
    ]);
    if (pw.status !== 'fulfilled') {
      setStatus('power', 'err', t('ดึงไม่ได้ ใช้พื้นที่เดโมต่อ', 'failed; staying on demo area'));
      $('liveTitle').textContent = t('โหลดข้อมูลสดไม่ได้', 'Live data failed'); return;
    }
    const cl = buildClimate(pw.value.properties.parameter, lat);
    setStatus('power', 'ok', cl.days.length.toLocaleString() + t(' วัน', ' days'));
    let soil = sg.status === 'fulfilled' ? soilFromGrids(sg.value) : null, soilFallback = false;
    if (soil) setStatus('soil', 'ok', 'pH ' + soil.ph); else { soil = DEMO.soil; soilFallback = true; setStatus('soil', 'err', t('ไม่มีค่า ใช้ค่าเดโม', 'no value; demo soil used')); }
    const slopeSamples = slp.status === 'fulfilled' ? slp.value : [];
    setStatus('slope', slopeSamples.length ? 'ok' : 'err', slopeSamples.length ? pct(slopeSamples, .5).toFixed(0) + '%' : t('ดึงไม่ได้', 'failed'));
    site = { name: 'live', lat, lon, clim: cl.clim, annual: cl.annual, yearly: cl.yearly, days: cl.days, soil, soilFallback, slopeSamples, fetched: new Date().toISOString().slice(0, 10) };
    liveCache.set(key, site);
  } else ['power', 'soil', 'slope'].forEach(k => setStatus(k, 'ok', t('จากแคช', 'cached')));
  setMode('live', site);
  loadRecent(site);
}
function setLoc() {
  $('locText').innerHTML = MODE === 'live' ? t(`จุดที่เลือก (ข้อมูลสด)<br>${S.lat.toFixed(3)}°, ${S.lon.toFixed(3)}°`, `Selected point (live data)<br>${S.lat.toFixed(3)}°, ${S.lon.toFixed(3)}°`) : t('พื้นที่เดโม: ลพบุรีตะวันออก 8×8 km<br>15.18°N 101.13°E', 'Demo area: east Lopburi, Thailand, 8×8 km<br>15.18°N 101.13°E');
  if ($('liveTitle') && MODE === 'live') $('liveTitle').textContent = t(`จุด ${S.lat.toFixed(3)}, ${S.lon.toFixed(3)} · ข้อมูล NASA สด (ดึงเมื่อ ${S.fetched})`, `Point ${S.lat.toFixed(3)}, ${S.lon.toFixed(3)} · live NASA data (fetched ${S.fetched})`);
}
function setMode(mode, site) {
  MODE = mode; S = site; evKey = ''; recCache.key = '';
  if (map) {
    if (mode === 'live') {
      if (map.hasLayer(cellLayer)) map.removeLayer(cellLayer);
      if (liveMarker) liveMarker.setLatLng([S.lat, S.lon]); else liveMarker = L.circleMarker([S.lat, S.lon], { radius: 8, color: '#ffffff', weight: 3, fillColor: '#c4512b', fillOpacity: 1 }).addTo(map);
      map.setView([S.lat, S.lon], Math.max(map.getZoom(), 11));
    } else {
      if (!map.hasLayer(cellLayer)) cellLayer.addTo(map);
      if (liveMarker) { map.removeLayer(liveMarker); liveMarker = null; }
      map.setView([DEMO.lat, DEMO.lon], 13);
    }
  }
  $('liveTitle').textContent = mode === 'live' ? t(`จุด ${S.lat.toFixed(3)}, ${S.lon.toFixed(3)} · ข้อมูล NASA สด (ดึงเมื่อ ${S.fetched})`, `Point ${S.lat.toFixed(3)}, ${S.lon.toFixed(3)} · live NASA data (fetched ${S.fetched})`) : '';
  $('liveBox').hidden = mode !== 'live';
  $('layerBtns').closest('div').style.opacity = mode === 'live' ? .45 : 1;
  setLoc();
  document.querySelectorAll('.demoOnly').forEach(el => el.hidden = mode === 'live');
  if (mode === 'demo') { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
  $('baseSel').value = mode === 'live' ? '0' : '3';
  update(); drawCharts(); trends(); soilTiles(); paintCells(); links();
}
/* T2 — last 90 days vs the same calendar window in 2001–2025 */
async function loadRecent(site) {
  const box = $('recentBody'); setStatus('recent', 'load', '…');
  box.innerHTML = `<p class="note">${t('กำลังดึงข้อมูล 90 วันล่าสุดจาก NASA POWER…', 'Fetching the last 90 days from NASA POWER…')}</p>`;
  try {
    if (!site.days) { const pw = await getJSON(powerURL(site.lat, site.lon, '20010101', '20251231'), 60000); site.days = buildClimate(pw.properties.parameter, site.lat).days; }
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
    S.recent = { pctP, dTx };
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
    if (window.Chart) {
      charts.recent && charts.recent.destroy();
      charts.recent = new Chart($('cRecent'), { type: 'line', data: { labels: last.map(k => `${+k.slice(6, 8)} ${MTH[LANG][+k.slice(4, 6) - 1]}`), datasets: [
        { label: t('ฝนสะสมปีนี้ (mm)', 'Cumulative rain now (mm)'), data: nowCum, borderColor: css('--water'), backgroundColor: css('--water'), pointRadius: 0, borderWidth: 2.5 },
        { label: t('ค่าปกติ 2001–2025', 'Normal 2001–2025'), data: normCum, borderColor: css('--muted'), borderDash: [5, 4], pointRadius: 0 },
        { label: t('ช่วง 20–80%', '20–80% range'), data: hi, borderColor: 'transparent', backgroundColor: 'rgba(42,111,158,.12)', fill: '+1', pointRadius: 0 },
        { label: '_lo', data: lo, borderColor: 'transparent', pointRadius: 0 }] },
        options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true }, x: { ticks: { maxTicksLimit: 8 } } }, plugins: { legend: { labels: { boxWidth: 12, filter: i => i.text !== '_lo' } } } } });
    }
  } catch (e) {
    setStatus('recent', 'err', t('ดึงไม่ได้', 'failed'));
    box.innerHTML = `<p class="note">${t('ดึงข้อมูลล่าสุดจาก NASA POWER ไม่ได้ ลองใหม่ภายหลัง', 'Could not fetch recent NASA POWER data; try again later')} (${e.message})</p>`;
  }
}

/* ---------- boot ---------- */
['sRain', 'sTemp'].forEach(id => $(id).addEventListener('input', update));
['cIrr', 'cMach', 'baseSel'].forEach(id => $(id).addEventListener('change', update));
$('opac').addEventListener('input', paintCells);
$('lTH').onclick = () => setLang('th'); $('lEN').onclick = () => setLang('en');
$('backDemo').onclick = () => { setMode('demo', DEMO); loadRecent(DEMO); };
document.body.dataset.lang = LANG;
fetch('data/site.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => {
  DEMO = d; S = d; buildControls(); setLang(LANG); initMap(); paintCells();
  const mq = matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener && mq.addEventListener('change', drawCharts);
  const m = location.hash.match(/^#p=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  if (m) loadLive(+m[1], +m[2]); else loadRecent(DEMO);
}).catch(e => { $('summary').textContent = t('โหลดข้อมูลไม่ได้: ', 'Could not load data: ') + e.message; });
