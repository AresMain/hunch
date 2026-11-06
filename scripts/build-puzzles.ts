// Generates the large puzzle bank from WordNet 3.1 + SCOWL frequency tiers.
//
//   npx tsx scripts/build-puzzles.ts            → src/server/data/puzzles.generated.json
//
// For every familiar single-word noun it builds a full puzzle:
//   depth     from how common the word is (SCOWL tier) and its length
//   clues     1 subtle (field + sister terms), 2 distinctive (kind of / parts /
//             varieties), 3 near-reveal (the definition, redacted, + first letter)
//   fallback  the field it belongs to (Dead Air hint)
//   Signal Map strong: synonyms, parent kinds, definition words, varieties, parts
//              weak: wider family, sister terms, words from related definitions
// Anything that could leak the answer is redacted or dropped, and offensive or
// slang senses are excluded. The output is committed; the server never needs
// WordNet at runtime.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { normalize, wordForms } from '../src/engine/normalize';
import { PUZZLES as CURATED } from '../src/server/puzzles';
import type { Depth, Puzzle } from '../src/shared/types';

const require = createRequire(import.meta.url);
const WN = join(dirname(require.resolve('wordnet-db/package.json')), 'dict');
const WL = dirname(require.resolve('wordlist-english/package.json'));
const OUT = join(process.cwd(), 'src/server/data/puzzles.generated.json');

// ------------------------------------------------------------------ word tiers

const TIERS = [10, 20, 35, 40, 50, 55, 60, 70] as const;
const tierOf = new Map<string, number>();
for (const t of TIERS) {
  for (const w of JSON.parse(readFileSync(join(WL, `english-words-${t}.json`), 'utf8')) as string[]) {
    if (!tierOf.has(w)) tierOf.set(w, t);
  }
}
const isWord = (w: string) => tierOf.has(w);

// ------------------------------------------------------------------ wordnet

const LEX: Record<number, string> = {
  3: 'Tops', 4: 'act', 5: 'animal', 6: 'artifact', 7: 'attribute', 8: 'body', 9: 'cognition', 10: 'communication',
  11: 'event', 12: 'feeling', 13: 'food', 14: 'group', 15: 'location', 16: 'motive', 17: 'object', 18: 'person',
  19: 'phenomenon', 20: 'plant', 21: 'possession', 22: 'process', 23: 'quantity', 24: 'relation', 25: 'shape',
  26: 'state', 27: 'substance', 28: 'time',
};

const FIELD: Record<string, { phrase: string; category: string }> = {
  act: { phrase: 'Something people do.', category: 'Actions' },
  animal: { phrase: 'Something from the animal kingdom.', category: 'Animals' },
  artifact: { phrase: 'Something made by human hands.', category: 'Objects' },
  attribute: { phrase: 'A quality something can have.', category: 'Qualities' },
  body: { phrase: 'Something to do with the body.', category: 'Body' },
  cognition: { phrase: 'Something of the mind.', category: 'Ideas' },
  communication: { phrase: 'Something to do with words, signals or messages.', category: 'Language' },
  event: { phrase: 'Something that happens.', category: 'Events' },
  feeling: { phrase: 'A feeling.', category: 'Feelings' },
  food: { phrase: 'Something you can eat or drink.', category: 'Food' },
  group: { phrase: 'A kind of group or gathering.', category: 'Groups' },
  location: { phrase: 'A place.', category: 'Places' },
  object: { phrase: 'Something from the natural world.', category: 'Nature' },
  person: { phrase: 'A kind of person.', category: 'People' },
  phenomenon: { phrase: 'Something that occurs in nature or physics.', category: 'Phenomena' },
  plant: { phrase: 'Something that grows.', category: 'Plants' },
  possession: { phrase: 'Something to do with owning, trading or money.', category: 'Money' },
  process: { phrase: 'A process; something that unfolds.', category: 'Processes' },
  shape: { phrase: 'A shape or form.', category: 'Shapes' },
  state: { phrase: 'A state or condition.', category: 'States' },
  substance: { phrase: 'A substance or material.', category: 'Materials' },
  time: { phrase: 'Something to do with time.', category: 'Time' },
};

interface Synset {
  offset: string;
  lex: string;
  words: string[];
  ptrs: { sym: string; offset: string; pos: string }[];
  definition: string;
  examples: string[];
}

function loadData(file: string): Map<string, Synset> {
  const map = new Map<string, Synset>();
  for (const line of readFileSync(join(WN, file), 'utf8').split('\n')) {
    if (!line || line.startsWith(' ')) continue;
    const bar = line.indexOf(' | ');
    const head = line.slice(0, bar).split(' ');
    const gloss = line.slice(bar + 3).trim();
    let i = 0;
    const offset = head[i++];
    const lex = LEX[Number(head[i++])] ?? 'other';
    i++; // ss_type
    const wCnt = parseInt(head[i++], 16);
    const words: string[] = [];
    for (let k = 0; k < wCnt; k++) {
      words.push(head[i++].replace(/\(.*\)$/, ''));
      i++; // lex_id
    }
    const pCnt = Number(head[i++]);
    const ptrs: Synset['ptrs'] = [];
    for (let k = 0; k < pCnt; k++) {
      ptrs.push({ sym: head[i], offset: head[i + 1], pos: head[i + 2] });
      i += 4;
    }
    const examples = [...gloss.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const definition = gloss.split(/;\s*"/)[0].replace(/;\s*$/, '').trim();
    map.set(offset, { offset, lex, words, ptrs, definition, examples });
  }
  return map;
}

interface IndexEntry {
  offsets: string[];
  tagged: number;
}

function loadIndex(file: string): Map<string, IndexEntry> {
  const map = new Map<string, IndexEntry>();
  for (const line of readFileSync(join(WN, file), 'utf8').split('\n')) {
    if (!line || line.startsWith(' ')) continue;
    const t = line.trim().split(' ');
    const synsetCnt = Number(t[2]);
    const pCnt = Number(t[3]);
    const tagged = Number(t[5 + pCnt]);
    map.set(t[0], { offsets: t.slice(t.length - synsetCnt), tagged });
  }
  return map;
}

console.log('loading WordNet…');
const nouns = loadData('data.noun');
const nounIndex = loadIndex('index.noun');
const verbIndex = loadIndex('index.verb');
const adjIndex = loadIndex('index.adj');

// ------------------------------------------------------------------ filters

const STOP = new Set(
  `a an the and or but of to in on at by for with from into onto about as is are was were be been being that this these those
  it its which who whom whose what when where why how than then such some any each every other another more most less least
  very much many few one two three used usually especially often typically something someone thing things kind sort type
  part form way person people having have has had made make makes can could may might will would shall should not no only
  also etc called esp various certain especially small large being their them they he she his her him you your our we
  us all both either neither between among within without over under after before during through up down out off`
    .split(/\s+/),
);

const GENERIC = new Set(
  `entity physical_entity abstraction abstract_entity object whole thing matter artifact artefact unit causal_agent
  instrumentality container device covering structure construction commodity act deed human_action human_activity
  activity event attribute state group grouping relation communication measure quantity content cognition
  psychological_feature location region organism being living_thing person individual someone somebody mortal soul
  natural_object substance material stuff part portion component piece component_part body_part process
  phenomenon natural_phenomenon feeling message`.split(/\s+/),
);

/** Offensive words that must never be answers or links, plus near-universal profanity. */
const BLOCK = new Set(
  `nigger nigga faggot fag dyke kike spic chink gook wetback tranny retard retardation slut whore cunt twat cock dick
  pussy prick bastard bitch shit fuck crap piss tit tits boob boobs penis vagina scrotum testicle testis anus rectum
  orgasm masturbation intercourse sodomy rape rapist incest pedophile pederast porn pornography erection ejaculation
  semen sperm condom brothel prostitute prostitution hooker pimp nazi swastika genocide holocaust suicide lynching
  massacre terrorist torture corpse cadaver feces excrement urine vomit menstruation abortion foreplay sex sexuality
  copulation coitus fornication fornicator adultery adulterer adulteress lust nudity nude nudist stripper striptease
  erotica eroticism fetish fetishism groin buttocks butt bum ass arse crotch breast nipple bosom cleavage harlot
  concubine courtesan mistress paramour seduction seducer genitals genitalia pubes lecher lechery voyeur exhibitionist
  sadism sadist masochism masochist bondage heroin cocaine crack meth opium junkie addict overdose bomber gunman
  hitman murderer murder homicide slaughter executioner hangman noose gallows strangler assassin kidnapper
  molester molestation pervert perversion incubus succubus satanism`.split(/\s+/),
);

const SLANG_MARKERS = new Set(['vulgarism', 'obscenity', 'slang', 'ethnic_slur', 'disparagement', 'derogation', 'profanity', 'colloquialism']);

function usageMarked(s: Synset): boolean {
  return s.ptrs.some((p) => p.sym === ';u' && (nouns.get(p.offset)?.words ?? []).some((w) => SLANG_MARKERS.has(w.toLowerCase())));
}

const pretty = (w: string) => w.replace(/_/g, ' ');

// ------------------------------------------------------------------ leak control

function leaks(answer: string, word: string): boolean {
  if (!word) return true;
  const forms = new Set(wordForms(answer));
  if (forms.has(word) || wordForms(word).some((f) => forms.has(f))) return true;
  if (word.includes(answer) || (word.length >= 4 && answer.includes(word))) return true;
  const stem = answer.slice(0, Math.max(4, answer.length - 3));
  return word.startsWith(stem);
}

function redact(text: string, answer: string): string {
  return text.replace(/[A-Za-z][A-Za-z'-]*/g, (tok) => (leaks(answer, normalize(tok)) ? '____' : tok));
}

// ------------------------------------------------------------------ build one puzzle

function linkWords(offsets: string[], into: Set<string>, answer: string, limit = 999): void {
  for (const off of offsets) {
    const s = nouns.get(off);
    if (!s) continue;
    for (const w of s.words) {
      if (into.size >= limit) return;
      const n = normalize(pretty(w));
      if (n.includes(' ') || !isWord(n) || STOP.has(n) || BLOCK.has(n) || n.length < 3 || leaks(answer, n)) continue;
      into.add(n);
    }
  }
}

const FILLER = new Set(
  `sometimes providing consisting possessing dealing treated intended particular formed variably keeps performs
  reflects permits facilitates larger smaller regular general special specific relating related concerning involving
  containing including resembling consisting usually typically generally commonly mainly chiefly especially found
  known called named given taken making using having being becoming setting giving putting getting serving
  characteristic process condition state quality instance period amount number degree manner means result action
  activity practice system matter case place point term use sense member members group branch area field`.split(/\s+/),
);

/** Content nouns from a definition: real, familiar (tagged) nouns, not filler. */
function glossWords(text: string, into: Set<string>, answer: string, limit = 999): void {
  for (const tok of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (into.size >= limit) return;
    if (tok.length < 4 || STOP.has(tok) || FILLER.has(tok) || BLOCK.has(tok) || !isWord(tok) || leaks(answer, tok)) continue;
    if ((nounIndex.get(tok)?.tagged ?? 0) < 1) continue;
    into.add(tok);
  }
}

const ptrTargets = (s: Synset, syms: string[]) => s.ptrs.filter((p) => p.pos === 'n' && syms.includes(p.sym)).map((p) => p.offset);

function firstUseful(offsets: string[]): Synset | null {
  for (const o of offsets) {
    const s = nouns.get(o);
    if (s && !s.words.every((w) => GENERIC.has(w.toLowerCase()))) return s;
  }
  return null;
}

const listWords = (s: Synset | null, answer: string, n: number) =>
  (s?.words ?? [])
    .filter((w) => !/[A-Z0-9]/.test(w))
    .map((w) => pretty(w))
    .filter((w) => !leaks(answer, normalize(w)) && !BLOCK.has(normalize(w)))
    .slice(0, n);

function depthFor(word: string, tier: number, tagged: number): Depth {
  let d: number = tier <= 20 ? 1 : tier <= 35 ? 2 : tier <= 40 ? 3 : tier <= 50 ? 4 : 5;
  if (word.length >= 10) d += 1;
  if (tagged === 0 && d < 5) d += 1;
  if (tagged >= 30 && d > 1) d -= 1;
  return Math.max(1, Math.min(5, d)) as Depth;
}

function article(phrase: string): string {
  return /^[aeiou]/i.test(phrase) ? `an ${phrase}` : `a ${phrase}`;
}

/** How good a game word this is: concrete, familiar, with rich clues. */
const VIVID: Record<string, number> = {
  animal: 4, food: 4, plant: 3, artifact: 3, object: 3, body: 2, person: 3, location: 3, phenomenon: 3, event: 2,
  feeling: 2, act: 1, communication: 1, substance: 2, shape: 1, time: 0, group: 0, cognition: 0, state: -1,
  attribute: -2, possession: 0, process: -1,
};
const scoreOf = new Map<string, number>();

function build(answer: string): Puzzle | null {
  const idx = nounIndex.get(answer);
  const tier = tierOf.get(answer);
  if (!idx || !tier || tier > 60) return null;
  if (!/^[a-z]{4,13}$/.test(answer) || BLOCK.has(answer)) return null;

  // The noun reading must be the main one, not a verb or adjective in disguise.
  const competing = Math.max(verbIndex.get(answer)?.tagged ?? 0, adjIndex.get(answer)?.tagged ?? 0);
  if (competing > idx.tagged) return null;

  const s = nouns.get(idx.offsets[0]);
  if (!s || !FIELD[s.lex] || usageMarked(s)) return null;
  if (s.words.some((w) => /[A-Z]/.test(w) && normalize(w) === answer)) return null; // proper noun
  if (s.definition.length < 12 || s.definition.length > 170) return null;
  if (/\b(offensive|vulgar|obscene|slang|derogatory|disparaging)\b/i.test(s.definition)) return null;

  const hypers = ptrTargets(s, ['@', '@i']);
  const hyper = firstUseful(hypers);
  const grand = hyper ? firstUseful(ptrTargets(hyper, ['@', '@i'])) : null;
  const hypos = ptrTargets(s, ['~', '~i']);
  const parts = ptrTargets(s, ['%p', '%m', '%s']);
  const wholes = ptrTargets(s, ['#p', '#m', '#s']);
  const sisters = hyper ? ptrTargets(hyper, ['~', '~i']).filter((o) => o !== s.offset) : [];
  const domain = ptrTargets(s, [';c', '-c']);
  const derived = s.ptrs.filter((p) => p.sym === '+').map((p) => p.offset);

  // --- Signal Map
  const strong = new Set<string>();
  linkWords([s.offset], strong, answer);
  linkWords(hypers, strong, answer);
  glossWords(s.definition, strong, answer, 7 + strong.size);
  linkWords(hypos.slice(0, 6), strong, answer, 12);
  linkWords([...parts, ...wholes].slice(0, 4), strong, answer, 14);
  linkWords(domain, strong, answer, 15);
  if (strong.size < 6) return null;

  const weak = new Set<string>();
  const notStrong = (set: Set<string>) => set;
  linkWords(grand ? [grand.offset] : [], weak, answer);
  linkWords(sisters.slice(0, 12), weak, answer, 12);
  for (const ex of s.examples) glossWords(ex, weak, answer, 16);
  if (hyper) glossWords(hyper.definition, weak, answer, 20);
  linkWords(hypos.slice(6, 16), weak, answer, 24);
  for (const o of idx.offsets.slice(1, 4)) {
    const other = nouns.get(o);
    if (other) {
      linkWords([o], weak, answer, 28);
      glossWords(other.definition, weak, answer, 30);
    }
  }
  linkWords(derived, weak, answer, 32);
  for (const w of strong) weak.delete(w);
  notStrong(weak);
  if (weak.size < 10) return null;

  // --- Clues
  const field = FIELD[s.lex];
  const hyperName = listWords(hyper, answer, 1)[0];
  const sisterNames = sisters
    .map((o) => listWords(nouns.get(o) ?? null, answer, 1)[0])
    .filter((w): w is string => !!w && !w.includes(' '))
    .slice(0, 2);
  const hypoNames = hypos.map((o) => listWords(nouns.get(o) ?? null, answer, 1)[0]).filter(Boolean).slice(0, 2);
  const partNames = parts.map((o) => listWords(nouns.get(o) ?? null, answer, 1)[0]).filter(Boolean).slice(0, 2);
  const wholeName = wholes.map((o) => listWords(nouns.get(o) ?? null, answer, 1)[0]).filter(Boolean)[0];

  const c1 =
    sisterNames.length === 2
      ? `${field.phrase.replace(/\.$/, '')}, alongside ${sisterNames[0]} and ${sisterNames[1]}.`
      : grand
        ? `${field.phrase.replace(/\.$/, '')}. Think broadly: ${listWords(grand, answer, 1)[0] ?? 'its wider family'}.`
        : null;
  let c2: string | null = null;
  if (hyperName) {
    c2 = `It is ${article(hyperName)}`;
    if (hypoNames.length === 2) c2 += `; varieties include ${hypoNames[0]} and ${hypoNames[1]}.`;
    else if (partNames.length) c2 += `, with ${partNames.join(' and ')}.`;
    else if (wholeName) c2 += `, found as part of ${article(wholeName)}.`;
    else if (s.examples[0]) c2 += `. As in: “${redact(s.examples[0], answer)}”`;
    else c2 += '.';
  }
  const defText = redact(s.definition, answer).replace(/^\(([^)]*)\)\s*/, '').replace(/\.+$/, '').replace(/^\w/, (c) => c.toUpperCase());
  const c3 = `${defText}. Starts with ${answer[0].toUpperCase()}.`;
  if (!c1 || !c2 || c3.split('____').length > 3) return null;
  // The field hint itself must not name the answer (e.g. MIND → "Something of the mind").
  const textLeaks = (t: string) => (normalize(t).match(/[a-z]+/g) ?? []).some((tok) => leaks(answer, tok));
  if (textLeaks(field.phrase) || textLeaks(c1) || textLeaks(c2)) return null;

  const plural = answer.endsWith('y') && !/[aeiou]y$/.test(answer) ? answer.slice(0, -1) + 'ies' : /(s|x|z|ch|sh)$/.test(answer) ? answer + 'es' : answer + 's';
  const aliases = isWord(plural) ? [plural] : [];

  scoreOf.set(
    answer,
    (VIVID[s.lex] ?? 0) * 2 +
      Math.log2(1 + idx.tagged) +
      (hypoNames.length === 2 ? 1 : 0) +
      (partNames.length ? 1 : 0) +
      (s.examples.length ? 0.5 : 0) +
      (sisterNames.length === 2 ? 0.5 : 0) -
      (answer.length > 11 ? 1 : 0) -
      (s.lex === 'person' && /(er|or)$/.test(answer) && verbIndex.has(answer.replace(/(er|or)$/, '')) ? 3 : 0),
  );

  return {
    id: `wn-${answer}`,
    answer,
    aliases,
    depth: depthFor(answer, tier, idx.tagged),
    category: field.category,
    definition: s.definition.replace(/^\(([^)]*)\)\s*/, '').replace(/\.+$/, '').replace(/^\w/, (c) => c.toUpperCase()) + '.',
    fallback: field.phrase,
    clues: [c1, c2, c3],
    strong: [...strong].slice(0, 15),
    weak: [...weak].slice(0, 30),
  };
}

// ------------------------------------------------------------------ run

const PER_DEPTH = 700;
/** Share of each depth a category may take, so concrete things dominate. */
const CAP: Record<string, number> = { People: 0.16, Actions: 0.08, Language: 0.08, Groups: 0.03, Ideas: 0.03 };
const curated = new Set(CURATED.map((p) => p.answer));
const all: Puzzle[] = [];
const candidates = [...nounIndex.keys()].filter((w) => !curated.has(w)).sort();
for (const w of candidates) {
  const p = build(w);
  if (p) all.push(p);
}
console.log(`built ${all.length} candidates; keeping the best ${PER_DEPTH} per depth`);
const out: Puzzle[] = [];
for (const d of [1, 2, 3, 4, 5]) {
  const at = all.filter((p) => p.depth === d && (scoreOf.get(p.answer) ?? 0) > 2);
  at.sort((a, b) => scoreOf.get(b.answer)! - scoreOf.get(a.answer)!);
  const taken = new Map<string, number>();
  let kept = 0;
  for (const p of at) {
    if (kept >= PER_DEPTH) break;
    const n = taken.get(p.category) ?? 0;
    if (CAP[p.category] !== undefined && n >= CAP[p.category] * PER_DEPTH) continue;
    taken.set(p.category, n + 1);
    out.push(p);
    kept++;
  }
}
out.sort((a, b) => a.depth - b.depth || a.answer.localeCompare(b.answer));

const byDepth = [1, 2, 3, 4, 5].map((d) => out.filter((p) => p.depth === d).length);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
console.log(`generated ${out.length} puzzles → ${OUT}`);
console.log('by depth 1..5:', byDepth.join(' / '));
