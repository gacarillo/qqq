/**
 * Camada de anúncios. O jogo só conversa com `ProvedorAnuncios`; trocar o simulador pelo AdMob (no app
 * Android, via Capacitor) não mexe em mais nada (seção Princípios de arquitetura do plano).
 *
 * Regras da seção Monetização do plano:
 * - Recompensado: sempre opcional, o jogador sabe a recompensa antes de assistir.
 * - Intersticial: só depois de uma vitória, a partir da fase 15, no máximo um a cada 3 fases e um a cada
 *   3 minutos. Nunca depois de uma derrota nem no meio de uma fase.
 * - Banner: não usar.
 * - Nenhum anúncio na primeira sessão (fases 1 a 10).
 */

export interface ProvedorAnuncios {
  /** Mostra um anúncio recompensado. Resolve true se o jogador assistiu até o fim. */
  recompensado(recompensa: string): Promise<boolean>;
  intersticial(): Promise<void>;
}

export const REGRAS_INTERSTICIAL = { faseMinima: 15, fasesEntre: 3, segundosEntre: 180 } as const;

export interface SituacaoIntersticial {
  /** Fase que acabou de ser jogada. */
  fase: number;
  venceu: boolean;
  /** Fases vencidas desde o último intersticial (conta a que acabou). */
  fasesDesde: number;
  /** Momento do último intersticial (ms), 0 se nunca houve. */
  ultimo: number;
  agora: number;
}

export function podeMostrarIntersticial(s: SituacaoIntersticial): boolean {
  if (!s.venceu || s.fase < REGRAS_INTERSTICIAL.faseMinima) return false;
  if (s.ultimo === 0) return true;
  return s.fasesDesde >= REGRAS_INTERSTICIAL.fasesEntre && s.agora - s.ultimo >= REGRAS_INTERSTICIAL.segundosEntre * 1000;
}

/** Recompensados são permitidos a partir da fase 11 (depois do tutorial). */
export function podeOferecerRecompensado(fase: number): boolean {
  return fase > 10;
}
