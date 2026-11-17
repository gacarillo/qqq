/**
 * Calibração bayesiana dos parâmetros não controlados com as medidas dos lotes.
 *
 * Para uma medida d de uma saída s num lote de receita x, a verossimilhança é normal na
 * escala transformada (log para saídas positivas):
 *
 *   d ~ N(η_s(x, θ), σ_med² + σ_emu² + σ_disc² + σ_disp²)
 *
 * η é a média do emulador; σ_emu o erro da validação cruzada; σ_disc a discrepância de
 * modelo do params.yaml (Kennedy e O'Hagan, J. R. Stat. Soc. B 63, 425, 2001, na forma
 * sem correlação); σ_disp a dispersão do equipamento propagada pelo gradiente do emulador
 * no centro da priori. Medidas diretas de um parâmetro (dopagem pelo Raman, mobilidade
 * por um ajuste) entram com verossimilhança normal no próprio parâmetro.
 *
 * Os lotes compartilham o mesmo θ. Dopagem residual e mobilidade do grafeno variam de
 * dispositivo para dispositivo; aqui a calibração dá o valor típico, e a discrepância
 * absorve a variação entre eles. Um modelo hierárquico fica como extensão.
 */
import type { NomeSaida } from "@/fisica/incerteza/montecarlo";
import { quantil } from "@/nucleo/aleatorio";
import { Aleatorio } from "@/nucleo/aleatorio";
import { Emulador, paraT, TRANSFORMACAO } from "./emulador";
import { amostrarConjunto, type OpcoesMCMC } from "./mcmc";
import type { NomeCalib } from "./espaco";
import { ehParametro, nomeParametro, type Grandeza, type Lote, type PosteriorSerial } from "./tipos";

interface TermoSaida {
  tipo: "saida";
  s: NomeSaida;
  ur: Float64Array;
  dT: number;
  sig2: number;
  lote: string;
  medida: string;
}

interface TermoParametro {
  tipo: "param";
  j: number;
  dT: number;
  log: boolean;
  sig2: number;
  lote: string;
  medida: string;
}

export type Termo = TermoSaida | TermoParametro;

export interface ResumoParametro {
  nome: NomeCalib;
  rotulo: string;
  unidade: string;
  priori: { p2_5: number; p16: number; p50: number; p84: number; p97_5: number };
  posteriori: { p2_5: number; p16: number; p50: number; p84: number; p97_5: number };
  /** 1 − var(posteriori)/var(priori) no cubo; 0 quando as medidas nada dizem */
  encolhimento: number;
}

export interface Residuo {
  lote: string;
  medida: string;
  grandeza: Grandeza;
  medido: number;
  previsto: number;
  /** resíduo padronizado na escala transformada */
  z: number;
}

export interface ResultadoCalibracao {
  posterior: PosteriorSerial;
  nomes: NomeCalib[];
  resumo: ResumoParametro[];
  residuos: Residuo[];
  avisos: string[];
  diagnostico: { aceitacao: number; tau: number[]; ess: number; rhat: number[]; passos: number; descarte: number; caminhantes: number } | null;
  tracoLogp: number[];
  /** correlação de postos entre os parâmetros na posteriori, dc × dc */
  correlacao: number[];
  ms: number;
}

/** Desvio total na escala transformada de uma medida de saída (sem o termo do emulador). */
export function desvioMedidaT(s: NomeSaida, valor: number, sigma: number, relativo: boolean): number {
  if (TRANSFORMACAO[s] === "log") return relativo ? sigma : sigma / Math.abs(valor);
  return relativo ? sigma * Math.abs(valor) : sigma;
}

/**
 * Variância propagada da dispersão do equipamento: Σ (∂η/∂u_i · du_i/dv · σ_i)², com o
 * gradiente do emulador no ponto dado.
 */
export function varianciaDispersao(em: Emulador, s: NomeSaida, z: Float64Array): number {
  const esp = em.espaco;
  const g = em.gp(s).gradienteMedia(z);
  let v = 0;
  for (let i = 0; i < esp.nv; i++) {
    const a = esp.vars[i];
    if (!(a.dispersao > 0)) continue;
    const x = esp.vVar(i, z[i]);
    const dudv = a.def.log ? 1 / (x * Math.log(a.max / a.min)) : 1 / (a.max - a.min);
    v += (g[i] * dudv * a.dispersao) ** 2;
  }
  return v;
}

/** Monta os termos da verossimilhança e as mensagens sobre medidas que ficaram de fora. */
export function montarTermos(em: Emulador, lotes: Lote[], disc: Record<string, number>): { termos: Termo[]; avisos: string[] } {
  const esp = em.espaco;
  const termos: Termo[] = [];
  const avisos: string[] = [];
  const centro = esp.centroCalib();
  for (const lote of lotes) {
    if (!lote.usarNaCalibracao) continue;
    const ur = esp.unidadeReceita(lote.receita);
    const fora = esp.vars.filter((_, i) => ur[i] < -0.02 || ur[i] > 1.02).map((a) => a.def.rotulo);
    for (const m of lote.medidas) {
      if (!Number.isFinite(m.valor) || !(m.sigma > 0)) {
        avisos.push(`${lote.nome}, ${m.grandeza} sem valor ou sem desvio; ficou de fora`);
        continue;
      }
      if (ehParametro(m.grandeza)) {
        const nome = nomeParametro(m.grandeza);
        const j = esp.calib.findIndex((c) => c.def.nome === nome);
        if (j < 0) {
          avisos.push(`${lote.nome}, ${nome} não está entre os parâmetros calibrados; ficou de fora`);
          continue;
        }
        const c = esp.calib[j];
        if (c.log && !(m.valor > 0)) {
          avisos.push(`${lote.nome}, ${nome} precisa ser positivo`);
          continue;
        }
        const sigT = c.log ? (m.relativo ? m.sigma : m.sigma / m.valor) : m.relativo ? m.sigma * Math.abs(m.valor) : m.sigma;
        termos.push({ tipo: "param", j, dT: c.log ? Math.log(m.valor) : m.valor, log: c.log, sig2: sigT * sigT, lote: lote.id, medida: m.id });
        continue;
      }
      const s = m.grandeza;
      if (!em.tem(s)) {
        avisos.push(`${lote.nome}, ${s} não foi emulada; ficou de fora`);
        continue;
      }
      if (fora.length) {
        avisos.push(`${lote.nome} está fora da faixa do emulador em ${fora.join(", ")}; a medida de ${s} ficou de fora`);
        continue;
      }
      if (TRANSFORMACAO[s] === "log" && !(m.valor > 0)) {
        avisos.push(`${lote.nome}, ${s} precisa ser positivo`);
        continue;
      }
      const urc = Float64Array.from(ur, (u) => Math.min(1, Math.max(0, u)));
      const z = esp.juntar(urc, centro);
      const sm = desvioMedidaT(s, m.valor, m.sigma, m.relativo);
      const sig2 = sm * sm + em.erroT(s) ** 2 + (disc[s] ?? 0) ** 2 + varianciaDispersao(em, s, z);
      termos.push({ tipo: "saida", s, ur: urc, dT: paraT(s, m.valor), sig2, lote: lote.id, medida: m.id });
    }
  }
  return { termos, avisos };
}

/** Log da posteriori no cubo dos parâmetros de calibração. */
export function criarLogPosteriori(em: Emulador, termos: Termo[]): (uc: Float64Array) => number {
  const esp = em.espaco;
  const z = new Float64Array(esp.d);
  return (uc) => {
    let l = esp.logPriori(uc);
    if (l === -Infinity) return l;
    for (const t of termos) {
      let mu: number;
      if (t.tipo === "saida") {
        esp.juntar(t.ur, uc, z);
        mu = em.mediaT(t.s, z);
      } else {
        const v = esp.vCalib(t.j, uc[t.j]);
        mu = t.log ? Math.log(v) : v;
      }
      l -= (0.5 * (t.dT - mu) ** 2) / t.sig2;
    }
    return l;
  };
}

function quantis(v: ArrayLike<number>) {
  return { p2_5: quantil(v, 0.025), p16: quantil(v, 0.16), p50: quantil(v, 0.5), p84: quantil(v, 0.84), p97_5: quantil(v, 0.975) };
}

function postos(v: ArrayLike<number>): Float64Array {
  const idx = Array.from({ length: v.length }, (_, i) => i).sort((a, b) => v[a] - v[b]);
  const r = new Float64Array(v.length);
  idx.forEach((i, k) => (r[i] = k));
  return r;
}

function correlacaoPostos(cols: Float64Array[]): number[] {
  const d = cols.length;
  const R = cols.map(postos);
  const out = new Array<number>(d * d).fill(1);
  for (let a = 0; a < d; a++) for (let b = 0; b < a; b++) {
    const x = R[a];
    const y = R[b];
    const n = x.length;
    const mx = (n - 1) / 2;
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < n; i++) {
      sxy += (x[i] - mx) * (y[i] - mx);
      sxx += (x[i] - mx) ** 2;
    }
    const r = sxx > 0 ? sxy / sxx : 0;
    out[a * d + b] = r;
    out[b * d + a] = r;
  }
  return out;
}

export function calibrar(em: Emulador, lotes: Lote[], disc: Record<string, number>, o: OpcoesMCMC & { nPriori?: number } = {}): ResultadoCalibracao {
  const t0 = performance.now();
  const esp = em.espaco;
  const dc = esp.calib.length;
  const { termos, avisos } = montarTermos(em, lotes, disc);
  const rng = new Aleatorio((o.semente ?? 7) + 101);
  const nPri = o.nPriori ?? 4000;
  const priori = new Float64Array(nPri * dc);
  for (let s = 0; s < nPri; s++) priori.set(esp.amostrarPriori(rng), s * dc);
  let amostras: Float64Array;
  let S: number;
  let diagnostico: ResultadoCalibracao["diagnostico"] = null;
  let tracoLogp: number[] = [];
  if (termos.length === 0 || dc === 0) {
    amostras = priori;
    S = nPri;
    if (termos.length === 0) avisos.push("nenhuma medida utilizável; a posteriori é a própria priori");
  } else {
    const logp = criarLogPosteriori(em, termos);
    const r = amostrarConjunto(logp, (g) => esp.amostrarPriori(g), dc, o);
    amostras = r.amostras;
    S = r.S;
    diagnostico = { aceitacao: r.aceitacao, tau: r.tau, ess: r.ess, rhat: r.rhat, passos: r.passos, descarte: r.descarte, caminhantes: r.caminhantes };
    tracoLogp = Array.from(r.tracoLogp);
    const rmax = Math.max(...r.rhat.filter(Number.isFinite));
    if (rmax > 1.1) avisos.push(`R̂ máximo de ${rmax.toFixed(2)}; as cadeias não se misturaram, rode com mais passos`);
    if (r.ess < 200) avisos.push(`tamanho efetivo de ${Math.round(r.ess)} amostras; os quantis extremos ficam imprecisos`);
    if (r.aceitacao < 0.1) avisos.push(`aceitação de ${(100 * r.aceitacao).toFixed(0)} %; a posteriori pode ser muito estreita ou multimodal`);
  }
  const resumo: ResumoParametro[] = esp.calib.map((c, j) => {
    const pri = new Float64Array(nPri);
    const pos = new Float64Array(S);
    for (let s = 0; s < nPri; s++) pri[s] = priori[s * dc + j];
    for (let s = 0; s < S; s++) pos[s] = amostras[s * dc + j];
    const v = (a: Float64Array) => {
      let m = 0;
      for (const x of a) m += x;
      m /= a.length;
      let q = 0;
      for (const x of a) q += (x - m) ** 2;
      return q / Math.max(1, a.length - 1);
    };
    const fis = (a: Float64Array) => Float64Array.from(a, (u) => esp.vCalib(j, u));
    return { nome: c.def.nome, rotulo: c.def.rotulo, unidade: c.def.unidade, priori: quantis(fis(pri)), posteriori: quantis(fis(pos)), encolhimento: termos.length ? Math.max(0, 1 - v(pos) / v(pri)) : 0 };
  });
  // resíduos com a média preditiva sobre uma subamostra da posteriori
  const residuos: Residuo[] = [];
  const nSub = Math.min(S, 400);
  const z = new Float64Array(esp.d);
  const lotePorId = new Map(lotes.map((l) => [l.id, l]));
  for (const t of termos) {
    let soma = 0;
    let soma2 = 0;
    for (let k = 0; k < nSub; k++) {
      const s = Math.floor((k * S) / nSub);
      const uc = amostras.subarray(s * dc, (s + 1) * dc);
      let mu: number;
      if (t.tipo === "saida") {
        esp.juntar(t.ur, uc, z);
        mu = em.mediaT(t.s, z);
      } else {
        const v = esp.vCalib(t.j, uc[t.j]);
        mu = t.log ? Math.log(v) : v;
      }
      soma += mu;
      soma2 += mu * mu;
    }
    const m = soma / nSub;
    const varMu = Math.max(0, soma2 / nSub - m * m);
    const lote = lotePorId.get(t.lote);
    const med = lote?.medidas.find((x) => x.id === t.medida);
    const g: Grandeza = med?.grandeza ?? (t.tipo === "saida" ? t.s : `param:${esp.calib[t.j].def.nome}`);
    const log = t.tipo === "saida" ? TRANSFORMACAO[t.s] === "log" : t.log;
    residuos.push({ lote: t.lote, medida: t.medida, grandeza: g, medido: med?.valor ?? NaN, previsto: log ? Math.exp(m) : m, z: (t.dT - m) / Math.sqrt(t.sig2 + varMu) });
  }
  if (residuos.length >= 3) {
    const q = residuos.reduce((a, r) => a + r.z * r.z, 0) / residuos.length;
    if (q > 3) avisos.push(`os resíduos padronizados têm média quadrática ${q.toFixed(1)}, bem acima de 1; o modelo ou os desvios declarados não explicam as medidas`);
  }
  const cols = esp.calib.map((_, j) => Float64Array.from({ length: S }, (_, s) => amostras[s * dc + j]));
  return {
    posterior: { amostras, S, dc, nTermos: termos.length },
    nomes: esp.calib.map((c) => c.def.nome),
    resumo, residuos, avisos, diagnostico, tracoLogp,
    correlacao: dc > 0 ? correlacaoPostos(cols) : [],
    ms: performance.now() - t0,
  };
}
