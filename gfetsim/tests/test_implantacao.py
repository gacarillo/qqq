"""Validação do módulo 1 (implantação).

O que é testado contra dado publicado, e com qual tolerância
* Alcance (G1, K1). G1 diz que o Rp medido por RBS supera a teoria LSS em
  15 % perto de eps = 0,5 e em 40 a 70 % em eps baixo; K1 diz que o Rp de P
  medido por NRA concorda com o TRIM. As duas fontes discordam. O teste só exige
  que o RustBCA (alvo amorfo, como o TRIM) fique dentro do intervalo que G1
  declara entre medida e teoria, isto é, Rp_BCA/Rp_G1 entre 1/1,7 e 1.
  É um teste fraco, registrado como tal no relatório.
* Amorfização (A2, A3, A4, A6). O critério de 6e23 eV/cm3 de A4 vale a baixa
  temperatura (A6). O teste documenta que ele prevê limiar abaixo da faixa
  medida a 300 K em A2, motivo do ramo limiar_TA. Com o ramo limiar_TA, a dose
  de 1e16 de A3 tem de dar camada amorfa para toda a faixa de A2.
"""
import numpy as np
import pytest

from gfetsim import carregar
from gfetsim.implantacao import rustbca as rb
from gfetsim.implantacao.modulo import camada_amorfa, energia_nuclear, simular
from gfetsim.implantacao.pearson import Momentos, densidade_pearson

A0_NM = 0.0529177    # raio de Bohr (CODATA)
E2_EV_NM = 1.439964  # e^2/(4 pi eps0) em eV nm (CODATA)


@pytest.fixture(scope="module")
def p():
    return carregar()


@pytest.mark.parametrize("mo", [Momentos(40.2, 18.4, 0.285, 2.716), Momentos(40, 18, 0.6, 3.8),
                                Momentos(40, 18, -0.4, 3.5)])
def test_pearson_recupera_momentos(mo):
    g = np.linspace(-150, 350, 50001)
    f, _ = densidade_pearson(g, mo)
    m = np.trapezoid(g * f, g)
    s = np.sqrt(np.trapezoid((g - m) ** 2 * f, g))
    sk = np.trapezoid((g - m) ** 3 * f, g) / s**3
    ku = np.trapezoid((g - m) ** 4 * f, g) / s**4
    assert m == pytest.approx(mo.media, rel=1e-3)
    assert s == pytest.approx(mo.desvio, rel=1e-3)
    assert sk == pytest.approx(mo.assimetria, abs=5e-3)
    assert ku == pytest.approx(mo.curtose, abs=2e-2)


def _rp_grant(E_keV, p):
    """Rp pela relação rho_p = 1,75 eps^(2/3) de G1, em unidades reduzidas de LSS [C]."""
    Z1, M1, Z2, M2 = 15, rb.MASSA_P, 14, rb.ELEMENTOS["Si"][1]
    N = p.no("implantacao.rustbca.Si")["densidade_at_cm3"] * 1e-21  # nm^-3
    a = 0.8853 * A0_NM / np.sqrt(Z1 ** (2 / 3) + Z2 ** (2 / 3))
    eps = a * M2 * E_keV * 1e3 / (Z1 * Z2 * E2_EV_NM * (M1 + M2))
    c = p.valor("implantacao.validacao.alcance_grant.coeficiente")
    e = p.valor("implantacao.validacao.alcance_grant.expoente")
    rho = c * eps**e
    return eps, rho / (N * 4 * np.pi * a**2 * M1 * M2 / (M1 + M2) ** 2)


@pytest.mark.lento
@pytest.mark.parametrize("E", [15.0, 20.0])
def test_alcance_dentro_da_discordancia_publicada(p, E):
    eps, rp_g = _rp_grant(E, p)
    faixa = p.no("implantacao.validacao.alcance_grant.faixa_eps")
    assert faixa["min"] < eps < faixa["max"]
    r = rb.rodar(E, 0.0, rb.camadas_receita(p, 0.0), n_ions=20000, semente=11)
    razao = r.x_nm.mean() / rp_g
    assert 1 / 1.7 <= razao <= 1.0, f"Rp_BCA/Rp_G1 = {razao:.3f}"


@pytest.mark.lento
def test_criterio_baixa_T_preve_limiar_abaixo_do_medido_a_300K(p):
    """Documenta a falha que motivou o ramo limiar_TA (ver params.yaml)."""
    r = rb.rodar(30.0, 0.0, rb.camadas_receita(p, 0.0), n_ions=20000, semente=7)
    x = np.arange(0.25, 300, 0.5)
    Fn = energia_nuclear(r, x, 0.0)
    Ec = p.valor("implantacao.amorfizacao.densidade_energia_critica")
    limiar_baixa_T = Ec / Fn.max()  # fração de energia atômica = 1, caso mais favorável
    faixa_A2 = p.no("implantacao.amorfizacao.dose_limiar_ions_massa_proxima_Si")["faixa"]
    assert limiar_baixa_T < faixa_A2["min"]


@pytest.mark.lento
def test_amorfo_a_1e16_para_toda_faixa_A2(p):
    r = rb.rodar(30.0, 0.0, rb.camadas_receita(p, 0.0), n_ions=20000, semente=7)
    x = np.arange(0.25, 300, 0.5)
    Fn = energia_nuclear(r, x, 0.0)
    inc = p.incerteza("implantacao.amorfizacao.limiar_TA.dose_limiar")
    for lim in (inc["min"], inc["max"]):
        am = camada_amorfa(x, Fn, 1.0e16, lim)
        assert am is not None and am[1] - am[0] > 30.0


@pytest.mark.lento
def test_receita_mascara_bloqueia_e_dose_conserva(p):
    perf = simular(p, variante="A_mascara", n_ions=20000, semente=3)
    assert perf.transmissao_mascara is not None and perf.transmissao_mascara < 1e-3
    total = perf.dose_si + perf.dose_oxido + perf.dose_refletida
    assert total == pytest.approx(p.valor("receita.implantacao.dose"), rel=1e-3)
    assert np.trapezoid(perf.C_cm3, perf.x_nm * 1e-7) == pytest.approx(perf.dose_si, rel=1e-2)
