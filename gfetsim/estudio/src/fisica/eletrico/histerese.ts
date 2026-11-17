/**
 * Histerese da tensão de Dirac por água adsorvida (R47, R48, R49), porte de eletrico/histerese.py.
 * Relaxação de primeira ordem [C]: dV_t/dt = (alfa (V_G - V_D0) - V_t) / tau.
 * alfa e tau são parâmetros de calibração [B].
 */
export function varrer(Vida: ArrayLike<number>, taxa_V_s: number, alfa: number, tau_s: number, VD0 = 0): { V: Float64Array; VD: Float64Array } {
  const n = Vida.length;
  const V = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    V[i] = Vida[i];
    V[2 * n - 1 - i] = Vida[i];
  }
  const Vt = new Float64Array(2 * n);
  for (let i = 1; i < 2 * n; i++) {
    const dt = Math.abs(V[i] - V[i - 1]) / taxa_V_s;
    const alvo = alfa * (V[i] - VD0);
    Vt[i] = alvo + (Vt[i - 1] - alvo) * Math.exp(-dt / tau_s);
  }
  return { V, VD: Float64Array.from(Vt, (v) => VD0 + v) };
}

/** Diferença entre o deslocamento na volta e na ida, no meio da varredura (V). */
export function largura(Vida: ArrayLike<number>, taxa_V_s: number, alfa: number, tau_s: number, VD0 = 0): number {
  const { VD } = varrer(Vida, taxa_V_s, alfa, tau_s, VD0);
  const n = Vida.length;
  const meio = Math.floor(n / 2);
  return VD[2 * n - 1 - meio] - VD[meio];
}

/** Um passo de relaxação, usado na operação em tempo real. */
export function relaxar(Vt: number, VG: number, VD0: number, alfa: number, tau_s: number, dt_s: number): number {
  const alvo = alfa * (VG - VD0);
  return alvo + (Vt - alvo) * Math.exp(-dt_s / tau_s);
}
