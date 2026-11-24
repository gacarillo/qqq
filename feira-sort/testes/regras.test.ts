import { describe, expect, it } from 'vitest';
import {
  adicionarCaixaExtra,
  criarEstado,
  jogadasValidas,
  motivoInvalido,
  mover,
  paraTexto,
  podeSelecionar,
  semJogadas,
  venceu,
  type DefinicaoFase,
  type Estado,
} from '../src/logica/regras';
import {
  analisarEspaco,
  aplicarCompacto,
  jogadasCompactas,
  problemaDeDefinicao,
  problemaDeEstado,
  resolver,
} from '../src/logica/resolvedor';
import { criarAleatorio, embaralhar } from '../src/logica/aleatorio';
import { simular } from '../src/logica/simulador';

const fase = (caixas: string[], extra: Partial<DefinicaoFase> = {}): DefinicaoFase => ({
  id: 0,
  capacidade: 4,
  caixas,
  ...extra,
});

describe('criarEstado', () => {
  it('lê caixas do fundo para o topo e deixa o topo sempre visível', () => {
    const e = criarEstado(fase(['aaBb', 'BBAA', '', '']));
    expect(paraTexto(e)).toEqual(['aaBB', 'BBAA', '', '']);
    const ids = e.caixas.flatMap((c) => c.itens.map((i) => i.id));
    expect(new Set(ids).size).toBe(8);
  });

  it('recusa fase com quantidade errada de um tipo', () => {
    expect(() => criarEstado(fase(['AAA', 'B']))).toThrow(/tipo A tem 3/);
  });

  it('recusa caixa acima da capacidade', () => {
    expect(() => criarEstado(fase(['AAAAA'], { capacidade: 4 }))).toThrow(/capacidade/);
  });
});

describe('mover', () => {
  it('leva o item do topo e os iguais logo abaixo', () => {
    const e = criarEstado(fase(['ABB', 'BB', 'AAA']));
    const r = mover(e, 0, 1);
    expect(paraTexto(r.estado)).toEqual(['A', 'BBBB', 'AAA']);
    expect(r.movidos).toHaveLength(2);
    expect(r.completou).toBe(true);
  });

  it('jogada parcial quando falta espaço', () => {
    const e = criarEstado(fase(['ABBB', 'AAB', 'A']));
    const r = mover(e, 0, 1);
    expect(paraTexto(r.estado)).toEqual(['ABB', 'AABB', 'A']);
    expect(r.movidos).toHaveLength(1);
  });

  it('revela o item oculto que chega ao topo', () => {
    const e = criarEstado(fase(['aaBB', 'BBAA', '']));
    const r = mover(e, 0, 2);
    expect(paraTexto(r.estado)).toEqual(['aA', 'BBAA', 'BB']);
    expect(r.revelados).toHaveLength(1);
  });

  it('leva junto itens ocultos iguais e os revela', () => {
    const e = criarEstado(fase(['bbB', 'AAA', 'A', 'B', '']));
    // mover 0→4 leva os três B, dois deles ocultos
    const r = mover(e, 0, 4);
    expect(paraTexto(r.estado)).toEqual(['', 'AAA', 'A', 'B', 'BBB']);
    expect(r.revelados).toHaveLength(2);
  });

  it('não deixa mexer em caixa completa nem jogar em tipo diferente', () => {
    const e = criarEstado(fase(['AAAA', 'BB', 'B', 'B']));
    expect(motivoInvalido(e, 0, 1)).toBe('origem-completa');
    expect(motivoInvalido(e, 1, 0)).toBe('destino-cheio');
    expect(motivoInvalido(e, 1, 1)).toBe('mesma-caixa');
    const e2 = criarEstado(fase(['AB', 'BA', 'AB', 'BA']));
    expect(motivoInvalido(e2, 0, 1)).toBe('tipo-diferente');
  });

  it('caixa trancada só abre quando o tipo da chave fica completo', () => {
    const e = criarEstado(fase(['AAA', 'A', 'BB', 'BB'], { trancas: [{ caixa: 3, chave: 'A' }] }));
    expect(motivoInvalido(e, 3, 2)).toBe('origem-trancada');
    expect(motivoInvalido(e, 2, 3)).toBe('destino-trancado');
    expect(podeSelecionar(e, 3)).toBe(false);
    const r = mover(e, 1, 0);
    expect(r.destrancadas).toEqual([3]);
    expect(motivoInvalido(r.estado, 3, 2)).toBeNull();
  });

  it('vitória e travamento', () => {
    expect(venceu(criarEstado(fase(['AAAA', '', 'BBBB'])))).toBe(true);
    const travado = criarEstado(fase(['ABAB', 'BABA']));
    expect(semJogadas(travado)).toBe(true);
    expect(semJogadas(adicionarCaixaExtra(travado))).toBe(false);
  });
});

/** Estado aleatório: n tipos, embaralhados em caixas cheias, mais algumas vazias e trancas. */
function aleatorio(semente: number): DefinicaoFase {
  const rng = criarAleatorio(semente);
  const tipos = 2 + Math.floor(rng() * 4);
  const letras = 'ABCDEF'.slice(0, tipos);
  const itens = embaralhar(rng, [...letras.repeat(4)].map((l) => (rng() < 0.2 ? l.toLowerCase() : l)));
  const caixas: string[] = [];
  for (let i = 0; i < tipos; i++) caixas.push(itens.slice(i * 4, i * 4 + 4).join(''));
  caixas.push('', '');
  const trancas = rng() < 0.3 ? [{ caixa: 0, chave: letras[1] }] : undefined;
  return fase(caixas, { trancas });
}

describe('resolvedor usa exatamente as mesmas regras do jogo', () => {
  it('mesmas jogadas válidas e mesmos resultados em 300 estados aleatórios', () => {
    for (let s = 1; s <= 300; s++) {
      let e: Estado = criarEstado(aleatorio(s));
      const rng = criarAleatorio(s * 7);
      for (let passo = 0; passo < 12; passo++) {
        const p = problemaDeEstado(e);
        const doJogo = jogadasValidas(e).map(([a, b]) => `${a}>${b}`).sort();
        const compactas = jogadasCompactas(p, p.caixas, false);
        expect(compactas.map(([a, b]) => `${a}>${b}`).sort()).toEqual(doJogo);
        if (compactas.length === 0) break;
        const [de, para, n] = compactas[Math.floor(rng() * compactas.length)];
        const r = mover(e, de, para);
        expect(r.movidos.length).toBe(n);
        expect(problemaDeEstado(r.estado).caixas).toEqual(aplicarCompacto(p.caixas, de, para, n));
        e = r.estado;
      }
    }
  });
});

describe('resolver', () => {
  it('acha a solução mínima de fases pequenas', () => {
    expect(resolver(problemaDeDefinicao(fase(['AAA', 'A']))).solucao).toHaveLength(1);
    const r = resolver(problemaDeDefinicao(fase(['AABB', 'BBAA', ''])));
    expect(r.resolvivel).toBe(true);
    expect(r.exato).toBe(true);
    expect(r.solucao).toHaveLength(3);
  });

  it('prova quando não há solução', () => {
    const r = resolver(problemaDeDefinicao(fase(['ABAB', 'BABA'])));
    expect(r.resolvivel).toBe(false);
  });

  it('a solução encontrada vence quando jogada com as regras do jogo', () => {
    for (let s = 1; s <= 60; s++) {
      const def = aleatorio(1000 + s);
      const r = resolver(problemaDeDefinicao(def), { limiteNos: 50_000 });
      if (!r.solucao) continue;
      let e = criarEstado(def);
      for (const [de, para] of r.solucao) e = mover(e, de, para).estado;
      expect(venceu(e)).toBe(true);
    }
  });

  it('solução mínima nunca é maior que uma solução qualquer (peso 3)', () => {
    for (let s = 1; s <= 40; s++) {
      const p = problemaDeDefinicao(aleatorio(2000 + s));
      const exato = resolver(p, { limiteNos: 80_000 });
      const rapido = resolver(p, { limiteNos: 80_000, peso: 3 });
      if (exato.solucao && rapido.solucao) expect(exato.solucao.length).toBeLessThanOrEqual(rapido.solucao.length);
      if (exato.resolvivel !== null && rapido.resolvivel !== null) expect(rapido.resolvivel).toBe(exato.resolvivel);
    }
  });
});

describe('analisarEspaco', () => {
  it('fase de uma jogada não tem estado sem saída', () => {
    const a = analisarEspaco(problemaDeDefinicao(fase(['AAA', 'A'])));
    expect(a).toMatchObject({ completo: true, semSaida: 0, travados: 0 });
  });

  it('encontra estados sem saída', () => {
    const a = analisarEspaco(problemaDeDefinicao(fase(['ABAB', 'BABA'])));
    expect(a.semSaida).toBe(1);
    expect(a.travados).toBe(1);
  });
});

describe('jogador simulado', () => {
  it('nunca falha numa fase trivial e sempre falha numa impossível', () => {
    expect(simular(fase(['AAA', 'A']), { partidas: 30 }).falha).toBe(0);
    expect(simular(fase(['ABAB', 'BABA']), { partidas: 30 }).falha).toBe(1);
  });

  it('falha mais quando a fase tem menos caixas vazias', () => {
    const facil = fase(['ABCD', 'BCDA', 'CDAB', 'DABC', '', '']);
    const dificil = fase(['ABCD', 'BCDA', 'CDAB', 'DABC', '']);
    const f1 = simular(facil, { partidas: 80 }).falha;
    const f2 = simular(dificil, { partidas: 80 }).falha;
    expect(f2).toBeGreaterThanOrEqual(f1);
  });
});
