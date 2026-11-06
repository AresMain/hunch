// Dictionary check for probes and guesses: the bundled SCOWL word lists, every
// puzzle word, a supplement of modern words, and the system word list when the
// machine has one (slim server images don't). Falls back to "any alphabetic
// input" only if nothing loads, so the game never hard-fails.

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ACCEPT_ALL, normalize, type Lexicon } from '../engine/normalize';
import { ALL_PUZZLES } from './puzzles';

const SUPPLEMENT = `
internet email website online laptop smartphone phone selfie emoji wifi app podcast blog
video television tv computer robot pixel software hardware download upload password
astronaut spaceship satellite rocket galaxy asteroid dinosaur pizza burger taco sushi
pasta coffee chocolate cookie soda movie cinema football soccer basketball baseball
tennis golf hockey gym yoga jeans sneakers hoodie okay ok hello goodbye cool awesome
drone hashtag streaming gaming gamer console controller headphones microphone camera
`;

export function loadLexicon(): Lexicon {
  const path = ['/usr/share/dict/words', '/usr/dict/words'].find((p) => existsSync(p));
  const words = new Set<string>();
  if (path) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const w = normalize(line);
      if (w) words.add(w);
    }
  }
  for (const w of SUPPLEMENT.split(/\s+/)) if (w) words.add(w);
  // SCOWL word lists (common → rare), which include modern and inflected forms.
  try {
    const dir = dirname(createRequire(import.meta.url).resolve('wordlist-english/package.json'));
    for (const t of [10, 20, 35, 40, 50, 55, 60, 70]) {
      for (const w of JSON.parse(readFileSync(join(dir, `english-words-${t}.json`), 'utf8')) as string[]) words.add(normalize(w));
    }
  } catch {
    console.warn('[lexicon] wordlist-english not installed; using system word list only');
  }
  for (const p of ALL_PUZZLES) {
    for (const w of [p.answer, ...p.aliases, ...p.strong, ...p.weak]) words.add(normalize(w));
  }
  if (words.size < 10_000) {
    console.warn('[lexicon] word lists missing; accepting any alphabetic input');
    return ACCEPT_ALL;
  }
  console.log(`[lexicon] ${words.size.toLocaleString()} words${path ? ` (incl. ${path})` : ''}`);
  return {
    isWord: (w) => w.split(' ').every((part) => words.has(part)),
  };
}
