/** Formatação de números em português do Brasil, com notação científica em sobrescrito. */
const SUP: Record<string, string> = { "-": "⁻", "+": "", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };

export function sobrescrito(s: string | number): string {
  return String(s).split("").map((c) => SUP[c] ?? c).join("");
}

/** Número com vírgula decimal e casas fixas; "n/d" se não finito. */
export function br(v: number, casas = 1): string {
  if (!Number.isFinite(v)) return "n/d";
  const s = Math.abs(v).toFixed(casas);
  const neg = v < 0 && Number(s) !== 0;
  const [int, dec] = s.split(".");
  const milhar = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "−" : "") + milhar + (dec ? "," + dec : "");
}

/** Notação científica, 3,0×10¹⁵. */
export function sci(v: number, casas = 1): string {
  if (!Number.isFinite(v)) return "n/d";
  if (v === 0) return "0";
  const neg = v < 0;
  let a = Math.abs(v);
  let e = Math.floor(Math.log10(a));
  let m = a / 10 ** e;
  if (Number(m.toFixed(casas)) >= 10) {
    m /= 10;
    e += 1;
  }
  a = m;
  return (neg ? "−" : "") + a.toFixed(casas).replace(".", ",") + "×10" + sobrescrito(e);
}

/** Escolhe entre decimal e científica pela ordem de grandeza. */
export function num(v: number, sig = 3): string {
  if (!Number.isFinite(v)) return "n/d";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) return sci(v, Math.max(0, sig - 1));
  const casas = Math.max(0, sig - 1 - Math.floor(Math.log10(a)));
  return br(v, Math.min(casas, 6));
}

/** Tempo legível a partir de segundos. */
export function tempo(s: number): string {
  if (!Number.isFinite(s)) return "n/d";
  if (s < 1) return `${br(s * 1000, 0)} ms`;
  if (s < 120) return `${br(s, s < 10 ? 1 : 0)} s`;
  if (s < 7200) return `${br(s / 60, 1)} min`;
  return `${br(s / 3600, 1)} h`;
}

/** Número para CSV (ponto decimal, precisão completa). */
export function csvNum(v: number): string {
  return Number.isFinite(v) ? String(v) : "";
}
