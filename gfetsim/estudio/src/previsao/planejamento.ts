/**
 * Qual medida fazer a seguir. Análise pré-posterior (Raiffa e Schlaifer; Chaloner e
 * Verdinelli, Stat. Sci. 10, 273, 1995): para cada medida candidata, sorteia resultados
 * possíveis pela preditiva atual, repesa a posteriori por importância com cada resultado
 * e mede quanto a variância da saída-alvo na receita-alvo cairia em média.
 *
 * Só a parte da variância que vem de θ pode cair. O ruído irredutível (emulador,
 * discrepância, equipamento) fica igual e aparece à parte, para ninguém esperar de uma
 * medida o que ela não pode dar.
 */
import type { NomeSaida } from "@/fisica/incerteza/montecarlo";
import { Aleatorio } from "@/nucleo/aleatorio";
import { mediaVarianciaPonderada, tamanhoEfetivo } from "./algebra";
import { Emulador, deT } from "./emulador";
import { varianciaDispersao, desvioMedidaT } from "./calibracao";
import type { ValoresReceita } from "./espaco";
import { ehParametro, nomeParametro, type Grandeza, type PosteriorSerial } from "./tipos";
import { sortearReceita } from "./preditiva";

export interface Candidato {
  grandeza: Grandeza;
  /** receita do lote em que a medida seria feita */
  receita: ValoresReceita;
  rotuloReceita: string;
  sigma: number;
  relativo: boolean;
}

export interface ItemPlano {
  candidato: Candidato;
  /** desvio da parte epistêmica do alvo depois da medida, em média, na escala transformada */
  desvioEpistemicoDepois: number;
  /** 1 − desvio total depois / desvio total agora */
  reducao: number;
  essMedio: number;
}

export interface ResultadoPlano {
  alvo: NomeSaida;
  desvioEpistemicoAgora: number;
  desvioIrredutivel: number;
  itens: ItemPlano[];
  avisos: string[];
}

export interface OpcoesPlano {
  nPosteriori?: number;
  nFicticios?: number;
  semente?: number;
}

export function planejar(em: Emulador, post: PosteriorSerial, receitaAlvo: ValoresReceita, alvo: NomeSaida, candidatos: Candidato[], disc: Record<string, number>, o: OpcoesPlano = {}): ResultadoPlano {
  const esp = em.espaco;
  const M = Math.min(post.S, o.nPosteriori ?? 800);
  const K = o.nFicticios ?? 48;
  const rng = new Aleatorio(o.semente ?? 31);
  const avisos: string[] = [];
  const z = new Float64Array(esp.d);
  const idx = Array.from({ length: M }, (_, k) => Math.floor((k * post.S) / M));
  const uc = (m: number) => post.amostras.subarray(idx[m] * post.dc, (idx[m] + 1) * post.dc);
  // alvo em cada θ da subamostra, na receita nominal
  const urAlvo = sortearReceita(em, receitaAlvo, rng, true);
  const T = new Float64Array(M);
  for (let m = 0; m < M; m++) {
    esp.juntar(urAlvo, uc(m), z);
    T[m] = em.mediaT(alvo, z);
  }
  const uniforme = new Float64Array(M).fill(1);
  const [, varAgora] = mediaVarianciaPonderada(T, uniforme);
  const centro = esp.centroCalib();
  const irred2 = em.erroT(alvo) ** 2 + (disc[alvo] ?? 0) ** 2 + varianciaDispersao(em, alvo, esp.juntar(urAlvo, centro));
  const itens: ItemPlano[] = [];
  for (const c of candidatos) {
    const y = new Float64Array(M);
    let sig2: number;
    if (ehParametro(c.grandeza)) {
      const nome = nomeParametro(c.grandeza);
      const j = esp.calib.findIndex((a) => a.def.nome === nome);
      if (j < 0) {
        avisos.push(`${nome} não está entre os parâmetros calibrados`);
        continue;
      }
      const cal = esp.calib[j];
      for (let m = 0; m < M; m++) {
        const v = esp.vCalib(j, uc(m)[j]);
        y[m] = cal.log ? Math.log(v) : v;
      }
      const ref = esp.vCalib(j, 0.5);
      const s = cal.log ? (c.relativo ? c.sigma : c.sigma / ref) : c.relativo ? c.sigma * Math.abs(ref) : c.sigma;
      sig2 = s * s;
    } else {
      const s = c.grandeza;
      if (!em.tem(s)) continue;
      const ur = sortearReceita(em, c.receita, rng, true);
      for (let m = 0; m < M; m++) {
        esp.juntar(ur, uc(m), z);
        y[m] = em.mediaT(s, z);
      }
      let ref = 0;
      for (const v of y) ref += v;
      ref /= M;
      const sm = desvioMedidaT(s, deT(s, ref), c.sigma, c.relativo);
      sig2 = sm * sm + em.erroT(s) ** 2 + (disc[s] ?? 0) ** 2 + varianciaDispersao(em, s, esp.juntar(ur, centro));
    }
    const sd = Math.sqrt(sig2);
    let somaVar = 0;
    let somaEss = 0;
    const w = new Float64Array(M);
    for (let k = 0; k < K; k++) {
      const mk = rng.inteiro(M);
      const d = y[mk] + rng.normal(0, sd);
      for (let m = 0; m < M; m++) w[m] = Math.exp((-0.5 * (d - y[m]) ** 2) / sig2);
      const [, v] = mediaVarianciaPonderada(T, w);
      somaVar += Number.isFinite(v) ? v : varAgora;
      somaEss += tamanhoEfetivo(w);
    }
    const vDepois = somaVar / K;
    const totAgora = Math.sqrt(varAgora + irred2);
    const totDepois = Math.sqrt(vDepois + irred2);
    itens.push({ candidato: c, desvioEpistemicoDepois: Math.sqrt(vDepois), reducao: totAgora > 0 ? 1 - totDepois / totAgora : 0, essMedio: somaEss / K });
  }
  itens.sort((a, b) => b.reducao - a.reducao);
  if (itens.some((i) => i.essMedio < 30)) avisos.push("algumas candidatas deixam poucas amostras efetivas depois da repesagem; a redução delas é aproximada");
  return { alvo, desvioEpistemicoAgora: Math.sqrt(varAgora), desvioIrredutivel: Math.sqrt(irred2), itens, avisos };
}
