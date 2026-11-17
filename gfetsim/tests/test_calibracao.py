"""Validação do módulo 6 (calibração).

* Regressão do sputtering contra os números publicados pelo usuário no artigo (ART,
  tabelas 1 e 2 e seção 3.1): inclinação 0,088 com IC de 0,072 a 0,104, R2 = 0,996,
  p = 0,002, intercepto com p = 0,19 e tempos para 20 nm. Tolerância de meia unidade
  na última casa publicada.
* Recuperação de parâmetros de uma curva de transferência sintética (mínimos quadrados
  ponderados e emcee): os valores verdadeiros ficam a menos de 3 desvios.
"""
import numpy as np
import pytest

from gfetsim import carregar
from gfetsim.calibracao import ajuste
from gfetsim.constantes import q

RAIZ = __import__("pathlib").Path(__file__).resolve().parents[1]


def test_reproduz_regressao_do_artigo():
    d, _ = ajuste.ler_csv(RAIZ / "dados" / "sputtering_calibracao.csv")
    r = ajuste.calibrar_sputtering(d)
    assert r["inclinacao"] == pytest.approx(0.088, abs=0.0005)
    assert r["ic95"][0] == pytest.approx(0.072, abs=0.0005)
    assert r["ic95"][1] == pytest.approx(0.104, abs=0.0005)
    assert r["r2"] == pytest.approx(0.996, abs=0.0005)
    assert r["p"] == pytest.approx(0.002, abs=0.0005)
    assert r["p_intercepto"] == pytest.approx(0.19, abs=0.005)
    tabela2 = {30: (9.4, 7.1, 14.0, 6.2, 19.5), 40: (6.6, 5.6, 8.2, 4.9, 10.1), 50: (5.1, 4.6, 5.9, 4.1, 6.9)}
    for pw, (t, ic0, ic1, ip0, ip1) in tabela2.items():
        x = r[f"tempo_20nm_{pw}W"]
        assert x["tempo"] == pytest.approx(t, abs=0.05)
        assert x["ic95"] == pytest.approx((ic0, ic1), abs=0.05)
        assert x["ip95"] == pytest.approx((ip0, ip1), abs=0.05)


@pytest.fixture(scope="module")
def sintetico():
    p = carregar(aceitar_provisorios=True)
    f = ajuste.modelo_transferencia(p, 20.0)
    verdade = dict(V_D=-2.0, log_mu=3.3, log_n0=11.6, Rc=800.0)
    V = np.linspace(-8, 4, 49)
    R = f(V, verdade["V_D"], verdade["log_mu"], verdade["log_n0"], verdade["Rc"], 5.0)
    rng = np.random.default_rng(4)
    sig = 0.01 * R
    return p, f, verdade, V, R + rng.normal(0, sig), sig


def test_recupera_transferencia_mqp(sintetico):
    p, f, v, V, R, s = sintetico
    g = lambda V, a, b, c, d: f(V, a, b, c, d, 5.0)
    aj = ajuste.mqp(g, V, R, s, [-1.0, 3.0, 11.5, 300.0], ([-8, 1.5, 10, 0], [4, 5, 13, 5000]),
                    ["V_D", "log_mu", "log_n0", "Rc"])
    for nome, val, err in zip(aj.nomes, aj.valores, aj.erros):
        assert abs(val - v[nome]) < 3 * err + 1e-9, nome


@pytest.mark.lento
def test_recupera_transferencia_emcee(sintetico):
    p, f, v, V, R, s = sintetico
    g = lambda V, a, b, c, d: f(V, a, b, c, d, 5.0)
    cad = ajuste.posterior_emcee(g, V, R, s, ([-8, 1.5, 10, 0], [4, 5, 13, 5000]), [-1.9, 3.25, 11.55, 780.0],
                                 n_passos=600, n_caminhantes=16)
    for i, nome in enumerate(["V_D", "log_mu", "log_n0", "Rc"]):
        lo, hi = np.percentile(cad[:, i], [0.15, 99.85])
        assert lo <= v[nome] <= hi, nome
