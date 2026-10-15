"""Verificação do módulo 3 (oxidação).

Não há, nos resumos acessíveis, uma tabela de espessura contra tempo para
óxido seco fino em Si(100). Por isso este módulo NÃO tem validação
quantitativa contra dado medido. Os testes abaixo conferem
* a implementação numérica contra a solução analítica do modelo linear-parabólico;
* o comportamento que os resumos afirmam: crescimento mais rápido no regime fino (R26),
  aceleração por dopagem só no termo linear (R23), taxa igual à de Si leve no ramo
  sem aceleração (N10);
* a conservação da dose de P e o consumo de 0,44 nm de Si por nm de óxido.
A validação quantitativa virá das medidas do usuário (módulo 6).
"""
import numpy as np
import pytest

from gfetsim import carregar
from gfetsim.oxidacao import cinetica as c
from gfetsim.oxidacao.modulo import oxidar
from gfetsim.recozimento.modulo import EstadoDopante


@pytest.fixture(scope="module")
def p():
    return carregar(aceitar_provisorios=True)


@pytest.mark.parametrize("T", [800.0, 900.0, 1000.0])
def test_deal_grove_numerico_igual_ao_analitico(p, T):
    B, BA = c.deal_grove_100(p, T)
    A = B / BA
    t = np.array([5.0, 30.0, 120.0, 600.0])
    analitico = 0.5 * A * (np.sqrt(1 + 4 * B * t / A**2) - 1)
    assert c.espessura(p, T, t, modelo="deal_grove") == pytest.approx(analitico, rel=1e-5)


@pytest.mark.parametrize("T", [800.0, 850.0, 900.0, 950.0, 1000.0])
def test_regime_fino_mais_rapido_que_deal_grove(p, T):
    """R26: aceleração no regime fino; S1: Deal e Grove só vale acima de 30 nm."""
    assert c.tempo_para(p, T, 20.0) < c.tempo_para(p, T, 20.0, modelo="deal_grove")


def test_aceleracao_so_no_termo_linear(p):
    """R23: B (parabólico) não muda com a dopagem; para x grande F deixa de importar."""
    r1 = c.taxa(p, 950.0, 5000.0, 1e4, F=1.0)
    r3 = c.taxa(p, 950.0, 5000.0, 1e4, F=3.0)
    assert r3 / r1 == pytest.approx(1.0, abs=0.05)
    assert c.taxa(p, 950.0, 2.0, 1e4, F=3.0) > 2.0 * c.taxa(p, 950.0, 2.0, 1e4, F=1.0)


def _estado_degrau():
    x = np.arange(0.25, 400.0, 0.5)
    C = np.where(x < 60.0, 2e20, 1e15)
    return EstadoDopante(x, C, C.copy(), None)


def test_ramo_sem_aceleracao_igual_a_si_leve(p):
    """N10: no início da oxidação seca de Si muito dopado a taxa iguala a do Si leve."""
    r = oxidar(p, _estado_degrau(), 900.0, 30.0, ramo_aceleracao="sem_aceleracao")
    assert r.espessura_nm == pytest.approx(c.espessura(p, 900.0, 30.0), rel=1e-2)


@pytest.mark.parametrize("ramo", ["acumulo_classico", "silicio_inativo"])
def test_dose_conservada_e_si_consumido(p, ramo):
    e = _estado_degrau()
    r = oxidar(p, e, 900.0, 60.0, ramo_interface=ramo)
    assert r.estado.dose == pytest.approx(e.dose, rel=1e-2)
    consumo = p.valor("receita.oxidacao_porta.consumo_si_por_oxido")
    assert r.si_consumido_nm == pytest.approx(consumo * r.espessura_nm, abs=0.5)


def test_lado_oxido_retem_no_maximo_a_capacidade(p):
    r = oxidar(p, _estado_degrau(), 900.0, 60.0, ramo_interface="lado_oxido", largura_camada_oxido_nm=5.0)
    cap = p.valor("oxidacao.segregacao_P.camada_no_oxido") * 5.0e-7
    assert 0 < r.dose_no_oxido <= cap * (1 + 1e-9)
    assert r.estado.dose + r.dose_no_oxido == pytest.approx(_estado_degrau().dose, rel=1e-2)
