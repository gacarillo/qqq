"""Física 2D na borda da janela da máscara (corte perpendicular à borda).

Mapa inicial
    C(x, y) = dose . p(x) . P(dy <= y - y_s | x)
com p(x) o Pearson do módulo 1, a distribuição lateral condicional dy | x ajustada às
posições finais do RustBCA (gaussiana com média e desvio por profundidade [C]) e y_s a
borda efetiva da janela. Com o feixe inclinado em direção à janela, a parede de 150 nm
da máscara faz sombra até y_s = 150 tan(7°) = 18 nm [C]; com o plano de inclinação
paralelo à borda, y_s = 0. A rotação (twist) da receita não foi informada, por isso os
dois ramos existem.

Recozimento
* camada amorfa onde Fn(x) dose cobertura(y) >= Fn_max dose_limiar (ramo limiar_TA);
* SPE com a frente andando à velocidade do módulo 2 a partir do cristal mais próximo
  (transformada de distância), o que inclui o recrescimento lateral na borda [C];
* difusão de Fair e Tsai por separação de operadores de Strang, com o passo implícito
  1D do módulo 2 aplicado em cada coluna e em cada linha;
* ativação e desativação com as mesmas regras do módulo 2.
"""
from __future__ import annotations

import numpy as np
from scipy.ndimage import distance_transform_edt
from scipy.special import erf

from . import difusao, silicio
from .modulo import velocidade_spe


def lateral_por_profundidade(x_dep, y_dep, grade_x, n_min=300):
    """Média e desvio do deslocamento lateral por faixa de profundidade, suavizados."""
    bordas = np.concatenate([grade_x - 0.5 * (grade_x[1] - grade_x[0]), [grade_x[-1] + 0.5 * (grade_x[1] - grade_x[0])]])
    idx = np.digitize(x_dep, bordas) - 1
    mu, sg, xs = [], [], []
    for i in range(grade_x.size):
        sel = idx == i
        if sel.sum() >= n_min:
            mu.append(np.mean(y_dep[sel])); sg.append(np.std(y_dep[sel])); xs.append(grade_x[i])
    xs, mu, sg = map(np.asarray, (xs, mu, sg))
    pm = np.polyfit(xs, mu, 2)
    ps = np.polyfit(xs, sg, 2)
    m = np.polyval(pm, np.clip(grade_x, xs.min(), xs.max()))
    s = np.maximum(np.polyval(ps, np.clip(grade_x, xs.min(), xs.max())), 1.0)
    return m, s


def mapa_inicial(x, y, perfil_x, mu_y, sg_y, y_s):
    """Dose por área já embutida em perfil_x (cm^-3 em função de x)."""
    Y = y[None, :] - y_s - mu_y[:, None]
    cobertura = 0.5 * (1 + erf(Y / (np.sqrt(2) * sg_y[:, None])))
    return perfil_x[:, None] * cobertura, cobertura


def difundir_2d(params, x, y, C, T_C, t_s, n_passos=40):
    if t_s <= 0:
        return C.copy()
    dts = 1.04 ** np.arange(n_passos)
    dts *= t_s / dts.sum()
    C = C.copy()
    for dt in dts:
        for j in range(C.shape[1]):
            C[:, j] = difusao.passo_temporal(params, x, C[:, j], T_C, 0.5 * dt)
        for i in range(C.shape[0]):
            if C[i].max() > 1e14:
                C[i, :] = difusao.passo_temporal(params, y, C[i, :], T_C, dt)
        for j in range(C.shape[1]):
            C[:, j] = difusao.passo_temporal(params, x, C[:, j], T_C, 0.5 * dt)
    return C


def amorfo_2d(Fn_x, cobertura, dose, dose_limiar):
    return Fn_x[:, None] * cobertura * dose >= Fn_x.max() * dose_limiar


def recozer_2d(params, x, y, C0, amorfo, etapas, n_quadros_quente=8, ramo_desativacao="equilibrio"):
    """Devolve quadros (t, C, ativo, amorfo) da SPE e da etapa quente."""
    dx, dy = x[1] - x[0], y[1] - y[0]
    quadros = []
    spe, quente = etapas
    v = velocidade_spe(params, spe.T_C) * 1e7  # nm/s
    # distância de cada ponto amorfo ao cristal mais próximo (a superfície não conta como semente)
    dist = distance_transform_edt(amorfo, sampling=(dx, dy))
    t_spe = float(dist.max() / v) if amorfo.any() else 0.0
    C = C0.copy()
    ativo = np.zeros_like(C)
    for f in np.linspace(0, 1, 9):
        t = f * min(1.05 * t_spe, spe.t_s)
        ainda = amorfo & (dist > v * t)
        recrescido = amorfo & ~ainda
        quadros.append({"etapa": "SPE", "t_s": t, "T": spe.T_C, "C": C.copy(), "A": np.where(recrescido, C, 0.0),
                        "amorfo": ainda.copy()})
    ativo = np.where(amorfo, C, 0.0)
    quadros.append({"etapa": "SPE", "t_s": spe.t_s, "T": spe.T_C, "C": C.copy(), "A": ativo.copy(),
                    "amorfo": np.zeros_like(amorfo)})
    ne = silicio.n_e(params, quente.T_C)
    frac = np.where(C > 0, ativo / np.maximum(C, 1e-30), 0.0)
    tempos = quente.t_s * np.linspace(0, 1, n_quadros_quente + 1)[1:] ** 2
    t_ant = 0.0
    for t in tempos:
        C = difundir_2d(params, x, y, C, quente.T_C, t - t_ant, n_passos=12)
        t_ant = t
        a = np.maximum(np.clip(frac, 0, 1) * C, np.minimum(C, ne))
        if ramo_desativacao == "equilibrio" or not quente.rapida:
            a = np.minimum(a, ne)
        quadros.append({"etapa": quente.nome, "t_s": t, "T": quente.T_C, "C": C.copy(), "A": a.copy(),
                        "amorfo": np.zeros_like(amorfo)})
    return quadros
