/**
 * Linha do tempo 2D do processo a partir do resultado da cadeia: implantação, SPE, etapa
 * quente e oxidação. Com a borda 2D calculada os mapas são os do modelo 2D; sem ela, o
 * perfil 1D do centro da janela é estendido lateralmente e a vista avisa.
 */
import type { ResultadoCadeia } from "@/fisica/cadeia";
import { arange, interp } from "@/nucleo/numerico";

export interface QuadroProcesso {
  etapa: "implante" | "spe" | "quente" | "oxidacao";
  rotulo: string;
  t_s: number;
  T_C: number;
  x: Float64Array;
  y: Float64Array;
  C: Float64Array;
  A: Float64Array;
  amorfo: Uint8Array | null;
  xox: Float64Array | null;
  si: Float64Array | null;
  mascara_nm: number;
  sombra_nm: number;
  de2D: boolean;
}

export const NOME_ETAPA: Record<QuadroProcesso["etapa"], string> = {
  implante: "Implantação",
  spe: "SPE a 550 °C",
  quente: "Etapa quente",
  oxidacao: "Oxidação de porta",
};

function tempoTxt(t: number): string {
  return t >= 120 ? `${(t / 60).toFixed(1).replace(".", ",")} min` : `${t.toFixed(1).replace(".", ",")} s`;
}

export function quadrosProcesso(res: ResultadoCadeia): QuadroProcesso[] {
  const b = res.borda;
  const masc = res.receita.implante.variante === "A_mascara" ? res.receita.implante.mascara_nm : 0;
  const out: QuadroProcesso[] = [];
  if (b) {
    const { x, y } = b.grade;
    const n = x.length * y.length;
    out.push({ etapa: "implante", rotulo: "como implantado", t_s: 0, T_C: 25, x, y, C: b.implante.v, A: new Float64Array(n), amorfo: b.amorfo, xox: null, si: null, mascara_nm: masc, sombra_nm: b.ys_nm, de2D: true });
    for (const q of b.recozimento) {
      const spe = q.etapa === "SPE";
      out.push({ etapa: spe ? "spe" : "quente", rotulo: `${q.etapa} ${tempoTxt(q.t_s)}`, t_s: q.t_s, T_C: q.T_C, x, y, C: q.C.v, A: q.ativo.v, amorfo: q.amorfo, xox: null, si: null, mascara_nm: 0, sombra_nm: 0, de2D: true });
    }
    if (b.oxidacao) {
      const fim = b.recozimento[b.recozimento.length - 1];
      out.push({ etapa: "oxidacao", rotulo: "oxidação 0 min", t_s: 0, T_C: res.receita.oxidacao.T_C, x, y, C: fim.C.v, A: fim.ativo.v, amorfo: null, xox: new Float64Array(y.length), si: new Float64Array(y.length), mascara_nm: 0, sombra_nm: 0, de2D: true });
      for (const q of b.oxidacao) out.push({ etapa: "oxidacao", rotulo: `oxidação ${q.t_min.toFixed(1).replace(".", ",")} min`, t_s: q.t_min * 60, T_C: res.receita.oxidacao.T_C, x, y, C: q.C.v, A: q.ativo.v, amorfo: null, xox: q.xox, si: q.si, mascara_nm: 0, sombra_nm: 0, de2D: true });
    }
    return out;
  }
  // extensão lateral do 1D
  const x = arange(1, 301, 2);
  const y = arange(-300, 400, 10);
  const ny = y.length;
  const espalhar = (xs: ArrayLike<number>, v: ArrayLike<number>) => {
    const m = new Float64Array(x.length * ny);
    for (let i = 0; i < x.length; i++) {
      const val = interp(x[i], xs, v, undefined, 0);
      for (let j = 0; j < ny; j++) m[i * ny + j] = val;
    }
    return m;
  };
  const im = res.implante;
  const am = new Uint8Array(x.length * ny);
  if (im.amorfo_nm) for (let i = 0; i < x.length; i++) if (x[i] >= im.amorfo_nm[0] && x[i] <= im.amorfo_nm[1]) for (let j = 0; j < ny; j++) am[i * ny + j] = 1;
  out.push({ etapa: "implante", rotulo: "como implantado", t_s: 0, T_C: 25, x, y, C: espalhar(im.x_nm, im.C_cm3), A: new Float64Array(x.length * ny), amorfo: am, xox: null, si: null, mascara_nm: 0, sombra_nm: 0, de2D: false });
  const xe = res.recozimento.estado.x_nm;
  for (const q of res.recozimento.quadros) {
    const spe = q.etapa === "SPE";
    const a = new Uint8Array(x.length * ny);
    if (spe && q.frenteAmorfa_nm !== null && im.amorfo_nm) for (let i = 0; i < x.length; i++) if (x[i] >= im.amorfo_nm[0] && x[i] <= q.frenteAmorfa_nm) for (let j = 0; j < ny; j++) a[i * ny + j] = 1;
    out.push({ etapa: spe ? "spe" : "quente", rotulo: `${q.etapa} ${tempoTxt(q.t_s)}`, t_s: q.t_s, T_C: q.T_C, x, y, C: espalhar(xe, q.C), A: espalhar(xe, q.ativo), amorfo: a, xox: null, si: null, mascara_nm: 0, sombra_nm: 0, de2D: false });
  }
  for (const q of res.oxidacao.quadros) {
    out.push({ etapa: "oxidacao", rotulo: `oxidação ${q.t_min.toFixed(1).replace(".", ",")} min`, t_s: q.t_min * 60, T_C: res.receita.oxidacao.T_C, x, y, C: espalhar(xe, q.C), A: espalhar(xe, q.ativo), amorfo: null, xox: new Float64Array(ny).fill(q.x_ox), si: new Float64Array(ny).fill(q.si), mascara_nm: 0, sombra_nm: 0, de2D: false });
  }
  return out;
}
