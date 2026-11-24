/** Números da economia do jogo, num lugar só para ajustar depois com dados. */
export const ECONOMIA = {
  /** Moedas por fase vencida pela primeira vez. */
  moedasPorFase: 10,
  desfazerGratisPorFase: 5,
  /** Desfazer extra ganho com anúncio ou moedas. */
  desfazerPorCompra: 5,
  precoDesfazer: 40,
  precoCaixaExtra: 80,
  /** Fases de tutorial: desfazer sem limite, sem caixa extra e sem anúncio nenhum. */
  ultimaFaseTutorial: 10,
} as const;
