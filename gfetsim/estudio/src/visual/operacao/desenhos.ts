/**
 * Desenhos da operação: o corte do transistor com portadores, linhas de campo, água e
 * tunelamento, e o diagrama de bandas grafeno, SiO2 e Si n+ com o cone de Dirac.
 * Tudo desenhado pelo Pincel, então sai igual na tela, em PNG e em SVG.
 */
import type { Pincel } from "../grafico/pincel";
import { cssVar } from "@/ui/dom";
import { br, sci } from "@/ui/formato";
import { Aleatorio } from "@/nucleo/aleatorio";

export interface EstadoOperacao {
  Vg: number;
  VD: number; // tensão de Dirac efetiva, com a histerese
  n_m2: number;
  E_Vm: number;
  I_Am: number;
  Vint: number;
  J_Am2: number;
  phi_V: number; // curvatura no Si
  mu_eV: number; // E_F - E_D no grafeno
  tox_nm: number;
  nEstrela_m2: number;
  rho0_m2: number;
  Vt_hist: number;
  alfa: number;
  ruptura_MVcm: [number, number];
  barreira_eV: number;
  eta_superficie: number;
  /** perfil de potencial no Si relativo ao equilíbrio, para as bandas */
  bandaX_nm: ArrayLike<number>;
  bandaPsi: ArrayLike<number>;
  C_ox: number; // F/m²
  t: number; // relógio da animação (s)
  ligado: { pocas: boolean; histerese: boolean; tunel: boolean; ilhas: boolean };
}

const rnd = new Aleatorio(11);
const PORTADORES = Array.from({ length: 260 }, () => ({ x: rnd.real(), y: rnd.real(), s: rnd.real() }));
const AGUA = Array.from({ length: 28 }, () => ({ x: 0.05 + rnd.real() * 0.9, f: rnd.real() * 6.28 }));
const ILHAS = Array.from({ length: 14 }, () => rnd.real());
const centelhas: { x: number; t: number; sobe: boolean }[] = [];

export function desenharDispositivo(p: Pincel, e: EstadoOperacao, dt: number, el: Element): void {
  const C = (n: string) => cssVar(n, el);
  const W = p.largura, H = p.altura;
  const fonte = C("--f-dado");
  p.retangulo(0, 0, W, H, C("--tela"));
  const xS = W * 0.07, xD = W * 0.79, yG = H * 0.24, tOx = H * 0.18, yN = yG + tOx, hN = H * 0.25;
  // substrato e porta n+
  p.retangulo(0, yN, W, H - yN, C("--si"), 0.55);
  for (let k = 0; k < 12; k++) p.retangulo(xS - 10, yN + (k * hN) / 12, xD - xS + 70, hN / 12 + 0.5, C("--p-ativo"), 0.5 * (1 - k / 12) + 0.05);
  // óxido
  p.retangulo(0, yG, W, tOx, C("--oxido"), 0.28);
  p.linha([0, W], [yG, yG], { cor: C("--oxido"), largura: 1 });
  p.linha([0, W], [yN, yN], { cor: C("--oxido"), largura: 1 });
  // linhas de campo
  const Ebd = e.ruptura_MVcm[0] * 1e8;
  const nL = Math.round(Math.min(30, (e.E_Vm / 1e8) * 2.6));
  const perto = e.E_Vm > 0.8 * Ebd;
  const corL = perto ? C("--erro") : C("--oxido");
  const sobe = e.n_m2 > 0;
  for (let i = 0; i < nL; i++) {
    const x = xS + 20 + ((xD - xS - 40) * (i + 0.5)) / nL;
    p.linha([x, x], [yG + 4, yN - 4], { cor: corL, largura: 1.2 });
    const yp = sobe ? yG + 9 : yN - 9;
    const d = sobe ? -1 : 1;
    p.poligono([x, x - 3, x + 3], [yp + d * -2, yp - d * 4, yp - d * 4], corL);
  }
  // depleção ou acumulação no Si
  if (e.phi_V < -0.005) {
    const Wn = Math.min(hN * 0.8, Math.max(2, Math.sqrt(-e.phi_V) * 26));
    p.retangulo(xS - 10, yN, xD - xS + 70, Wn, C("--tela"), 0.55);
    for (let x = xS; x < xD + 50; x += 16) for (let y = yN + 6; y < yN + Wn; y += 9) p.texto("+", x + ((y * 7) % 8), y + 3, { cor: C("--p-ativo"), tamanho: 10, alinhar: "center", peso: 700 });
  } else if (e.phi_V > 0.005) p.retangulo(xS - 10, yN, xD - xS + 70, Math.min(8, Math.max(1.5, e.phi_V * 30)), C("--eletron"), 0.75);
  // contatos
  const corM = C("--metal");
  p.retangulo(xS - W * 0.055, yG - H * 0.12, W * 0.1, H * 0.12, corM);
  p.retangulo(xD - W * 0.045, yG - H * 0.12, W * 0.1, H * 0.12, corM);
  p.retangulo(W * 0.91, yG - H * 0.12, W * 0.07, yN - yG + H * 0.12 + 4, corM);
  p.texto("S", xS, yG - H * 0.045, { cor: C("--fundo"), tamanho: 13, alinhar: "center", peso: 700 });
  p.texto("D", xD + W * 0.005, yG - H * 0.045, { cor: C("--fundo"), tamanho: 13, alinhar: "center", peso: 700 });
  p.texto("G", W * 0.945, yG - H * 0.045, { cor: C("--fundo"), tamanho: 13, alinhar: "center", peso: 700 });
  // grafeno, poças e ilhas
  p.linha([xS, xD], [yG - 1, yG - 1], { cor: C("--grafeno"), largura: 2 });
  if (e.ligado.ilhas) ILHAS.forEach((u, k) => { if (u < 0.17 * 1.5) p.retangulo(xS + 10 + ((xD - xS - 30) * k) / ILHAS.length, yG - 3.5, 12, 4, C("--grafeno"), 0.9); });
  if (e.ligado.pocas) for (let i = 0; i < 9; i++) {
    const x = xS + ((xD - xS) * (i + 0.5)) / 9;
    p.circulo(x, yG - 1, 14, i % 2 ? C("--eletron") : C("--lacuna"), undefined, 0.12);
  }
  // portadores: elétrons e lacunas pela partição das poças, velocidade pela corrente
  const raiz = Math.sqrt(e.n_m2 * e.n_m2 + e.nEstrela_m2 * e.nEstrela_m2);
  const ne = (e.n_m2 + raiz) / 2, nh = (-e.n_m2 + raiz) / 2;
  const total = PORTADORES.length, escala = 1.4e17;
  const pe = Math.round(Math.min(total, (ne / escala) * total)), ph = Math.round(Math.min(total, (nh / escala) * total));
  const v = e.I_Am / (1.602176634e-19 * (Math.abs(e.n_m2) + e.rho0_m2));
  const vis = Math.min(1.2, Math.max(0, v / 2e5)) * 0.35;
  for (let i = 0; i < total; i++) {
    const q = PORTADORES[i];
    const eEl = i < pe, eLa = i >= total - ph;
    if (!eEl && !eLa) continue;
    const dir = eEl ? 1 : -1;
    const x = xS + ((((q.x + dir * e.t * vis * (0.6 + q.s * 0.8)) % 1) + 1) % 1) * (xD - xS);
    p.circulo(x, yG - 1 + (q.y - 0.5) * 5, 2.1, eEl ? C("--eletron") : C("--lacuna"));
  }
  // água na interface (histerese)
  if (e.ligado.histerese) {
    const ang = Math.max(-1, Math.min(1, e.Vt_hist / Math.max(0.05, e.alfa * 7))) * 1.2;
    for (const a of AGUA) {
      const x = xS + a.x * (xD - xS), y = yG + 5, th = ang + Math.sin(e.t * 2 + a.f) * 0.25;
      p.linha([x - 3 * Math.cos(th - 0.9), x, x - 3 * Math.cos(th + 0.9)], [y - 3 * Math.sin(th - 0.9), y, y - 3 * Math.sin(th + 0.9)], { cor: "#9fd3ff", largura: 1.2 });
    }
  }
  // tunelamento de Fowler e Nordheim
  if (e.ligado.tunel && e.J_Am2 > 1e-8) {
    const taxa = Math.min(14, Math.max(0, (Math.log10(e.J_Am2 * 1e-4) + 12) * 1.2));
    if (Math.random() < taxa * dt) centelhas.push({ x: xS + Math.random() * (xD - xS), t: 0, sobe: !sobe });
  }
  for (let i = centelhas.length - 1; i >= 0; i--) {
    const c = centelhas[i];
    c.t += dt * 1.6;
    if (c.t > 1) {
      centelhas.splice(i, 1);
      continue;
    }
    p.circulo(c.x, c.sobe ? yN - c.t * tOx : yG + c.t * tOx, 2.2, "#fff6a0");
  }
  p.texto(`SiO₂ ${br(e.tox_nm, 1)} nm`, 8, yG + tOx / 2 + 4, { cor: C("--texto-2"), tamanho: 11, fonte });
  p.texto("Si n⁺, porta local", 8, yN + hN * 0.55, { cor: C("--texto-2"), tamanho: 11, fonte });
  p.texto("Si tipo n", 8, H - 10, { cor: C("--texto-2"), tamanho: 11, fonte });
  p.texto(`n ${sci(e.n_m2 / 1e4, 2)} cm⁻²   E_ox ${br(e.E_Vm / 1e8, 2)} MV/cm`, W - 10, H - 10, { cor: perto ? C("--erro") : C("--texto-2"), tamanho: 11, alinhar: "right", fonte });
}

export function desenharBandas(p: Pincel, e: EstadoOperacao, el: Element): void {
  const C = (n: string) => cssVar(n, el);
  const W = p.largura, H = p.altura;
  const fonte = C("--f-dado");
  p.retangulo(0, 0, W, H, C("--tela"));
  const kT = 0.025852;
  const xs = e.bandaX_nm, psi = e.bandaPsi;
  const EFsi = -e.Vg;
  const Ec: number[] = [];
  for (let k = 0; k < xs.length; k++) Ec.push(EFsi - kT * e.eta_superficie - psi[k]);
  const Vox = (1.602176634e-19 * e.n_m2) / e.C_ox;
  const oxSi = Ec[0] + e.barreira_eV, oxG = oxSi + Vox;
  const ED = -e.mu_eV;
  const estreito = W < 480;
  const p0 = 46, p1 = estreito ? W - 12 : W * 0.64;
  const xG = p0 + 16, xO0 = xG + 6, xO1 = xO0 + (p1 - xO0) * 0.45;
  const fim = Math.min(30, xs[xs.length - 1]);
  const vals = [0, ED, EFsi, oxSi, oxG, Ec[0], Ec[0] - 1.12, Ec[Ec.length - 1]];
  const lo = Math.min(...vals) - 0.6, hi = Math.max(...vals) + 0.5;
  const y0 = 12, y1 = H - 30;
  const Y = (en: number) => y1 - ((en - lo) / (hi - lo)) * (y1 - y0);
  const Xsi = (x: number) => xO1 + Math.min(1, Math.max(0, x / fim)) * (p1 - xO1);
  // eixo de energia
  for (let en = Math.ceil(lo); en <= hi; en++) {
    p.linha([p0, p1], [Y(en), Y(en)], { cor: C("--grade"), largura: 1 });
    p.texto(br(en, 0), p0 - 6, Y(en) + 4, { cor: C("--texto-3"), tamanho: 11, alinhar: "right", fonte });
  }
  p.texto("energia do elétron (eV)", 12, (y0 + y1) / 2, { cor: C("--texto-2"), tamanho: 11, alinhar: "center", rotacao: -Math.PI / 2 });
  p.retangulo(xO0, y0, xO1 - xO0, y1 - y0, C("--oxido"), 0.12);
  p.linha([xO0, xO1], [Y(oxG), Y(oxSi)], { cor: C("--oxido"), largura: 2 });
  p.texto(`SiO₂ ${br(e.tox_nm, 1)} nm`, (xO0 + xO1) / 2, Math.min(Y(oxG), Y(oxSi)) - 6, { cor: C("--oxido"), tamanho: 11, alinhar: "center", fonte });
  // distância de tunelamento pela barreira triangular
  if (e.ligado.tunel && e.E_Vm > 1e8) {
    const injGr = e.n_m2 > 0;
    const barreira = injGr ? oxG : oxSi - EFsi;
    const d = barreira / (e.E_Vm * 1e-9);
    if (d < e.tox_nm && d > 0) {
      const xa = injGr ? xO0 : xO1;
      const xb = injGr ? xO0 + (d / e.tox_nm) * (xO1 - xO0) : xO1 - (d / e.tox_nm) * (xO1 - xO0);
      const ye = Y(injGr ? 0 : EFsi);
      p.linha([xa, xb], [ye, ye], { cor: "#fff6a0", largura: 1.5, tracejado: [3, 3] });
      p.texto(`túnel ${br(d, 1)} nm`, (xa + xb) / 2, ye - 5, { cor: "#fff6a0", tamanho: 11, alinhar: "center", fonte });
    }
  }
  // grafeno
  p.linha([xG, xG], [Y(ED) - 18, Y(ED) + 18], { cor: C("--texto"), largura: 2 });
  p.circulo(xG, Y(ED), 3, C("--texto"));
  p.texto("E_D", xG - 4, Y(ED) + 4, { cor: C("--texto-2"), tamanho: 11, alinhar: "right", fonte });
  p.linha([p0, xO0], [Y(0), Y(0)], { cor: C("--texto"), largura: 1, tracejado: [4, 3] });
  p.linha([xO1, p1], [Y(EFsi), Y(EFsi)], { cor: C("--texto"), largura: 1, tracejado: [4, 3] });
  p.texto("E_F grafeno", p0 + 2, Y(0) - 4, { cor: C("--texto"), tamanho: 11, fonte });
  p.texto("E_F Si", p1 - 2, Y(EFsi) + 13, { cor: C("--texto"), tamanho: 11, alinhar: "right", fonte });
  // Si
  const xsS: number[] = [], ec: number[] = [], ev: number[] = [];
  for (let k = 0; k < xs.length && xs[k] <= fim; k++) {
    xsS.push(Xsi(xs[k]));
    ec.push(Y(Ec[k]));
    ev.push(Y(Ec[k] - 1.12));
  }
  p.linha(xsS, ec, { cor: C("--p-ativo"), largura: 2 });
  p.linha(xsS, ev, { cor: C("--texto-3"), largura: 2 });
  p.texto("E_c", p1 - 2, ec[ec.length - 1] - 4, { cor: C("--p-ativo"), tamanho: 11, alinhar: "right", fonte });
  p.texto("E_v", p1 - 2, ev[ev.length - 1] - 4, { cor: C("--texto-3"), tamanho: 11, alinhar: "right", fonte });
  p.texto(`V_G ${br(e.Vg, 2)} V, queda no óxido ${br(Vox, 2)} V`, (xO0 + p1) / 2, H - 10, { cor: C("--texto-2"), tamanho: 11, alinhar: "center", fonte });
  if (estreito) return;
  // cone de Dirac
  const cx = W * 0.82, cy = H * 0.27, s = H * 0.17, emax = 0.45;
  const yF = cy - Math.max(-1, Math.min(1, e.mu_eV / emax)) * s;
  p.poligono([cx - s * 0.75, cx, cx + s * 0.75], [cy + s, cy, cy + s], C("--eletron"), 0.3);
  if (e.mu_eV > 0) {
    const d = (cy - yF) * 0.75;
    p.poligono([cx, cx - d, cx + d], [cy, yF, yF], C("--eletron"), 0.55);
  } else if (e.mu_eV < 0) {
    const d = (yF - cy) * 0.75;
    p.poligono([cx, cx - d, cx + d], [cy, yF, yF], C("--tela"), 0.75);
  }
  p.linha([cx - s * 0.75, cx, cx + s * 0.75], [cy - s, cy, cy - s], { cor: C("--texto-2"), largura: 1.2 });
  p.linha([cx - s * 0.75, cx, cx + s * 0.75], [cy + s, cy, cy + s], { cor: C("--texto-2"), largura: 1.2 });
  p.linha([cx - s, cx + s], [yF, yF], { cor: C("--texto"), largura: 1, tracejado: [4, 3] });
  p.texto(`E_F − E_D ${e.mu_eV >= 0 ? "+" : "−"}${br(Math.abs(e.mu_eV * 1000), 0)} meV`, cx, cy + s + 14, { cor: C("--texto"), tamanho: 11, alinhar: "center", fonte });
  // detalhe do Si junto à interface, em meV
  const bx0 = W * 0.69, bx1 = W - 8, by0 = H * 0.57, by1 = H - 30;
  const Ec0 = -kT * e.eta_superficie;
  const ecd: number[] = [];
  for (let k = 0; k < xs.length && xs[k] <= fim; k++) ecd.push(Ec0 - psi[k]);
  const ylo = Math.min(-0.45, ...ecd) - 0.05, yhi = Math.max(0.2, ...ecd) + 0.08;
  const Xd = (x: number) => bx0 + Math.min(1, Math.max(0, x / fim)) * (bx1 - bx0);
  const Yd = (en: number) => by1 - ((en - ylo) / (yhi - ylo)) * (by1 - by0);
  p.retangulo(bx0, by0, bx1 - bx0, by1 - by0, "none", 1, C("--borda"));
  const px: number[] = [], py: number[] = [];
  for (let k = 0; k < ecd.length; k++) {
    px.push(Xd(xs[k]));
    py.push(Yd(ecd[k]));
  }
  p.poligono([Xd(0), ...px, Xd(fim)], [Yd(0), ...py.map((v) => Math.max(v, Yd(0))), Yd(0)], C("--eletron"), 0.3);
  p.linha(px, py, { cor: C("--p-ativo"), largura: 2 });
  p.linha([bx0, bx1], [Yd(0), Yd(0)], { cor: C("--texto"), largura: 1, tracejado: [4, 3] });
  p.texto("Si n⁺, 0 a 30 nm", (bx0 + bx1) / 2, by0 - 4, { cor: C("--texto-2"), tamanho: 11, alinhar: "center", fonte });
  p.texto(`curvatura ${br(e.phi_V * 1000, 0)} mV`, (bx0 + bx1) / 2, H - 10, { cor: C("--texto-2"), tamanho: 11, alinhar: "center", fonte });
}
