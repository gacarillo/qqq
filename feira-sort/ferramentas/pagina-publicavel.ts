/**
 * Gera, a partir de dist/index.html, uma versão do jogo sem <html>, <head> e <body>, no formato que a
 * página publicada no claude.ai espera (ela mesma acrescenta esse esqueleto). O resto é idêntico.
 *
 *   npm run build && npx tsx ferramentas/pagina-publicavel.ts [saida.html]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const entrada = readFileSync(join(raiz, 'dist/index.html'), 'utf8');
const saida = process.argv[2] ?? join(raiz, 'dist/feira-sort.html');

function blocos(html: string, abre: string, fecha: string): string[] {
  const achados: string[] = [];
  let i = 0;
  for (;;) {
    const ini = html.indexOf(abre, i);
    if (ini < 0) break;
    const fim = html.indexOf(fecha, ini);
    if (fim < 0) throw new Error(`Bloco ${abre} sem ${fecha}`);
    achados.push(html.slice(ini, fim + fecha.length));
    i = fim + fecha.length;
  }
  return achados;
}

const cabeca = entrada.slice(entrada.indexOf('<head>') + 6, entrada.indexOf('</head>'));
const corpo = entrada.slice(entrada.indexOf('<body>') + 6, entrada.lastIndexOf('</body>'));

const titulo = blocos(cabeca, '<title>', '</title>')[0];
const metaLados = cabeca.match(/<meta name="claude:viewport-fit-sides"[^>]*>/)?.[0] ?? '';
const links = (cabeca.match(/<link\s[^>]*>/g) ?? []).map((l) => l.replace(/\s+/g, " "));
const estilos = blocos(cabeca, '<style', '</style>');
const scripts = [...blocos(cabeca, '<script', '</script>'), ...blocos(corpo, '<script', '</script>')];
let marcacao = corpo;
for (const s of scripts) marcacao = marcacao.replace(s, '');

if (!titulo || estilos.length === 0 || scripts.length === 0) throw new Error('dist/index.html não tem o formato esperado');

const pagina = [titulo, metaLados, ...links, ...estilos, marcacao.trim(), ...scripts].join('\n');
writeFileSync(saida, pagina + '\n');
console.log(`Página publicável: ${saida} (${Math.round(pagina.length / 1024)} KB)`);
