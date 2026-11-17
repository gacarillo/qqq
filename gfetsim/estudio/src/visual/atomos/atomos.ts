/**
 * Cenas atômicas em Three.js: a cascata de um íon de P no Si com os recuos do RustBCA e o
 * grafeno sobre SiO2 amorfo, com a densidade local da tensão de porta e as poças de carga.
 */
import type * as T from "three";
import type { OrbitControls as TipoOrbitClasse } from "three/addons/controls/OrbitControls.js";
import dadosCascatas from "@/dados/cascatas.json";
import { Aleatorio } from "@/nucleo/aleatorio";

let THREE: typeof T;
let OrbitControls: typeof TipoOrbitClasse;
export async function carregarThreeAtomos(): Promise<void> {
  if (THREE) return;
  THREE = await import("three");
  ({ OrbitControls } = await import("three/addons/controls/OrbitControls.js"));
}

const A_SI = 0.5431; // nm, parâmetro de rede do Si [P]
const A_CC = 0.142; // nm, distância C–C [P]

interface CascataBruta {
  ion: [number, number, number, number][];
  n: number;
  pos: string;
  E: string;
  Z: string;
}

export interface Cascata {
  n: number;
  ini: Float32Array;
  fim: Float32Array;
  E: Int16Array;
  ion: [number, number, number, number][];
  tI: number[];
  t0: Float32Array;
  dur: Float32Array;
}

function b64u8(s: string): Uint8Array {
  const b = atob(s);
  const a = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
  return a;
}

export function decodificar(c: CascataBruta): Cascata {
  const u = b64u8(c.pos);
  const pos = new Int16Array(u.buffer, u.byteOffset, u.byteLength >> 1);
  const ue = b64u8(c.E);
  const E = new Int16Array(ue.buffer.slice(ue.byteOffset, ue.byteOffset + ue.byteLength));
  const n = c.n;
  const ini = new Float32Array(n * 3), fim = new Float32Array(n * 3);
  // RustBCA usa x como profundidade; na cena y = -x, x = y e z = z
  for (let k = 0; k < n; k++) {
    ini[3 * k] = pos[6 * k + 1] / 10;
    ini[3 * k + 1] = -pos[6 * k] / 10;
    ini[3 * k + 2] = pos[6 * k + 2] / 10;
    fim[3 * k] = pos[6 * k + 4] / 10;
    fim[3 * k + 1] = -pos[6 * k + 3] / 10;
    fim[3 * k + 2] = pos[6 * k + 5] / 10;
  }
  const ion = c.ion.map((p) => [p[1], -p[0], p[2], p[3]] as [number, number, number, number]);
  // tempo do íon com velocidade proporcional a raiz de E
  const tI = [0];
  for (let i = 1; i < ion.length; i++) {
    const d = Math.hypot(ion[i][0] - ion[i - 1][0], ion[i][1] - ion[i - 1][1], ion[i][2] - ion[i - 1][2]);
    tI.push(tI[i - 1] + d / Math.sqrt(Math.max(ion[i][3], 50) / 30000));
  }
  const tot = tI[tI.length - 1];
  const t0 = new Float32Array(n), dur = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let best = 1e9, bi = 0;
    const x = ini[3 * k], y = ini[3 * k + 1], z = ini[3 * k + 2];
    for (let i = 0; i < ion.length; i++) {
      const d = (ion[i][0] - x) ** 2 + (ion[i][1] - y) ** 2 + (ion[i][2] - z) ** 2;
      if (d < best) {
        best = d;
        bi = i;
      }
    }
    const L = Math.hypot(fim[3 * k] - x, fim[3 * k + 1] - y, fim[3 * k + 2] - z);
    t0[k] = tI[bi] / tot + Math.sqrt(best) * 0.004;
    dur[k] = Math.min(0.25, Math.max(0.01, (L / Math.sqrt(Math.max(E[k], 20))) * 0.02));
  }
  return { n, ini, fim, E, ion, tI: tI.map((v) => v / tot), t0, dur };
}

export const CASCATAS_BRUTAS = (dadosCascatas as unknown as { cascatas: CascataBruta[] }).cascatas;
export const FONTE_CASCATAS = (dadosCascatas as { fonte: string }).fonte;

function corEnergia(e: number): [number, number, number] {
  const f = Math.min(1, Math.max(0, (Math.log10(Math.max(e, 10)) - 1) / 3.5));
  return [0.35 + 0.65 * f, 0.18 + 0.72 * f, 0.05 + 0.5 * f * f];
}

export class CenaAtomos {
  readonly ren: T.WebGLRenderer;
  readonly cena: T.Scene;
  readonly cam: T.PerspectiveCamera;
  readonly ctl: TipoOrbitClasse;
  private grupo: T.Group;
  modo: "cascata" | "grafeno" = "cascata";
  private cas: Cascata | null = null;
  private ionM: T.Mesh | null = null;
  private trilha: T.Line | null = null;
  private rec: T.Points | null = null;
  private vac: T.Points | null = null;
  private rede: T.Points | null = null;
  nRede = 0;
  private grA: T.Points | null = null;
  private grPos: Float32Array | null = null;
  private aguas: T.Group[] = [];
  private pocas: { x: number; z: number; s: number; l: number }[] = [];
  marcas: { el: HTMLElement; p: [number, number, number] }[] = [];
  private w = 0;
  private h = 0;

  constructor(readonly canvas: HTMLCanvasElement, readonly sobreposicao: HTMLElement) {
    if (!THREE) throw new Error("carregue o Three.js antes");
    this.ren = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.ren.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.ren.outputColorSpace = THREE.SRGBColorSpace;
    this.cena = new THREE.Scene();
    this.cena.background = new THREE.Color(0x080b0e);
    this.cam = new THREE.PerspectiveCamera(38, 1.4, 0.05, 2000);
    this.ctl = new OrbitControls(this.cam, canvas);
    this.ctl.enableDamping = true;
    this.cena.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.6));
    const luz = new THREE.DirectionalLight(0xffffff, 1.2);
    luz.position.set(30, 60, 40);
    this.cena.add(luz);
    this.grupo = new THREE.Group();
    this.cena.add(this.grupo);
  }

  redimensionar(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.ren.setSize(w, h, false);
    this.canvas.style.height = `${h}px`;
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    this.w = w;
    this.h = h;
  }

  private limpar(): void {
    while (this.grupo.children.length) {
      const c = this.grupo.children.pop()!;
      c.traverse((o) => {
        const m = o as T.Mesh;
        m.geometry?.dispose();
        const mat = m.material as T.Material | T.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
    }
    this.sobreposicao.replaceChildren();
    this.marcas = [];
  }

  montarCascata(c: Cascata, Rp: number): void {
    this.limpar();
    this.modo = "cascata";
    this.cas = c;
    const g = this.grupo;
    const sup = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshBasicMaterial({ color: 0x8f84e6, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
    sup.rotation.x = -Math.PI / 2;
    g.add(sup);
    const grade = new THREE.GridHelper(120, 12, 0x2a343c, 0x1c252b);
    grade.position.y = -0.01;
    g.add(grade);
    const pts = c.ion.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    this.trilha = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffd27a }));
    g.add(this.trilha);
    this.ionM = new THREE.Mesh(new THREE.SphereGeometry(0.9, 18, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.ionM.add(new THREE.Mesh(new THREE.SphereGeometry(2.2, 18, 12), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.25, depthWrite: false })));
    g.add(this.ionM);
    const cor = new Float32Array(c.n * 3);
    for (let k = 0; k < c.n; k++) cor.set(corEnergia(c.E[k]), 3 * k);
    const geoR = new THREE.BufferGeometry();
    geoR.setAttribute("position", new THREE.BufferAttribute(new Float32Array(c.n * 3), 3));
    geoR.setAttribute("color", new THREE.BufferAttribute(cor, 3));
    this.rec = new THREE.Points(geoR, new THREE.PointsMaterial({ size: 0.55, vertexColors: true, sizeAttenuation: true }));
    this.rec.frustumCulled = false;
    g.add(this.rec);
    const geoV = new THREE.BufferGeometry();
    geoV.setAttribute("position", new THREE.BufferAttribute(new Float32Array(c.n * 3), 3));
    this.vac = new THREE.Points(geoV, new THREE.PointsMaterial({ size: 0.45, color: 0xee6f6f, transparent: true, opacity: 0.55, sizeAttenuation: true, depthWrite: false }));
    this.vac.frustumCulled = false;
    g.add(this.vac);
    // rede de diamante perto da trajetória, só como referência visual (o BCA trata o alvo como amorfo)
    const chave = new Set<string>(), rede: number[] = [];
    const base = [[0, 0, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [0.5, 0.5, 0], [0.25, 0.25, 0.25], [0.25, 0.75, 0.75], [0.75, 0.25, 0.75], [0.75, 0.75, 0.25]];
    const r2 = 1.3 * 1.3;
    for (const p of c.ion) {
      if (p[1] > 0.1) continue;
      const i0 = Math.floor((p[0] - 1.4) / A_SI), i1 = Math.ceil((p[0] + 1.4) / A_SI), j0 = Math.floor((p[1] - 1.4) / A_SI), j1 = Math.ceil((p[1] + 1.4) / A_SI), k0 = Math.floor((p[2] - 1.4) / A_SI), k1 = Math.ceil((p[2] + 1.4) / A_SI);
      for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) for (let d = k0; d <= k1; d++) base.forEach((bb, m) => {
        const x = (a + bb[0]) * A_SI, y = (b + bb[1]) * A_SI, z = (d + bb[2]) * A_SI;
        if (y > 0 || (x - p[0]) ** 2 + (y - p[1]) ** 2 + (z - p[2]) ** 2 > r2) return;
        const ch = `${a},${b},${d},${m}`;
        if (chave.has(ch)) return;
        chave.add(ch);
        rede.push(x, y, z);
      });
    }
    const geoD = new THREE.BufferGeometry();
    geoD.setAttribute("position", new THREE.BufferAttribute(new Float32Array(rede), 3));
    this.rede = new THREE.Points(geoD, new THREE.PointsMaterial({ size: 0.16, color: 0x8a98a2, transparent: true, opacity: 0.55, sizeAttenuation: true, depthWrite: false }));
    g.add(this.rede);
    this.nRede = rede.length / 3;
    for (let z = 0; z <= 120; z += 20) this.marca(`${z} nm`, [-34, -z, 0]);
    this.marca(`Rp ${Rp.toFixed(0)} nm`, [30, -Rp, 0]);
    const ext = Math.max(...c.ion.map((p) => -p[1]));
    this.ctl.target.set(0, -ext / 2, 0);
    this.cam.position.set(70, -ext / 2 + 25, 90);
  }

  private marca(t: string, p: [number, number, number]): void {
    const d = document.createElement("div");
    d.className = "rotulo3d";
    d.textContent = t;
    this.sobreposicao.append(d);
    this.marcas.push({ el: d, p });
  }

  mostrarRede(v: boolean): void {
    if (this.rede) this.rede.visible = v;
  }

  /** Avança a cascata até t (0 a 1,35); devolve leituras do instante. */
  passoCascata(t: number): { prof: number; E: number; lancados: number; Etot: number; fim: number } {
    const c = this.cas!;
    const k = Math.min(1, Math.max(0, t));
    let i = c.tI.findIndex((v) => v >= k);
    if (i < 0) i = c.ion.length - 1;
    const p = c.ion[i];
    this.ionM!.position.set(p[0], p[1], p[2]);
    this.ionM!.visible = t < 1.02;
    this.trilha!.geometry.setDrawRange(0, i + 1);
    const pos = (this.rec!.geometry.attributes.position as T.BufferAttribute).array as Float32Array;
    const vac = (this.vac!.geometry.attributes.position as T.BufferAttribute).array as Float32Array;
    let nAt = 0, eTot = 0;
    for (let r = 0; r < c.n; r++) {
      const j = 3 * r;
      if (t < c.t0[r]) {
        pos[j + 1] = 999;
        vac[j + 1] = 999;
        continue;
      }
      const f = Math.min(1, Math.max(0, (t - c.t0[r]) / c.dur[r]));
      const s = 1 - (1 - f) * (1 - f);
      pos[j] = c.ini[j] + (c.fim[j] - c.ini[j]) * s;
      pos[j + 1] = c.ini[j + 1] + (c.fim[j + 1] - c.ini[j + 1]) * s;
      pos[j + 2] = c.ini[j + 2] + (c.fim[j + 2] - c.ini[j + 2]) * s;
      vac[j] = c.ini[j];
      vac[j + 1] = c.ini[j + 1];
      vac[j + 2] = c.ini[j + 2];
      nAt++;
      eTot += c.E[r];
    }
    this.rec!.geometry.attributes.position.needsUpdate = true;
    this.vac!.geometry.attributes.position.needsUpdate = true;
    return { prof: -p[1], E: p[3], lancados: nAt, Etot: eTot, fim: -c.ion[c.ion.length - 1][1] };
  }

  montarGrafeno(): number {
    this.limpar();
    this.modo = "grafeno";
    const g = this.grupo, Lx = 20, Lz = 20, a = A_CC;
    const r = new Aleatorio(77);
    // SiO2 amorfo: pontos aleatórios, Si e O na proporção 1 para 2 (só desenho)
    const nOx = Math.round(Lx * Lz * 2 * 66 * 0.35);
    const ox = new Float32Array(nOx * 3), oxc = new Float32Array(nOx * 3);
    for (let i = 0; i < nOx; i++) {
      ox[3 * i] = -Lx / 2 + r.real() * Lx;
      ox[3 * i + 1] = -0.32 - r.real() * 2;
      ox[3 * i + 2] = -Lz / 2 + r.real() * Lz;
      oxc.set(r.real() < 1 / 3 ? [0.54, 0.6, 0.64] : [0.9, 0.42, 0.38], 3 * i);
    }
    const gOx = new THREE.BufferGeometry();
    gOx.setAttribute("position", new THREE.BufferAttribute(ox, 3));
    gOx.setAttribute("color", new THREE.BufferAttribute(oxc, 3));
    g.add(new THREE.Points(gOx, new THREE.PointsMaterial({ size: 0.11, vertexColors: true, transparent: true, opacity: 0.8 })));
    const atomos: number[] = [], lig: number[] = [];
    const a1 = [1.5 * a, (Math.sqrt(3) / 2) * a], a2 = [1.5 * a, (-Math.sqrt(3) / 2) * a];
    const ni = Math.ceil(Lx / (1.5 * a)) + 2, nj = Math.ceil(Lz / (Math.sqrt(3) * a)) + 2;
    const idx = new Map<string, number>();
    const alt = (x: number, z: number) => 0.12 * Math.sin(x * 0.9 + 1.3) * Math.cos(z * 0.7) + 0.08 * Math.sin(x * 2.1 - z * 1.7); // rugosidade ilustrativa [I]
    for (let i = -ni; i <= ni; i++)
      for (let j = -nj; j <= nj; j++)
        for (let s = 0; s < 2; s++) {
          const x = i * a1[0] + j * a2[0] + s * a, z = i * a1[1] + j * a2[1];
          if (Math.abs(x) > Lx / 2 || Math.abs(z) > Lz / 2) continue;
          idx.set(`${i},${j},${s}`, atomos.length / 3);
          atomos.push(x, alt(x, z), z);
        }
    for (const [ch, k] of idx) {
      const [i, j, s] = ch.split(",").map(Number);
      if (s !== 0) continue;
      for (const v of [[i, j, 1], [i - 1, j, 1], [i, j - 1, 1]]) {
        const m = idx.get(v.join(","));
        if (m !== undefined) lig.push(k, m);
      }
    }
    const nA = atomos.length / 3;
    const pos = new Float32Array(atomos), cor = new Float32Array(nA * 3).fill(0.8);
    const gA = new THREE.BufferGeometry();
    gA.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    gA.setAttribute("color", new THREE.BufferAttribute(cor, 3));
    this.grA = new THREE.Points(gA, new THREE.PointsMaterial({ size: 0.09, vertexColors: true }));
    g.add(this.grA);
    const gL = new THREE.BufferGeometry();
    gL.setAttribute("position", gA.attributes.position);
    gL.setAttribute("color", gA.attributes.color);
    gL.setIndex(lig);
    g.add(new THREE.LineSegments(gL, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6 })));
    // ilha de bicamada AB, como as ilhas multicamada do Raman (lá têm µm)
    const bi: number[] = [];
    for (let k = 0; k < nA; k++) {
      const x = pos[3 * k] + a, z = pos[3 * k + 2];
      if ((x - 5) ** 2 + (z + 5) ** 2 < 9) bi.push(x, pos[3 * k + 1] + 0.335, z);
    }
    const gB = new THREE.BufferGeometry();
    gB.setAttribute("position", new THREE.BufferAttribute(new Float32Array(bi), 3));
    g.add(new THREE.Points(gB, new THREE.PointsMaterial({ size: 0.07, color: 0xb9c3c9, transparent: true, opacity: 0.75 })));
    // água presa na interface (R47, R48)
    const mO = new THREE.MeshBasicMaterial({ color: 0x9fd3ff }), mH = new THREE.MeshBasicMaterial({ color: 0xe7ecef });
    const geoO = new THREE.SphereGeometry(0.075, 10, 8), geoH = new THREE.SphereGeometry(0.045, 8, 6);
    this.aguas = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Group();
      m.add(new THREE.Mesh(geoO, mO));
      const h1 = new THREE.Mesh(geoH, mH), h2 = new THREE.Mesh(geoH, mH);
      h1.position.set(0.076, 0.059, 0);
      h2.position.set(-0.076, 0.059, 0);
      m.add(h1, h2);
      m.position.set(-Lx / 2 + r.real() * Lx, -0.17, -Lz / 2 + r.real() * Lz);
      m.userData.f = r.real() * 6.28;
      g.add(m);
      this.aguas.push(m);
    }
    // poças: soma de gaussianas com amplitude de n* e comprimento ilustrativo de 3 a 7 nm [I]
    this.pocas = Array.from({ length: 22 }, () => ({ x: -Lx / 2 + r.real() * Lx, z: -Lz / 2 + r.real() * Lz, s: r.real() < 0.5 ? -1 : 1, l: 3 + r.real() * 4 }));
    this.grPos = pos;
    this.ctl.target.set(0, 0, 0);
    this.cam.position.set(4.5, 3.2, 6);
    return nA;
  }

  nLocal(x: number, z: number, nMed: number, nEstrela: number): number {
    let d = 0;
    for (const p of this.pocas) d += p.s * Math.exp(-((x - p.x) ** 2 + (z - p.z) ** 2) / (2 * p.l * p.l));
    return nMed + nEstrela * 1.6 * d;
  }

  colorirGrafeno(nMed: number, nEstrela: number, anguloAgua: number, t: number): void {
    if (!this.grA || !this.grPos) return;
    const cor = this.grA.geometry.attributes.color as T.BufferAttribute;
    const ce = new THREE.Color(0x4f97f0), ch = new THREE.Color(0xee6f6f), cn = new THREE.Color(0xcfd6da);
    const pos = this.grPos;
    for (let k = 0; k < pos.length / 3; k++) {
      const n = this.nLocal(pos[3 * k], pos[3 * k + 2], nMed, nEstrela);
      const f = Math.min(1, Math.abs(n) / 1.2e16) ** 0.6;
      const c = n > 0 ? ce : ch;
      cor.setXYZ(k, cn.r + (c.r - cn.r) * f, cn.g + (c.g - cn.g) * f, cn.b + (c.b - cn.b) * f);
    }
    cor.needsUpdate = true;
    for (const m of this.aguas) {
      m.rotation.z = anguloAgua + 0.25 * Math.sin(t * 2 + (m.userData.f as number));
      m.rotation.y = t * 0.3 + (m.userData.f as number);
    }
  }

  desenhar(): void {
    this.ctl.update();
    this.ren.render(this.cena, this.cam);
    const v = new THREE.Vector3();
    for (const m of this.marcas) {
      v.set(...m.p).project(this.cam);
      const ok = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      m.el.style.display = ok ? "block" : "none";
      if (ok) {
        m.el.style.left = `${((v.x + 1) / 2) * this.w}px`;
        m.el.style.top = `${((1 - v.y) / 2) * this.h}px`;
      }
    }
  }

  png(): HTMLCanvasElement {
    this.ren.render(this.cena, this.cam);
    const c = document.createElement("canvas");
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    c.getContext("2d")!.drawImage(this.canvas, 0, 0);
    return c;
  }
}
