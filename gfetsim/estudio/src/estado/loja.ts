/** Repositório reativo mínimo: estado imutável, assinaturas por seletor e histórico. */
export type Ouvinte<T> = (novo: T, antigo: T) => void;

export class Loja<T extends object> {
  private estado: T;
  private ouvintes = new Set<Ouvinte<T>>();

  constructor(inicial: T) {
    this.estado = inicial;
  }

  get(): T {
    return this.estado;
  }

  set(parcial: Partial<T> | ((s: T) => Partial<T>)): void {
    const antigo = this.estado;
    const p = typeof parcial === "function" ? parcial(antigo) : parcial;
    let mudou = false;
    for (const k of Object.keys(p) as (keyof T)[]) if (p[k] !== antigo[k]) mudou = true;
    if (!mudou) return;
    this.estado = { ...antigo, ...p };
    this.ouvintes.forEach((o) => o(this.estado, antigo));
  }

  assinar(o: Ouvinte<T>): () => void {
    this.ouvintes.add(o);
    return () => this.ouvintes.delete(o);
  }

  /** Chama f quando o valor selecionado muda (comparação por identidade). */
  observar<V>(seletor: (s: T) => V, f: (v: V, anterior: V | undefined) => void, imediato = true): () => void {
    let atual = seletor(this.estado);
    if (imediato) f(atual, undefined);
    return this.assinar((s) => {
      const v = seletor(s);
      if (v !== atual) {
        const ant = atual;
        atual = v;
        f(v, ant);
      }
    });
  }
}

/** Pilha de desfazer e refazer para um valor. */
export class Historico<V> {
  private passado: V[] = [];
  private futuro: V[] = [];
  constructor(private readonly limite = 200) {}

  registrar(anterior: V): void {
    this.passado.push(anterior);
    if (this.passado.length > this.limite) this.passado.shift();
    this.futuro = [];
  }

  desfazer(atual: V): V | null {
    const v = this.passado.pop();
    if (v === undefined) return null;
    this.futuro.push(atual);
    return v;
  }

  refazer(atual: V): V | null {
    const v = this.futuro.pop();
    if (v === undefined) return null;
    this.passado.push(atual);
    return v;
  }

  get podeDesfazer(): boolean {
    return this.passado.length > 0;
  }

  get podeRefazer(): boolean {
    return this.futuro.length > 0;
  }
}

/** localStorage protegido: o estúdio funciona igual quando ele não existe ou falha. */
export const armazenamento = {
  ler<V>(chave: string, padrao: V): V {
    try {
      const s = localStorage.getItem(chave);
      return s === null ? padrao : (JSON.parse(s) as V);
    } catch {
      return padrao;
    }
  },
  gravar(chave: string, v: unknown): void {
    try {
      localStorage.setItem(chave, JSON.stringify(v));
    } catch {
      /* sem armazenamento: só não lembra */
    }
  },
};
