"""Exporta, a partir do gfetsim, todos os dados que a animação usa.

    python animacao/exportar_dados.py

Gera animacao/dados_animacao.json. Nada na animação é inventado; cada curva, perfil e
trajetória sai dos módulos do pacote, com os mesmos parâmetros e ramos do relatório.
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path

import numpy as np

from gfetsim import carregar
from gfetsim.constantes import eps0, q
from gfetsim.eletrico import grafeno, oxido
from gfetsim.eletrico import modulo as eletrico
from gfetsim.eletrico.poisson import SiPorta
from gfetsim.implantacao import modulo as implantacao
from gfetsim.implantacao import rustbca as rb
from gfetsim.oxidacao import modulo as oxidacao
from gfetsim.recozimento import difusao, silicio
from gfetsim.recozimento.modulo import Etapa, aplicar, estado_inicial, receita_etapas, velocidade_spe

AQUI = Path(__file__).resolve().parent
GRADE = np.arange(0.0, 300.0 + 1e-9, 2.0)  # nm, grade comum dos perfis exportados


def r3(a, casas=3):
    return [float(f"{v:.{casas}g}") for v in np.asarray(a, dtype=float)]


def trajetorias(p, oxido_nm, n_ions, semente):
    """Roda o RustBCA com trajetórias de íons e recuos (um fio, ordem determinística)."""
    E = p.valor("receita.implantacao.energia")
    th = p.valor("receita.implantacao.inclinacao")
    toml = rb._toml("gfet_", E * 1000.0, th, rb.camadas_receita(p, oxido_nm, 600.0), n_ions, semente, 1, oxido_nm + 600.0)
    toml = (toml.replace("track_trajectories = false", "track_trajectories = true")
            .replace("track_recoils = false", "track_recoils = true")
            .replace("track_recoil_trajectories = false", "track_recoil_trajectories = true")
            .replace("num_chunks = 10", "num_chunks = 1"))
    d = Path(tempfile.mkdtemp(prefix="gfet_traj_"))
    (d / "e.toml").write_text(toml)
    subprocess.run([rb.binario(p), "1D", "e.toml"], cwd=d, check=True, capture_output=True)
    cnt = np.loadtxt(d / "gfet_trajectory_data.output", dtype=int)
    pts = np.loadtxt(d / "gfet_trajectories.output", delimiter=",")
    ions, atual, i = [], None, 0
    rng = np.random.default_rng(semente)
    for c in cnt:
        seg = pts[i:i + c]
        i += c
        if int(seg[0, 1]) == 15:
            atual = {"ion": [[round(s[3], 2), round(s[4], 2), round(s[2], 0)] for s in seg], "rec": [], "dano": []}
            ions.append(atual)
        elif atual is not None:
            # todo recuo deixa um sítio deslocado; só os energéticos viram trajetória visível
            atual["dano"].append([round(seg[0, 3], 1), round(seg[0, 4], 1)])
            if seg[0, 2] > 100.0 and c >= 2:
                atual["rec"].append([[round(s[3], 2), round(s[4], 2)] for s in seg[:: max(1, c // 12)]] +
                                    [[round(seg[-1, 3], 2), round(seg[-1, 4], 2)]])
    for io in ions:
        if len(io["dano"]) > 260:
            idx = rng.choice(len(io["dano"]), 260, replace=False)
            io["dano"] = [io["dano"][k] for k in sorted(idx)]
    return ions


def nuvem_final(p, n=4000, semente=9):
    """Posições finais (profundidade, lateral) de n íons, para a nuvem de dose."""
    E = p.valor("receita.implantacao.energia")
    th = p.valor("receita.implantacao.inclinacao")
    ox = p.valor("receita.implantacao.oxido_nativo")
    toml = rb._toml("gfet_", E * 1000.0, th, rb.camadas_receita(p, ox, 600.0), n, semente, 4, ox + 600.0)
    toml = toml.replace("num_threads = 1", "num_threads = 4")
    d = Path(tempfile.mkdtemp(prefix="gfet_nuvem_"))
    (d / "e.toml").write_text(toml)
    subprocess.run([rb.binario(p), "1D", "e.toml"], cwd=d, check=True, capture_output=True)
    dep = np.loadtxt(d / "gfet_deposited.output", delimiter=",", usecols=range(6))
    return [[round(a, 1), round(b, 1)] for a, b in dep[:, 2:4]]


def amostrar_perfil(x, y):
    return r3(np.interp(GRADE, x, y, right=0.0))


def recozimento_quadros(p, perf, variante, T_forno=None):
    """Quadros da SPE e da etapa quente, com o mesmo modelo do módulo 2."""
    quadros = []
    e = estado_inicial(perf)
    etapas = receita_etapas(p, variante, T_forno)
    spe, quente = etapas
    d0 = perf.amorfo_nm[1] if perf.amorfo_nm else 0.0
    v_nm_s = velocidade_spe(p, spe.T_C) * 1e7
    t_spe = d0 / v_nm_s
    for f in np.linspace(0, 1, 9):
        t = f * min(t_spe * 1.05, spe.t_s)
        frente = max(0.0, d0 - v_nm_s * t)
        quadros.append({"etapa": "SPE", "t_s": t, "T": spe.T_C, "frente_amorfa": frente,
                        "C": amostrar_perfil(e.x_nm, e.C),
                        # o recrescimento parte da interface a/c (fundo) para a superfície; o P recrescido fica ativo (R14)
                        "A": amostrar_perfil(e.x_nm, np.where((e.x_nm > frente) & (e.x_nm <= d0), e.C, 0.0))})
    e = aplicar(p, e, spe)
    quadros.append({"etapa": "SPE", "t_s": spe.t_s, "T": spe.T_C, "frente_amorfa": 0.0,
                    "C": amostrar_perfil(e.x_nm, e.C), "A": amostrar_perfil(e.x_nm, e.ativo)})
    ne = silicio.n_e(p, quente.T_C)
    n_q = 16
    dts = np.diff(np.concatenate([[0], quente.t_s * np.linspace(0, 1, n_q + 1)[1:] ** 2]))
    t = 0.0
    frac_ativa = e.ativo / np.maximum(e.C, 1e-30)
    for dt in dts:
        e.C = difusao.difundir(p, e.x_nm, e.C, quente.T_C, dt, n_passos=40)
        t += dt
        ativo = np.minimum(np.maximum(np.clip(frac_ativa, 0, 1) * e.C, np.minimum(e.C, ne)), ne)
        quadros.append({"etapa": quente.nome, "t_s": t, "T": quente.T_C, "frente_amorfa": 0.0,
                        "C": amostrar_perfil(e.x_nm, e.C), "A": amostrar_perfil(e.x_nm, ativo)})
    e.ativo = ativo
    e.historico.append("fim")
    return quadros, e, {"t_spe_s": t_spe, "v_spe_nm_s": v_nm_s, "n_e": ne, "C_sat": silicio.C_sat(p, quente.T_C),
                        "Rs": silicio.resistencia_folha(p, e.x_nm, e.ativo), "fracao_ativa": e.fracao_ativa}


def oxidacao_quadros(p, e, T, ramo):
    t20, res = oxidacao.tempo_para_alvo(p, e, T, 20.0, ramo, "acumulo_classico")
    quadros = []
    for f in np.linspace(0, 1, 15) ** 1.5:
        if f == 0:
            quadros.append({"t_min": 0.0, "x_ox": 0.0, "si": 0.0, "F": None,
                            "C": amostrar_perfil(e.x_nm, e.C), "A": amostrar_perfil(e.x_nm, e.ativo)})
            continue
        r = oxidacao.oxidar(p, e, T, f * t20, 0.0, ramo, "acumulo_classico", n_passos=max(20, int(80 * f)))
        quadros.append({"t_min": f * t20, "x_ox": r.espessura_nm, "si": r.si_consumido_nm,
                        "F": float(r.historia_F[-1]),
                        "C": amostrar_perfil(r.estado.x_nm, r.estado.C), "A": amostrar_perfil(r.estado.x_nm, r.estado.ativo)})
    curva = {"t": r3(res.historia_t), "x": r3(res.historia_x), "F": r3(np.concatenate([[res.historia_F[0]], res.historia_F]))}
    return t20, res, quadros, curva


def eletrico_dados(p, estado, esp_nm):
    """Curvas da pilha grafeno/SiO2/Si n+ em função de V_G - V_D."""
    x, ativo = estado.x_nm, estado.ativo
    si = SiPorta(p, x, ativo)
    pil = grafeno.pilha_de_params(p, esp_nm, si, Q_max=0.05)
    pil.V_D = 0.0
    metal = grafeno.Pilha(pil.C_ox, pil.vF, pil.n_estrela)
    V = np.linspace(-14, 14, 141)
    n = pil.densidade(V)
    C = pil.capacitancia(V)
    Cm = metal.capacitancia(V)
    phi = np.array([pil.phi_s(q * nn - pil.Q_f) - pil.phi_s(-pil.Q_f) for nn in n])
    mu = np.array([pil.mu(nn) for nn in n]) / q
    # perfis de potencial no Si para o diagrama de bandas
    Vb = np.linspace(-12, 12, 13)
    nb = pil.densidade(Vb)
    xs = si.x * 1e9
    sel = np.unique(np.searchsorted(xs, np.concatenate([np.linspace(0, 10, 41), np.linspace(10.5, 60, 40)])).clip(0, xs.size - 1))
    psis = [r3((si.resolver(q * nn, chute=si.psi0) - si.psi0)[sel], 4) for nn in nb]
    eta_sup = float(si.psi0[0] / si.Vt)  # (E_F - E_c)/kT na superfície, sem polarização
    return {"V": r3(V, 4), "n": r3(n / 1e4, 4), "C": r3(C / pil.C_ox, 5), "Cm": r3(Cm / pil.C_ox, 5),
            "phi": r3(phi, 4), "mu": r3(mu, 4), "Cox_F_cm2": pil.C_ox * 1e-4, "tox_nm": esp_nm,
            "banda": {"V": r3(Vb), "x_nm": r3(xs[sel], 3), "psi": psis}, "eta_sup": eta_sup,
            "ativo_sup": float(ativo[0])}


def main():
    p = carregar(aceitar_provisorios=True)
    D = {"fontes": "gfetsim (params.yaml), RustBCA a356280; ver docs/referencias.md"}
    print("trajetórias", flush=True)
    D["implante"] = {
        "janela": trajetorias(p, p.valor("receita.implantacao.oxido_nativo"), 48, 21),
        "mascara": trajetorias(p, p.no("receita.implantacao.variantes.A_mascara")["oxido_mascara_nm"], 16, 22),
        "nuvem": nuvem_final(p),
    }
    perf = implantacao.simular(p, variante="A_mascara", n_ions=100000)
    inc = p.incerteza("implantacao.amorfizacao.limiar_TA.dose_limiar")
    D["implante"].update({
        "x": r3(perf.x_nm), "C": r3(perf.C_cm3), "Fn": r3(perf.Fn_eV_cm), "dose": p.valor("receita.implantacao.dose"),
        "dose_limiar": [inc["min"], inc["max"]], "Rp": perf.momentos.media, "dRp": perf.momentos.desvio,
        "oxido_nativo": perf.oxido_nativo_nm, "mascara_nm": 150.0, "energia_keV": p.valor("receita.implantacao.energia"),
        "inclinacao": p.valor("receita.implantacao.inclinacao"), "transmissao": perf.transmissao_mascara,
        "amorfo": perf.amorfo_nm, "pearson": perf.tipo_pearson})
    D["grade_nm"] = r3(GRADE)
    D["recozimento"], D["oxidacao"], D["eletrico"] = {}, {}, {}
    variantes = {"A": ("A_rta", None), "B850": ("B_forno", 850.0), "B900": ("B_forno", 900.0)}
    for nome, (var, TB) in variantes.items():
        print("recozimento", nome, flush=True)
        quadros, e, info = recozimento_quadros(p, perf, var, TB)
        D["recozimento"][nome] = {"quadros": quadros, **info}
        for ramo in ("sem_aceleracao", "ho_plummer", "nomura"):
            for T in (850.0, 900.0, 950.0):
                chave = f"{nome}|{ramo}|{T:.0f}"
                print("oxidação", chave, flush=True)
                t20, res, qd, curva = oxidacao_quadros(p, e, T, ramo)
                D["oxidacao"][chave] = {"t20_min": t20, "quadros": qd, "curva": curva,
                                        "Rs_final": silicio.resistencia_folha(p, res.estado.x_nm, res.estado.ativo)}
                D["eletrico"][chave] = eletrico_dados(p, res.estado, res.espessura_nm)
    # região fora da porta: substrato tipo n sob 20 nm de óxido
    par = {}
    x = np.arange(0.5, 400, 1.0)
    for rho in (0.001, 0.01, 0.1, 1.0, 10.0):
        Ns = eletrico.dopagem_de_resistividade(p, rho)
        el = eletrico.simular(p, x, np.full_like(x, Ns), 20.0, None, 0.0, 0.0, V=np.linspace(-14, 14, 57))
        par[str(rho)] = {"N": Ns, "V": r3(el.V - el.V_D), "C": r3(el.C_F_cm2 / el.C_ox_F_cm2, 4)}
    D["parasita"] = par
    eps_ox = p.valor("eletrico.materiais.eps_r_SiO2") * eps0
    rup = oxido.faixa_ruptura(p)
    mrel = p.valor("eletrico.oxido.fowler_nordheim.massa_efetiva_rel")
    phiB = p.valor("eletrico.oxido.fowler_nordheim.barreira_Si_SiO2")
    f = p.no("eletrico.oxido.fowler_nordheim.corrente_medida_abaixo_teoria")["faixa"]
    D["constantes"] = {
        "q": q, "eps_ox": eps_ox, "vF": p.valor("eletrico.grafeno.vF"),
        "n_estrela": p.valor("eletrico.grafeno.n_residual.ju_lee"),
        "ruptura_MVcm": rup["adams_MVcm"], "FN": {"m_rel": mrel, "barreira_eV": phiB,
                                                  "reducao": float(np.sqrt(f["min"] * f["max"]))},
        "dopagem_residual": [1.4e12, 1.0e13], "mu_prior": [300.0, 7800.0], "mu_kim": 8600.0,
        "Rc_prior_ohm_um": [100.0, 5000.0], "hbar_Omega_eV": [0.015, 0.100], "rho0_cm2": [1e11, 3e11],
        "ilhas_multicamada": 0.17, "nD_defeitos": 2.2e10, "Eg_si": 1.12, "afinidade_si": 4.05,
    }
    saida = AQUI / "dados_animacao.json"
    saida.write_text(json.dumps(D, separators=(",", ":")))
    print(saida, f"{saida.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
