"""Módulo 6, calibração com medidas do usuário (CSV).

Formatos (colunas mínimas; sigma é o desvio padrão de cada medida)
* sputtering          potencia_W, espessura_nm, tempo_min        (ART, tabela 1)
* espessura_oxido     T_C, t_min, espessura_nm, sigma_nm[, dopado]
* resistencia_folha   variante, T_forno_C, Rs_ohm_sq, sigma_ohm_sq
* transferencia       V_G, R_ohm, sigma_ohm   (Vds pequeno; espessura do óxido no cabeçalho #espessura_nm=)

Ajuste por mínimos quadrados ponderados (scipy.optimize.least_squares). A incerteza
dos parâmetros vem da matriz de covariância (J^T W J)^-1 escalada pelo qui-quadrado
reduzido quando ele passa de 1. Com emcee instalado, posterior_emcee amostra a
posterior com priores uniformes nos limites dados.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from scipy import stats
from scipy.optimize import least_squares


# ---------------------------------------------------------------- regressão linear
@dataclass
class Reta:
    inclinacao: float
    intercepto: float
    ic_inclinacao: tuple[float, float]
    r2: float
    p_inclinacao: float
    p_intercepto: float
    s: float
    n: int
    x_media: float
    Sxx: float
    t_crit: float

    def prever(self, x0, intervalo="confianca"):
        """Valor previsto e intervalo de 95 % (confiança da média ou previsão de uma nova medida)."""
        y = self.intercepto + self.inclinacao * x0
        extra = 1.0 if intervalo == "previsao" else 0.0
        meia = self.t_crit * self.s * np.sqrt(extra + 1.0 / self.n + (x0 - self.x_media) ** 2 / self.Sxx)
        return y, y - meia, y + meia


def regressao_linear(x, y, nivel=0.95) -> Reta:
    x, y = np.asarray(x, float), np.asarray(y, float)
    n = x.size
    xm, ym = x.mean(), y.mean()
    Sxx = np.sum((x - xm) ** 2)
    b = np.sum((x - xm) * (y - ym)) / Sxx
    a = ym - b * xm
    res = y - a - b * x
    s = np.sqrt(np.sum(res**2) / (n - 2))
    se_b = s / np.sqrt(Sxx)
    se_a = s * np.sqrt(1.0 / n + xm**2 / Sxx)
    t = stats.t.ppf(0.5 + nivel / 2, n - 2)
    r2 = 1 - np.sum(res**2) / np.sum((y - ym) ** 2)
    p_b = 2 * stats.t.sf(abs(b / se_b), n - 2)
    p_a = 2 * stats.t.sf(abs(a / se_a), n - 2)
    return Reta(b, a, (b - t * se_b, b + t * se_b), r2, p_b, p_a, s, n, xm, Sxx, t)


def tempo_para_espessura(reta: Reta, potencia_W, alvo_nm=20.0):
    """Tempo (min) e intervalos, invertendo a taxa e seus limites (ART, seção 2.3)."""
    out = {}
    for nome in ("confianca", "previsao"):
        r, lo, hi = reta.prever(potencia_W, nome)
        out[nome] = (alvo_nm / hi, alvo_nm / lo)
        out["tempo"] = alvo_nm / r
    return out


# ---------------------------------------------------------------- leitura de CSV
def ler_csv(caminho) -> tuple[dict[str, np.ndarray], dict[str, str]]:
    meta, linhas = {}, []
    with open(caminho, encoding="utf-8") as f:
        for linha in f:
            if linha.startswith("#"):
                if "=" in linha:
                    k, v = linha[1:].strip().split("=", 1)
                    meta[k.strip()] = v.strip()
                continue
            linhas.append(linha)
    leitor = csv.DictReader(linhas)
    dados = {k: [] for k in leitor.fieldnames}
    for row in leitor:
        for k in dados:
            dados[k].append(row[k])
    conv = {}
    for k, v in dados.items():
        try:
            conv[k] = np.array([float(t) for t in v])
        except ValueError:
            conv[k] = np.array(v)
    return conv, meta


# ---------------------------------------------------------------- ajuste genérico
@dataclass
class Ajuste:
    nomes: list[str]
    valores: np.ndarray
    erros: np.ndarray
    chi2_reduzido: float
    covariancia: np.ndarray
    residuos: np.ndarray
    notas: list[str] = field(default_factory=list)

    def como_dict(self):
        return {n: {"valor": float(v), "erro": float(e)} for n, v, e in zip(self.nomes, self.valores, self.erros)} | {
            "chi2_reduzido": self.chi2_reduzido, "notas": self.notas}


def mqp(modelo, x, y, sigma, chute, limites, nomes) -> Ajuste:
    """Mínimos quadrados ponderados com escala log nos parâmetros positivos de várias décadas."""
    def r(theta):
        return (modelo(x, *theta) - y) / sigma
    sol = least_squares(r, chute, bounds=limites, x_scale="jac", method="trf")
    J = sol.jac
    dof = max(1, y.size - len(chute))
    chi2 = float(np.sum(sol.fun**2) / dof)
    cov = np.linalg.pinv(J.T @ J) * max(1.0, chi2)
    return Ajuste(nomes, sol.x, np.sqrt(np.diag(cov)), chi2, cov, sol.fun)


def posterior_emcee(modelo, x, y, sigma, limites, chute, n_passos=3000, n_caminhantes=32, semente=5):
    import emcee
    lo, hi = np.asarray(limites[0], float), np.asarray(limites[1], float)

    def logp(theta):
        if np.any(theta < lo) or np.any(theta > hi):
            return -np.inf
        return -0.5 * np.sum(((modelo(x, *theta) - y) / sigma) ** 2)

    rng = np.random.default_rng(semente)
    p0 = np.asarray(chute) * (1 + 1e-3 * rng.standard_normal((n_caminhantes, len(chute))))
    s = emcee.EnsembleSampler(n_caminhantes, len(chute), logp)
    s.run_mcmc(p0, n_passos, progress=False)
    return s.get_chain(discard=n_passos // 3, thin=10, flat=True)


# ---------------------------------------------------------------- modelos de calibração
def calibrar_sputtering(dados) -> dict:
    taxa = dados["espessura_nm"] / dados["tempo_min"]
    # média das leituras válidas por potência, como em ART
    pots = np.unique(dados["potencia_W"])
    medias = np.array([taxa[dados["potencia_W"] == pw].mean() for pw in pots])
    reta = regressao_linear(pots, medias)
    out = {"inclinacao": reta.inclinacao, "ic95": reta.ic_inclinacao, "r2": reta.r2, "p": reta.p_inclinacao,
           "intercepto": reta.intercepto, "p_intercepto": reta.p_intercepto}
    for pw in (30.0, 40.0, 50.0):
        t = tempo_para_espessura(reta, pw)
        out[f"tempo_20nm_{pw:.0f}W"] = {"tempo": t["tempo"], "ic95": t["confianca"], "ip95": t["previsao"]}
    return out


def modelo_transferencia(params, espessura_nm, si_porta=None):
    """R(V_G) = 2 Rc_tot + (L/W) / (q mu sqrt(n0^2 + n^2)), com n(V_G - V_D) da eletrostática (R34)."""
    from ..eletrico import grafeno
    from ..constantes import q
    pil = grafeno.pilha_de_params(params, espessura_nm, si_porta)

    def f(V, V_D, log_mu, log_n0, Rc, L_sobre_W):
        pil.V_D = V_D
        n = pil.densidade(V)
        return Rc + L_sobre_W / (q * 10**log_mu * 1e-4 * np.sqrt((10**log_n0 * 1e4) ** 2 + n**2))
    return f


def calibrar_transferencia(params, dados, meta) -> dict:
    esp = float(meta.get("espessura_nm", 20.0))
    LW = float(meta.get("L_sobre_W", 1.0))
    f = modelo_transferencia(params, esp)
    g = lambda V, V_D, lmu, ln0, Rc: f(V, V_D, lmu, ln0, Rc, LW)
    V, R, s = dados["V_G"], dados["R_ohm"], dados["sigma_ohm"]
    chute = [float(V[np.argmax(R)]), 3.0, 11.5, float(R.min()) * 0.3]
    lim = ([V.min() - 5, 1.5, 10.0, 0.0], [V.max() + 5, 5.0, 13.0, float(R.max())])
    aj = mqp(g, V, R, s, chute, lim, ["V_D", "log10_mu", "log10_n0", "R_contato_total"])
    return aj.como_dict()


def calibrar_espessura_oxido(params, dados) -> dict:
    """Ajusta um fator multiplicativo F em B/A (Massoud) para as medidas; um F por grupo dopado/não dopado."""
    from ..oxidacao import cinetica
    out = {}
    grupos = dados.get("dopado", np.zeros_like(dados["T_C"]))
    for gval in np.unique(grupos):
        m = grupos == gval
        T, t, x, s = dados["T_C"][m], dados["t_min"][m], dados["espessura_nm"][m], dados["sigma_nm"][m]
        mod = lambda _, F: np.array([cinetica.espessura(params, Ti, ti, F=F) for Ti, ti in zip(T, t)])
        aj = mqp(mod, None, x, s, [1.5], ([0.2], [20.0]), ["F_BA"])
        out[f"dopado={gval}"] = aj.como_dict()
    return out


def calibrar_arquivo(caminho, modelo: str) -> dict:
    from ..params import carregar
    dados, meta = ler_csv(caminho)
    p = carregar(aceitar_provisorios=True)
    if modelo == "sputtering":
        return calibrar_sputtering(dados)
    if modelo == "transferencia":
        return calibrar_transferencia(p, dados, meta)
    if modelo == "espessura_oxido":
        return calibrar_espessura_oxido(p, dados)
    if modelo == "resistencia_folha":
        raise NotImplementedError("ajuste de Rs aguarda medidas; ver dados/medidas_resistencia_folha.csv")
    raise ValueError(modelo)
