"""Verificação do solver 2D da borda.

* Sem variação lateral, o 2D tem de reproduzir o 1D do módulo 2, porque o passo lateral
  não faz nada. Tolerâncias de 1 % na dose, 3 % no perfil acima de 1e19 cm-3 e meio passo
  de grade (1 nm) na posição da frente em 1e18 cm-3. Na frente íngreme um erro relativo de
  concentração não mede nada útil, porque décimos de nm de deslocamento viram dezenas de %.
* A dose se conserva com borda (fronteiras refletoras).
* A cobertura lateral vale 1/2 na borda efetiva quando a média do deslocamento é zero.
"""
import numpy as np
import pytest

from gfetsim import carregar
from gfetsim.recozimento import borda2d, difusao


@pytest.fixture(scope="module")
def p():
    return carregar(aceitar_provisorios=True)


def _perfil(x):
    return 4e20 * np.exp(-0.5 * ((x - 40) / 18) ** 2) + 1e15


def test_sem_borda_igual_1d(p):
    x = np.arange(1.0, 300, 2.0)
    y = np.arange(-40.0, 41, 8.0)
    C1 = _perfil(x)
    C2 = np.repeat(C1[:, None], y.size, axis=1)
    r2 = borda2d.difundir_2d(p, x, y, C2, 900.0, 600.0, n_passos=20)
    r1 = difusao.difundir(p, x, C1, 900.0, 600.0)
    d1, d2 = np.trapezoid(r1, x), np.trapezoid(r2[:, 3], x)
    assert d2 == pytest.approx(d1, rel=0.01)
    alto = r1 > 1e19
    assert np.allclose(r2[alto, 3], r1[alto], rtol=0.03)
    frente = lambda c: np.interp(18.0, np.log10(c[::-1]), x[::-1])
    assert frente(r2[:, 3]) == pytest.approx(frente(r1), abs=1.0)


def test_dose_conservada_com_borda(p):
    x = np.arange(1.0, 300, 2.0)
    y = np.arange(-100.0, 101, 4.0)
    mu, sg = np.zeros_like(x), np.full_like(x, 12.0)
    C0, cob = borda2d.mapa_inicial(x, y, _perfil(x), mu, sg, 0.0)
    r = borda2d.difundir_2d(p, x, y, C0, 900.0, 900.0, n_passos=12)
    tot = lambda M: np.trapezoid(np.trapezoid(M, x, axis=0), y)
    assert tot(r) == pytest.approx(tot(C0), rel=0.01)
    j0 = np.argmin(np.abs(y))
    assert cob[:, j0] == pytest.approx(np.full_like(x, 0.5), abs=1e-9)
