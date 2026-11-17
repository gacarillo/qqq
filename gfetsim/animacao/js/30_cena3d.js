/* ===================================================================== DISPOSITIVO 3D */
const TEM3D = typeof THREE !== "undefined" && (() => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } })();

const ETAPAS_3D = [
  { id: "lamina", nome: "Lâmina", dur: 3 },
  { id: "mascara", nome: "Máscara", dur: 4 },
  { id: "implante", nome: "Implantação", dur: 8 },
  { id: "remocao", nome: "Remoção da máscara", dur: 3 },
  { id: "recozimento", nome: "Recozimento", dur: 8 },
  { id: "oxidacao", nome: "Óxido de porta", dur: 8 },
  { id: "janela", nome: "Janela da porta", dur: 4 },
  { id: "cvd", nome: "CVD sobre Cu", dur: 10 },
  { id: "transferencia", nome: "Transferência", dur: 16 },
  { id: "canal", nome: "Canal", dur: 4 },
  { id: "contatos", nome: "Contatos", dur: 4 },
  { id: "operacao", nome: "Operação", dur: 6 },
];
(() => { let t = 0; ETAPAS_3D.forEach(e => { e.ini = t; t += e.dur; }); })();
const TT_3D = ETAPAS_3D.reduce((s, e) => s + e.dur, 0);
const est3 = { t: 0.001, tocando: !reduzir, vel: 1, EV: 50, L: 10, cortar: true, pronto: false };

/* sub-etapas da CVD e da transferência, com a receita da seção 2.4 do artigo [B] */
const SUB_CVD = [
  { ate: 0.14, nome: "aquecimento", txt: "A folha de cobre aquece até 1000 °C em 410 sccm de Ar, à pressão atmosférica.", T: [25, 1000] },
  { ate: 0.34, nome: "recozimento do Cu", txt: "Recozimento de 1 h a 1000 °C em 15 sccm de H₂ e 150 sccm de Ar. Os grãos do cobre crescem e a superfície perde o óxido.", T: [1000, 1000] },
  { ate: 0.82, nome: "crescimento", txt: "Crescimento de 20 min a 1000 °C com 5 sccm de CH₄, 5 sccm de H₂ e 150 sccm de Ar. O metano se decompõe na superfície do cobre, os domínios hexagonais nucleiam, crescem e se fecham num filme contínuo. Parte dos núcleos ganha uma segunda camada por baixo, origem das ilhas que o Raman mostrou.", T: [1000, 1000] },
  { ate: 1.00, nome: "resfriamento", txt: "Resfriamento em 410 sccm de Ar até 500 °C e, abaixo disso, sob purga de N₂. Na amostra SC o cobre ficou descoberto e deu o filme contínuo de 7 × 5 mm.", T: [1000, 25] },
];
const SUB_TR = [
  { ate: 0.08, nome: "PMMA", txt: "Três gotas de PMMA a 4,9 % em massa em acetona (0,5 g em 9,8 g) sobre o grafeno no cobre, curadas a 40 °C por 20 min e a 50 °C por 10 min. O spin coating foi testado e o PMMA solidificou antes do esperado.", T: 45 },
  { ate: 0.26, nome: "corrosão do Cu", txt: "A amostra flutua durante a noite sobre o reagente de Marble, com cerca de 20 g de CuSO₄ anidro, 100 mL de HCl concentrado e 100 mL de água, perto de 0,6 mol/L de CuSO₄. O cobre se dissolve e sobra o filme PMMA e grafeno.", T: 25 },
  { ate: 0.42, nome: "quatro banhos de água", txt: "Quatro banhos de água deionizada de 30 a 40 min. Pelo registro do protocolo é a etapa mais crítica, porque o filme que encosta na parede do recipiente deforma ou rasga.", T: 25 },
  { ate: 0.56, nome: "pescagem", txt: "O filme é pescado sobre a lâmina, que sobe por baixo dele e o recolhe da água.", T: 25 },
  { ate: 0.68, nome: "secagem e adesão", txt: "Secagem ao ar por 1 a 2 h e aquecimento a 60 °C por 5 min e a 130 °C por 10 min para melhorar a adesão. A água presa entre o filme e o óxido sai aos poucos.", T: 130 },
  { ate: 0.86, nome: "acetona", txt: "Quatro banhos de acetona de 30 min dissolvem o PMMA. Fica um resíduo fino, que espalha portadores como as impurezas carregadas.", T: 25 },
  { ate: 0.92, nome: "álcool e N₂", txt: "Enxágue em álcool isopropílico e secagem com N₂.", T: 25 },
  { ate: 1.00, nome: "170 °C", txt: "Recozimento em chapa aquecedora a 170 °C por pelo menos 30 min, que tira parte do resíduo e da água adsorvida.", T: 170 },
];
const subDe = (lista, u) => { let a = 0; for (let i = 0; i < lista.length; i++) { if (u < lista[i].ate || i === lista.length - 1) return { s: lista[i], i, v: clamp((u - a) / (lista[i].ate - a), 0, 1) }; a = lista[i].ate; } };

/* ---------------------------------------------------------------- dados de processo em função da etapa */
function profundidade(C, lim) { // primeira profundidade abaixo do pico com C < lim
  let k0 = 0; for (let k = 1; k < C.length; k++) if (C[k] > C[k0]) k0 = k;
  for (let k = k0; k < C.length; k++) if (C[k] < lim) return k === 0 ? 0 : interp([C[k], C[k - 1]], [G[k], G[k - 1]], lim);
  return G[G.length - 1];
}
function perfilImplante() { return G.map(x => interp(I.x, I.C, x)); }
function estadoProc3(t) {
  const e = etapaEm(ETAPAS_3D, t), u = clamp((t - e.ini) / e.dur, 0, 1), ord = ETAPAS_3D.indexOf(e);
  const R = rec1D(), O = oxi1D(), comMasc = PROC.mascara === "A";
  const S = { e, u, ord, mascara: 0, dose: 0, C: null, A: null, amorfo: 0, T: 25, xoxN: 0, xoxF: 0, janela: 0, grafeno: 0, canal: 0, metal: 0, cu: 0, tReal: "", taxaOx: 0 };
  const idx = id => ETAPAS_3D.findIndex(x => x.id === id);
  if (ord >= idx("mascara") && comMasc) S.mascara = ord === idx("mascara") ? clamp(u * 1.5, 0, 1) : ord === idx("remocao") ? 1 - u : ord < idx("remocao") ? 1 : 0;
  const Cimp = perfilImplante();
  if (ord < idx("implante")) { S.C = null; }
  else if (ord === idx("implante")) { S.dose = clamp(u * 1.08, 0, 1); S.C = Cimp.map(c => c * S.dose); S.A = S.C.map(() => 0);
    const dl = LIM_CENTRAL / I.dose; S.amorfo = S.dose > dl ? (I.amorfo[1] - I.amorfo[0]) * clamp((S.dose - dl) / (1 - dl), 0, 1) ** 0.5 : 0; S.tReal = `${br(S.dose * 100, 0)} % da dose`; }
  else if (ord <= idx("remocao")) { S.dose = 1; S.C = Cimp; S.A = Cimp.map(() => 0); S.amorfo = I.amorfo[1] - I.amorfo[0]; }
  else if (ord === idx("recozimento")) {
    const fr = R.quadros, s = u * (fr.length - 1), i0 = Math.floor(s), i1 = Math.min(fr.length - 1, i0 + 1), w = s - i0;
    S.C = fr[i0].C.map((c, k) => c * (1 - w) + fr[i1].C[k] * w); S.A = fr[i0].A.map((c, k) => c * (1 - w) + fr[i1].A[k] * w);
    S.T = fr[i0].T * (1 - w) + fr[i1].T * w; S.amorfo = (fr[i0].frente_amorfa || 0) * (1 - w) + (fr[i1].frente_amorfa || 0) * w;
    S.etapaRec = fr[i0].etapa; S.tReal = `${fr[i0].etapa}, ${fr[i0].t_s > 120 ? br(fr[i0].t_s / 60, 1) + " min" : br(fr[i0].t_s, 1) + " s"}`; S.dose = 1;
  } else {
    const ult = R.quadros[R.quadros.length - 1]; S.dose = 1;
    const ox = O.quadros, fim = ox[ox.length - 1];
    if (ord === idx("oxidacao")) {
      const s = u * (ox.length - 1), i0 = Math.floor(s), i1 = Math.min(ox.length - 1, i0 + 1), w = s - i0;
      S.C = ox[i0].C.map((c, k) => c * (1 - w) + ox[i1].C[k] * w); S.A = ox[i0].A.map((c, k) => c * (1 - w) + ox[i1].A[k] * w);
      const tm = ox[i0].t_min * (1 - w) + ox[i1].t_min * w;
      S.xoxN = interp(O.curva.t, O.curva.x, tm); S.T = +PROC.T; S.tReal = `${br(tm, 1)} min`;
      S.taxaOx = (interp(O.curva.t, O.curva.x, tm + 0.2) - S.xoxN) / 0.2;
      S.xoxF = comMasc ? interp([0].concat(BD.oxidacao[chaveProc()].map(f => f.t_min)), [0].concat(BD.oxidacao[chaveProc()].map(f => f.xox[0])), tm) : S.xoxN;
    } else {
      S.C = fim.C; S.A = fim.A; S.xoxN = fim.x_ox; S.xoxF = comMasc ? BD.oxidacao[chaveProc()].slice(-1)[0].xox[0] : fim.x_ox;
    }
    if (!S.C) { S.C = ult.C; S.A = ult.A; }
    if (ord >= idx("janela")) S.janela = ord === idx("janela") ? clamp(u * 1.4 - 0.2, 0, 1) : 1;
    if (ord === idx("cvd")) { S.cu = 1; const sb = subDe(SUB_CVD, u); S.sub = sb; S.T = sb.s.T[0] + (sb.s.T[1] - sb.s.T[0]) * sb.v; }
    if (ord === idx("transferencia")) { const sb = subDe(SUB_TR, u); S.sub = sb; S.T = sb.s.T; S.cu = sb.i === 0 ? 1 : sb.i === 1 ? 1 - sb.v : 0; S.grafeno = sb.i >= 3 ? 1 : 0; }
    if (ord > idx("transferencia")) S.grafeno = 1;
    if (ord >= idx("canal")) S.canal = ord === idx("canal") ? clamp(u * 1.3, 0, 1) : 1;
    if (ord >= idx("contatos")) S.metal = ord === idx("contatos") ? clamp(u * 1.3, 0, 1) : 1;
  }
  S.siN = CONSUMO * S.xoxN; S.siF = CONSUMO * S.xoxF;
  S.jun = S.C ? profundidade(S.C, 1e18) : 0;
  return S;
}

if (!TEM3D) {
  ["cv-3d", "cv-atomos"].forEach(id => { const c = document.getElementById(id); const d = document.createElement("div"); d.className = "aviso3d"; d.textContent = "Este navegador não abriu o WebGL, e as cenas 3D não podem ser desenhadas. As abas Fabricação 2D e Operação funcionam normalmente."; c.replaceWith(d); });
}

/* ---------------------------------------------------------------- utilidades de geometria */
function retangulo(x0, z0, x1, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
function cortesZ(contornos, z0) { // pares de x onde o plano z = z0 cruza a região (regra par e ímpar)
  const xs = [];
  contornos.forEach(c => { for (let i = 0; i < c.length; i++) { const a = c[i], b = c[(i + 1) % c.length]; if ((a[1] < z0) !== (b[1] < z0)) xs.push(a[0] + (z0 - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); } });
  xs.sort((a, b) => a - b); const r = []; for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 1e-6) r.push([xs[i], xs[i + 1]]); return r;
}

let R3 = null; // tudo da cena 3D
function iniciar3D() {
  if (!TEM3D || R3) return;
  const cv = document.getElementById("cv-3d");
  const ren = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: "high-performance" });
  ren.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  ren.outputEncoding = THREE.sRGBEncoding; ren.localClippingEnabled = true;
  ren.toneMapping = THREE.ACESFilmicToneMapping; ren.toneMappingExposure = 0.72;
  const cena = new THREE.Scene(); cena.background = new THREE.Color(0x0a0e11);
  cena.fog = new THREE.Fog(0x0a0e11, 260, 520);
  if (THREE.RoomEnvironment) { const pm = new THREE.PMREMGenerator(ren); cena.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture; }
  const cam = new THREE.PerspectiveCamera(34, 1.4, 0.5, 2000);
  cam.position.set(52, 40, 62);
  const ctl3 = new THREE.OrbitControls(cam, cv); ctl3.enableDamping = true; ctl3.dampingFactor = 0.08; ctl3.target.set(0, -4, -8); ctl3.maxDistance = 400; ctl3.minDistance = 6;
  cena.add(new THREE.HemisphereLight(0xdfe8ee, 0x1a1f24, 0.35));
  const sol = new THREE.DirectionalLight(0xffffff, 0.75); sol.position.set(40, 90, 60); cena.add(sol);
  const contra = new THREE.DirectionalLight(0x8fb4ff, 0.35); contra.position.set(-60, 30, -50); cena.add(contra);
  const brilho = new THREE.PointLight(0xff6a1a, 0, 220); brilho.position.set(0, 30, 0); cena.add(brilho);
  const plano = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const GEO_CAP = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0);
  const mat = (cor, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: cor, roughness: 0.55, metalness: 0.05 }, o));
  const M3 = {
    si: mat(0x3a4249, { roughness: 0.62, metalness: 0.2, envMapIntensity: 0.22 }), siCap: mat(0x353c42, { roughness: 0.8, envMapIntensity: 0.4 }),
    np: mat(0x36c2b4, { roughness: 0.45, emissive: 0x000000 }),
    ox: mat(0x7a6ee0, { transparent: true, opacity: 0.45, roughness: 0.3, depthWrite: false, envMapIntensity: 0.2 }), oxCap: mat(0x7a6ee0, { transparent: true, opacity: 0.85, roughness: 0.4, envMapIntensity: 0.3 }),
    masc: mat(0x6c5fd6, { transparent: true, opacity: 0.6, roughness: 0.2, envMapIntensity: 0.4 }), mascCap: mat(0x6c5fd6, { transparent: true, opacity: 0.85, envMapIntensity: 0.3 }),
    metal: mat(0xd4ad3c, { roughness: 0.32, metalness: 0.85 }), metalCap: mat(0xb8942e, { roughness: 0.5, metalness: 0.6 }),
    gr: new THREE.MeshStandardMaterial({ color: 0xd8dee2, envMapIntensity: 0.3, transparent: true, opacity: 0.55, roughness: 0.3, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false }),
    pmma: mat(0xe6eeff, { transparent: true, opacity: 0.28, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide }),
    cu: mat(0xc07a40, { roughness: 0.35, metalness: 0.75 }),
    liq: mat(0x2f8fa8, { transparent: true, opacity: 0.32, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide }),
  };
  // textura do corte da região n+: perfil vertical de concentração
  const cvPerf = document.createElement("canvas"); cvPerf.width = 4; cvPerf.height = 128;
  const texPerf = new THREE.CanvasTexture(cvPerf); texPerf.encoding = THREE.sRGBEncoding;
  M3.npCap = new THREE.MeshBasicMaterial({ map: texPerf });
  // textura do grafeno: contornos de domínio e ilhas multicamada (17 % da área, ~6 µm entre ilhas, ART)
  const cvGr = document.createElement("canvas"); cvGr.width = cvGr.height = 1024;
  const texGr = new THREE.CanvasTexture(cvGr); texGr.encoding = THREE.sRGBEncoding; texGr.anisotropy = 4; M3.gr.map = texGr;
  const cvCu = document.createElement("canvas"); cvCu.width = cvCu.height = 512;
  const texCu = new THREE.CanvasTexture(cvCu); texCu.encoding = THREE.sRGBEncoding; M3.cu.map = texCu;
  [M3.si, M3.np, M3.ox, M3.masc, M3.metal, M3.gr, M3.pmma].forEach(m => { m.clippingPlanes = [plano]; m.clipShadows = true; });

  const grupoDisp = new THREE.Group(); cena.add(grupoDisp);
  const rotulos = document.getElementById("rotulos-3d");
  R3 = { ren, cena, cam, ctl: ctl3, plano, GEO_CAP, M3, grupoDisp, cvPerf, texPerf, cvGr, texGr, cvCu, texCu, brilho, rotulos, cv, camadas: {}, rot: [], anim: null };
  gerarIlhas(); desenharTexGr(); construirDisp(); construirParticulas();
  ctl3.addEventListener("start", () => { R3.anim = null; });
  est3.pronto = true;
}

/* layout no plano, em µm. W e L não estão na receita [B]; usa-se W = L */
function layout() {
  const L = est3.L, W = L, a = L / 2 + 5, b = W / 2 + 3;
  const chip = retangulo(-38, -50, 38, 26);
  const pe = PROC.mascara === "A" ? [[-a, -b], [a, -b], [a, b], [-a, b]] : null;
  // região n+ desenhada como retângulo sob o canal e braço até o contato da porta [I]
  const np = PROC.mascara === "A" ? [[-a, b], [a, b], [a, -b], [3, -b], [3, -b - 9], [7, -b - 9], [7, -b - 23], [-7, -b - 23], [-7, -b - 9], [-3, -b - 9], [-3, -b]] : chip;
  const jan = retangulo(-4.5, -b - 20, 4.5, -b - 12);
  return { L, W, a, b, chip, np, jan, pe,
    S: retangulo(-L / 2 - 12, -W / 2 - 3, -L / 2, W / 2 + 3), Dr: retangulo(L / 2, -W / 2 - 3, L / 2 + 12, W / 2 + 3),
    G: retangulo(-6, -b - 21, 6, -b - 11), canal: retangulo(-L / 2 - 4, -W / 2, L / 2 + 4, W / 2), folha: retangulo(-37, -49, 37, 25) };
}
function camada(contornos, mat, matCap) {
  const forma = new THREE.Shape(contornos[0].map(([x, z]) => new THREE.Vector2(x, -z)));
  contornos.slice(1).forEach(h => forma.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z)))));
  const geo = new THREE.ExtrudeGeometry(forma, { depth: 1, bevelEnabled: false, curveSegments: 1 }); geo.rotateX(-Math.PI / 2);
  const g = new THREE.Group(), m = new THREE.Mesh(geo, mat); g.add(m);
  const caps = cortesZ(contornos, 0).map(([a, b]) => { const c = new THREE.Mesh(R3.GEO_CAP, matCap || mat); c.userData = { a, b }; c.renderOrder = 2; g.add(c); return c; });
  R3.grupoDisp.add(g);
  return { g, m, caps, def(y0, y1, vis = true) { // y em nm
      const s = est3.EV / 1000, h = Math.max((y1 - y0) * s, 1e-4);
      g.visible = vis && y1 - y0 > 1e-6; m.position.y = y0 * s; m.scale.y = h;
      caps.forEach(c => { c.visible = est3.cortar; c.position.set(c.userData.a, y0 * s, 0.002); c.scale.set(c.userData.b - c.userData.a, h, 1); });
    } };
}
function construirDisp() {
  const R = R3; while (R.grupoDisp.children.length) { const c = R.grupoDisp.children.pop(); c.traverse(o => { if (o.geometry && o.geometry !== R.GEO_CAP) o.geometry.dispose(); }); }
  const Lt = layout(); R.Lt = Lt; const M3 = R.M3, C = R.camadas;
  const fora = PROC.mascara === "A" ? [Lt.chip, Lt.np] : null;
  C.siBase = camada([Lt.chip], M3.si, M3.siCap);
  C.siCampo = fora ? camada(fora, M3.si, M3.siCap) : null;
  C.siSob = camada([Lt.np], M3.si, M3.siCap);
  C.np = camada([Lt.np], M3.np, M3.npCap);
  C.masc = fora ? camada(fora, M3.masc, M3.mascCap) : null;
  C.oxCampo = fora ? camada(fora, M3.ox, M3.oxCap) : null;
  C.oxN = camada([Lt.np], M3.ox, M3.oxCap);
  C.oxNJ = camada([Lt.np, Lt.jan], M3.ox, M3.oxCap);
  C.S = camada([Lt.S], M3.metal, M3.metalCap); C.Dr = camada([Lt.Dr], M3.metal, M3.metalCap); C.G = camada([Lt.G], M3.metal, M3.metalCap);
  // grafeno, PMMA e folha de cobre são planos finos
  const planoF = (ret, matl) => { const [x0, z0] = ret[0], [x1, z1] = ret[2]; const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0); geo.rotateX(-Math.PI / 2); const m = new THREE.Mesh(geo, matl); m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); m.renderOrder = 3; R.grupoDisp.add(m); return m; };
  C.grFolha = planoF(Lt.folha, M3.gr); C.grCanal = planoF(Lt.canal, M3.gr.clone()); C.grCanal.material.clippingPlanes = [R.plano];
  C.grCanal.material.map = R.texGr;
  C.pmma = new THREE.Mesh(new THREE.BoxGeometry(74, 1, 74), M3.pmma); C.pmma.position.z = -12; R.grupoDisp.add(C.pmma);
  C.cu = new THREE.Mesh(new THREE.BoxGeometry(74, 1, 74), [M3.cu, M3.cu, M3.cu, M3.cu, M3.cu, M3.cu]); C.cu.position.z = -12; R.grupoDisp.add(C.cu);
  C.liq = planoF(retangulo(-90, -90, 90, 66), M3.liq); C.liq.material = M3.liq;
  // UV do grafeno na folha e no canal coerentes com a textura em µm
  [C.grFolha, C.grCanal].forEach(m => { const uv = m.geometry.attributes.uv, pos = m.geometry.attributes.position; for (let i = 0; i < uv.count; i++) { const x = pos.getX(i) + m.position.x, z = pos.getZ(i) + m.position.z; uv.setXY(i, (x + 37) / 74, 1 - (z + 49) / 74); } uv.needsUpdate = true; });
  montarRotulos();
}
let ILHAS = [], DOMINIOS = [];
function gerarIlhas() {
  const r = semente(23), area = 74 * 74, n = Math.round(area / 36); // ~6 µm entre ilhas (ART)
  const rm = Math.sqrt(0.17 * 36 / Math.PI); // raio médio para 17 % da área
  ILHAS = Array.from({ length: n }, () => ({ x: -37 + r() * 74, z: -49 + r() * 74, r: rm * (0.55 + 0.9 * r()), a: r() * 6.28, f: 0.5 + r() * 0.5 }));
  DOMINIOS = Array.from({ length: 70 }, () => ({ x: -37 + r() * 74, z: -49 + r() * 74, t0: r() * 0.55, a: r() * 1.047, v: 0.8 + r() * 0.5 }));
}
function hexagono(ctx, x, y, raio, ang) { ctx.beginPath(); for (let k = 0; k < 6; k++) { const t = ang + k * Math.PI / 3; k ? ctx.lineTo(x + raio * Math.cos(t), y + raio * Math.sin(t)) : ctx.moveTo(x + raio * Math.cos(t), y + raio * Math.sin(t)); } ctx.closePath(); }
function desenharTexGr() {
  const c = R3.cvGr, ctx = c.getContext("2d"), s = c.width / 74;
  ctx.fillStyle = "#c9d2d8"; ctx.fillRect(0, 0, c.width, c.height);
  // contornos de domínio (Voronoi aproximado por rasterização grosseira)
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data, passo = 2;
  const dono = (x, z) => { let m = 1e9, k = -1, m2 = 1e9; DOMINIOS.forEach((p, i) => { const dd = (p.x - x) ** 2 + (p.z - z) ** 2; if (dd < m) { m2 = m; m = dd; k = i; } else if (dd < m2) m2 = dd; }); return Math.sqrt(m2) - Math.sqrt(m); };
  for (let py = 0; py < c.height; py += passo) for (let px = 0; px < c.width; px += passo) {
    const x = -37 + px / s, z = -49 + py / s, g = dono(x, z);
    if (g < 0.25) for (let yy = 0; yy < passo; yy++) for (let xx = 0; xx < passo; xx++) { const o = ((py + yy) * c.width + px + xx) * 4; d[o] = 150; d[o + 1] = 160; d[o + 2] = 168; }
  }
  ctx.putImageData(img, 0, 0);
  ILHAS.forEach(il => { ctx.fillStyle = `rgba(70,80,90,${0.55 + 0.3 * il.f})`; hexagono(ctx, (il.x + 37) * s, (il.z + 49) * s, il.r * s, il.a); ctx.fill(); });
  R3.texGr.needsUpdate = true;
}
function desenharTexCu(u, crescimento) { // folha de Cu com grãos e domínios de grafeno crescendo
  const c = R3.cvCu, ctx = c.getContext("2d"), s = c.width / 74;
  const g = ctx.createLinearGradient(0, 0, c.width, c.height); g.addColorStop(0, "#c27a3e"); g.addColorStop(0.5, "#d08a4c"); g.addColorStop(1, "#b5703a");
  ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
  const r = semente(3); ctx.strokeStyle = "rgba(90,45,20,.35)"; ctx.lineWidth = 1;
  for (let i = 0; i < 26; i++) { ctx.beginPath(); ctx.moveTo(r() * c.width, r() * c.height); ctx.lineTo(r() * c.width, r() * c.height); ctx.stroke(); } // contornos de grão do Cu
  if (crescimento > 0) {
    DOMINIOS.forEach(p => { const tt = clamp((crescimento - p.t0) / (1 - p.t0), 0, 1); if (tt <= 0) return; const raio = tt * 13 * p.v * s;
      ctx.fillStyle = "rgba(40,48,56,.55)"; hexagono(ctx, (p.x + 37) * s, (p.z + 49) * s, raio, p.a); ctx.fill();
      ctx.strokeStyle = "rgba(220,230,236,.35)"; ctx.stroke(); });
    if (crescimento > 0.4) ILHAS.forEach(il => { const tt = clamp((crescimento - 0.4) / 0.6, 0, 1); ctx.fillStyle = "rgba(15,20,25,.5)"; hexagono(ctx, (il.x + 37) * s, (il.z + 49) * s, il.r * s * tt, il.a); ctx.fill(); });
  }
  R3.texCu.needsUpdate = true;
}
function desenharTexPerf(S) {
  const c = R3.cvPerf, ctx = c.getContext("2d"), H = c.height;
  const img = ctx.createImageData(c.width, H);
  for (let py = 0; py < H; py++) {
    const z = S.siN + (S.jun - S.siN) * (py + 0.5) / H;
    const Ct = Math.max(S.C ? interp(G, S.C, z) : 1e15, 1e15), Ca = S.A ? Math.max(interp(G, S.A, z), 1e15) : 1e15;
    const f = clamp((Math.log10(Ct) - 18) / 3, 0, 1), fa = clamp(Ca / Ct, 0, 1);
    const amorfo = z < S.amorfo + I.amorfo[0];
    let rgb = [227 * (1 - fa) + 54 * fa, 163 * (1 - fa) + 194 * fa, 42 * (1 - fa) + 180 * fa].map(v => v * (0.25 + 0.75 * f) + 30 * (1 - f));
    if (amorfo) rgb = rgb.map(v => v * 0.55 + 40);
    for (let px = 0; px < c.width; px++) { const o = (py * c.width + px) * 4; img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255; }
  }
  ctx.putImageData(img, 0, 0); R3.texPerf.needsUpdate = true;
  // a textura cobre do topo do Si (v = 1) à profundidade de 10¹⁸ (v = 0)
  R3.texPerf.flipY = true;
}

/* ---------------------------------------------------------------- partículas */
function pontos(n, cor, tam) {
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  const m = new THREE.Points(geo, new THREE.PointsMaterial({ size: tam, color: cor, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true, blending: THREE.AdditiveBlending }));
  m.frustumCulled = false; R3.cena.add(m); m.userData.n = n; return m;
}
const rnd3 = semente(97);
function construirParticulas() {
  R3.ions = pontos(700, 0xffd27a, 0.7); R3.ionsDados = Array.from({ length: 700 }, () => ({ x: -36 + rnd3() * 72, z: -48 + rnd3() * 72, y: 40 * rnd3(), v: 60 + 30 * rnd3() }));
  R3.gas = pontos(500, 0xffffff, 0.8); R3.gas.material.blending = THREE.NormalBlending; R3.gasDados = Array.from({ length: 500 }, () => ({ x: -36 + rnd3() * 72, z: -48 + rnd3() * 72, y: 30 * rnd3(), v: 4 + 4 * rnd3(), f: rnd3() * 6.28 }));
  R3.port = pontos(1400, 0xffffff, 0.85); R3.port.material.blending = THREE.NormalBlending; R3.portDados = Array.from({ length: 1400 }, () => ({ u: rnd3(), w: rnd3(), s: rnd3(), tipo: rnd3() }));
  R3.fn = pontos(80, 0xfff6a0, 0.8); R3.fnDados = Array.from({ length: 80 }, () => ({ x: 0, z: 0, t: 2 }));
  const geoL = new THREE.BufferGeometry(); geoL.setAttribute("position", new THREE.BufferAttribute(new Float32Array(144 * 6), 3));
  R3.campo = new THREE.LineSegments(geoL, new THREE.LineBasicMaterial({ color: 0xb4aaff, transparent: true, opacity: 0.9, depthTest: false })); R3.campo.renderOrder = 5; R3.campo.frustumCulled = false; R3.cena.add(R3.campo);
}
function corBlackbody(T) { // aproximação visual do brilho térmico; só para desenho
  const t = clamp((T - 450) / 650, 0, 1);
  return new THREE.Color(Math.min(1, 0.25 + 1.2 * t), Math.max(0, 1.1 * t * t - 0.05), Math.max(0, 0.9 * t * t * t - 0.05));
}

/* ---------------------------------------------------------------- rótulos sobrepostos */
function montarRotulos() {
  R3.rotulos.innerHTML = ""; const Lt = R3.Lt;
  const lista = [
    ["S", () => [Lt.S[0][0] + 6, 1, 0], S => S.metal > 0.5],
    ["D", () => [Lt.Dr[0][0] + 6, 1, 0], S => S.metal > 0.5],
    ["G", () => [0, 1, Lt.G[0][1] + 5], S => S.metal > 0.5],
    ["Si n⁺", () => [Lt.a - 2, -0.2, Lt.b - 2], S => S.C && S.metal < 0.5 && S.ord >= 3 && S.ord !== 7 && S.ord !== 8],
    ["máscara de SiO₂", () => [-30, 0.15 * 150 * est3.EV / 1000 + 0.5, 18], S => S.mascara > 0.5],
    ["grafeno", () => [-26, 0.6, 18], S => S.grafeno > 0.5 && S.canal < 0.5],
    ["canal", () => [0, 0.6, Lt.W / 2 - 1], S => S.canal > 0.5],
    ["folha de Cu", () => [-30, 26, 18], S => S.cu > 0.3],
    ["PMMA e grafeno", () => [-30, (R3.yFilme || 20) + 1, 18], S => S.ord === 8 && S.sub && S.sub.i >= 1 && S.sub.i <= 5],
    ["SiO₂ de porta", () => [Lt.a - 4, 0.3, -Lt.b + 2], S => S.xoxN > 5 && S.grafeno < 0.5 && S.cu < 0.3],
    ["A", () => [-38, 0.5, 0], S => est3.cortar], ["A′", () => [38, 0.5, 0], S => est3.cortar],
  ];
  R3.rot = lista.map(([txt, p, vis]) => { const d = document.createElement("div"); d.className = "rotulo3d"; d.textContent = txt; R3.rotulos.appendChild(d); return { d, p, vis }; });
}
function atualizarRotulos(S, w, h) {
  const v = new THREE.Vector3();
  R3.rot.forEach(r => {
    const ok = r.vis(S); if (!ok) { r.d.style.display = "none"; return; }
    v.set(...r.p()).project(R3.cam);
    if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) { r.d.style.display = "none"; return; }
    r.d.style.display = "block"; r.d.style.left = ((v.x + 1) / 2 * w) + "px"; r.d.style.top = ((1 - v.y) / 2 * h) + "px";
  });
}

/* ---------------------------------------------------------------- atualização da cena */
let ultimaChave3 = "", ultimoS = null, tUltCu = -1;
function aplicarEstado3(S, dt, tAnim) {
  const R = R3, C = R.camadas, s = est3.EV / 1000, Lt = R.Lt, SUB = 320;
  const comMasc = PROC.mascara === "A";
  // substrato e região n+
  const temNp = !!S.C && S.jun > 1;
  C.siBase.def(-SUB - 20, -SUB);
  if (C.siCampo) C.siCampo.def(-SUB, -S.siF);
  C.siSob.def(-SUB, temNp ? -S.jun : -S.siN);
  C.np.def(-S.jun, -S.siN, temNp);
  if (temNp) {
    const fa = S.A ? clamp(Math.max(...S.A) / Math.max(...S.C), 0, 1) : 0;
    const cI = new THREE.Color(0xe3a32a), cA = new THREE.Color(0x36c2b4);
    R.M3.np.color.copy(cI.lerp(cA, fa));
    if (S.amorfo > 0.5) R.M3.np.color.multiplyScalar(0.7);
    desenharTexPerf(S);
  }
  // máscara
  if (C.masc) { C.masc.def(0, 150, S.mascara > 0.01); R.M3.masc.opacity = 0.6 * S.mascara; R.M3.mascCap.opacity = 0.85 * S.mascara; }
  // óxido de porta e janela
  if (C.oxCampo) C.oxCampo.def(-S.siF, S.xoxF - S.siF, S.xoxF > 0.05);
  const jan = S.janela > 0.5;
  C.oxN.def(-S.siN, S.xoxN - S.siN, S.xoxN > 0.05 && !jan);
  C.oxNJ.def(-S.siN, S.xoxN - S.siN, S.xoxN > 0.05 && jan);
  if (S.e.id === "janela") { const a = clamp(1 - Math.abs(S.u - 0.4) * 3, 0, 1); R.M3.ox.emissive.setRGB(0.15 * a, 0.12 * a, 0.3 * a); } else R.M3.ox.emissive.setRGB(0, 0, 0);
  // brilho térmico
  const quente = S.T > 300 && S.cu < 0.5;
  const cb = corBlackbody(S.T), ib = quente ? clamp((S.T - 400) / 700, 0, 1) : 0;
  R.M3.si.emissive.copy(cb).multiplyScalar(ib * 0.3); R.M3.np.emissive.copy(cb).multiplyScalar(ib * 0.35);
  R.brilho.color.copy(cb); R.brilho.intensity = ib * 1.6;
  // grafeno, folha, PMMA e líquido
  const topoN = (S.xoxN - S.siN) * s, topoF = (S.xoxF - S.siF) * s, yGr = Math.max(topoN, topoF) + 0.03;
  let yFilme = yGr, filme = S.grafeno > 0, pm = 0, liq = 0, corLiq = 0x2f8fa8;
  C.cu.visible = false;
  if (S.e.id === "cvd") {
    const yCu = 24; C.cu.visible = true; C.cu.scale.set(1, 0.3, 1); C.cu.position.set(0, yCu, -12);
    const cres = S.sub.i < 2 ? 0 : S.sub.i === 2 ? S.sub.v : 1;
    if (Math.abs(cres - tUltCu) > 0.01 || tUltCu < 0) { desenharTexCu(S.u, cres); tUltCu = cres; }
    const ib2 = clamp((S.T - 400) / 700, 0, 1); R.M3.cu.emissive.copy(corBlackbody(S.T)).multiplyScalar(0.7 * ib2);
    R.brilho.color.copy(corBlackbody(S.T)); R.brilho.intensity = 2.2 * ib2; R.brilho.position.set(0, yCu + 8, -12);
  } else { R.brilho.position.set(0, 30, 0); R.M3.cu.emissive.setRGB(0, 0, 0); }
  if (S.e.id === "transferencia") {
    const i = S.sub.i, v = S.sub.v, yAlto = 22;
    if (tUltCu !== 1) { desenharTexCu(1, 1); tUltCu = 1; }
    if (i <= 1) { C.cu.visible = S.cu > 0.02; C.cu.position.set(0, yAlto - 0.3, -12); C.cu.scale.set(1, 0.3 * Math.max(S.cu, 0.02), 1); R.M3.cu.opacity = 1; }
    pm = i <= 4 ? 1 : i === 5 ? 1 - v : 0;
    if (i === 0) pm = clamp(v * 1.4, 0, 1);
    filme = true;
    if (i <= 2) yFilme = yAlto; else if (i === 3) yFilme = yAlto + (yGr - yAlto) * (v * v * (3 - 2 * v)); else yFilme = yGr;
    if (i === 1) { liq = 1; corLiq = 0x2f8fa8; } else if (i === 2) { liq = 1; corLiq = 0x6fb7d6; } else if (i === 3) { liq = 1 - v; corLiq = 0x6fb7d6; } else if (i === 5) { liq = 0.6; corLiq = 0xd8e6ee; }
    R.M3.gr.opacity = 0.55;
  }
  R.yFilme = yFilme;
  C.liq.visible = liq > 0.02; C.liq.position.y = (S.e.id === "transferencia" && S.sub.i <= 3 ? 21.6 : yGr + 0.6); R.M3.liq.color.setHex(corLiq); R.M3.liq.opacity = 0.32 * liq;
  C.pmma.visible = pm > 0.02; C.pmma.scale.set(1, 0.5, 1); C.pmma.position.set(0, yFilme + 0.3, -12); R.M3.pmma.opacity = 0.28 * pm;
  const canal = S.canal;
  C.grFolha.visible = filme && canal < 1; C.grFolha.position.y = yFilme; C.grFolha.material.opacity = 0.55 * (1 - canal);
  C.grCanal.visible = filme && canal > 0; C.grCanal.position.y = yFilme + 0.005; C.grCanal.material.opacity = 0.6;
  // contatos; espessura ilustrativa de 60 nm [I]
  const tMet = 60 * S.metal;
  C.S.def(S.xoxF - S.siF, S.xoxN - S.siN + tMet, S.metal > 0.01); C.Dr.def(S.xoxF - S.siF, S.xoxN - S.siN + tMet, S.metal > 0.01);
  C.G.def(-S.siN, S.xoxN - S.siN + tMet, S.metal > 0.01);
  // íons
  const ionsVis = S.e.id === "implante" && S.u < 0.95;
  R.ions.visible = ionsVis;
  if (ionsVis) {
    const p = R.ions.geometry.attributes.position, cor = R.ions.geometry.attributes.color, sn = Math.sin(I.inclinacao * Math.PI / 180), cs = Math.cos(I.inclinacao * Math.PI / 180);
    const topoM = comMasc ? 150 * s : 0;
    R.ionsDados.forEach((q, k) => {
      q.y -= q.v * dt * cs; q.x += q.v * dt * sn;
      const dentro = !comMasc || pontoEm(Lt.np, q.x, q.z), piso = dentro ? -40 * s : topoM - 30 * s;
      if (q.y < piso || q.x > 38) { q.y = 30 + 12 * rnd3(); q.x = -40 + rnd3() * 76; q.z = -48 + rnd3() * 72; }
      p.setXYZ(k, q.x, q.y, q.z); const f = q.y < 0.3 ? 0.4 : 1; cor.setXYZ(k, f, f * 0.85, f * 0.5);
    }); p.needsUpdate = true; cor.needsUpdate = true;
  }
  // gás: O₂ na oxidação, CH₄ na CVD
  const gasO = S.e.id === "oxidacao", gasC = S.e.id === "cvd" && S.sub.i === 2;
  R.gas.visible = gasO || gasC;
  if (R.gas.visible) {
    const p = R.gas.geometry.attributes.position, cor = R.gas.geometry.attributes.color;
    const nAtivo = gasO ? Math.round(clamp(S.taxaOx / 3, 0.15, 1) * 500) : 360;
    const y0 = gasC ? 24.4 : topoN, cO = new THREE.Color(0xff8f80), cC = new THREE.Color(0xd8e0e6);
    R.gasDados.forEach((q, k) => {
      if (k >= nAtivo) { p.setXYZ(k, 0, -999, 0); return; }
      q.y -= q.v * dt; q.f += dt * 3;
      if (q.y < 0) { q.y = 10 + 14 * rnd3(); q.x = -36 + rnd3() * 72; q.z = -48 + rnd3() * 72; }
      p.setXYZ(k, q.x + Math.sin(q.f) * 0.4, y0 + q.y, q.z + Math.cos(q.f * 0.7) * 0.4);
      const c = gasO ? cO : cC; cor.setXYZ(k, c.r, c.g, c.b);
    }); p.needsUpdate = true; cor.needsUpdate = true;
  }
  // operação
  const op = S.e.id === "operacao";
  R.port.visible = op; R.campo.visible = op; R.fn.visible = op;
  if (op && M) {
    const o = passoOp(dt); R.oOp = o;
    const { ne, nh } = densidadesPortadores(o), escala = 1.4e17;
    const nE = Math.round(clamp(ne / escala, 0, 1) * 1400), nH = Math.round(clamp(nh / escala, 0, 1) * 1400);
    const v = o.I / (q * (Math.abs(o.n) + M.rho0)), vis = clamp(v / 2e5, 0, 1.2) * 0.3;
    const p = R.port.geometry.attributes.position, cor = R.port.geometry.attributes.color, ce = new THREE.Color(COR.eletron), ch = new THREE.Color(COR.lacuna);
    R.portDados.forEach((d, k) => {
      const ehE = k < nE, ehH = k >= 1400 - nH;
      if (!ehE && !ehH) { p.setXYZ(k, 0, -999, 0); return; }
      const dir = ehE ? 1 : -1; d.u = ((d.u + dir * dt * vis * (0.6 + 0.8 * d.s)) % 1 + 1) % 1;
      p.setXYZ(k, -Lt.L / 2 + d.u * Lt.L, yGr + 0.08, -Lt.W / 2 + d.w * Lt.W);
      const c = ehE ? ce : ch; cor.setXYZ(k, c.r, c.g, c.b);
    }); p.needsUpdate = true; cor.needsUpdate = true;
    // linhas de campo entre o grafeno e a porta
    const nl = Math.round(clamp(o.E / 1e8 * 1.6 + 1, 0, 12)), pl = R.campo.geometry.attributes.position; let k = 0;
    for (let i = 0; i < nl; i++) for (let j = 0; j < nl; j++) {
      const x = -Lt.L / 2 + (i + 0.5) / nl * Lt.L, z = -Lt.W / 2 + (j + 0.5) / nl * Lt.W;
      pl.setXYZ(k++, x, yGr, z); pl.setXYZ(k++, x, -S.siN * s, z);
    }
    for (; k < 288; k++) pl.setXYZ(k, 0, -999, 0);
    pl.needsUpdate = true; R.campo.geometry.setDrawRange(0, nl * nl * 2);
    R.campo.material.color.set(o.E > 0.8 * KC.ruptura_MVcm[0] * 1e8 && LIG.fn ? COR.perigo : "#b4aaff");
    // centelhas de Fowler e Nordheim
    const pf = R.fn.geometry.attributes.position, taxaFN = LIG.fn && o.J > 1e-12 ? clamp((Math.log10(o.J) + 12) * 1.5, 0, 25) : 0;
    R.fnDados.forEach((f, i) => {
      if (f.t >= 1 && Math.random() < taxaFN * dt / 8) { f.t = 0; f.x = -Lt.L / 2 + Math.random() * Lt.L; f.z = -Lt.W / 2 + Math.random() * Lt.W; f.sobe = o.n < 0; }
      if (f.t < 1) { f.t += dt * 2; const yy = f.sobe ? -S.siN * s + f.t * (yGr + S.siN * s) : yGr - f.t * (yGr + S.siN * s); pf.setXYZ(i, f.x, yy, f.z); } else pf.setXYZ(i, 0, -999, 0);
    }); pf.needsUpdate = true;
    leiturasOp(o, "d3-leituras");
  }
}
function pontoEm(pol, x, z) { let d = false; for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) { const a = pol[i], b = pol[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) d = !d; } return d; }

/* ---------------------------------------------------------------- textos */
function texto3(S) {
  const R = rec1D(), O = oxi1D(), id = S.e.id; let t = "", nums = [];
  const comMasc = PROC.mascara === "A";
  if (id === "lamina") { t = "Lâmina de Si(100) tipo n. A vista cobre um trecho de cerca de 76 × 76 µm em torno de um transistor. No plano as dimensões são reais, e na vertical os filmes e as camadas dopadas estão multiplicados pelo exagero escolhido."; nums = [["substrato", "n, 0,001 a 10 Ω·cm", "B"], ["exagero vertical", `${est3.EV}×`, ""]]; }
  else if (id === "mascara") { t = comMasc ? "Máscara de SiO₂ de 150 nm aberta por litografia no desenho da região n⁺. O retângulo fica sob o canal e o braço leva ao contato da porta. O desenho exato da janela não está na receita e aqui é suposto." : "Implantação na lâmina inteira, sem máscara. A região n⁺ cobre todo o trecho e a porta fica comum a todos os dispositivos."; nums = [["máscara", comMasc ? "150 nm" : "nenhuma", "B"], ["janela", comMasc ? `${br(2 * R3.Lt.a, 0)} × ${br(2 * R3.Lt.b, 0)} µm` : "lâmina inteira", "I"]]; }
  else if (id === "implante") { t = `Feixe de P⁺ a ${br(I.energia_keV, 0)} keV inclinado ${br(I.inclinacao, 0)}°. Na janela os íons param em torno de Rp abaixo da superfície; sobre a máscara param dentro dela. A cor da região mostra o P ainda inativo, e o corte mostra o perfil e a camada amorfa no topo.`; nums = [["dose", sci(I.dose * S.dose, 1) + " cm⁻²", "B"], ["Rp", `${br(I.Rp, 1)} nm`, "C"], ["camada amorfa", `${br(S.amorfo, 0)} nm`, "C"], ["profundidade a 10¹⁸", `${br(S.jun, 0)} nm`, "C"]]; }
  else if (id === "remocao") { t = comMasc ? "A máscara sai e leva o P que ficou nela. Sobra a região implantada, amorfa no topo e com o P inativo." : "Sem máscara para remover. A lâmina segue para o recozimento."; nums = [["P no Si", sci(I.dose, 1) + " cm⁻²", "C"], ["camada amorfa", `${br(I.amorfo[1] - I.amorfo[0], 0)} nm`, "C"]]; }
  else if (id === "recozimento") { t = `Primeiro a SPE a 550 °C recristaliza a camada amorfa e ativa o P preso na frente. Depois vem o ${NOME_VAR[PROC.variante]}, que difunde o P e leva o pico ativo até n_e(T). A lâmina brilha na cor aproximada da temperatura.`; nums = [["T", `${br(S.T, 0)} °C`, "B"], ["andamento", S.tReal, "B"], ["profundidade a 10¹⁸", `${br(S.jun, 0)} nm`, "C"], ["fração ativa final", `${br(100 * R.fracao_ativa, 0)} %`, "C"], ["Rs", `${br(R.Rs, 1)} Ω/□`, "I"]]; }
  else if (id === "oxidacao") { t = `Oxidação seca a ${PROC.T} °C, Massoud com ${NOME_RAMO[PROC.ramo]}. O O₂ desce pelo óxido e reage na interface. Sobre a porta muito dopada o óxido cresce mais rápido que sobre o substrato, e o degrau aparece na borda da região n⁺.`; nums = [["óxido sobre n⁺", `${br(S.xoxN, 1)} nm`, "C"], ["óxido fora da porta", comMasc ? `${br(S.xoxF, 1)} nm` : "sem borda", "C"], ["tempo", S.tReal, "C"], ["para 20 nm", `${br(O.t20_min, 1)} min`, "C"]]; }
  else if (id === "janela") { t = "Abertura de uma janela no óxido sobre o braço n⁺ para o contato da porta. O artigo lista esta etapa entre as que ainda serão definidas, então a cena só mostra uma corrosão do óxido nessa área."; nums = [["janela", "9 × 8 µm", "I"], ["óxido removido", `${br(S.xoxN, 1)} nm`, "C"]]; }
  else if (id === "cvd") { const sb = S.sub; t = sb.s.txt; nums = [["fase", sb.s.nome, "B"], ["T", `${br(S.T, 0)} °C`, "B"], ["pressão", "atmosférica", "B"], ["filme contínuo", "7 × 5 mm", "B"]]; }
  else if (id === "transferencia") { const sb = S.sub; t = sb.s.txt + " O grafeno real fica quase invisível sobre 20 nm de óxido, como mostra o modelo de contraste do artigo; aqui ele aparece realçado."; nums = [["passo", `${sb.i + 1} de ${SUB_TR.length}, ${sb.s.nome}`, "B"], ["T", `${br(S.T, 0)} °C`, "B"], ["ilhas multicamada", "17 % da área", "B"], ["defeitos", sci(D.constantes.nD_defeitos, 1) + " cm⁻²", "B"]]; }
  else if (id === "canal") { t = "Definição do canal. A receita não descreve esta etapa, mas sem ela o grafeno ligaria fonte, dreno e porta pela janela. A cena supõe litografia e plasma de O₂ deixando uma faixa de largura W."; nums = [["W = L", `${est3.L} µm`, "I"], ["etapa", "suposta", "I"]]; }
  else if (id === "contatos") { t = "Contatos de fonte, dreno e porta. O metal e a espessura não estão na receita; a cena usa 60 nm de um metal dourado só para o desenho. A porta encosta no Si n⁺ pela janela, e fonte e dreno ficam sobre o óxido, em parte sobre a região n⁺, o que soma capacitância parasita."; nums = [["metal", "não informado", "B"], ["espessura", "60 nm", "I"]]; }
  else { t = "O dispositivo ligado com o modelo elétrico da aba Operação. Elétrons e lacunas atravessam o canal na velocidade de deriva calculada, as linhas de campo no óxido acompanham a carga induzida, e centelhas indicam tunelamento quando o campo fica alto."; const o = R3.oOp; nums = o ? [["V_G", `${br(opEst.Vg, 2)} V`, "C"], ["n", `${sci(o.n / 1e4, 1)} cm⁻²`, "C"], ["E_ox", `${br(o.E / 1e8, 2)} MV/cm`, "C"], ["I_D/W", `${br(o.I, 2)} µA/µm`, "C"]] : []; }
  document.getElementById("d3-titulo").textContent = S.e.nome;
  document.getElementById("d3-texto").textContent = t;
  document.getElementById("d3-numeros").innerHTML = numerosHTML(nums);
  if (id !== "operacao") document.getElementById("d3-leituras").innerHTML = `<p class="nota" style="margin:0">O dispositivo ainda não está ligado.</p>`;
}

/* ---------------------------------------------------------------- câmeras e controles */
const CAMS = {
  geral: { p: [52, 40, 62], t: [0, -4, -8] },
  corte: { p: [0, 2, 52], t: [0, -6, -2] },
  cima: { p: [0.01, 120, 0.02], t: [0, 0, -12] },
};
function fatorCam() { return R3 ? clamp(1.35 / R3.cam.aspect, 1, 1.9) : 1; }
function irCam(nome) { if (!R3) return; const c = CAMS[nome], f = fatorCam(), tt = new THREE.Vector3(...c.t); R3.anim = { de: R3.cam.position.clone(), deT: R3.ctl.target.clone(), para: new THREE.Vector3(...c.p).sub(tt).multiplyScalar(f).add(tt), paraT: tt, t: 0 }; }
["geral", "corte", "cima"].forEach(n => document.getElementById("cam-" + n).addEventListener("click", () => irCam(n)));
const elExag = document.getElementById("d3-exagero"), elL3 = document.getElementById("d3-L");
function rotular3() { document.getElementById("o-exagero").textContent = `${elExag.value}×`; document.getElementById("o-L3").textContent = `${elL3.value} µm`; }
elExag.addEventListener("input", () => { est3.EV = +elExag.value; rotular3(); ultimaChave3 = ""; });
elL3.addEventListener("input", () => { est3.L = +elL3.value; rotular3(); if (R3) construirDisp(); ultimaChave3 = ""; });
document.getElementById("d3-cortar").addEventListener("change", e => {
  est3.cortar = e.target.value === "sim"; if (!R3) return;
  [R3.M3.si, R3.M3.np, R3.M3.ox, R3.M3.masc, R3.M3.metal, R3.M3.gr, R3.M3.pmma, R3.camadas.grCanal.material].forEach(m => { m.clippingPlanes = est3.cortar ? [R3.plano] : []; m.needsUpdate = true; });
  ultimaChave3 = "";
});
rotular3();
ouvintesProc.push(k => { if (R3 && (k === "mascara")) construirDisp(); ultimaChave3 = ""; });

montarEtapas("etapas-3d", ETAPAS_3D, e => { est3.t = e.ini + 0.001; ultimaChave3 = ""; });
const elTempo3 = document.getElementById("tempo-3d");
elTempo3.addEventListener("input", () => { est3.t = +elTempo3.value / 1000 * TT_3D; ultimaChave3 = ""; });
const btTocar3 = document.getElementById("tocar-3d");
function rotularTocar3() { btTocar3.textContent = est3.tocando ? "Pausar" : "Tocar"; }
btTocar3.addEventListener("click", () => { if (!est3.tocando && est3.t >= TT_3D - 0.01) est3.t = 0.001; est3.tocando = !est3.tocando; rotularTocar3(); });
document.getElementById("vel-3d").addEventListener("change", e => { est3.vel = +e.target.value; });
rotularTocar3();

let tTexto3 = 0;
function quadro3D(dt) {
  if (!TEM3D) return;
  iniciar3D();
  const op = etapaEm(ETAPAS_3D, est3.t).id === "operacao";
  if (est3.tocando) { est3.t += dt * est3.vel; if (est3.t >= TT_3D) { est3.t = ETAPAS_3D[ETAPAS_3D.length - 1].ini + 0.001 + (est3.t - TT_3D) % 6; } }
  const S = estadoProc3(est3.t); ultimoS = S;
  elTempo3.value = Math.round(est3.t / TT_3D * 1000);
  marcarEtapas(ETAPAS_3D, est3.t, S.e, S.u);
  const R = R3, cv = R.cv, w = Math.max(240, cv.clientWidth), h = Math.round(clamp(w * 0.72, 340, 560));
  if (R.w !== w || R.h !== h) { R.ren.setSize(w, h, false); cv.style.height = h + "px"; R.cam.aspect = w / h; R.cam.updateProjectionMatrix(); R.w = w; R.h = h; if (!R.camIni) { R.camIni = true; R.cam.position.sub(R.ctl.target).multiplyScalar(fatorCam()).add(R.ctl.target); } }
  aplicarEstado3(S, dt, est3.t);
  tTexto3 += dt; if (tTexto3 > 0.25 || ultimaChave3 === "") { texto3(S); tTexto3 = 0; ultimaChave3 = "ok"; }
  if (R.anim) { R.anim.t = Math.min(1, R.anim.t + dt / 0.9); const k = R.anim.t * R.anim.t * (3 - 2 * R.anim.t); R.cam.position.lerpVectors(R.anim.de, R.anim.para, k); R.ctl.target.lerpVectors(R.anim.deT, R.anim.paraT, k); if (R.anim.t >= 1) R.anim = null; }
  R.ctl.update();
  R.ren.render(R.cena, R.cam);
  atualizarRotulos(S, w, h);
}
