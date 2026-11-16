/* ===================================================================== utilidades */
const D = JSON.parse(document.getElementById("dados").textContent);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const COR = {};
["--bg", "--painel", "--painel2", "--linha", "--tinta", "--tinta2", "--tinta3", "--si", "--si-atomo", "--oxido", "--p-inativo",
 "--p-ativo", "--eletron", "--lacuna", "--ouro", "--perigo", "--ida", "--volta", "--oxigenio"].forEach(k => COR[k.slice(2)] = css(k));
const FONTE_DADO = css("--f-dado"), FONTE_TEXTO = css("--f-texto");
const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function interp(xs, ys, x) {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] > x) hi = m; else lo = m; }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] + t * (ys[hi] - ys[lo]);
}
const inverso = (xs, ys, y) => interp(ys, xs, y); // ys crescente em xs
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SUP = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
function sci(v, c = 1) {
  if (!isFinite(v) || v === 0) return "0";
  const s = v < 0 ? "−" : "";
  v = Math.abs(v);
  let e = Math.floor(Math.log10(v)), m = v / Math.pow(10, e);
  if (+m.toFixed(c) >= 10) { m /= 10; e += 1; }
  return s + m.toFixed(c).replace(".", ",") + "×10" + String(e).split("").map(d => SUP[d]).join("");
}
function br(v, c = 1) { if (!isFinite(v)) return "n/d"; return (v < 0 && +Math.abs(v).toFixed(c) !== 0 ? "−" : "") + Math.abs(v).toFixed(c).replace(".", ","); }
function semente(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function erf(x) { // Abramowitz e Stegun 7.1.26, erro < 1,5e-7
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
function b64u8(s) { const b = atob(s); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
function b64i16(s) { const u = b64u8(s); return new Int16Array(u.buffer, u.byteOffset, u.byteLength >> 1); }
function ticks(a, b, n) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.abs(b - a) / n || 1)));
  const passo = [1, 2, 5, 10].map(m => m * p).find(v => (b - a) / v <= n) || p * 10;
  const r = []; for (let v = Math.ceil(a / passo) * passo; v <= b + 1e-9; v += passo) r.push(+v.toFixed(6)); return r;
}

/* canvas com densidade de pixels correta; altura escala com a largura */
function preparar(cv) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(240, cv.clientWidth);
  if (!cv.dataset.h) cv.dataset.h = cv.getAttribute("height");
  const base = +cv.dataset.h;
  const H = cv.dataset.razao ? Math.round(w * +cv.dataset.razao) : Math.round(base * clamp(w / 560, 0.8, 1));
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + "px";
  }
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h: H };
}
function eixos(ctx, caixa, xr, yr, o) {
  const { x0, y0, x1, y1 } = caixa;
  const X = v => x0 + (o.xlog ? (Math.log10(v) - Math.log10(xr[0])) / (Math.log10(xr[1]) - Math.log10(xr[0])) : (v - xr[0]) / (xr[1] - xr[0])) * (x1 - x0);
  const Y = v => y1 - (o.ylog ? (Math.log10(Math.max(v, yr[0] * 1e-3)) - Math.log10(yr[0])) / (Math.log10(yr[1]) - Math.log10(yr[0])) : (v - yr[0]) / (yr[1] - yr[0])) * (y1 - y0);
  ctx.save();
  ctx.font = "11px " + FONTE_DADO;
  ctx.fillStyle = COR.tinta3; ctx.strokeStyle = COR.linha; ctx.lineWidth = 1;
  (o.xt || []).forEach(t => { const px = X(t[0]); ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px, y1); ctx.globalAlpha = .55; ctx.stroke(); ctx.globalAlpha = 1; ctx.textAlign = "center"; ctx.fillText(t[1], px, y1 + 14); });
  (o.yt || []).forEach(t => { const py = Y(t[0]); ctx.beginPath(); ctx.moveTo(x0, py); ctx.lineTo(x1, py); ctx.globalAlpha = .55; ctx.stroke(); ctx.globalAlpha = 1; ctx.textAlign = "right"; ctx.fillText(t[1], x0 - 5, py + 4); });
  ctx.fillStyle = COR.tinta2; ctx.textAlign = "center";
  if (o.xl) ctx.fillText(o.xl, (x0 + x1) / 2, y1 + 29);
  if (o.yl) { ctx.save(); ctx.translate(x0 - 40, (y0 + y1) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(o.yl, 0, 0); ctx.restore(); }
  ctx.restore();
  return { X, Y };
}
function curva(ctx, xs, ys, X, Y, cor, larg = 2, tracejado, alfa = 1) {
  ctx.save(); ctx.strokeStyle = cor; ctx.lineWidth = larg; ctx.lineJoin = "round"; ctx.globalAlpha = alfa; if (tracejado) ctx.setLineDash(tracejado);
  ctx.beginPath(); let ini = false;
  for (let i = 0; i < xs.length; i++) { const px = X(xs[i]), py = Y(ys[i]); if (!isFinite(py) || !isFinite(px)) continue; if (!ini) { ctx.moveTo(px, py); ini = true; } else ctx.lineTo(px, py); }
  ctx.stroke(); ctx.restore();
}
function ponto(ctx, x, y, cor) { ctx.save(); ctx.fillStyle = cor; ctx.strokeStyle = COR.painel; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 5, 0, 6.283); ctx.fill(); ctx.stroke(); ctx.restore(); }
function lab(ctx, x, y, t, al = "left", cor) { ctx.save(); ctx.fillStyle = cor || COR.tinta2; ctx.font = "11px " + FONTE_DADO; ctx.textAlign = al; ctx.fillText(t, x, y); ctx.restore(); }
const EXP = ["10¹⁵", "10¹⁶", "10¹⁷", "10¹⁸", "10¹⁹", "10²⁰", "10²¹"];
function numerosHTML(lista) { return lista.map(n => `<div class="num"><b>${n[1]}</b><span>${n[0]}${n[2] ? ` <span class="etiqueta">${n[2]}</span>` : ""}</span></div>`).join(""); }

/* ===================================================================== processo escolhido */
const PROC = { mascara: "A", sombra: "sombra", variante: "A", ramo: "ho_plummer", T: "900" };
const ouvintesProc = [];
function mudarProc(k, v) { PROC[k] = v; const sel = document.getElementById("sel-" + k); if (sel && sel.value !== v) sel.value = v; ouvintesProc.forEach(f => f(k)); }
const chaveProc = () => `${PROC.variante}|${PROC.ramo}|${PROC.T}`;
const NOME_VAR = { A: "RTA a 1050 °C por 10 s", B850: "forno a 850 °C por 30 min", B900: "forno a 900 °C por 30 min" };
const NOME_RAMO = { ho_plummer: "Ho e Plummer (R29)", nomura: "fator 2,1 de Nomura (R23)", sem_aceleracao: "sem aceleração, como o Si leve (N10)" };

/* ===================================================================== dados da borda 2D */
const BD = D.borda;
const NX = BD.x.length, NY = BD.y.length;
const Q8 = BD.q8;
function decodMapa(s) { // log10(C) por célula, índice j*NX + i (j lateral, i profundidade)
  const u = b64u8(s); const f = new Float32Array(u.length);
  for (let k = 0; k < u.length; k++) f[k] = Q8.lo + u[k] / 255 * (Q8.hi - Q8.lo);
  return f;
}
const cacheMapas = new Map();
function mapa(s) { if (!cacheMapas.has(s)) cacheMapas.set(s, decodMapa(s)); return cacheMapas.get(s); }
const cacheBits = new Map();
function bits(s) { if (!cacheBits.has(s)) cacheBits.set(s, b64u8(s)); return cacheBits.get(s); }
function misturaMapa(a, b, t) { if (t <= 0) return a; if (t >= 1) return b; const r = new Float32Array(a.length); for (let k = 0; k < a.length; k++) r[k] = a[k] * (1 - t) + b[k] * t; return r; }

const FN_MAX = Math.max(...BD.Fn);
const LIM_CENTRAL = 0.5 * (D.implante.dose_limiar[0] + D.implante.dose_limiar[1]);
function cobertura(i, y, ys) { return 0.5 * (1 + erf((y - ys - BD.mu_y[i]) / (Math.SQRT2 * BD.sg_y[i]))); }
