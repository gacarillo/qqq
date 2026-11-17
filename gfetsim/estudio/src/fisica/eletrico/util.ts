import { interp as interpBase, type Vetor as V, type VetorLeitura as VL } from "@/nucleo/numerico";

export type Vetor = V;
export type VetorLeitura = VL;
export const interp = (x: number, xp: VL, fp: VL) => interpBase(x, xp, fp);
/** Inversa de uma curva monótona crescente y(x). */
export const inverso = (xs: VL, ys: VL, y: number) => interpBase(y, ys, xs);
