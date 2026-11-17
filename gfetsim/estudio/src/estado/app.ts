/** Estado global do estúdio e as ações que o alteram. */
import { carregar } from "@/parametros/parametros";
import { receitaPadrao, definirCampo, type Receita } from "@/fisica/receita";
import type { ResultadoCadeia } from "@/fisica/cadeia";
import type { Amostra, Saida } from "@/fisica/incerteza/montecarlo";
import { Loja, Historico, armazenamento } from "./loja";

export type Aba = "estrutura" | "perfis" | "oxidacao" | "dispositivo" | "eletrico" | "atomos" | "incerteza" | "previsao" | "parametros" | "relatorio";
export type Tema = "escuro" | "claro";
export type NivelLog = "info" | "aviso" | "erro" | "ok";

export interface EntradaLog {
  t: number;
  nivel: NivelLog;
  texto: string;
}

export interface EstadoMC {
  rodando: boolean;
  n: number;
  semente: number;
  entradas: Amostra[];
  saidas: (Saida | null)[];
  concluidas: number;
  falhas: number;
  receitaChave: string;
  inicio: number;
  fim: number | null;
}

export interface ProjetoSalvo {
  nome: string;
  receita: Receita;
  quando: number;
}

export interface Estado {
  receita: Receita;
  resultado: ResultadoCadeia | null; // cadeia 1D mais recente
  resultadoBorda: ResultadoCadeia | null; // com a borda 2D
  rodando: { rapido: boolean; completo: boolean };
  progresso: { etapa: string; fracao: number };
  automatico: boolean;
  aba: Aba;
  tema: Tema;
  log: EntradaLog[];
  mc: EstadoMC | null;
  /** cenários fixados para comparação nos gráficos */
  comparacao: { nome: string; resultado: ResultadoCadeia; cor: string }[];
  apresentacao: boolean;
  erro: string | null;
}

const p0 = carregar(true);

/** Sem escolha guardada, segue o tema de quem abre a página. */
function temaInicial(): Tema {
  try {
    const t = document.documentElement.getAttribute("data-theme");
    if (t === "light") return "claro";
    if (t === "dark") return "escuro";
    return matchMedia("(prefers-color-scheme: light)").matches ? "claro" : "escuro";
  } catch {
    return "escuro";
  }
}
const receitaInicial = armazenamento.ler<Receita | null>("gfetsim.receita", null);

function receitaValida(r: Receita | null): Receita {
  const padrao = receitaPadrao(p0);
  if (!r) return padrao;
  // mescla campos novos que receitas antigas não têm
  const mesclar = (a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> => {
    const o: Record<string, unknown> = { ...a };
    for (const [k, v] of Object.entries(b)) if (v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object") o[k] = mesclar(a[k] as Record<string, unknown>, v as Record<string, unknown>);
    else if (k in a) o[k] = v;
    return o;
  };
  return mesclar(padrao as unknown as Record<string, unknown>, r as unknown as Record<string, unknown>) as unknown as Receita;
}

export const loja = new Loja<Estado>({
  receita: receitaValida(receitaInicial),
  resultado: null,
  resultadoBorda: null,
  rodando: { rapido: false, completo: false },
  progresso: { etapa: "", fracao: 0 },
  automatico: true,
  aba: armazenamento.ler<Aba>("gfetsim.aba", "estrutura"),
  tema: armazenamento.ler<Tema>("gfetsim.tema", temaInicial()),
  log: [],
  mc: null,
  comparacao: [],
  apresentacao: false,
  erro: null,
});

export const historico = new Historico<Receita>();

export function registrar(nivel: NivelLog, texto: string): void {
  loja.set((s) => ({ log: [...s.log.slice(-299), { t: Date.now(), nivel, texto }] }));
}

export function mudarReceita(caminho: string, valor: unknown): void {
  const r = loja.get().receita;
  historico.registrar(r);
  loja.set({ receita: definirCampo(r, caminho, valor) });
}

export function trocarReceita(nova: Receita, registrarHistorico = true): void {
  if (registrarHistorico) historico.registrar(loja.get().receita);
  loja.set({ receita: nova });
}

export function desfazer(): void {
  const v = historico.desfazer(loja.get().receita);
  if (v) loja.set({ receita: v });
}

export function refazer(): void {
  const v = historico.refazer(loja.get().receita);
  if (v) loja.set({ receita: v });
}

export function restaurarPadrao(): void {
  trocarReceita(receitaPadrao(p0));
}

loja.observar((s) => s.receita, (r) => armazenamento.gravar("gfetsim.receita", r), false);
loja.observar((s) => s.aba, (a) => armazenamento.gravar("gfetsim.aba", a), false);
loja.observar((s) => s.tema, (t) => armazenamento.gravar("gfetsim.tema", t), false);

export const projetos = {
  listar(): ProjetoSalvo[] {
    return armazenamento.ler<ProjetoSalvo[]>("gfetsim.projetos", []);
  },
  salvar(nome: string, receita: Receita): void {
    const l = projetos.listar().filter((p) => p.nome !== nome);
    l.unshift({ nome, receita, quando: Date.now() });
    armazenamento.gravar("gfetsim.projetos", l.slice(0, 40));
  },
  remover(nome: string): void {
    armazenamento.gravar("gfetsim.projetos", projetos.listar().filter((p) => p.nome !== nome));
  },
};

/** Resultado mais completo disponível para a receita atual. */
export function melhorResultado(s: Estado = loja.get()): ResultadoCadeia | null {
  return s.resultadoBorda && s.resultado && s.resultadoBorda.receita.nome === s.resultado.receita.nome && JSON.stringify({ ...s.resultadoBorda.receita, borda: null }) === JSON.stringify({ ...s.resultado.receita, borda: null })
    ? s.resultadoBorda
    : s.resultado;
}
