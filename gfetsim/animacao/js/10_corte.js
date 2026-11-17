/* ===================================================================== FABRICAÇÃO 2D */
const I = D.implante;
const G = D.grade_nm;
const LAT = 220, Z0 = -175, Z1 = 255;
const ETAPAS_C = [
  { id: "lamina", nome: "Lâmina e máscara", dur: 3.5 },
  { id: "implante", nome: "Implantação de P", dur: 15 },
  { id: "remocao", nome: "Remoção da máscara", dur: 3 },
  { id: "spe", nome: "SPE a 550 °C", dur: 6.5 },
  { id: "quente", nome: "RTA ou forno", dur: 8 },
  { id: "oxidacao", nome: "Oxidação de porta", dur: 11 },
  { id: "grafeno", nome: "Grafeno e contatos", dur: 5 },
];
(() => { let t = 0; ETAPAS_C.forEach(e => { e.ini = t; t += e.dur; }); })();
const TT_C = ETAPAS_C.reduce((s, e) => s + e.dur, 0);
const estC = { t: 0.001, tocando: !reduzir, vel: 1, ySel: 120 };
const TAN7 = Math.tan(I.inclinacao * Math.PI / 180);
const CONSUMO = 0.44; // nm de Si por nm de óxido, receita [B]

/* --------------------------------------------------- campo físico 2D no instante t */
function rec1D() { return D.recozimento[PROC.variante]; }
function oxi1D() { return D.oxidacao[chaveProc()]; }
function framesRec2D() { return BD.recozimento[PROC.variante][PROC.sombra]; }
function etapaEm(lista, t) { return lista.find(x => t < x.ini + x.dur) || lista[lista.length - 1]; }

function lerpFrames(fr, s, chave) { // s contínuo em índice de quadro
  const i = clamp(Math.floor(s), 0, fr.length - 2), t = clamp(s - i, 0, 1);
  return misturaMapa(mapa(fr[i][chave]), mapa(fr[i + 1][chave]), t);
}
function perfil1DEmMapa(Cs) { const f = new Float32Array(NX * NY); for (let i = 0; i < NX; i++) { const v = Math.log10(Math.max(interp(G, Cs, BD.x[i]), 1e15)); for (let j = 0; j < NY; j++) f[j * NX + i] = v; } return f; }
function mapaConst(v) { return new Float32Array(NX * NY).fill(v); }

function campo(t) {
  const e = etapaEm(ETAPAS_C, t), u = clamp((t - e.ini) / e.dur, 0, 1), ordem = ETAPAS_C.indexOf(e);
  const F = { etapa: e, u, ordem, Tc: 25, tReal: 0, mascaraVis: PROC.mascara === "A" ? 1 : 0, dose: 1, nativo: I.oxido_nativo,
              si: new Float32Array(NY), xox: new Float32Array(NY), amorfo: null, dano: null, logC: null, logA: null, grafeno: 0, contatos: 0, F: null };
  const ys = PROC.sombra === "sombra" ? BD.sombra_nm : 0;
  const comBorda = PROC.mascara === "A";
  if (ordem <= 2) {
    F.dose = ordem === 0 ? 0 : ordem === 1 ? clamp(u / 0.94, 0, 1) : 1;
    if (ordem === 0) F.mascaraVis *= clamp(u * 1.6, 0, 1);
    if (ordem === 2) F.mascaraVis *= 1 - u;
    const lf = Math.log10(Math.max(F.dose, 1e-9));
    if (comBorda) { const m0 = mapa(BD.implante[PROC.sombra]); F.logC = new Float32Array(m0.length); for (let k = 0; k < m0.length; k++) F.logC[k] = m0[k] + lf; }
    else { const Cs = I.x.map((x, k) => I.C[k]); F.logC = perfil1DEmMapa(G.map(z => interp(I.x.map(x => x - I.oxido_nativo), Cs, z))); for (let k = 0; k < F.logC.length; k++) F.logC[k] += lf; }
    F.logA = mapaConst(14);
    F.amorfo = new Uint8Array(NX * NY); F.dano = new Float32Array(NX * NY);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const cob = comBorda ? cobertura(i, BD.y[j], ys) : 1;
      const r = BD.Fn[i] * cob * F.dose * I.dose / (FN_MAX * LIM_CENTRAL);
      F.dano[j * NX + i] = r; F.amorfo[j * NX + i] = r >= 1 ? 1 : 0;
    }
    F.tReal = F.dose; // fração da dose
  } else if (ordem === 3 || ordem === 4) {
    F.mascaraVis = 0;
    if (comBorda) {
      const fr = framesRec2D(); const nSpe = 10;
      const s = ordem === 3 ? u * (nSpe - 1) : (nSpe - 1) + u * (fr.length - nSpe);
      F.logC = lerpFrames(fr, s, "C"); F.logA = lerpFrames(fr, s, "A");
      const k = Math.round(clamp(s, 0, fr.length - 1)); F.amorfo = bits(fr[k].am);
      F.Tc = fr[k].T; F.tReal = fr[Math.min(fr.length - 1, Math.floor(s))].t_s * (1 - (s % 1)) + fr[Math.min(fr.length - 1, Math.ceil(s))].t_s * (s % 1);
    } else {
      const Q = rec1D().quadros; const nSpe = Q.findIndex(q => q.etapa !== "SPE");
      const s = ordem === 3 ? u * (nSpe - 1) : (nSpe - 1) + u * (Q.length - nSpe);
      const i0 = clamp(Math.floor(s), 0, Q.length - 2), tt = s - i0;
      const mix = (a, b) => a.map((v, k) => Math.exp(Math.log(Math.max(v, 1e14)) * (1 - tt) + Math.log(Math.max(b[k], 1e14)) * tt));
      F.logC = perfil1DEmMapa(mix(Q[i0].C, Q[i0 + 1].C)); F.logA = perfil1DEmMapa(mix(Q[i0].A, Q[i0 + 1].A));
      const fr = Q[i0].frente_amorfa * (1 - tt) + Q[i0 + 1].frente_amorfa * tt;
      F.amorfo = new Uint8Array(NX * NY); if (fr > 0.5) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) F.amorfo[j * NX + i] = BD.x[i] <= fr ? 1 : 0;
      F.Tc = Q[i0 + 1].T; F.tReal = Q[i0].t_s * (1 - tt) + Q[i0 + 1].t_s * tt;
    }
  } else {
    F.mascaraVis = 0;
    const uu = ordem === 5 ? u : 1;
    const O = oxi1D(), t20 = O.t20_min, tr = uu * t20;
    F.tReal = tr; F.Tc = ordem === 5 ? +PROC.T : 25;
    if (comBorda) {
      const fr0 = framesRec2D(); const fin = fr0[fr0.length - 1];
      const fo = [{ t_min: 0, C: fin.C, A: fin.A, xox: new Array(NY).fill(0), si: new Array(NY).fill(0) }].concat(BD.oxidacao[chaveProc()]);
      let k = 0; while (k < fo.length - 2 && fo[k + 1].t_min < tr) k++;
      const tt = clamp((tr - fo[k].t_min) / (fo[k + 1].t_min - fo[k].t_min), 0, 1);
      F.logC = misturaMapa(mapa(fo[k].C), mapa(fo[k + 1].C), tt); F.logA = misturaMapa(mapa(fo[k].A), mapa(fo[k + 1].A), tt);
      // Si consumido = 0,44 x_ox [B]; o valor exportado vem em passos de 2 nm da grade
      for (let j = 0; j < NY; j++) { F.xox[j] = fo[k].xox[j] * (1 - tt) + fo[k + 1].xox[j] * tt; F.si[j] = CONSUMO * F.xox[j]; }
    } else {
      const qo = O.quadros; let k = 0; while (k < qo.length - 2 && qo[k + 1].t_min < tr) k++;
      const tt = clamp((tr - qo[k].t_min) / (qo[k + 1].t_min - qo[k].t_min || 1), 0, 1);
      const mix = (a, b) => a.map((v, i) => Math.exp(Math.log(Math.max(v, 1e14)) * (1 - tt) + Math.log(Math.max(b[i], 1e14)) * tt));
      F.logC = perfil1DEmMapa(mix(qo[k].C, qo[k + 1].C)); F.logA = perfil1DEmMapa(mix(qo[k].A, qo[k + 1].A));
      F.xox.fill(qo[k].x_ox * (1 - tt) + qo[k + 1].x_ox * tt); F.si.fill(CONSUMO * F.xox[0]);
    }
    const c = O.curva; F.F = interp(c.t, c.F, tr);
    F.taxa = (interp(c.t, c.x, tr + 0.02 * t20) - interp(c.t, c.x, Math.max(0, tr - 0.02 * t20))) / (0.04 * t20); // nm/min
    if (F.xox[0] > 0.3) F.nativo = 0;
    if (ordem === 6) { F.grafeno = clamp(u * 2, 0, 1); F.contatos = clamp(u * 2 - 1, 0, 1); }
  }
  return F;
}

/* --------------------------------------------------- amostragem dos pontos de P a partir do mapa */
const rndC = semente(7);
const PONTOS = Array.from({ length: 2600 }, () => ({ u: rndC(), v: rndC(), r: rndC(), ord: rndC() }));
PONTOS.sort((a, b) => a.ord - b.ord);
const fimMascara = I.mascara.map(io => io.ion[io.ion.length - 1]);
const PONTOS_M = Array.from({ length: 700 }, (_, i) => { const f = fimMascara[i % fimMascara.length]; return { y: -LAT + rndC() * LAT, z: f[0] - I.mascara_nm + (rndC() - .5) * 10, ord: rndC() }; });

function amostrador(F) {
  const dx = BD.x[1] - BD.x[0];
  const cdfCol = new Float32Array(NY * NX), peso = new Float64Array(NY);
  for (let j = 0; j < NY; j++) {
    let s = 0;
    for (let i = 0; i < NX; i++) { s += Math.pow(10, F.logC[j * NX + i]) * dx; cdfCol[j * NX + i] = s; }
    peso[j] = s;
    for (let i = 0; i < NX; i++) cdfCol[j * NX + i] /= s || 1;
  }
  const cdfLat = new Float64Array(NY); let acc = 0;
  for (let j = 0; j < NY; j++) { acc += peso[j]; cdfLat[j] = acc; }
  for (let j = 0; j < NY; j++) cdfLat[j] /= acc;
  return (pt) => {
    let j = 0; while (j < NY - 1 && cdfLat[j] < pt.u) j++;
    const j0 = Math.max(0, j - 1), a = j === 0 ? 0 : cdfLat[j0], b = cdfLat[j];
    const fy = j === 0 ? 0.5 : clamp((pt.u - a) / ((b - a) || 1), 0, 1);
    const y = BD.y[0] + (j === 0 ? 0 : (j0 + fy)) * (BD.y[1] - BD.y[0]);
    const jj = clamp(Math.round(j0 + fy), 0, NY - 1);
    let i = 0; while (i < NX - 1 && cdfCol[jj * NX + i] < pt.v) i++;
    const c0 = i === 0 ? 0 : cdfCol[jj * NX + i - 1], c1 = cdfCol[jj * NX + i];
    const z = (i === 0 ? BD.x[0] : BD.x[i - 1]) + clamp((pt.v - c0) / ((c1 - c0) || 1), 0, 1) * dx;
    const k = jj * NX + i;
    const frac = Math.pow(10, F.logA[k] - F.logC[k]);
    return { y, z, j: jj, ativo: pt.r < frac && F.logA[k] > 15.05 };
  };
}

/* --------------------------------------------------- trajetórias com tempo próprio */
function prepTraj(lista, desloc) {
  return lista.map(io => {
    const pts = io.ion.map(p => ({ x: p[0] - desloc, y: p[1], z: p[2], E: p[3] }));
    const tt = [0];
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z); tt.push(tt[i - 1] + d / Math.sqrt(Math.max(pts[i - 1].E, 60))); }
    const T = tt[tt.length - 1] || 1, tn = tt.map(v => v / T);
    const rec = io.rec.map(r => {
      const o = r[0]; let melhor = 0, dm = 1e9;
      pts.forEach((p, i) => { const d = Math.hypot(p.x - (o[0] - desloc), p.y - o[1], p.z - o[2]); if (d < dm) { dm = d; melhor = i; } });
      return { t0: tn[melhor], pts: r.map(q => ({ x: q[0] - desloc, y: q[1], z: q[2] })) };
    });
    return { pts, tn, rec, dano: io.dano.map(d => ({ x: d[0] - desloc, y: d[1], z: d[2] })) };
  });
}
const TRAJ_J = prepTraj(I.janela, I.oxido_nativo), TRAJ_M = prepTraj(I.mascara, I.mascara_nm);

const PASSO = 7, REDE = [];
for (let z = 1; z < Z1; z += PASSO) for (let y = -LAT + 2; y < LAT; y += PASSO) REDE.push({ z, y, jy: (rndC() - .5) * 2, jz: (rndC() - .5) * 2 });
const O2 = [];

/* --------------------------------------------------- desenho */
const cvFab = document.getElementById("cv-fab");
cvFab.dataset.razao = String((Z1 - Z0) / (2 * LAT));
const imgOff = document.createElement("canvas");
const SUBLAT = 4; // colunas interpoladas por coluna de dado
imgOff.width = NY * SUBLAT; imgOff.height = NX;
const ctxOff = imgOff.getContext("2d");
const RGB_I = [227, 163, 42], RGB_A = [54, 194, 180];
let escFab = 1, oxFab = 0, ozFab = 0;
const Pf = (y, z) => [oxFab + y * escFab, ozFab + z * escFab];
function colDe(y) { return clamp((y - BD.y[0]) / (BD.y[1] - BD.y[0]), 0, NY - 1); }
function siEm(F, y) { const c = colDe(y), j = Math.floor(c), t = c - j; return j >= NY - 1 ? F.si[NY - 1] : F.si[j] * (1 - t) + F.si[j + 1] * t; }
function xoxEm(F, y) { const c = colDe(y), j = Math.floor(c), t = c - j; return j >= NY - 1 ? F.xox[NY - 1] : F.xox[j] * (1 - t) + F.xox[j + 1] * t; }

function desenharMapa(ctx, F) {
  const W = NY * SUBLAT, img = ctxOff.createImageData(W, NX), d = img.data;
  for (let jj = 0; jj < W; jj++) {
    const c = jj / SUBLAT, j = Math.min(Math.floor(c), NY - 2), t = c - j;
    for (let i = 0; i < NX; i++) {
      const lc = F.logC[j * NX + i] * (1 - t) + F.logC[(j + 1) * NX + i] * t;
      const la = F.logA[j * NX + i] * (1 - t) + F.logA[(j + 1) * NX + i] * t;
      const v = clamp((lc - 16.6) / 4.4, 0, 1);
      const r = la > 15.05 ? clamp(Math.pow(10, la - lc), 0, 1) : 0;
      const p = (i * W + jj) * 4;
      d[p] = RGB_I[0] * (1 - r) + RGB_A[0] * r; d[p + 1] = RGB_I[1] * (1 - r) + RGB_A[1] * r; d[p + 2] = RGB_I[2] * (1 - r) + RGB_A[2] * r;
      d[p + 3] = Math.round(255 * 0.62 * Math.pow(v, 1.3));
    }
  }
  ctxOff.putImageData(img, 0, 0);
  const dy = BD.y[1] - BD.y[0];
  ctx.save(); ctx.imageSmoothingEnabled = true;
  for (let jj = 0; jj < W - 1; jj++) {
    const y = BD.y[0] + jj / SUBLAT * dy;
    const si = siEm(F, y);
    const [px, pz] = Pf(y, si + BD.x[0] - 2);
    ctx.drawImage(imgOff, jj, 0, 1, NX, px, pz, dy / SUBLAT * escFab + 0.6, (BD.x[NX - 1] - BD.x[0] + 4) * escFab);
  }
  ctx.restore();
}

function desenharFab(F, tAnim) {
  const { ctx, w, h } = preparar(cvFab);
  escFab = Math.min(w / (2 * LAT), h / (Z1 - Z0)); oxFab = w / 2; ozFab = -Z0 * escFab + (h - (Z1 - Z0) * escFab) / 2;
  ctx.fillStyle = "#0a0e11"; ctx.fillRect(0, 0, w, h);
  // substrato (abaixo da interface de cada coluna)
  ctx.fillStyle = "#1e262c"; ctx.beginPath();
  for (let y = -LAT; y <= LAT; y += 4) { const [px, pz] = Pf(y, siEm(F, y)); if (y === -LAT) ctx.moveTo(px, pz); else ctx.lineTo(px, pz); }
  ctx.lineTo(...Pf(LAT, Z1)); ctx.lineTo(...Pf(-LAT, Z1)); ctx.closePath(); ctx.fill();
  desenharMapa(ctx, F);
  // rede de Si, com amorfização e dano subamorfizante
  for (const a of REDE) {
    const si = siEm(F, a.y);
    if (a.z < si) continue;
    const j = Math.round(colDe(a.y)), i = clamp(Math.round((a.z - si - BD.x[0]) / (BD.x[1] - BD.x[0])), 0, NX - 1), k = j * NX + i;
    let am = F.amorfo ? F.amorfo[k] : 0, dn = F.dano ? clamp(F.dano[k], 0, 1) : 0;
    let jy = 0, jz = 0;
    if (am) { jy = a.jy * 3.2 * PASSO * 0.45; jz = a.jz * 3.2 * PASSO * 0.45; }
    else if (dn > 0.15) { jy = a.jy * dn * 1.6; jz = a.jz * dn * 1.6; }
    const [px, pz] = Pf(a.y + jy, a.z + jz);
    ctx.fillStyle = am ? "rgba(227,163,42,.55)" : dn > 0.15 ? `rgba(${138 + 80 * dn},${152 - 20 * dn},${162 - 60 * dn},.7)` : "rgba(138,152,162,.72)";
    ctx.fillRect(px - 1.1, pz - 1.1, 2.2, 2.2);
  }
  // óxido de porta, coluna a coluna (o topo fica 0,56 x_ox acima da superfície original)
  if (F.xox.some(v => v > 0.2)) {
    ctx.fillStyle = "rgba(143,132,230,.55)"; ctx.beginPath();
    for (let y = -LAT; y <= LAT; y += 4) { const [px, pz] = Pf(y, siEm(F, y) - xoxEm(F, y)); if (y === -LAT) ctx.moveTo(px, pz); else ctx.lineTo(px, pz); }
    for (let y = LAT; y >= -LAT; y -= 4) ctx.lineTo(...Pf(y, siEm(F, y)));
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(170,160,255,.95)"; ctx.lineWidth = 1; ctx.beginPath();
    for (let y = -LAT; y <= LAT; y += 4) { const [px, pz] = Pf(y, siEm(F, y)); if (y === -LAT) ctx.moveTo(px, pz); else ctx.lineTo(px, pz); } ctx.stroke();
    ctx.setLineDash([4, 4]); ctx.strokeStyle = "rgba(231,236,239,.35)"; ctx.beginPath(); ctx.moveTo(...Pf(-LAT, 0)); ctx.lineTo(...Pf(LAT, 0)); ctx.stroke(); ctx.setLineDash([]);
    lab(ctx, Pf(-LAT, 0)[0] + 6, Pf(0, 0)[1] - 4 - xoxEm(F, -LAT) * 0.56 * escFab, "superfície original", "left");
    // moléculas de O2 com fluxo proporcional à taxa de crescimento
    if (F.ordem === 5) desenharO2(ctx, F, tAnim);
  } else if (F.nativo > 0) { const [a, b] = Pf(-LAT, -F.nativo); ctx.fillStyle = "rgba(143,132,230,.75)"; ctx.fillRect(a, b, 2 * LAT * escFab, Math.max(1.5, F.nativo * escFab)); }
  // máscara
  if (F.mascaraVis > 0.01) {
    const [a, b] = Pf(-LAT, -I.mascara_nm); ctx.fillStyle = `rgba(143,132,230,${0.30 * F.mascaraVis})`; ctx.fillRect(a, b, LAT * escFab, I.mascara_nm * escFab);
    ctx.strokeStyle = `rgba(143,132,230,${0.9 * F.mascaraVis})`; ctx.lineWidth = 1.5; ctx.strokeRect(a, b, LAT * escFab, I.mascara_nm * escFab);
    ctx.fillStyle = `rgba(231,236,239,${0.85 * F.mascaraVis})`; ctx.font = "12px " + FONTE_TEXTO; ctx.textAlign = "center";
    ctx.fillText("máscara de SiO₂, 150 nm", oxFab - LAT * escFab / 2, b + 16);
  }
  // pontos de P
  const amostra = amostrador(F);
  const nMostra = F.ordem <= 2 ? Math.round(PONTOS.length * F.dose) : PONTOS.length;
  for (let k = 0; k < nMostra; k++) {
    const s = amostra(PONTOS[k]);
    const z = siEm(F, s.y) + s.z;
    if (z > Z1) continue;
    const [px, pz] = Pf(s.y, z);
    ctx.fillStyle = s.ativo ? COR["p-ativo"] : COR["p-inativo"]; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(px, pz, s.ativo ? 1.6 : 1.4, 0, 6.283); ctx.fill();
  }
  if (PROC.mascara === "A" && F.mascaraVis > 0.01) {
    ctx.fillStyle = COR["p-inativo"];
    const nm = Math.round(PONTOS_M.length * F.dose);
    for (let k = 0; k < nm; k++) { const p = PONTOS_M[k]; ctx.globalAlpha = 0.6 * F.mascaraVis; const [px, pz] = Pf(p.y, p.z); ctx.beginPath(); ctx.arc(px, pz, 1.3, 0, 6.283); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  // precipitados de SiP onde o P passa de C_sat(T)
  if (F.ordem === 4) desenharPrecipitados(ctx, F);
  if (F.ordem === 1 && F.dose < 0.999) desenharIons(ctx, tAnim - F.etapa.ini, F);
  if (F.ordem <= 2 && PROC.mascara === "A" && PROC.sombra === "sombra" && F.mascaraVis > 0.2) desenharSombra(ctx, F);
  if (F.grafeno > 0) desenharGrafeno(ctx, F);
  // escala, termômetro, coluna escolhida
  ctx.strokeStyle = COR.tinta2; ctx.lineWidth = 1.5; const [r0, rz] = Pf(-LAT + 12, Z1 - 12); ctx.beginPath(); ctx.moveTo(r0, rz); ctx.lineTo(r0 + 50 * escFab, rz); ctx.stroke();
  lab(ctx, r0, rz - 5, "50 nm");
  ctx.textAlign = "right"; ctx.fillStyle = F.Tc > 100 ? "#ffb070" : COR.tinta2; ctx.font = "500 13px " + FONTE_DADO; ctx.fillText(`${Math.round(F.Tc)} °C`, w - 10, 20);
  const [sx] = Pf(estC.ySel, 0); ctx.strokeStyle = "rgba(231,236,239,.35)"; ctx.setLineDash([2, 5]); ctx.beginPath(); ctx.moveTo(sx, Pf(0, Z0 + 20)[1]); ctx.lineTo(sx, h); ctx.stroke(); ctx.setLineDash([]);
}

const VOO = 1.1, INTERVALO = 0.11;
function desenharIons(ctx, tl, F) {
  const kMax = Math.floor(tl / INTERVALO), rr = semente(99);
  const ys = []; for (let k = 0; k <= kMax + 2; k++) ys.push((rr() * 2 - 1) * LAT);
  const comSombra = PROC.sombra === "sombra";
  for (let k = Math.max(0, kMax - 14); k <= kMax; k++) {
    const age = (tl - k * INTERVALO) / VOO; if (age < 0) continue;
    const yTopo = ys[k]; // posição lateral à altura do topo da máscara
    const naMascara = PROC.mascara === "A" && yTopo < 0;
    const lista = naMascara ? TRAJ_M : TRAJ_J, tr = lista[k % lista.length];
    const deriva = comSombra ? (naMascara ? 0 : I.mascara_nm * TAN7) : 0;
    const y0 = yTopo + deriva;
    const lat = p => comSombra ? p.y : p.z; // no ramo sem sombra a inclinação sai do plano do corte
    const fim = Math.min(age, 1);
    // trecho no vácuo, inclinado a 7°, até a superfície de entrada
    const zEnt = naMascara ? -I.mascara_nm : -I.oxido_nativo;
    ctx.strokeStyle = "rgba(255,210,122,.35)"; ctx.lineWidth = 1; ctx.beginPath();
    const zIni = Z0 + 8, yIni = y0 - (comSombra ? (zEnt - zIni) * TAN7 : 0);
    ctx.moveTo(...Pf(yIni, zIni)); ctx.lineTo(...Pf(y0, zEnt)); ctx.globalAlpha = clamp(1.2 - age * 1.5, 0, 1); ctx.stroke();
    ctx.strokeStyle = "rgba(255,210,122,.85)"; ctx.lineWidth = 1.4; ctx.beginPath();
    let ultimo = null;
    for (let i = 0; i < tr.pts.length; i++) {
      const p = tr.pts[i];
      if (tr.tn[i] > fim) { if (i > 0) { const t = (fim - tr.tn[i - 1]) / (tr.tn[i] - tr.tn[i - 1]), a = tr.pts[i - 1]; ultimo = [lat(a) + t * (lat(p) - lat(a)), a.x + t * (p.x - a.x)]; ctx.lineTo(...Pf(y0 + ultimo[0], ultimo[1])); } break; }
      const q = Pf(y0 + lat(p), p.x); if (i === 0) ctx.moveTo(...q); else ctx.lineTo(...q);
      ultimo = [lat(p), p.x];
    }
    ctx.globalAlpha = clamp(1.6 - age, 0, 1); ctx.stroke();
    ctx.strokeStyle = "rgba(255,190,120,.65)"; ctx.lineWidth = 0.9;
    for (const r of tr.rec) { if (fim - r.t0 < 0) continue; ctx.globalAlpha = clamp(1 - (age - r.t0) * 1.2, 0, 0.9); ctx.beginPath(); r.pts.forEach((q, i) => { const pp = Pf(y0 + lat(q), q.x); if (i === 0) ctx.moveTo(...pp); else ctx.lineTo(...pp); }); ctx.stroke(); }
    ctx.fillStyle = "rgba(255,170,90,.9)";
    const al = clamp(1.4 - age, 0, 1) * 0.6;
    if (al > 0) for (let j = 0; j < tr.dano.length; j += 2) { const d = tr.dano[j]; ctx.globalAlpha = al; const [px, pz] = Pf(y0 + lat(d), d.x); ctx.fillRect(px - .7, pz - .7, 1.4, 1.4); }
    ctx.globalAlpha = 1;
    if (age < 1 && ultimo) { const [px, pz] = Pf(y0 + ultimo[0], ultimo[1]); ctx.fillStyle = "#fff0c8"; ctx.beginPath(); ctx.arc(px, pz, 2.6, 0, 6.283); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}
function desenharSombra(ctx, F) {
  const ys = BD.sombra_nm;
  ctx.save(); ctx.globalAlpha = F.mascaraVis;
  ctx.strokeStyle = "rgba(255,210,122,.6)"; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(...Pf(0, -I.mascara_nm)); ctx.lineTo(...Pf(ys, 0)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255,210,122,.10)"; const [a, b] = Pf(0, -2); ctx.fillRect(a, b, ys * escFab, 4);
  lab(ctx, Pf(ys, 0)[0] + 4, Pf(0, -6)[1], `sombra de ${br(ys, 0)} nm`, "left", "#ffd27a");
  ctx.restore();
}
function desenharPrecipitados(ctx, F) {
  const Csat = Math.log10(BD.juncao[PROC.variante].C_sat);
  ctx.save(); ctx.strokeStyle = "rgba(255,240,200,.85)"; ctx.lineWidth = 1;
  for (let j = 0; j < NY; j += 1) for (let i = 0; i < NX; i += 1) {
    const k = j * NX + i, ex = F.logC[k] - Csat;
    if (ex <= 0.01) continue;
    const n = Math.min(3, Math.ceil(ex * 20));
    for (let m = 0; m < n; m++) {
      const y = BD.y[j] + ((j * 7 + m * 13) % 8) - 4, z = BD.x[i] + ((i * 5 + m * 3) % 4) - 2;
      const [px, pz] = Pf(y, siEm(F, y) + z); ctx.beginPath();
      for (let a = 0; a < 6; a++) { const th = a * Math.PI / 3; const X = px + 2.4 * Math.cos(th), Y = pz + 2.4 * Math.sin(th); if (a === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); }
      ctx.closePath(); ctx.stroke();
    }
  }
  ctx.restore();
}
let tUltO2 = 0;
function desenharO2(ctx, F, tAnim) {
  const taxaMax = 20 / (oxi1D().t20_min) * 3;
  const nov = clamp(F.taxa / taxaMax, 0, 1) * 40;
  const dt = clamp(tAnim - tUltO2, 0, 0.1); tUltO2 = tAnim;
  if (estC.tocando && Math.random() < nov * dt * 3) O2.push({ y: (Math.random() * 2 - 1) * LAT, t: 0, fase: Math.random() * 6.28 });
  for (let k = O2.length - 1; k >= 0; k--) {
    const m = O2[k]; if (estC.tocando) m.t += dt * 1.4; if (m.t > 1.15) { O2.splice(k, 1); continue; }
    const topo = siEm(F, m.y) - xoxEm(F, m.y), base = siEm(F, m.y);
    const z = topo + (base - topo) * clamp(m.t, 0, 1), yy = m.y + Math.sin(m.fase + m.t * 9) * 2;
    const [px, pz] = Pf(yy, z);
    ctx.fillStyle = m.t > 1 ? "rgba(255,240,200,.9)" : COR.oxigenio;
    ctx.beginPath(); ctx.arc(px - 1.5, pz, 1.5, 0, 6.283); ctx.arc(px + 1.5, pz, 1.5, 0, 6.283); ctx.fill();
  }
}
function desenharGrafeno(ctx, F) {
  const desce = (1 - F.grafeno) * 60;
  ctx.fillStyle = `rgba(207,214,218,${0.4 + 0.6 * F.grafeno})`;
  ctx.beginPath();
  for (let y = -LAT; y <= LAT; y += 4) { const [px, pz] = Pf(y, siEm(F, y) - xoxEm(F, y) - 0.34 - desce); if (y === -LAT) ctx.moveTo(px, pz - 1.5); else ctx.lineTo(px, pz - 1.5); }
  for (let y = LAT; y >= -LAT; y -= 4) { const [px, pz] = Pf(y, siEm(F, y) - xoxEm(F, y) - 0.34 - desce); ctx.lineTo(px, pz + 1.5); }
  ctx.closePath(); ctx.fill();
  const rg = semente(3);
  for (let y = -LAT; y < LAT; y += 22) if (rg() < D.constantes.ilhas_multicamada) { const [c, d] = Pf(y, siEm(F, y) - xoxEm(F, y) - 0.34 - desce); ctx.fillStyle = "rgba(240,244,246,.95)"; ctx.fillRect(c, d - 3, 14 * escFab, 5); }
  if (F.contatos > 0) {
    const y0 = 120, topo = siEm(F, y0) - xoxEm(F, y0);
    const [c, d] = Pf(y0, topo - 60 * F.contatos); ctx.fillStyle = COR.ouro; ctx.globalAlpha = F.contatos; ctx.fillRect(c, d, 100 * escFab, 60 * F.contatos * escFab); ctx.globalAlpha = 1;
    if (F.contatos > .5) { ctx.fillStyle = COR.bg; ctx.font = "600 12px " + FONTE_TEXTO; ctx.textAlign = "center"; ctx.fillText("contato", c + 50 * escFab, d + 30 * escFab * F.contatos); }
  }
}

/* --------------------------------------------------- gráficos laterais */
const cvPerfil = document.getElementById("cv-perfil"), cvEtapa = document.getElementById("cv-etapa");
function colunaEscolhida(F) {
  const c = colDe(estC.ySel), j = Math.round(c);
  const C = [], A = [];
  for (let i = 0; i < NX; i++) { C.push(Math.pow(10, F.logC[j * NX + i])); A.push(F.logA[j * NX + i] > 15.05 ? Math.pow(10, F.logA[j * NX + i]) : 1e10); }
  return { C, A };
}
function centro1D(F) {
  if (F.ordem <= 2) return { C: G.map(z => interp(I.x.map(x => x - I.oxido_nativo), I.C, z) * Math.max(F.dose, 1e-9)), A: null };
  if (F.ordem <= 4) {
    const Q = rec1D().quadros, nSpe = Q.findIndex(q => q.etapa !== "SPE");
    const s = F.ordem === 3 ? F.u * (nSpe - 1) : (nSpe - 1) + F.u * (Q.length - nSpe), i0 = clamp(Math.floor(s), 0, Q.length - 2);
    return { C: Q[i0 + 1].C, A: Q[i0 + 1].A };
  }
  const qo = oxi1D().quadros; const k = clamp(Math.round((F.ordem === 5 ? F.u : 1) * (qo.length - 1)), 0, qo.length - 1); return { C: qo[k].C, A: qo[k].A };
}
function desenharPerfil(F) {
  const { ctx, w, h } = preparar(cvPerfil); ctx.clearRect(0, 0, w, h);
  document.getElementById("titulo-perfil").textContent = `Perfil de P na coluna em ${br(estC.ySel, 0)} nm`;
  const cx = { x0: 54, y0: 10, x1: w - 12, y1: h - 38 };
  const { X, Y } = eixos(ctx, cx, [0, 300], [1e16, 3e21], { ylog: true, xt: [0, 50, 100, 150, 200, 250, 300].map(v => [v, String(v)]), yt: [1e16, 1e17, 1e18, 1e19, 1e20, 1e21].map((v, i) => [v, EXP[i + 1]]), xl: "profundidade abaixo da interface (nm)", yl: "P (cm⁻³)" });
  const c1 = centro1D(F); curva(ctx, G, c1.C, X, Y, COR.tinta3, 1.2, [4, 3]);
  const col = colunaEscolhida(F);
  curva(ctx, BD.x, col.C, X, Y, COR["p-inativo"], 2);
  if (F.ordem >= 3) curva(ctx, BD.x, col.A, X, Y, COR["p-ativo"], 2, [5, 3]);
  if (F.ordem === 4) { const ne = rec1D().n_e; curva(ctx, [0, 300], [ne, ne], X, Y, COR.tinta3, 1, [2, 4]); lab(ctx, X(298), Y(ne) - 5, "n_e(T), Solmi (N24)", "right"); const cs = BD.juncao[PROC.variante].C_sat; curva(ctx, [0, 300], [cs, cs], X, Y, "rgba(255,240,200,.6)", 1, [2, 4]); lab(ctx, X(298), Y(cs) - 5, "C_sat(T)", "right"); }
}
function desenharEtapa(F) {
  const { ctx, w, h } = preparar(cvEtapa); ctx.clearRect(0, 0, w, h);
  const cx = { x0: 54, y0: 12, x1: w - 14, y1: h - 38 };
  const tit = document.getElementById("titulo-etapa-grafico");
  const id = F.etapa.id;
  if (F.ordem <= 2) {
    tit.textContent = "Espessura amorfa contra a dose";
    const fs = [], es = [];
    for (let k = 0; k <= 60; k++) { const f = k / 60; fs.push(f); let a = null, b = null; for (let i = 0; i < NX; i++) if (BD.Fn[i] * f * I.dose >= FN_MAX * LIM_CENTRAL) { if (a === null) a = BD.x[i]; b = BD.x[i]; } es.push(a === null ? 0 : b - Math.max(0, a) + 2); }
    const { X, Y } = eixos(ctx, cx, [0, 1], [0, 60], { xt: [[0, "0"], [0.5, "50 %"], [1, "100 %"]], yt: [0, 20, 40, 60].map(v => [v, String(v)]), xl: "fração da dose (3e15 cm⁻²)", yl: "camada amorfa (nm)" });
    curva(ctx, fs, es, X, Y, COR["p-inativo"], 2);
    const f = F.ordem === 0 ? 0 : F.dose; ponto(ctx, X(f), Y(interp(fs, es, f)), COR["p-inativo"]);
    lab(ctx, cx.x0 + 6, cx.y0 + 12, "limiar central de A2, 2e15 cm⁻²");
  } else if (id === "spe") {
    tit.textContent = "Frente de recristalização a 550 °C";
    const qs = rec1D().quadros.filter(q => q.etapa === "SPE"), T = qs[qs.length - 2].t_s || 1;
    const d0 = I.amorfo ? I.amorfo[1] : 10;
    const { X, Y } = eixos(ctx, cx, [0, T / 60], [0, Math.max(5, d0 * 1.1)], { xt: ticks(0, T / 60, 4).map(v => [v, br(v, 1)]), yt: ticks(0, d0, 4).map(v => [v, br(v, 0)]), xl: "tempo (min)", yl: "frente (nm)" });
    curva(ctx, qs.map(q => q.t_s / 60), qs.map(q => q.frente_amorfa), X, Y, COR["p-ativo"], 2);
    const tm = Math.min(F.tReal, T); ponto(ctx, X(tm / 60), Y(interp(qs.map(q => q.t_s), qs.map(q => q.frente_amorfa), tm)), COR["p-ativo"]);
  } else if (id === "quente") {
    const qs = rec1D().quadros.filter(q => q.etapa !== "SPE"), tmax = qs[qs.length - 1].t_s;
    tit.textContent = `Junção no centro e na borda a ${Math.round(qs[0].T)} °C`;
    const xj = qs.map(q => { const i = q.C.findIndex(c => c < 1e18); return G[Math.max(0, i)]; });
    const ehMin = tmax > 120, tt = qs.map(q => ehMin ? q.t_s / 60 : q.t_s);
    const { X, Y } = eixos(ctx, cx, [0, ehMin ? tmax / 60 : tmax], [0, 260], { xt: ticks(0, ehMin ? tmax / 60 : tmax, 4).map(v => [v, br(v, 0)]), yt: [0, 100, 200].map(v => [v, String(v)]), xl: ehMin ? "tempo (min)" : "tempo (s)", yl: "prof. em 1e18 (nm)" });
    curva(ctx, tt, xj, X, Y, COR["p-inativo"], 2);
    const tr = ehMin ? F.tReal / 60 : F.tReal; ponto(ctx, X(tr), Y(interp(tt, xj, tr)), COR["p-inativo"]);
  } else {
    const o = oxi1D(), c = o.curva;
    tit.textContent = "Espessura do óxido sobre a porta e fora dela";
    const { X, Y } = eixos(ctx, cx, [0, o.t20_min], [0, 22], { xt: ticks(0, o.t20_min, 4).map(v => [v, br(v, 0)]), yt: [0, 5, 10, 15, 20].map(v => [v, String(v)]), xl: "tempo (min)", yl: "óxido (nm)" });
    curva(ctx, c.t, c.x, X, Y, COR.oxido, 2);
    if (PROC.mascara === "A") { const fo = BD.oxidacao[chaveProc()]; curva(ctx, [0].concat(fo.map(f => f.t_min)), [0].concat(fo.map(f => f.xox[0])), X, Y, COR.tinta3, 1.5, [4, 3]); lab(ctx, cx.x1, Y(fo[fo.length - 1].xox[0]) + 14, "fora da porta", "right"); }
    const tr = F.ordem === 5 ? F.tReal : o.t20_min; ponto(ctx, X(tr), Y(interp(c.t, c.x, tr)), COR.oxido);
    if (F.F) lab(ctx, cx.x0 + 6, cx.y0 + 12, `F no termo linear ${br(F.F, 2)}`);
  }
}

/* --------------------------------------------------- textos */
function textoEtapa(F) {
  const id = F.etapa.id, R = rec1D(), O = oxi1D(), J = BD.juncao[PROC.variante];
  let t = "", nums = [];
  if (id === "lamina") {
    t = PROC.mascara === "A" ? "Si(100) tipo n com óxido nativo. A máscara de SiO₂ de 150 nm cobre a esquerda e deixa a janela da porta aberta à direita." : "Si(100) tipo n com óxido nativo, sem máscara. A lâmina inteira recebe o implante.";
    nums = [["óxido nativo", `${br(I.oxido_nativo, 1)} nm`, "I"], ["substrato", "n, 0,001 a 10 Ω·cm", "B"]];
  } else if (id === "implante") {
    t = `P⁺ a ${br(I.energia_keV, 0)} keV e ${br(I.inclinacao, 0)}°. Cada íon segue uma trajetória real do RustBCA, perde energia em colisões e desloca átomos de Si. A camada amorfa nasce no pico de dano quando a dose passa do limiar medido a 300 K e cresce até a superfície. ${PROC.mascara === "A" ? (PROC.sombra === "sombra" ? "Com o feixe inclinado em direção à janela, a parede da máscara deixa uma faixa sem implante junto à borda." : "Com o plano de inclinação paralelo à borda, não há sombra, e o espalhamento lateral leva P para baixo da máscara.") : ""}`;
    nums = [["dose", sci(I.dose * F.dose, 1) + " cm⁻²", "B"], ["Rp", `${br(I.Rp, 1)} nm`, "C"], ["ΔRp", `${br(I.dRp, 1)} nm`, "C"], ["espalhamento lateral", `${br(I.lateral_std_nm, 1)} nm`, "C"], ["sombra", PROC.mascara === "A" && PROC.sombra === "sombra" ? `${br(BD.sombra_nm, 1)} nm` : "nenhuma", "C"], ["passa pela máscara", "< 10⁻⁵", "C"]];
  } else if (id === "remocao") {
    t = "A máscara sai com o P que ficou nela. Fica a janela implantada, ainda amorfa e com o P inativo. Na borda, a camada amorfa afina porque a cobertura lateral cai.";
    nums = [["P no Si", sci(I.dose, 1) + " cm⁻²", "C"], ["pico", sci(Math.max(...I.C), 1) + " cm⁻³", "C"]];
  } else if (id === "spe") {
    t = "A 550 °C a camada amorfa recresce a partir do cristal mais próximo, de baixo para cima no centro e também de lado na borda. O P preso na frente que avança entra em sítio substitucional e fica ativo (R14). A faixa danificada abaixo da camada amorfa não amorfizou e recupera no aquecimento seguinte.";
    nums = [["tempo de recrescimento", `${br(R.t_spe_s / 60, 1)} min`, "I"], ["velocidade", `${br(R.v_spe_nm_s * 60, 1)} nm/min`, "I"], ["etapa", "30 min", "B"]];
  } else if (id === "quente") {
    const sobMasc = (() => { let ext = 0; BD.y.forEach((y, j) => { if (y < 0 && J.z1e18[j] > 0) ext = Math.max(ext, -y); }); return ext; })();
    t = `No ${NOME_VAR[PROC.variante]} o P difunde pelo modelo de Fair e Tsai, mais rápido onde há mais elétrons, nas duas direções. O P acima de C_sat precipita como SiP e o pico ativo cai até n_e(T). Na borda a junção avança por baixo da máscara.`;
    nums = [["n_e(T)", sci(R.n_e, 1) + " cm⁻³", "P"], ["C_sat(T)", sci(R.C_sat, 1) + " cm⁻³", "P"], ["fração ativa", `${br(100 * R.fracao_ativa, 0)} %`, "C"], ["Rs no centro", `${br(R.Rs, 1)} Ω/□`, "I"], ["avanço sob a máscara", PROC.mascara === "A" ? `${br(sobMasc, 0)} nm` : "sem borda", "C"], ["tempo", F.tReal > 120 ? `${br(F.tReal / 60, 1)} min` : `${br(F.tReal, 1)} s`, "B"]];
  } else if (id === "oxidacao") {
    const fo = PROC.mascara === "A" ? BD.oxidacao[chaveProc()] : null;
    t = `Oxidação seca a ${PROC.T} °C com o regime fino de Massoud e aceleração ${NOME_RAMO[PROC.ramo]}. O O₂ atravessa o óxido e reage na interface; cada nm de óxido consome 0,44 nm de Si e o P da fatia consumida volta para o Si (m > 1000, R17). Sobre a porta muito dopada o óxido cresce mais que sobre o substrato.`;
    nums = [["óxido no centro", `${br(F.xox[NY - 1], 1)} nm`, "C"], ["óxido fora da porta", fo ? `${br(F.xox[0], 1)} nm` : "sem borda", "C"], ["Si consumido", `${br(F.si[NY - 1], 1)} nm`, "C"], ["tempo", `${br(F.tReal, 1)} min`, "C"], ["tempo para 20 nm", `${br(O.t20_min, 1)} min`, "C"], ["Rs da porta", `${br(O.Rs_final, 1)} Ω/□`, "I"]];
  } else {
    t = "Grafeno CVD transferido com PMMA sobre os 20 nm de óxido, com as ilhas de mais de uma camada que o seu Raman mostrou em 17 % da área, e contatos. A aba Dispositivo 3D mostra a transferência passo a passo, e a aba Operação mostra o dispositivo ligado.";
    nums = [["ilhas multicamada", "17 %", "B"], ["defeitos", sci(D.constantes.nD_defeitos, 1) + " cm⁻²", "B"], ["óxido final", "20 nm", "C"]];
  }
  document.getElementById("etapa-titulo").textContent = F.etapa.nome;
  document.getElementById("etapa-texto").textContent = t;
  document.getElementById("etapa-numeros").innerHTML = numerosHTML(nums);
}

/* --------------------------------------------------- linha do tempo e controles */
function montarEtapas(idCont, lista, aoClicar) {
  const el = document.getElementById(idCont); el.style.setProperty("--n", lista.length);
  lista.forEach((e, i) => {
    const b = document.createElement("button");
    b.innerHTML = `${e.nome}<small>etapa ${i + 1}</small><span class="barra"></span>`;
    b.addEventListener("click", () => aoClicar(e)); el.appendChild(b); e.botao = b;
  });
}
function marcarEtapas(lista, t, atual, u) {
  lista.forEach(e => { const cur = e === atual; e.botao.setAttribute("aria-current", cur ? "step" : "false"); e.botao.querySelector(".barra").style.width = (t >= e.ini + e.dur ? 100 : cur ? 100 * u : 0) + "%"; });
}
montarEtapas("etapas-corte", ETAPAS_C, e => { estC.t = e.ini + 0.001; atualizarCorte(); });
const elTempoC = document.getElementById("tempo-corte");
elTempoC.addEventListener("input", () => { estC.t = elTempoC.value / 1000 * TT_C; atualizarCorte(); });
const btTocarC = document.getElementById("tocar-corte");
btTocarC.addEventListener("click", () => { estC.tocando = !estC.tocando; if (estC.tocando && estC.t >= TT_C - 0.01) estC.t = 0; btTocarC.textContent = estC.tocando ? "Pausar" : "Tocar"; });
btTocarC.textContent = estC.tocando ? "Pausar" : "Tocar";
document.getElementById("vel-corte").addEventListener("change", e => estC.vel = +e.target.value);
["mascara", "sombra", "variante", "ramo", "T"].forEach(k => document.getElementById("sel-" + k).addEventListener("change", e => mudarProc(k, e.target.value)));
ouvintesProc.push(() => atualizarCorte());
cvFab.addEventListener("click", ev => { const r = cvFab.getBoundingClientRect(); estC.ySel = clamp(((ev.clientX - r.left) - oxFab) / escFab, -LAT + 4, LAT - 4); atualizarCorte(); });

let campoAtual = null;
function atualizarCorte() {
  campoAtual = campo(estC.t);
  elTempoC.value = Math.round(estC.t / TT_C * 1000);
  marcarEtapas(ETAPAS_C, estC.t, campoAtual.etapa, campoAtual.u);
  textoEtapa(campoAtual); desenharPerfil(campoAtual); desenharEtapa(campoAtual);
}
function quadroCorte(dt) {
  if (estC.tocando) { estC.t += dt * estC.vel; if (estC.t >= TT_C) { estC.t = TT_C - 0.001; estC.tocando = false; btTocarC.textContent = "Tocar"; } atualizarCorte(); }
  if (!campoAtual) atualizarCorte();
  desenharFab(campoAtual, estC.t);
}
