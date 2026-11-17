"""Verificação do módulo 5 (incerteza).

* Sobol (SALib) na função de Ishigami (Ishigami e Homma, 10.1109/ISUMA.1990.151285),
  cujos índices têm forma fechada [C]. Tolerância: 3 vezes o intervalo de confiança do
  SALib, com no mínimo 0,03.
* As marginais amostradas reproduzem as distribuições declaradas no params.yaml.
* Ramos ficam separados: dois ramos de aceleração da oxidação dão distribuições distintas.
"""
import numpy as np
import pytest

from gfetsim import carregar
from gfetsim.incerteza import montecarlo as mc
from gfetsim.incerteza.sobol import indices, problema


def test_sobol_ishigami():
    a, b = 7.0, 0.1
    f = lambda x: np.sin(x[0]) + a * np.sin(x[1]) ** 2 + b * x[2] ** 4 * np.sin(x[0])
    pr = problema(["x1", "x2", "x3"], [(-np.pi, np.pi)] * 3)
    r = indices(f, pr, N=4096)
    V1 = 0.5 * (1 + b * np.pi**4 / 5) ** 2
    V2 = a**2 / 8
    V13 = 8 * b**2 * np.pi**8 / 225
    V = V1 + V2 + V13
    S1 = np.array([V1, V2, 0.0]) / V
    ST = np.array([V1 + V13, V2, V13]) / V
    assert np.all(np.abs(r["S1"] - S1) < np.maximum(3 * r["S1_ic"], 0.03))
    assert np.all(np.abs(r["ST"] - ST) < np.maximum(3 * r["ST_ic"], 0.03))


def test_marginais_declaradas():
    p = carregar(aceitar_provisorios=True)
    rng = np.random.default_rng(1)
    am = mc.amostrar(p, {"oxidacao": {"metodo": "termico"}}, 20000, rng)
    dose = np.array([t["dose"] for t in am])
    assert dose.mean() == pytest.approx(3e15, rel=0.005)
    assert dose.std() / dose.mean() == pytest.approx(0.05, rel=0.05)
    nd = np.log10([t["n_dop"] for t in am])
    inc = p.incerteza("eletrico.grafeno.dopagem_residual_prior")
    assert nd.min() >= np.log10(inc["min"]) - 1e-9 and nd.max() <= np.log10(inc["max"]) + 1e-9
    assert nd.mean() == pytest.approx(0.5 * (np.log10(inc["min"]) + np.log10(inc["max"])), abs=0.02)


@pytest.mark.lento
def test_ramos_separados():
    rec = {"aceitar_provisorios": True, "recozimento": {"variante": "A_rta"},
           "oxidacao": {"metodo": "termico", "T_C": 900.0, "t_min": 30.0}}
    r1 = mc.rodar(rec, n=24, processos=4, ramos={"aceleracao": "sem_aceleracao"})
    r2 = mc.rodar(rec, n=24, processos=4, ramos={"aceleracao": "ho_plummer"})
    e1, e2 = r1["saidas"]["espessura_ox_nm"], r2["saidas"]["espessura_ox_nm"]
    assert e2.min() > e1.max()
