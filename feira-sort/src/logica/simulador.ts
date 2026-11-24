/**
 * Jogador simulado: estima a taxa de falha de uma fase antes de qualquer jogador real.
 *
 * Ele joga como um jogador casual: só enxerga os itens visíveis, prefere juntar itens iguais e completar
 * caixas, evita desfazer a própria jogada, hesita em gastar a última caixa vazia e erra de vez em quando
 * (ruído). Quando trava, usa o desfazer (com o mesmo limite do jogo) e lembra que aquele caminho não deu.
 * A partida conta como falha se ele travar sem desfazer sobrando ou se passar do limite de jogadas.
 *
 * O número que sai daqui é uma hipótese inicial. O plano manda trocá-lo pela taxa de falha real de cada
 * fase assim que houver dados.
 */
import type { DefinicaoFase } from './regras';
import { criarAleatorio, type Aleatorio } from './aleatorio';
import {
  aplicarCompacto,
  chaveCanonica,
  jogadasCompactas,
  problemaDeDefinicao,
  venceuCompacto,
  type Problema,
} from './resolvedor';

export interface OpcoesSimulacao {
  partidas?: number;
  semente?: number;
  /** Quanto o jogador simulado erra. 0 = sempre a jogada de maior nota. */
  ruido?: number;
  /** Desfazer disponível por partida (o jogo dá 5 grátis por fase). */
  desfazer?: number;
  /** Limite de jogadas antes de desistir. Padrão: 4 × mínimo + 25. */
  limiteJogadas?: number;
  jogadasMinimas?: number;
}

export interface ResultadoSimulacao {
  falha: number;
  mediaJogadas: number;
  mediaDesfazer: number;
}

interface Tab {
  caixas: string[];
  ocultos: boolean[][];
}

function ocultosIniciais(def: DefinicaoFase): boolean[][] {
  return def.caixas.map((s) => [...s].map((l, i) => l !== l.toUpperCase() && i !== s.length - 1));
}

function seqVisivel(t: Tab, i: number): number {
  const s = t.caixas[i];
  const o = t.ocultos[i];
  const n = s.length;
  if (n === 0) return 0;
  let k = 1;
  while (k < n && s[n - 1 - k] === s[n - 1] && !o[n - 1 - k]) k++;
  return k;
}

function uniformeVisivel(t: Tab, i: number): boolean {
  const s = t.caixas[i];
  if (s.length === 0) return false;
  if (t.ocultos[i].some((x) => x)) return false;
  for (let k = 1; k < s.length; k++) if (s[k] !== s[0]) return false;
  return true;
}

function aplicar(t: Tab, de: number, para: number, n: number): Tab {
  const caixas = aplicarCompacto(t.caixas, de, para, n);
  const ocultos = t.ocultos.map((o) => o.slice());
  // Quem se move fica visível; o novo topo de cada caixa também.
  ocultos[para].push(...new Array<boolean>(n).fill(false));
  ocultos[de].length -= n;
  for (const o of ocultos) if (o.length > 0) o[o.length - 1] = false;
  return { caixas, ocultos };
}

function nota(p: Problema, t: Tab, de: number, para: number, ultima: [number, number] | null, vazias: number): number {
  const cap = p.capacidade;
  const destino = t.caixas[para];
  const livre = cap - destino.length;
  const seq = seqVisivel(t, de);
  const esperado = Math.min(seq, livre);
  let s = 0;
  if (destino.length > 0) {
    s += 25;
    if (uniformeVisivel(t, para) && destino.length + esperado === cap) s += 100;
    else if (uniformeVisivel(t, para)) s += 10 + 6 * destino.length;
    else s -= 6;
  } else if (uniformeVisivel(t, de)) {
    s -= 70; // levar uma caixa de um tipo só para outra vazia não muda nada
  } else {
    s += 3;
    if (vazias === 1) s -= 18;
  }
  if (seq > livre) s -= 14;
  if (esperado === t.caixas[de].length) s += 12;
  const abaixo = t.caixas[de].length - esperado - 1;
  if (abaixo >= 0 && t.ocultos[de][abaixo]) s += 10;
  if (ultima && ultima[0] === para && ultima[1] === de) s -= 90;
  return s;
}

function partida(p: Problema, inicial: Tab, rng: Aleatorio, ruido: number, desfazer: number, limite: number) {
  let atual = inicial;
  const historico: { tab: Tab; jogada: [number, number] | null }[] = [];
  const ruins = new Set<string>();
  const visitas = new Map<string, number>();
  let ultima: [number, number] | null = null;
  let jogadas = 0;
  let desfeitas = 0;
  visitas.set(chaveCanonica(p, atual.caixas), 1);

  while (!venceuCompacto(p, atual.caixas)) {
    if (jogadas >= limite) return { venceu: false, jogadas, desfeitas };
    const vazias = atual.caixas.filter((s) => s.length === 0).length;
    let melhor: { de: number; para: number; n: number; chave: string } | null = null;
    let melhorNota = -Infinity;
    for (const [de, para, n] of jogadasCompactas(p, atual.caixas, false)) {
      const chave = chaveCanonica(p, aplicarCompacto(atual.caixas, de, para, n));
      if (ruins.has(chave) || (visitas.get(chave) ?? 0) >= 2) continue;
      const v = nota(p, atual, de, para, ultima, vazias) + rng() * ruido;
      if (v > melhorNota) {
        melhorNota = v;
        melhor = { de, para, n, chave };
      }
    }
    if (!melhor) {
      if (desfeitas >= desfazer || historico.length === 0) return { venceu: false, jogadas, desfeitas };
      ruins.add(chaveCanonica(p, atual.caixas));
      const anterior = historico.pop()!;
      atual = anterior.tab;
      ultima = anterior.jogada;
      desfeitas++;
      continue;
    }
    historico.push({ tab: atual, jogada: ultima });
    atual = aplicar(atual, melhor.de, melhor.para, melhor.n);
    ultima = [melhor.de, melhor.para];
    visitas.set(melhor.chave, (visitas.get(melhor.chave) ?? 0) + 1);
    jogadas++;
  }
  return { venceu: true, jogadas, desfeitas };
}

export function simular(def: DefinicaoFase, opcoes: OpcoesSimulacao = {}): ResultadoSimulacao {
  const partidas = opcoes.partidas ?? 120;
  const ruido = opcoes.ruido ?? 30;
  const desfazer = opcoes.desfazer ?? 5;
  const minimas = opcoes.jogadasMinimas ?? def.solucao?.length ?? 20;
  const limite = opcoes.limiteJogadas ?? 4 * minimas + 25;
  const rng = criarAleatorio(opcoes.semente ?? 12345);
  const p = problemaDeDefinicao(def);
  const inicial: Tab = { caixas: p.caixas, ocultos: ocultosIniciais(def) };

  let falhas = 0;
  let somaJogadas = 0;
  let somaDesfazer = 0;
  let vitorias = 0;
  for (let i = 0; i < partidas; i++) {
    const r = partida(p, inicial, rng, ruido, desfazer, limite);
    if (r.venceu) {
      vitorias++;
      somaJogadas += r.jogadas;
    } else {
      falhas++;
    }
    somaDesfazer += r.desfeitas;
  }
  return {
    falha: falhas / partidas,
    mediaJogadas: vitorias > 0 ? somaJogadas / vitorias : 0,
    mediaDesfazer: somaDesfazer / partidas,
  };
}
