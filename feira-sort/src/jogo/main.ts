import './estilo.css';
import dados from '../dados/fases.json';
import { ESTREIA_FRUTAS, ESTREIA_OCULTOS, ESTREIA_TRANCA } from '../dados/estreias';
import { jogadasValidas, type DefinicaoFase, type Estado, type MotivoInvalido, type ResultadoMovimento } from '../logica/regras';
import { problemaDeEstado, resolver } from '../logica/resolvedor';
import { FIGURINHAS, PAGINAS, situacao, type Pagina } from './album';
import { ECONOMIA } from './economia';
import { Efeitos } from './efeitos';
import { FRUTAS, fruta } from './frutas';
import { carregarArtes, urlArte } from './imagens';
import { Interface, cartaFigurinha, h, type Botao } from './interface';
import { Partida, type OuvintePartida } from './partida';
import { apagar, carregar, estatistica, migrar, progressoNovo, salvar, type Progresso } from './progresso';
import { podeMostrarIntersticial, podeOferecerRecompensado } from './servicos/anuncios';
import { DestinoLocal, Metricas } from './servicos/metricas';
import { Som } from './som';
import { Tabuleiro } from './tabuleiro';

const FASES = dados.fases as DefinicaoFase[];
const TOTAL = FASES.length;
/** Jogada que a mãozinha mostra nas três primeiras fases. */
const MAO_TUTORIAL: Record<number, [number, number]> = { 1: [1, 0], 2: [0, 1], 3: [0, 2] };
const DICA_PARADO_MS = 9000;

const esperar = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

class Jogo implements OuvintePartida {
  private progresso: Progresso;
  private partida: Partida | null = null;
  private fase = 1;
  private emFluxo = false;
  private maoTutorial: [number, number] | null = null;
  private temporizadorDica = 0;
  private readonly ui = new Interface();
  private readonly som = new Som();
  private readonly metricas = new Metricas();
  private readonly registro = new DestinoLocal();
  private readonly efeitos = new Efeitos($<HTMLCanvasElement>('efeitos'));
  private readonly tabuleiro: Tabuleiro;

  constructor(salvo?: unknown) {
    this.progresso = salvo ? migrar(salvo) : carregar();
    this.metricas.adicionarDestino(this.registro);
    this.aplicarConfig();
    this.tabuleiro = new Tabuleiro($<HTMLCanvasElement>('tela'), $('area-tabuleiro'), {
      aoTocar: (i) => this.tocar(i),
      aoPousar: (ordem) => this.som.soltar(ordem),
      aoCompletar: (caixa) => this.caixaCompletou(caixa),
      aoRevelar: () => this.som.revelar(),
      aoDestrancar: (caixa) => {
        this.som.destrancar();
        const t = this.tabuleiro.topo(caixa);
        this.efeitos.brilho(t.x, t.y, '#f2b630');
      },
    });
    this.ligarBotoes();
  }

  instantaneo(): unknown {
    return this.progresso;
  }

  /** Ganchos para os testes automáticos no navegador (só com #teste ou #dev no endereço). */
  ganchosDeTeste(): unknown {
    return {
      centro: (i: number) => this.tabuleiro.centro(i),
      fase: () => this.fase,
      solucao: () => FASES[this.fase - 1]?.solucao ?? [],
      ocupado: () => this.tabuleiro.ocupado() || this.emFluxo,
      modal: () => this.ui.modalAberto,
      progresso: () => this.progresso,
      jogadas: () => (this.partida ? jogadasValidas(this.partida.estado) : []),
      irPara: (n: number) => {
        this.progresso.fase = Math.max(this.progresso.fase, n);
        this.progresso.pecas = Math.max(this.progresso.pecas, n - 1);
        this.ui.figurinha(this.progresso.pecas);
        this.comecarFase(n);
      },
    };
  }

  async iniciar(): Promise<void> {
    await carregarArtes();
    this.metricas.registrar('sessao_inicio', { fase: this.progresso.fase });
    this.ui.moedas(this.progresso.moedas);
    this.ui.figurinha(this.progresso.pecas);
    this.comecarFase(Math.min(this.progresso.fase, TOTAL + 1));
  }

  // ---------------------------------------------------------------- fases

  private comecarFase(n: number): void {
    this.ui.esconderMao();
    this.ui.esconderAviso();
    if (n > TOTAL) {
      void this.fimDoLote();
      return;
    }
    this.fase = n;
    const def = FASES[n - 1];
    this.partida = new Partida(def, this);
    this.tabuleiro.carregar(this.partida.estado);
    this.ui.fase(n);
    this.atualizarAjudas();
    const est = estatistica(this.progresso, n);
    est.tentativas++;
    salvar(this.progresso);
    this.metricas.registrar('fase_inicio', { fase: n, tentativa: est.tentativas });
    this.avisarNovidades(def);
    this.maoTutorial = MAO_TUTORIAL[n] ?? null;
    if (this.maoTutorial) setTimeout(() => this.mostrarMao(), 650);
    this.reiniciarDica();
  }

  private avisarNovidades(def: DefinicaoFase): void {
    const vistos = this.progresso.vistos;
    const marcar = (chave: string) => {
      vistos.push(chave);
      salvar(this.progresso);
    };
    if (def.id === ESTREIA_OCULTOS && !vistos.includes('ocultos')) {
      marcar('ocultos');
      this.ui.aviso('Saquinho surpresa: a fruta só aparece quando chega ao topo da caixa.', urlArte('saquinho'), 5500);
      return;
    }
    if (def.id === ESTREIA_TRANCA && !vistos.includes('tranca')) {
      marcar('tranca');
      this.ui.aviso('Caixa trancada: ela abre quando a fruta do cadeado tiver uma caixa completa.', urlArte('cadeado'), 6000);
      return;
    }
    for (const [letra, estreia] of Object.entries(ESTREIA_FRUTAS)) {
      if (estreia === def.id && estreia > 1 && !vistos.includes(`fruta:${letra}`)) {
        marcar(`fruta:${letra}`);
        const f = FRUTAS.find((x) => x.letra === letra)!;
        this.ui.aviso(`Fruta nova na feira: ${f.nome.toLowerCase()}!`, urlArte(letra), 3200);
      }
    }
  }

  private atualizarAjudas(): void {
    const p = this.partida;
    if (!p) return;
    this.ui.ajudas({
      desfazer: p.desfazerRestante,
      podeDesfazer: p.podeDesfazer,
      caixa: p.tutorial ? 'oculta' : p.caixaExtraUsada ? 'usada' : 'oferta',
      reiniciar: p.jogadas > 0 && !p.terminada,
    });
  }

  // ---------------------------------------------------------------- toques

  private tocar(indice: number | null): void {
    this.som.desbloquear();
    if (this.emFluxo || this.ui.modalAberto || !this.partida) return;
    this.reiniciarDica();
    this.partida.tocar(indice);
  }

  selecionou(caixa: number | null): void {
    this.tabuleiro.selecionar(caixa);
    if (caixa !== null) this.som.pegar();
    if (this.maoTutorial) {
      const [de, para] = this.maoTutorial;
      if (caixa === de) this.ui.mao(this.tabuleiro.centro(para), this.tabuleiro.centro(para));
      else this.mostrarMao();
    } else {
      this.ui.esconderMao();
    }
  }

  moveu(r: ResultadoMovimento): void {
    this.tabuleiro.selecionar(null);
    this.tabuleiro.sincronizar(r.estado, r.movidos.map((m) => m.id));
    this.maoTutorial = null;
    this.ui.esconderMao();
    this.atualizarAjudas();
  }

  invalido(caixa: number, _motivo: MotivoInvalido | 'nao-selecionavel'): void {
    this.tabuleiro.tremer(caixa);
    this.tabuleiro.selecionar(null);
    this.som.erro();
    if (this.maoTutorial) this.mostrarMao();
  }

  desfez(estado: Estado): void {
    this.tabuleiro.selecionar(null);
    this.tabuleiro.sincronizar(estado);
    this.som.toque();
    estatistica(this.progresso, this.fase).desfazer++;
    this.atualizarAjudas();
  }

  reiniciou(estado: Estado): void {
    this.tabuleiro.carregar(estado);
    this.atualizarAjudas();
  }

  ganhouCaixa(estado: Estado): void {
    this.tabuleiro.selecionar(null);
    this.tabuleiro.sincronizar(estado);
    const t = this.tabuleiro.centro(estado.caixas.length - 1);
    this.efeitos.brilho(t.x, t.y, '#ffe94a', 20);
    this.som.completar();
    estatistica(this.progresso, this.fase).caixasExtras++;
    this.atualizarAjudas();
  }

  private caixaCompletou(caixa: number): void {
    this.som.completar();
    const t = this.tabuleiro.topo(caixa);
    const tipo = this.partida?.estado.caixas[caixa].itens[0]?.tipo ?? 0;
    this.efeitos.brilho(t.x, t.y, fruta(tipo).cor);
    const alvo = this.ui.centroDaFigurinha();
    this.efeitos.voar(t.x, t.y, alvo.x, alvo.y, fruta(tipo).cor, undefined, 600);
  }

  // ---------------------------------------------------------------- vitória

  venceu(): void {
    void this.fluxoVitoria();
  }

  private async esperarTabuleiro(extra = 250): Promise<void> {
    for (let i = 0; i < 60 && this.tabuleiro.ocupado(); i++) await esperar(50);
    await esperar(extra);
  }

  private async fluxoVitoria(): Promise<void> {
    const p = this.partida!;
    const n = this.fase;
    this.emFluxo = true;
    this.ui.esconderMao();
    clearTimeout(this.temporizadorDica);
    const est = estatistica(this.progresso, n);
    est.vitorias++;
    est.segundos += p.segundos();
    this.metricas.registrar('fase_vitoria', {
      fase: n,
      jogadas: p.jogadas,
      minimo: p.def.info?.jogadasMinimas ?? 0,
      segundos: p.segundos(),
      desfazer: p.desfazerUsados,
      caixa_extra: p.caixaExtraUsada,
    });
    this.atualizarAjudas();
    await this.esperarTabuleiro(450);

    this.som.vitoria();
    this.efeitos.confete([...new Set(p.estado.caixas.flatMap((c) => c.itens.map((i) => fruta(i.tipo).cor)))].concat('#ffe94a', '#ffffff'));

    const primeiraVez = n === this.progresso.fase;
    let completou: number | null = null;
    if (primeiraVez) {
      const antes = situacao(this.progresso.pecas);
      this.progresso.fase = n + 1;
      this.progresso.pecas = Math.min(100, this.progresso.pecas + 1);
      this.progresso.moedas += ECONOMIA.moedasPorFase;
      this.progresso.anuncios.fasesDesdeIntersticial++;
      if (situacao(this.progresso.pecas).completas > antes.completas) completou = antes.atual;
      salvar(this.progresso);
      await esperar(350);
      const centro = this.tabuleiro.centro(Math.floor(p.estado.caixas.length / 2));
      const alvo = this.ui.centroDaFigurinha();
      await new Promise<void>((ok) =>
        this.efeitos.voar(centro.x, centro.y, alvo.x, alvo.y, '#ffe94a', () => {
          this.som.moeda();
          this.ui.figurinha(this.progresso.pecas, true);
          this.ui.moedas(this.progresso.moedas, true);
          ok();
        }, 800),
      );
      await esperar(700);
    }

    if (completou !== null) {
      await this.figurinhaNova(completou);
      const pagina = PAGINAS.find((pg) => pg.figurinhas[pg.figurinhas.length - 1] === completou! + 1);
      if (pagina && !this.progresso.paginasResgatadas.includes(pagina.numero)) await this.paginaCompleta(pagina);
      this.ui.figurinha(this.progresso.pecas);
    } else {
      await this.ui.janela(
        [
          h('h2', {}, n % 5 === 0 && n > 35 ? 'Que fase!' : 'Muito bem!'),
          primeiraVez ? h('div', { class: 'destaque' }, `+${ECONOMIA.moedasPorFase} moedas`) : h('p', {}, `Fase ${n} de novo, sem prêmio.`),
          primeiraVez ? h('p', {}, 'E mais uma peça da figurinha.') : null,
        ],
        [{ id: 'proxima', texto: n >= TOTAL ? 'Continuar' : `Fase ${Math.min(this.progresso.fase, n + 1)}`, estilo: 'principal' }],
      );
    }

    await this.intersticialSeCouber(n);
    this.emFluxo = false;
    this.comecarFase(primeiraVez ? this.progresso.fase : Math.min(n + 1, this.progresso.fase));
  }

  private async figurinhaNova(indice: number): Promise<void> {
    const f = FIGURINHAS[indice];
    this.som.figurinha();
    this.efeitos.confete(['#ffe94a', '#ff9ec7', '#ffffff', '#2c6fbb'], 70);
    this.metricas.registrar('figurinha_completa', { figurinha: f.numero, fase: this.fase });
    await this.ui.janela(
      [h('h2', {}, 'Figurinha nova!'), cartaFigurinha(indice, { grande: true }), h('p', {}, f.curiosidade)],
      [{ id: 'colar', texto: 'Colar no álbum', estilo: 'principal' }],
    );
    this.som.toque();
  }

  private async paginaCompleta(pagina: Pagina): Promise<void> {
    this.metricas.registrar('album_pagina_completa', { pagina: pagina.numero });
    const anuncio = this.progresso.config.anunciosSimulados;
    const escolha = await this.ui.janela(
      [
        h('h2', {}, 'Página completa!'),
        h('p', {}, `Você fechou a página "${pagina.titulo}" do álbum.`),
        h('div', { class: 'destaque' }, `+${pagina.recompensa} moedas`),
      ],
      [
        { id: 'pegar', texto: `Pegar ${pagina.recompensa} moedas`, estilo: 'principal', moedas: pagina.recompensa },
        ...(anuncio ? [{ id: 'dobrar', texto: `Dobrar para ${pagina.recompensa * 2}`, estilo: 'anuncio' as const }] : []),
      ],
    );
    let ganho = pagina.recompensa;
    if (escolha === 'dobrar') {
      this.metricas.registrar('anuncio_recompensado', { estado: 'aceito', motivo: 'dobrar_pagina' });
      if (await this.ui.anuncio('recompensado', `${pagina.recompensa * 2} moedas`)) {
        ganho *= 2;
        this.metricas.registrar('anuncio_recompensado', { estado: 'concluido', motivo: 'dobrar_pagina' });
      }
    }
    this.progresso.moedas += ganho;
    this.progresso.paginasResgatadas.push(pagina.numero);
    salvar(this.progresso);
    this.ui.moedas(this.progresso.moedas, true);
    this.som.moeda();
  }

  private async intersticialSeCouber(fase: number): Promise<void> {
    const a = this.progresso.anuncios;
    if (!this.progresso.config.anunciosSimulados) return;
    if (!podeMostrarIntersticial({ fase, venceu: true, fasesDesde: a.fasesDesdeIntersticial, ultimo: a.ultimoIntersticial, agora: Date.now() })) return;
    this.metricas.registrar('anuncio_intersticial', { fase });
    await this.ui.anuncio('intersticial');
    a.ultimoIntersticial = Date.now();
    a.fasesDesdeIntersticial = 0;
    salvar(this.progresso);
  }

  private async fimDoLote(): Promise<void> {
    this.fase = TOTAL + 1;
    this.ui.fase(TOTAL + 1);
    const e = await this.ui.janela(
      [
        h('h2', {}, 'Você jogou todas as fases!'),
        h('p', {}, `As ${TOTAL} fases desta versão acabaram. Fases novas chegam em lotes; enquanto isso, dá para rejogar qualquer uma.`),
      ],
      [{ id: 'aleatoria', texto: 'Jogar uma fase sorteada', estilo: 'principal' }, { id: 'album', texto: 'Ver o álbum' }],
    );
    if (e === 'album') await this.abrirAlbum();
    this.comecarFase(11 + Math.floor(Math.random() * (TOTAL - 10)));
  }

  // ---------------------------------------------------------------- travou e ajudas

  travou(): void {
    void this.fluxoTravou();
  }

  private async fluxoTravou(): Promise<void> {
    const p = this.partida;
    if (!p || this.emFluxo) return;
    this.emFluxo = true;
    await this.esperarTabuleiro(350);
    estatistica(this.progresso, this.fase).travou++;
    salvar(this.progresso);
    this.metricas.registrar('fase_derrota', { fase: this.fase, motivo: 'sem_jogadas', jogadas: p.jogadas });
    const botoes: Botao[] = [];
    if (p.podeDesfazer) botoes.push({ id: 'desfazer', texto: 'Desfazer a última jogada', estilo: 'principal' });
    if (!p.tutorial && !p.caixaExtraUsada) botoes.push({ id: 'caixa', texto: 'Ganhar uma caixa extra', estilo: 'anuncio' });
    botoes.push({ id: 'reiniciar', texto: 'Recomeçar a fase' });
    const e = await this.ui.janela(
      [h('h2', {}, 'Sem jogadas!'), h('p', {}, 'Nenhuma fruta pode mudar de caixa agora.')],
      botoes,
    );
    this.emFluxo = false;
    if (e === 'desfazer') await this.desfazer();
    else if (e === 'caixa') await this.caixaExtra();
    else await this.reiniciar(true);
  }

  private async desfazer(): Promise<void> {
    const p = this.partida;
    if (!p || this.emFluxo || !p.podeDesfazer) return;
    if (p.desfazerRestante <= 0 && !(await this.oferecer('desfazer'))) return;
    p.desfazer();
  }

  private async caixaExtra(): Promise<void> {
    const p = this.partida;
    if (!p || this.emFluxo || p.tutorial || p.caixaExtraUsada) return;
    await this.oferecer('caixa');
  }

  private async reiniciar(confirmado = false): Promise<void> {
    const p = this.partida;
    if (!p || this.emFluxo) return;
    if (!confirmado && p.jogadas >= 3) {
      const e = await this.ui.janela(
        [h('h2', {}, 'Recomeçar?'), h('p', {}, 'As frutas voltam para o lugar do começo da fase.')],
        [{ id: 'sim', texto: 'Recomeçar', estilo: 'principal' }, { id: 'nao', texto: 'Continuar jogando', estilo: 'discreto' }],
        { fecharFora: true },
      );
      if (e !== 'sim') return;
    }
    const est = estatistica(this.progresso, this.fase);
    est.falhas++;
    est.tentativas++;
    salvar(this.progresso);
    this.metricas.registrar('fase_reinicio', { fase: this.fase, jogadas: p.jogadas });
    this.metricas.registrar('fase_inicio', { fase: this.fase, tentativa: est.tentativas });
    p.reiniciar();
    this.som.toque();
  }

  /** Oferece uma ajuda por anúncio recompensado ou por moedas. Resolve true se a ajuda foi dada. */
  private async oferecer(tipo: 'desfazer' | 'caixa'): Promise<boolean> {
    const p = this.partida!;
    const preco = tipo === 'caixa' ? ECONOMIA.precoCaixaExtra : ECONOMIA.precoDesfazer;
    const nome = tipo === 'caixa' ? 'Caixa extra' : `Mais ${ECONOMIA.desfazerPorCompra} desfazer`;
    const anuncios = this.progresso.config.anunciosSimulados && podeOferecerRecompensado(this.fase);
    if (anuncios) this.metricas.registrar('anuncio_recompensado', { estado: 'oferecido', motivo: tipo });
    const e = await this.ui.janela(
      [
        h('h2', {}, nome),
        h('p', {}, tipo === 'caixa' ? 'Uma caixa vazia a mais, só nesta tentativa.' : `Você pode voltar mais ${ECONOMIA.desfazerPorCompra} jogadas nesta fase.`),
      ],
      [
        anuncios
          ? { id: 'anuncio', texto: 'Ver anúncio e ganhar', estilo: 'anuncio' }
          : { id: 'teste', texto: 'Ganhar (teste, sem anúncio)', estilo: 'principal' },
        { id: 'moedas', texto: `Usar ${preco} moedas`, moedas: preco, desabilitado: this.progresso.moedas < preco },
        { id: 'nao', texto: 'Agora não', estilo: 'discreto' },
      ],
      { fecharFora: true },
    );
    let via: string;
    if (e === 'anuncio') {
      this.metricas.registrar('anuncio_recompensado', { estado: 'aceito', motivo: tipo });
      if (!(await this.ui.anuncio('recompensado', nome))) return false;
      this.metricas.registrar('anuncio_recompensado', { estado: 'concluido', motivo: tipo });
      via = 'anuncio';
    } else if (e === 'moedas') {
      this.progresso.moedas -= preco;
      salvar(this.progresso);
      this.ui.moedas(this.progresso.moedas, true);
      via = 'moedas';
    } else if (e === 'teste') {
      via = 'teste';
    } else {
      return false;
    }
    if (tipo === 'desfazer') {
      p.ganharDesfazer(ECONOMIA.desfazerPorCompra);
      this.atualizarAjudas();
    } else {
      p.adicionarCaixa();
    }
    this.metricas.registrar('ajuda_usada', { fase: this.fase, tipo, via });
    return true;
  }

  // ---------------------------------------------------------------- tutorial e dica

  private mostrarMao(): void {
    if (!this.maoTutorial || this.ui.modalAberto) return;
    const [de, para] = this.maoTutorial;
    this.ui.mao(this.tabuleiro.centro(de), this.tabuleiro.centro(para));
  }

  /** Nas fases de tutorial, quem fica parado ganha a mãozinha mostrando uma boa jogada. */
  private reiniciarDica(): void {
    clearTimeout(this.temporizadorDica);
    const p = this.partida;
    if (!p || !p.tutorial || this.maoTutorial) return;
    this.ui.esconderMao();
    this.temporizadorDica = window.setTimeout(() => {
      if (!this.partida || this.partida.terminada || this.ui.modalAberto || this.emFluxo) return;
      const r = resolver(problemaDeEstado(this.partida.estado), { limiteNos: 20_000 });
      const jogada = r.solucao?.[0];
      if (!jogada) return;
      this.partida.tocar(null);
      this.maoTutorial = jogada;
      this.mostrarMao();
    }, DICA_PARADO_MS);
  }

  // ---------------------------------------------------------------- telas

  private ligarBotoes(): void {
    document.addEventListener('pointerdown', () => this.som.desbloquear(), { capture: true });
    $('botao-desfazer').addEventListener('click', () => void this.desfazer());
    $('botao-caixa').addEventListener('click', () => void this.caixaExtra());
    $('botao-reiniciar').addEventListener('click', () => void this.reiniciar());
    $('botao-album').addEventListener('click', () => void this.abrirAlbum());
    $('figurinha-mini').addEventListener('click', () => void this.abrirAlbum());
    $('botao-menu').addEventListener('click', () => void this.abrirAjustes());
  }

  private async abrirAlbum(): Promise<void> {
    if (this.emFluxo) return;
    this.som.toque();
    await this.ui.album(this.progresso.pecas, this.progresso.paginasResgatadas, async (numero) => {
      const pagina = PAGINAS.find((pg) => pg.numero === numero);
      if (pagina) await this.paginaCompleta(pagina);
    });
  }

  private aplicarConfig(): void {
    this.som.ligado = this.progresso.config.som;
    this.som.vibracao = this.progresso.config.vibracao;
  }

  private async abrirAjustes(): Promise<void> {
    if (this.emFluxo) return;
    this.som.toque();
    const c = this.progresso.config;
    const chave = (rotulo: string, campo: keyof Progresso['config']) => {
      const botao = h('button', { class: 'chave', role: 'switch', 'aria-checked': String(c[campo]), 'aria-label': rotulo });
      botao.addEventListener('click', () => {
        c[campo] = !c[campo];
        botao.setAttribute('aria-checked', String(c[campo]));
        this.aplicarConfig();
        salvar(this.progresso);
        this.som.toque();
      });
      return h('div', { class: 'ajuste' }, h('span', {}, rotulo), botao);
    };
    const dev = location.hash === '#dev';
    const campoFase = h('input', { type: 'number', min: 1, max: TOTAL, value: this.fase, id: 'ir-fase', style: 'width:80px;font:inherit;font-size:17px' });
    const e = await this.ui.janela(
      [
        h('h2', {}, 'Ajustes'),
        h(
          'div',
          { class: 'ajustes' },
          chave('Som', 'som'),
          chave('Vibração', 'vibracao'),
          chave('Anúncios simulados', 'anunciosSimulados'),
          dev ? h('div', { class: 'ajuste' }, h('label', { for: 'ir-fase' }, 'Ir para a fase'), campoFase) : null,
        ),
        h('p', {}, `Protótipo · ${TOTAL} fases · progresso salvo neste aparelho`),
      ],
      [
        { id: 'fechar', texto: 'Voltar ao jogo', estilo: 'principal' },
        ...(dev ? [{ id: 'ir', texto: 'Ir para a fase escolhida' }] : []),
        { id: 'dados', texto: 'Dados do teste' },
        { id: 'zerar', texto: 'Começar do zero', estilo: 'discreto' },
      ],
      { fecharFora: true },
    );
    if (e === 'dados') await this.abrirDados();
    else if (e === 'ir') {
      const n = Math.max(1, Math.min(TOTAL, Number((campoFase as HTMLInputElement).value) || 1));
      this.progresso.fase = Math.max(this.progresso.fase, n);
      this.progresso.pecas = Math.max(this.progresso.pecas, n - 1);
      salvar(this.progresso);
      this.ui.figurinha(this.progresso.pecas);
      this.comecarFase(n);
    } else if (e === 'zerar') {
      const ok = await this.ui.janela(
        [h('h2', {}, 'Começar do zero?'), h('p', {}, 'Isso apaga as fases vencidas, as moedas e o álbum deste aparelho.')],
        [{ id: 'sim', texto: 'Apagar e recomeçar' }, { id: 'nao', texto: 'Cancelar', estilo: 'principal' }],
        { fecharFora: true },
      );
      if (ok === 'sim') {
        apagar();
        this.registro.limpar();
        this.progresso = progressoNovo();
        salvar(this.progresso);
        this.aplicarConfig();
        this.ui.moedas(0);
        this.ui.figurinha(0);
        this.comecarFase(1);
      }
    }
  }

  /** Painel por fase (seção Métricas e testes do plano), para olhar os dados de quem testou neste aparelho. */
  private async abrirDados(): Promise<void> {
    const linhas = Object.entries(this.progresso.estatisticas)
      .map(([fase, e]) => ({ fase: Number(fase), ...e }))
      .sort((a, b) => a.fase - b.fase);
    const tabela = h(
      'table',
      {},
      h('thead', {}, h('tr', {}, ...['Fase', 'Tentou', 'Venceu', 'Recomeçou', 'Travou', 'Tempo médio', 'Desfez', 'Caixa extra'].map((t) => h('th', {}, t)))),
      h(
        'tbody',
        {},
        ...linhas.map((l) =>
          h(
            'tr',
            {},
            h('td', {}, String(l.fase)),
            h('td', {}, String(l.tentativas)),
            h('td', {}, String(l.vitorias)),
            h('td', {}, String(l.falhas)),
            h('td', {}, String(l.travou)),
            h('td', {}, l.vitorias ? `${Math.round(l.segundos / l.vitorias)} s` : '–'),
            h('td', {}, String(l.desfazer)),
            h('td', {}, String(l.caixasExtras)),
          ),
        ),
      ),
    );
    const texto = JSON.stringify({ estatisticas: this.progresso.estatisticas, eventos: this.registro.eventos });
    const copiar = h('button', { class: 'botao' }, 'Copiar dados (JSON)');
    const area = h('textarea', { readonly: true, rows: 3, style: 'width:100%;font-size:12px', hidden: true });
    copiar.addEventListener('click', () => {
      navigator.clipboard
        ?.writeText(texto)
        .then(() => (copiar.textContent = 'Copiado!'))
        .catch(() => {
          area.hidden = false;
          (area as HTMLTextAreaElement).value = texto;
          (area as HTMLTextAreaElement).select();
        }) ??
        (() => {
          area.hidden = false;
          (area as HTMLTextAreaElement).value = texto;
        })();
    });
    await this.ui.janela(
      [
        h('h2', {}, 'Dados do teste'),
        h('p', {}, linhas.length ? 'Fases jogadas neste aparelho.' : 'Ainda não há fases jogadas neste aparelho.'),
        linhas.length ? h('div', { class: 'tabela-dados' }, tabela) : null,
        copiar,
        area,
      ],
      [{ id: 'fechar', texto: 'Fechar', estilo: 'principal' }],
      { fecharFora: true },
    );
  }
}

type Hot = { snapshot?: (f: () => unknown) => void; ready?: (f: (dados: unknown) => void) => void; data?: unknown };
const hot = (window as unknown as { claude?: { hot?: Hot } }).claude?.hot;

function iniciar(dadosHot: unknown): void {
  const salvo = (dadosHot as { progresso?: unknown } | undefined)?.progresso;
  const jogo = new Jogo(salvo);
  hot?.snapshot?.(() => ({ progresso: jogo.instantaneo() }));
  if (/^#(teste|dev)$/.test(location.hash)) (window as unknown as { __feira: unknown }).__feira = jogo.ganchosDeTeste();
  void jogo.iniciar();
}

if (hot?.ready) hot.ready(iniciar);
else iniciar(hot?.data ?? {});
