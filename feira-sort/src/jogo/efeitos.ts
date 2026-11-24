/** Partículas na camada de cima (acima da interface): confete, brilhos e o brilho que voa até a figurinha. */

interface Particula {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vida: number;
  max: number;
  cor: string;
  tam: number;
  rot: number;
  vrot: number;
  forma: 'papel' | 'estrela' | 'ponto';
  gravidade: number;
}

interface Orbe {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  inicio: number;
  dur: number;
  cor: string;
  aoChegar?: () => void;
}

export class Efeitos {
  private g: CanvasRenderingContext2D;
  private particulas: Particula[] = [];
  private orbes: Orbe[] = [];
  private pedido = 0;
  private ultimo = 0;
  private dpr = 1;
  private reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  constructor(canvas: HTMLCanvasElement) {
    const g = canvas.getContext('2d');
    if (!g) throw new Error('Canvas 2D indisponível');
    this.g = g;
    const ajustar = () => {
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(window.innerWidth * this.dpr);
      canvas.height = Math.round(window.innerHeight * this.dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };
    window.addEventListener('resize', ajustar);
    ajustar();
  }

  confete(cores: string[], quantidade = 110): void {
    if (this.reduzido) quantidade = Math.round(quantidade / 4);
    const w = window.innerWidth;
    for (let i = 0; i < quantidade; i++) {
      const lado = i % 2 === 0 ? -1 : 1;
      this.particulas.push({
        x: w / 2 + lado * w * 0.42,
        y: window.innerHeight * 0.62,
        vx: -lado * (120 + Math.random() * 380),
        vy: -(520 + Math.random() * 560),
        vida: 0,
        max: 1.8 + Math.random() * 1.2,
        cor: cores[i % cores.length],
        tam: 6 + Math.random() * 7,
        rot: Math.random() * 6.3,
        vrot: (Math.random() - 0.5) * 14,
        forma: i % 5 === 0 ? 'estrela' : 'papel',
        gravidade: 900,
      });
    }
    this.pedir();
  }

  brilho(x: number, y: number, cor: string, quantidade = 16): void {
    for (let i = 0; i < quantidade; i++) {
      const a = (i / quantidade) * Math.PI * 2 + Math.random() * 0.3;
      const v = 140 + Math.random() * 160;
      this.particulas.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 60,
        vida: 0,
        max: 0.55 + Math.random() * 0.3,
        cor: i % 3 === 0 ? '#fff6c2' : cor,
        tam: 4 + Math.random() * 5,
        rot: 0,
        vrot: (Math.random() - 0.5) * 8,
        forma: i % 2 ? 'estrela' : 'ponto',
        gravidade: 260,
      });
    }
    this.pedir();
  }

  /** Um brilho que voa de (x0, y0) até (x1, y1) e chama `aoChegar` ao chegar. */
  voar(x0: number, y0: number, x1: number, y1: number, cor: string, aoChegar?: () => void, dur = 650): void {
    this.orbes.push({ x0, y0, x1, y1, inicio: performance.now(), dur: this.reduzido ? 200 : dur, cor, aoChegar });
    this.pedir();
  }

  private pedir(): void {
    if (!this.pedido) this.pedido = requestAnimationFrame((t) => this.quadro(t));
  }

  private quadro(t: number): void {
    this.pedido = 0;
    const dt = Math.min(0.05, (t - (this.ultimo || t)) / 1000);
    this.ultimo = t;
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, window.innerWidth, window.innerHeight);

    this.particulas = this.particulas.filter((p) => (p.vida += dt) < p.max);
    for (const p of this.particulas) {
      p.vy += p.gravidade * dt;
      p.vx *= 1 - 1.2 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      g.save();
      g.globalAlpha = Math.min(1, 2.2 * (1 - p.vida / p.max));
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.cor;
      if (p.forma === 'papel') {
        g.fillRect(-p.tam / 2, -p.tam / 4, p.tam, p.tam / 2 + Math.abs(Math.sin(p.rot * 2)) * p.tam * 0.3);
      } else if (p.forma === 'estrela') {
        estrela(g, p.tam);
      } else {
        g.beginPath();
        g.arc(0, 0, p.tam / 2, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }

    const fim: Orbe[] = [];
    this.orbes = this.orbes.filter((o) => {
      const p = (t - o.inicio) / o.dur;
      if (p >= 1) {
        fim.push(o);
        return false;
      }
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const cx = (o.x0 + o.x1) / 2 + (o.x1 > o.x0 ? -60 : 60);
      const cy = Math.min(o.y0, o.y1) - 60;
      const a = 1 - e;
      const x = a * a * o.x0 + 2 * a * e * cx + e * e * o.x1;
      const y = a * a * o.y0 + 2 * a * e * cy + e * e * o.y1;
      g.save();
      const raio = 10 + 6 * Math.sin(p * Math.PI);
      const grad = g.createRadialGradient(x, y, 0, x, y, raio * 2.4);
      grad.addColorStop(0, '#fffbe6');
      grad.addColorStop(0.35, o.cor);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, raio * 2.4, 0, Math.PI * 2);
      g.fill();
      g.restore();
      if (Math.random() < 0.6) {
        this.particulas.push({
          x, y, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, vida: 0, max: 0.4,
          cor: '#fff3b0', tam: 3 + Math.random() * 3, rot: 0, vrot: 0, forma: 'ponto', gravidade: 0,
        });
      }
      return true;
    });
    for (const o of fim) {
      this.brilho(o.x1, o.y1, o.cor, 12);
      o.aoChegar?.();
    }

    if (this.particulas.length > 0 || this.orbes.length > 0) this.pedir();
    else {
      this.ultimo = 0;
      g.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }
}

function estrela(g: CanvasRenderingContext2D, tam: number): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? tam / 2 : tam / 4.5;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
}
