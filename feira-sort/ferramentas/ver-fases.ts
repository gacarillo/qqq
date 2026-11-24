/**
 * Mostra as fases para revisão à mão (o plano pede jogar e escolher à mão os picos e as 30 primeiras).
 *
 *   npm run fases:ver          tabela com todas as fases
 *   npm run fases:ver -- 40    desenha a fase 40 e a solução dela
 */
import dados from '../src/dados/fases.json';
import type { DefinicaoFase } from '../src/logica/regras';

const fases = dados.fases as DefinicaoFase[];
const numero = Number(process.argv[2]);

if (!numero) {
  console.log('fase  papel        falha  tipos caixas ocultos trancas jogadas');
  for (const f of fases) {
    const i = f.info!;
    console.log(
      `${String(f.id).padStart(4)}  ${(i.papel ?? '').padEnd(12)} ${(i.falhaSimulada * 100).toFixed(0).padStart(4)}%` +
        `  ${String(i.tipos).padStart(5)} ${String(i.caixas).padStart(6)} ${String(i.ocultos).padStart(7)} ${String(i.trancas).padStart(7)} ${String(i.jogadasMinimas).padStart(7)}`,
    );
  }
} else {
  const f = fases.find((x) => x.id === numero);
  if (!f) throw new Error(`Fase ${numero} não existe`);
  const cap = f.capacidade;
  console.log(`Fase ${f.id} (${f.info?.papel}), falha simulada ${((f.info?.falhaSimulada ?? 0) * 100).toFixed(0)}%`);
  console.log('Minúscula = oculto, # = trancada (abre com a letra ao lado)\n');
  for (let linha = cap - 1; linha >= 0; linha--) {
    console.log(f.caixas.map((c) => `[${c[linha] ?? ' '}]`).join(' '));
  }
  console.log(f.caixas.map((_, i) => ` ${i} `.padEnd(3)).join(' '));
  for (const t of f.trancas ?? []) console.log(`\nCaixa ${t.caixa} trancada, abre quando ${t.chave} estiver completo`);
  console.log(`\nSolução (${f.solucao?.length} jogadas): ${f.solucao?.map(([a, b]) => `${a}→${b}`).join('  ')}`);
}
