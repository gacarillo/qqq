/**
 * Integral de Fermi-Dirac de ordem 1/2 normalizada, F_{1/2}(eta) -> exp(eta) no limite
 * não degenerado, tabelada de -40 a 120 como em gfetsim/eletrico/poisson.py.
 *
 * F(eta) = 2/sqrt(pi) int_0^inf sqrt(e) / (1 + exp(e - eta)) de. Com e = t^2 o integrando
 * fica 2 t^2 / (1 + exp(t^2 - eta)), suave, integrado por Simpson.
 */
import { interp } from "./numerico";

const ETA_MIN = -40;
const ETA_MAX = 120;
const N_TAB = 3201;

let tabEta: Float64Array | null = null;
let tabF: Float64Array | null = null;
let tabD: Float64Array | null = null;

function integrar(eta: number): number {
  const tMax = Math.sqrt(Math.max(eta, 0) + 60);
  const n = 2400;
  const dt = tMax / n;
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const t = i * dt;
    const arg = t * t - eta;
    const f = arg > 700 ? 0 : (2 * t * t) / (1 + Math.exp(arg));
    s += f * (i === 0 || i === n ? 1 : i % 2 ? 4 : 2);
  }
  return ((s * dt) / 3) * (2 / Math.sqrt(Math.PI));
}

function preparar(): void {
  if (tabEta) return;
  tabEta = new Float64Array(N_TAB);
  tabF = new Float64Array(N_TAB);
  tabD = new Float64Array(N_TAB);
  for (let i = 0; i < N_TAB; i++) {
    const eta = ETA_MIN + ((ETA_MAX - ETA_MIN) * i) / (N_TAB - 1);
    tabEta[i] = eta;
    tabF[i] = integrar(eta);
  }
  // np.gradient na tabela
  const h = (ETA_MAX - ETA_MIN) / (N_TAB - 1);
  tabD[0] = (tabF[1] - tabF[0]) / h;
  tabD[N_TAB - 1] = (tabF[N_TAB - 1] - tabF[N_TAB - 2]) / h;
  for (let i = 1; i < N_TAB - 1; i++) tabD[i] = (tabF[i + 1] - tabF[i - 1]) / (2 * h);
}

export function F12(eta: number): number {
  preparar();
  if (eta < ETA_MIN) return Math.exp(eta);
  return interp(eta, tabEta!, tabF!);
}

export function dF12(eta: number): number {
  preparar();
  return interp(eta, tabEta!, tabD!);
}
