/**
 * Emulador da cadeia: um processo gaussiano por saída sobre o espaço de receita e
 * calibração. Saídas positivas com várias décadas (resistências, concentração) são
 * emuladas no logaritmo natural, então o erro do emulador nelas é relativo.
 *
 * O erro de cada saída é o RMSE da validação cruzada deixando um de fora. A
 * verossimilhança e a previsão usam esse número como desvio constante do emulador, o que
 * é conservador perto dos pontos de treino e barato (a média sai em O(n d)).
 */
import { SAIDAS, type NomeSaida, type Saida } from "@/fisica/incerteza/montecarlo";
import type { Parametros } from "@/parametros/parametros";
import type { Receita } from "@/fisica/receita";
import { ProcessoGaussiano, resumoLOO, type SerialGP } from "./gp";
import { Espaco, type ConfigEspaco } from "./espaco";

export type Transformacao = "lin" | "log";

export const TRANSFORMACAO: Record<NomeSaida, Transformacao> = {
  fracao_ativa: "lin",
  Rs_recozido: "log",
  amorfo_nm: "lin",
  espessura_ox_nm: "lin",
  Rs_final: "log",
  ativo_superficie: "log",
  V_D: "lin",
  perda_si_5e12: "log",
  C_min_sobre_Cox: "lin",
  Rsq_grafeno_5e12: "log",
  E_ox_em_VD_mais_5V: "lin",
};

export const NOME_SAIDA = new Map<NomeSaida, { rotulo: string; unidade: string }>(SAIDAS.map(([k, r, u]) => [k, { rotulo: r, unidade: u }]));

export function paraT(s: NomeSaida, v: number): number {
  return TRANSFORMACAO[s] === "log" ? Math.log(Math.max(v, 1e-300)) : v;
}

export function deT(s: NomeSaida, t: number): number {
  return TRANSFORMACAO[s] === "log" ? Math.exp(t) : t;
}

export interface QualidadeSaida {
  Q2: number;
  /** RMSE da validação cruzada na escala transformada */
  rmse: number;
  dentro2s: number;
  desvioY: number;
  ruido: number;
  /** comprimentos de correlação, um por dimensão do espaço */
  comprimentos: number[];
}

export interface SerialEmulador {
  versao: 1;
  chave: string;
  base: Receita;
  tOxBase: number | null;
  config: ConfigEspaco;
  saidas: NomeSaida[];
  gps: Partial<Record<NomeSaida, SerialGP>>;
  /** pontos de treino no cubo e as saídas físicas (null onde a cadeia falhou) */
  Z: number[][];
  Y: (Saida | null)[];
  qualidade: Partial<Record<NomeSaida, QualidadeSaida>>;
  ms: number;
}

export class Emulador {
  private readonly gps = new Map<NomeSaida, ProcessoGaussiano>();
  readonly qualidade = new Map<NomeSaida, QualidadeSaida>();

  constructor(readonly espaco: Espaco, readonly serialBase: SerialEmulador) {
    for (const s of serialBase.saidas) {
      const g = serialBase.gps[s];
      if (!g) continue;
      this.gps.set(s, ProcessoGaussiano.de(g));
      const q = serialBase.qualidade[s];
      if (q) this.qualidade.set(s, q);
    }
  }

  static de(p: Parametros, s: SerialEmulador): Emulador {
    return new Emulador(new Espaco(p, s.base, s.tOxBase, s.config), s);
  }

  get saidas(): NomeSaida[] {
    return [...this.gps.keys()];
  }

  tem(s: NomeSaida): boolean {
    return this.gps.has(s);
  }

  gp(s: NomeSaida): ProcessoGaussiano {
    const g = this.gps.get(s);
    if (!g) throw new Error(`o emulador não tem a saída ${s}`);
    return g;
  }

  /** Média na escala transformada. */
  mediaT(s: NomeSaida, z: ArrayLike<number>): number {
    return this.gp(s).media(z);
  }

  /** Média na escala física. */
  media(s: NomeSaida, z: ArrayLike<number>): number {
    return deT(s, this.mediaT(s, z));
  }

  /** Desvio do emulador na escala transformada (RMSE da validação cruzada). */
  erroT(s: NomeSaida): number {
    return this.qualidade.get(s)?.rmse ?? 0;
  }
}

/** Ajusta o GP de uma saída e mede a qualidade. Roda dentro do worker. */
export function ajustarSaida(Z: number[][], y: number[], opcoes: { semente?: number; iteracoes?: number; reinicios?: number } = {}): { gp: SerialGP; qualidade: QualidadeSaida } {
  const g = ProcessoGaussiano.ajustar(Z, y, { semente: opcoes.semente, iteracoes: opcoes.iteracoes, reinicios: opcoes.reinicios });
  const r = resumoLOO(g);
  return { gp: g.serial(), qualidade: { ...r, ruido: g.ruido, comprimentos: Array.from(g.comprimentos) } };
}

/** Dados de treino de uma saída: os pontos onde a cadeia rodou e o valor é finito, já transformados. */
export function dadosDeSaida(Z: number[][], Y: (Saida | null)[], s: NomeSaida): { Z: number[][]; y: number[] } {
  const zs: number[][] = [];
  const ys: number[] = [];
  for (let i = 0; i < Z.length; i++) {
    const v = Y[i]?.[s];
    if (v === undefined || v === null || !Number.isFinite(v)) continue;
    if (TRANSFORMACAO[s] === "log" && !(v > 0)) continue;
    zs.push(Z[i]);
    ys.push(paraT(s, v));
  }
  return { Z: zs, y: ys };
}

/**
 * Plano de treino: hipercubo latino com o melhor de várias tentativas pelo critério de
 * máxima distância mínima (Morris e Mitchell), mais o centro do espaço.
 */
export function planoTreino(n: number, d: number, semente: number, tentativas = 12): number[][] {
  let rngEstado = semente >>> 0 || 1;
  const real = () => {
    rngEstado ^= rngEstado << 13;
    rngEstado ^= rngEstado >>> 17;
    rngEstado ^= rngEstado << 5;
    return (rngEstado >>> 0) / 4294967296;
  };
  let melhor: number[][] = [];
  let melhorD = -1;
  for (let t = 0; t < tentativas; t++) {
    const P: number[][] = Array.from({ length: n }, () => new Array<number>(d));
    for (let k = 0; k < d; k++) {
      const perm = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(real() * (i + 1));
        [perm[i], perm[j]] = [perm[j], perm[i]];
      }
      for (let i = 0; i < n; i++) P[i][k] = (perm[i] + real()) / n;
    }
    let dmin = Infinity;
    for (let i = 0; i < n && dmin > 0; i++) for (let j = 0; j < i; j++) {
      let s = 0;
      for (let k = 0; k < d; k++) s += (P[i][k] - P[j][k]) ** 2;
      if (s < dmin) dmin = s;
    }
    if (dmin > melhorD) {
      melhorD = dmin;
      melhor = P;
    }
  }
  melhor[0] = new Array<number>(d).fill(0.5);
  return melhor;
}
