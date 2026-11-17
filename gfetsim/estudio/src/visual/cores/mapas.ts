/**
 * Mapas de cor para campos escalares. Viridis, magma, inferno e plasma pelos ajustes
 * polinomiais de Matt Zucker (erro máximo de cerca de 1 nível em 8 bits); turbo pela
 * aproximação polinomial de Anton Mikhailov. "tcad" é o turbo, a escala de arco-íris
 * corrigida que lembra a dos simuladores comerciais. "divergente" é o frio e quente de
 * Moreland em três pontos, para grandezas com sinal.
 */
export type NomeMapa = "tcad" | "viridis" | "magma" | "inferno" | "plasma" | "divergente" | "cinza";

export const NOMES_MAPAS: [NomeMapa, string][] = [
  ["tcad", "arco-íris corrigido (turbo)"],
  ["viridis", "viridis"],
  ["magma", "magma"],
  ["inferno", "inferno"],
  ["plasma", "plasma"],
  ["divergente", "divergente frio e quente"],
  ["cinza", "tons de cinza"],
];

type Coef = [number, number, number][];

const ZUCKER: Record<"viridis" | "magma" | "inferno" | "plasma", Coef> = {
  viridis: [
    [0.2777273272234177, 0.005407344544966578, 0.3340998053353061],
    [0.1050930431085774, 1.404613529898575, 1.384590162594685],
    [-0.3308618287255563, 0.214847559468213, 0.09509516302823659],
    [-4.634230498983486, -5.799100973351585, -19.33244095627987],
    [6.228269936347081, 14.17993336680509, 56.69055260068105],
    [4.776384997670288, -13.74514537774601, -65.35303263337234],
    [-5.435455855934631, 4.645852612178535, 26.3124352495832],
  ],
  plasma: [
    [0.05873234392399702, 0.02333670892565664, 0.5433401826748754],
    [2.176514634195958, 0.2383834171260182, 0.7539604599784036],
    [-2.689460476458034, -7.455851135738909, 3.110799939717086],
    [6.130348345893603, 42.3461881477227, -28.51885465332158],
    [-11.10743619062271, -82.66631109428045, 60.13984767418263],
    [10.02306557647065, 71.41361770095349, -54.07218655560067],
    [-3.658713842777788, -22.93153465461149, 18.19190778539828],
  ],
  magma: [
    [-0.002136485053939582, -0.000749655052795221, -0.005386127855323933],
    [0.2516605407371642, 0.6775232436837668, 2.494026599312351],
    [8.353717279216625, -3.577719514958484, 0.3144679030132573],
    [-27.66873308576866, 14.26473078096533, -13.64921318813922],
    [52.17613981234068, -27.94360607168351, 12.94416944238394],
    [-50.76852536473588, 29.04658282127291, 4.23415299384598],
    [18.65570506591883, -11.48977351997711, -5.601961508734096],
  ],
  inferno: [
    [0.0002189403691192265, 0.001651004631001012, -0.01948089843709184],
    [0.1065134194856116, 0.5639564367884091, 3.932712388889277],
    [11.60249308247187, -3.972853965665698, -15.9423941062914],
    [-41.70399613139459, 17.43639888205313, 44.35414519872813],
    [77.162935699427, -33.40235894210092, -81.80730925738993],
    [-71.31942824499214, 32.62606426397723, 73.20951985803202],
    [25.13112622477341, -12.24266895238567, -23.07032500287172],
  ],
};

function horner(c: Coef, t: number, k: 0 | 1 | 2): number {
  let v = c[6][k];
  for (let i = 5; i >= 0; i--) v = v * t + c[i][k];
  return v;
}

function turbo(t: number): [number, number, number] {
  const r = 0.13572138 + t * (4.6153926 + t * (-42.66032258 + t * (132.13108234 + t * (-152.94239396 + t * 59.28637943))));
  const g = 0.09140261 + t * (2.19418839 + t * (4.84296658 + t * (-14.18503333 + t * (4.27729857 + t * 2.82956604))));
  const b = 0.1066733 + t * (12.64194608 + t * (-60.58204836 + t * (110.36276771 + t * (-89.90310912 + t * 27.34824973))));
  return [r, g, b];
}

function divergente(t: number): [number, number, number] {
  const a = [59 / 255, 76 / 255, 192 / 255];
  const m = [221 / 255, 221 / 255, 221 / 255];
  const b = [180 / 255, 4 / 255, 38 / 255];
  if (t < 0.5) {
    const u = t / 0.5;
    return [a[0] + (m[0] - a[0]) * u, a[1] + (m[1] - a[1]) * u, a[2] + (m[2] - a[2]) * u];
  }
  const u = (t - 0.5) / 0.5;
  return [m[0] + (b[0] - m[0]) * u, m[1] + (b[1] - m[1]) * u, m[2] + (b[2] - m[2]) * u];
}

export function cor(mapa: NomeMapa, t: number): [number, number, number] {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  let c: [number, number, number];
  if (mapa === "tcad") c = turbo(u);
  else if (mapa === "divergente") c = divergente(u);
  else if (mapa === "cinza") c = [0.08 + 0.88 * u, 0.08 + 0.88 * u, 0.09 + 0.88 * u];
  else {
    const k = ZUCKER[mapa];
    c = [horner(k, u, 0), horner(k, u, 1), horner(k, u, 2)];
  }
  return [Math.round(255 * Math.min(1, Math.max(0, c[0]))), Math.round(255 * Math.min(1, Math.max(0, c[1]))), Math.round(255 * Math.min(1, Math.max(0, c[2])))];
}

const cacheLUT = new Map<NomeMapa, Uint8ClampedArray>();

/** Tabela de 256 cores RGB em sequência, para colorir imagens rapidamente. */
export function lut(mapa: NomeMapa): Uint8ClampedArray {
  let l = cacheLUT.get(mapa);
  if (!l) {
    l = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) l.set(cor(mapa, i / 255), 3 * i);
    cacheLUT.set(mapa, l);
  }
  return l;
}

export function corCss(mapa: NomeMapa, t: number): string {
  const [r, g, b] = cor(mapa, t);
  return `rgb(${r},${g},${b})`;
}
