"""Índices de Sobol (SALib, esquema de Saltelli) para a cadeia ou para funções de teste."""
from __future__ import annotations

import numpy as np


def problema(nomes: list[str], limites: list[tuple[float, float]], dists: list[str] | None = None) -> dict:
    return {"num_vars": len(nomes), "names": nomes, "bounds": [list(b) for b in limites],
            "dists": dists or ["unif"] * len(nomes)}


def indices(funcao, prob: dict, N: int = 1024, semente: int = 3, calc_segunda_ordem: bool = False):
    from SALib.analyze import sobol as an
    from SALib.sample import sobol as sa
    X = sa.sample(prob, N, calc_second_order=calc_segunda_ordem, seed=semente)
    Y = np.array([funcao(x) for x in X])
    Si = an.analyze(prob, Y, calc_second_order=calc_segunda_ordem, seed=semente)
    return {"S1": Si["S1"], "S1_ic": Si["S1_conf"], "ST": Si["ST"], "ST_ic": Si["ST_conf"], "nomes": prob["names"]}
