import { describe, expect, it } from 'vitest';
import { FIGURINHAS, PAGINAS, TOTAL_PECAS, ordemDasPecas, paginasCompletas, situacao } from '../src/jogo/album';
import { migrar, progressoNovo, VERSAO_SAVE } from '../src/jogo/progresso';
import { podeMostrarIntersticial, podeOferecerRecompensado } from '../src/jogo/servicos/anuncios';

describe('álbum', () => {
  it('tem 100 peças, uma por fase, e a primeira figurinha fecha na fase 8', () => {
    expect(TOTAL_PECAS).toBe(100);
    expect(situacao(7)).toEqual({ completas: 0, atual: 0, pecasNaAtual: 7 });
    expect(situacao(8)).toEqual({ completas: 1, atual: 1, pecasNaAtual: 0 });
    expect(situacao(100)).toEqual({ completas: 16, atual: null, pecasNaAtual: 0 });
  });

  it('páginas de 4 figurinhas com recompensa fixa e crescente', () => {
    expect(PAGINAS.flatMap((p) => p.figurinhas)).toEqual(FIGURINHAS.map((f) => f.numero));
    const r = PAGINAS.map((p) => p.recompensa);
    expect([...r].sort((a, b) => a - b)).toEqual(r);
    expect(paginasCompletas(25)).toEqual([]);
    expect(paginasCompletas(26)).toEqual([1]);
  });

  it('a ordem de revelação das peças é fixa e cobre todas', () => {
    for (let i = 0; i < FIGURINHAS.length; i++) {
      expect([...ordemDasPecas(i)].sort((a, b) => a - b)).toEqual(Array.from({ length: FIGURINHAS[i].pecas }, (_, k) => k));
      expect(ordemDasPecas(i)).toEqual(ordemDasPecas(i));
    }
  });
});

describe('regras de anúncio do plano', () => {
  const base = { fase: 20, venceu: true, fasesDesde: 3, ultimo: 1, agora: 1 + 181_000 };
  it('intersticial só depois de vitória e a partir da fase 15', () => {
    expect(podeMostrarIntersticial({ ...base, venceu: false })).toBe(false);
    expect(podeMostrarIntersticial({ ...base, fase: 14, ultimo: 0 })).toBe(false);
    expect(podeMostrarIntersticial({ ...base, fase: 15, ultimo: 0 })).toBe(true);
  });
  it('no máximo um a cada 3 fases e um a cada 3 minutos', () => {
    expect(podeMostrarIntersticial(base)).toBe(true);
    expect(podeMostrarIntersticial({ ...base, fasesDesde: 2 })).toBe(false);
    expect(podeMostrarIntersticial({ ...base, agora: base.ultimo + 179_000 })).toBe(false);
  });
  it('nenhum anúncio recompensado no tutorial', () => {
    expect(podeOferecerRecompensado(10)).toBe(false);
    expect(podeOferecerRecompensado(11)).toBe(true);
  });
});

describe('save', () => {
  it('save corrompido ou vazio vira progresso novo', () => {
    expect(migrar(null).fase).toBe(1);
    expect(migrar('lixo').versao).toBe(VERSAO_SAVE);
  });
  it('aproveita o que dá de um save antigo e corrige valores fora da faixa', () => {
    const s = migrar({ fase: 999, moedas: -5, pecas: 12.7, config: { som: false }, vistos: ['ocultos', 3] });
    expect(s.fase).toBe(101);
    expect(s.moedas).toBe(0);
    expect(s.pecas).toBe(12);
    expect(s.config).toEqual({ ...progressoNovo().config, som: false });
    expect(s.vistos).toEqual(['ocultos']);
  });
});
