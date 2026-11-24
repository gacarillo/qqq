/** Parte da tela feita em HTML: topo, varal da figurinha, botões de ajuda, avisos e janelas. */
import { FIGURINHAS, PAGINAS, gradeDasPecas, ordemDasPecas, paginaDaFigurinha, situacao } from './album';
import { urlArte } from './imagens';

type Filho = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  atributos: Record<string, string | number | boolean | ((e: Event) => void)> = {},
  ...filhos: Filho[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos)) {
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v as EventListener);
    else if (v === false) continue;
    else if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const f of filhos) if (f !== null && f !== undefined && f !== false) el.append(f);
  return el;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface Botao {
  id: string;
  texto: string;
  estilo?: 'principal' | 'anuncio' | 'discreto' | '';
  desabilitado?: boolean;
  moedas?: number;
}

export function iconeMoeda(): HTMLElement {
  return h('span', { class: 'moeda', 'aria-hidden': 'true' });
}

export function cartaFigurinha(indice: number, opcoes: { grande?: boolean; pecas?: number } = {}): HTMLElement {
  const f = FIGURINHAS[indice];
  const pagina = paginaDaFigurinha(indice);
  const completa = opcoes.pecas === undefined || opcoes.pecas >= f.pecas;
  if (!completa) {
    return h(
      'div',
      { class: 'carta vazia', style: `--cor-pagina:${pagina.cor}` },
      h('span', { class: 'numero' }, `#${String(f.numero).padStart(2, '0')}`),
      opcoes.pecas ? h('span', { class: 'progresso' }, `${opcoes.pecas} de ${f.pecas} peças`) : null,
    );
  }
  return h(
    'div',
    { class: `carta${opcoes.grande ? ' grande' : ''}`, style: `--cor-pagina:${pagina.cor}` },
    h('span', { class: 'numero' }, `#${String(f.numero).padStart(2, '0')}`),
    h('div', { class: 'arte' }, h('img', { src: urlArte(f.arte), alt: '' })),
    h('div', { class: 'nome' }, f.nome),
  );
}

export class Interface {
  private camada = $('camada-modal');
  private caixaModal = $('modal');
  private avisoEl = $('aviso');
  private maoEl = $('mao');
  private temporizadorAviso = 0;
  private fecharAtual: ((id: string) => void) | null = null;

  constructor() {
    this.camada.addEventListener('pointerdown', (e) => {
      if (e.target === this.camada && this.fecharAtual) this.fecharAtual('fora');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.fecharAtual) this.fecharAtual('fora');
    });
  }

  get modalAberto(): boolean {
    return !this.camada.hidden;
  }

  fase(n: number): void {
    $('rotulo-fase').textContent = n > 100 ? 'Fim do lote' : `Fase ${n}`;
  }

  moedas(n: number, animar = false): void {
    const el = $('moedas-valor');
    el.textContent = String(n);
    if (animar) {
      const caixa = $('moedas');
      caixa.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.2)' }, { transform: 'scale(1)' }], { duration: 400 });
    }
  }

  ajudas(o: { desfazer: number; podeDesfazer: boolean; caixa: 'oferta' | 'usada' | 'oculta'; reiniciar: boolean }): void {
    const desfazer = $<HTMLButtonElement>('botao-desfazer');
    const selo = $('selo-desfazer');
    desfazer.disabled = !o.podeDesfazer;
    if (o.desfazer === Infinity) selo.hidden = true;
    else {
      selo.hidden = false;
      selo.textContent = o.desfazer > 0 ? String(o.desfazer) : '+';
      selo.className = o.desfazer > 0 ? 'selo' : 'selo selo-anuncio';
    }
    const caixa = $<HTMLButtonElement>('botao-caixa');
    caixa.hidden = o.caixa === 'oculta';
    caixa.disabled = o.caixa === 'usada';
    $<HTMLButtonElement>('botao-reiniciar').disabled = !o.reiniciar;
  }

  /** Desenha a figurinha em andamento no varal. `novaPeca` anima a última peça revelada. */
  figurinha(pecas: number, novaPeca = false): void {
    let s = situacao(pecas);
    const mini = $('figurinha-mini');
    mini.replaceChildren();
    if (novaPeca && s.pecasNaAtual === 0 && s.completas > 0) {
      // A peça nova fechou uma figurinha: mostra ela completa antes de passar para a próxima.
      const indice = s.completas - 1;
      s = { completas: indice, atual: indice, pecasNaAtual: FIGURINHAS[indice].pecas };
    }
    if (s.atual === null) {
      $('figurinha-titulo').textContent = 'Álbum completo!';
      $('figurinha-pecas').textContent = `${FIGURINHAS.length} de ${FIGURINHAS.length} figurinhas`;
      mini.append(h('div', { class: 'arte' }, h('img', { src: urlArte(FIGURINHAS[FIGURINHAS.length - 1].arte), alt: '' })));
      return;
    }
    const f = FIGURINHAS[s.atual];
    const pagina = paginaDaFigurinha(s.atual);
    const { colunas, linhas } = gradeDasPecas(s.atual);
    const ordem = ordemDasPecas(s.atual);
    const reveladas = new Set(ordem.slice(0, s.pecasNaAtual));
    const ultima = ordem[s.pecasNaAtual - 1];
    const grade = h('div', {
      class: 'pecas',
      style: `grid-template-columns:repeat(${colunas},1fr);grid-template-rows:repeat(${linhas},1fr);--cor-pagina:${pagina.cor}`,
    });
    for (let i = 0; i < f.pecas; i++) {
      const peca = h('i', { class: 'peca' });
      if (reveladas.has(i)) {
        if (novaPeca && i === ultima) {
          peca.classList.add('nova');
          requestAnimationFrame(() => requestAnimationFrame(() => peca.classList.add('revelada')));
        } else peca.classList.add('revelada');
      }
      grade.append(peca);
    }
    mini.append(h('div', { class: 'arte' }, h('img', { src: urlArte(f.arte), alt: '' })), grade);
    mini.setAttribute('aria-label', `Figurinha ${f.numero}: ${s.pecasNaAtual} de ${f.pecas} peças`);
    $('figurinha-titulo').textContent = `Figurinha ${f.numero} de ${FIGURINHAS.length}`;
    $('figurinha-pecas').textContent = `${s.pecasNaAtual} de ${f.pecas} peças`;
    if (novaPeca) {
      mini.classList.remove('pulso');
      void mini.offsetWidth;
      mini.classList.add('pulso');
    }
  }

  centroDaFigurinha(): { x: number; y: number } {
    const r = $('figurinha-mini').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  centroDasMoedas(): { x: number; y: number } {
    const r = $('moedas').getBoundingClientRect();
    return { x: r.left + 16, y: r.top + r.height / 2 };
  }

  aviso(texto: string, icone?: string, ms = 3800): void {
    clearTimeout(this.temporizadorAviso);
    this.avisoEl.replaceChildren(icone ? h('img', { src: icone, alt: '' }) : '', h('span', {}, texto));
    this.avisoEl.hidden = false;
    this.temporizadorAviso = window.setTimeout(() => (this.avisoEl.hidden = true), ms);
  }

  esconderAviso(): void {
    clearTimeout(this.temporizadorAviso);
    this.avisoEl.hidden = true;
  }

  /** Mãozinha do tutorial: toca em `de` e depois em `para`. */
  mao(de: { x: number; y: number }, para: { x: number; y: number }): void {
    const m = this.maoEl;
    m.style.setProperty('--x0', `${de.x - 20}px`);
    m.style.setProperty('--y0', `${de.y - 6}px`);
    m.style.setProperty('--x1', `${para.x - 20}px`);
    m.style.setProperty('--y1', `${para.y - 6}px`);
    m.hidden = false;
  }

  esconderMao(): void {
    this.maoEl.hidden = true;
  }

  /** Abre uma janela e resolve com o id do botão escolhido ('fora' = tocou fora). */
  janela(conteudo: Filho[], botoes: Botao[], opcoes: { fecharFora?: boolean } = {}): Promise<string> {
    return new Promise((resolver) => {
      const fechar = (id: string) => {
        if (id === 'fora' && !opcoes.fecharFora) return;
        this.fecharAtual = null;
        this.camada.hidden = true;
        this.caixaModal.replaceChildren();
        resolver(id);
      };
      const linha = h('div', { class: 'botoes' });
      for (const b of botoes) {
        linha.append(
          h(
            'button',
            {
              class: `botao ${b.estilo ?? ''}`,
              disabled: b.desabilitado ?? false,
              onclick: () => fechar(b.id),
            },
            b.estilo === 'anuncio' ? '▶ ' : '',
            b.moedas !== undefined ? iconeMoeda() : null,
            b.texto,
          ),
        );
      }
      this.caixaModal.replaceChildren(...conteudo.filter((c): c is Node | string => !!c), botoes.length ? linha : '');
      this.fecharAtual = fechar;
      this.camada.hidden = false;
      const principal = linha.querySelector<HTMLButtonElement>('.principal, .botao');
      principal?.focus({ preventScroll: true });
    });
  }

  /** Simula um anúncio (no app, aqui entra o AdMob). Resolve true se o jogador assistiu até o fim. */
  anuncio(tipo: 'recompensado' | 'intersticial', recompensa = ''): Promise<boolean> {
    const duracao = tipo === 'recompensado' ? 5 : 3;
    return new Promise((resolver) => {
      const barra = h('i');
      const info = h('span', {}, `Fecha em ${duracao} s`);
      const fechar = h('button', { class: 'botao', disabled: true }, tipo === 'recompensado' ? 'Pegar recompensa' : 'Fechar');
      const pular = tipo === 'recompensado' ? h('button', { class: 'botao discreto' }, 'Desistir da recompensa') : null;
      const conteudo = h(
        'div',
        { class: 'anuncio-falso' },
        h('strong', {}, 'Anúncio de teste'),
        h('span', {}, tipo === 'recompensado' ? `Recompensa: ${recompensa}` : 'Intervalo entre fases'),
        h('div', { class: 'barra' }, barra),
        info,
      );
      this.caixaModal.replaceChildren(
        conteudo,
        h('p', {}, 'Simulação do protótipo. No app de verdade, aqui aparece um anúncio do AdMob.'),
        h('div', { class: 'botoes' }, fechar, pular),
      );
      this.camada.hidden = false;
      const inicio = performance.now();
      let ativo = true;
      const passo = () => {
        if (!ativo) return;
        const p = Math.min(1, (performance.now() - inicio) / (duracao * 1000));
        barra.style.width = `${p * 100}%`;
        info.textContent = p < 1 ? `Fecha em ${Math.ceil(duracao * (1 - p))} s` : 'Pronto';
        if (p < 1) requestAnimationFrame(passo);
        else fechar.disabled = false;
      };
      requestAnimationFrame(passo);
      const terminar = (assistiu: boolean) => {
        ativo = false;
        this.camada.hidden = true;
        this.caixaModal.replaceChildren();
        resolver(assistiu);
      };
      fechar.addEventListener('click', () => terminar(true));
      pular?.addEventListener('click', () => terminar(false));
    });
  }

  /** Álbum completo, página por página. */
  async album(pecas: number, paginasResgatadas: number[], resgatar: (pagina: number) => Promise<void>): Promise<void> {
    const s = situacao(pecas);
    let pagina = Math.min(PAGINAS.length - 1, Math.floor((s.atual ?? FIGURINHAS.length - 1) / 4));
    for (;;) {
      const p = PAGINAS[pagina];
      const grade = h('div', { class: 'album-grade' });
      for (const n of p.figurinhas) {
        const indice = n - 1;
        const pecasDela = indice < s.completas ? undefined : indice === s.atual ? s.pecasNaAtual : 0;
        grade.append(cartaFigurinha(indice, { pecas: pecasDela }));
      }
      const completa = p.figurinhas.every((n) => n <= s.completas);
      const resgatada = paginasResgatadas.includes(p.numero);
      const recompensa = h(
        'div',
        { class: 'recompensa' },
        resgatada ? `Recompensa recebida: ${p.recompensa} moedas` : `Página completa vale ${p.recompensa} moedas`,
      );
      const botoes: Botao[] = [
        ...(completa && !resgatada ? [{ id: 'resgatar', texto: `Pegar ${p.recompensa} moedas`, estilo: 'principal' as const, moedas: p.recompensa }] : []),
        { id: 'fechar', texto: 'Voltar ao jogo', estilo: completa && !resgatada ? '' : 'principal' },
      ];
      const escolha = await this.janela(
        [
          h('h2', {}, 'Álbum da Feira'),
          h(
            'div',
            { class: 'paginacao' },
            h('button', { 'aria-label': 'Página anterior', disabled: pagina === 0, onclick: () => this.fecharAtual?.('anterior') }, '‹'),
            h('div', { class: 'pagina-titulo' }, `Página ${p.numero}: ${p.titulo}`),
            h('button', { 'aria-label': 'Próxima página', disabled: pagina === PAGINAS.length - 1, onclick: () => this.fecharAtual?.('proxima') }, '›'),
          ),
          grade,
          recompensa,
        ],
        botoes,
        { fecharFora: true },
      );
      if (escolha === 'anterior') pagina = Math.max(0, pagina - 1);
      else if (escolha === 'proxima') pagina = Math.min(PAGINAS.length - 1, pagina + 1);
      else if (escolha === 'resgatar') {
        await resgatar(p.numero);
        return;
      } else return;
    }
  }
}
