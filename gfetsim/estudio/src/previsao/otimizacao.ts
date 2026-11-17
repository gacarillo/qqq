/**
 * Receita ótima: a que maximiza a probabilidade de cumprir as especificações, dada a
 * posteriori e a dispersão do equipamento. A probabilidade de cada receita é a média,
 * sobre sorteios fixos de θ e da dispersão (números aleatórios comuns), da forma suave de
 * preditiva.ts. Fixar os sorteios deixa a função lisa entre receitas vizinhas, então o
 * mapa não tem ruído de Monte Carlo de um pixel para outro e o Nelder-Mead converge.
 */
import { Aleatorio } from "@/nucleo/aleatorio";
import { Emulador } from "./emulador";
import type { NomeVarReceita, ValoresReceita } from "./espaco";
import type { Especificacao, PosteriorSerial } from "./tipos";
import { probabilidadeSuave } from "./preditiva";
import { planoTreino } from "./emulador";

export interface SorteiosFixos {
  uc: Float64Array[];
  /** desvio normal padrão da dispersão de cada variável de receita, por sorteio */
  eps: Float64Array[];
}

export function sorteiosFixos(em: Emulador, post: PosteriorSerial, n: number, semente: number): SorteiosFixos {
  const rng = new Aleatorio(semente);
  const uc: Float64Array[] = [];
  const eps: Float64Array[] = [];
  for (let k = 0; k < n; k++) {
    const s = rng.inteiro(post.S);
    uc.push(post.amostras.slice(s * post.dc, (s + 1) * post.dc));
    eps.push(Float64Array.from(em.espaco.vars, () => rng.normal(0, 1)));
  }
  return { uc, eps };
}

/** Probabilidade de cumprir numa receita nominal, com erro padrão entre os sorteios. */
export function probabilidadeReceita(em: Emulador, F: SorteiosFixos, nominal: ValoresReceita, specs: Especificacao[], disc: Record<string, number>): { p: number; ep: number } {
  const esp = em.espaco;
  const z = new Float64Array(esp.d);
  const ur = new Float64Array(esp.nv);
  let s = 0;
  let s2 = 0;
  const n = F.uc.length;
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < esp.nv; i++) {
      const a = esp.vars[i];
      let v = (nominal[a.def.nome] ?? a.def.ler(esp.base, esp.tOxBase)) + a.dispersao * F.eps[k][i];
      if (a.def.log) v = Math.max(v, 1e-30);
      ur[i] = esp.uVar(i, v);
    }
    esp.juntar(ur, F.uc[k], z);
    const p = probabilidadeSuave(em, z, specs, disc);
    s += p;
    s2 += p * p;
  }
  const m = s / n;
  return { p: m, ep: Math.sqrt(Math.max(0, s2 / n - m * m) / n) };
}

export interface EixoMapa {
  nome: NomeVarReceita;
  min: number;
  max: number;
  log: boolean;
  valores: number[];
}

export interface ResultadoMapa {
  x: EixoMapa;
  y: EixoMapa;
  /** probabilidade por célula, linha por linha em y (P[iy * nx + ix]) */
  P: Float64Array;
  nx: number;
  ny: number;
  atual: { x: number; y: number; p: number; ep: number };
  otimo: { receita: ValoresReceita; p: number; ep: number; naBorda: string[] } | null;
  avisos: string[];
}

function grade(min: number, max: number, n: number, log: boolean): number[] {
  return Array.from({ length: n }, (_, i) => (log ? Math.exp(Math.log(min) + (i / (n - 1)) * (Math.log(max) - Math.log(min))) : min + (i / (n - 1)) * (max - min)));
}

/** Mapa da probabilidade de cumprir em duas variáveis de receita, as outras na receita nominal. */
export function mapaProbabilidade(em: Emulador, post: PosteriorSerial, nominal: ValoresReceita, specs: Especificacao[], disc: Record<string, number>, eixos: [NomeVarReceita, NomeVarReceita], o: { n?: number; sorteios?: number; semente?: number; otimizar?: boolean; livres?: NomeVarReceita[] } = {}): ResultadoMapa {
  const esp = em.espaco;
  const avisos: string[] = [];
  const ia = esp.vars.findIndex((a) => a.def.nome === eixos[0]);
  const ib = esp.vars.findIndex((a) => a.def.nome === eixos[1]);
  if (ia < 0 || ib < 0 || ia === ib) throw new Error("os dois eixos do mapa precisam ser variáveis diferentes do espaço do emulador");
  const n = o.n ?? 28;
  const F = sorteiosFixos(em, post, o.sorteios ?? 160, o.semente ?? 17);
  const A = esp.vars[ia];
  const B = esp.vars[ib];
  const x: EixoMapa = { nome: A.def.nome, min: A.min, max: A.max, log: A.def.log, valores: grade(A.min, A.max, n, A.def.log) };
  const y: EixoMapa = { nome: B.def.nome, min: B.min, max: B.max, log: B.def.log, valores: grade(B.min, B.max, n, B.def.log) };
  const P = new Float64Array(n * n);
  let melhor = { p: -1, ix: 0, iy: 0 };
  for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) {
    const r = { ...nominal, [A.def.nome]: x.valores[ix], [B.def.nome]: y.valores[iy] };
    const { p } = probabilidadeReceita(em, F, r, specs, disc);
    P[iy * n + ix] = p;
    if (p > melhor.p) melhor = { p, ix, iy };
  }
  const xa = nominal[A.def.nome] ?? A.def.ler(esp.base, esp.tOxBase);
  const ya = nominal[B.def.nome] ?? B.def.ler(esp.base, esp.tOxBase);
  const pa = probabilidadeReceita(em, F, nominal, specs, disc);
  let otimo: ResultadoMapa["otimo"] = null;
  if (o.otimizar !== false) {
    const inicio = { ...nominal, [A.def.nome]: x.valores[melhor.ix], [B.def.nome]: y.valores[melhor.iy] };
    otimo = otimizarReceita(em, post, inicio, specs, disc, { livres: o.livres ?? [A.def.nome, B.def.nome], semente: (o.semente ?? 17) + 1, sorteios: o.sorteios ?? 160 });
  }
  if (melhor.p < 0.05) avisos.push("nenhuma receita do mapa chega a 5 % de chance; as especificações podem estar fora do alcance do processo ou da faixa do emulador");
  return { x, y, P, nx: n, ny: n, atual: { x: xa, y: ya, p: pa.p, ep: pa.ep }, otimo, avisos };
}

/** Nelder-Mead no cubo das variáveis livres, maximizando a probabilidade suave. */
export function otimizarReceita(em: Emulador, post: PosteriorSerial, inicio: ValoresReceita, specs: Especificacao[], disc: Record<string, number>, o: { livres: NomeVarReceita[]; semente?: number; sorteios?: number; iteracoes?: number }): { receita: ValoresReceita; p: number; ep: number; naBorda: string[] } {
  const esp = em.espaco;
  const F = sorteiosFixos(em, post, o.sorteios ?? 160, o.semente ?? 23);
  const idx = o.livres.map((nm) => esp.vars.findIndex((a) => a.def.nome === nm)).filter((i) => i >= 0);
  const d = idx.length;
  const paraReceita = (u: ArrayLike<number>): ValoresReceita => {
    const r = { ...inicio };
    idx.forEach((i, k) => (r[esp.vars[i].def.nome] = esp.vVar(i, Math.min(1, Math.max(0, u[k])))));
    return r;
  };
  const f = (u: number[]) => -probabilidadeReceita(em, F, paraReceita(u), specs, disc).p;
  let u0 = idx.map((i) => Math.min(1, Math.max(0, esp.uVar(i, inicio[esp.vars[i].def.nome] ?? esp.vars[i].def.ler(esp.base, esp.tOxBase)))));
  // busca grossa antes do simplex: onde a probabilidade é zero o Nelder-Mead não tem para onde ir
  if (d > 0) {
    let f0 = f(u0);
    for (const u of planoTreino(8 * d + 8, d, (o.semente ?? 23) + 5)) {
      const fu = f(u);
      if (fu < f0) {
        f0 = fu;
        u0 = u;
      }
    }
  }
  const simplex: number[][] = [u0];
  for (let k = 0; k < d; k++) {
    const v = [...u0];
    v[k] = v[k] < 0.5 ? v[k] + 0.12 : v[k] - 0.12;
    simplex.push(v);
  }
  let fv = simplex.map(f);
  const it = o.iteracoes ?? 160;
  for (let t = 0; t < it && d > 0; t++) {
    const ordem = fv.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
    const S = ordem.map((i) => simplex[i]);
    const V = ordem.map((i) => fv[i]);
    if (Math.abs(V[d] - V[0]) < 1e-5 && t > 10) {
      simplex.splice(0, simplex.length, ...S);
      fv = V;
      break;
    }
    const c = new Array<number>(d).fill(0);
    for (let k = 0; k < d; k++) for (let j = 0; j < d; j++) c[j] += S[k][j] / d;
    const pior = S[d];
    const ref = c.map((cj, j) => Math.min(1, Math.max(0, cj + (cj - pior[j]))));
    const fr = f(ref);
    if (fr < V[0]) {
      const exp = c.map((cj, j) => Math.min(1, Math.max(0, cj + 2 * (cj - pior[j]))));
      const fe = f(exp);
      if (fe < fr) {
        S[d] = exp;
        V[d] = fe;
      } else {
        S[d] = ref;
        V[d] = fr;
      }
    } else if (fr < V[d - 1]) {
      S[d] = ref;
      V[d] = fr;
    } else {
      const con = c.map((cj, j) => cj + 0.5 * (pior[j] - cj));
      const fc = f(con);
      if (fc < V[d]) {
        S[d] = con;
        V[d] = fc;
      } else {
        for (let k = 1; k <= d; k++) {
          S[k] = S[k].map((v, j) => S[0][j] + 0.5 * (v - S[0][j]));
          V[k] = f(S[k]);
        }
      }
    }
    simplex.splice(0, simplex.length, ...S);
    fv = V;
  }
  let ib = 0;
  for (let k = 1; k < fv.length; k++) if (fv[k] < fv[ib]) ib = k;
  const receita = paraReceita(simplex[ib]);
  // reavalia com outros sorteios, para o número final não carregar o viés da busca
  const G = sorteiosFixos(em, post, Math.max(400, (o.sorteios ?? 160) * 2), (o.semente ?? 23) + 77);
  const fin = probabilidadeReceita(em, G, receita, specs, disc);
  const naBorda = idx.filter((_i, k) => simplex[ib][k] <= 0.01 || simplex[ib][k] >= 0.99).map((i) => esp.vars[i].def.rotulo);
  return { receita, p: fin.p, ep: fin.ep, naBorda };
}
