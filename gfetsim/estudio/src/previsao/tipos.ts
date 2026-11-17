/** Tipos de dados da previsão que circulam entre a interface, o caderno e os workers. */
import type { NomeSaida } from "@/fisica/incerteza/montecarlo";
import type { Parametros } from "@/parametros/parametros";
import type { NomeCalib, ValoresCalib, ValoresReceita } from "./espaco";

/** O que foi medido: uma saída da cadeia ou um parâmetro medido direto (Raman, Hall). */
export type Grandeza = NomeSaida | `param:${NomeCalib}`;

export interface Medida {
  id: string;
  grandeza: Grandeza;
  valor: number;
  /** desvio padrão da medida, absoluto ou relativo conforme o campo relativo */
  sigma: number;
  relativo: boolean;
  nota?: string;
}

/** Previsão guardada antes da medida, para conferir depois. */
export interface InstantaneoSaida {
  p2_5: number;
  p16: number;
  p50: number;
  p84: number;
  p97_5: number;
  /** até 200 sorteios da preditiva, na escala física */
  amostras: number[];
}

export interface InstantaneoPrevisao {
  quando: number;
  /** chave do emulador e número de medidas usadas na calibração */
  emulador: string;
  nMedidasCalibracao: number;
  saidas: Partial<Record<NomeSaida, InstantaneoSaida>>;
  pEspec: number | null;
}

export interface Lote {
  id: string;
  nome: string;
  receita: ValoresReceita;
  medidas: Medida[];
  usarNaCalibracao: boolean;
  previsao?: InstantaneoPrevisao;
  nota?: string;
  criado: number;
  /** lote gerado pela própria cadeia para testar o fluxo, com o valor verdadeiro guardado */
  sintetico?: { verdade: ValoresCalib };
}

export interface Especificacao {
  s: NomeSaida;
  min: number | null;
  max: number | null;
  ativa: boolean;
}

export interface PosteriorSerial {
  /** S × dc por linha, no cubo unitário dos parâmetros de calibração */
  amostras: Float64Array;
  S: number;
  dc: number;
  /** quantas medidas entraram; 0 quer dizer que é a priori */
  nTermos: number;
}

export function ehParametro(g: Grandeza): g is `param:${NomeCalib}` {
  return g.startsWith("param:");
}

export function nomeParametro(g: `param:${NomeCalib}`): NomeCalib {
  return g.slice(6) as NomeCalib;
}

/** Desvio de discrepância de cada saída na escala transformada, do params.yaml. */
export function discrepancias(p: Parametros, saidas: NomeSaida[]): Record<string, number> {
  const o: Record<string, number> = {};
  for (const s of saidas) {
    const k = `previsao.discrepancia.${s}`;
    o[s] = p.existe(k) ? p.valor(k) : 0;
  }
  return o;
}

/** Erro típico de medida sugerido para cada grandeza, do params.yaml. */
export function erroTipico(p: Parametros, g: Grandeza): { sigma: number; relativo: boolean } {
  const nome = ehParametro(g) ? nomeParametro(g) : g;
  const k = `previsao.erro_medida_tipico.${nome}`;
  if (!p.existe(k)) return { sigma: 0.1, relativo: true };
  const md = p.metadados(k);
  return { sigma: Number(md.valor), relativo: md.unidade === "relativo" };
}

export function novoIdCurto(prefixo: string): string {
  return `${prefixo}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}
