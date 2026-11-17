/** Ponto de entrada do gfetsim estúdio. */
import "./estilos/tema.css";
import { montarCasca, type FabricaVistas } from "./ui/casca";
import { abrirApresentacao } from "./ui/apresentacao";
import { vistaEstrutura } from "./ui/vistas/estrutura";
import { vistaPerfis } from "./ui/vistas/perfis";
import { vistaOxidacao } from "./ui/vistas/oxidacao";
import { vistaEletrico } from "./ui/vistas/eletrico";
import { vistaDispositivo } from "./ui/vistas/dispositivo";
import { vistaRelatorio } from "./ui/vistas/relatorio";
import { vistaParametros } from "./ui/vistas/parametros";
import { vistaIncerteza } from "./ui/vistas/incerteza";
import { vistaPrevisao } from "./ui/vistas/previsao";
import { vistaAtomos } from "./ui/vistas/atomos";

const fabricas: FabricaVistas = {
  estrutura: vistaEstrutura,
  perfis: vistaPerfis,
  oxidacao: vistaOxidacao,
  dispositivo: vistaDispositivo,
  eletrico: vistaEletrico,
  atomos: vistaAtomos,
  incerteza: vistaIncerteza,
  previsao: vistaPrevisao,
  parametros: vistaParametros,
  relatorio: vistaRelatorio,
};

montarCasca(document.getElementById("app")!, fabricas, abrirApresentacao);
