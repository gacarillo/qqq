/* ===================================================================== abas e laço principal */
const ABAS = [["aba-corte", "corte", "fabricacao"], ["aba-d3", "d3", "dispositivo3d"], ["aba-atomos", "atomos", "atomos"], ["aba-operacao", "operacao", "operacao"]];
let abaAtual = "corte";
function mostrarAba(painel, empurrar) {
  abaAtual = painel;
  ABAS.forEach(([b, p, h]) => { const on = p === painel; document.getElementById(b).setAttribute("aria-selected", on); document.getElementById(p).hidden = !on; if (on && empurrar) { try { history.replaceState(null, "", "#" + h); } catch (e) { } } });
}
ABAS.forEach(([b, p]) => document.getElementById(b).addEventListener("click", () => mostrarAba(p, true)));
document.querySelector(".abas").addEventListener("keydown", e => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  const i = ABAS.findIndex(a => a[1] === abaAtual), j = (i + (e.key === "ArrowRight" ? 1 : ABAS.length - 1)) % ABAS.length;
  mostrarAba(ABAS[j][1], true); document.getElementById(ABAS[j][0]).focus();
});
(() => { const h = (location.hash || "").slice(1); const a = ABAS.find(x => x[2] === h); if (a) mostrarAba(a[1], false); })();

recalcular();
let tAnt = performance.now();
function laco(agora) {
  const dt = Math.min(0.05, (agora - tAnt) / 1000); tAnt = agora;
  if (!document.hidden) {
    try {
      if (abaAtual === "corte") quadroCorte(dt);
      else if (abaAtual === "d3") quadro3D(dt);
      else if (abaAtual === "atomos") quadroAtomos(dt);
      else quadroOp(dt);
    } catch (e) { console.error(e); }
  }
  requestAnimationFrame(laco);
}
requestAnimationFrame(laco);
