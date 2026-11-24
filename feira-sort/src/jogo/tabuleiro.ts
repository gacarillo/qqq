/**
 * Desenho do tabuleiro no canvas: caixotes de feira, frutas, seleção, voo em arco, caixa completa, tranca.
 *
 * A tela segue a lógica: a cada mudança de estado, cada item ganha um destino; quem mudou de caixa voa em
 * arco até lá, quem só mudou de altura desliza. O laço de animação só roda enquanto algo se mexe.
 */
import { estaCompleta, estaTrancada, tamanhoSequenciaTopo, tiposCompletos, type Estado } from '../logica/regras';
import { bitmap } from './imagens';
import { fruta } from './frutas';

export interface Retangulo {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OpcoesTabuleiro {
  aoTocar(indice: number | null): void;
  /** Um item pousou; `ordem` é a posição dele dentro da jogada (0, 1, 2...). */
  aoPousar(ordem: number): void;
  /** O último item de uma jogada que completou a caixa pousou. */
  aoCompletar(caixa: number): void;
  aoRevelar(): void;
  aoDestrancar(caixa: number): void;
}

interface Voo {
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  inicio: number;
  dur: number;
  ordem: number;
  ultimo: boolean;
}

interface Sprite {
  id: number;
  tipo: number;
  oculto: boolean;
  caixa: number;
  x: number;
  y: number;
  voo: Voo | null;
  pousouEm: number;
  revelouEm: number;
}

interface EfeitoCaixa {
  tremerEm: number;
  completouEm: number;
  destrancouEm: number;
}

// Medidas em unidades do tamanho de um item (s).
const LARG_CAIXA = 1.26;
const VAO_X = 0.3;
const VAO_Y = 0.95;
const FOLGA_TOPO = 1.0;
const PASSO = 0.9; // altura de cada item empilhado
const BASE = 0.24; // tábua do fundo
const BORDA = 0.2; // folga em cima dentro da caixa
const ELEVACAO = 0.78; // quanto os itens selecionados sobem

const COR = {
  traco: '#5c3519',
  fundo: '#e4b47a',
  dentro: '#cf9759',
  veio: 'rgba(110, 60, 20, 0.16)',
  coluna: '#c4843f',
  tabua: '#a96a31',
  sombra: 'rgba(60, 28, 6, 0.28)',
  selecao: '#ffe14d',
  grade: '#4a4a52',
};

const agora = () => performance.now();
const suave = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const saida = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export class Tabuleiro {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private largura = 0;
  private altura = 0;
  s = 48;
  private caixas: Retangulo[] = [];
  private sprites = new Map<number, Sprite>();
  private estado: Estado | null = null;
  private selecionada: number | null = null;
  private efeitos: EfeitoCaixa[] = [];
  private entradaEm = 0;
  private pedido = 0;
  private ultimo = 0;
  private completasVisiveis = new Set<number>();

  constructor(
    private canvas: HTMLCanvasElement,
    private area: HTMLElement,
    private opcoes: OpcoesTabuleiro,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível');
    this.ctx = ctx;
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.opcoes.aoTocar(this.caixaEm(e.clientX, e.clientY));
    });
    const observar = () => this.redimensionar();
    window.addEventListener('resize', observar);
    if ('ResizeObserver' in window) new ResizeObserver(observar).observe(area);
    this.redimensionar();
  }

  /** Começa uma fase nova: caixotes entram em sequência. */
  carregar(estado: Estado): void {
    this.estado = estado;
    this.selecionada = null;
    this.sprites.clear();
    this.completasVisiveis = new Set(estado.caixas.map((_, i) => i).filter((i) => estaCompleta(estado.caixas[i], estado.capacidade)));
    this.efeitos = estado.caixas.map(() => ({ tremerEm: -1e9, completouEm: -1e9, destrancouEm: -1e9 }));
    this.calcularLayout();
    estado.caixas.forEach((c, i) =>
      c.itens.forEach((item, pos) => {
        const p = this.posicao(i, pos, false);
        this.sprites.set(item.id, { ...item, caixa: i, x: p.x, y: p.y, voo: null, pousouEm: -1e9, revelouEm: -1e9 });
      }),
    );
    this.entradaEm = agora();
    this.pedirQuadro();
  }

  selecionar(indice: number | null): void {
    this.selecionada = indice;
    this.pedirQuadro();
  }

  /** Atualiza para um estado novo, animando quem mudou de lugar. */
  sincronizar(estado: Estado, ordemMovidos: number[] = []): void {
    const mudouQuantidade = !this.estado || this.estado.caixas.length !== estado.caixas.length;
    this.estado = estado;
    if (mudouQuantidade) {
      while (this.efeitos.length < estado.caixas.length) this.efeitos.push({ tremerEm: -1e9, completouEm: -1e9, destrancouEm: -1e9 });
      this.calcularLayout();
    }
    const t = agora();
    const ultimoId = ordemMovidos[ordemMovidos.length - 1];
    estado.caixas.forEach((c, i) =>
      c.itens.forEach((item, pos) => {
        const sp = this.sprites.get(item.id);
        if (!sp) return;
        if (sp.oculto && !item.oculto) sp.revelouEm = t + (sp.caixa !== i ? 200 : 0);
        sp.oculto = item.oculto;
        if (sp.caixa !== i) {
          const ordem = Math.max(0, ordemMovidos.indexOf(item.id));
          const destino = this.posicao(i, pos, false);
          const pico = Math.min(sp.y, destino.y) - this.s * (1.1 + Math.abs(destino.x - sp.x) / (this.largura || 1));
          sp.voo = {
            x0: sp.x,
            y0: sp.y,
            cx: (sp.x + destino.x) / 2,
            cy: pico,
            inicio: t + ordem * 55,
            dur: 260 + Math.min(160, Math.hypot(destino.x - sp.x, destino.y - sp.y) * 0.35),
            ordem,
            ultimo: item.id === ultimoId,
          };
          sp.caixa = i;
        }
      }),
    );
    // Caixas que deixaram de estar completas (desfazer) somem com a tampa na hora.
    for (const i of [...this.completasVisiveis]) {
      if (!estaCompleta(estado.caixas[i], estado.capacidade)) this.completasVisiveis.delete(i);
    }
    if (ordemMovidos.length === 0) {
      // desfazer, reinício ou caixa extra: tampas e trancas refletem o estado na hora
      const completos = tiposCompletos(estado);
      estado.caixas.forEach((c, i) => {
        if (estaCompleta(c, estado.capacidade)) this.completasVisiveis.add(i);
        if (estaTrancada(c, completos)) this.efeitos[i].destrancouEm = -1e9;
      });
    }
    this.pedirQuadro();
  }

  tremer(indice: number): void {
    if (this.efeitos[indice]) this.efeitos[indice].tremerEm = agora();
    this.pedirQuadro();
  }

  centro(indice: number): { x: number; y: number } {
    const r = this.caixas[indice];
    return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : { x: this.largura / 2, y: this.altura / 2 };
  }

  topo(indice: number): { x: number; y: number } {
    const r = this.caixas[indice];
    return r ? { x: r.x + r.w / 2, y: r.y } : { x: this.largura / 2, y: this.altura / 2 };
  }

  retangulo(indice: number): Retangulo | undefined {
    return this.caixas[indice];
  }

  ocupado(): boolean {
    const t = agora();
    for (const sp of this.sprites.values()) if (sp.voo && t < sp.voo.inicio + sp.voo.dur) return true;
    return false;
  }

  // ---------------------------------------------------------------- layout

  private redimensionar(): void {
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.largura = window.innerWidth;
    this.altura = window.innerHeight;
    this.canvas.width = Math.round(this.largura * this.dpr);
    this.canvas.height = Math.round(this.altura * this.dpr);
    this.canvas.style.width = `${this.largura}px`;
    this.canvas.style.height = `${this.altura}px`;
    if (this.estado) {
      this.calcularLayout();
      this.estado.caixas.forEach((c, i) =>
        c.itens.forEach((item, pos) => {
          const sp = this.sprites.get(item.id);
          if (!sp) return;
          const p = this.posicao(i, pos, false);
          sp.x = p.x;
          sp.y = p.y;
          sp.voo = null;
        }),
      );
    }
    this.pedirQuadro();
  }

  private calcularLayout(): void {
    if (!this.estado) return;
    const n = this.estado.caixas.length;
    const cap = this.estado.capacidade;
    const r = this.area.getBoundingClientRect();
    const W = r.width - 12;
    const H = r.height - 8;
    const altCaixa = cap * PASSO + BASE + BORDA;
    let melhor = { s: 0, linhas: 1 };
    for (let linhas = 1; linhas <= 3; linhas++) {
      const colunas = Math.ceil(n / linhas);
      const sw = W / (colunas * LARG_CAIXA + (colunas - 1) * VAO_X);
      const sh = H / (linhas * altCaixa + (linhas - 1) * VAO_Y + FOLGA_TOPO);
      const s = Math.min(sw, sh, 74);
      if (s > melhor.s * 1.04) melhor = { s, linhas };
    }
    const s = melhor.s;
    this.s = s;
    const linhas = melhor.linhas;
    const porLinha: number[] = [];
    let resto = n;
    for (let l = 0; l < linhas; l++) {
      const k = Math.ceil(resto / (linhas - l));
      porLinha.push(k);
      resto -= k;
    }
    const cw = LARG_CAIXA * s;
    const ch = altCaixa * s;
    const blocoAltura = linhas * ch + (linhas - 1) * VAO_Y * s + FOLGA_TOPO * s;
    let y = r.top + (r.height - blocoAltura) / 2 + FOLGA_TOPO * s;
    this.caixas = [];
    for (const k of porLinha) {
      const larguraLinha = k * cw + (k - 1) * VAO_X * s;
      let x = r.left + (r.width - larguraLinha) / 2;
      for (let j = 0; j < k; j++) {
        this.caixas.push({ x, y, w: cw, h: ch });
        x += cw + VAO_X * s;
      }
      y += ch + VAO_Y * s;
    }
  }

  private posicao(caixa: number, pos: number, elevado: boolean): { x: number; y: number } {
    const r = this.caixas[caixa];
    if (!r) return { x: 0, y: 0 };
    const s = this.s;
    return {
      x: r.x + r.w / 2,
      y: r.y + r.h - BASE * s - PASSO * s * (pos + 0.5) - (elevado ? ELEVACAO * s : 0),
    };
  }

  private caixaEm(x: number, y: number): number | null {
    const s = this.s;
    for (let i = 0; i < this.caixas.length; i++) {
      const r = this.caixas[i];
      if (x >= r.x - VAO_X * s * 0.5 && x <= r.x + r.w + VAO_X * s * 0.5 && y >= r.y - ELEVACAO * s * 1.2 && y <= r.y + r.h + 0.25 * s) {
        return i;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- laço

  private pedirQuadro(): void {
    if (this.pedido) return;
    this.pedido = requestAnimationFrame((t) => this.quadro(t));
  }

  private quadro(t: number): void {
    this.pedido = 0;
    const dt = Math.min(0.05, (t - (this.ultimo || t)) / 1000);
    this.ultimo = t;
    const animando = this.atualizar(t, dt);
    this.desenhar(t);
    if (animando) this.pedirQuadro();
    else this.ultimo = 0;
  }

  private atualizar(t: number, dt: number): boolean {
    if (!this.estado) return false;
    let animando = t - this.entradaEm < 700;
    const elevados = this.itensElevados();
    const k = 1 - Math.exp(-dt * 20);
    this.estado.caixas.forEach((c, i) =>
      c.itens.forEach((item, pos) => {
        const sp = this.sprites.get(item.id);
        if (!sp) return;
        const alvo = this.posicao(i, pos, elevados.has(item.id));
        if (sp.voo) {
          const v = sp.voo;
          const p = (t - v.inicio) / v.dur;
          if (p >= 1) {
            sp.voo = null;
            sp.x = alvo.x;
            sp.y = alvo.y;
            sp.pousouEm = t;
            this.opcoes.aoPousar(v.ordem);
            if (v.ultimo) this.aoFimDaJogada(i);
          } else if (p > 0) {
            const e = saida(p);
            const a = 1 - e;
            sp.x = a * a * v.x0 + 2 * a * e * v.cx + e * e * alvo.x;
            sp.y = a * a * v.y0 + 2 * a * e * v.cy + e * e * alvo.y;
          }
          animando = true;
        } else {
          const dx = alvo.x - sp.x;
          const dy = alvo.y - sp.y;
          if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) {
            sp.x += dx * k;
            sp.y += dy * k;
            animando = true;
          } else {
            sp.x = alvo.x;
            sp.y = alvo.y;
          }
        }
        if (t - sp.pousouEm < 220 || (sp.revelouEm > 0 && t - sp.revelouEm < 420) || sp.revelouEm > t) animando = true;
      }),
    );
    for (const e of this.efeitos) {
      if (t - e.tremerEm < 380 || t - e.completouEm < 900 || t - e.destrancouEm < 700) animando = true;
    }
    return animando;
  }

  private aoFimDaJogada(caixa: number): void {
    const e = this.estado!;
    const t = agora();
    if (estaCompleta(e.caixas[caixa], e.capacidade) && !this.completasVisiveis.has(caixa)) {
      this.completasVisiveis.add(caixa);
      this.efeitos[caixa].completouEm = t;
      this.opcoes.aoCompletar(caixa);
    }
    const completos = tiposCompletos(e);
    e.caixas.forEach((c, i) => {
      if (c.chave !== null && !estaTrancada(c, completos) && this.efeitos[i].destrancouEm < 0) {
        this.efeitos[i].destrancouEm = t + 250;
        setTimeout(() => this.opcoes.aoDestrancar(i), 250);
      }
    });
    for (const sp of this.sprites.values()) {
      if (sp.revelouEm > t - 40) {
        this.opcoes.aoRevelar();
        break;
      }
    }
  }

  private itensElevados(): Set<number> {
    const ids = new Set<number>();
    if (this.selecionada === null || !this.estado) return ids;
    const c = this.estado.caixas[this.selecionada];
    const n = tamanhoSequenciaTopo(c);
    for (let k = c.itens.length - n; k < c.itens.length; k++) ids.add(c.itens[k].id);
    return ids;
  }

  // ---------------------------------------------------------------- desenho

  private desenhar(t: number): void {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.largura, this.altura);
    if (!this.estado) return;
    const e = this.estado;
    const completos = tiposCompletos(e);
    const voando: Sprite[] = [];

    e.caixas.forEach((c, i) => {
      const r = this.caixas[i];
      if (!r) return;
      const ef = this.efeitos[i];
      const entrada = suave((t - this.entradaEm - i * 45) / 320);
      const tremor = t - ef.tremerEm < 380 ? Math.sin((t - ef.tremerEm) / 28) * this.s * 0.09 * (1 - (t - ef.tremerEm) / 380) : 0;
      const trancada = estaTrancada(c, completos) || (c.chave !== null && t < ef.destrancouEm);

      g.save();
      g.translate(r.x + r.w / 2 + tremor, r.y + r.h);
      const escala = 0.7 + 0.3 * entrada;
      g.scale(escala, escala);
      g.globalAlpha = entrada;
      g.translate(-(r.x + r.w / 2), -(r.y + r.h) + (1 - entrada) * this.s * 0.8);

      this.desenharCaixote(r, i === this.selecionada);
      for (const item of c.itens) {
        const sp = this.sprites.get(item.id);
        if (!sp) continue;
        if (sp.voo) voando.push(sp);
        else this.desenharItem(sp, t, trancada ? 0.62 : 1);
      }
      this.desenharFrente(r);
      if (c.chave !== null) this.desenharTranca(r, c.chave, t, ef.destrancouEm, trancada);
      if (this.completasVisiveis.has(i)) this.desenharTampa(r, c.itens[0]?.tipo ?? 0, t - ef.completouEm);
      g.restore();
    });

    for (const sp of voando) this.desenharItem(sp, t, 1, true);
  }

  private desenharCaixote(r: Retangulo, selecionada: boolean): void {
    const g = this.ctx;
    const s = this.s;
    const raio = s * 0.16;
    g.fillStyle = COR.sombra;
    g.beginPath();
    g.roundRect(r.x + s * 0.06, r.y + s * 0.12, r.w, r.h, raio);
    g.fill();

    if (selecionada) {
      g.save();
      g.shadowColor = COR.selecao;
      g.shadowBlur = s * 0.55;
      g.fillStyle = COR.selecao;
      g.beginPath();
      g.roundRect(r.x - s * 0.07, r.y - s * 0.07, r.w + s * 0.14, r.h + s * 0.14, raio * 1.3);
      g.fill();
      g.restore();
    }

    g.fillStyle = COR.fundo;
    g.strokeStyle = COR.traco;
    g.lineWidth = Math.max(1.5, s * 0.05);
    g.beginPath();
    g.roundRect(r.x, r.y, r.w, r.h, raio);
    g.fill();
    g.stroke();

    const m = s * 0.13;
    g.fillStyle = COR.dentro;
    g.beginPath();
    g.roundRect(r.x + m, r.y + m * 0.8, r.w - 2 * m, r.h - m * 0.8 - BASE * s, raio * 0.6);
    g.fill();
    g.strokeStyle = COR.veio;
    g.lineWidth = Math.max(1, s * 0.03);
    for (const f of [0.38, 0.62]) {
      g.beginPath();
      g.moveTo(r.x + r.w * f, r.y + m * 1.4);
      g.lineTo(r.x + r.w * f, r.y + r.h - BASE * s - m * 0.6);
      g.stroke();
    }
  }

  private desenharFrente(r: Retangulo): void {
    const g = this.ctx;
    const s = this.s;
    g.fillStyle = COR.tabua;
    g.strokeStyle = COR.traco;
    g.lineWidth = Math.max(1.5, s * 0.05);
    g.beginPath();
    g.roundRect(r.x, r.y + r.h - BASE * s, r.w, BASE * s, [0, 0, s * 0.16, s * 0.16]);
    g.fill();
    g.stroke();
    g.fillStyle = 'rgba(255, 230, 190, 0.35)';
    g.fillRect(r.x + s * 0.12, r.y + r.h - BASE * s + s * 0.06, r.w - s * 0.24, s * 0.04);
  }

  private desenharItem(sp: Sprite, t: number, alfa: number, voando = false): void {
    const g = this.ctx;
    const s = this.s;
    const lado = s * 0.98;
    let sx = 1;
    let sy = 1;
    const dp = t - sp.pousouEm;
    if (dp < 220) {
      const q = Math.sin((dp / 220) * Math.PI) * 0.16;
      sx = 1 + q;
      sy = 1 - q;
    }
    if (voando) {
      sx *= 1.06;
      sy *= 1.06;
    }
    const revelando = sp.revelouEm > 0 ? (t - sp.revelouEm) / 420 : 2;
    g.save();
    g.globalAlpha *= alfa;
    g.translate(sp.x, sp.y + (lado * (1 - sy)) / 2);
    g.scale(sx, sy);
    if (voando) {
      g.shadowColor = 'rgba(40, 20, 5, 0.35)';
      g.shadowBlur = s * 0.25;
      g.shadowOffsetY = s * 0.18;
    }
    const mostrarSaquinho = sp.oculto || (revelando >= 0 && revelando < 0.5) || revelando < 0;
    if (mostrarSaquinho) {
      const p = revelando >= 0 && revelando < 0.5 ? revelando / 0.5 : 0;
      const b = bitmap('saquinho', lado * (1 + p * 0.35) * this.dpr);
      g.globalAlpha *= 1 - p;
      if (b) g.drawImage(b, (-lado * (1 + p * 0.35)) / 2, (-lado * (1 + p * 0.35)) / 2, lado * (1 + p * 0.35), lado * (1 + p * 0.35));
    }
    if (!sp.oculto && !(revelando < 0)) {
      let esc = 1;
      if (revelando >= 0 && revelando < 1) esc = revelando < 0.5 ? 0.4 + revelando * 1.4 : 1.1 - (revelando - 0.5) * 0.2;
      const b = bitmap(fruta(sp.tipo).letra, lado * this.dpr);
      if (b) g.drawImage(b, (-lado * esc) / 2, (-lado * esc) / 2, lado * esc, lado * esc);
    }
    g.restore();
  }

  private desenharTampa(r: Retangulo, tipo: number, dt: number): void {
    const g = this.ctx;
    const s = this.s;
    const p = Math.min(1, dt / 260);
    const queda = (1 - saida(p)) * -s * 0.9;
    const quique = p >= 1 && dt < 420 ? Math.sin(((dt - 260) / 160) * Math.PI) * s * 0.05 : 0;
    g.save();
    g.translate(0, queda - quique);
    g.fillStyle = '#e8b06a';
    g.strokeStyle = COR.traco;
    g.lineWidth = Math.max(1.5, s * 0.05);
    g.beginPath();
    g.roundRect(r.x - s * 0.05, r.y - s * 0.1, r.w + s * 0.1, s * 0.26, s * 0.08);
    g.fill();
    g.stroke();
    // etiqueta com a fruta
    const raio = s * 0.32;
    const cx = r.x + r.w / 2;
    const cy = r.y + s * 0.03;
    g.fillStyle = '#fff6df';
    g.beginPath();
    g.arc(cx, cy, raio, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    const b = bitmap(fruta(tipo).letra, raio * 1.6 * this.dpr);
    if (b) g.drawImage(b, cx - raio * 0.8, cy - raio * 0.8, raio * 1.6, raio * 1.6);
    g.restore();
    if (dt < 900) {
      // brilho que varre a caixa
      const a = 1 - dt / 900;
      g.save();
      g.globalAlpha = a * 0.55;
      g.fillStyle = '#fff3b0';
      g.beginPath();
      g.roundRect(r.x, r.y, r.w, r.h, s * 0.16);
      g.fill();
      g.restore();
    }
  }

  private desenharTranca(r: Retangulo, chave: number, t: number, destrancouEm: number, trancada: boolean): void {
    const g = this.ctx;
    const s = this.s;
    const abrindo = destrancouEm > 0 ? (t - destrancouEm) / 700 : -1;
    if (!trancada && (abrindo < 0 || abrindo >= 1)) return;
    const p = abrindo > 0 ? abrindo : 0;
    g.save();
    // grade
    g.globalAlpha = 1 - p;
    g.strokeStyle = COR.grade;
    g.lineWidth = Math.max(2, s * 0.07);
    g.lineCap = 'round';
    const subida = p * r.h;
    for (const f of [0.25, 0.5, 0.75]) {
      g.beginPath();
      g.moveTo(r.x + r.w * f, r.y + s * 0.12 - subida);
      g.lineTo(r.x + r.w * f, r.y + r.h - BASE * s - subida);
      g.stroke();
    }
    // selo com a fruta que abre a tranca, grande o bastante para ler no celular, e o cadeado no canto
    const raio = s * 0.4;
    const cx = r.x + r.w / 2;
    const cy = r.y - s * 0.02;
    g.translate(cx, cy);
    g.scale(1 + p * 0.5, 1 + p * 0.5);
    g.fillStyle = '#fff6df';
    g.strokeStyle = COR.grade;
    g.lineWidth = Math.max(2, s * 0.07);
    g.beginPath();
    g.arc(0, 0, raio, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    const f = bitmap(fruta(chave).letra, raio * 1.55 * this.dpr);
    if (f) g.drawImage(f, -raio * 0.78, -raio * 0.8, raio * 1.55, raio * 1.55);
    const lado = s * 0.46;
    const b = bitmap('cadeado', lado * this.dpr);
    g.rotate(p * 1.2);
    if (b) g.drawImage(b, raio * 0.35, raio * 0.15 + p * s, lado, lado);
    g.restore();
  }
}
