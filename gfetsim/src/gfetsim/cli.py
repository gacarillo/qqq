"""Interface de linha de comando.

    gfetsim rodar exemplos/receita_padrao.yaml --saida resultados/
    gfetsim mapa-oxido --T 800 1000 --t 1 600
    gfetsim incerteza exemplos/receita_padrao.yaml -n 1000
    gfetsim calibrar dados/sputtering_calibracao.csv --modelo sputtering
    gfetsim params --provisorios
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np


def _rodar(a):
    from . import cadeia, figuras
    rec = cadeia.ler_receita(a.receita)
    r = cadeia.simular(rec)
    saida = Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)
    resumo = {
        "Rp_nm": r.implante.momentos.media, "dRp_nm": r.implante.momentos.desvio,
        "amorfo_nm": r.implante.amorfo_nm, "transmissao_mascara": r.implante.transmissao_mascara,
        "fracao_ativa_pos_recozimento": r.recozido.fracao_ativa, "Rs_pos_recozimento_ohm_sq": r.Rs_pos_recozimento,
        "espessura_oxido_nm": r.espessura_ox_nm, "tempo_oxidacao_min": r.t_ox_min, "Rs_final_ohm_sq": r.Rs_final,
        "provisorios_usados": r.provisorios,
    }
    for rho, el in r.eletrico.items():
        resumo[f"eletrico_rho_{rho}"] = {"V_D": el.V_D, "perda_si_max": float(np.max(el.perda_si)),
                                         "V_ruptura_faixa": el.V_ruptura, "notas": el.notas}
    (saida / "resumo.json").write_text(json.dumps(resumo, indent=2, ensure_ascii=False, default=float))
    figuras.figuras_cadeia(r, saida)
    print(json.dumps(resumo, indent=2, ensure_ascii=False, default=float))


def _mapa(a):
    from .oxidacao import cinetica
    from .params import carregar
    p = carregar(aceitar_provisorios=True)
    F_n = p.valor("oxidacao.oxidacao_acelerada_dopagem.nomura_fator_max_implantado")
    T = np.linspace(a.T[0], a.T[1], 9)
    print("tempo (min) para 19, 20 e 21 nm de óxido seco em Si(100), modelo de Massoud")
    for nome, F in (("sem aceleração (Si leve, N10)", 1.0), (f"F = {F_n} (R23)", F_n)):
        print(nome)
        for TT in T:
            ts = [cinetica.tempo_para(p, TT, x, F=F) for x in (19.0, 20.0, 21.0)]
            if a.t[0] <= ts[1] <= a.t[1]:
                print(f"  {TT:6.1f} C: {ts[1]:7.1f} min (19 nm em {ts[0]:.1f}, 21 nm em {ts[2]:.1f})")
    print("Ho e Plummer acoplado ao perfil de P exige a cadeia completa (gfetsim rodar).")


def _incerteza(a):
    from . import cadeia
    from .incerteza import montecarlo
    rec = cadeia.ler_receita(a.receita)
    res = montecarlo.rodar(rec, n=a.n, semente=a.semente, processos=a.processos)
    print(json.dumps(montecarlo.resumir(res), indent=2, ensure_ascii=False, default=float))


def _calibrar(a):
    from .calibracao import ajuste
    print(json.dumps(ajuste.calibrar_arquivo(a.csv, a.modelo), indent=2, ensure_ascii=False, default=float))


def _params(a):
    from .params import carregar
    p = carregar(aceitar_provisorios=True)
    def varrer(no, prefixo=""):
        if isinstance(no, dict):
            if "valor" in no and no.get("valor") is None and no.get("valor_provisorio") is not None:
                yield prefixo, no["valor_provisorio"], no.get("nota", "")
            for k, v in no.items():
                yield from varrer(v, f"{prefixo}.{k}" if prefixo else k)
    for k, v, nota in varrer(p.dados):
        print(f"[I] {k} = {v}   {nota}")


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gfetsim")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("rodar")
    r.add_argument("receita")
    r.add_argument("--saida", default="resultados")
    r.set_defaults(f=_rodar)
    m = sub.add_parser("mapa-oxido")
    m.add_argument("--T", nargs=2, type=float, default=[800.0, 1000.0])
    m.add_argument("--t", nargs=2, type=float, default=[1.0, 600.0])
    m.set_defaults(f=_mapa)
    i = sub.add_parser("incerteza")
    i.add_argument("receita")
    i.add_argument("-n", type=int, default=1000)
    i.add_argument("--semente", type=int, default=7)
    i.add_argument("--processos", type=int, default=None)
    i.set_defaults(f=_incerteza)
    c = sub.add_parser("calibrar")
    c.add_argument("csv")
    c.add_argument("--modelo", required=True, choices=["sputtering", "espessura_oxido", "transferencia", "resistencia_folha"])
    c.set_defaults(f=_calibrar)
    pp = sub.add_parser("params")
    pp.add_argument("--provisorios", action="store_true")
    pp.set_defaults(f=_params)
    a = ap.parse_args(argv)
    a.f(a)


if __name__ == "__main__":
    sys.exit(main())
