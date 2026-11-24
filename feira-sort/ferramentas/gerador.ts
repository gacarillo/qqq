/**
 * Gerador de fases: embaralha os itens, confere com o resolvedor que existe solução, mede a solução mínima
 * e estima a taxa de falha com o jogador simulado.
 *
 * O plano sugeria embaralhar a partir do tabuleiro resolvido com jogadas ao contrário. Aqui o embaralhamento
 * é livre (fica com cara mais natural) e quem garante a solução é o resolvedor: fase sem solução comprovada
 * é descartada, então nenhuma fase injusta entra no jogo.
 */
import { criarAleatorio, embaralhar, sementeDeTexto, type Aleatorio } from '../src/logica/aleatorio';
import type { DefinicaoFase, InfoFase } from '../src/logica/regras';
import { problemaDeDefinicao, resolverComFolga } from '../src/logica/resolvedor';
import { simular } from '../src/logica/simulador';

export interface Parametros {
  tipos: number;
  /** Caixas vazias no começo. */
  vazias: number;
  /** 'cheias': uma caixa cheia por tipo. 'irregular': itens espalhados em caixas de alturas diferentes. */
  distribuicao: 'cheias' | 'irregular';
  /** Só para 'irregular': quantas caixas a mais que o número de tipos. */
  caixasExtras?: number;
  /** Fração dos itens fora do topo que começam ocultos. */
  ocultos: number;
  tranca: boolean;
}

function distribuir(rng: Aleatorio, itens: string[], caixas: number, capacidade: number): string[] {
  const alturas = new Array<number>(caixas).fill(0);
  for (let i = 0; i < itens.length; i++) {
    const livres: number[] = [];
    alturas.forEach((a, k) => a < capacidade && livres.push(k));
    alturas[livres[Math.floor(rng() * livres.length)]]++;
  }
  const res: string[] = [];
  let k = 0;
  for (const a of alturas) {
    res.push(itens.slice(k, k + a).join(''));
    k += a;
  }
  return res;
}

const completa = (s: string, cap: number) => s.length === cap && [...s].every((c) => c === s[0]);

/** Monta uma fase candidata (ainda sem saber se tem solução). */
export function montarCandidata(p: Parametros, letras: string[], semente: number, capacidade = 4): DefinicaoFase | null {
  const rng = criarAleatorio(semente);
  const itens = embaralhar(rng, letras.flatMap((l) => new Array<string>(capacidade).fill(l)));
  let caixas =
    p.distribuicao === 'cheias'
      ? letras.map((_, i) => itens.slice(i * capacidade, (i + 1) * capacidade).join(''))
      : distribuir(rng, itens, letras.length + (p.caixasExtras ?? 1), capacidade);
  if (caixas.some((c) => completa(c, capacidade))) return null;
  caixas = caixas.filter((c) => c.length > 0);
  for (let v = 0; v < p.vazias; v++) caixas.push('');

  if (p.ocultos > 0) {
    let algum = false;
    caixas = caixas.map((c) =>
      [...c]
        .map((l, i) => {
          if (i < c.length - 1 && rng() < p.ocultos) {
            algum = true;
            return l.toLowerCase();
          }
          return l;
        })
        .join(''),
    );
    if (!algum) return null;
  }

  const def: DefinicaoFase = { id: 0, capacidade, caixas };
  if (p.tranca) {
    // Tranca uma caixa cheia; a chave é um tipo que não está dentro dela (senão nunca abriria).
    const opcoes = caixas
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.length >= 2)
      .flatMap(({ c, i }) => letras.filter((l) => !c.toUpperCase().includes(l)).map((l) => ({ i, l })));
    if (opcoes.length === 0) return null;
    const escolha = opcoes[Math.floor(rng() * opcoes.length)];
    def.trancas = [{ caixa: escolha.i, chave: escolha.l }];
  }
  return def;
}

export interface Avaliacao {
  def: DefinicaoFase;
  info: InfoFase;
}

/** Resolve e simula. Devolve null se a fase não tem solução comprovada. */
export function avaliar(def: DefinicaoFase, partidas = 120): Avaliacao | null {
  const r = resolverComFolga(problemaDeDefinicao(def));
  if (!r.solucao) return null;
  const comSolucao: DefinicaoFase = { ...def, solucao: r.solucao };
  const sim = simular(comSolucao, {
    partidas,
    semente: sementeDeTexto(def.caixas.join('|')),
    jogadasMinimas: r.solucao.length,
  });
  const ocultos = def.caixas.reduce((n, c) => n + [...c].filter((l) => l !== l.toUpperCase()).length, 0);
  const tipos = new Set(def.caixas.join('').toUpperCase()).size;
  return {
    def: comSolucao,
    info: {
      tipos,
      caixas: def.caixas.length,
      vazias: def.caixas.filter((c) => c.length === 0).length,
      ocultos,
      trancas: def.trancas?.length ?? 0,
      jogadasMinimas: r.solucao.length,
      minimoExato: r.exato,
      falhaSimulada: Math.round(sim.falha * 1000) / 1000,
    },
  };
}
