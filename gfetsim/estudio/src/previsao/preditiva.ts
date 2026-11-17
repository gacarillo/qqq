/**
 * Distribuição preditiva da próxima rodada. Cada sorteio pega um θ da posteriori,
 * aplica a dispersão do equipamento às variáveis de receita, avalia o emulador e soma o
 * erro do emulador e a discrepância de modelo. O resultado responde o que o lote vai dar
 * e com que probabilidade cumpre a especificação.
 *
 * A probabilidade de cumprir é estimada de dois jeitos. Pela contagem dos sorteios, que
 * respeita a correlação entre saídas que vem de θ. E pela forma suave, que integra o
 * ruído gaussiano de cada saída analiticamente (Φ nas duas pontas) e é a usada no mapa e
 * na otimização, porque não tem degraus.
 */
import type { NomeSaida } from "@/fisica/incerteza/montecarlo";
import { Aleatorio, quantil } from "@/nucleo/aleatorio";
import { Phi } from "./algebra";
import { Emulador, deT, paraT, TRANSFORMACAO } from "./emulador";
import type { ValoresReceita } from "./espaco";
import type { Especificacao, InstantaneoPrevisao, PosteriorSerial } from "./tipos";

export interface DistribuicaoSaida {
  s: NomeSaida;
  amostras: Float64Array;
  p2_5: number;
  p5: number;
  p16: number;
  p50: number;
  p84: number;
  p95: number;
  p97_5: number;
  /** desvio da parte que vem de θ, na escala transformada (é a que medidas reduzem) */
  desvioEpistemicoT: number;
  /** desvio do ruído irredutível (emulador, discrepância e equipamento), na escala transformada */
  desvioIrredutivelT: number;
}

export interface ResultadoPrevisao {
  posteriori: Partial<Record<NomeSaida, DistribuicaoSaida>>;
  priori: Partial<Record<NomeSaida, DistribuicaoSaida>>;
  pEspec: number | null;
  pEspecPriori: number | null;
  pPorEspec: { s: NomeSaida; p: number; pPriori: number }[];
  avisos: string[];
  n: number;
}

export interface OpcoesPrevisao {
  n?: number;
  semente?: number;
  semDispersao?: boolean;
  semDiscrepancia?: boolean;
}

/** Sorteios de receita com a dispersão do equipamento, no cubo. */
export function sortearReceita(em: Emulador, nominal: ValoresReceita, rng: Aleatorio, semDispersao = false): Float64Array {
  const esp = em.espaco;
  return Float64Array.from(esp.vars, (a, i) => {
    let v = nominal[a.def.nome] ?? a.def.ler(esp.base, esp.tOxBase);
    if (!semDispersao && a.dispersao > 0) v += rng.normal(0, a.dispersao);
    if (a.def.log) v = Math.max(v, 1e-30);
    return esp.uVar(i, v);
  });
}

function distribuicao(s: NomeSaida, v: Float64Array, epist: number, irred: number): DistribuicaoSaida {
  return {
    s, amostras: v, p2_5: quantil(v, 0.025), p5: quantil(v, 0.05), p16: quantil(v, 0.16), p50: quantil(v, 0.5), p84: quantil(v, 0.84), p95: quantil(v, 0.95), p97_5: quantil(v, 0.975),
    desvioEpistemicoT: epist, desvioIrredutivelT: irred,
  };
}

function cumpre(e: Especificacao, v: number): boolean {
  return (e.min === null || v >= e.min) && (e.max === null || v <= e.max);
}

function amostrarPreditiva(em: Emulador, post: PosteriorSerial, nominal: ValoresReceita, saidas: NomeSaida[], disc: Record<string, number>, n: number, rng: Aleatorio, o: OpcoesPrevisao) {
  const esp = em.espaco;
  const z = new Float64Array(esp.d);
  const out = new Map<NomeSaida, Float64Array>(saidas.map((s) => [s, new Float64Array(n)]));
  const medias = new Map<NomeSaida, Float64Array>(saidas.map((s) => [s, new Float64Array(n)]));
  const zNom = sortearReceita(em, nominal, rng, true);
  for (let k = 0; k < n; k++) {
    const s = rng.inteiro(post.S);
    const uc = post.amostras.subarray(s * post.dc, (s + 1) * post.dc);
    const ur = sortearReceita(em, nominal, rng, o.semDispersao);
    esp.juntar(ur, uc, z);
    for (const sa of saidas) {
      const mu = em.mediaT(sa, z);
      const ruido = Math.sqrt(em.erroT(sa) ** 2 + (o.semDiscrepancia ? 0 : (disc[sa] ?? 0) ** 2));
      out.get(sa)![k] = deT(sa, mu + rng.normal(0, ruido));
    }
    esp.juntar(zNom, uc, z);
    for (const sa of saidas) medias.get(sa)![k] = em.mediaT(sa, z);
  }
  return { out, medias };
}

function desvio(v: Float64Array): number {
  let m = 0;
  for (const x of v) m += x;
  m /= v.length;
  let q = 0;
  for (const x of v) q += (x - m) ** 2;
  return Math.sqrt(q / Math.max(1, v.length - 1));
}

export function prever(em: Emulador, post: PosteriorSerial, priori: PosteriorSerial, nominal: ValoresReceita, specs: Especificacao[], disc: Record<string, number>, o: OpcoesPrevisao = {}): ResultadoPrevisao {
  const n = o.n ?? 4000;
  const saidas = em.saidas;
  const avisos: string[] = [];
  const esp = em.espaco;
  const ur = esp.unidadeReceita(nominal);
  esp.vars.forEach((a, i) => {
    if (ur[i] < -0.01 || ur[i] > 1.01) avisos.push(`${a.def.rotulo} fora da faixa de treino do emulador (${a.min.toPrecision(3)} a ${a.max.toPrecision(3)} ${a.def.unidade}); a previsão é extrapolação`);
  });
  const ativas = specs.filter((e) => e.ativa && em.tem(e.s) && (e.min !== null || e.max !== null));
  const res: ResultadoPrevisao = { posteriori: {}, priori: {}, pEspec: null, pEspecPriori: null, pPorEspec: [], avisos, n };
  const rodar = (pp: PosteriorSerial, semente: number) => amostrarPreditiva(em, pp, nominal, saidas, disc, n, new Aleatorio(semente), o);
  const A = rodar(post, o.semente ?? 5);
  const B = rodar(priori, (o.semente ?? 5) + 9);
  for (const s of saidas) {
    const irred = Math.sqrt(em.erroT(s) ** 2 + (o.semDiscrepancia ? 0 : (disc[s] ?? 0) ** 2));
    res.posteriori[s] = distribuicao(s, A.out.get(s)!, desvio(A.medias.get(s)!), irred);
    res.priori[s] = distribuicao(s, B.out.get(s)!, desvio(B.medias.get(s)!), irred);
  }
  if (ativas.length) {
    const conta = (M: Map<NomeSaida, Float64Array>) => {
      let ok = 0;
      for (let k = 0; k < n; k++) if (ativas.every((e) => cumpre(e, M.get(e.s)![k]))) ok++;
      return ok / n;
    };
    res.pEspec = conta(A.out);
    res.pEspecPriori = conta(B.out);
    res.pPorEspec = ativas.map((e) => {
      const f = (M: Map<NomeSaida, Float64Array>) => M.get(e.s)!.reduce((a, v) => a + (cumpre(e, v) ? 1 : 0), 0) / n;
      return { s: e.s, p: f(A.out), pPriori: f(B.out) };
    });
  }
  return res;
}

/** Guarda a previsão de forma compacta para conferir quando a medida chegar. */
export function instantaneo(r: ResultadoPrevisao, chaveEmulador: string, nMedidas: number): InstantaneoPrevisao {
  const saidas: InstantaneoPrevisao["saidas"] = {};
  for (const [s, d] of Object.entries(r.posteriori) as [NomeSaida, DistribuicaoSaida][]) {
    const passo = Math.max(1, Math.floor(d.amostras.length / 200));
    const am: number[] = [];
    for (let i = 0; i < d.amostras.length && am.length < 200; i += passo) am.push(d.amostras[i]);
    saidas[s] = { p2_5: d.p2_5, p16: d.p16, p50: d.p50, p84: d.p84, p97_5: d.p97_5, amostras: am };
  }
  return { quando: Date.now(), emulador: chaveEmulador, nMedidasCalibracao: nMedidas, saidas, pEspec: r.pEspec };
}

/**
 * Probabilidade suave de cumprir as especificações num ponto z: Π_s [Φ((hi − η)/σ) − Φ((lo − η)/σ)]
 * na escala transformada, com σ o ruído irredutível da saída.
 */
export function probabilidadeSuave(em: Emulador, z: Float64Array, specs: Especificacao[], disc: Record<string, number>): number {
  let p = 1;
  for (const e of specs) {
    const mu = em.mediaT(e.s, z);
    const sig = Math.max(1e-9, Math.sqrt(em.erroT(e.s) ** 2 + (disc[e.s] ?? 0) ** 2));
    const lo = e.min === null ? -Infinity : paraT(e.s, e.min);
    const hi = e.max === null ? Infinity : paraT(e.s, e.max);
    const a = lo === -Infinity ? 0 : Phi((lo - mu) / sig);
    const b = hi === Infinity ? 1 : Phi((hi - mu) / sig);
    p *= Math.max(0, b - a);
    if (p === 0) return 0;
  }
  return p;
}

/** Especificações válidas para o emulador (saída emulada, ao menos um limite, limites positivos no log). */
export function especificacoesValidas(em: Emulador, specs: Especificacao[]): Especificacao[] {
  return specs.filter((e) => e.ativa && em.tem(e.s) && (e.min !== null || e.max !== null) && (TRANSFORMACAO[e.s] !== "log" || ((e.min === null || e.min > 0) && (e.max === null || e.max > 0))));
}
