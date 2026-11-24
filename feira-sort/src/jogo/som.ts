/**
 * Sons sintetizados na hora com Web Audio: nenhum arquivo de áudio, nenhum problema de licença.
 * O navegador só libera áudio depois do primeiro toque, então `desbloquear` é chamado nele.
 */
type Onda = OscillatorType;

export class Som {
  ligado = true;
  vibracao = true;
  private ctx: AudioContext | null = null;
  private mestre: GainNode | null = null;

  desbloquear(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.mestre = this.ctx.createGain();
        this.mestre.gain.value = 0.9;
        this.mestre.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  vibrar(ms: number | number[]): void {
    if (!this.vibracao) return;
    try {
      navigator.vibrate?.(ms);
    } catch {
      // sem vibração neste aparelho
    }
  }

  private tom(freq: number, dur: number, o: { onda?: Onda; volume?: number; fim?: number; atraso?: number; ataque?: number } = {}): void {
    if (!this.ligado || !this.ctx || !this.mestre) return;
    const t = this.ctx.currentTime + (o.atraso ?? 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = o.onda ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.fim) osc.frequency.exponentialRampToValueAtTime(o.fim, t + dur);
    const v = o.volume ?? 0.18;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.ataque ?? 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.mestre);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private ruido(dur: number, o: { volume?: number; freq?: number; q?: number; atraso?: number } = {}): void {
    if (!this.ligado || !this.ctx || !this.mestre) return;
    const t = this.ctx.currentTime + (o.atraso ?? 0);
    const n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const dados = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) dados[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const fonte = this.ctx.createBufferSource();
    fonte.buffer = buffer;
    const filtro = this.ctx.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.frequency.value = o.freq ?? 2400;
    filtro.Q.value = o.q ?? 0.8;
    const g = this.ctx.createGain();
    g.gain.value = o.volume ?? 0.12;
    fonte.connect(filtro).connect(g).connect(this.mestre);
    fonte.start(t);
  }

  pegar(): void {
    this.tom(520, 0.08, { fim: 780, volume: 0.12 });
    this.vibrar(8);
  }

  /** Item pousando na caixa: um "toc" de madeira, mais agudo a cada item da mesma jogada. */
  soltar(ordem: number): void {
    const f = 300 * Math.pow(1.122, ordem);
    this.tom(f, 0.1, { onda: 'triangle', volume: 0.2, fim: f * 0.7 });
    this.ruido(0.03, { volume: 0.05, freq: 1800 });
  }

  erro(): void {
    this.tom(160, 0.14, { onda: 'square', volume: 0.05, fim: 110 });
    this.vibrar([12, 40, 12]);
  }

  completar(): void {
    this.tom(880, 0.5, { volume: 0.12 });
    this.tom(1318.5, 0.6, { volume: 0.1, atraso: 0.07 });
    this.ruido(0.25, { volume: 0.04, freq: 6000, q: 0.5, atraso: 0.05 });
    this.vibrar(18);
  }

  revelar(): void {
    this.ruido(0.12, { volume: 0.08, freq: 3200, q: 0.6 });
  }

  destrancar(): void {
    this.tom(1400, 0.05, { onda: 'square', volume: 0.05 });
    this.tom(1900, 0.07, { onda: 'square', volume: 0.05, atraso: 0.06 });
  }

  vitoria(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tom(f, 0.35, { onda: 'triangle', volume: 0.14, atraso: i * 0.09 });
      this.tom(f * 2, 0.25, { volume: 0.04, atraso: i * 0.09 });
    });
    this.vibrar([20, 60, 30]);
  }

  figurinha(): void {
    [392, 523.25, 659.25, 783.99].forEach((f, i) => this.tom(f, 0.3, { onda: 'triangle', volume: 0.13, atraso: i * 0.11 }));
    this.tom(1046.5, 0.9, { onda: 'triangle', volume: 0.15, atraso: 0.46 });
    this.tom(1568, 0.9, { volume: 0.05, atraso: 0.46 });
    this.ruido(0.6, { volume: 0.05, freq: 7000, q: 0.4, atraso: 0.46 });
    this.vibrar([30, 50, 30, 50, 60]);
  }

  moeda(): void {
    this.tom(987.77, 0.08, { onda: 'square', volume: 0.05 });
    this.tom(1318.5, 0.22, { onda: 'square', volume: 0.05, atraso: 0.07 });
  }

  toque(): void {
    this.tom(640, 0.05, { volume: 0.06 });
  }
}
