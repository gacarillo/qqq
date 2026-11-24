import { describe, expect, it } from 'vitest';
import dados from '../src/dados/fases.json';
import { criarEstado, estaCompleta, mover, venceu, type DefinicaoFase } from '../src/logica/regras';
import { analisarEspaco, problemaDeDefinicao, resolver } from '../src/logica/resolvedor';
import { ESTREIA_FRUTAS } from '../ferramentas/curva';

const fases = dados.fases as DefinicaoFase[];

describe('fases do jogo', () => {
  it('são 100, numeradas de 1 a 100', () => {
    expect(fases.map((f) => f.id)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });

  it('toda fase tem solução: a solução guardada vence quando jogada com as regras do jogo', () => {
    for (const f of fases) {
      let e = criarEstado(f);
      for (const [de, para] of f.solucao!) e = mover(e, de, para).estado;
      expect(venceu(e), `fase ${f.id}`).toBe(true);
      expect(f.solucao!.length).toBe(f.info!.jogadasMinimas);
    }
  });

  it('nenhuma fase começa com caixa já completa e todas cabem na tela (até 12 caixas)', () => {
    for (const f of fases) {
      const e = criarEstado(f);
      expect(e.caixas.some((c) => estaCompleta(c, e.capacidade)), `fase ${f.id}`).toBe(false);
      expect(f.caixas.length, `fase ${f.id}`).toBeLessThanOrEqual(12);
    }
  });

  it('fases 1 a 10 não têm nenhum estado sem saída (é impossível perder)', () => {
    for (const f of fases.slice(0, 10)) {
      const a = analisarEspaco(problemaDeDefinicao(f));
      expect(a.completo).toBe(true);
      expect(a.semSaida, `fase ${f.id}`).toBe(0);
    }
  });

  it('a fase 1 se resolve com uma jogada', () => {
    expect(resolver(problemaDeDefinicao(fases[0])).solucao).toHaveLength(1);
  });

  it('segue a curva do plano: hábito até 10%, picos a cada 5 fases com recuperação depois', () => {
    const falha = (n: number) => fases[n - 1].info!.falhaSimulada;
    for (let n = 11; n <= 35; n++) expect(falha(n), `fase ${n}`).toBeLessThanOrEqual(0.13);
    for (let pico = 40; pico <= 100; pico += 5) {
      expect(falha(pico), `pico ${pico}`).toBeGreaterThanOrEqual(0.25);
      expect(falha(pico + 1 > 100 ? pico : pico + 1)).toBeLessThanOrEqual(pico === 100 ? 1 : 0.12);
    }
    expect(falha(100)).toBeGreaterThanOrEqual(0.5);
  });

  it('itens ocultos estreiam na fase 36 e caixas trancadas na 61', () => {
    const temOculto = (f: DefinicaoFase) => f.caixas.some((c) => c !== c.toUpperCase());
    expect(fases.slice(0, 35).some(temOculto)).toBe(false);
    expect(temOculto(fases[35])).toBe(true);
    expect(fases.slice(0, 60).some((f) => f.trancas?.length)).toBe(false);
    expect(fases[60].trancas).toHaveLength(1);
  });

  it('cada fruta estreia na fase prevista', () => {
    for (const [letra, estreia] of Object.entries(ESTREIA_FRUTAS)) {
      const primeira = fases.find((f) => f.caixas.join('').toUpperCase().includes(letra));
      expect(primeira?.id, `fruta ${letra}`).toBe(estreia);
    }
  });
});
