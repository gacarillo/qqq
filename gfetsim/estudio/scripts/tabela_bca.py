"""Tabela de implantação do RustBCA para o estúdio interpolar ao vivo.

Para cada energia, inclinação e espessura de óxido nativo roda o RustBCA (alvo amorfo,
potencial Kr-C, Lindhard e Scharff) e guarda
* os quatro momentos da profundidade final no Si (média, desvio, assimetria, curtose);
* a fração de íons no Si, no óxido e refletida;
* o histograma da profundidade final, em fatias de 1 nm, para conferir o Pearson;
* a perda nuclear do íon por profundidade (eV/cm por íon), base da camada amorfa;
* média e desvio do deslocamento lateral por faixa de profundidade.

Também roda P em SiO2 espesso, cujo alcance dá a transmissão por uma máscara de
espessura qualquer. O estúdio interpola entre os pontos e marca o resultado como [C].

    python3 scripts/tabela_bca.py            # cerca de 20 min com 4 núcleos
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
sys.path.insert(0, str(RAIZ / "src"))

from gfetsim.implantacao import rustbca as rb  # noqa: E402
from gfetsim.params import carregar  # noqa: E402

ENERGIAS = [5.0, 10.0, 15.0, 20.0, 25.0, 30.0, 35.0, 40.0, 50.0, 60.0, 70.0, 80.0, 100.0]
OXIDOS = [0.0, 1.5, 3.0, 5.0]
INCLINACOES = [0.0, 7.0, 15.0]
N_IONS = 20000
DESTINO = AQUI.parent / "src" / "dados" / "tabela_bca.json"
PARCIAL = Path(os.environ.get("GFETSIM_TABELA_PARCIAL", Path(tempfile.gettempdir()) / "tabela_bca_parcial.json"))


def rodar(p, E, th, camadas, semente):
    total = sum(c.espessura_nm for c in camadas)
    toml = rb._toml("gfet_", E * 1000.0, th, camadas, N_IONS, semente, 1, total)
    fios = os.cpu_count() or 4
    toml = toml.replace("num_threads = 1", f"num_threads = {fios}").replace("num_chunks = 10", f"num_chunks = {4 * fios}")
    d = Path(tempfile.mkdtemp(prefix="gfet_tab_"))
    (d / "e.toml").write_text(toml)
    subprocess.run([rb.binario(p), "1D", "e.toml"], cwd=d, check=True, capture_output=True)
    dep = rb._ler(d / "gfet_deposited.output", 6)
    refl = rb._ler(d / "gfet_reflected.output", 10)
    perdas = rb._ler(d / "gfet_energy_loss.output", 7)
    shutil.rmtree(d, ignore_errors=True)  # as saídas brutas ocupam centenas de MB
    return dep, int(refl.shape[0]), perdas


def momentos(x):
    m = float(np.mean(x)); dd = x - m; s = float(np.sqrt(np.mean(dd**2)))
    return [m, s, float(np.mean(dd**3) / s**3), float(np.mean(dd**4) / s**4)]


def ponto(p, E, th, ox, semente):
    dep, nrefl, perdas = rodar(p, E, th, rb.camadas_receita(p, ox, 1000.0), semente)
    x = dep[:, 2] - ox
    y = dep[:, 3]
    no_si = x > 0
    xs, ys = x[no_si], y[no_si]
    xmax = float(np.ceil(max(np.percentile(xs, 99.9) * 1.3, 40.0)))
    bordas = np.arange(0.0, xmax + 1.0, 1.0)
    hist, _ = np.histogram(xs, bins=bordas)
    pn, _ = np.histogram(perdas[:, 4] - ox, bins=bordas, weights=perdas[:, 2])
    Fn = pn / N_IONS / 1e-7  # eV/cm por íon
    # lateral por faixa de 4 nm, só onde há íons suficientes
    lb = np.arange(0.0, xmax + 4.0, 4.0)
    idx = np.digitize(xs, lb) - 1
    lat_x, lat_m, lat_s = [], [], []
    for i in range(lb.size - 1):
        sel = idx == i
        if sel.sum() >= 150:
            lat_x.append(0.5 * (lb[i] + lb[i + 1])); lat_m.append(float(np.mean(ys[sel]))); lat_s.append(float(np.std(ys[sel])))
    return {
        "E_keV": E, "inclinacao": th, "oxido_nm": ox, "n_ions": N_IONS,
        "f_si": float(no_si.sum() / N_IONS), "f_oxido": float((~no_si).sum() / N_IONS), "f_refletida": nrefl / N_IONS,
        "momentos": momentos(xs), "dx_nm": 1.0,
        "hist": hist.astype(int).tolist(), "Fn": [round(float(v), 1) for v in Fn],
        "lateral": {"x": lat_x, "media": [round(v, 3) for v in lat_m], "desvio": [round(v, 3) for v in lat_s],
                    "desvio_total": float(np.std(ys)), "media_total": float(np.mean(ys))},
    }


def alcance_sio2(p, E, th, semente):
    ox = p.no("implantacao.rustbca.SiO2")
    camadas = [rb.Camada("SiO2", 3000.0, {"Si": ox["densidade_Si_cm3"] * 1e-12, "O": ox["densidade_O_cm3"] * 1e-12})]
    dep, nrefl, _ = rodar(p, E, th, camadas, semente)
    x = dep[:, 2]
    return {"E_keV": E, "inclinacao": th, "momentos": momentos(x), "f_refletida": nrefl / N_IONS,
            "p999_nm": float(np.percentile(x, 99.9)), "max_nm": float(x.max())}


def main():
    p = carregar(aceitar_provisorios=True)
    feito = json.loads(PARCIAL.read_text()) if PARCIAL.exists() else {}  # retoma uma rodada interrompida
    combos = [(E, 7.0, ox) for E in ENERGIAS for ox in OXIDOS] + [(E, th, 1.5) for E in ENERGIAS for th in INCLINACOES if th != 7.0]
    pontos, sio2 = [], []
    for k, (E, th, ox) in enumerate(combos):
        ch = f"p|{E}|{th}|{ox}"
        if ch not in feito:
            feito[ch] = ponto(p, E, th, ox, 101 + k)
            PARCIAL.write_text(json.dumps(feito))
        pontos.append(feito[ch])
        print(f"{k + 1}/{len(combos)} E={E} th={th} ox={ox} Rp={pontos[-1]['momentos'][0]:.2f}", flush=True)
    for k, E in enumerate(ENERGIAS):
        ch = f"s|{E}"
        if ch not in feito:
            feito[ch] = alcance_sio2(p, E, 7.0, 301 + k)
            PARCIAL.write_text(json.dumps(feito))
        sio2.append(feito[ch])
        print(f"SiO2 E={E} Rp={sio2[-1]['momentos'][0]:.1f}", flush=True)
    DESTINO.write_text(json.dumps({
        "fonte": "RustBCA commit a356280, alvo amorfo, Kr-C, Lindhard-Scharff, densidades do params.yaml",
        "n_ions": N_IONS, "energias": ENERGIAS, "oxidos": OXIDOS, "inclinacoes": INCLINACOES,
        "pontos": pontos, "sio2": sio2}, separators=(",", ":")))
    print("ok", DESTINO)


if __name__ == "__main__":
    main()
