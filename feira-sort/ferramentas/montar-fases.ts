/**
 * Monta as 100 fases do jogo e um banco de fases reserva.
 *
 *   npm run fases
 *
 * Saídas:
 * - src/dados/fases.json: as fases na ordem do jogo, cada uma com solução e métricas.
 * - ferramentas/saida/banco.json: outras fases válidas, com nota, para trocar uma fase ruim depois
 *   ("Suavizar aquela fase ou trocar por outra do banco", seção Regras de decisão do plano).
 *
 * É determinístico: rodar de novo gera exatamente as mesmas fases.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarAleatorio, embaralhar, inteiro } from '../src/logica/aleatorio';
import type { DefinicaoFase } from '../src/logica/regras';
import { analisarEspaco, problemaDeDefinicao } from '../src/logica/resolvedor';
import { frutaEstreante, frutasDisponiveis, vaga, type Vaga } from './curva';
import { avaliar, montarCandidata, type Avaliacao } from './gerador';
import { TUTORIAL } from './tutorial';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOTAL = 100;
const TENTATIVAS = 90;
const PARTIDAS_FINAIS = 400;

function escolherLetras(v: Vaga, tipos: number, rng: () => number): string[] {
  const pool = frutasDisponiveis(v.fase);
  const nova = frutaEstreante(v.fase);
  const resto = embaralhar(rng, pool.filter((l) => l !== nova));
  const letras = nova ? [nova, ...resto] : resto;
  return letras.slice(0, Math.min(tipos, pool.length)).sort();
}

function preencherVaga(v: Vaga, banco: Avaliacao[]): Avaliacao {
  let melhor: Avaliacao | null = null;
  let melhorDist = Infinity;
  for (let t = 0; t < TENTATIVAS; t++) {
    const semente = v.fase * 10_007 + t * 97;
    const rng = criarAleatorio(semente);
    const tipos = inteiro(rng, v.tipos[0], v.tipos[1]);
    const def = montarCandidata(
      { tipos, vazias: v.vazias, distribuicao: v.distribuicao, caixasExtras: v.caixasExtras, ocultos: v.ocultos, tranca: v.tranca },
      escolherLetras(v, tipos, rng),
      semente,
    );
    if (!def) continue;
    const av = avaliar(def);
    if (!av || av.info.jogadasMinimas > v.maxJogadas) continue;
    const dist = Math.abs(av.info.falhaSimulada - v.alvoFalha);
    if (dist < melhorDist) {
      if (melhor) banco.push(melhor);
      melhor = av;
      melhorDist = dist;
    } else {
      banco.push(av);
    }
    if (dist <= v.tolerancia / 2) break;
  }
  if (!melhor) throw new Error(`Nenhuma fase válida para a vaga ${v.fase}`);
  return melhor;
}

function principal(): void {
  const inicio = Date.now();
  const fases: DefinicaoFase[] = [];
  const banco: Avaliacao[] = [];

  TUTORIAL.forEach((t, i) => {
    const av = avaliar({ id: i + 1, capacidade: 4, caixas: t.caixas }, PARTIDAS_FINAIS);
    if (!av) throw new Error(`Fase de tutorial ${i + 1} sem solução`);
    const espaco = analisarEspaco(problemaDeDefinicao(av.def));
    if (espaco.semSaida > 0) throw new Error(`Fase de tutorial ${i + 1} tem ${espaco.semSaida} estados sem saída`);
    fases.push({ ...av.def, id: i + 1, info: { ...av.info, papel: 'tutorial' } });
  });

  for (let n = TUTORIAL.length + 1; n <= TOTAL; n++) {
    const v = vaga(n);
    const escolhida = preencherVaga(v, banco);
    const final = avaliar(escolhida.def, PARTIDAS_FINAIS) ?? escolhida;
    fases.push({ ...final.def, id: n, info: { ...final.info, papel: v.papel } });
    const i = final.info;
    console.log(
      `fase ${String(n).padStart(3)} ${v.papel.padEnd(12)} alvo ${v.alvoFalha.toFixed(2)} → ${i.falhaSimulada.toFixed(2)}` +
        `  tipos ${i.tipos}  caixas ${i.caixas}  ocultos ${i.ocultos}  trancas ${i.trancas}  jogadas ${i.jogadasMinimas}${i.minimoExato ? '' : '*'}`,
    );
  }

  const saidaFases = join(raiz, 'src/dados/fases.json');
  mkdirSync(dirname(saidaFases), { recursive: true });
  writeFileSync(saidaFases, JSON.stringify({ versao: 1, capacidade: 4, fases }, null, 1) + '\n');

  // Banco de reserva: as melhores candidatas que sobraram, organizadas por nota (falha simulada).
  const reserva = banco
    .filter((a) => a.info.jogadasMinimas <= 40)
    .sort((a, b) => a.info.falhaSimulada - b.info.falhaSimulada)
    .filter((_, i, l) => l.length <= 400 || i % Math.ceil(l.length / 400) === 0)
    .map((a, i) => ({ ...a.def, id: 1000 + i, info: a.info }));
  const saidaBanco = join(raiz, 'ferramentas/saida/banco.json');
  mkdirSync(dirname(saidaBanco), { recursive: true });
  writeFileSync(saidaBanco, JSON.stringify({ versao: 1, fases: reserva }, null, 1) + '\n');

  console.log(`\n${fases.length} fases em src/dados/fases.json, ${reserva.length} no banco de reserva.`);
  console.log(`Tempo: ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
}

principal();
