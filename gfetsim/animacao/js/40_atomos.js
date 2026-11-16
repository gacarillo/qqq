/* ===================================================================== ÁTOMOS 3D */
const estA = { cena: "cascata", ion: 0, tocando: !reduzir, vel: 1, rede: true, t: 0 };
let RA = null;
const A_SI = 0.5431; // nm, parâmetro de rede do Si [P]
function decodCascata(c) {
  const pos = b64i16(c.pos), E = b64i16(c.E), n = c.n;
  const ini = new Float32Array(n * 3), fim = new Float32Array(n * 3);
  // RustBCA usa x como profundidade; na cena y = −x (para baixo), x = y, z = z
  for (let k = 0; k < n; k++) {
    ini[3 * k] = pos[6 * k + 1] / 10; ini[3 * k + 1] = -pos[6 * k] / 10; ini[3 * k + 2] = pos[6 * k + 2] / 10;
    fim[3 * k] = pos[6 * k + 4] / 10; fim[3 * k + 1] = -pos[6 * k + 3] / 10; fim[3 * k + 2] = pos[6 * k + 5] / 10;
  }
  const ion = c.ion.map(p => [p[1], -p[0], p[2], p[3]]);
  // tempo do íon ao longo do caminho com velocidade proporcional a √E
  const tI = [0]; for (let i = 1; i < ion.length; i++) { const d = Math.hypot(ion[i][0] - ion[i - 1][0], ion[i][1] - ion[i - 1][1], ion[i][2] - ion[i - 1][2]); tI.push(tI[i - 1] + d / Math.sqrt(Math.max(ion[i][3], 50) / 30000)); }
  const tot = tI[tI.length - 1];
  const t0 = new Float32Array(n), dur = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let best = 1e9, bi = 0; const x = ini[3 * k], y = ini[3 * k + 1], z = ini[3 * k + 2];
    for (let i = 0; i < ion.length; i += 1) { const d = (ion[i][0] - x) ** 2 + (ion[i][1] - y) ** 2 + (ion[i][2] - z) ** 2; if (d < best) { best = d; bi = i; } }
    const L = Math.hypot(fim[3 * k] - x, fim[3 * k + 1] - y, fim[3 * k + 2] - z), e = Math.max(E[k], 20);
    t0[k] = tI[bi] / tot + Math.sqrt(best) * 0.004; dur[k] = clamp(L / Math.sqrt(e) * 0.02, 0.01, 0.25);
  }
  return { n, ini, fim, E, ion, tI: tI.map(v => v / tot), t0, dur };
}
function iniciarAtomos() {
  if (!TEM3D || RA) return;
  const cv = document.getElementById("cv-atomos");
  const ren = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  ren.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); ren.outputEncoding = THREE.sRGBEncoding;
  const cena = new THREE.Scene(); cena.background = new THREE.Color(0x0a0e11);
  const cam = new THREE.PerspectiveCamera(38, 1.4, 0.05, 2000); cam.position.set(70, -20, 90);
  const ctlA = new THREE.OrbitControls(cam, cv); ctlA.enableDamping = true; ctlA.target.set(0, -40, 0);
  cena.add(new THREE.HemisphereLight(0xffffff, 0x222222, 0.9));
  const luz = new THREE.DirectionalLight(0xffffff, 0.6); luz.position.set(30, 60, 40); cena.add(luz);
  RA = { ren, cena, cam, ctl: ctlA, cv, casc: D.implante.cascatas.map(decodCascata), grupo: new THREE.Group(), rotulos: document.getElementById("rotulos-atomos") };
  cena.add(RA.grupo);
  montarCena();
}
function limparGrupo() { const g = RA.grupo; while (g.children.length) { const c = g.children.pop(); c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => m.dispose()); }); } }
function corEnergia(e, alvo) { // rampa de um tom só, do âmbar escuro ao amarelo claro, em log E
  const f = clamp((Math.log10(Math.max(e, 10)) - 1) / 3.5, 0, 1);
  alvo[0] = 0.35 + 0.65 * f; alvo[1] = 0.18 + 0.72 * f; alvo[2] = 0.05 + 0.5 * f * f; return alvo;
}
function montarCena() {
  limparGrupo(); RA.rotulos.innerHTML = ""; estA.t = 0;
  if (estA.cena === "cascata") montarCascata(); else montarGrafeno();
}
function montarCascata() {
  const c = RA.casc[estA.ion], g = RA.grupo;
  // superfície do Si e óxido nativo
  const sup = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshBasicMaterial({ color: 0x8f84e6, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  sup.rotation.x = -Math.PI / 2; g.add(sup);
  const grade = new THREE.GridHelper(120, 12, 0x2a343c, 0x1c252b); grade.position.y = -0.01; g.add(grade);
  // trajetória do íon
  const pts = c.ion.map(p => new THREE.Vector3(p[0], p[1] + (D.implante.oxido_nativo || 0) * 0, p[2]));
  const geoT = new THREE.BufferGeometry().setFromPoints(pts);
  RA.trilha = new THREE.Line(geoT, new THREE.LineBasicMaterial({ color: 0xffd27a })); RA.trilha.geometry.setDrawRange(0, 1); g.add(RA.trilha);
  RA.ionM = new THREE.Mesh(new THREE.SphereGeometry(0.9, 18, 12), new THREE.MeshBasicMaterial({ color: 0xffffff })); g.add(RA.ionM);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(2.2, 18, 12), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.25, depthWrite: false })); RA.ionM.add(halo);
  // recuos: posição atual, vacância deixada e cor por energia
  const n = c.n, pos = new Float32Array(n * 3), cor = new Float32Array(n * 3), tmp = [0, 0, 0];
  for (let k = 0; k < n; k++) { corEnergia(c.E[k], tmp); cor.set(tmp, 3 * k); }
  const geoR = new THREE.BufferGeometry(); geoR.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geoR.setAttribute("color", new THREE.BufferAttribute(cor, 3));
  RA.rec = new THREE.Points(geoR, new THREE.PointsMaterial({ size: 0.55, vertexColors: true, sizeAttenuation: true })); RA.rec.frustumCulled = false; g.add(RA.rec);
  const posV = new Float32Array(n * 3);
  const geoV = new THREE.BufferGeometry(); geoV.setAttribute("position", new THREE.BufferAttribute(posV, 3));
  RA.vac = new THREE.Points(geoV, new THREE.PointsMaterial({ size: 0.45, color: 0xee6f6f, transparent: true, opacity: 0.55, sizeAttenuation: true, depthWrite: false })); RA.vac.frustumCulled = false; g.add(RA.vac);
  // rede de diamante fantasma perto da trajetória
  const chave = new Set(), rede = [], base = [[0, 0, 0], [0, .5, .5], [.5, 0, .5], [.5, .5, 0], [.25, .25, .25], [.25, .75, .75], [.75, .25, .75], [.75, .75, .25]];
  const r2 = 1.3 * 1.3;
  for (let i = 0; i < c.ion.length; i++) {
    const p = c.ion[i]; if (p[1] > 0.1) continue;
    const i0 = Math.floor((p[0] - 1.4) / A_SI), i1 = Math.ceil((p[0] + 1.4) / A_SI), j0 = Math.floor((p[1] - 1.4) / A_SI), j1 = Math.ceil((p[1] + 1.4) / A_SI), k0 = Math.floor((p[2] - 1.4) / A_SI), k1 = Math.ceil((p[2] + 1.4) / A_SI);
    for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) for (let d = k0; d <= k1; d++) base.forEach((bb, m) => {
      const x = (a + bb[0]) * A_SI, y = (b + bb[1]) * A_SI, z = (d + bb[2]) * A_SI;
      if (y > 0 || (x - p[0]) ** 2 + (y - p[1]) ** 2 + (z - p[2]) ** 2 > r2) return;
      const ch = `${a},${b},${d},${m}`; if (chave.has(ch)) return; chave.add(ch); rede.push(x, y, z);
    });
  }
  const geoD = new THREE.BufferGeometry(); geoD.setAttribute("position", new THREE.BufferAttribute(new Float32Array(rede), 3));
  RA.redeM = new THREE.Points(geoD, new THREE.PointsMaterial({ size: 0.16, color: 0x8a98a2, transparent: true, opacity: 0.55, sizeAttenuation: true, depthWrite: false })); RA.redeM.visible = estA.rede; g.add(RA.redeM);
  // escala de profundidade
  const marc = [];
  for (let z = 0; z <= 120; z += 20) { const d = document.createElement("div"); d.className = "rotulo3d"; d.textContent = `${z} nm`; RA.rotulos.appendChild(d); marc.push({ d, p: [-34, -z, 0] }); }
  const lR = document.createElement("div"); lR.className = "rotulo3d"; lR.textContent = `Rp ${br(I.Rp, 0)} nm`; RA.rotulos.appendChild(lR); marc.push({ d: lR, p: [30, -I.Rp, 0] });
  RA.marc = marc; RA.nRede = rede.length / 3;
  const ext = Math.max(...c.ion.map(p => -p[1]));
  RA.ctl.target.set(0, -ext / 2, 0); RA.cam.position.set(70, -ext / 2 + 25, 90);
  document.getElementById("atomos-titulo").textContent = "Cascata de um íon de P no Si";
  document.getElementById("at-graf-titulo").textContent = "Energia do íon ao longo do caminho";
  document.getElementById("nota-atomos").textContent = `Um íon de P de ${br(I.energia_keV, 0)} keV com todos os ${c.n.toLocaleString("pt-BR")} recuos de Si que o RustBCA acompanhou, em nm reais. Cada átomo deslocado sai do seu sítio, deixa uma vacância em vermelho e para como intersticial; a cor clareia com a energia recebida. O BCA trata o alvo como amorfo, por isso a rede de diamante perto da trajetória é só referência visual, com o parâmetro de 0,543 nm.`;
  ["at-ion", "at-rede"].forEach(id => document.getElementById(id).closest(".campo").style.display = "");
}
function quadroCascata(dt) {
  const c = RA.casc[estA.ion];
  if (estA.tocando) { estA.t += dt * estA.vel / 9; if (estA.t > 1.35) estA.t = 0; }
  const t = estA.t;
  // íon
  const k = clamp(t, 0, 1), i = Math.min(c.ion.length - 1, Math.max(0, c.tI.findIndex(v => v >= k)));
  const p = c.ion[i]; RA.ionM.position.set(p[0], p[1], p[2]); RA.ionM.visible = t < 1.02;
  RA.trilha.geometry.setDrawRange(0, i + 1);
  const pos = RA.rec.geometry.attributes.position.array, vac = RA.vac.geometry.attributes.position.array;
  let nAt = 0, eTot = 0;
  for (let r = 0; r < c.n; r++) {
    const f = clamp((t - c.t0[r]) / c.dur[r], 0, 1), j = 3 * r;
    if (t < c.t0[r]) { pos[j + 1] = 999; vac[j + 1] = 999; continue; }
    const s = 1 - (1 - f) * (1 - f);
    pos[j] = c.ini[j] + (c.fim[j] - c.ini[j]) * s; pos[j + 1] = c.ini[j + 1] + (c.fim[j + 1] - c.ini[j + 1]) * s; pos[j + 2] = c.ini[j + 2] + (c.fim[j + 2] - c.ini[j + 2]) * s;
    vac[j] = c.ini[j]; vac[j + 1] = c.ini[j + 1]; vac[j + 2] = c.ini[j + 2];
    nAt++; eTot += c.E[r];
  }
  RA.rec.geometry.attributes.position.needsUpdate = true; RA.vac.geometry.attributes.position.needsUpdate = true;
  RA.redeM.visible = estA.rede;
  const prof = -p[1], Eatual = p[3];
  document.getElementById("at-cab").textContent = t < 1 ? `Íon a ${br(prof, 1)} nm, com ${br(Eatual / 1000, 1)} keV` : `Íon parado a ${br(-c.ion[c.ion.length - 1][1], 1)} nm`;
  document.getElementById("at-texto").textContent = "O P⁺ perde energia por freamento eletrônico, contínuo ao longo do caminho, e por colisões nucleares, que mudam sua direção e lançam átomos de Si. Os recuos mais energéticos abrem subcascatas. Onde a densidade de vacâncias passa do limiar a rede colapsa em Si amorfo, que é a camada que a SPE recristaliza depois.";
  document.getElementById("at-numeros").innerHTML = numerosHTML([
    ["recuos já lançados", nAt.toLocaleString("pt-BR"), "C"], ["de um total de", c.n.toLocaleString("pt-BR"), "C"],
    ["energia dos recuos", `${br(eTot / 1000, 1)} keV`, "C"], ["profundidade final", `${br(-c.ion[c.ion.length - 1][1], 1)} nm`, "C"],
    ["Rp da distribuição", `${br(I.Rp, 1)} nm`, "C"], ["sítios de rede desenhados", RA.nRede.toLocaleString("pt-BR"), ""],
  ]);
  grafCascata(c, prof);
}
function grafCascata(c, prof) {
  const { ctx, w, h } = preparar(document.getElementById("cv-at-graf")); ctx.clearRect(0, 0, w, h);
  const cx = { x0: 52, y0: 10, x1: w - 10, y1: h - 38 };
  const zmax = Math.max(...c.ion.map(p => -p[1])) * 1.05;
  const { X, Y } = eixos(ctx, cx, [0, zmax], [0, 31], { xt: ticks(0, zmax, 5).map(v => [v, br(v, 0)]), yt: [0, 10, 20, 30].map(v => [v, String(v)]), xl: "profundidade (nm)", yl: "E do íon (keV)" });
  // histograma de recuos por profundidade de origem
  const nb = 30, hist = new Array(nb).fill(0); for (let r = 0; r < c.n; r++) { const z = -c.ini[3 * r + 1]; const b = Math.floor(z / zmax * nb); if (b >= 0 && b < nb) hist[b]++; }
  const hm = Math.max(...hist); ctx.fillStyle = "rgba(238,111,111,.25)";
  hist.forEach((v, b) => { const x0 = X(b / nb * zmax), x1 = X((b + 1) / nb * zmax), y = Y(v / hm * 30); ctx.fillRect(x0, y, x1 - x0 - 1, cx.y1 - y); });
  curva(ctx, c.ion.map(p => -p[1]), c.ion.map(p => p[3] / 1000), X, Y, "#ffd27a", 2);
  ponto(ctx, X(prof), Y(interp(c.ion.map(p => -p[1]), c.ion.map(p => p[3] / 1000), prof)), "#ffd27a");
  lab(ctx, cx.x1 - 4, cx.y0 + 12, "barras, recuos por profundidade", "right", COR.lacuna);
}

/* ---------------------------------------------------------------- grafeno sobre SiO2 */
const A_CC = 0.142; // nm, distância C–C [P]
function montarGrafeno() {
  const g = RA.grupo, Lx = 20, Lz = 20, a = A_CC;
  const r = semente(77);
  // SiO2 amorfo: pontos aleatórios com densidade próxima de 66 átomos por nm³ em 2 nm de espessura (só desenho)
  const nOx = Math.round(Lx * Lz * 2 * 66 * 0.35), ox = new Float32Array(nOx * 3), oxc = new Float32Array(nOx * 3);
  for (let i = 0; i < nOx; i++) { ox[3 * i] = -Lx / 2 + r() * Lx; ox[3 * i + 1] = -0.32 - r() * 2; ox[3 * i + 2] = -Lz / 2 + r() * Lz; const si = r() < 1 / 3; oxc.set(si ? [0.54, 0.6, 0.64] : [0.9, 0.42, 0.38], 3 * i); }
  const gOx = new THREE.BufferGeometry(); gOx.setAttribute("position", new THREE.BufferAttribute(ox, 3)); gOx.setAttribute("color", new THREE.BufferAttribute(oxc, 3));
  g.add(new THREE.Points(gOx, new THREE.PointsMaterial({ size: 0.11, vertexColors: true, transparent: true, opacity: 0.8 })));
  // rede de favo de mel; rugosidade de ~0,3 nm acompanhando o óxido [I]
  const atomos = [], lig = [];
  const a1 = [1.5 * a, Math.sqrt(3) / 2 * a], a2 = [1.5 * a, -Math.sqrt(3) / 2 * a];
  const ni = Math.ceil(Lx / (1.5 * a)) + 2, nj = Math.ceil(Lz / (Math.sqrt(3) * a)) + 2, idx = new Map();
  const alt = (x, z) => 0.12 * Math.sin(x * 0.9 + 1.3) * Math.cos(z * 0.7) + 0.08 * Math.sin(x * 2.1 - z * 1.7);
  for (let i = -ni; i <= ni; i++) for (let j = -nj; j <= nj; j++) for (let s = 0; s < 2; s++) {
    const x = i * a1[0] + j * a2[0] + s * a, z = i * a1[1] + j * a2[1];
    if (Math.abs(x) > Lx / 2 || Math.abs(z) > Lz / 2) continue;
    idx.set(`${i},${j},${s}`, atomos.length / 3); atomos.push(x, alt(x, z), z);
  }
  for (const [ch, k] of idx) { const [i, j, s] = ch.split(",").map(Number); if (s !== 0) continue; [[i, j, 1], [i - 1, j, 1], [i, j - 1, 1]].forEach(v => { const m = idx.get(v.join(",")); if (m !== undefined) lig.push(k, m); }); }
  const nA = atomos.length / 3, pos = new Float32Array(atomos), cor = new Float32Array(nA * 3).fill(0.8);
  const gA = new THREE.BufferGeometry(); gA.setAttribute("position", new THREE.BufferAttribute(pos, 3)); gA.setAttribute("color", new THREE.BufferAttribute(cor, 3));
  RA.grA = new THREE.Points(gA, new THREE.PointsMaterial({ size: 0.09, vertexColors: true })); g.add(RA.grA);
  const gL = new THREE.BufferGeometry(); gL.setAttribute("position", gA.attributes.position); gL.setAttribute("color", gA.attributes.color); gL.setIndex(lig);
  RA.grL = new THREE.LineSegments(gL, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6 })); g.add(RA.grL);
  // ilha de bicamada AB num canto, como as ilhas multicamada do Raman (lá têm µm)
  const bi = [];
  for (let k = 0; k < nA; k++) { const x = pos[3 * k] + a, z = pos[3 * k + 2]; if ((x - 5) ** 2 + (z + 5) ** 2 < 9) bi.push(x, pos[3 * k + 1] + 0.335, z); }
  const gB = new THREE.BufferGeometry(); gB.setAttribute("position", new THREE.BufferAttribute(new Float32Array(bi), 3));
  g.add(new THREE.Points(gB, new THREE.PointsMaterial({ size: 0.07, color: 0xb9c3c9, transparent: true, opacity: 0.75 })));
  // moléculas de água presas na interface (histerese, R47 e R48)
  const agua = new THREE.Group(), mO = new THREE.MeshBasicMaterial({ color: 0x9fd3ff }), mH = new THREE.MeshBasicMaterial({ color: 0xe7ecef });
  const geoO = new THREE.SphereGeometry(0.075, 10, 8), geoH = new THREE.SphereGeometry(0.045, 8, 6);
  RA.aguas = [];
  for (let i = 0; i < 14; i++) { const m = new THREE.Group(); m.add(new THREE.Mesh(geoO, mO)); const h1 = new THREE.Mesh(geoH, mH), h2 = new THREE.Mesh(geoH, mH); h1.position.set(0.076, 0.059, 0); h2.position.set(-0.076, 0.059, 0); m.add(h1, h2);
    m.position.set(-Lx / 2 + r() * Lx, -0.17, -Lz / 2 + r() * Lz); m.userData.f = r() * 6.28; agua.add(m); RA.aguas.push(m); }
  g.add(agua);
  // poças de carga: soma de gaussianas com amplitude de n* e comprimento ilustrativo de 5 nm [I]
  RA.pocas = Array.from({ length: 22 }, () => ({ x: -Lx / 2 + r() * Lx, z: -Lz / 2 + r() * Lz, s: r() < 0.5 ? -1 : 1, l: 3 + r() * 4 }));
  RA.grPos = pos; RA.grN = nA;
  RA.ctl.target.set(0, 0, 0); RA.cam.position.set(4.5, 3.2, 6);
  document.getElementById("atomos-titulo").textContent = "Grafeno sobre SiO₂ amorfo";
  document.getElementById("at-graf-titulo").textContent = "Densidade local ao longo de uma linha";
  document.getElementById("nota-atomos").textContent = `Janela de 20 × 20 nm com ${nA.toLocaleString("pt-BR")} átomos de C a 0,142 nm, sobre óxido amorfo, com moléculas de água na interface e uma ilha de bicamada. A cor mostra a densidade local, que é a do modelo elétrico na tensão atual mais as poças de carga. Com nD = 2,2 × 10¹⁰ cm⁻² do seu Raman há em média um defeito a cada 4.500 nm², cerca de 67 nm entre defeitos, então esta janela quase nunca contém um.`;
  ["at-ion", "at-rede"].forEach(id => document.getElementById(id).closest(".campo").style.display = "none");
}
function nLocal(x, z, nMed) {
  const ns = LIG.poca ? KC.n_estrela * 1e4 : 0; let d = 0;
  RA.pocas.forEach(p => { d += p.s * Math.exp(-((x - p.x) ** 2 + (z - p.z) ** 2) / (2 * p.l * p.l)); });
  return nMed + ns * 1.6 * d;
}
function quadroGrafeno(dt) {
  const o = passoOp(dt), cor = RA.grA.geometry.attributes.color, pos = RA.grPos, ce = new THREE.Color(COR.eletron), ch = new THREE.Color(COR.lacuna), cn = new THREE.Color(0xcfd6da);
  const esc = 1.2e16;
  for (let k = 0; k < RA.grN; k++) {
    const n = nLocal(pos[3 * k], pos[3 * k + 2], o.n), f = clamp(Math.abs(n) / esc, 0, 1) ** 0.6, c = n > 0 ? ce : ch;
    cor.setXYZ(k, cn.r + (c.r - cn.r) * f, cn.g + (c.g - cn.g) * f, cn.b + (c.b - cn.b) * f);
  }
  cor.needsUpdate = true;
  const tt = performance.now() / 1000, ang = LIG.hist ? clamp(opEst.Vt / Math.max(0.05, M.alfa * 7), -1, 1) * 1.1 : 0;
  RA.aguas.forEach(m => { m.rotation.z = ang + 0.25 * Math.sin(tt * 2 + m.userData.f); m.rotation.y = tt * 0.3 + m.userData.f; });
  document.getElementById("at-cab").textContent = `V_G = ${br(opEst.Vg, 2)} V, n médio ${sci(o.n / 1e4, 1)} cm⁻²`;
  document.getElementById("at-texto").textContent = "Perto do ponto de Dirac a carga média some, mas a desordem do óxido e das impurezas deixa poças de elétrons e de lacunas lado a lado. Longe dele as poças somem diante da carga induzida pela porta. A água ligada ao silanol do SiO₂ gira com o campo e prende carga, o que causa a histerese.";
  document.getElementById("at-numeros").innerHTML = numerosHTML([["n*", `${sci(KC.n_estrela, 2)} cm⁻²`, "P"], ["E_F − E_D", `${br(1000 * interp(M.E.V, M.E.mu, o.Vrel), 0)} meV`, "C"], ["ilhas multicamada", "17 % da área", "B"], ["entre defeitos", "≈ 67 nm", "C"]]);
  const { ctx, w, h } = preparar(document.getElementById("cv-at-graf")); ctx.clearRect(0, 0, w, h);
  const cx = { x0: 52, y0: 10, x1: w - 10, y1: h - 38 }, xs = [], ys = [];
  for (let i = 0; i <= 120; i++) { const x = -10 + i / 6; xs.push(x); ys.push(nLocal(x, 0, o.n) / 1e16); }
  const m = Math.max(1, ...ys.map(Math.abs)) * 1.1;
  const { X, Y } = eixos(ctx, cx, [-10, 10], [-m, m], { xt: [-10, -5, 0, 5, 10].map(v => [v, String(v)]), yt: ticks(-m, m, 4).map(v => [v, br(v, 1)]), xl: "posição (nm)", yl: "n (10¹² cm⁻²)" });
  curva(ctx, [-10, 10], [0, 0], X, Y, COR.tinta3, 1, [4, 3]); curva(ctx, xs, ys, X, Y, o.n > 0 ? COR.eletron : COR.lacuna, 2);
}

/* ---------------------------------------------------------------- controles e quadro */
document.getElementById("at-cena").addEventListener("change", e => { estA.cena = e.target.value; if (RA) montarCena(); });
document.getElementById("at-ion").addEventListener("change", e => { estA.ion = +e.target.value; if (RA) montarCena(); });
document.getElementById("at-rede").addEventListener("change", e => { estA.rede = e.target.value === "sim"; });
document.getElementById("at-vel").addEventListener("change", e => { estA.vel = +e.target.value; });
const btTocarA = document.getElementById("at-tocar");
function rotularTocarA() { btTocarA.textContent = estA.tocando ? "Pausar" : "Tocar"; }
btTocarA.addEventListener("click", () => { estA.tocando = !estA.tocando; rotularTocarA(); }); rotularTocarA();
let tTxtA = 0;
function quadroAtomos(dt) {
  if (!TEM3D) return;
  iniciarAtomos();
  const R = RA, cv = R.cv, w = Math.max(240, cv.clientWidth), h = Math.round(clamp(w * 0.72, 340, 560));
  if (R.w !== w || R.h !== h) { R.ren.setSize(w, h, false); cv.style.height = h + "px"; R.cam.aspect = w / h; R.cam.updateProjectionMatrix(); R.w = w; R.h = h; }
  tTxtA += dt;
  if (estA.cena === "cascata") quadroCascata(dt); else if (tTxtA > 0.08) { quadroGrafeno(tTxtA); tTxtA = 0; }
  R.ctl.update(); R.ren.render(R.cena, R.cam);
  if (estA.cena === "cascata" && R.marc) { const v = new THREE.Vector3(); R.marc.forEach(m => { v.set(...m.p).project(R.cam); const ok = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05; m.d.style.display = ok ? "block" : "none"; if (ok) { m.d.style.left = ((v.x + 1) / 2 * w) + "px"; m.d.style.top = ((1 - v.y) / 2 * h) + "px"; } }); }
}
