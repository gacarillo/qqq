/**
 * Caderno de lotes: as receitas que foram ao laboratório, o que foi medido em cada uma e
 * a previsão que o estúdio fez antes da medida. Comparar as duas é o que diz se o modelo
 * prevê o futuro ou só ajusta o passado.
 *
 * Métricas de acerto, todas na escala transformada da saída (log para resistências):
 * cobertura dos intervalos de 68 e 95 %, o PIT (Dawid, J. R. Stat. Soc. A 147, 278, 1984),
 * que deve ser uniforme quando a preditiva está calibrada, e o CRPS (Gneiting e Raftery,
 * JASA 102, 359, 2007), que penaliza tanto o erro quanto a largura.
 */
import type { NomeSaida } from "@/fisica/incerteza/montecarlo";
import { armazenamento } from "@/estado/loja";
import { paraT, TRANSFORMACAO } from "./emulador";
import { DEF_VAR, type NomeVarReceita, type ValoresReceita } from "./espaco";
import { ehParametro, novoIdCurto, type Grandeza, type Lote, type Medida } from "./tipos";

const CHAVE = "gfetsim.caderno";

export function lerCaderno(): Lote[] {
  const l = armazenamento.ler<Lote[]>(CHAVE, []);
  return Array.isArray(l) ? l : [];
}

export function gravarCaderno(l: Lote[]): void {
  armazenamento.gravar(CHAVE, l);
}

export interface Acerto {
  lote: string;
  loteNome: string;
  s: NomeSaida;
  medido: number;
  p2_5: number;
  p16: number;
  p50: number;
  p84: number;
  p97_5: number;
  dentro68: boolean;
  dentro95: boolean;
  pit: number;
  /** (medido − mediana) / meia largura do intervalo de 68 %, na escala transformada */
  z: number;
  crps: number;
}

export interface Placar {
  itens: Acerto[];
  cobertura68: number;
  cobertura95: number;
  crpsMedio: number;
  /** histograma do PIT em 10 classes */
  pit: number[];
  n: number;
}

/** CRPS de uma amostra contra o valor observado: E|Y − y| − ½ E|Y − Y′|. */
export function crpsAmostral(amostras: ArrayLike<number>, y: number): number {
  const v = Float64Array.from(amostras).sort();
  const n = v.length;
  if (n === 0) return NaN;
  let a = 0;
  for (let i = 0; i < n; i++) a += Math.abs(v[i] - y);
  a /= n;
  // E|Y − Y′| pela forma ordenada: (2/n²) Σ (2i − n + 1) v_i com i de 0
  let b = 0;
  for (let i = 0; i < n; i++) b += (2 * i - n + 1) * v[i];
  b = (2 * b) / (n * n);
  return a - 0.5 * b;
}

export function placar(lotes: Lote[]): Placar {
  const itens: Acerto[] = [];
  for (const l of lotes) {
    const pv = l.previsao;
    if (!pv) continue;
    for (const m of l.medidas) {
      if (ehParametro(m.grandeza)) continue;
      const s = m.grandeza as NomeSaida;
      const q = pv.saidas[s];
      if (!q || !Number.isFinite(m.valor)) continue;
      if (TRANSFORMACAO[s] === "log" && !(m.valor > 0)) continue;
      const t = (v: number) => paraT(s, v);
      const yT = t(m.valor);
      const am = q.amostras.map(t);
      const meia = (t(q.p84) - t(q.p16)) / 2;
      let menores = 0;
      for (const v of am) if (v <= yT) menores++;
      itens.push({
        lote: l.id, loteNome: l.nome, s, medido: m.valor, p2_5: q.p2_5, p16: q.p16, p50: q.p50, p84: q.p84, p97_5: q.p97_5,
        dentro68: m.valor >= q.p16 && m.valor <= q.p84, dentro95: m.valor >= q.p2_5 && m.valor <= q.p97_5,
        pit: am.length ? menores / am.length : NaN, z: meia > 0 ? (yT - t(q.p50)) / meia : NaN, crps: crpsAmostral(am, yT),
      });
    }
  }
  const n = itens.length;
  const pit = new Array<number>(10).fill(0);
  for (const a of itens) if (Number.isFinite(a.pit)) pit[Math.min(9, Math.floor(a.pit * 10))]++;
  return {
    itens, n, pit,
    cobertura68: n ? itens.filter((a) => a.dentro68).length / n : NaN,
    cobertura95: n ? itens.filter((a) => a.dentro95).length / n : NaN,
    crpsMedio: n ? itens.reduce((s, a) => s + (Number.isFinite(a.crps) ? a.crps : 0), 0) / n : NaN,
  };
}

/**
 * Intervalo binomial de Wilson para uma cobertura observada, para dizer se 7 de 10 dentro
 * do intervalo de 68 % está dentro do esperado.
 */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n;
  const den = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / den;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

/**
 * Lê medidas em texto separado por ponto e vírgula, tabulação ou vírgula. A primeira
 * linha tem os nomes das colunas. Obrigatórias: lote, grandeza, valor. Opcionais: sigma,
 * relativo (sim ou não) e qualquer variável de receita (T_ox, t_ox, T_rta, dose …), lida
 * na primeira linha de cada lote. Números aceitam vírgula decimal quando o separador é ;.
 */
export function lerCSV(texto: string, existentes: Lote[], erroTipico: (g: Grandeza) => { sigma: number; relativo: boolean }): { lotes: Lote[]; avisos: string[]; nMedidas: number } {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const avisos: string[] = [];
  if (linhas.length < 2) return { lotes: existentes, avisos: ["o arquivo precisa de cabeçalho e ao menos uma linha"], nMedidas: 0 };
  const sepPV = linhas[0].includes(";");
  const SEP = sepPV ? ";" : linhas[0].includes("\t") ? "\t" : ",";
  const cab = linhas[0].split(SEP).map((c) => c.trim());
  const col = (n: string) => cab.findIndex((c) => c.toLowerCase() === n.toLowerCase());
  const iL = col("lote");
  const iG = col("grandeza");
  const iV = col("valor");
  if (iL < 0 || iG < 0 || iV < 0) return { lotes: existentes, avisos: ["faltam as colunas lote, grandeza e valor"], nMedidas: 0 };
  const iS = col("sigma");
  const iR = col("relativo");
  const varsCol = cab.map((c, i) => [c, i] as const).filter(([c]) => DEF_VAR.has(c as NomeVarReceita));
  const num = (s: string) => Number((sepPV ? s.replace(",", ".") : s).trim());
  const lotes = existentes.map((l) => ({ ...l, medidas: [...l.medidas] }));
  let nMedidas = 0;
  linhas.slice(1).forEach((ln, k) => {
    const c = ln.split(SEP);
    const nome = (c[iL] ?? "").trim();
    const g = (c[iG] ?? "").trim() as Grandeza;
    const v = num(c[iV] ?? "");
    if (!nome || !g || !Number.isFinite(v)) {
      avisos.push(`linha ${k + 2} ignorada`);
      return;
    }
    let lote = lotes.find((l) => l.nome === nome);
    if (!lote) {
      const receita: ValoresReceita = {};
      for (const [nm, i] of varsCol) {
        const x = num(c[i] ?? "");
        if (Number.isFinite(x)) receita[nm as NomeVarReceita] = x;
      }
      lote = { id: novoIdCurto("L"), nome, receita, medidas: [], usarNaCalibracao: true, criado: Date.now() };
      lotes.push(lote);
    }
    const tip = erroTipico(g);
    const sg = iS >= 0 ? num(c[iS] ?? "") : NaN;
    const rel = iR >= 0 ? /^(s|sim|y|yes|1|true|rel)/i.test((c[iR] ?? "").trim()) : tip.relativo;
    const m: Medida = { id: novoIdCurto("m"), grandeza: g, valor: v, sigma: Number.isFinite(sg) && sg > 0 ? sg : tip.sigma, relativo: Number.isFinite(sg) && sg > 0 ? rel : tip.relativo };
    lote.medidas.push(m);
    nMedidas++;
  });
  return { lotes, avisos, nMedidas };
}

/** Medidas de todos os lotes no mesmo formato que lerCSV aceita. */
export function escreverCSV(lotes: Lote[]): string {
  const vars = [...new Set(lotes.flatMap((l) => Object.keys(l.receita)))] as NomeVarReceita[];
  const linhas = [["lote", "grandeza", "valor", "sigma", "relativo", ...vars].join(";")];
  for (const l of lotes) for (const m of l.medidas) linhas.push([l.nome, m.grandeza, String(m.valor), String(m.sigma), m.relativo ? "sim" : "não", ...vars.map((v) => (l.receita[v] !== undefined ? String(l.receita[v]) : ""))].join(";"));
  return linhas.join("\n") + "\n";
}
