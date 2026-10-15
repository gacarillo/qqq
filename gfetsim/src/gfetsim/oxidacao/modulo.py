"""Módulo 3, oxidação de porta acoplada ao perfil de P.

A cada passo de tempo
1. calcula o fator de aceleração F a partir do P ativo na interface (ramo);
2. avança a espessura do óxido com a cinética escolhida;
3. consome 0,44 nm de Si por nm de óxido [B] e trata o P da fatia consumida
   conforme o ramo de interface;
4. difunde o P no Si (Fair-Tsai, módulo 2) e aplica a desativação de equilíbrio.

Ramos de aceleração
* ho_plummer        F de S2 com o P ativo na interface (razões de vacâncias [I])
* sem_aceleracao    F = 1, como N10 observa no início da oxidação seca de Si muito dopado
* nomura            F = 2,1 constante, o máximo de R23 [C]

Ramos de interface (params.yaml, oxidacao.ramos_interface)
* acumulo_classico         m >= 1000 (R17): o P da fatia consumida volta ao Si
* lado_oxido               uma camada de ~2e21 cm-3 (R32) com até 5 nm (N12) fica no
                           óxido; o resto volta ao Si [C]
* silicio_inativo          o P volta ao Si, mas o ativo nos primeiros 10 a 20 nm (R20)
                           cai para 60 % (N22) [C]
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from ..recozimento import difusao, silicio
from ..recozimento.modulo import EstadoDopante
from . import cinetica


@dataclass
class ResultadoOxidacao:
    T_C: float
    t_min: float
    espessura_nm: float
    si_consumido_nm: float
    estado: EstadoDopante
    dose_no_oxido: float
    historia_t: np.ndarray
    historia_x: np.ndarray
    historia_F: np.ndarray
    ramo_aceleracao: str
    ramo_interface: str
    notas: list[str] = field(default_factory=list)


def _deslocar(x, y, d):
    """Perfil visto de uma interface que avançou d nm para dentro do Si."""
    return np.interp(x + d, x, y, right=0.0)


def oxidar(params, estado: EstadoDopante, T_C: float, t_min: float, x0_nm: float = 0.0,
           ramo_aceleracao: str = "ho_plummer", ramo_interface: str = "acumulo_classico",
           modelo: str = "massoud", n_passos: int = 120, espessura_retrograda_nm: float = 15.0,
           largura_camada_oxido_nm: float = 3.0) -> ResultadoOxidacao:
    e = estado.copia()
    x = e.x_nm
    dx = x[1] - x[0]
    consumo = params.valor("receita.oxidacao_porta.consumo_si_por_oxido")
    r = "oxidacao.oxidacao_acelerada_dopagem."
    F_nomura = params.valor(r + "nomura_fator_max_implantado")
    cap_oxido = 0.0
    if ramo_interface == "lado_oxido":
        cap_oxido = params.valor("oxidacao.segregacao_P.camada_no_oxido") * largura_camada_oxido_nm * 1e-7
    no_oxido = 0.0
    ne = silicio.n_e(params, T_C)

    passos = 1.04 ** np.arange(n_passos)
    passos *= t_min / passos.sum()
    t, xox, consumido = 0.0, x0_nm, 0.0
    hist_t, hist_x, hist_F = [0.0], [x0_nm], []
    resto = 0.0
    for dt in passos:
        n_s = silicio.eletrons(np.array([min(e.ativo[0], ne)]), silicio.ni(params, T_C))[0]
        if ramo_aceleracao == "ho_plummer":
            F = cinetica.fator_ho_plummer(params, T_C, n_s)
        elif ramo_aceleracao == "sem_aceleracao":
            F = 1.0
        elif ramo_aceleracao == "nomura":
            F = F_nomura
        else:
            raise ValueError(ramo_aceleracao)
        # Runge-Kutta de 2a ordem na espessura
        k1 = cinetica.taxa(params, T_C, xox, t, modelo, F)
        k2 = cinetica.taxa(params, T_C, xox + 0.5 * dt * k1, t + 0.5 * dt, modelo, F)
        dxox = dt * k2
        xox += dxox
        t += dt
        d_si = consumo * dxox + resto
        n_celulas = int(d_si // dx)
        resto = d_si - n_celulas * dx
        if n_celulas > 0:
            d = n_celulas * dx
            P_consumido = np.trapezoid(e.C[: n_celulas + 1], x[: n_celulas + 1] * 1e-7)
            e.C = _deslocar(x, e.C, d)
            e.ativo = _deslocar(x, e.ativo, d)
            consumido += d
            vai_oxido = 0.0
            if ramo_interface == "lado_oxido":
                vai_oxido = min(P_consumido, max(cap_oxido - no_oxido, 0.0))
                no_oxido += vai_oxido
            devolve = P_consumido - vai_oxido  # m >= 1000 (R17): fração no óxido desprezível
            e.C[0] += devolve / (dx * 1e-7)
        e.C = difusao.difundir(params, x, e.C, T_C, dt * 60.0, n_passos=3)
        e.ativo = np.minimum(e.C, ne)
        hist_t.append(t)
        hist_x.append(xox)
        hist_F.append(F)
    if ramo_interface == "silicio_inativo":
        frac = params.valor("oxidacao.ramos_interface.lado_do_pileup.silicio_inativo.fracao_ativa")
        perto = x <= espessura_retrograda_nm  # 10 a 20 nm (R20)
        e.ativo[perto] *= frac
    e.historico.append(f"oxidação {T_C:.0f} C {t_min:.0f} min: {xox:.1f} nm de óxido, {consumido:.1f} nm de Si consumidos")
    return ResultadoOxidacao(T_C, t_min, xox, consumido, e, no_oxido, np.array(hist_t), np.array(hist_x),
                             np.array(hist_F), ramo_aceleracao, ramo_interface)


def tempo_para_alvo(params, estado, T_C, alvo_nm=None, ramo_aceleracao="ho_plummer",
                    ramo_interface="acumulo_classico", x0_nm=0.0, modelo="massoud", tol_nm=0.2):
    """Bissecção no tempo até a espessura alvo, com o acoplamento completo."""
    alvo = alvo_nm or params.valor("receita.oxidacao_porta.espessura_alvo")
    t_hi = cinetica.tempo_para(params, T_C, alvo, x0_nm, modelo, 1.0)
    t_lo = cinetica.tempo_para(params, T_C, alvo, x0_nm, modelo,
                               10.0 if ramo_aceleracao == "ho_plummer" else params.valor(
                                   "oxidacao.oxidacao_acelerada_dopagem.nomura_fator_max_implantado"))
    if ramo_aceleracao == "sem_aceleracao":
        return t_hi, oxidar(params, estado, T_C, t_hi, x0_nm, ramo_aceleracao, ramo_interface, modelo)
    res = None
    for _ in range(25):
        tm = 0.5 * (t_lo + t_hi)
        res = oxidar(params, estado, T_C, tm, x0_nm, ramo_aceleracao, ramo_interface, modelo, n_passos=80)
        if abs(res.espessura_nm - alvo) < tol_nm:
            break
        if res.espessura_nm > alvo:
            t_hi = tm
        else:
            t_lo = tm
    return tm, res
