/**
 * Física 2D na borda da janela da máscara, porte de gfetsim/recozimento/borda2d.py.
 *
 * Mapa inicial  C(x, y) = p(x) . P(dy <= y - y_s | x), com a distribuição lateral
 * condicional ajustada às posições finais do RustBCA (gaussiana por profundidade [C]) e
 * y_s a borda efetiva da janela, 150 tan(7°) = 18 nm com sombra ou 0 sem sombra [C].
 *
 * Recozimento  camada amorfa pelo limiar de dose ponderado pela cobertura; SPE a partir
 * do cristal mais próximo (transformada de distância, recrescimento lateral [C]); difusão
 * de Fair e Tsai por separação de operadores de Strang com o passo 1D do módulo 2.
 *
 * Oxidação por coluna  cada coluna oxida com o próprio P ativo na interface, sem difusão
 * lateral durante a oxidação [C].
 *
 * Os mapas ficam em Float64Array com índice i*ny + j (i profundidade, j lateral).
 */
import type { Parametros } from "@/parametros/parametros";
import { erf, interp, transformadaDistancia, type Vetor } from "@/nucleo/numerico";
import * as difusao from "./difusao";
import * as si from "./silicio";
import { velocidadeSPE, type Etapa, type RamoDesativacao } from "./recozimento";
import { oxidar, type RamoAceleracao, type RamoInterface } from "../oxidacao/oxidacao";

export interface Grade2D {
  x: Vetor; // profundidade (nm)
  y: Vetor; // lateral (nm); y > 0 é a janela
}

export interface Mapa2D {
  nx: number;
  ny: number;
  v: Vetor;
}

export function mapaVazio(g: Grade2D): Mapa2D {
  return { nx: g.x.length, ny: g.y.length, v: new Float64Array(g.x.length * g.y.length) };
}

/** Ajuste por mínimos quadrados de um polinômio de grau 2 (np.polyfit(x, y, 2)). */
export function ajusteQuadratico(x: ArrayLike<number>, y: ArrayLike<number>): [number, number, number] {
  const S = new Float64Array(5);
  const T = new Float64Array(3);
  for (let i = 0; i < x.length; i++) {
    let xp = 1;
    for (let k = 0; k < 5; k++) {
      S[k] += xp;
      if (k < 3) T[k] += xp * y[i];
      xp *= x[i];
    }
  }
  // sistema normal [S0 S1 S2; S1 S2 S3; S2 S3 S4] [c0 c1 c2] = [T0 T1 T2]
  const A = [
    [S[0], S[1], S[2], T[0]],
    [S[1], S[2], S[3], T[1]],
    [S[2], S[3], S[4], T[2]],
  ];
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k];
    }
  }
  const c0 = A[0][3] / A[0][0];
  const c1 = A[1][3] / A[1][1];
  const c2 = A[2][3] / A[2][2];
  return [c2, c1, c0]; // ordem do np.polyfit: maior grau primeiro
}

const polyval = (c: [number, number, number], x: number) => (c[0] * x + c[1]) * x + c[2];

/** Média e desvio laterais suavizados por profundidade, a partir das faixas do RustBCA. */
export function lateralPorProfundidade(faixaX: ArrayLike<number>, media: ArrayLike<number>, desvio: ArrayLike<number>, gradeX: ArrayLike<number>): { mu: Vetor; sg: Vetor } {
  const pm = ajusteQuadratico(faixaX, media);
  const ps = ajusteQuadratico(faixaX, desvio);
  let xmin = Infinity, xmax = -Infinity;
  for (let i = 0; i < faixaX.length; i++) {
    xmin = Math.min(xmin, faixaX[i]);
    xmax = Math.max(xmax, faixaX[i]);
  }
  const mu = new Float64Array(gradeX.length);
  const sg = new Float64Array(gradeX.length);
  for (let i = 0; i < gradeX.length; i++) {
    const xc = Math.min(Math.max(gradeX[i], xmin), xmax);
    mu[i] = polyval(pm, xc);
    sg[i] = Math.max(polyval(ps, xc), 1);
  }
  return { mu, sg };
}

/** Mapa inicial e cobertura lateral. perfilX já tem a dose embutida (cm^-3 por profundidade). */
export function mapaInicial(g: Grade2D, perfilX: ArrayLike<number>, mu: ArrayLike<number>, sg: ArrayLike<number>, ys: number): { C: Mapa2D; cobertura: Mapa2D } {
  const C = mapaVazio(g);
  const cob = mapaVazio(g);
  const ny = g.y.length;
  for (let i = 0; i < g.x.length; i++)
    for (let j = 0; j < ny; j++) {
      const c = 0.5 * (1 + erf((g.y[j] - ys - mu[i]) / (Math.SQRT2 * sg[i])));
      cob.v[i * ny + j] = c;
      C.v[i * ny + j] = perfilX[i] * c;
    }
  return { C, cobertura: cob };
}

export function amorfo2D(Fn: ArrayLike<number>, cobertura: Mapa2D, dose: number, doseLimiar: number): Uint8Array {
  let Fmax = 0;
  for (let i = 0; i < Fn.length; i++) Fmax = Math.max(Fmax, Fn[i]);
  const out = new Uint8Array(cobertura.v.length);
  for (let i = 0; i < cobertura.nx; i++) for (let j = 0; j < cobertura.ny; j++) out[i * cobertura.ny + j] = Fn[i] * cobertura.v[i * cobertura.ny + j] * dose >= Fmax * doseLimiar ? 1 : 0;
  return out;
}

/** Difusão 2D por Strang: meio passo em x, passo em y, meio passo em x. */
export function difundir2D(p: Parametros, g: Grade2D, C: Mapa2D, T_C: number, t_s: number, nPassos = 40, razao = 1.04): Mapa2D {
  const out: Mapa2D = { nx: C.nx, ny: C.ny, v: Float64Array.from(C.v) };
  if (t_s <= 0) return out;
  const dts = difusao.passosGeometricos(t_s, nPassos, razao);
  const ctx = difusao.contexto(p, T_C);
  const { nx, ny } = out;
  const col = new Float64Array(nx);
  const lin = new Float64Array(ny);
  const aX = new difusao.AreaDifusao(nx);
  const aY = new difusao.AreaDifusao(ny);
  const dx = g.x[1] - g.x[0];
  const dy = g.y[1] - g.y[0];
  const passoX = (dt: number) => {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) col[i] = out.v[i * ny + j];
      difusao.passoTemporal(ctx, dx, col, dt, col, undefined, aX);
      for (let i = 0; i < nx; i++) out.v[i * ny + j] = col[i];
    }
  };
  for (const dt of dts) {
    passoX(0.5 * dt);
    for (let i = 0; i < nx; i++) {
      let m = 0;
      for (let j = 0; j < ny; j++) {
        lin[j] = out.v[i * ny + j];
        if (lin[j] > m) m = lin[j];
      }
      if (m > 1e14) {
        difusao.passoTemporal(ctx, dy, lin, dt, lin, undefined, aY);
        for (let j = 0; j < ny; j++) out.v[i * ny + j] = lin[j];
      }
    }
    passoX(0.5 * dt);
  }
  return out;
}

export interface Quadro2D {
  etapa: string;
  t_s: number;
  T_C: number;
  C: Mapa2D;
  ativo: Mapa2D;
  amorfo: Uint8Array;
}

/** SPE 2D e etapa quente, com quadros para a animação (recozer_2d). */
export function recozer2D(p: Parametros, g: Grade2D, C0: Mapa2D, amorfo: Uint8Array, etapas: [Etapa, Etapa], nQuadrosQuente = 8, ramo: RamoDesativacao = "equilibrio", aoProgresso?: (f: number) => void): Quadro2D[] {
  const dx = g.x[1] - g.x[0];
  const dy = g.y[1] - g.y[0];
  const [spe, quente] = etapas;
  const v = velocidadeSPE(p, spe.T_C) * 1e7; // nm/s
  const { nx, ny } = C0;
  const dist = transformadaDistancia(amorfo, nx, ny, dx, dy);
  let dmax = 0;
  let algum = false;
  for (let k = 0; k < amorfo.length; k++) if (amorfo[k]) {
    algum = true;
    if (dist[k] > dmax) dmax = dist[k];
  }
  const tSpe = algum ? dmax / v : 0;
  const quadros: Quadro2D[] = [];
  for (let k = 0; k <= 8; k++) {
    const t = (k / 8) * Math.min(1.05 * tSpe, spe.t_s);
    const ainda = new Uint8Array(amorfo.length);
    const A: Mapa2D = { nx, ny, v: new Float64Array(amorfo.length) };
    for (let c = 0; c < amorfo.length; c++) {
      ainda[c] = amorfo[c] && dist[c] > v * t ? 1 : 0;
      if (amorfo[c] && !ainda[c]) A.v[c] = C0.v[c];
    }
    quadros.push({ etapa: "SPE", t_s: t, T_C: spe.T_C, C: { nx, ny, v: Float64Array.from(C0.v) }, ativo: A, amorfo: ainda });
  }
  const ativo = new Float64Array(amorfo.length);
  for (let c = 0; c < amorfo.length; c++) ativo[c] = amorfo[c] ? C0.v[c] : 0;
  quadros.push({ etapa: "SPE", t_s: spe.t_s, T_C: spe.T_C, C: { nx, ny, v: Float64Array.from(C0.v) }, ativo: { nx, ny, v: Float64Array.from(ativo) }, amorfo: new Uint8Array(amorfo.length) });
  const ne = si.n_e(p, quente.T_C);
  const frac = new Float64Array(amorfo.length);
  for (let c = 0; c < amorfo.length; c++) frac[c] = C0.v[c] > 0 ? ativo[c] / Math.max(C0.v[c], 1e-30) : 0;
  let C = C0;
  let tAnt = 0;
  for (let k = 1; k <= nQuadrosQuente; k++) {
    const t = quente.t_s * (k / nQuadrosQuente) ** 2;
    C = difundir2D(p, g, C, quente.T_C, t - tAnt, 12);
    tAnt = t;
    const a: Mapa2D = { nx, ny, v: new Float64Array(amorfo.length) };
    for (let c = 0; c < amorfo.length; c++) {
      let val = Math.max(Math.min(1, Math.max(0, frac[c])) * C.v[c], Math.min(C.v[c], ne));
      if (ramo === "equilibrio" || !quente.rapida) val = Math.min(val, ne);
      a.v[c] = val;
    }
    quadros.push({ etapa: quente.nome, t_s: t, T_C: quente.T_C, C, ativo: a, amorfo: new Uint8Array(amorfo.length) });
    aoProgresso?.(k / nQuadrosQuente);
  }
  return quadros;
}

export interface QuadroOx2D {
  t_min: number;
  C: Mapa2D;
  ativo: Mapa2D;
  xox: Vetor;
  si: Vetor;
}

/** Oxidação coluna a coluna sobre o estado 2D recozido; colunas iguais são calculadas uma vez. */
export function oxidarPorColuna(p: Parametros, g: Grade2D, C: Mapa2D, A: Mapa2D, T_C: number, t_min: number, fracoes: number[], ramoA: RamoAceleracao, ramoI: RamoInterface = "acumulo_classico", aoProgresso?: (f: number) => void): QuadroOx2D[] {
  const { nx, ny } = C;
  const saida: QuadroOx2D[] = fracoes.map((f) => ({ t_min: f * t_min, C: { nx, ny, v: new Float64Array(nx * ny) }, ativo: { nx, ny, v: new Float64Array(nx * ny) }, xox: new Float64Array(ny), si: new Float64Array(ny) }));
  const cache = new Map<string, ReturnType<typeof oxidar>["quadros"]>();
  const iRef = Math.min(40, nx - 1);
  for (let j = 0; j < ny; j++) {
    const cj = new Float64Array(nx);
    const aj = new Float64Array(nx);
    for (let i = 0; i < nx; i++) {
      cj[i] = C.v[i * ny + j];
      aj[i] = A.v[i * ny + j];
    }
    const chave = `${Math.log10(cj[0] + 1).toFixed(3)}|${Math.log10(cj[iRef] + 1).toFixed(3)}`;
    let qd = cache.get(chave);
    if (!qd) {
      const r = oxidar(p, { x_nm: g.x, C: cj, ativo: aj, amorfo_nm: null, historico: [] }, T_C, t_min, { ramoAceleracao: ramoA, ramoInterface: ramoI, nPassos: 60, instantes_min: fracoes.map((f) => f * t_min * (1 - 1e-9)) });
      qd = r.quadros;
      cache.set(chave, qd);
    }
    qd.slice(0, fracoes.length).forEach((q, k) => {
      for (let i = 0; i < nx; i++) {
        saida[k].C.v[i * ny + j] = q.C[i];
        saida[k].ativo.v[i * ny + j] = q.ativo[i];
      }
      saida[k].xox[j] = q.x_ox;
      saida[k].si[j] = q.si;
    });
    aoProgresso?.((j + 1) / ny);
  }
  return saida;
}

/** Profundidade em que a coluna j cruza o nível (nm), 0 se não chega lá. */
export function profundidadeNivel(M: Mapa2D, g: Grade2D, j: number, nivel: number): number {
  const { nx, ny } = M;
  if (M.v[j] < nivel) return 0;
  for (let i = 1; i < nx; i++) {
    const a = M.v[(i - 1) * ny + j];
    const b = M.v[i * ny + j];
    if (a >= nivel && b < nivel) return interp(Math.log10(nivel), [Math.log10(b), Math.log10(a)], [g.x[i], g.x[i - 1]]);
  }
  return g.x[nx - 1];
}
