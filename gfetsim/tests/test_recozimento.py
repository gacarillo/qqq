"""Validação do módulo 2 (recozimento).

Dados publicados usados, com a tolerância declarada antes de rodar
* R13 (Yu et al.) 550 C 30 min + 1050 C 10 s ativa 75 a 100 % de P a 50 e 100 keV.
  A dose não está no resumo; usamos 3e15 [I], a da receita. Tolerância é a faixa publicada.
* R13, só 1050 C 10 s, ativa 40 a 60 %.
* R19 (Li e Han) P 55 keV 3e15, máximo de 67 % a 850 C. Tempo não está no resumo; 30 min [I].
  Tolerância de 0,15 absoluta (fator de Hall e tempo desconhecidos).
* R14 (Wu et al.) ativação máxima já a 550 C: a SPE tem de terminar em 30 min.

Os dois testes de recozimento em uma etapa falham e estão marcados como xfail
estrito. O modelo não tem a física que explica a ativação menor sem a etapa de
550 C (aglomerados P-defeito de R12, cuja cinética está em R12b, não lida).
A receita do usuário sempre passa pela etapa de 550 C, caso em que o modelo valida.
"""
import pytest

from gfetsim import carregar
from gfetsim.implantacao.modulo import simular as implantar
from gfetsim.recozimento.modulo import Etapa, aplicar, estado_inicial, simular

pytestmark = pytest.mark.lento


@pytest.fixture(scope="module")
def p():
    return carregar(aceitar_provisorios=True)


@pytest.fixture(scope="module")
def perfil50(p):
    return implantar(p, energia_keV=50.0, dose=3.0e15, n_ions=20000, semente=21)


@pytest.fixture(scope="module")
def perfil55(p):
    return implantar(p, energia_keV=55.0, dose=3.0e15, n_ions=20000, semente=22)


@pytest.mark.parametrize("ramo", ["equilibrio", "metaestavel"])
def test_yu_dois_passos(p, perfil50, ramo):
    e = simular(p, perfil50, "A_rta", ramo_desativacao=ramo)
    faixa = p.no("recozimento.ativacao_dados_validacao.yu_dois_passos")["faixa"]
    assert faixa["min"] <= e.fracao_ativa <= faixa["max"] + 1e-9


def test_spe_completa_a_550C_em_30_min(p):
    perf = implantar(p, n_ions=20000, semente=3)
    e = aplicar(p, estado_inicial(perf), Etapa("SPE", 550.0, 1800.0))
    assert e.amorfo_nm is None


@pytest.mark.xfail(strict=True, reason="sem a física dos aglomerados P-defeito (R12, R12b) o modelo ativa tudo em uma etapa")
def test_yu_um_passo(p, perfil50):
    e = aplicar(p, estado_inicial(perfil50), Etapa("RTA", 1050.0, 10.0, rapida=True))
    faixa = p.no("recozimento.ativacao_dados_validacao.yu_um_passo")["faixa"]
    assert faixa["min"] <= e.fracao_ativa <= faixa["max"]


@pytest.mark.xfail(strict=True, reason="mesma lacuna; Li e Han recozem em uma etapa")
def test_li_han_850C(p, perfil55):
    e = aplicar(p, estado_inicial(perfil55), Etapa("forno", 850.0, 1800.0))
    alvo = p.valor("recozimento.ativacao_dados_validacao.li_han_850C")
    assert e.fracao_ativa == pytest.approx(alvo, abs=0.15)
