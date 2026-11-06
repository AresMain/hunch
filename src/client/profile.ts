// The guest's career, kept in this browser (localStorage). No account needed.
// Signing in (when it exists) will sync this record to the cloud.

import { useSyncExternalStore } from 'react';
import type { PublicView } from '../shared/types';
import { cardData } from './share';

export interface MatchRecord {
  id: string;
  at: number;
  code: string;
  place: number | null;
  loser: boolean;
  rank: number;
  crew: number;
  total: number;
  target: number;
  cracked: number;
  played: number;
  blind: number;
  fastestMs: number | null;
}

export interface Profile {
  since: number;
  matches: MatchRecord[];
}

const KEY = 'hunch.profile';
const KEEP = 200;

function load(): Profile {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Profile | null;
    if (p && Array.isArray(p.matches)) return p;
  } catch {
    /* storage unavailable or corrupt */
  }
  return { since: Date.now(), matches: [] };
}

let profile = load();
const subs = new Set<() => void>();

function save(next: Profile): void {
  profile = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: the record lives for this session only */
  }
  for (const s of subs) s();
}

export function useProfile(): Profile {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    () => profile,
  );
}

/** Records a finished match once (safe to call on every render of the final screen). */
export function recordMatch(pub: PublicView, playerId: string): void {
  const d = cardData(pub, playerId, '');
  if (!d || !pub.final) return;
  const id = `${pub.code}:${pub.trails?.length ?? 0}:${pub.final.map((f) => f.total).join(',')}`;
  if (profile.matches.some((m) => m.id === id)) return;
  const rec: MatchRecord = {
    id,
    at: Date.now(),
    code: pub.code,
    place: d.place,
    loser: d.loser,
    rank: d.rank,
    crew: d.crewSize,
    total: d.total,
    target: d.target,
    cracked: d.cracked,
    played: d.played,
    blind: d.blind,
    fastestMs: d.fastestMs,
  };
  save({ ...profile, matches: [rec, ...profile.matches].slice(0, KEEP) });
}

export function summarize(p: Profile) {
  const m = p.matches;
  const played = m.reduce((a, r) => a + r.played, 0);
  const cracked = m.reduce((a, r) => a + r.cracked, 0);
  const fastest = m.map((r) => r.fastestMs).filter((x): x is number => x !== null);
  return {
    matches: m.length,
    wins: m.filter((r) => r.place === 1).length,
    podiums: m.filter((r) => r.place !== null && r.place <= 3).length,
    losses: m.filter((r) => r.loser).length,
    best: m.reduce((a, r) => Math.max(a, r.total), 0),
    crackRate: played ? Math.round((cracked / played) * 100) : 0,
    blind: m.reduce((a, r) => a + r.blind, 0),
    fastestMs: fastest.length ? Math.min(...fastest) : null,
  };
}
