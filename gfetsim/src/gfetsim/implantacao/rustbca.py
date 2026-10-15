"""Embrulho do RustBCA em geometria 1D.

Gera o arquivo TOML, roda o binário e lê as posições finais dos íons e a perda
de energia nuclear por colisão. O eixo x é a profundidade, com origem na
superfície da pilha de camadas.

O RustBCA é um código de colisões binárias com alvo amorfo. Ele não descreve
canalização, que fica a cargo de outro ramo (ver modulo.py).
"""
from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np

MASSA_P = 30.973762  # u, massa do 31P (IUPAC), usada só como entrada do BCA
Z_P = 15


@dataclass
class Camada:
    nome: str
    espessura_nm: float
    densidades_um3: dict[str, float]  # elemento -> átomos por µm³


@dataclass
class ResultadoBCA:
    x_nm: np.ndarray            # profundidade final dos íons parados (a partir da superfície da pilha)
    refletidos: int
    n_ions: int
    perda_nuclear_x_nm: np.ndarray
    perda_nuclear_eV: np.ndarray
    perda_eletronica_eV: np.ndarray
    toml: str

    @property
    def fracao_retida(self) -> float:
        return self.x_nm.size / self.n_ions


ELEMENTOS = {
    # Z, massa (u), Eb, Es, Ec  (exemplos do próprio RustBCA)
    "Si": (14, 28.08553, 0.0, 4.72, 1.5),
    "O": (8, 15.9994, 0.0, 2.58, 2.0),
}


def binario(params=None) -> str:
    cand = os.environ.get("GFETSIM_RUSTBCA")
    if not cand and params is not None:
        cand = params.valor("implantacao.rustbca.binario")
    if not cand:
        cand = shutil.which("RustBCA") or "/opt/ext/RustBCA/target/release/RustBCA"
    if not Path(cand).exists():
        raise FileNotFoundError(
            f"binário do RustBCA não encontrado em {cand}. Compile github.com/lcpp-org/RustBCA "
            "com cargo build --release e aponte GFETSIM_RUSTBCA para ele."
        )
    return cand


def _toml(nome: str, energia_eV: float, angulo_graus: float, camadas: list[Camada], n_ions: int,
          semente: int, fios: int, x_max_nm: float) -> str:
    elems = list(ELEMENTOS)
    th = np.deg2rad(angulo_graus)
    direcao = [float(np.cos(th)), float(np.sin(th)), 0.0]
    dens = [[c.densidades_um3.get(e, 0.0) for e in elems] for c in camadas]
    esp_um = [c.espessura_nm / 1000.0 for c in camadas]
    fmt = lambda v: "[" + ", ".join(repr(float(x)) for x in v) + "]"
    linhas = f"""[options]
name = "{nome}"
track_trajectories = false
track_recoils = false
track_recoil_trajectories = false
write_buffer_size = 8000
weak_collision_order = 3
suppress_deep_recoils = false
high_energy_free_flight_paths = false
electronic_stopping_mode = "LOW_ENERGY_NONLOCAL"
mean_free_path_model = "LIQUID"
interaction_potential = [["KR_C"]]
scattering_integral = [["MENDENHALL_WELLER"]]
root_finder = [[{{"NEWTON"={{max_iterations=100, tolerance=1E-6}}}}]]
num_threads = {fios}
num_chunks = 10
track_displacements = false
track_energy_losses = true
energy_min = 0.0
energy_max = {energia_eV}
energy_num = 10
angle_min = 0.0
angle_max = 90.0
angle_num = 10
x_min = 0.0
y_min = -0.1
z_min = -0.1
x_max = {x_max_nm / 1000.0}
y_max = 0.1
z_max = 0.1
x_num = 200
y_num = 2
z_num = 2
seed = {semente}

[particle_parameters]
length_unit = "NM"
energy_unit = "EV"
mass_unit = "AMU"
N = [{n_ions}]
m = [{MASSA_P}]
Z = [{Z_P}]
E = [{energia_eV}]
Ec = [1.0]
Es = [0.0]
interaction_index = [0]
pos = [[-0.0001, 0.0, 0.0]]
dir = [{fmt(direcao)}]

[geometry_input]
length_unit = "MICRON"
densities = [{", ".join(fmt(d) for d in dens)}]
layer_thicknesses = {fmt(esp_um)}
electronic_stopping_correction_factors = {fmt([1.0] * len(camadas))}

[material_parameters]
energy_unit = "EV"
mass_unit = "AMU"
Eb = {fmt([ELEMENTOS[e][2] for e in elems])}
Es = {fmt([ELEMENTOS[e][3] for e in elems])}
Ec = {fmt([ELEMENTOS[e][4] for e in elems])}
Z = {fmt([ELEMENTOS[e][0] for e in elems])}
m = {fmt([ELEMENTOS[e][1] for e in elems])}
interaction_index = {[0] * len(elems)}
surface_binding_model = {{"PLANAR"={{calculation="TARGET"}}}}
bulk_binding_model = "AVERAGE"
"""
    return linhas


def rodar(energia_keV: float, angulo_graus: float, camadas: list[Camada], n_ions: int = 100_000,
          semente: int = 1, fios: int | None = None, params=None, pasta: str | None = None) -> ResultadoBCA:
    """Roda o RustBCA para P incidente na pilha de camadas."""
    fios = fios or max(1, (os.cpu_count() or 2))
    total_nm = sum(c.espessura_nm for c in camadas)
    toml = _toml("gfet_", energia_keV * 1000.0, angulo_graus, camadas, n_ions, semente, 1, total_nm)
    chave = hashlib.sha1(toml.encode()).hexdigest()[:16]
    cache = _pasta_cache() / f"bca_{chave}.npz"
    if cache.exists():
        d = np.load(cache)
        return ResultadoBCA(d["x"].astype(float), int(d["refl"]), n_ions, d["px"], d["pn"], d["pe"], toml)
    toml_exec = toml.replace("num_threads = 1", f"num_threads = {fios}").replace("num_chunks = 10", f"num_chunks = {max(10, 4 * fios)}")
    trabalho = Path(pasta or tempfile.mkdtemp(prefix="gfetsim_bca_"))
    trabalho.mkdir(parents=True, exist_ok=True)
    (trabalho / "entrada.toml").write_text(toml_exec)
    proc = subprocess.run([binario(params), "1D", "entrada.toml"], cwd=trabalho,
                          capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"RustBCA falhou\n{proc.stderr[-2000:]}")
    dep = _ler(trabalho / "gfet_deposited.output", 6)
    refl = _ler(trabalho / "gfet_reflected.output", 10)
    perdas = _ler(trabalho / "gfet_energy_loss.output", 7)
    x = dep[:, 2] if dep.size else np.empty(0)
    res = ResultadoBCA(
        x_nm=x,
        refletidos=int(refl.shape[0]) if refl.size else 0,
        n_ions=n_ions,
        perda_nuclear_x_nm=perdas[:, 4] if perdas.size else np.empty(0),
        perda_nuclear_eV=perdas[:, 2] if perdas.size else np.empty(0),
        perda_eletronica_eV=perdas[:, 3] if perdas.size else np.empty(0),
        toml=toml,
    )
    if pasta is None:
        shutil.rmtree(trabalho, ignore_errors=True)
    # guarda as perdas agregadas em fatias de 0,25 nm para o cache ficar pequeno
    bordas = np.arange(0.0, total_nm + 0.25, 0.25)
    pn, _ = np.histogram(res.perda_nuclear_x_nm, bins=bordas, weights=res.perda_nuclear_eV)
    pe, _ = np.histogram(res.perda_nuclear_x_nm, bins=bordas, weights=res.perda_eletronica_eV)
    centros = 0.5 * (bordas[1:] + bordas[:-1])
    np.savez_compressed(cache, x=res.x_nm.astype(np.float32), refl=res.refletidos, px=centros, pn=pn, pe=pe)
    res.perda_nuclear_x_nm, res.perda_nuclear_eV, res.perda_eletronica_eV = centros, pn, pe
    return res


def _pasta_cache() -> Path:
    p = Path(os.environ.get("GFETSIM_CACHE", Path(__file__).resolve().parents[3] / "dados" / "cache_bca"))
    p.mkdir(parents=True, exist_ok=True)
    return p


def _ler(caminho: Path, ncol: int) -> np.ndarray:
    if not caminho.exists() or caminho.stat().st_size == 0:
        return np.empty((0, ncol))
    a = np.loadtxt(caminho, delimiter=",", ndmin=2, usecols=range(ncol))
    return a


def camadas_receita(params, oxido_nm: float, profundidade_si_nm: float = 1000.0) -> list[Camada]:
    """Pilha SiO2 (máscara ou óxido nativo) sobre Si, com densidades do params.yaml."""
    si = params.no("implantacao.rustbca.Si")["densidade_at_cm3"] * 1e-12  # cm^-3 -> µm^-3
    ox = params.no("implantacao.rustbca.SiO2")
    camadas = []
    if oxido_nm > 0:
        camadas.append(Camada("SiO2", oxido_nm, {"Si": ox["densidade_Si_cm3"] * 1e-12,
                                                 "O": ox["densidade_O_cm3"] * 1e-12}))
    camadas.append(Camada("Si", profundidade_si_nm, {"Si": si}))
    return camadas
