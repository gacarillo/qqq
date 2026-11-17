/**
 * Acesso ao params.yaml (exportado para JSON) com as regras de honestidade do gfetsim,
 * idênticas às de gfetsim/params.py.
 *
 * Um valor null bloqueia o modelo que depende dele (ParametroAusente). Se o usuário
 * aceitar os provisórios, o valor_provisorio [I] é usado e a chave fica registrada.
 * Qualquer chave pode ser sobrescrita; o valor passa a ser [B].
 */
import dadosPadrao from "@/dados/params.json";
import { Aleatorio } from "@/nucleo/aleatorio";

export type Etiqueta = "P" | "C" | "I" | "B" | "?";
export type Origem = "valor" | "provisorio" | "usuario";

export interface Incerteza {
  tipo: "normal" | "normal_rel" | "uniforme" | "loguniforme" | "varredura";
  sigma?: number;
  sigma_rel?: number;
  min?: number;
  max?: number;
}

export interface NoParametro {
  valor?: unknown;
  valor_provisorio?: unknown;
  unidade?: string;
  etiqueta?: string;
  incerteza?: Incerteza | null;
  ref?: string[];
  nota?: string;
  conferido_em?: string;
  faixa?: { min: number; max: number };
  [chave: string]: unknown;
}

export interface Uso {
  chave: string;
  valor: unknown;
  etiqueta: Etiqueta;
  origem: Origem;
}

export class ParametroAusente extends Error {
  constructor(public readonly chave: string, nota?: string) {
    super(
      `parâmetro '${chave}' é null no params.yaml${nota ? ` (${nota})` : ""}. Forneça o valor ou aceite os provisórios [I] se houver valor_provisorio.`,
    );
    this.name = "ParametroAusente";
  }
}

type Arvore = Record<string, unknown>;

export class Parametros {
  readonly usos = new Map<string, Uso>();

  constructor(
    readonly dados: Arvore = dadosPadrao as Arvore,
    readonly aceitarProvisorios = true,
    readonly sobrescrever: Readonly<Record<string, unknown>> = {},
  ) {}

  no(chave: string): unknown {
    let atual: unknown = this.dados;
    for (const parte of chave.split(".")) {
      if (atual === null || typeof atual !== "object" || !(parte in (atual as Arvore))) {
        throw new Error(`chave inexistente no params.yaml: ${chave}`);
      }
      atual = (atual as Arvore)[parte];
    }
    return atual;
  }

  existe(chave: string): boolean {
    try {
      this.no(chave);
      return true;
    } catch {
      return false;
    }
  }

  valor(chave: string): number {
    const v = this.valorQualquer(chave);
    if (typeof v !== "number") throw new Error(`parâmetro '${chave}' não é numérico (${String(v)})`);
    return v;
  }

  texto(chave: string): string {
    return String(this.valorQualquer(chave));
  }

  valorQualquer(chave: string): unknown {
    if (chave in this.sobrescrever) {
      const v = this.sobrescrever[chave];
      this.usos.set(chave, { chave, valor: v, etiqueta: "B", origem: "usuario" });
      return v;
    }
    const n = this.no(chave);
    if (n === null || typeof n !== "object" || Array.isArray(n)) return n;
    const no = n as NoParametro;
    if (no.valor !== null && no.valor !== undefined) {
      this.usos.set(chave, { chave, valor: no.valor, etiqueta: normalizarEtiqueta(no.etiqueta), origem: "valor" });
      return no.valor;
    }
    if (this.aceitarProvisorios && no.valor_provisorio !== null && no.valor_provisorio !== undefined) {
      this.usos.set(chave, { chave, valor: no.valor_provisorio, etiqueta: "I", origem: "provisorio" });
      return no.valor_provisorio;
    }
    throw new ParametroAusente(chave, no.nota);
  }

  etiqueta(chave: string): Etiqueta {
    if (chave in this.sobrescrever) return "B";
    const n = this.no(chave) as NoParametro;
    if (n && typeof n === "object" && (n.valor === null || n.valor === undefined) && n.valor_provisorio !== null && n.valor_provisorio !== undefined) return "I";
    return n && typeof n === "object" ? normalizarEtiqueta(n.etiqueta) : "?";
  }

  incerteza(chave: string): Incerteza | null {
    const n = this.no(chave) as NoParametro;
    return n && typeof n === "object" ? ((n.incerteza as Incerteza | null | undefined) ?? null) : null;
  }

  metadados(chave: string): NoParametro {
    const n = this.no(chave);
    return n && typeof n === "object" ? (n as NoParametro) : { valor: n };
  }

  get provisoriosUsados(): string[] {
    return [...this.usos.values()].filter((u) => u.origem === "provisorio").map((u) => u.chave).sort();
  }

  tabelaUsos(): Uso[] {
    return [...this.usos.keys()].sort().map((k) => this.usos.get(k)!);
  }

  copia(sobrescrever: Record<string, unknown> = {}): Parametros {
    return new Parametros(this.dados, this.aceitarProvisorios, { ...this.sobrescrever, ...sobrescrever });
  }

  /** Amostra n valores conforme a incerteza declarada, como Parametros.amostrar em Python. */
  amostrar(chave: string, rng: Aleatorio, n: number, centro?: number): Float64Array {
    const inc = this.incerteza(chave);
    const out = new Float64Array(n);
    if (inc === null) {
      out.fill(this.valor(chave));
      return out;
    }
    switch (inc.tipo) {
      case "varredura":
        throw new Error(`${chave} é uma varredura e não entra no Monte Carlo`);
      case "uniforme":
        for (let i = 0; i < n; i++) out[i] = rng.uniforme(inc.min!, inc.max!);
        return out;
      case "loguniforme":
        for (let i = 0; i < n; i++) out[i] = Math.exp(rng.uniforme(Math.log(inc.min!), Math.log(inc.max!)));
        return out;
      case "normal": {
        const c = centro ?? this.valor(chave);
        for (let i = 0; i < n; i++) out[i] = rng.normal(c, inc.sigma!);
        return out;
      }
      case "normal_rel": {
        const c = centro ?? this.valor(chave);
        for (let i = 0; i < n; i++) out[i] = rng.normal(c, Math.abs(c) * inc.sigma_rel!);
        return out;
      }
      default:
        throw new Error(`tipo de incerteza desconhecido em ${chave}`);
    }
  }

  /** Percorre a árvore e devolve todas as folhas que parecem parâmetros (têm etiqueta). */
  folhas(): { chave: string; no: NoParametro }[] {
    const saida: { chave: string; no: NoParametro }[] = [];
    const visitar = (n: unknown, prefixo: string) => {
      if (n === null || typeof n !== "object" || Array.isArray(n)) return;
      const o = n as Arvore;
      if ("etiqueta" in o && ("valor" in o || "valor_provisorio" in o || "faixa" in o || "incerteza" in o)) {
        saida.push({ chave: prefixo, no: o as NoParametro });
      }
      for (const [k, v] of Object.entries(o)) if (v && typeof v === "object" && !Array.isArray(v)) visitar(v, prefixo ? `${prefixo}.${k}` : k);
    };
    visitar(this.dados, "");
    return saida;
  }
}

function normalizarEtiqueta(e: unknown): Etiqueta {
  const s = String(e ?? "?");
  return s === "P" || s === "C" || s === "I" || s === "B" ? s : "?";
}

export function carregar(aceitarProvisorios = true, sobrescrever: Record<string, unknown> = {}): Parametros {
  return new Parametros(dadosPadrao as Arvore, aceitarProvisorios, sobrescrever);
}
