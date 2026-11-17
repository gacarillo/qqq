/**
 * Interpolação na tabela de implantação do RustBCA (scripts/tabela_bca.py).
 *
 * A tabela cobre energias de 5 a 100 keV, óxido nativo de 0 a 5 nm a 7° e inclinações
 * de 0, 7 e 15° com 1,5 nm de óxido. Entre os pontos, os momentos são interpolados em
 * log da energia e linearmente no óxido; a inclinação entra como correção aditiva medida
 * em 1,5 nm. As curvas (perda nuclear, lateral, histograma) são deformadas na profundidade
 * reduzida x/Rp antes da mistura, o que preserva a integral de cada uma. O resultado
 * interpolado é [C]; fora da tabela o estúdio recusa o cálculo.
 */
import type { Momentos } from "./pearson";
import { interp } from "@/nucleo/numerico";

export interface PontoBCA {
  E_keV: number;
  inclinacao: number;
  oxido_nm: number;
  n_ions: number;
  f_si: number;
  f_oxido: number;
  f_refletida: number;
  momentos: [number, number, number, number];
  dx_nm: number;
  hist: number[];
  Fn: number[];
  lateral: { x: number[]; media: number[]; desvio: number[]; desvio_total: number; media_total: number };
}

export interface PontoSiO2 {
  E_keV: number;
  inclinacao: number;
  momentos: [number, number, number, number];
  f_refletida: number;
  p999_nm: number;
  max_nm: number;
}

export interface TabelaBCA {
  fonte: string;
  n_ions: number;
  energias: number[];
  oxidos: number[];
  inclinacoes: number[];
  pontos: PontoBCA[];
  sio2: PontoSiO2[];
}

/** Resultado interpolado: o que um único ponto do RustBCA daria. */
export interface PontoInterpolado {
  f_si: number;
  f_oxido: number;
  f_refletida: number;
  momentos: Momentos;
  /** profundidade (nm) e perda nuclear do íon (eV/cm por íon) */
  x: Float64Array;
  Fn: Float64Array;
  /** histograma das posições finais, íons por nm por íon incidente */
  hist: Float64Array;
  lateral: { x: Float64Array; media: Float64Array; desvio: Float64Array; desvioTotal: number; mediaTotal: number };
  vizinhos: string[];
}

export class ForaDaTabela extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ForaDaTabela";
  }
}

const DX_SAIDA = 0.5;

export class InterpoladorBCA {
  constructor(readonly tab: TabelaBCA) {}

  private ponto(E: number, th: number, ox: number): PontoBCA {
    const p = this.tab.pontos.find((q) => q.E_keV === E && q.inclinacao === th && q.oxido_nm === ox);
    if (!p) throw new Error(`ponto ausente na tabela: ${E} keV, ${th}°, ${ox} nm`);
    return p;
  }

  faixa(): { E: [number, number]; ox: [number, number]; th: [number, number] } {
    const t = this.tab;
    return { E: [t.energias[0], t.energias.at(-1)!], ox: [t.oxidos[0], t.oxidos.at(-1)!], th: [t.inclinacoes[0], t.inclinacoes.at(-1)!] };
  }

  avaliar(E_keV: number, inclinacao: number, oxido_nm: number, xMax = 300): PontoInterpolado {
    const f = this.faixa();
    if (E_keV < f.E[0] || E_keV > f.E[1]) throw new ForaDaTabela(`energia de ${E_keV} keV fora da tabela do RustBCA (${f.E[0]} a ${f.E[1]} keV)`);
    if (oxido_nm < f.ox[0] || oxido_nm > f.ox[1]) throw new ForaDaTabela(`óxido nativo de ${oxido_nm} nm fora da tabela (${f.ox[0]} a ${f.ox[1]} nm)`);
    if (inclinacao < f.th[0] || inclinacao > f.th[1]) throw new ForaDaTabela(`inclinação de ${inclinacao}° fora da tabela (${f.th[0]} a ${f.th[1]}°)`);
    const pesos = this.pesos(E_keV, inclinacao, oxido_nm);
    // momentos e frações: soma ponderada (pesos podem ser negativos na correção de inclinação)
    const mom = [0, 0, 0, 0];
    let fsi = 0, fox = 0, frf = 0;
    for (const { p, w } of pesos) {
      for (let k = 0; k < 4; k++) mom[k] += w * p.momentos[k];
      fsi += w * p.f_si;
      fox += w * p.f_oxido;
      frf += w * p.f_refletida;
    }
    const Rp = mom[0];
    const n = Math.round(xMax / DX_SAIDA);
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = (i + 0.5) * DX_SAIDA;
    const Fn = new Float64Array(n);
    const hist = new Float64Array(n);
    const latX = new Float64Array(n);
    const latM = new Float64Array(n);
    const latS = new Float64Array(n);
    let desvioTotal = 0, mediaTotal = 0;
    for (const { p, w } of pesos) {
      const esc = p.momentos[0] / Rp; // x_p = x * esc
      const xs = p.Fn.map((_, i) => (i + 0.5) * p.dx_nm);
      for (let i = 0; i < n; i++) {
        const xp = x[i] * esc;
        Fn[i] += w * esc * interp(xp, xs, p.Fn, 0, 0);
        hist[i] += (w * esc * interp(xp, xs, p.hist, 0, 0)) / p.n_ions / p.dx_nm;
        latM[i] += w * interp(xp, p.lateral.x, p.lateral.media);
        latS[i] += w * interp(xp, p.lateral.x, p.lateral.desvio);
      }
      desvioTotal += w * p.lateral.desvio_total;
      mediaTotal += w * p.lateral.media_total;
    }
    for (let i = 0; i < n; i++) {
      latX[i] = x[i];
      if (Fn[i] < 0) Fn[i] = 0;
      if (hist[i] < 0) hist[i] = 0;
      latS[i] = Math.max(latS[i], 0.5);
    }
    return {
      f_si: fsi,
      f_oxido: Math.max(fox, 0),
      f_refletida: Math.max(frf, 0),
      momentos: { media: mom[0], desvio: mom[1], assimetria: mom[2], curtose: mom[3] },
      x,
      Fn,
      hist,
      lateral: { x: latX, media: latM, desvio: latS, desvioTotal, mediaTotal },
      vizinhos: pesos.filter((q) => Math.abs(q.w) > 1e-9).map((q) => `${q.p.E_keV} keV, ${q.p.inclinacao}°, ${q.p.oxido_nm} nm`),
    };
  }

  /** Pesos de interpolação: bilinear em (log E, óxido) a 7° mais correção de inclinação. */
  private pesos(E: number, th: number, ox: number): { p: PontoBCA; w: number }[] {
    const Es = this.tab.energias;
    const [e0, e1, we] = vizinhos(Es, E, true);
    const [o0, o1, wo] = vizinhos(this.tab.oxidos, ox, false);
    const lista: { p: PontoBCA; w: number }[] = [];
    const add = (p: PontoBCA, w: number) => {
      if (w === 0) return;
      const ja = lista.find((q) => q.p === p);
      if (ja) ja.w += w;
      else lista.push({ p, w });
    };
    for (const [Ei, wE] of [[e0, 1 - we], [e1, we]] as const)
      for (const [oi, wO] of [[o0, 1 - wo], [o1, wo]] as const) add(this.ponto(Ei, 7, oi), wE * wO);
    if (Math.abs(th - 7) > 1e-9) {
      const [t0, t1, wt] = vizinhos(this.tab.inclinacoes, th, false);
      for (const [Ei, wE] of [[e0, 1 - we], [e1, we]] as const) {
        add(this.ponto(Ei, t0, 1.5), wE * (1 - wt));
        add(this.ponto(Ei, t1, 1.5), wE * wt);
        add(this.ponto(Ei, 7, 1.5), -wE);
      }
    }
    return lista;
  }

  /** Momentos do alcance de P em SiO2 espesso, para a transmissão pela máscara. */
  alcanceSiO2(E_keV: number): { momentos: Momentos; p999: number; max: number } {
    const s = this.tab.sio2;
    const Es = s.map((p) => p.E_keV);
    const [i0, i1, w] = indicesVizinhos(Es, E_keV, true);
    const m = [0, 1, 2, 3].map((k) => (1 - w) * s[i0].momentos[k] + w * s[i1].momentos[k]);
    return {
      momentos: { media: m[0], desvio: m[1], assimetria: m[2], curtose: m[3] },
      p999: (1 - w) * s[i0].p999_nm + w * s[i1].p999_nm,
      max: (1 - w) * s[i0].max_nm + w * s[i1].max_nm,
    };
  }
}

function indicesVizinhos(xs: number[], x: number, log: boolean): [number, number, number] {
  let i = 0;
  while (i < xs.length - 2 && xs[i + 1] < x) i++;
  if (xs.length === 1) return [0, 0, 0];
  const a = log ? Math.log(xs[i]) : xs[i];
  const b = log ? Math.log(xs[i + 1]) : xs[i + 1];
  const v = log ? Math.log(x) : x;
  return [i, i + 1, Math.min(1, Math.max(0, (v - a) / (b - a)))];
}

function vizinhos(xs: number[], x: number, log: boolean): [number, number, number] {
  const [i0, i1, w] = indicesVizinhos(xs, x, log);
  return [xs[i0], xs[i1], w];
}
