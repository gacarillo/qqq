/**
 * Módulo 5, Monte Carlo da cadeia (porte de incerteza/montecarlo.py) e análise de
 * sensibilidade.
 *
 * Regras do gfetsim: cada parâmetro com incerteza declarada é amostrado pela sua
 * distribuição; varreduras não são amostradas; ramos nunca se misturam (cada combinação
 * de ramos é uma distribuição própria).
 *
 * Diferença em relação ao Python: lá o RustBCA roda uma vez e o perfil de cada amostra
 * sai de uma lei de potência local em E. Aqui cada amostra interpola a tabela do RustBCA
 * na energia, na inclinação e no óxido sorteados [C].
 */
import type { Parametros } from "@/parametros/parametros";
import { Aleatorio, quantil } from "@/nucleo/aleatorio";
import { simularImplante } from "../implante/implante";
import type { InterpoladorBCA } from "../implante/tabela";
import { aplicar, estadoInicial, fracaoAtiva, type Etapa } from "../recozimento/recozimento";
import * as si from "../recozimento/silicio";
import { oxidar } from "../oxidacao/oxidacao";
import { simularEletrico } from "../eletrico/eletrico";
import type { Receita } from "../receita";

export const ENTRADAS = [
  ["energia", "receita.implantacao.energia", "energia do implante (keV)"],
  ["dose", "receita.implantacao.dose", "dose (cm⁻²)"],
  ["inclinacao", "receita.implantacao.inclinacao", "inclinação (°)"],
  ["oxido_nativo", "receita.implantacao.oxido_nativo", "óxido nativo (nm)"],
  ["dose_limiar", "implantacao.amorfizacao.limiar_TA.dose_limiar", "dose limiar de amorfização (cm⁻²)"],
  ["fator_ne", "recozimento.solubilidade_P.incerteza_ne", "fator em n_e(T)"],
  ["fator_spe", "recozimento.spe_550C.fator_aceleracao_P", "aceleração da SPE pelo P"],
  ["T_rta", "receita.recozimento.variante_A_rta.temperatura", "T do RTA (°C)"],
  ["T_spe", "receita.recozimento.spe.temperatura", "T da SPE (°C)"],
  ["Q_f", "eletrico.oxido.carga_fixa_Qf", "carga fixa (cm⁻²)"],
  ["n_estrela", "eletrico.grafeno.n_residual.faixa_calibracao", "n* das poças (cm⁻²)"],
  ["n_dop", "eletrico.grafeno.dopagem_residual_prior", "dopagem residual (cm⁻²)"],
  ["vF", "eletrico.grafeno.vF", "velocidade de Fermi (m/s)"],
  ["mu_grafeno", "eletrico.grafeno.mobilidade.prior_calibracao", "mobilidade do grafeno (cm²/V·s)"],
] as const;

export type NomeEntrada = (typeof ENTRADAS)[number][0];
export type Amostra = Record<NomeEntrada, number> & {
  fator_eps_ox: number;
  espessura_sputter?: number;
  /** fatores de calibração usados só pela previsão; ausentes valem 1 */
  fator_taxa_ox?: number;
  fator_mu_si?: number;
};

const CHAVES_MASETTI = ["mu_min1", "mu_min2", "mu1", "mu_max"].map((k) => `recozimento.mobilidade_si.masetti_eletrons_P.${k}`);

export const SAIDAS = [
  ["fracao_ativa", "fração ativa após o recozimento", ""],
  ["Rs_recozido", "Rs após o recozimento", "Ω/□"],
  ["amorfo_nm", "fim da camada amorfa", "nm"],
  ["espessura_ox_nm", "espessura do óxido", "nm"],
  ["Rs_final", "Rs final da porta", "Ω/□"],
  ["ativo_superficie", "P ativo na interface", "cm⁻³"],
  ["V_D", "tensão de Dirac", "V"],
  ["perda_si_5e12", "perda de capacitância no Si em 5e12", ""],
  ["C_min_sobre_Cox", "C mínima sobre Cox", ""],
  ["Rsq_grafeno_5e12", "R do canal por quadrado em 5e12", "Ω"],
  ["E_ox_em_VD_mais_5V", "campo no óxido em V_D + 5 V", "MV/cm"],
] as const;

export type NomeSaida = (typeof SAIDAS)[number][0];
export type Saida = Record<NomeSaida, number>;

export function amostrar(p: Parametros, r: Receita, n: number, rng: Aleatorio): Amostra[] {
  const col: Record<string, Float64Array> = {};
  for (const [nome, chave] of ENTRADAS) {
    if (nome === "fator_ne") {
      const s = p.incerteza(chave)!.sigma_rel!;
      col[nome] = Float64Array.from({ length: n }, () => rng.normal(1, s));
    } else col[nome] = p.amostrar(chave, rng, n);
  }
  const out: Amostra[] = [];
  for (let i = 0; i < n; i++) {
    const a = { fator_eps_ox: 1 } as Amostra;
    for (const [nome] of ENTRADAS) a[nome] = col[nome][i];
    out.push(a);
  }
  if (r.oxidacao.metodo === "sputtering") {
    const s = p.valor("receita.oxidacao_porta.sputtering.eps_r_sigma_rel_extra");
    const ip = p.metadados("receita.oxidacao_porta.sputtering.tempo_20nm_50W") as { valor: number; ip95: [number, number] };
    const sig = (Math.log(ip.ip95[1]) - Math.log(ip.ip95[0])) / (2 * 1.96);
    for (const a of out) {
      a.fator_eps_ox = rng.normal(1, s);
      a.espessura_sputter = (20 * ip.valor) / Math.exp(rng.normal(Math.log(ip.valor), sig)); // [C]
    }
  }
  return out;
}

export function avaliar(p: Parametros, bca: InterpoladorBCA, r: Receita, t_ox_min: number | null, th: Amostra): Saida {
  const imp = simularImplante(p, bca, {
    energia_keV: Math.min(Math.max(th.energia, 5), 100), dose_cm2: th.dose, inclinacao: Math.min(Math.max(th.inclinacao, 0), 15),
    oxido_nativo_nm: Math.min(Math.max(th.oxido_nativo, 0), 5), dose_limiar_cm2: th.dose_limiar,
  });
  let e = estadoInicial(imp);
  const sobre: Record<string, number> = {
    "recozimento.solubilidade_P.A_ne": p.valor("recozimento.solubilidade_P.A_ne") * th.fator_ne,
    "recozimento.spe_550C.fator_aceleracao_P": th.fator_spe,
  };
  // Masetti é linear nas quatro mobilidades, então escalar as quatro escala µ(N) inteira
  if (th.fator_mu_si !== undefined && th.fator_mu_si !== 1) for (const k of CHAVES_MASETTI) sobre[k] = p.valor(k) * th.fator_mu_si;
  const Pm = p.copia(sobre);
  const rr = r.recozimento;
  const etapas: Etapa[] = [{ nome: "SPE", T_C: th.T_spe, t_s: rr.t_spe_min * 60 }];
  if (rr.variante === "A_rta") etapas.push({ nome: "RTA", T_C: th.T_rta, t_s: rr.t_rta_s, rapida: true });
  else etapas.push({ nome: "forno", T_C: rr.T_forno_C, t_s: rr.t_forno_min * 60 });
  for (const et of etapas) e = aplicar(Pm, e, et, { ramo: rr.ramoDesativacao }).estado;
  const out = { fracao_ativa: fracaoAtiva(e), Rs_recozido: si.resistenciaFolha(Pm, e.x_nm, e.ativo), amorfo_nm: imp.amorfo_nm ? imp.amorfo_nm[1] : 0 } as Saida;
  let esp: number;
  if (r.oxidacao.metodo === "termico" && t_ox_min) {
    const ox = oxidar(Pm, e, r.oxidacao.T_C, t_ox_min, { ramoAceleracao: r.oxidacao.ramoAceleracao, ramoInterface: r.oxidacao.ramoInterface, nPassos: 40, fatorTaxa: th.fator_taxa_ox });
    e = ox.estado;
    esp = ox.espessura_nm;
  } else esp = th.espessura_sputter ?? r.oxidacao.alvo_nm;
  out.espessura_ox_nm = esp;
  out.Rs_final = si.resistenciaFolha(Pm, e.x_nm, e.ativo);
  out.ativo_superficie = e.ativo[0];
  const { resultado: el } = simularEletrico(Pm.copia({ "eletrico.grafeno.vF": th.vF }), e.x_nm, e.ativo, esp, {
    nDop_cm2: r.eletrico.sinalDop * th.n_dop, Q_f_cm2: th.Q_f, nEstrela_cm2: th.n_estrela, muGrafeno_cm2Vs: th.mu_grafeno,
    eps_r_ox: p.valor("eletrico.materiais.eps_r_SiO2") * th.fator_eps_ox, nPontos: 41,
  });
  out.V_D = el.V_D;
  let i5 = 0;
  for (let i = 0; i < el.n_cm2.length; i++) if (Math.abs(el.n_cm2[i] - 5e12) < Math.abs(el.n_cm2[i5] - 5e12)) i5 = i;
  out.perda_si_5e12 = el.perdaSi[i5];
  let cmin = Infinity;
  for (const c of el.C_F_cm2) cmin = Math.min(cmin, c);
  out.C_min_sobre_Cox = cmin / el.C_ox_F_cm2;
  out.Rsq_grafeno_5e12 = el.R_quadrado_ohm[i5];
  let k = 0;
  for (let i = 0; i < el.V.length; i++) if (Math.abs(el.V[i] - (el.V_D + 5)) < Math.abs(el.V[k] - (el.V_D + 5))) k = i;
  out.E_ox_em_VD_mais_5V = el.E_ox_MVcm[k];
  return out;
}

export interface ResumoSaida {
  p2_5: number;
  p16: number;
  mediana: number;
  p84: number;
  p97_5: number;
  media: number;
  desvio: number;
}

export function resumir(valores: ArrayLike<number>): ResumoSaida {
  const v = Array.from(valores).filter(Number.isFinite);
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  const d = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, v.length - 1));
  return { p2_5: quantil(v, 0.025), p16: quantil(v, 0.16), mediana: quantil(v, 0.5), p84: quantil(v, 0.84), p97_5: quantil(v, 0.975), media: m, desvio: d };
}

export function postos(v: ArrayLike<number>): Float64Array {
  const idx = Array.from({ length: v.length }, (_, i) => i).sort((a, b) => v[a] - v[b]);
  const r = new Float64Array(v.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && v[idx[j + 1]] === v[idx[i]]) j++;
    const posto = (i + j) / 2;
    for (let k = i; k <= j; k++) r[idx[k]] = posto;
    i = j + 1;
  }
  return r;
}

export function correlacao(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let s = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) {
    s += (a[i] - ma) * (b[i] - mb);
    sa += (a[i] - ma) ** 2;
    sb += (b[i] - mb) ** 2;
  }
  return sa > 0 && sb > 0 ? s / Math.sqrt(sa * sb) : 0;
}

/** Correlação de postos de Spearman entre cada entrada e cada saída. */
export function spearman(entradas: Amostra[], saidas: Saida[]): Record<NomeSaida, Record<NomeEntrada, number>> {
  const res = {} as Record<NomeSaida, Record<NomeEntrada, number>>;
  const rEnt = Object.fromEntries(ENTRADAS.map(([nome]) => [nome, postos(entradas.map((a) => a[nome]))])) as Record<NomeEntrada, Float64Array>;
  for (const [s] of SAIDAS) {
    const rs = postos(saidas.map((o) => o[s]));
    res[s] = {} as Record<NomeEntrada, number>;
    for (const [e] of ENTRADAS) res[s][e] = correlacao(rEnt[e], rs);
  }
  return res;
}

/**
 * Plano de Saltelli (2010) para índices de Sobol: matrizes A e B de amostras
 * independentes e AB_i, que é A com a coluna i trocada pela de B. Custo N (d + 2).
 */
export function planoSaltelli(p: Parametros, r: Receita, N: number, rng: Aleatorio): { A: Amostra[]; B: Amostra[]; AB: Amostra[][] } {
  const A = amostrar(p, r, N, rng);
  const B = amostrar(p, r, N, rng);
  const AB = ENTRADAS.map(([nome]) => A.map((a, j) => ({ ...a, [nome]: B[j][nome] }) as Amostra));
  return { A, B, AB };
}

/** Primeira ordem pelo estimador de Saltelli (2010) e total pelo de Jansen (1999). */
export function indicesSobol(fA: ArrayLike<number>, fB: ArrayLike<number>, fAB: ArrayLike<number>[]): { S1: number[]; ST: number[] } {
  const N = fA.length;
  const todos = [...Array.from(fA), ...Array.from(fB)];
  const m = todos.reduce((s, v) => s + v, 0) / todos.length;
  const V = todos.reduce((s, v) => s + (v - m) ** 2, 0) / todos.length;
  const S1: number[] = [];
  const ST: number[] = [];
  for (const fi of fAB) {
    let s1 = 0, st = 0;
    for (let j = 0; j < N; j++) {
      s1 += fB[j] * (fi[j] - fA[j]);
      st += (fA[j] - fi[j]) ** 2;
    }
    S1.push(V > 0 ? s1 / N / V : 0);
    ST.push(V > 0 ? st / (2 * N) / V : 0);
  }
  return { S1, ST };
}

/** Intervalo de 95 % por reamostragem (bootstrap) dos índices de Sobol. */
export function sobolBootstrap(fA: ArrayLike<number>, fB: ArrayLike<number>, fAB: ArrayLike<number>[], nBoot = 200, semente = 5): { S1: [number, number][]; ST: [number, number][] } {
  const rng = new Aleatorio(semente);
  const N = fA.length;
  const amostrasS1: number[][] = fAB.map(() => []);
  const amostrasST: number[][] = fAB.map(() => []);
  for (let b = 0; b < nBoot; b++) {
    const idx = Array.from({ length: N }, () => rng.inteiro(N));
    const r = indicesSobol(idx.map((i) => fA[i]), idx.map((i) => fB[i]), fAB.map((f) => idx.map((i) => f[i])));
    r.S1.forEach((v, k) => amostrasS1[k].push(v));
    r.ST.forEach((v, k) => amostrasST[k].push(v));
  }
  return {
    S1: amostrasS1.map((v) => [quantil(v, 0.025), quantil(v, 0.975)]),
    ST: amostrasST.map((v) => [quantil(v, 0.025), quantil(v, 0.975)]),
  };
}
