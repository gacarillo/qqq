"""Figuras usadas pela CLI, pelo notebook e pelo relatório."""
from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams.update({"figure.dpi": 130, "font.size": 9, "axes.grid": True, "grid.alpha": 0.3})


def _salvar(fig, caminho):
    caminho = Path(caminho)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(caminho, dpi=200)
    plt.close(fig)
    return caminho


def implantacao(perf, caminho):
    fig, ax = plt.subplots(1, 2, figsize=(7.2, 3.0))
    ax[0].semilogy(perf.hist_x_nm, np.maximum(perf.hist_C_cm3, 1e15), ".", ms=2, color="0.5", label="RustBCA")
    ax[0].semilogy(perf.x_nm, perf.C_cm3, "k-", label=f"Pearson {perf.tipo_pearson}")
    if perf.amorfo_nm:
        ax[0].axvspan(*perf.amorfo_nm, color="tab:orange", alpha=0.2, label="amorfo (limiar A2 central)")
    ax[0].set(xlim=(0, 150), ylim=(1e16, 2e21), xlabel="profundidade no Si (nm)", ylabel="P (cm$^{-3}$)")
    ax[0].legend(fontsize=7)
    ax[1].plot(perf.x_nm, perf.Fn_eV_cm * 3e15 / 1e24, "k-")
    ax[1].set(xlim=(0, 150), xlabel="profundidade no Si (nm)", ylabel="energia nuclear a 3e15 (1e24 eV/cm$^3$)")
    ax[1].axhline(0.6, ls="--", color="tab:red", lw=1)
    ax[1].text(80, 0.75, "6e23 (A4, baixa T)", color="tab:red", fontsize=7)
    return _salvar(fig, caminho)


def recozimento(estados: dict, caminho):
    fig, ax = plt.subplots(figsize=(4.2, 3.0))
    for (nome, e), cor in zip(estados.items(), ["k", "tab:blue", "tab:green", "tab:red"]):
        ax.semilogy(e.x_nm, np.maximum(e.C, 1e15), "-", color=cor, lw=1, label=f"{nome} total")
        ax.semilogy(e.x_nm, np.maximum(e.ativo, 1e15), "--", color=cor, lw=1)
    ax.set(xlim=(0, 300), ylim=(1e16, 1e21), xlabel="profundidade (nm)", ylabel="P (cm$^{-3}$); tracejado = ativo")
    ax.legend(fontsize=7)
    return _salvar(fig, caminho)


def mapa_oxido(T, t, mapas: dict, t20_acoplado: dict, caminho):
    fig, ax = plt.subplots(figsize=(4.6, 3.4))
    estilos = {"Massoud, F = 1": ("k", "-"), "Massoud, F = 2,1 (R23)": ("tab:blue", "--"),
               "Deal e Grove, F = 1": ("0.5", ":")}
    for nome, m in mapas.items():
        cor, ls = estilos.get(nome, ("tab:gray", "-"))
        cs = ax.contour(t, T, m, levels=[20.0], colors=cor, linestyles=ls)
        ax.plot([], [], color=cor, ls=ls, label=nome)
    for nome, (TT, tt) in t20_acoplado.items():
        ax.plot(tt, TT, "o-", ms=3, label=nome)
    ax.set_xscale("log")
    ax.set(xlabel="tempo (min)", ylabel="temperatura (C)", title="combinações que dão 20 nm de SiO$_2$ seco")
    ax.legend(fontsize=6.5)
    return _salvar(fig, caminho)


def cv(curvas: dict, caminho, anterior=None):
    fig, ax = plt.subplots(figsize=(4.4, 3.2))
    for nome, (V, C) in curvas.items():
        ax.plot(V, C, label=nome)
    ax.set(xlabel="$V_G - V_D$ (V)", ylabel="$C/C_{ox}$")
    if anterior:
        for N, perda in anterior.items():
            ax.axhline(1 - perda, ls=":", lw=0.8, color="0.4")
            ax.text(ax.get_xlim()[0] + 0.2, 1 - perda + 0.003, f"anterior {N:g}", fontsize=6)
    ax.legend(fontsize=7)
    return _salvar(fig, caminho)


def histogramas(resultados: dict, chave: str, caminho, rotulo=None, log=False):
    fig, ax = plt.subplots(figsize=(4.4, 3.0))
    for nome, r in resultados.items():
        v = r["saidas"][chave]
        if log:
            v = np.log10(v)
        ax.hist(v, bins=40, histtype="step", label=nome, density=True)
    ax.set(xlabel=rotulo or chave, ylabel="densidade")
    ax.legend(fontsize=6)
    return _salvar(fig, caminho)


def sobol(res: dict, caminho, titulo=""):
    fig, ax = plt.subplots(figsize=(4.8, 3.0))
    idx = np.arange(len(res["nomes"]))
    ax.bar(idx - 0.2, res["S1"], 0.4, yerr=res["S1_ic"], label="S1")
    ax.bar(idx + 0.2, res["ST"], 0.4, yerr=res["ST_ic"], label="ST")
    ax.set_xticks(idx, res["nomes"], rotation=60, ha="right", fontsize=7)
    ax.set(ylabel="índice de Sobol", title=titulo)
    ax.legend(fontsize=7)
    return _salvar(fig, caminho)


def sputtering(pots, taxas, reta, caminho):
    fig, ax = plt.subplots(figsize=(4.0, 3.0))
    ax.plot(pots, taxas, "ko")
    x = np.linspace(20, 110, 100)
    y, lo, hi = reta.prever(x)
    _, plo, phi = reta.prever(x, "previsao")
    ax.plot(x, y, "k-")
    ax.fill_between(x, lo, hi, alpha=0.3, label="IC 95 %")
    ax.fill_between(x, plo, phi, alpha=0.15, label="IP 95 %")
    ax.set(xlabel="potência RF (W)", ylabel="taxa (nm/min)")
    ax.legend(fontsize=7)
    return _salvar(fig, caminho)


def figuras_cadeia(r, saida):
    saida = Path(saida)
    implantacao(r.implante, saida / "implantacao.png")
    recozimento({"recozido": r.recozido} | ({"oxidado": r.oxidado.estado} if r.oxidado else {}), saida / "recozimento.png")
    curvas = {f"rho = {k}": (el.V - el.V_D, el.C_F_cm2 / el.C_ox_F_cm2) for k, el in r.eletrico.items()}
    cv(curvas, saida / "cv.png")


def intervalos(resultados: dict, chaves: list[tuple[str, str]], caminho):
    """Mediana e intervalo de 95 % de cada saída por combinação de ramos."""
    nomes = list(resultados)
    fig, axs = plt.subplots(1, len(chaves), figsize=(2.6 * len(chaves) + 1.6, 0.32 * len(nomes) + 1.2), sharey=True)
    for ax, (k, rot) in zip(np.atleast_1d(axs), chaves):
        for i, n in enumerate(nomes):
            v = resultados[n]["saidas"][k]
            lo, me, hi = np.percentile(v, [2.5, 50, 97.5])
            ax.plot([lo, hi], [i, i], "-", color="tab:blue", lw=2)
            ax.plot(me, i, "ko", ms=3)
        ax.set_xlabel(rot)
    np.atleast_1d(axs)[0].set_yticks(range(len(nomes)), [n.replace("|", " ") for n in nomes], fontsize=7)
    return _salvar(fig, caminho)
