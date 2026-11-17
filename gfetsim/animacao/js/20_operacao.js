/* ===================================================================== OPERAÇÃO, modelo elétrico */
const KC = D.constantes;
const q = KC.q, HBAR = 1.054571817e-34, H_PLANCK = 6.62607015e-34, M0 = 9.1093837015e-31;
const opEst = { varrer: !reduzir, Vg: 2, dir: 1, Vt: 0, hist: [] };
const INTS = [
  ["cq", "capacitância quântica"], ["si", "depleção e acumulação do Si n⁺"], ["poca", "poças de carga"],
  ["dop", "dopagem residual"], ["rc", "resistência de contato"], ["vsat", "saturação de velocidade"],
  ["hist", "histerese por água"], ["fn", "tunelamento e ruptura"], ["ilha", "ilhas multicamada (desenho)"],
];
const LIG = {};
const elInts = document.getElementById("interacoes");
INTS.forEach(([k, nome]) => { LIG[k] = true; const l = document.createElement("label"); l.innerHTML = `<input type="checkbox" id="int-${k}" checked>${nome}`; l.querySelector("input").addEventListener("change", e => { LIG[k] = e.target.checked; recalcular(); }); elInts.appendChild(l); });

const selProc = document.getElementById("op-processo");
const NOME_VAR_C = { A: "A (RTA)", B850: "B 850 °C", B900: "B 900 °C" }, NOME_RAMO_C = { ho_plummer: "Ho e Plummer", nomura: "fator 2,1", sem_aceleracao: "sem aceleração" };
Object.keys(D.eletrico).forEach(k => { const [v, r, T] = k.split("|"); const o = document.createElement("option"); o.value = k; o.textContent = `${NOME_VAR_C[v]}, óxido a ${T} °C, ${NOME_RAMO_C[r]}`; selProc.appendChild(o); });
selProc.addEventListener("change", () => { const [v, r, T] = selProc.value.split("|"); mudarProc("variante", v); mudarProc("ramo", r); mudarProc("T", T); });
ouvintesProc.push(() => { if (selProc.value !== chaveProc()) selProc.value = chaveProc(); recalcular(); });

const ctl = {};
["taxa", "vg", "vds", "dop", "mu", "rc", "L", "om", "alfa", "tau"].forEach(k => { ctl[k] = document.getElementById("op-" + k); ctl[k].addEventListener("input", recalcular); });
ctl.sinal = document.getElementById("op-sinal"); ctl.sinal.addEventListener("change", recalcular);
ctl.acel = document.getElementById("op-acel"); ctl.rho = document.getElementById("op-rho"); ctl.rho.addEventListener("change", recalcular);
ctl.disp = document.getElementById("op-disp"); ctl.disp.addEventListener("change", recalcular);
const btVarrer = document.getElementById("op-varrer");
function rotularVarrer() { btVarrer.textContent = opEst.varrer ? "Parar varredura" : "Varrer V_G"; ctl.vg.disabled = opEst.varrer; }
btVarrer.addEventListener("click", () => { opEst.varrer = !opEst.varrer; rotularVarrer(); });
rotularVarrer();
ctl.vg.addEventListener("input", () => { opEst.Vg = +ctl.vg.value; });

let M = null;
function nDe(Vrel) { return interp(M.V, M.nV, Vrel); }
function corrente(Vg, VD, vds, par) {
  // Jiménez (R42): I/W = q mu int rho dV / (L + mu |int dV/vsat|), com R_c resolvido por ponto fixo
  const P = par || M;
  vds = vds === undefined ? P.vds : vds;
  let Vi = vds, I = 0;
  for (let it = 0; it < 14; it++) {
    const N = 24; let s1 = 0, s2 = 0;
    for (let k = 0; k <= N; k++) {
      const Vc = Vi * k / N, w = (k === 0 || k === N) ? 0.5 : 1;
      const rho = Math.abs(nDe(Vg - VD - Vc)) + P.rho0;
      s1 += w * rho; s2 += w * (LIG.vsat ? Math.sqrt(Math.PI * rho) / P.Om : 0);
    }
    s1 *= Vi / N; s2 *= Vi / N;
    const In = q * P.mu * s1 / (M.L + P.mu * Math.abs(s2));
    I = it === 0 ? In : 0.5 * I + 0.5 * In;
    Vi = Math.max(1e-4, vds - 2 * I * P.RcW);
  }
  return { I, Vint: Vi };
}
function fn(E) {
  const mr = KC.FN.m_rel, phi = KC.FN.barreira_eV;
  const A = q ** 3 / (8 * Math.PI * H_PLANCK * phi * q) / mr, B = 8 * Math.PI * Math.sqrt(2 * mr * M0) * Math.pow(phi * q, 1.5) / (3 * q * H_PLANCK);
  return E < 1e6 ? 0 : A * E * E * Math.exp(-B / E) / KC.FN.reducao * 1e-4;
}
function recalcular() {
  const E = D.eletrico[selProc.value || chaveProc()];
  const V = E.V, n = E.n.map(v => v * 1e4), Cox = E.Cox_F_cm2 * 1e4;
  const Ctot = E.C.map(c => c * Cox), Cmet = E.Cm.map(c => c * Cox);
  // termos em série das curvas do Poisson, sem derivar n (C_metal = Cox em série com Cq)
  const Cq = V.map((_, i) => 1 / Math.max(1e-12, 1 / Cmet[i] - 1 / Cox));
  const Csi = V.map((_, i) => 1 / Math.max(1e-12, 1 / Ctot[i] - 1 / Cmet[i]));
  let nV = n.slice(), Cv = E.C.slice();
  if (!LIG.cq || !LIG.si) {
    const Cef = V.map((_, i) => 1 / (1 / Cox + (LIG.cq ? 1 / Cq[i] : 0) + (LIG.si ? 1 / Csi[i] : 0)));
    const i0 = V.findIndex(v => v >= 0); nV = new Array(V.length).fill(0);
    for (let i = i0 + 1; i < V.length; i++) nV[i] = nV[i - 1] + 0.5 * (Cef[i] + Cef[i - 1]) * (V[i] - V[i - 1]) / q;
    for (let i = i0 - 1; i >= 0; i--) nV[i] = nV[i + 1] - 0.5 * (Cef[i] + Cef[i + 1]) * (V[i + 1] - V[i]) / q;
    Cv = Cef.map(c => c / Cox);
  }
  const sinal = +ctl.sinal.value, dop = Math.pow(10, +ctl.dop.value) * 1e4;
  const VD0 = LIG.dop ? -inverso(V, nV, sinal * dop) : 0;
  const mu = Math.pow(10, +ctl.mu.value) * 1e-4, RcW = LIG.rc ? Math.pow(10, +ctl.rc.value) * 1e-6 : 0;
  const L = +ctl.L.value * 1e-6, Om = +ctl.om.value * 1e-3 * q / HBAR;
  const rho0 = LIG.poca ? KC.n_estrela * 1e4 : 1e12;
  const taxa = Math.pow(10, +ctl.taxa.value), alfa = LIG.hist ? +ctl.alfa.value : 0, tau = Math.pow(10, +ctl.tau.value);
  M = { E, V, nV, Cv, Cq, Csi, Cox, VD0, mu, RcW, L, Om, rho0, taxa, alfa, tau, vds: +ctl.vds.value, eps: KC.eps_ox };
  M.VG = V.map(v => v + VD0);
  M.curvaI = M.VG.map(v => corrente(v, VD0).I);
  // transcondutância e frequência de corte intrínseca, f_T = g_m / (2 pi C L) por largura
  M.gm = M.curvaI.map((_, i) => { const a = Math.max(0, i - 1), b = Math.min(V.length - 1, i + 1); return (M.curvaI[b] - M.curvaI[a]) / (M.VG[b] - M.VG[a]); });
  M.fT = M.gm.map((g, i) => Math.abs(g) / (2 * Math.PI * Cv[i] * Cox * L));
  // curvas de saída para V_G - V_D fixos
  M.saida = [-6, -3, 0, 3, 6].map(dv => { const vs = []; const is = []; for (let k = 0; k <= 30; k++) { const vd = 0.02 + k / 30 * 2.98; vs.push(vd); is.push(corrente(VD0 + dv, VD0, vd).I); } return { dv, vs, is }; });
  // dispersão entre dispositivos (sorteio nas faixas do params.yaml)
  M.disp = [];
  if (ctl.disp.value === "sim") {
    const r = semente(41), lu = (a, b) => Math.exp(Math.log(a) + r() * (Math.log(b) - Math.log(a)));
    for (let d = 0; d < 40; d++) {
      const par = { mu: lu(KC.mu_prior[0], KC.mu_prior[1]) * 1e-4, rho0: (LIG.poca ? lu(1e11, 1e12) : 1e8) * 1e4,
                    RcW: LIG.rc ? lu(KC.Rc_prior_ohm_um[0], KC.Rc_prior_ohm_um[1]) * 1e-6 : 0,
                    Om: (KC.hbar_Omega_eV[0] + r() * (KC.hbar_Omega_eV[1] - KC.hbar_Omega_eV[0])) * q / HBAR, vds: M.vds };
      const vd = LIG.dop ? -inverso(V, nV, sinal * lu(KC.dopagem_residual[0], KC.dopagem_residual[1]) * 1e4) : 0;
      M.disp.push({ vd, I: V.filter((_, i) => i % 3 === 0).map(v => corrente(v + vd, vd, M.vds, par).I), V: V.filter((_, i) => i % 3 === 0).map(v => v + vd) });
    }
  }
  document.getElementById("o-taxa").textContent = `${br(taxa, taxa < 1 ? 2 : 1)} V/s`;
  document.getElementById("o-vg").textContent = `${br(+ctl.vg.value, 2)} V`;
  document.getElementById("o-vds").textContent = `${br(M.vds, 2)} V`;
  document.getElementById("o-dop").textContent = `${sci(Math.pow(10, +ctl.dop.value), 1)} cm⁻²`;
  document.getElementById("o-mu").textContent = `${Math.round(Math.pow(10, +ctl.mu.value))} cm²/V·s`;
  document.getElementById("o-rc").textContent = `${Math.round(Math.pow(10, +ctl.rc.value))} Ω·µm`;
  document.getElementById("o-L").textContent = `${ctl.L.value} µm`;
  document.getElementById("o-om").textContent = `${ctl.om.value} meV`;
  document.getElementById("o-alfa").textContent = br(+ctl.alfa.value, 2);
  document.getElementById("o-tau").textContent = `${br(tau, tau < 10 ? 1 : 0)} s`;
  document.getElementById("leg-saida").innerHTML = M.saida.map((s, i) => `<span><i style="background:${CORES_SAIDA[i]}"></i>V_G − V_D = ${s.dv > 0 ? "+" : ""}${s.dv} V</span>`).join("");
  opEst.hist = [];
}
const CORES_SAIDA = ["#ee6f6f", "#e8833f", "#a9b5bc", "#4f97f0", "#7f6ff0"];

let oAtual = null;
function passoOp(dt) {
  const dts = dt * +ctl.acel.value, amp = 7;
  if (opEst.varrer) {
    opEst.Vg += opEst.dir * M.taxa * dts;
    const lo = M.VD0 - amp, hi = M.VD0 + amp;
    if (opEst.Vg > hi) { opEst.Vg = hi; opEst.dir = -1; }
    if (opEst.Vg < lo) { opEst.Vg = lo; opEst.dir = 1; }
    ctl.vg.value = opEst.Vg.toFixed(2); document.getElementById("o-vg").textContent = `${br(opEst.Vg, 2)} V`;
  }
  const alvo = M.alfa * (opEst.Vg - M.VD0);
  opEst.Vt = LIG.hist ? alvo + (opEst.Vt - alvo) * Math.exp(-dts / M.tau) : 0;
  const VD = M.VD0 + opEst.Vt, Vrel = opEst.Vg - VD, nn = nDe(Vrel);
  const { I, Vint } = corrente(opEst.Vg, VD);
  const I2 = corrente(opEst.Vg, VD, M.vds * 1.05).I;
  opEst.hist.push([opEst.Vg, I, opEst.dir]); if (opEst.hist.length > 900) opEst.hist.shift();
  const E = Math.abs(q * nn) / M.eps;
  const gm = interp(M.V, M.gm, Vrel), Cn = interp(M.V, M.Cv, Vrel);
  const gds = (I2 - I) / (0.05 * M.vds);
  oAtual = { VD, Vrel, n: nn, I, Vint, E, Cn, Cq: interp(M.V, M.Cq, Vrel), phi: LIG.si ? interp(M.E.V, M.E.phi, Vrel) : 0,
             J: LIG.fn ? fn(E) : 0, gm, fT: Math.abs(gm) / (2 * Math.PI * Cn * M.Cox * M.L), ganho: Math.abs(gm) / Math.max(gds, 1e-12) };
  return oAtual;
}

/* ---------------------------------------------------------------- desenho do corte em operação */
const cvDisp = document.getElementById("cv-disp");
const PORT = []; const rp = semente(11); for (let i = 0; i < 220; i++) PORT.push({ x: rp(), y: rp(), s: rp() });
const AGUA = []; for (let i = 0; i < 26; i++) AGUA.push({ x: 0.06 + rp() * 0.88, f: rp() * 6.28 });
const TUN = [];
function densidadesPortadores(o) {
  const ns = LIG.poca ? KC.n_estrela * 1e4 : 1e13;
  const raiz = Math.sqrt(o.n * o.n + ns * ns);
  return { ne: (o.n + raiz) / 2, nh: (-o.n + raiz) / 2 }; // [C] partição pelas poças de carga
}
function desenharDisp(o, dt) {
  const { ctx, w, h } = preparar(cvDisp);
  ctx.fillStyle = "#0a0e11"; ctx.fillRect(0, 0, w, h);
  const xS = w * 0.06, xD = w * 0.80, yG = h * 0.22, tOx = h * 0.19, yN = yG + tOx, hN = h * 0.24;
  ctx.fillStyle = "#20282e"; ctx.fillRect(0, yN, w, h - yN);
  const grd = ctx.createLinearGradient(0, yN, 0, yN + hN); grd.addColorStop(0, "rgba(54,194,180,.42)"); grd.addColorStop(1, "rgba(54,194,180,.05)");
  ctx.fillStyle = grd; ctx.fillRect(xS - 10, yN, xD - xS + 60, hN);
  ctx.fillStyle = "rgba(143,132,230,.30)"; ctx.fillRect(0, yG, w, tOx);
  ctx.strokeStyle = "rgba(143,132,230,.8)"; ctx.lineWidth = 1; ctx.strokeRect(-1, yG, w + 2, tOx);
  const nLin = Math.round(clamp(o.E / 1e8 * 2.6, 0, 30)), sobe = o.n > 0, Ebd = KC.ruptura_MVcm[0] * 1e8;
  ctx.strokeStyle = o.E > 0.8 * Ebd && LIG.fn ? COR.perigo : "rgba(170,160,255,.85)"; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1.2;
  for (let i = 0; i < nLin; i++) {
    const x = xS + 20 + (xD - xS - 40) * (i + 0.5) / nLin;
    ctx.beginPath(); ctx.moveTo(x, yG + 4); ctx.lineTo(x, yN - 4); ctx.stroke();
    const yp = sobe ? yG + 8 : yN - 8, d = sobe ? -1 : 1;
    ctx.beginPath(); ctx.moveTo(x, yp + d * -2); ctx.lineTo(x - 3, yp - d * 4); ctx.lineTo(x + 3, yp - d * 4); ctx.closePath(); ctx.fill();
  }
  const phi = o.phi;
  if (phi < -0.005) {
    const Wn = clamp(Math.sqrt(-phi) * 26, 2, hN * 0.8);
    ctx.fillStyle = "rgba(10,14,17,.55)"; ctx.fillRect(xS - 10, yN, xD - xS + 60, Wn);
    ctx.fillStyle = COR["p-ativo"]; ctx.font = "bold 10px " + FONTE_DADO; ctx.textAlign = "center";
    for (let x = xS; x < xD + 40; x += 16) for (let y = yN + 6; y < yN + Wn; y += 9) ctx.fillText("+", x + ((y * 7) % 8), y + 3);
  } else if (phi > 0.005) { ctx.fillStyle = "rgba(79,151,240,.75)"; ctx.fillRect(xS - 10, yN, xD - xS + 60, clamp(phi * 30, 1.5, 8)); }
  ctx.fillStyle = COR.ouro;
  ctx.fillRect(xS - w * 0.05, yG - h * 0.12, w * 0.09, h * 0.12);
  ctx.fillRect(xD - w * 0.04, yG - h * 0.12, w * 0.09, h * 0.12);
  ctx.fillRect(w * 0.91, yG - h * 0.12, w * 0.07, yN - yG + h * 0.12 + 4);
  ctx.fillStyle = COR.bg; ctx.font = "600 12px " + FONTE_TEXTO; ctx.textAlign = "center";
  ctx.fillText("S", xS, yG - h * 0.05); ctx.fillText("D", xD + w * 0.005, yG - h * 0.05); ctx.fillText("G", w * 0.945, yG - h * 0.05);
  ctx.strokeStyle = "#cfd6da"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xS, yG - 1); ctx.lineTo(xD, yG - 1); ctx.stroke();
  if (LIG.ilha) { const ri = semente(5); for (let x = xS + 10; x < xD - 20; x += 26) if (ri() < KC.ilhas_multicamada) { ctx.fillStyle = "rgba(240,244,246,.95)"; ctx.fillRect(x, yG - 3.5, 12, 4); } }
  if (LIG.poca) for (let i = 0; i < 9; i++) { const x = xS + (xD - xS) * (i + 0.5) / 9; const g = ctx.createRadialGradient(x, yG - 1, 0, x, yG - 1, 18); const c = i % 2 ? "79,151,240" : "238,111,111"; g.addColorStop(0, `rgba(${c},.20)`); g.addColorStop(1, `rgba(${c},0)`); ctx.fillStyle = g; ctx.fillRect(x - 18, yG - 19, 36, 36); }
  const { ne, nh } = densidadesPortadores(o);
  const totPts = 190, escala = 1.4e17;
  const pe = Math.round(clamp(ne / escala * totPts, 0, totPts)), ph = Math.round(clamp(nh / escala * totPts, 0, totPts));
  const v = o.I / (q * (Math.abs(o.n) + M.rho0)), vis = clamp(v / 2e5, 0, 1.2) * 0.35, t = performance.now() / 1000;
  for (let i = 0; i < PORT.length; i++) {
    const p = PORT[i], eEl = i < pe, eLa = i >= PORT.length - ph;
    if (!eEl && !eLa) continue;
    const dir = eEl ? 1 : -1;
    const x = xS + ((p.x + dir * t * vis * (0.6 + p.s * 0.8)) % 1 + 1) % 1 * (xD - xS);
    ctx.fillStyle = eEl ? COR.eletron : COR.lacuna; ctx.beginPath(); ctx.arc(x, yG - 1 + (p.y - 0.5) * 5, 2.1, 0, 6.283); ctx.fill();
  }
  if (LIG.hist) {
    const ang = clamp(opEst.Vt / Math.max(0.05, M.alfa * 7), -1, 1) * 1.2;
    ctx.strokeStyle = "#9fd3ff"; ctx.lineWidth = 1.2;
    AGUA.forEach(a => { const x = xS + a.x * (xD - xS), y = yG + 5, th = ang + Math.sin(t * 2 + a.f) * 0.25; ctx.beginPath(); ctx.moveTo(x - 3 * Math.cos(th - 0.9), y - 3 * Math.sin(th - 0.9)); ctx.lineTo(x, y); ctx.lineTo(x - 3 * Math.cos(th + 0.9), y - 3 * Math.sin(th + 0.9)); ctx.stroke(); });
  }
  if (LIG.fn && o.J > 1e-12) { const tx = clamp((Math.log10(o.J) + 12) * 1.2, 0, 14); if (Math.random() < tx * dt) TUN.push({ x: xS + Math.random() * (xD - xS), t: 0, sobe: !sobe }); }
  for (let i = TUN.length - 1; i >= 0; i--) { const e = TUN[i]; e.t += dt * 1.6; if (e.t > 1) { TUN.splice(i, 1); continue; } const y = e.sobe ? yN - e.t * tOx : yG + e.t * tOx; ctx.fillStyle = "#fff6a0"; ctx.beginPath(); ctx.arc(e.x, y, 2.2, 0, 6.283); ctx.fill(); }
  ctx.fillStyle = COR.tinta2; ctx.font = "11px " + FONTE_DADO; ctx.textAlign = "left";
  ctx.fillText(`SiO₂ ${br(M.E.tox_nm, 1)} nm`, 8, yG + tOx / 2 + 4); ctx.fillText("Si n⁺ (porta)", 8, yN + hN * 0.55); ctx.fillText("Si tipo n", 8, h - 10);
  if (LIG.fn && o.E > 0.8 * Ebd) { ctx.fillStyle = COR.perigo; ctx.font = "600 12px " + FONTE_TEXTO; ctx.textAlign = "right"; ctx.fillText("campo perto da ruptura", w - 10, h - 10); }
}

/* ---------------------------------------------------------------- bandas da pilha */
const cvBanda = document.getElementById("cv-banda");
function perfilSi(o) {
  const B = M.E.banda;
  const iv = clamp((o.Vrel - B.V[0]) / (B.V[1] - B.V[0]), 0, B.V.length - 1.001), i0 = Math.floor(iv), tt = iv - i0;
  return B.psi[i0].map((v, k) => (v * (1 - tt) + B.psi[i0 + 1][k] * tt) * (LIG.si ? 1 : 0));
}
function desenharBanda(o) {
  const { ctx, w, h } = preparar(cvBanda); ctx.clearRect(0, 0, w, h);
  const kT = 0.025852, mu = interp(M.E.V, M.E.mu, o.Vrel), psi = perfilSi(o), xs = M.E.banda.x_nm;
  // energias de elétron em eV, referência no nível de Fermi do grafeno
  const EFsi = -opEst.Vg;
  const Ec = psi.map(p => EFsi - kT * M.E.eta_sup - p);
  const Vox = q * o.n / M.Cox;
  const barSi = KC.FN.barreira_eV; // Si/SiO2 [I]
  const oxSi = Ec[0] + barSi, oxG = oxSi + Vox;
  const ED = -mu;
  // painel principal: grafeno | óxido | Si (30 nm)
  const estreito = w < 480, p0 = 46, p1 = estreito ? w - 12 : w * 0.64, xG = p0 + 16, xO0 = xG + 6, xO1 = xO0 + (p1 - xO0) * 0.45, xS1 = p1;
  const tox = M.E.tox_nm;
  const vals = [0, ED, EFsi, oxSi, oxG, Ec[0], Ec[0] - 1.12, Ec[Ec.length - 1]];
  const lo = Math.min(...vals) - 0.6, hi = Math.max(...vals) + 0.5;
  const y0 = 12, y1 = h - 30;
  const Y = e => y1 - (e - lo) / (hi - lo) * (y1 - y0);
  const Xsi = x => xO1 + clamp(x / 30, 0, 1) * (xS1 - xO1);
  eixos(ctx, { x0: p0, y0, x1: p1, y1 }, [0, 1], [lo, hi], { yt: ticks(lo, hi, 6).map(v => [v, br(v, 0)]), yl: "energia (eV)" });
  ctx.fillStyle = "rgba(143,132,230,.14)"; ctx.fillRect(xO0, y0, xO1 - xO0, y1 - y0);
  // banda de condução do óxido e barreira de tunelamento
  ctx.strokeStyle = COR.oxido; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xO0, Y(oxG)); ctx.lineTo(xO1, Y(oxSi)); ctx.stroke();
  lab(ctx, (xO0 + xO1) / 2, Math.min(Y(oxG), Y(oxSi)) - 6, `SiO₂ ${br(tox, 1)} nm`, "center", COR.oxido);
  const Evm = o.E; // V/m
  if (LIG.fn && Evm > 1e8) {
    const injGr = o.n > 0; // elétrons no grafeno são empurrados para o Si
    const barreira = injGr ? oxG - 0 : oxSi - EFsi;
    const d = barreira / (Evm * 1e-9); // nm até a barreira cair ao nível do emissor
    if (d < tox) {
      const xa = injGr ? xO0 : xO1, xb = injGr ? xO0 + d / tox * (xO1 - xO0) : xO1 - d / tox * (xO1 - xO0), ye = Y(injGr ? 0 : EFsi);
      ctx.strokeStyle = "#fff6a0"; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(xa, ye); ctx.lineTo(xb, ye); ctx.stroke(); ctx.setLineDash([]);
      lab(ctx, (xa + xb) / 2, ye - 5, `túnel ${br(d, 1)} nm`, "center", "#fff6a0");
    }
  }
  // grafeno
  ctx.strokeStyle = COR.tinta; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xG, Y(ED) - 18); ctx.lineTo(xG, Y(ED) + 18); ctx.stroke();
  ctx.fillStyle = COR.tinta; ctx.beginPath(); ctx.arc(xG, Y(ED), 3, 0, 6.283); ctx.fill();
  lab(ctx, xG - 4, Y(ED) + 4, "E_D", "right", COR.tinta2);
  ctx.strokeStyle = COR.tinta; ctx.setLineDash([4, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p0, Y(0)); ctx.lineTo(xO0, Y(0)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(xO1, Y(EFsi)); ctx.lineTo(xS1, Y(EFsi)); ctx.stroke(); ctx.setLineDash([]);
  lab(ctx, p0 + 2, Y(0) - 4, "E_F grafeno", "left", COR.tinta);
  lab(ctx, xS1 - 2, Y(EFsi) + 13, "E_F Si", "right", COR.tinta);
  // Si: E_c e E_v
  ctx.strokeStyle = COR["p-ativo"]; ctx.lineWidth = 2; ctx.beginPath();
  for (let k = 0; k < xs.length && xs[k] <= 30; k++) { const px = Xsi(xs[k]), py = Y(Ec[k]); if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.stroke();
  ctx.strokeStyle = COR.tinta3; ctx.beginPath();
  for (let k = 0; k < xs.length && xs[k] <= 30; k++) { const px = Xsi(xs[k]), py = Y(Ec[k] - 1.12); if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.stroke();
  lab(ctx, xS1 - 2, Y(Ec[Ec.length - 1]) - 4, "E_c", "right", COR["p-ativo"]); lab(ctx, xS1 - 2, Y(Ec[Ec.length - 1] - 1.12) - 4, "E_v", "right", COR.tinta3);
  lab(ctx, (xO0 + xS1) / 2, h - 12, `V_G = ${br(opEst.Vg, 2)} V, queda no óxido ${br(Vox, 2)} V`, "center");
  if (estreito) return;
  // detalhe 1: cone de Dirac
  const cx = w * 0.82, cy = h * 0.26, s = h * 0.17, emax = 0.45;
  ctx.strokeStyle = COR.tinta2; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(cx - s * 0.75, cy - s); ctx.lineTo(cx, cy); ctx.lineTo(cx + s * 0.75, cy - s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - s * 0.75, cy + s); ctx.lineTo(cx, cy); ctx.lineTo(cx + s * 0.75, cy + s); ctx.stroke();
  const yF = cy - clamp(mu / emax, -1, 1) * s;
  ctx.fillStyle = "rgba(79,151,240,.35)"; ctx.beginPath(); ctx.moveTo(cx - s * 0.75, cy + s); ctx.lineTo(cx, cy); ctx.lineTo(cx + s * 0.75, cy + s); ctx.closePath(); ctx.fill();
  if (mu > 0) { const d = (cy - yF) * 0.75; ctx.fillStyle = "rgba(79,151,240,.55)"; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - d, yF); ctx.lineTo(cx + d, yF); ctx.closePath(); ctx.fill(); }
  else if (mu < 0) { const d = (yF - cy) * 0.75; ctx.fillStyle = "rgba(238,111,111,.6)"; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - d, yF); ctx.lineTo(cx + d, yF); ctx.closePath(); ctx.fill(); }
  ctx.strokeStyle = COR.tinta; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(cx - s, yF); ctx.lineTo(cx + s, yF); ctx.stroke(); ctx.setLineDash([]);
  lab(ctx, cx, cy + s + 13, `E_F − E_D ${mu >= 0 ? "+" : "−"}${br(Math.abs(mu * 1000), 0)} meV`, "center", COR.tinta);
  // detalhe 2: Si junto à interface em escala de meV
  const bx0 = w * 0.69, bx1 = w - 8, by0 = h * 0.56, by1 = h - 30;
  const Ec0 = -kT * M.E.eta_sup, Ecd = psi.map(p => Ec0 - p);
  const ylo = Math.min(-0.45, ...Ecd) - 0.05, yhi = Math.max(0.2, ...Ecd) + 0.08;
  const Xd = x => bx0 + clamp(x / 30, 0, 1) * (bx1 - bx0), Yd = e => by1 - (e - ylo) / (yhi - ylo) * (by1 - by0);
  ctx.strokeStyle = COR.linha; ctx.strokeRect(bx0, by0, bx1 - bx0, by1 - by0);
  ctx.fillStyle = "rgba(79,151,240,.30)"; ctx.beginPath(); ctx.moveTo(Xd(0), Yd(0));
  for (let k = 0; k < xs.length && xs[k] <= 30; k++) ctx.lineTo(Xd(xs[k]), Yd(Math.min(Ecd[k], 0)));
  ctx.lineTo(Xd(30), Yd(0)); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = COR["p-ativo"]; ctx.lineWidth = 2; ctx.beginPath();
  for (let k = 0; k < xs.length && xs[k] <= 30; k++) { if (k === 0) ctx.moveTo(Xd(xs[k]), Yd(Ecd[k])); else ctx.lineTo(Xd(xs[k]), Yd(Ecd[k])); } ctx.stroke();
  ctx.strokeStyle = COR.tinta; ctx.setLineDash([4, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx0, Yd(0)); ctx.lineTo(bx1, Yd(0)); ctx.stroke(); ctx.setLineDash([]);
  lab(ctx, (bx0 + bx1) / 2, by0 - 4, "Si n⁺, 0 a 30 nm", "center");
  lab(ctx, (bx0 + bx1) / 2, h - 12, `curvatura ${br(o.phi * 1000, 0)} mV`, "center");
}

/* ---------------------------------------------------------------- gráficos */
const cvCV = document.getElementById("cv-cv"), cvTr = document.getElementById("cv-trans"), cvCampo = document.getElementById("cv-campo"),
      cvSaida = document.getElementById("cv-saida"), cvGm = document.getElementById("cv-gm"), cvCq = document.getElementById("cv-cq");
function grafOp(o) {
  const lim = [M.VD0 - 12, M.VD0 + 12], xt = ticks(lim[0], lim[1], 5).map(v => [v, br(v, 0)]);
  const caixa = (w, h, x0 = 50) => ({ x0, y0: 10, x1: w - 10, y1: h - 38 });
  const recortar = (ctx, c) => { ctx.save(); ctx.beginPath(); ctx.rect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0); ctx.clip(); };
  { const { ctx, w, h } = preparar(cvCV); ctx.clearRect(0, 0, w, h); const c = caixa(w, h);
    const Cm = M.E.Cm, ymin = Math.max(0, Math.min(...M.Cv, ...Cm) - 0.03);
    const { X, Y } = eixos(ctx, c, lim, [ymin, 1.0], { xt, yt: ticks(ymin, 1, 4).map(v => [v, br(v, 2)]), xl: "V_G (V)", yl: "C/Cox" });
    recortar(ctx, c); curva(ctx, M.VG, Cm, X, Y, COR.tinta3, 1.5, [4, 3]); curva(ctx, M.VG, M.Cv, X, Y, COR["p-ativo"], 2); ctx.restore();
    ponto(ctx, X(opEst.Vg), Y(o.Cn), COR["p-ativo"]); }
  { const { ctx, w, h } = preparar(cvTr); ctx.clearRect(0, 0, w, h); const c = caixa(w, h, 52);
    let imax = Math.max(...M.curvaI); M.disp.forEach(d => imax = Math.max(imax, ...d.I)); imax *= 1.08;
    const { X, Y } = eixos(ctx, c, lim, [0, imax], { xt, yt: ticks(0, imax, 4).map(v => [v, imax < 10 ? br(v, 1) : br(v, 0)]), xl: "V_G (V)", yl: "I_D/W (µA/µm)" });
    recortar(ctx, c);
    M.disp.forEach(d => curva(ctx, d.V, d.I, X, Y, "#5d6a73", 1, null, 0.45));
    curva(ctx, M.VG, M.curvaI, X, Y, COR.tinta3, 1.8);
    for (let i = 1; i < opEst.hist.length; i++) { const a = opEst.hist[i - 1], b = opEst.hist[i]; ctx.strokeStyle = b[2] > 0 ? COR.ida : COR.volta; ctx.lineWidth = 2; ctx.globalAlpha = 0.25 + 0.75 * i / opEst.hist.length; ctx.beginPath(); ctx.moveTo(X(a[0]), Y(a[1])); ctx.lineTo(X(b[0]), Y(b[1])); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.restore(); ponto(ctx, X(opEst.Vg), Y(o.I), opEst.dir > 0 ? COR.ida : COR.volta); }
  { const { ctx, w, h } = preparar(cvSaida); ctx.clearRect(0, 0, w, h); const c = caixa(w, h, 52);
    const imax = Math.max(...M.saida.flatMap(s => s.is)) * 1.08;
    const { X, Y } = eixos(ctx, c, [0, 3], [0, imax], { xt: [0, 1, 2, 3].map(v => [v, String(v)]), yt: ticks(0, imax, 4).map(v => [v, imax < 10 ? br(v, 1) : br(v, 0)]), xl: "V_DS (V)", yl: "I_D/W (µA/µm)" });
    M.saida.forEach((s, i) => curva(ctx, s.vs, s.is, X, Y, CORES_SAIDA[i], 2));
    ponto(ctx, X(M.vds), Y(o.I), COR.tinta); }
  { const { ctx, w, h } = preparar(cvCampo); ctx.clearRect(0, 0, w, h); const c = caixa(w, h, 46);
    const Es = M.V.map(v => Math.abs(q * nDe(v)) / M.eps / 1e8);
    const { X, Y } = eixos(ctx, c, lim, [0, 14], { xt, yt: [0, 4, 8, 12].map(v => [v, String(v)]), xl: "V_G (V)", yl: "E_ox (MV/cm)" });
    ctx.fillStyle = "rgba(255,107,92,.14)"; ctx.fillRect(c.x0, Y(KC.ruptura_MVcm[1]), c.x1 - c.x0, Y(KC.ruptura_MVcm[0]) - Y(KC.ruptura_MVcm[1]));
    lab(ctx, c.x1 - 4, Y(KC.ruptura_MVcm[1]) + 12, "ruptura, 10 a 13 MV/cm", "right", COR.perigo);
    recortar(ctx, c); curva(ctx, M.VG, Es, X, Y, COR.oxido, 2); ctx.restore(); ponto(ctx, X(opEst.Vg), Y(o.E / 1e8), COR.oxido); }
  { const { ctx, w, h } = preparar(cvGm); ctx.clearRect(0, 0, w, h); const c = caixa(w, h, 52);
    const f = M.fT.map(v => v / 1e9), fmax = Math.max(...f) * 1.1 || 1;
    const { X, Y } = eixos(ctx, c, lim, [0, fmax], { xt, yt: ticks(0, fmax, 4).map(v => [v, fmax < 10 ? br(v, 1) : br(v, 0)]), xl: "V_G (V)", yl: "f_T (GHz)" });
    recortar(ctx, c); curva(ctx, M.VG, f, X, Y, COR["p-ativo"], 2); ctx.restore(); ponto(ctx, X(opEst.Vg), Y(o.fT / 1e9), COR["p-ativo"]); }
  { const { ctx, w, h } = preparar(cvCq); ctx.clearRect(0, 0, w, h); const c = caixa(w, h, 52);
    const cq = M.Cq.map(v => v * 100), cmax = Math.min(Math.max(...cq) * 1.05, 60);
    const { X, Y } = eixos(ctx, c, lim, [0, cmax], { xt, yt: ticks(0, cmax, 4).map(v => [v, br(v, 0)]), xl: "V_G (V)", yl: "C (µF/cm²)" });
    recortar(ctx, c); curva(ctx, M.VG, cq, X, Y, COR.eletron, 2); curva(ctx, lim, [M.Cox * 100, M.Cox * 100], X, Y, COR.oxido, 1.5, [4, 3]); ctx.restore();
    ponto(ctx, X(opEst.Vg), Y(o.Cq * 100), COR.eletron); }
}
function leiturasOp(o, idEl) {
  const par = D.parasita[ctl.rho.value], Cpar = interp(par.V, par.C, opEst.Vg);
  const L = [
    ["V_G", `${br(opEst.Vg, 2)} V`], ["V_D efetivo", `${br(o.VD, 2)} V`], ["V_G − V_D", `${br(o.Vrel, 2)} V`],
    ["n no grafeno", `${sci(o.n / 1e4, 2)} cm⁻²`], ["C/Cox", br(o.Cn, 3)], ["perda no Si", `${br(100 * (1 - interp(M.V, M.E.C, o.Vrel) / interp(M.V, M.E.Cm, o.Vrel)), 2)} %`],
    ["Cq", `${br(o.Cq * 100, 2)} µF/cm²`], ["E_ox", `${br(o.E / 1e8, 2)} MV/cm`, o.E > 0.8 * KC.ruptura_MVcm[0] * 1e8],
    ["J Fowler-Nordheim", o.J > 1e-30 ? `${sci(o.J, 1)} A/cm²` : "abaixo de 10⁻³⁰ A/cm²"], ["I_D/W", `${br(o.I, 2)} µA/µm`],
    ["R·W total", `${br(M.vds / Math.max(o.I, 1e-12) * 1e6, 0)} Ω·µm`], ["V_DS no canal", `${br(o.Vint, 3)} V`],
    ["g_m/W", `${br(Math.abs(o.gm), 2)} mS/mm`], ["f_T intrínseca", `${br(o.fT / 1e9, 2)} GHz`], ["ganho intrínseco", br(o.ganho, 1)],
    ["fora da porta, C/Cox", br(Cpar, 2)],
  ];
  document.getElementById(idEl).innerHTML = L.map(l => `<div class="num"><b class="${l[2] ? "alerta" : ""}">${l[1]}</b><span>${l[0]}</span></div>`).join("");
}
function quadroOp(dt) {
  const o = passoOp(dt);
  desenharDisp(o, dt); desenharBanda(o); grafOp(o); leiturasOp(o, "leituras");
}
