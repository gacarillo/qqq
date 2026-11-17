"""Gera as referências do gfetsim em Python para os testes do estúdio.

Cada caso roda a função original com entradas fixas e grava entradas e saídas em
tests/fixtures/*.json. Os testes Vitest rodam o porte em TypeScript com as mesmas
entradas e exigem concordância dentro de tolerâncias declaradas em cada teste.

    python3 scripts/exportar_referencias.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from scipy.integrate import solve_ivp

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
sys.path.insert(0, str(RAIZ / "src"))

from gfetsim.constantes import q  # noqa: E402
from gfetsim.eletrico import grafeno, histerese, oxido  # noqa: E402
from gfetsim.eletrico import modulo as eletrico  # noqa: E402
from gfetsim.eletrico.poisson import F12, SiPorta  # noqa: E402
from gfetsim.implantacao import modulo as implantacao  # noqa: E402
from gfetsim.implantacao.pearson import Momentos, densidade_pearson  # noqa: E402
from gfetsim.oxidacao import cinetica  # noqa: E402
from gfetsim.oxidacao import modulo as oxidacao  # noqa: E402
from gfetsim.params import carregar  # noqa: E402
from gfetsim.recozimento import borda2d, difusao, silicio  # noqa: E402
from gfetsim.recozimento import modulo as recozimento  # noqa: E402
from gfetsim.recozimento.modulo import EstadoDopante, Etapa  # noqa: E402

DESTINO = AQUI.parent / "tests" / "fixtures"
P = carregar(aceitar_provisorios=True)


def lista(a):
    return [float(v) for v in np.asarray(a).ravel()]


def gravar(nome, dados):
    DESTINO.mkdir(parents=True, exist_ok=True)
    (DESTINO / f"{nome}.json").write_text(json.dumps(dados, separators=(",", ":")))
    print("ok", nome)


def perfil_teste():
    """Perfil de implante fixo, independente do RustBCA: Pearson com momentos de 30 keV."""
    mo = Momentos(40.1, 18.4, 0.45, 3.2)
    x = np.arange(0.25, 300.0, 0.5)
    f, tipo = densidade_pearson(x, mo)
    return x, 3.0e15 * 0.99 * f * 1e7, mo


def numerico():
    eta = [-50, -40, -10, -2, -0.5, 0, 0.5, 2, 5, 10, 30, 80, 119]
    xs = np.linspace(0, 3, 12) ** 1.3
    ys = np.sin(xs) * np.exp(-0.2 * xs)
    from scipy.interpolate import interp1d
    s = interp1d(xs, ys, kind="cubic", fill_value="extrapolate")
    xq = np.linspace(-0.2, 4.4, 37)
    from scipy.ndimage import distance_transform_edt
    rng = np.random.default_rng(3)
    m = rng.random((9, 13)) > 0.35
    dt = distance_transform_edt(m, sampling=(2.0, 4.0))
    gravar("numerico", {"eta": eta, "F12": lista(F12(np.array(eta, float))),
                        "spline": {"x": lista(xs), "y": lista(ys), "xq": lista(xq), "yq": lista(s(xq))},
                        "edt": {"mascara": [int(v) for v in m.ravel()], "nx": 9, "ny": 13, "dx": 2.0, "dy": 4.0, "d": lista(dt)}})


def pearson():
    casos = []
    x = np.arange(0.25, 300.0, 0.5)
    for mo in [Momentos(40.1, 18.4, 0.45, 3.2), Momentos(80.0, 30.0, -0.2, 3.0), Momentos(12.0, 7.0, 0.9, 2.5), Momentos(40.0, 18.0, 0.3, 2.2)]:
        f, tipo = densidade_pearson(x, mo)
        casos.append({"momentos": [mo.media, mo.desvio, mo.assimetria, mo.curtose], "tipo": tipo, "f": lista(f[::4])})
    gravar("pearson", {"x": lista(x[::4]), "passo": 4, "casos": casos})


def silicio_casos():
    T = [550.0, 850.0, 900.0, 1050.0]
    N = [1e14, 1e16, 1e18, 1e19, 1e20, 5e20, 1e21]
    x, C, _ = perfil_teste()
    gravar("silicio", {"T": T, "ni": [silicio.ni(P, t) for t in T], "n_e": [silicio.n_e(P, t) for t in T],
                       "C_sat": [silicio.C_sat(P, t) for t in T], "N": N, "masetti": lista(silicio.mobilidade_masetti(P, np.array(N))),
                       "qin": lista(silicio.mobilidade(P, np.array(N), "limite_inferior_qin")),
                       "Rs": silicio.resistencia_folha(P, x, np.minimum(C, 3e20)), "rho": [0.001, 0.1, 10.0],
                       "dopagem_rho": [eletrico.dopagem_de_resistividade(P, r) for r in (0.001, 0.1, 10.0)]})


def difusao_casos():
    x = np.arange(0.0, 600.0, 0.5)
    C0 = 2e20 * np.exp(-0.5 * ((x - 40) / 18) ** 2) + 1e15
    a = difusao.difundir(P, x, C0, 1050.0, 10.0)
    b = difusao.difundir(P, x, C0, 900.0, 1800.0)
    c = difusao.passo_temporal(P, x, C0, 1000.0, 5.0)
    gravar("difusao", {"x": lista(x[::4]), "passo": 4, "C0": lista(C0), "rta": lista(a[::4]), "forno": lista(b[::4]), "passo1": lista(c[::4]),
                       "D_FT": lista(difusao.difusividade_ft(P, 1000.0, np.array([0.0, 1.0, 10.0, 100.0])))})


def recozimento_casos():
    x, C, _ = perfil_teste()
    saida = {}
    for nome, etapas, ramo in [("A", recozimento.receita_etapas(P, "A_rta"), "equilibrio"),
                               ("A_meta", recozimento.receita_etapas(P, "A_rta"), "metaestavel"),
                               ("B900", recozimento.receita_etapas(P, "B_forno", 900.0), "equilibrio")]:
        e = recozimento.estado_inicial(type("P", (), {"x_nm": x, "C_cm3": C, "amorfo_nm": (0.25, 35.25)})())
        for et in etapas:
            e = recozimento.aplicar(P, e, et, ramo)
        saida[nome] = {"C": lista(e.C[::4]), "ativo": lista(e.ativo[::4]), "fracao": e.fracao_ativa,
                       "Rs": silicio.resistencia_folha(P, e.x_nm, e.ativo)}
    gravar("recozimento", {"x": lista(x), "C": lista(C), "amorfo": [0.25, 35.25], "passo": 4, "casos": saida,
                           "v_spe": recozimento.velocidade_spe(P, 550.0)})


def cinetica_casos():
    out = {}
    for T in (850.0, 900.0, 950.0):
        m = cinetica.massoud_100(P, T)
        t = [0.5, 2.0, 10.0, 30.0, 120.0]
        out[str(int(T))] = {"massoud": m, "dg": list(cinetica.deal_grove_100(P, T)), "t": t,
                            "x": lista(cinetica.espessura(P, T, t)), "x_F2": lista(cinetica.espessura(P, T, t, F=2.1)),
                            # mesma EDO com tolerância apertada: o LSODA padrão erra até 7e-6 relativo no início
                            "x_preciso": lista(solve_ivp(lambda tt, x: [cinetica.taxa(P, T, x[0], tt)], (0, max(t)), [0.0], t_eval=t,
                                                         rtol=1e-12, atol=1e-12, method="LSODA").y[0]),
                            "t20": cinetica.tempo_para(P, T, 20.0), "t20_dg": cinetica.tempo_para(P, T, 20.0, modelo="deal_grove"),
                            "F_hp": [cinetica.fator_ho_plummer(P, T, n) for n in (1e17, 1e19, 1e20, 3e20)]}
    gravar("cinetica", out)


def oxidacao_casos():
    x, C, _ = perfil_teste()
    e = recozimento.estado_inicial(type("P", (), {"x_nm": x, "C_cm3": C, "amorfo_nm": (0.25, 35.25)})())
    for et in recozimento.receita_etapas(P, "A_rta"):
        e = recozimento.aplicar(P, e, et)
    saida = {"x": lista(e.x_nm), "C": lista(e.C), "ativo": lista(e.ativo), "casos": {}}
    for ramo in ("ho_plummer", "sem_aceleracao", "nomura"):
        for ri in ("acumulo_classico", "lado_oxido", "silicio_inativo"):
            if ramo != "ho_plummer" and ri != "acumulo_classico":
                continue
            r = oxidacao.oxidar(P, e, 900.0, 12.0, 0.0, ramo, ri)
            saida["casos"][f"{ramo}|{ri}"] = {"xox": r.espessura_nm, "si": r.si_consumido_nm, "C": lista(r.estado.C[::4]),
                                              "ativo": lista(r.estado.ativo[::4]), "F": lista(r.historia_F[::10]), "no_oxido": r.dose_no_oxido}
    t, r = oxidacao.tempo_para_alvo(P, e, 900.0, 20.0, "ho_plummer")
    saida["alvo"] = {"t": t, "xox": r.espessura_nm}
    saida["passo"] = 4
    gravar("oxidacao", saida)


def eletrico_casos():
    x, C, _ = perfil_teste()
    ativo = np.minimum(C, 3.4e20)
    si = SiPorta(P, x, ativo)
    Qs = [-0.03, -0.01, -0.002, 0.0, 0.002, 0.01, 0.03]
    curv = [si.curvatura(Qv) for Qv in Qs]
    mus, ns = grafeno.tabela_n_mu(1.1e6, grafeno.sigma_de_n_estrela(3.58e15, 1.1e6))
    pil = grafeno.pilha_de_params(P, 20.0, si)
    V = [-6.0, -2.0, -0.5, 0.0, 0.5, 2.0, 6.0]
    n = pil.densidade(np.array(V))
    Cv = pil.capacitancia(np.array(V))
    I = [grafeno.corrente_jimenez(pil, vg, 0.5, 0.16, 10e-6, 10e-6, 0.055, 1e15, 101) for vg in (-3.0, 0.0, 3.0)]
    el = eletrico.simular(P, x, ativo, 20.0, 10.0, -3e12, 1e11, 3.58e11, 1600.0)
    E = [3e8, 6e8, 1e9, 1.3e9]
    Vh = np.linspace(-5, 5, 41)
    gravar("eletrico", {
        "x": lista(x), "ativo": lista(ativo), "psi0_0": float(si.psi0[0]), "psi_eq_0": float(si.psi_eq[0]), "Q": Qs, "curvatura": curv,
        "tab_mu": lista(mus[::50]), "tab_n": lista(ns[::50]), "V": V, "n": lista(n), "C": lista(Cv), "C_ox": pil.C_ox,
        "jimenez": I, "fn_E": E, "fn_J": lista(oxido.corrente_fn(P, np.array(E))),
        "sim": {"V_D": el.V_D, "V": lista(el.V), "n": lista(el.n_cm2), "C": lista(el.C_F_cm2), "Cm": lista(el.C_sem_si_F_cm2),
                "E": lista(el.E_ox_MVcm), "Rsq": lista(el.R_quadrado_ohm), "Vr": list(el.V_ruptura)},
        "histerese": {"V": lista(Vh), "taxa": 0.2, "alfa": 0.15, "tau": 20.0, "VD": lista(histerese.varrer(Vh, 0.2, 0.15, 20.0)[1]),
                      "largura": histerese.largura(Vh, 0.2, 0.15, 20.0)},
    })


def borda_casos():
    xg = np.arange(1.0, 101.0, 2.0)
    yg = np.arange(-60.0, 100.0, 4.0)
    x, C, _ = perfil_teste()
    px = np.interp(xg, x, C, right=0.0)
    mu = 4.0 + 0.02 * xg
    sg = 12.0 + 0.05 * xg
    C0, cob = borda2d.mapa_inicial(xg, yg, px, mu, sg, 18.4)
    Fn = np.exp(-0.5 * ((xg - 25) / 15) ** 2) * 1e8
    am = borda2d.amorfo_2d(Fn, cob, 3e15, 2e15)
    Cd = borda2d.difundir_2d(P, xg, yg, C0, 1000.0, 30.0, n_passos=8)
    q = borda2d.recozer_2d(P, xg, yg, C0, am, recozimento.receita_etapas(P, "A_rta"), n_quadros_quente=3)
    lx = np.arange(2.0, 90.0, 4.0)
    m_, s_ = borda2d.lateral_por_profundidade(np.repeat(lx, 400), np.random.default_rng(1).normal(np.repeat(3 + 0.05 * lx, 400), np.repeat(10 + 0.1 * lx, 400)), lx, n_min=100)
    gravar("borda2d", {"x": lista(xg), "y": lista(yg), "px": lista(px), "mu": lista(mu), "sg": lista(sg), "C0": lista(C0), "Fn": lista(Fn),
                       "amorfo": [int(v) for v in am.ravel()], "Cd": lista(Cd), "final_C": lista(q[-1]["C"]), "final_A": lista(q[-1]["A"]),
                       "n_quadros": len(q), "spe_meio_amorfo": int(q[4]["amorfo"].sum())})


def implante_casos():
    out = {}
    for E, th, ox, sem in ((30.0, 7.0, 1.5, 1), (42.0, 7.0, 1.5, 5)):
        r = implantacao.simular(P, energia_keV=E, inclinacao=th, oxido_nativo_nm=ox, n_ions=20000 if E != 30.0 else 100000, semente=sem)
        # mesmo critério de camada amorfa com a energia nuclear suavizada em 3,5 nm: o histograma de
        # 0,5 nm tem ruído de cerca de 5 % e o máximo bruto às vezes cai num pico de ruído
        Fs = np.convolve(r.Fn_eV_cm, np.ones(7) / 7, mode="same")
        am_s = implantacao.camada_amorfa(r.x_nm, Fs, 3e15, r.dose_limiar)
        out[f"{E}"] = {"amorfo_suavizado": list(am_s) if am_s else None, "Fn_max_bruto": float(r.Fn_eV_cm.max()), "Fn_max_suavizado": float(Fs.max()),
                       "momentos": [r.momentos.media, r.momentos.desvio, r.momentos.assimetria, r.momentos.curtose],
                       "dose_si": r.dose_si, "amorfo": list(r.amorfo_nm) if r.amorfo_nm else None, "pico": r.pico_cm3,
                       "x": lista(r.x_nm[::8]), "C": lista(r.C_cm3[::8]), "n_ions": 20000 if E != 30.0 else 100000}
    gravar("implante", out)


if __name__ == "__main__":
    numerico()
    pearson()
    silicio_casos()
    difusao_casos()
    recozimento_casos()
    cinetica_casos()
    oxidacao_casos()
    eletrico_casos()
    borda_casos()
    implante_casos()
