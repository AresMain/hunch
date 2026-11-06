import { describe, expect, it } from 'vitest';
import { ALL_PUZZLES, DEPTH_LADDER, GENERATED, PUZZLES, pickPuzzles } from './puzzles';
import { normalize, wordForms } from '../engine/normalize';

describe('puzzle bank', () => {
  it('has unique ids', () => {
    expect(new Set(PUZZLES.map((p) => p.id)).size).toBe(PUZZLES.length);
  });

  for (const p of PUZZLES) {
    describe(p.id, () => {
      const answers = new Set([p.answer, ...p.aliases].map(normalize));

      it('has three non-empty clues, a definition and a fallback', () => {
        expect(p.clues).toHaveLength(3);
        for (const c of p.clues) expect(c.trim().length).toBeGreaterThan(0);
        expect(p.definition.length).toBeGreaterThan(0);
        expect(p.fallback.length).toBeGreaterThan(0);
      });

      it('has a Signal Map of sensible size with no duplicates', () => {
        expect(p.strong.length).toBeGreaterThanOrEqual(8);
        expect(p.weak.length).toBeGreaterThanOrEqual(15);
        const all = [...p.strong, ...p.weak].map(normalize);
        expect(new Set(all).size).toBe(all.length);
      });

      it('never puts the answer or its word forms on the map', () => {
        for (const w of [...p.strong, ...p.weak].map(normalize)) {
          for (const f of wordForms(w)) expect(answers.has(f), `${w} leaks the answer`).toBe(false);
          expect(w.includes(normalize(p.answer)), `${w} contains the answer`).toBe(false);
        }
      });

      it('never states the answer inside a clue or the fallback', () => {
        for (const text of [...p.clues, p.fallback]) {
          expect(normalize(text).split(' ')).not.toContain(normalize(p.answer));
        }
      });
    });
  }
});

describe('pickPuzzles', () => {
  it('descends the depth ladder, never getting easier, with no repeats', () => {
    const picked = pickPuzzles(12, new Set());
    expect(picked).toHaveLength(12);
    expect(new Set(picked.map((p) => p.id)).size).toBe(12);
    expect(picked.map((p) => p.depth)).toEqual(DEPTH_LADDER);
  });

  it('has enough puzzles at every depth for a full descent', () => {
    for (const d of [1, 2, 3, 4, 5]) {
      const need = DEPTH_LADDER.filter((x) => x === d).length;
      expect(PUZZLES.filter((p) => p.depth === d).length, `depth ${d}`).toBeGreaterThanOrEqual(need);
    }
  });

  it('prefers puzzles the room has not seen', () => {
    const first = pickPuzzles(5, new Set());
    const second = pickPuzzles(5, new Set(first.map((p) => p.id)));
    const overlap = second.filter((p) => first.some((f) => f.id === p.id));
    expect(overlap).toHaveLength(0);
  });
});

describe('generated bank', () => {
  it('has well over 999 puzzles, spread across every depth', () => {
    expect(GENERATED.length).toBeGreaterThan(999);
    for (const d of [1, 2, 3, 4, 5]) expect(GENERATED.filter((p) => p.depth === d).length, `depth ${d}`).toBeGreaterThan(200);
  });

  it('has unique answers and ids across the whole bank', () => {
    expect(new Set(ALL_PUZZLES.map((p) => p.id)).size).toBe(ALL_PUZZLES.length);
    expect(new Set(ALL_PUZZLES.map((p) => normalize(p.answer))).size).toBe(ALL_PUZZLES.length);
  });

  it('every puzzle is complete and never leaks its answer', () => {
    const problems: string[] = [];
    for (const p of GENERATED) {
      const answers = new Set([p.answer, ...p.aliases].map(normalize));
      const ans = normalize(p.answer);
      if (p.clues.length !== 3 || p.clues.some((c) => !c.trim())) problems.push(`${p.id}: clues`);
      if (!p.definition || !p.fallback) problems.push(`${p.id}: text`);
      if (p.strong.length < 6 || p.weak.length < 10) problems.push(`${p.id}: map size`);
      const map = [...p.strong, ...p.weak].map(normalize);
      if (new Set(map).size !== map.length) problems.push(`${p.id}: duplicate links`);
      for (const w of map) {
        if (wordForms(w).some((f) => answers.has(f)) || w.includes(ans)) problems.push(`${p.id}: link ${w}`);
      }
      for (const text of [...p.clues, p.fallback]) {
        if (normalize(text).split(' ').some((t) => t === ans || wordForms(t).some((f) => answers.has(f)))) problems.push(`${p.id}: clue leaks`);
      }
    }
    expect(problems.slice(0, 20)).toEqual([]);
  });

  it('rotates: two back-to-back matches share no words', () => {
    const a = pickPuzzles(20, new Set());
    const b = pickPuzzles(20, new Set());
    expect(a.filter((p) => b.some((q) => q.id === p.id))).toHaveLength(0);
  });
});
