/**
 * Módulo 1, implantação de P (porte de gfetsim/implantacao/modulo.py).
 *
 * No Python o RustBCA roda a cada chamada. Aqui os momentos, a perda nuclear e o
 * espalhamento lateral vêm da tabela do RustBCA interpolada (tabela.ts); o resto do
 * caminho é o mesmo: Pearson pelos momentos, dose retida no Si, camada amorfa pelo limiar
 * de dose medido a 300 K (ramo limiar_TA, A2) e transmissão pela máscara.
 */
import type { Parametros } from "@/parametros/parametros";
import { argmax, maximo, trapz, type Vetor } from "@/nucleo/numerico";
import { densidadePearson, type Momentos } from "./pearson";
import { InterpoladorBCA, type PontoInterpolado } from "./tabela";

export interface OpcoesImplante {
  energia_keV?: number;
  dose_cm2?: number;
  inclinacao?: number;
  oxido_nativo_nm?: number;
  dose_limiar_cm2?: number;
  mascara_nm?: number; // espessura da máscara de SiO2 (variante A), 0 sem máscara
  xMax_nm?: number;
}

export interface ResultadoImplante {
  x_nm: Vetor;
  C_cm3: Vetor;
  hist_C_cm3: Vetor;
  dose_cm2: number;
  dose_si: number;
  dose_oxido: number;
  dose_refletida: number;
  momentos: Momentos;
  tipoPearson: "IV" | "I";
  Fn_eV_cm: Vetor;
  amorfo_nm: [number, number] | null;
  dose_limiar: number;
  transmissaoMascara: { valor: number; limiteSuperior: number; extrapolado: boolean } | null;
  lateral: PontoInterpolado["lateral"];
  energia_keV: number;
  inclinacao: number;
  oxido_nativo_nm: number;
  mascara_nm: number;
  pico_cm3: number;
  notas: string[];
}

/** Região onde Fn(x) dose >= Fn_max dose_limiar (ramo limiar_TA), contígua ao máximo de Fn. */
export function camadaAmorfa(x: Vetor, Fn: Vetor, dose: number, doseLimiar: number): [number, number] | null {
  const lim = (maximo(Fn) * doseLimiar) / dose;
  const i0 = argmax(Fn);
  if (!(Fn[i0] >= lim)) return null;
  let a = i0;
  while (a > 0 && Fn[a - 1] >= lim) a--;
  let b = i0;
  while (b < x.length - 1 && Fn[b + 1] >= lim) b++;
  return [x[a], x[b]];
}

export function simularImplante(p: Parametros, bca: InterpoladorBCA, o: OpcoesImplante = {}): ResultadoImplante {
  const E = o.energia_keV ?? p.valor("receita.implantacao.energia");
  const D = o.dose_cm2 ?? p.valor("receita.implantacao.dose");
  const th = o.inclinacao ?? p.valor("receita.implantacao.inclinacao");
  const ox = o.oxido_nativo_nm ?? p.valor("receita.implantacao.oxido_nativo");
  const notas: string[] = [];
  const pt = bca.avaliar(E, th, ox, o.xMax_nm ?? 300);
  const { f, tipo } = densidadePearson(pt.x, pt.momentos);
  if (tipo !== "IV") notas.push(`momentos fora da região Pearson IV; usado Pearson ${tipo}`);
  const doseSi = D * pt.f_si;
  const C = new Float64Array(f.length);
  for (let i = 0; i < f.length; i++) C[i] = doseSi * f[i] * 1e7;
  const histC = new Float64Array(pt.hist.length);
  for (let i = 0; i < histC.length; i++) histC[i] = D * pt.hist[i] * 1e7;
  let limiar = o.dose_limiar_cm2;
  if (limiar === undefined) {
    const inc = p.incerteza("implantacao.amorfizacao.limiar_TA.dose_limiar")!;
    limiar = 0.5 * (inc.min! + inc.max!);
    notas.push("dose limiar no centro da faixa de A2; o Monte Carlo amostra a faixa inteira");
  }
  const amorfo = camadaAmorfa(pt.x, pt.Fn, D, limiar);
  let trans: ResultadoImplante["transmissaoMascara"] = null;
  const masc = o.mascara_nm ?? 0;
  if (masc > 0) {
    const al = bca.alcanceSiO2(E);
    const n = 4000;
    const xs = new Float64Array(n);
    const passo = Math.max(al.p999 * 4, masc * 1.5) / n;
    for (let i = 0; i < n; i++) xs[i] = (i + 0.5) * passo;
    const { f: fo } = densidadePearson(xs, al.momentos);
    let cauda = 0;
    for (let i = 1; i < n; i++) if (xs[i] > masc) cauda += 0.5 * (fo[i] + fo[i - 1]) * passo;
    const extrapolado = masc > al.max;
    trans = { valor: cauda, limiteSuperior: extrapolado ? 1 / bca.tab.n_ions : cauda, extrapolado };
    if (extrapolado) notas.push(`nenhum dos ${bca.tab.n_ions} íons da tabela passou de ${al.max.toFixed(0)} nm de SiO2; transmissão pela máscara menor que ${(1 / bca.tab.n_ions).toExponential(0)}, e a cauda do Pearson é extrapolação`);
  }
  notas.push(`momentos interpolados na tabela do RustBCA entre ${pt.vizinhos.join("; ")} [C]`);
  return {
    x_nm: pt.x,
    C_cm3: C,
    hist_C_cm3: histC,
    dose_cm2: D,
    dose_si: doseSi,
    dose_oxido: D * pt.f_oxido,
    dose_refletida: D * pt.f_refletida,
    momentos: pt.momentos,
    tipoPearson: tipo,
    Fn_eV_cm: pt.Fn,
    amorfo_nm: amorfo,
    dose_limiar: limiar,
    transmissaoMascara: trans,
    lateral: pt.lateral,
    energia_keV: E,
    inclinacao: th,
    oxido_nativo_nm: ox,
    mascara_nm: masc,
    pico_cm3: maximo(C),
    notas,
  };
}

/** Dose integrada de um perfil em cm^-2 (x em nm, C em cm^-3). */
export function dose(x_nm: ArrayLike<number>, C: ArrayLike<number>): number {
  const xc = Float64Array.from(x_nm as ArrayLike<number>, (v) => v * 1e-7);
  return trapz(C, xc);
}
