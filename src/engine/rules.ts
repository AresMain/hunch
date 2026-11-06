// All tunable game numbers live here. Spec: docs/HUNCH-spec-v1.1-amendments.md §A–C.

export const RULES = {
  /** Upper bound on rounds; the fight for 2nd and 3rd can run long. */
  maxRounds: 20,
  /** Places decided by crossing the target before the match ends. */
  podiumSize: 3,
  introMs: 2_500,
  probeMs: 20_000,
  probesPerRound: 3,
  fragmentMs: 4_000,
  lateLetterAtMs: 30_000,
  mainMs: 120_000,
  clueBonusMs: 30_000,
  clueCosts: [50, 100, 150] as const,
  /** The final clue can only be bought with this much time (or less) left. */
  finalClueAtMs: 20_000,
  missesToUnlockClues: 5,
  collapseMs: 60_000,
  revealMs: 10_000,

  solvePoints: 500,
  blindHunchBonus: 250,
  speedBonusMax: 120,
  firstCrackBonus: 50,
  probeBonus: { strong: 75, weak: 30 } as const,

  maxGuessLength: 40,
} as const;

export type Rules = typeof RULES;

/** Room-level hard cap measured from the main-phase start. */
export function hardCapMs(r: Rules = RULES): number {
  return r.mainMs + r.clueCosts.length * r.clueBonusMs;
}
