/**
 * Cena 3D do GFET de porta local em Three.js. Plano em µm reais, vertical multiplicado
 * pelo exagero escolhido. Corte A−A′ pelo centro do canal com tampas desenhadas na face
 * cortada; a tampa da região n⁺ mostra o perfil de P em profundidade do resultado.
 */
import type * as T from "three";
import type { OrbitControls as TipoOrbitClasse } from "three/addons/controls/OrbitControls.js";
import type { RoomEnvironment as TipoRoom } from "three/addons/environments/RoomEnvironment.js";

// O Three.js vem do CDN pelo mapa de importação e só carrega quando a vista 3D abre;
// sem ele, as outras vistas continuam funcionando.
let THREE: typeof T;
type TipoOrbit = TipoOrbitClasse;
let OrbitControls: typeof TipoOrbitClasse;
let RoomEnvironment: typeof TipoRoom;

export async function carregarThree(): Promise<void> {
  if (THREE) return;
  THREE = await import("three");
  ({ OrbitControls } = await import("three/addons/controls/OrbitControls.js"));
  ({ RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js"));
}
import { Aleatorio } from "@/nucleo/aleatorio";
import { interp } from "@/nucleo/numerico";
import type { Estado3D } from "./processo";

type Ponto2 = [number, number];
type Poligono = Ponto2[];

export interface Layout {
  L: number;
  W: number;
  a: number;
  b: number;
  chip: Poligono;
  np: Poligono;
  jan: Poligono;
  S: Poligono;
  Dr: Poligono;
  G: Poligono;
  canal: Poligono;
  folha: Poligono;
}

export interface Operacao3D {
  n_m2: number;
  E_Vm: number;
  I_Am: number;
  J_Am2: number;
  nEstrela_m2: number;
  rho0_m2: number;
  ruptura_Vm: number;
}

const retangulo = (x0: number, z0: number, x1: number, z1: number): Poligono => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

function layout(L: number, comMascara: boolean): Layout {
  const W = L, a = L / 2 + 5, b = W / 2 + 3;
  const chip = retangulo(-38, -50, 38, 26);
  // região n⁺ como retângulo sob o canal e braço até o contato da porta [I]
  const np: Poligono = comMascara ? [[-a, b], [a, b], [a, -b], [3, -b], [3, -b - 9], [7, -b - 9], [7, -b - 23], [-7, -b - 23], [-7, -b - 9], [-3, -b - 9], [-3, -b]] : chip;
  return {
    L, W, a, b, chip, np,
    jan: retangulo(-4.5, -b - 20, 4.5, -b - 12),
    S: retangulo(-L / 2 - 12, -W / 2 - 3, -L / 2, W / 2 + 3),
    Dr: retangulo(L / 2, -W / 2 - 3, L / 2 + 12, W / 2 + 3),
    G: retangulo(-6, -b - 21, 6, -b - 11),
    canal: retangulo(-L / 2 - 4, -W / 2, L / 2 + 4, W / 2),
    folha: retangulo(-37, -49, 37, 25),
  };
}

function cortesZ(contornos: Poligono[], z0: number): [number, number][] {
  const xs: number[] = [];
  for (const c of contornos)
    for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length];
      if (a[1] < z0 !== b[1] < z0) xs.push(a[0] + ((z0 - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
  xs.sort((p, q) => p - q);
  const r: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 1e-6) r.push([xs[i], xs[i + 1]]);
  return r;
}

export function pontoEm(pol: Poligono, x: number, z: number): boolean {
  let d = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const a = pol[i], b = pol[j];
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) d = !d;
  }
  return d;
}

interface Camada {
  g: T.Group;
  def(y0: number, y1: number, vis?: boolean): void;
}

function corCorpoNegro(T: number): T.Color {
  // aproximação visual do brilho térmico; só para desenho
  const t = Math.min(1, Math.max(0, (T - 450) / 650));
  return new THREE.Color(Math.min(1, 0.25 + 1.2 * t), Math.max(0, 1.1 * t * t - 0.05), Math.max(0, 0.9 * t * t * t - 0.05));
}

export class Cena3D {
  readonly ren: T.WebGLRenderer;
  readonly cena: T.Scene;
  readonly cam: T.PerspectiveCamera;
  readonly ctl: TipoOrbit;
  EV = 50;
  L = 10;
  cortar = true;
  comMascara = true;
  private plano: T.Plane;
  private geoCap: T.PlaneGeometry;
  private grupo: T.Group;
  private M: Record<string, T.MeshStandardMaterial> = {};
  private capNp: T.MeshBasicMaterial;
  private cvPerf = document.createElement("canvas");
  private texPerf: T.CanvasTexture;
  private cvGr = document.createElement("canvas");
  private texGr: T.CanvasTexture;
  private cvCu = document.createElement("canvas");
  private texCu: T.CanvasTexture;
  private brilho: T.PointLight;
  private C: Record<string, Camada> = {};
  private planos: Record<string, T.Mesh> = {};
  private particulas: Record<string, { pts: T.Points; dados: { x: number; y: number; z: number; v: number; f: number; u: number; w: number; s: number }[] }> = {};
  private campo: T.LineSegments;
  private Lt: Layout;
  private rnd = new Aleatorio(97);
  private ilhas: { x: number; z: number; r: number; a: number; f: number }[] = [];
  private dominios: { x: number; z: number; t0: number; a: number; v: number }[] = [];
  private ultimoCres = -1;
  private anim: { de: T.Vector3; deT: T.Vector3; para: T.Vector3; paraT: T.Vector3; t: number } | null = null;
  private w = 0;
  private h = 0;
  private camIni = false;
  rotulos: { el: HTMLElement; p: () => [number, number, number]; vis: (S: Estado3D) => boolean }[] = [];
  yFilme = 0;

  constructor(readonly canvas: HTMLCanvasElement, readonly sobreposicao: HTMLElement) {
    if (!THREE) throw new Error("carregue o Three.js com carregarThree() antes de criar a cena");
    this.cena = new THREE.Scene();
    this.plano = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    this.geoCap = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0);
    this.grupo = new THREE.Group();
    this.brilho = new THREE.PointLight(0xff6a1a, 0, 240, 0);
    this.ren = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.ren.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.ren.outputColorSpace = THREE.SRGBColorSpace;
    this.ren.localClippingEnabled = true;
    this.ren.toneMapping = THREE.ACESFilmicToneMapping;
    this.ren.toneMappingExposure = 0.72;
    const pm = new THREE.PMREMGenerator(this.ren);
    this.cena.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.cena.background = new THREE.Color(0x080b0e);
    this.cam = new THREE.PerspectiveCamera(34, 1.4, 0.5, 2000);
    this.cam.position.set(52, 40, 62);
    this.ctl = new OrbitControls(this.cam, canvas);
    this.ctl.enableDamping = true;
    this.ctl.dampingFactor = 0.08;
    this.ctl.target.set(0, -4, -8);
    this.ctl.maxDistance = 400;
    this.ctl.minDistance = 6;
    this.ctl.addEventListener("start", () => (this.anim = null));
    this.cena.add(new THREE.HemisphereLight(0xdfe8ee, 0x1a1f24, 0.5));
    const sol = new THREE.DirectionalLight(0xffffff, 1.6);
    sol.position.set(40, 90, 60);
    this.cena.add(sol);
    const contra = new THREE.DirectionalLight(0x8fb4ff, 0.5);
    contra.position.set(-60, 30, -50);
    this.cena.add(contra);
    this.cena.add(this.brilho);
    const mat = (cor: number, o: T.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.55, metalness: 0.05, ...o });
    this.M = {
      si: mat(0x3a4249, { roughness: 0.62, metalness: 0.2, envMapIntensity: 0.22 }), siCap: mat(0x353c42, { roughness: 0.8, envMapIntensity: 0.4 }),
      np: mat(0x36c2b4, { roughness: 0.45 }),
      ox: mat(0x7a6ee0, { transparent: true, opacity: 0.45, roughness: 0.3, depthWrite: false, envMapIntensity: 0.2 }), oxCap: mat(0x7a6ee0, { transparent: true, opacity: 0.85, roughness: 0.4, envMapIntensity: 0.3 }),
      masc: mat(0x6c5fd6, { transparent: true, opacity: 0.6, roughness: 0.2, envMapIntensity: 0.4 }), mascCap: mat(0x6c5fd6, { transparent: true, opacity: 0.85, envMapIntensity: 0.3 }),
      metal: mat(0xd4ad3c, { roughness: 0.32, metalness: 0.85 }), metalCap: mat(0xb8942e, { roughness: 0.5, metalness: 0.6 }),
      gr: new THREE.MeshStandardMaterial({ color: 0xd8dee2, envMapIntensity: 0.3, transparent: true, opacity: 0.55, roughness: 0.3, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false }),
      pmma: mat(0xe6eeff, { transparent: true, opacity: 0.28, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide }),
      cu: mat(0xc07a40, { roughness: 0.35, metalness: 0.75 }),
      liq: mat(0x2f8fa8, { transparent: true, opacity: 0.32, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide }),
    };
    this.cvPerf.width = 4;
    this.cvPerf.height = 128;
    this.texPerf = new THREE.CanvasTexture(this.cvPerf);
    this.texPerf.colorSpace = THREE.SRGBColorSpace;
    this.capNp = new THREE.MeshBasicMaterial({ map: this.texPerf });
    this.cvGr.width = this.cvGr.height = 1024;
    this.texGr = new THREE.CanvasTexture(this.cvGr);
    this.texGr.colorSpace = THREE.SRGBColorSpace;
    this.texGr.anisotropy = 4;
    this.M.gr.map = this.texGr;
    this.cvCu.width = this.cvCu.height = 512;
    this.texCu = new THREE.CanvasTexture(this.cvCu);
    this.texCu.colorSpace = THREE.SRGBColorSpace;
    this.M.cu.map = this.texCu;
    this.aplicarCorte();
    this.cena.add(this.grupo);
    this.Lt = layout(this.L, true);
    this.gerarIlhas();
    this.desenharTexGrafeno();
    this.construir();
    this.construirParticulas();
    const geoL = new THREE.BufferGeometry();
    geoL.setAttribute("position", new THREE.BufferAttribute(new Float32Array(288 * 3), 3));
    this.campo = new THREE.LineSegments(geoL, new THREE.LineBasicMaterial({ color: 0xb4aaff, transparent: true, opacity: 0.9, depthTest: false }));
    this.campo.renderOrder = 5;
    this.campo.frustumCulled = false;
    this.cena.add(this.campo);
  }

  get layout(): Layout {
    return this.Lt;
  }

  aplicarCorte(): void {
    for (const k of ["si", "np", "ox", "masc", "metal", "gr", "pmma"]) {
      this.M[k].clippingPlanes = this.cortar ? [this.plano] : [];
      this.M[k].needsUpdate = true;
    }
    const gc = this.planos.grCanal?.material as T.Material | undefined;
    if (gc) {
      gc.clippingPlanes = this.cortar ? [this.plano] : [];
      gc.needsUpdate = true;
    }
  }

  private camada(contornos: Poligono[], m: T.Material, mCap?: T.Material): Camada {
    const forma = new THREE.Shape(contornos[0].map(([x, z]) => new THREE.Vector2(x, -z)));
    for (const furo of contornos.slice(1)) forma.holes.push(new THREE.Path(furo.map(([x, z]) => new THREE.Vector2(x, -z))));
    const geo = new THREE.ExtrudeGeometry(forma, { depth: 1, bevelEnabled: false, curveSegments: 1 });
    geo.rotateX(-Math.PI / 2);
    const g = new THREE.Group();
    const malha = new THREE.Mesh(geo, m);
    g.add(malha);
    const tampas = cortesZ(contornos, 0).map(([a, b]) => {
      const c = new THREE.Mesh(this.geoCap, mCap ?? m);
      c.userData = { a, b };
      c.renderOrder = 2;
      g.add(c);
      return c;
    });
    this.grupo.add(g);
    return {
      g,
      def: (y0, y1, vis = true) => {
        const s = this.EV / 1000, hh = Math.max((y1 - y0) * s, 1e-4);
        g.visible = vis && y1 - y0 > 1e-6;
        malha.position.y = y0 * s;
        malha.scale.y = hh;
        for (const c of tampas) {
          c.visible = this.cortar;
          c.position.set(c.userData.a, y0 * s, 0.002);
          c.scale.set(c.userData.b - c.userData.a, hh, 1);
        }
      },
    };
  }

  construir(): void {
    while (this.grupo.children.length) {
      const c = this.grupo.children.pop()!;
      c.traverse((o) => {
        const m = o as T.Mesh;
        if (m.geometry && m.geometry !== this.geoCap) m.geometry.dispose();
      });
    }
    const Lt = (this.Lt = layout(this.L, this.comMascara));
    const M = this.M;
    const fora = this.comMascara ? [Lt.chip, Lt.np] : null;
    this.C = {
      siBase: this.camada([Lt.chip], M.si, M.siCap),
      siSob: this.camada([Lt.np], M.si, M.siCap),
      np: this.camada([Lt.np], M.np, this.capNp),
      oxN: this.camada([Lt.np], M.ox, M.oxCap),
      oxNJ: this.camada([Lt.np, Lt.jan], M.ox, M.oxCap),
      S: this.camada([Lt.S], M.metal, M.metalCap),
      Dr: this.camada([Lt.Dr], M.metal, M.metalCap),
      G: this.camada([Lt.G], M.metal, M.metalCap),
    };
    if (fora) {
      this.C.siCampo = this.camada(fora, M.si, M.siCap);
      this.C.masc = this.camada(fora, M.masc, M.mascCap);
      this.C.oxCampo = this.camada(fora, M.ox, M.oxCap);
    }
    const plano = (ret: Poligono, m: T.Material) => {
      const [x0, z0] = ret[0], [x1, z1] = ret[2];
      const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      geo.rotateX(-Math.PI / 2);
      const malha = new THREE.Mesh(geo, m);
      malha.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
      malha.renderOrder = 3;
      this.grupo.add(malha);
      const uv = geo.attributes.uv, pos = geo.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + malha.position.x + 37) / 74, 1 - (pos.getZ(i) + malha.position.z + 49) / 74);
      uv.needsUpdate = true;
      return malha;
    };
    const mCanal = M.gr.clone();
    mCanal.map = this.texGr;
    this.planos = {
      grFolha: plano(Lt.folha, M.gr),
      grCanal: plano(Lt.canal, mCanal),
      liq: plano(retangulo(-90, -90, 90, 66), M.liq),
    };
    const pmma = new THREE.Mesh(new THREE.BoxGeometry(74, 1, 74), M.pmma);
    pmma.position.z = -12;
    this.grupo.add(pmma);
    this.planos.pmma = pmma;
    const cu = new THREE.Mesh(new THREE.BoxGeometry(74, 1, 74), M.cu);
    cu.position.z = -12;
    this.grupo.add(cu);
    this.planos.cu = cu;
    this.aplicarCorte();
  }

  private gerarIlhas(): void {
    const r = new Aleatorio(23);
    const n = Math.round((74 * 74) / 36); // cerca de 6 µm entre ilhas (ART)
    const rm = Math.sqrt((0.17 * 36) / Math.PI); // raio médio para 17 % da área (ART)
    this.ilhas = Array.from({ length: n }, () => ({ x: -37 + r.real() * 74, z: -49 + r.real() * 74, r: rm * (0.55 + 0.9 * r.real()), a: r.real() * 6.28, f: 0.5 + r.real() * 0.5 }));
    this.dominios = Array.from({ length: 70 }, () => ({ x: -37 + r.real() * 74, z: -49 + r.real() * 74, t0: r.real() * 0.55, a: r.real() * 1.047, v: 0.8 + r.real() * 0.5 }));
  }

  private static hexagono(ctx: CanvasRenderingContext2D, x: number, y: number, raio: number, ang: number): void {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const t = ang + (k * Math.PI) / 3;
      if (k) ctx.lineTo(x + raio * Math.cos(t), y + raio * Math.sin(t));
      else ctx.moveTo(x + raio * Math.cos(t), y + raio * Math.sin(t));
    }
    ctx.closePath();
  }

  private desenharTexGrafeno(): void {
    const c = this.cvGr, ctx = c.getContext("2d")!, s = c.width / 74;
    ctx.fillStyle = "#c9d2d8";
    ctx.fillRect(0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
    for (let py = 0; py < c.height; py += 2)
      for (let px = 0; px < c.width; px += 2) {
        const x = -37 + px / s, z = -49 + py / s;
        let m1 = 1e9, m2 = 1e9;
        for (const p of this.dominios) {
          const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
          if (dd < m1) {
            m2 = m1;
            m1 = dd;
          } else if (dd < m2) m2 = dd;
        }
        if (Math.sqrt(m2) - Math.sqrt(m1) < 0.25)
          for (let yy = 0; yy < 2; yy++)
            for (let xx = 0; xx < 2; xx++) {
              const o = ((py + yy) * c.width + px + xx) * 4;
              d[o] = 150;
              d[o + 1] = 160;
              d[o + 2] = 168;
            }
      }
    ctx.putImageData(img, 0, 0);
    for (const il of this.ilhas) {
      ctx.fillStyle = `rgba(70,80,90,${0.55 + 0.3 * il.f})`;
      Cena3D.hexagono(ctx, (il.x + 37) * s, (il.z + 49) * s, il.r * s, il.a);
      ctx.fill();
    }
    this.texGr.needsUpdate = true;
  }

  private desenharTexCobre(cres: number): void {
    const c = this.cvCu, ctx = c.getContext("2d")!, s = c.width / 74;
    const g = ctx.createLinearGradient(0, 0, c.width, c.height);
    g.addColorStop(0, "#c27a3e");
    g.addColorStop(0.5, "#d08a4c");
    g.addColorStop(1, "#b5703a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    const r = new Aleatorio(3);
    ctx.strokeStyle = "rgba(90,45,20,.35)";
    for (let i = 0; i < 26; i++) {
      ctx.beginPath();
      ctx.moveTo(r.real() * c.width, r.real() * c.height);
      ctx.lineTo(r.real() * c.width, r.real() * c.height);
      ctx.stroke();
    }
    if (cres > 0) {
      for (const p of this.dominios) {
        const tt = Math.min(1, Math.max(0, (cres - p.t0) / (1 - p.t0)));
        if (tt <= 0) continue;
        ctx.fillStyle = "rgba(40,48,56,.55)";
        Cena3D.hexagono(ctx, (p.x + 37) * s, (p.z + 49) * s, tt * 13 * p.v * s, p.a);
        ctx.fill();
        ctx.strokeStyle = "rgba(220,230,236,.35)";
        ctx.stroke();
      }
      if (cres > 0.4)
        for (const il of this.ilhas) {
          ctx.fillStyle = "rgba(15,20,25,.5)";
          Cena3D.hexagono(ctx, (il.x + 37) * s, (il.z + 49) * s, il.r * s * Math.min(1, (cres - 0.4) / 0.6), il.a);
          ctx.fill();
        }
    }
    this.texCu.needsUpdate = true;
  }

  private desenharTexPerfil(S: Estado3D): void {
    const c = this.cvPerf, ctx = c.getContext("2d")!, H = c.height;
    const img = ctx.createImageData(c.width, H);
    for (let py = 0; py < H; py++) {
      // v = 1 no topo do Si atual, v = 0 na profundidade de 10^18
      const z = S.siN + ((S.jun - S.siN) * (py + 0.5)) / H;
      const zr = z - S.siN; // profundidade a partir da interface atual, como nos perfis
      const Ct = Math.max(S.C && S.x ? interp(zr, S.x, S.C) : 1e15, 1e15);
      const Ca = S.A && S.x ? Math.max(interp(zr, S.x, S.A), 1e15) : 1e15;
      const f = Math.min(1, Math.max(0, (Math.log10(Ct) - 18) / 3));
      const fa = Math.min(1, Math.max(0, Ca / Ct));
      let rgb = [227 * (1 - fa) + 54 * fa, 163 * (1 - fa) + 194 * fa, 42 * (1 - fa) + 180 * fa].map((v) => v * (0.25 + 0.75 * f) + 30 * (1 - f));
      if (zr < S.amorfo) rgb = rgb.map((v) => v * 0.55 + 40);
      for (let px = 0; px < c.width; px++) {
        const o = (py * c.width + px) * 4;
        img.data[o] = rgb[0];
        img.data[o + 1] = rgb[1];
        img.data[o + 2] = rgb[2];
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.texPerf.needsUpdate = true;
  }

  private construirParticulas(): void {
    const pontos = (n: number, tam: number, aditivo: boolean) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      const p = new THREE.Points(geo, new THREE.PointsMaterial({ size: tam, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true, blending: aditivo ? THREE.AdditiveBlending : THREE.NormalBlending }));
      p.frustumCulled = false;
      this.cena.add(p);
      return p;
    };
    const r = this.rnd;
    const dados = (n: number) => Array.from({ length: n }, () => ({ x: -36 + r.real() * 72, z: -48 + r.real() * 72, y: 40 * r.real(), v: 60 + 30 * r.real(), f: r.real() * 6.28, u: r.real(), w: r.real(), s: r.real() }));
    this.particulas = {
      ions: { pts: pontos(700, 0.7, true), dados: dados(700) },
      gas: { pts: pontos(500, 0.8, false), dados: dados(500).map((d) => ({ ...d, y: 30 * d.y / 40, v: 4 + 4 * d.s })) },
      port: { pts: pontos(1400, 0.85, false), dados: dados(1400) },
      fn: { pts: pontos(80, 0.8, true), dados: dados(80).map((d) => ({ ...d, f: 2 })) },
    };
  }

  irPara(preset: "geral" | "corte" | "cima"): void {
    const P = { geral: { p: [52, 40, 62], t: [0, -4, -8] }, corte: { p: [0, 2, 52], t: [0, -6, -2] }, cima: { p: [0.01, 120, 0.02], t: [0, 0, -12] } }[preset];
    const f = Math.min(1.9, Math.max(1, 1.35 / this.cam.aspect));
    const tt = new THREE.Vector3(...(P.t as [number, number, number]));
    this.anim = { de: this.cam.position.clone(), deT: this.ctl.target.clone(), para: new THREE.Vector3(...(P.p as [number, number, number])).sub(tt).multiplyScalar(f).add(tt), paraT: tt, t: 0 };
  }

  redimensionar(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.ren.setSize(w, h, false);
    this.canvas.style.height = `${h}px`;
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    this.w = w;
    this.h = h;
    if (!this.camIni) {
      this.camIni = true;
      this.cam.position.sub(this.ctl.target).multiplyScalar(Math.min(1.9, Math.max(1, 1.35 / this.cam.aspect))).add(this.ctl.target);
    }
  }

  aplicar(S: Estado3D, dt: number, op: Operacao3D | null, inclinacao: number): void {
    const C = this.C, s = this.EV / 1000, SUB = 320, M = this.M, P = this.planos;
    const temNp = !!S.C && S.jun > 1;
    C.siBase.def(-SUB - 20, -SUB);
    C.siCampo?.def(-SUB, -S.siF);
    C.siSob.def(-SUB, temNp ? -S.jun : -S.siN);
    C.np.def(-S.jun, -S.siN, temNp);
    if (temNp && S.C && S.A) {
      let mc = 0, ma = 0;
      for (let i = 0; i < S.C.length; i++) {
        mc = Math.max(mc, S.C[i]);
        ma = Math.max(ma, S.A[i]);
      }
      const fa = mc > 0 ? Math.min(1, ma / mc) : 0;
      M.np.color.copy(new THREE.Color(0xe3a32a).lerp(new THREE.Color(0x36c2b4), fa));
      if (S.amorfo > 0.5) M.np.color.multiplyScalar(0.7);
      this.desenharTexPerfil(S);
    }
    if (C.masc) {
      C.masc.def(0, 150, S.mascara > 0.01);
      M.masc.opacity = 0.6 * S.mascara;
      M.mascCap.opacity = 0.85 * S.mascara;
    }
    C.oxCampo?.def(-S.siF, S.xoxF - S.siF, S.xoxF > 0.05);
    const jan = S.janela > 0.5;
    C.oxN.def(-S.siN, S.xoxN - S.siN, S.xoxN > 0.05 && !jan);
    C.oxNJ.def(-S.siN, S.xoxN - S.siN, S.xoxN > 0.05 && jan);
    M.ox.emissive.setRGB(0, 0, 0);
    if (S.e.id === "janela") {
      const a = Math.min(1, Math.max(0, 1 - Math.abs(S.u - 0.4) * 3));
      M.ox.emissive.setRGB(0.15 * a, 0.12 * a, 0.3 * a);
    }
    const quente = S.T > 300 && S.cu < 0.5;
    const cb = corCorpoNegro(S.T), ib = quente ? Math.min(1, Math.max(0, (S.T - 400) / 700)) : 0;
    M.si.emissive.copy(cb).multiplyScalar(ib * 0.3);
    M.np.emissive.copy(cb).multiplyScalar(ib * 0.35);
    this.brilho.color.copy(cb);
    this.brilho.intensity = ib * 1.6;
    this.brilho.position.set(0, 30, 0);
    const topoN = (S.xoxN - S.siN) * s, topoF = (S.xoxF - S.siF) * s, yGr = Math.max(topoN, topoF) + 0.03;
    let yFilme = yGr, pm = 0, liq = 0, corLiq = 0x2f8fa8;
    const filme = S.grafeno > 0 || S.e.id === "transferencia";
    P.cu.visible = false;
    M.cu.emissive.setRGB(0, 0, 0);
    if (S.e.id === "cvd" && S.sub) {
      P.cu.visible = true;
      P.cu.scale.set(1, 0.3, 1);
      P.cu.position.set(0, 24, -12);
      const cres = S.sub.i < 2 ? 0 : S.sub.i === 2 ? S.sub.v : 1;
      if (Math.abs(cres - this.ultimoCres) > 0.01 || this.ultimoCres < 0) {
        this.desenharTexCobre(cres);
        this.ultimoCres = cres;
      }
      const ib2 = Math.min(1, Math.max(0, (S.T - 400) / 700));
      M.cu.emissive.copy(corCorpoNegro(S.T)).multiplyScalar(0.7 * ib2);
      this.brilho.color.copy(corCorpoNegro(S.T));
      this.brilho.intensity = 2.2 * ib2;
      this.brilho.position.set(0, 32, -12);
    }
    if (S.e.id === "transferencia" && S.sub) {
      const i = S.sub.i, v = S.sub.v, yAlto = 22;
      if (this.ultimoCres !== 1) {
        this.desenharTexCobre(1);
        this.ultimoCres = 1;
      }
      if (i <= 1) {
        P.cu.visible = S.cu > 0.02;
        P.cu.position.set(0, yAlto - 0.3, -12);
        P.cu.scale.set(1, 0.3 * Math.max(S.cu, 0.02), 1);
      }
      pm = i <= 4 ? 1 : i === 5 ? 1 - v : 0;
      if (i === 0) pm = Math.min(1, v * 1.4);
      if (i <= 2) yFilme = yAlto;
      else if (i === 3) yFilme = yAlto + (yGr - yAlto) * (v * v * (3 - 2 * v));
      if (i === 1) liq = 1;
      else if (i === 2) {
        liq = 1;
        corLiq = 0x6fb7d6;
      } else if (i === 3) {
        liq = 1 - v;
        corLiq = 0x6fb7d6;
      } else if (i === 5) {
        liq = 0.6;
        corLiq = 0xd8e6ee;
      }
    }
    this.yFilme = yFilme;
    P.liq.visible = liq > 0.02;
    P.liq.position.y = S.e.id === "transferencia" && S.sub && S.sub.i <= 3 ? 21.6 : yGr + 0.6;
    M.liq.color.setHex(corLiq);
    M.liq.opacity = 0.32 * liq;
    P.pmma.visible = pm > 0.02;
    P.pmma.scale.set(1, 0.5, 1);
    P.pmma.position.set(0, yFilme + 0.3, -12);
    M.pmma.opacity = 0.28 * pm;
    P.grFolha.visible = filme && S.canal < 1;
    P.grFolha.position.y = yFilme;
    (P.grFolha.material as T.MeshStandardMaterial).opacity = 0.55 * (1 - S.canal);
    P.grCanal.visible = filme && S.canal > 0;
    P.grCanal.position.y = yFilme + 0.005;
    const tMet = 60 * S.metal; // espessura ilustrativa de 60 nm [I]
    C.S.def(S.xoxF - S.siF, S.xoxN - S.siN + tMet, S.metal > 0.01);
    C.Dr.def(S.xoxF - S.siF, S.xoxN - S.siN + tMet, S.metal > 0.01);
    C.G.def(-S.siN, S.xoxN - S.siN + tMet, S.metal > 0.01);
    this.particulasProcesso(S, dt, inclinacao, topoN);
    this.operacao(S, dt, op, yGr);
  }

  private particulasProcesso(S: Estado3D, dt: number, inclinacao: number, topoN: number): void {
    const s = this.EV / 1000;
    const ions = this.particulas.ions;
    ions.pts.visible = S.e.id === "implante" && S.u < 0.95;
    if (ions.pts.visible) {
      const pos = ions.pts.geometry.attributes.position as T.BufferAttribute, cor = ions.pts.geometry.attributes.color as T.BufferAttribute;
      const sn = Math.sin((inclinacao * Math.PI) / 180), cs = Math.cos((inclinacao * Math.PI) / 180);
      const topoM = this.comMascara ? 150 * s : 0;
      ions.dados.forEach((q, k) => {
        q.y -= q.v * dt * cs;
        q.x += q.v * dt * sn;
        const dentro = !this.comMascara || pontoEm(this.Lt.np, q.x, q.z);
        const piso = dentro ? -40 * s : topoM - 30 * s;
        if (q.y < piso || q.x > 38) {
          q.y = 30 + 12 * this.rnd.real();
          q.x = -40 + this.rnd.real() * 76;
          q.z = -48 + this.rnd.real() * 72;
        }
        pos.setXYZ(k, q.x, q.y, q.z);
        const f = q.y < 0.3 ? 0.4 : 1;
        cor.setXYZ(k, f, f * 0.85, f * 0.5);
      });
      pos.needsUpdate = true;
      cor.needsUpdate = true;
    }
    const gas = this.particulas.gas;
    const gasO = S.e.id === "oxidacao", gasC = S.e.id === "cvd" && S.sub?.i === 2;
    gas.pts.visible = gasO || gasC;
    if (gas.pts.visible) {
      const pos = gas.pts.geometry.attributes.position as T.BufferAttribute, cor = gas.pts.geometry.attributes.color as T.BufferAttribute;
      const nAtivo = gasO ? Math.round(Math.min(1, Math.max(0.15, S.taxaOx / 3)) * 500) : 360;
      const y0 = gasC ? 24.4 : topoN;
      const cO = new THREE.Color(0xff8f80), cC = new THREE.Color(0xd8e0e6);
      gas.dados.forEach((q, k) => {
        if (k >= nAtivo) {
          pos.setXYZ(k, 0, -999, 0);
          return;
        }
        q.y -= q.v * dt;
        q.f += dt * 3;
        if (q.y < 0) {
          q.y = 10 + 14 * this.rnd.real();
          q.x = -36 + this.rnd.real() * 72;
          q.z = -48 + this.rnd.real() * 72;
        }
        pos.setXYZ(k, q.x + Math.sin(q.f) * 0.4, y0 + q.y, q.z + Math.cos(q.f * 0.7) * 0.4);
        const c = gasO ? cO : cC;
        cor.setXYZ(k, c.r, c.g, c.b);
      });
      pos.needsUpdate = true;
      cor.needsUpdate = true;
    }
  }

  private operacao(S: Estado3D, dt: number, op: Operacao3D | null, yGr: number): void {
    const ligado = S.e.id === "operacao" && !!op;
    const { port, fn } = this.particulas;
    port.pts.visible = ligado;
    this.campo.visible = ligado;
    fn.pts.visible = ligado;
    if (!ligado || !op) return;
    const s = this.EV / 1000, Lt = this.Lt;
    const raiz = Math.sqrt(op.n_m2 * op.n_m2 + op.nEstrela_m2 * op.nEstrela_m2);
    const ne = (op.n_m2 + raiz) / 2, nh = (-op.n_m2 + raiz) / 2;
    const N = port.dados.length, escala = 1.4e17;
    const nE = Math.round(Math.min(1, ne / escala) * N), nH = Math.round(Math.min(1, nh / escala) * N);
    const v = op.I_Am / (1.602176634e-19 * (Math.abs(op.n_m2) + op.rho0_m2));
    const vis = Math.min(1.2, Math.max(0, v / 2e5)) * 0.3;
    const pos = port.pts.geometry.attributes.position as T.BufferAttribute, cor = port.pts.geometry.attributes.color as T.BufferAttribute;
    const ce = new THREE.Color(0x4f97f0), ch = new THREE.Color(0xee6f6f);
    port.dados.forEach((d, k) => {
      const ehE = k < nE, ehH = k >= N - nH;
      if (!ehE && !ehH) {
        pos.setXYZ(k, 0, -999, 0);
        return;
      }
      const dir = ehE ? 1 : -1;
      d.u = (((d.u + dir * dt * vis * (0.6 + 0.8 * d.s)) % 1) + 1) % 1;
      pos.setXYZ(k, -Lt.L / 2 + d.u * Lt.L, yGr + 0.08, -Lt.W / 2 + d.w * Lt.W);
      const c = ehE ? ce : ch;
      cor.setXYZ(k, c.r, c.g, c.b);
    });
    pos.needsUpdate = true;
    cor.needsUpdate = true;
    const nl = Math.round(Math.min(12, (op.E_Vm / 1e8) * 1.6 + 1));
    const pl = this.campo.geometry.attributes.position as T.BufferAttribute;
    let k = 0;
    const siN = 0;
    for (let i = 0; i < nl; i++)
      for (let j = 0; j < nl; j++) {
        const x = -Lt.L / 2 + ((i + 0.5) / nl) * Lt.L, z = -Lt.W / 2 + ((j + 0.5) / nl) * Lt.W;
        pl.setXYZ(k++, x, yGr, z);
        pl.setXYZ(k++, x, -siN * s - 0.02, z);
      }
    for (; k < 288; k++) pl.setXYZ(k, 0, -999, 0);
    pl.needsUpdate = true;
    this.campo.geometry.setDrawRange(0, nl * nl * 2);
    (this.campo.material as T.LineBasicMaterial).color.set(op.E_Vm > 0.8 * op.ruptura_Vm ? 0xff6b5c : 0xb4aaff);
    const pf = fn.pts.geometry.attributes.position as T.BufferAttribute;
    const taxa = op.J_Am2 > 1e-8 ? Math.min(25, Math.max(0, (Math.log10(op.J_Am2 * 1e-4) + 12) * 1.5)) : 0;
    fn.dados.forEach((f, i) => {
      if (f.f >= 1 && Math.random() < (taxa * dt) / 8) {
        f.f = 0;
        f.x = -Lt.L / 2 + Math.random() * Lt.L;
        f.z = -Lt.W / 2 + Math.random() * Lt.W;
        f.s = op.n_m2 < 0 ? 1 : 0;
      }
      if (f.f < 1) {
        f.f += dt * 2;
        const yy = f.s ? f.f * yGr : yGr - f.f * yGr;
        pf.setXYZ(i, f.x, yy, f.z);
      } else pf.setXYZ(i, 0, -999, 0);
    });
    pf.needsUpdate = true;
  }

  desenhar(): void {
    if (this.anim) {
      this.anim.t = Math.min(1, this.anim.t + 1 / 50);
      const k = this.anim.t * this.anim.t * (3 - 2 * this.anim.t);
      this.cam.position.lerpVectors(this.anim.de, this.anim.para, k);
      this.ctl.target.lerpVectors(this.anim.deT, this.anim.paraT, k);
      if (this.anim.t >= 1) this.anim = null;
    }
    this.ctl.update();
    this.ren.render(this.cena, this.cam);
  }

  atualizarRotulos(S: Estado3D): void {
    const v = new THREE.Vector3();
    for (const r of this.rotulos) {
      if (!r.vis(S)) {
        r.el.style.display = "none";
        continue;
      }
      v.set(...r.p()).project(this.cam);
      if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) {
        r.el.style.display = "none";
        continue;
      }
      r.el.style.display = "block";
      r.el.style.left = `${((v.x + 1) / 2) * this.w}px`;
      r.el.style.top = `${((1 - v.y) / 2) * this.h}px`;
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
