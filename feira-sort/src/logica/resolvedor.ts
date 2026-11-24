/**
 * Resolvedor de fases (A*) e análise do espaço de estados.
 *
 * Usa uma representação compacta (uma string por caixa, do fundo para o topo) e as mesmas regras de
 * `regras.ts`. Os testes conferem que as duas implementações aceitam e produzem exatamente as mesmas jogadas.
 *
 * Heurística admissível: h = quebras + excesso de fundos.
 * - quebras: pares vizinhos de tipos diferentes dentro das caixas;
 * - excesso de fundos: para cada tipo, (caixas cujo item do fundo é desse tipo) - 1.
 * Uma jogada reduz no máximo uma das duas parcelas em 1, então h nunca superestima e o A* com peso 1
 * devolve uma solução de tamanho mínimo.
 */
import type { DefinicaoFase, Estado } from './regras';
import { letraParaTipo, tipoParaLetra } from './regras';

export interface Problema {
  capacidade: number;
  /** Por caixa: -1 sem tranca, ou o tipo que abre a tranca. */
  chaves: number[];
  caixas: string[];
}

export interface ResultadoResolucao {
  /** true: tem solução; false: provado sem solução; null: o limite de nós acabou antes. */
  resolvivel: boolean | null;
  solucao: [number, number][] | null;
  /** A solução é comprovadamente a mais curta. */
  exato: boolean;
  nos: number;
}

export function problemaDeDefinicao(def: Pick<DefinicaoFase, 'capacidade' | 'caixas' | 'trancas'>): Problema {
  const chaves = def.caixas.map(() => -1);
  for (const t of def.trancas ?? []) chaves[t.caixa] = letraParaTipo(t.chave);
  return { capacidade: def.capacidade, chaves, caixas: def.caixas.map((c) => c.toUpperCase()) };
}

export function problemaDeEstado(estado: Estado): Problema {
  return {
    capacidade: estado.capacidade,
    chaves: estado.caixas.map((c) => (c.chave === null ? -1 : c.chave)),
    caixas: estado.caixas.map((c) => c.itens.map((i) => tipoParaLetra(i.tipo)).join('')),
  };
}

const A = 65;

function completa(s: string, cap: number): boolean {
  if (s.length !== cap) return false;
  const c = s.charCodeAt(0);
  for (let i = 1; i < s.length; i++) if (s.charCodeAt(i) !== c) return false;
  return true;
}

export function mascaraCompletos(caixas: readonly string[], cap: number): number {
  let m = 0;
  for (const s of caixas) if (completa(s, cap)) m |= 1 << (s.charCodeAt(0) - A);
  return m;
}

function trancada(chave: number, mascara: number): boolean {
  return chave >= 0 && ((mascara >> chave) & 1) === 0;
}

function sequenciaTopo(s: string): number {
  const n = s.length;
  if (n === 0) return 0;
  const c = s.charCodeAt(n - 1);
  let k = 1;
  while (k < n && s.charCodeAt(n - 1 - k) === c) k++;
  return k;
}

/**
 * Jogadas válidas no formato [origem, destino, quantidade].
 * Com `podar`, descarta jogadas equivalentes a outras (mover para a 2ª caixa vazia quando já existe uma 1ª)
 * e jogadas inúteis (levar uma caixa de um tipo só inteira para uma caixa vazia).
 */
export function jogadasCompactas(p: Problema, caixas: readonly string[], podar: boolean): [number, number, number][] {
  const cap = p.capacidade;
  const mascara = mascaraCompletos(caixas, cap);
  const res: [number, number, number][] = [];
  let primeiraVazia = -1;
  if (podar) {
    for (let i = 0; i < caixas.length; i++) {
      if (caixas[i].length === 0 && !trancada(p.chaves[i], mascara)) {
        primeiraVazia = i;
        break;
      }
    }
  }
  for (let de = 0; de < caixas.length; de++) {
    const o = caixas[de];
    if (o.length === 0 || trancada(p.chaves[de], mascara) || completa(o, cap)) continue;
    const tipo = o.charCodeAt(o.length - 1);
    const seq = sequenciaTopo(o);
    const origemUniforme = seq === o.length;
    for (let para = 0; para < caixas.length; para++) {
      if (para === de) continue;
      const d = caixas[para];
      if (d.length >= cap || trancada(p.chaves[para], mascara)) continue;
      if (d.length === 0) {
        if (podar && (para !== primeiraVazia || origemUniforme)) continue;
      } else if (d.charCodeAt(d.length - 1) !== tipo) {
        continue;
      }
      res.push([de, para, Math.min(seq, cap - d.length)]);
    }
  }
  return res;
}

export function aplicarCompacto(caixas: readonly string[], de: number, para: number, n: number): string[] {
  const nova = caixas.slice();
  const o = caixas[de];
  nova[de] = o.slice(0, o.length - n);
  nova[para] = caixas[para] + o.slice(o.length - n);
  return nova;
}

export function venceuCompacto(p: Problema, caixas: readonly string[]): boolean {
  for (const s of caixas) if (s.length > 0 && !completa(s, p.capacidade)) return false;
  return true;
}

/** Chave canônica: caixas com o mesmo conteúdo (e a mesma tranca ativa) são intercambiáveis. */
export function chaveCanonica(p: Problema, caixas: readonly string[]): string {
  const mascara = mascaraCompletos(caixas, p.capacidade);
  const partes = caixas.map((s, i) => (trancada(p.chaves[i], mascara) ? `#${tipoParaLetra(p.chaves[i])}:${s}` : s));
  partes.sort();
  return partes.join('|');
}

export function heuristica(caixas: readonly string[]): number {
  let quebras = 0;
  const fundos = new Map<number, number>();
  for (const s of caixas) {
    if (s.length === 0) continue;
    for (let i = 1; i < s.length; i++) if (s.charCodeAt(i) !== s.charCodeAt(i - 1)) quebras++;
    const f = s.charCodeAt(0);
    fundos.set(f, (fundos.get(f) ?? 0) + 1);
  }
  let excesso = 0;
  for (const n of fundos.values()) excesso += n - 1;
  return quebras + excesso;
}

/** Fila de prioridade mínima (heap binário) sobre índices de nós. */
class Fila {
  private heap: number[] = [];
  constructor(private readonly prioridade: (no: number) => number) {}
  get tamanho(): number {
    return this.heap.length;
  }
  inserir(no: number): void {
    const h = this.heap;
    h.push(no);
    let i = h.length - 1;
    const p = this.prioridade(no);
    while (i > 0) {
      const pai = (i - 1) >> 1;
      if (this.prioridade(h[pai]) <= p) break;
      h[i] = h[pai];
      i = pai;
    }
    h[i] = no;
  }
  retirar(): number {
    const h = this.heap;
    const topo = h[0];
    const ultimo = h.pop()!;
    if (h.length > 0) {
      let i = 0;
      const p = this.prioridade(ultimo);
      for (;;) {
        const e = 2 * i + 1;
        if (e >= h.length) break;
        const d = e + 1;
        const filho = d < h.length && this.prioridade(h[d]) < this.prioridade(h[e]) ? d : e;
        if (this.prioridade(h[filho]) >= p) break;
        h[i] = h[filho];
        i = filho;
      }
      h[i] = ultimo;
    }
    return topo;
  }
}

export interface OpcoesResolucao {
  /** Máximo de estados expandidos antes de desistir (resultado `resolvivel: null`). */
  limiteNos?: number;
  /** 1 = A* exato. Acima de 1 encontra uma solução mais rápido, mas sem garantia de ser a mais curta. */
  peso?: number;
}

export function resolver(p: Problema, opcoes: OpcoesResolucao = {}): ResultadoResolucao {
  const limite = opcoes.limiteNos ?? 200_000;
  const peso = opcoes.peso ?? 1;

  const estados: string[][] = [];
  const g: number[] = [];
  const f: number[] = [];
  const pai: number[] = [];
  const jogada: number[] = []; // de * 64 + para
  const melhorG = new Map<string, number>();
  const fila = new Fila((no) => f[no] * 1024 - g[no]); // desempate: mais fundo primeiro

  const criar = (caixas: string[], custo: number, origem: number, mov: number) => {
    const id = estados.length;
    estados.push(caixas);
    g.push(custo);
    f.push(custo + peso * heuristica(caixas));
    pai.push(origem);
    jogada.push(mov);
    fila.inserir(id);
  };

  criar(p.caixas.slice(), 0, -1, -1);
  melhorG.set(chaveCanonica(p, p.caixas), 0);
  let expandidos = 0;

  while (fila.tamanho > 0) {
    const no = fila.retirar();
    const caixas = estados[no];
    const chave = chaveCanonica(p, caixas);
    if ((melhorG.get(chave) ?? Infinity) < g[no]) continue;
    if (venceuCompacto(p, caixas)) {
      const solucao: [number, number][] = [];
      for (let n = no; pai[n] !== -1; n = pai[n]) solucao.push([Math.floor(jogada[n] / 64), jogada[n] % 64]);
      solucao.reverse();
      return { resolvivel: true, solucao, exato: peso === 1, nos: expandidos };
    }
    if (++expandidos > limite) return { resolvivel: null, solucao: null, exato: false, nos: expandidos };
    for (const [de, para, n] of jogadasCompactas(p, caixas, true)) {
      const filho = aplicarCompacto(caixas, de, para, n);
      const k = chaveCanonica(p, filho);
      const custo = g[no] + 1;
      if ((melhorG.get(k) ?? Infinity) <= custo) continue;
      melhorG.set(k, custo);
      criar(filho, custo, no, de * 64 + para);
    }
  }
  return { resolvivel: false, solucao: null, exato: true, nos: expandidos };
}

/** Tenta primeiro o mínimo exato e, se o limite estourar, uma solução qualquer (A* com peso). */
export function resolverComFolga(p: Problema, limiteNos = 150_000): ResultadoResolucao {
  const exato = resolver(p, { limiteNos, peso: 1 });
  if (exato.resolvivel !== null) return exato;
  const rapido = resolver(p, { limiteNos: limiteNos * 2, peso: 3 });
  return { ...rapido, nos: exato.nos + rapido.nos };
}

export interface AnaliseEspaco {
  /** Explorou todos os estados alcançáveis (senão os números são parciais). */
  completo: boolean;
  estados: number;
  /** Estados sem nenhuma jogada válida que não são vitória. */
  travados: number;
  /** Estados a partir dos quais não dá mais para vencer (inclui os travados). */
  semSaida: number;
}

/** Explora todo o espaço de estados de uma fase pequena (para provar, por exemplo, que é impossível perder). */
export function analisarEspaco(p: Problema, limite = 200_000): AnaliseEspaco {
  const indice = new Map<string, number>();
  const fila: string[][] = [];
  const reverso: number[][] = [];
  const vitoria: boolean[] = [];
  let travados = 0;

  const visitar = (caixas: string[]): number => {
    const k = chaveCanonica(p, caixas);
    let id = indice.get(k);
    if (id === undefined) {
      id = fila.length;
      indice.set(k, id);
      fila.push(caixas);
      reverso.push([]);
      vitoria.push(venceuCompacto(p, caixas));
    }
    return id;
  };

  visitar(p.caixas.slice());
  let completo = true;
  for (let i = 0; i < fila.length; i++) {
    if (fila.length > limite) {
      completo = false;
      break;
    }
    if (vitoria[i]) continue;
    const jogadas = jogadasCompactas(p, fila[i], true);
    if (jogadas.length === 0) travados++;
    for (const [de, para, n] of jogadas) {
      const filho = visitar(aplicarCompacto(fila[i], de, para, n));
      reverso[filho].push(i);
    }
  }

  // Quem alcança uma vitória: busca para trás a partir das vitórias.
  const alcanca = new Uint8Array(fila.length);
  const pilha: number[] = [];
  vitoria.forEach((v, i) => {
    if (v) {
      alcanca[i] = 1;
      pilha.push(i);
    }
  });
  while (pilha.length > 0) {
    const s = pilha.pop()!;
    for (const anterior of reverso[s]) {
      if (!alcanca[anterior]) {
        alcanca[anterior] = 1;
        pilha.push(anterior);
      }
    }
  }
  let semSaida = 0;
  for (let i = 0; i < fila.length; i++) if (!alcanca[i]) semSaida++;
  return { completo, estados: fila.length, travados, semSaida };
}
