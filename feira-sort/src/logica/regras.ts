/**
 * Regras do tabuleiro, sem nada visual.
 *
 * - Cada caixa guarda até `capacidade` itens, do fundo (índice 0) para o topo.
 * - Um toque numa caixa pega o item do topo e todos os itens iguais logo abaixo dele.
 * - Os itens só podem ir para uma caixa vazia ou cujo topo seja do mesmo tipo.
 *   Se não couber tudo, vai o que couber.
 * - Uma caixa cheia de um tipo só está completa e não pode mais ser mexida.
 * - Uma caixa trancada só abre quando o tipo da chave dela estiver completo em outra caixa.
 * - Itens ocultos aparecem quando chegam ao topo ou quando são movidos.
 * - A fase termina quando toda caixa está vazia ou completa.
 *
 * O estado é imutável: `mover` devolve um estado novo, o que deixa o desfazer trivial.
 */

export interface Item {
  readonly id: number;
  readonly tipo: number;
  readonly oculto: boolean;
}

export interface Caixa {
  readonly itens: readonly Item[];
  /** Tipo que precisa estar completo para a caixa abrir, ou null se ela não tem tranca. */
  readonly chave: number | null;
}

export interface Estado {
  readonly capacidade: number;
  readonly caixas: readonly Caixa[];
}

/** Formato da fase em JSON, independente de engine. */
export interface DefinicaoFase {
  id: number;
  capacidade: number;
  /** Uma string por caixa, do fundo para o topo. Letra maiúscula = item visível, minúscula = oculto. */
  caixas: string[];
  /** Caixas trancadas: índice da caixa e a letra do tipo que abre a tranca. */
  trancas?: { caixa: number; chave: string }[];
  /** Uma solução curta, como pares [origem, destino]. Serve para dica e para os testes. */
  solucao?: [number, number][];
  info?: InfoFase;
}

export interface InfoFase {
  tipos: number;
  caixas: number;
  vazias: number;
  ocultos: number;
  trancas: number;
  jogadasMinimas: number;
  /** true quando `jogadasMinimas` foi provado mínimo pelo resolvedor. */
  minimoExato: boolean;
  /** Fração das partidas simuladas que travaram ou desistiram. */
  falhaSimulada: number;
  papel?: string;
}

export type MotivoInvalido =
  | 'mesma-caixa'
  | 'origem-vazia'
  | 'origem-completa'
  | 'origem-trancada'
  | 'destino-trancado'
  | 'destino-cheio'
  | 'tipo-diferente';

export interface ResultadoMovimento {
  estado: Estado;
  /** Itens que saíram da origem, na ordem em que chegam ao destino (de baixo para cima). */
  movidos: Item[];
  /** Ids dos itens que deixaram de ser ocultos com esta jogada. */
  revelados: number[];
  /** A caixa de destino ficou completa com esta jogada. */
  completou: boolean;
  /** Índices das caixas que destrancaram com esta jogada. */
  destrancadas: number[];
}

const CODIGO_A = 'A'.charCodeAt(0);

export function letraParaTipo(letra: string): number {
  const t = letra.toUpperCase().charCodeAt(0) - CODIGO_A;
  if (t < 0 || t > 25 || Number.isNaN(t)) throw new Error(`Letra de tipo inválida: "${letra}"`);
  return t;
}

export function tipoParaLetra(tipo: number): string {
  return String.fromCharCode(CODIGO_A + tipo);
}

/** Monta o estado inicial de uma fase. Os itens do topo começam sempre visíveis. */
export function criarEstado(def: DefinicaoFase): Estado {
  let proximoId = 0;
  const chaves = new Map<number, number>();
  for (const t of def.trancas ?? []) chaves.set(t.caixa, letraParaTipo(t.chave));
  const caixas: Caixa[] = def.caixas.map((texto, indice) => {
    const itens: Item[] = [...texto].map((letra, posicao) => ({
      id: proximoId++,
      tipo: letraParaTipo(letra),
      oculto: letra !== letra.toUpperCase() && posicao !== texto.length - 1,
    }));
    if (itens.length > def.capacidade) {
      throw new Error(`Fase ${def.id}: caixa ${indice} tem ${itens.length} itens, mais que a capacidade ${def.capacidade}`);
    }
    return { itens, chave: chaves.get(indice) ?? null };
  });
  validarContagem(def.id, caixas, def.capacidade);
  return { capacidade: def.capacidade, caixas };
}

function validarContagem(id: number, caixas: readonly Caixa[], capacidade: number): void {
  const contagem = new Map<number, number>();
  for (const c of caixas) for (const i of c.itens) contagem.set(i.tipo, (contagem.get(i.tipo) ?? 0) + 1);
  for (const [tipo, n] of contagem) {
    if (n !== capacidade) {
      throw new Error(`Fase ${id}: o tipo ${tipoParaLetra(tipo)} tem ${n} itens, deveria ter ${capacidade}`);
    }
  }
}

export function topo(caixa: Caixa): Item | undefined {
  return caixa.itens[caixa.itens.length - 1];
}

/** Quantos itens iguais ao do topo estão empilhados seguidos, a partir do topo. */
export function tamanhoSequenciaTopo(caixa: Caixa): number {
  const itens = caixa.itens;
  if (itens.length === 0) return 0;
  const tipo = itens[itens.length - 1].tipo;
  let n = 0;
  for (let i = itens.length - 1; i >= 0 && itens[i].tipo === tipo; i--) n++;
  return n;
}

export function estaCompleta(caixa: Caixa, capacidade: number): boolean {
  if (caixa.itens.length !== capacidade) return false;
  const tipo = caixa.itens[0].tipo;
  return caixa.itens.every((i) => i.tipo === tipo);
}

export function tiposCompletos(estado: Estado): Set<number> {
  const completos = new Set<number>();
  for (const c of estado.caixas) if (estaCompleta(c, estado.capacidade)) completos.add(c.itens[0].tipo);
  return completos;
}

export function estaTrancada(caixa: Caixa, completos: ReadonlySet<number>): boolean {
  return caixa.chave !== null && !completos.has(caixa.chave);
}

/** Por que a jogada não pode ser feita, ou null se ela é válida. */
export function motivoInvalido(
  estado: Estado,
  de: number,
  para: number,
  completos: ReadonlySet<number> = tiposCompletos(estado),
): MotivoInvalido | null {
  if (de === para) return 'mesma-caixa';
  const origem = estado.caixas[de];
  const destino = estado.caixas[para];
  if (origem.itens.length === 0) return 'origem-vazia';
  if (estaTrancada(origem, completos)) return 'origem-trancada';
  if (estaCompleta(origem, estado.capacidade)) return 'origem-completa';
  if (estaTrancada(destino, completos)) return 'destino-trancado';
  if (destino.itens.length >= estado.capacidade) return 'destino-cheio';
  const t = topo(destino);
  if (t && t.tipo !== topo(origem)!.tipo) return 'tipo-diferente';
  return null;
}

export function podeMover(estado: Estado, de: number, para: number): boolean {
  return motivoInvalido(estado, de, para) === null;
}

/** Quantos itens a jogada leva (0 se ela não é válida). */
export function quantidadeMovida(estado: Estado, de: number, para: number): number {
  if (!podeMover(estado, de, para)) return 0;
  const livre = estado.capacidade - estado.caixas[para].itens.length;
  return Math.min(tamanhoSequenciaTopo(estado.caixas[de]), livre);
}

/** Uma caixa pode ser selecionada (tem itens, não está completa nem trancada). */
export function podeSelecionar(estado: Estado, indice: number): boolean {
  const caixa = estado.caixas[indice];
  if (!caixa || caixa.itens.length === 0) return false;
  if (estaCompleta(caixa, estado.capacidade)) return false;
  return !estaTrancada(caixa, tiposCompletos(estado));
}

export function mover(estado: Estado, de: number, para: number): ResultadoMovimento {
  const completosAntes = tiposCompletos(estado);
  const motivo = motivoInvalido(estado, de, para, completosAntes);
  if (motivo) throw new Error(`Jogada inválida ${de}→${para}: ${motivo}`);

  const n = quantidadeMovida(estado, de, para);
  const origem = estado.caixas[de].itens;
  const revelados: number[] = [];
  const movidos = origem.slice(origem.length - n).map((item) => {
    if (!item.oculto) return item;
    revelados.push(item.id);
    return { ...item, oculto: false };
  });

  const caixas = estado.caixas.map((c) => ({ itens: [...c.itens], chave: c.chave }));
  caixas[de].itens.length -= n;
  caixas[para].itens.push(...movidos);

  // O item que ficou no topo de cada caixa passa a ser visível.
  for (const c of caixas) {
    const i = c.itens.length - 1;
    if (i >= 0 && c.itens[i].oculto) {
      revelados.push(c.itens[i].id);
      c.itens[i] = { ...c.itens[i], oculto: false };
    }
  }

  const novo: Estado = { capacidade: estado.capacidade, caixas };
  const completosDepois = tiposCompletos(novo);
  const destrancadas: number[] = [];
  caixas.forEach((c, i) => {
    if (estaTrancada(c, completosAntes) && !estaTrancada(c, completosDepois)) destrancadas.push(i);
  });

  return {
    estado: novo,
    movidos,
    revelados,
    completou: estaCompleta(caixas[para], estado.capacidade),
    destrancadas,
  };
}

export function venceu(estado: Estado): boolean {
  return estado.caixas.every((c) => c.itens.length === 0 || estaCompleta(c, estado.capacidade));
}

export function jogadasValidas(estado: Estado): [number, number][] {
  const completos = tiposCompletos(estado);
  const jogadas: [number, number][] = [];
  for (let de = 0; de < estado.caixas.length; de++) {
    for (let para = 0; para < estado.caixas.length; para++) {
      if (motivoInvalido(estado, de, para, completos) === null) jogadas.push([de, para]);
    }
  }
  return jogadas;
}

/** Não venceu e não existe nenhuma jogada válida. */
export function semJogadas(estado: Estado): boolean {
  return !venceu(estado) && jogadasValidas(estado).length === 0;
}

export function adicionarCaixaExtra(estado: Estado): Estado {
  return { capacidade: estado.capacidade, caixas: [...estado.caixas, { itens: [], chave: null }] };
}

/** Converte o estado de volta para o formato de texto (útil em testes e depuração). */
export function paraTexto(estado: Estado): string[] {
  return estado.caixas.map((c) =>
    c.itens.map((i) => (i.oculto ? tipoParaLetra(i.tipo).toLowerCase() : tipoParaLetra(i.tipo))).join(''),
  );
}

export function contarTipos(def: DefinicaoFase): number {
  const tipos = new Set<string>();
  for (const c of def.caixas) for (const l of c) tipos.add(l.toUpperCase());
  return tipos.size;
}
