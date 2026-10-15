"""Validação do módulo 4 (elétrico).

* Poisson contra a solução analítica de Boltzmann em Si uniforme não degenerado
  (verificação numérica, tolerância de 2 %).
* Aproximação de depleção contra o cálculo anterior do usuário [B]: 17 %, 6 % e 3,5 %
  de perda com 1,1 V de curvatura (tolerância de meio ponto percentual).
* Cq mínimo finito no ponto de Dirac (R39) e Cq igual a k|Vc| longe dele (R42).
* Limite de baixa tensão de dreno do modelo de Jiménez (R42) igual ao de Kim (R34).
"""
import numpy as np
import pytest

from gfetsim import carregar
from gfetsim.constantes import eps0, hbar, k_B, q
from gfetsim.eletrico import grafeno as g
from gfetsim.eletrico.poisson import SiPorta, capacitancia_deplecao


@pytest.fixture(scope="module")
def p():
    return carregar(aceitar_provisorios=True)


def test_poisson_igual_boltzmann_analitico(p):
    N = 1e16
    x = np.arange(0.25, 3000, 0.5)
    s = SiPorta(p, x, np.full_like(x, N), profundidade_nm=3000.0)
    eps = p.valor("eletrico.materiais.eps_r_Si") * eps0
    Vt = k_B * 300 / q
    LD_fator = np.sqrt(2 * eps * q * N * 1e6 * Vt)
    for phi_alvo in (-0.3, -0.1, 0.05, 0.1):
        # carga analítica para curvatura phi (majoritários, Boltzmann)
        u = phi_alvo / Vt
        Q = -np.sign(u) * LD_fator * np.sqrt(np.exp(u) - u - 1)
        assert s.curvatura(Q) == pytest.approx(phi_alvo, rel=0.02)


@pytest.mark.parametrize("N, perda", [(1e19, 0.17), (1e20, 0.06), (3e20, 0.035)])
def test_deplecao_reproduz_calculo_anterior(p, N, perda):
    Cox = p.valor("eletrico.materiais.eps_r_SiO2") * eps0 / 20e-9
    Cd = capacitancia_deplecao(p, N, p.valor("eletrico.calculo_anterior_usuario.curvatura_bandas"))
    assert Cox / (Cox + Cd) == pytest.approx(perda, abs=0.005)


def test_cq_minimo_finito_e_limite_classico(p):
    vF = p.valor("eletrico.grafeno.vF")
    ne = p.valor("eletrico.grafeno.n_residual.ju_lee") * 1e4
    mus, ns = g.tabela_n_mu(vF, g.sigma_de_n_estrela(ne, vF))
    Cq = q * np.gradient(ns, mus) * q
    assert Cq[len(Cq) // 2] > 0.1 * Cq.max() / 10
    k = 2 * q**3 / (np.pi * (hbar * vF) ** 2)
    i = np.argmin(abs(mus / q - 0.6))
    assert Cq[i] == pytest.approx(k * 0.6, rel=0.05)


def test_jimenez_baixa_tensao_igual_kim(p):
    """Com Vds pequeno a integral de R42 vira q mu W (|n| + rho0) / L. Kim (R34) soma n0 em
    quadratura, Jiménez soma rho0 linearmente; com rho0 << n as duas formas coincidem."""
    pil = g.Pilha(3.9 * eps0 / 20e-9, p.valor("eletrico.grafeno.vF"), 1e15)
    V_GS, mu, L, W = 3.0, 0.2, 10e-6, 10e-6
    Vds = 1e-4
    n = pil.densidade(V_GS)[0]
    for rho0, rel in ((1e15, 1e-3), (1e13, 1e-3)):
        I = g.corrente_jimenez(pil, V_GS, Vds, mu, L, W, 0.055, rho0)
        assert Vds / I == pytest.approx(L / (q * mu * W * (abs(n) + rho0)), rel=rel)
    I = g.corrente_jimenez(pil, V_GS, Vds, mu, L, W, 0.055, 1e13)
    assert Vds / I == pytest.approx(g.resistencia_kim(n, mu, 1e13, L / W), rel=1e-3)


def test_histerese_some_com_varredura_rapida():
    """R47: em SiO2 a histerese some quando a varredura é rápida frente à relaxação."""
    from gfetsim.eletrico.histerese import largura
    V = np.linspace(-5, 5, 201)
    lento = largura(V, taxa_V_s=0.01, alfa=0.2, tau_s=30.0)
    rapido = largura(V, taxa_V_s=1e4, alfa=0.2, tau_s=30.0)
    assert abs(rapido) < 1e-3 and abs(lento) > 0.1
