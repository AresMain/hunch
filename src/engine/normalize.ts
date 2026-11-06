// Input normalization (spec v1.0 §5). No fuzzy matching: only case, whitespace
// and punctuation are folded. Inflection folding is used for Signal Map hits
// and the dictionary check only, never for the answer itself.

export function normalize(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`\-_.]/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The word itself plus simple de-inflected candidates (plural, -ed, -ing). */
export function wordForms(word: string): string[] {
  const forms = new Set<string>([word]);
  const add = (w: string) => {
    if (w.length >= 2) forms.add(w);
  };
  if (word.endsWith('ies')) add(word.slice(0, -3) + 'y');
  if (word.endsWith('es')) add(word.slice(0, -2));
  if (word.endsWith('s') && !word.endsWith('ss')) add(word.slice(0, -1));
  if (word.endsWith('ied')) add(word.slice(0, -3) + 'y');
  if (word.endsWith('ed')) {
    add(word.slice(0, -2));
    add(word.slice(0, -1));
  }
  if (word.endsWith('ing')) {
    add(word.slice(0, -3));
    add(word.slice(0, -3) + 'e');
  }
  return [...forms];
}

export interface Lexicon {
  isWord(normalized: string): boolean;
}

export const ACCEPT_ALL: Lexicon = { isWord: (w) => /^[a-z]+( [a-z]+)*$/.test(w) };
