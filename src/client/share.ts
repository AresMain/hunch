// Shareable stats card: a 1080×1350 PNG (fits stories, feeds and DMs) drawn
// on a canvas in the game's neon-punk style, plus a plain-text version.
// Sharing uses the system share sheet when it accepts files; otherwise the
// image downloads and the text is copied.

import type { FinalRow, PublicView, RoundTrail } from '../shared/types';
import { DEPTH_NAMES, type Depth } from '../shared/types';

export interface CardData {
  name: string;
  placeLabel: string;
  place: number | null;
  loser: boolean;
  rank: number;
  crewSize: number;
  total: number;
  target: number;
  cracked: number;
  played: number;
  blind: number;
  fastestMs: number | null;
  deepest: Depth | null;
  hardestWord: string | null;
  history: number[];
}

const ORDINAL = ['', '1ST', '2ND', '3RD'];
export const placeLabel = (row: Pick<FinalRow, 'place' | 'loser' | 'rank'>) =>
  row.place && row.place <= 3 ? ORDINAL[row.place] : row.loser ? 'LOSER' : `#${row.rank}`;

export function cardData(pub: PublicView, playerId: string, name: string): CardData | null {
  const row = pub.final?.find((r) => r.playerId === playerId);
  if (!row) return null;
  const rounds = (pub.trails ?? []).map((t) => ({ t, me: t.players.find((p) => p.id === playerId) }))
    .filter((x): x is { t: RoundTrail; me: RoundTrail['players'][number] } => !!x.me && x.me.played);
  const solved = rounds.filter((x) => x.me.solved);
  const timed = solved.filter((x) => !x.me.blindHunch && x.me.solveMs !== null).map((x) => x.me.solveMs!);
  const hardest = [...solved].sort((a, b) => b.t.depth - a.t.depth || b.t.round - a.t.round)[0];
  return {
    name,
    placeLabel: placeLabel(row),
    place: row.place,
    loser: row.loser,
    rank: row.rank,
    crewSize: pub.final!.length,
    total: row.total,
    target: pub.targetScore,
    cracked: solved.length,
    played: rounds.length,
    blind: solved.filter((x) => x.me.blindHunch).length,
    fastestMs: timed.length ? Math.min(...timed) : null,
    deepest: rounds.length ? (Math.max(...rounds.map((x) => x.t.depth)) as Depth) : null,
    hardestWord: hardest?.t.answer ?? null,
    history: rounds.map((x) => x.me.total),
  };
}

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function cardText(d: CardData, url: string): string {
  const medal = d.place === 1 ? '🥇' : d.place === 2 ? '🥈' : d.place === 3 ? '🥉' : d.loser ? '💀' : '🎯';
  const head = d.loser ? `${medal} LOSER` : `${medal} ${d.placeLabel.toLowerCase()} of ${d.crewSize}`;
  const bits = [
    `✅ ${d.cracked}/${d.played} cracked`,
    d.fastestMs !== null ? `⚡ fastest ${fmtTime(d.fastestMs)}` : null,
    d.blind ? `🎯 ${d.blind} blind hunch${d.blind > 1 ? 'es' : ''}` : null,
    d.deepest ? `🕳 reached ${DEPTH_NAMES[d.deepest]}` : null,
  ].filter(Boolean);
  return `HUNCH ${head} · ${d.total.toLocaleString()} pts (race to ${d.target.toLocaleString()})\n${bits.join(' · ')}\nThink you can crack it? ${url}`;
}

// ------------------------------------------------------------------ drawing

const PINK = '#ff2d95';
const CYAN = '#19f0ff';
const ACID = '#c6ff3d';
const RED = '#ff3b5c';
const PAPER = '#eeedf5';
const MUTED = '#9b98ad';

function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function glowText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, blur = 30) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** RGB-split headline: cyan and pink ghosts offset behind the main fill. */
function splitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = CYAN;
  ctx.fillText(text, x - 9, y);
  ctx.fillStyle = PINK;
  ctx.fillText(text, x + 9, y);
  ctx.restore();
  glowText(ctx, text, x, y, color, 40);
}

export async function renderCard(d: CardData): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  try {
    await Promise.all([
      document.fonts.load('120px "Permanent Marker"'),
      document.fonts.load('120px "Bebas Neue"'),
      document.fonts.load('700 40px "JetBrains Mono"'),
    ]);
  } catch {
    /* fall back to system fonts */
  }
  const r = rng(d.total + d.name.length * 97 + 7);

  // backdrop
  const bg = ctx.createRadialGradient(W / 2, H * 0.6, 50, W / 2, H * 0.6, H);
  bg.addColorStop(0, '#0c1a1d');
  bg.addColorStop(0.6, '#06080c');
  bg.addColorStop(1, '#020203');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  for (const [x, y, rad, col] of [[200, 260, 520, 'rgba(25,240,255,0.16)'], [920, 120, 480, 'rgba(168,85,255,0.18)'], [540, 1400, 760, 'rgba(255,45,149,0.3)']] as const) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // rain
  ctx.lineCap = 'round';
  for (let i = 0; i < 160; i++) {
    const x = r() * W * 1.2 - 100;
    const y = r() * H;
    const len = 20 + r() * 50;
    ctx.strokeStyle = `rgba(${['255,45,149', '25,240,255', '238,237,245'][i % 3]},${0.08 + r() * 0.25})`;
    ctx.lineWidth = r() > 0.85 ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len * 0.18, y + len);
    ctx.stroke();
  }
  // skyline
  let x = 0;
  while (x < W) {
    const w = 50 + r() * 110;
    const h = 120 + r() * 260;
    ctx.fillStyle = '#05070a';
    ctx.fillRect(x, H - h, w, h);
    for (let wy = H - h + 20; wy < H - 20; wy += 28) {
      for (let wx = x + 10; wx < x + w - 14; wx += 20) {
        if (r() > 0.7) {
          ctx.fillStyle = r() > 0.5 ? 'rgba(255,124,193,0.55)' : 'rgba(25,240,255,0.35)';
          ctx.fillRect(wx, wy, 8, 12);
        }
      }
    }
    x += w + r() * 10;
  }
  // frame with misregistered shadow
  ctx.strokeStyle = CYAN;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 4;
  ctx.strokeRect(46, 46, W - 80, H - 80);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = PINK;
  ctx.strokeRect(36, 36, W - 80, H - 80);

  // wordmark
  ctx.textBaseline = 'alphabetic';
  ctx.save();
  ctx.translate(90, 190);
  ctx.rotate(-0.07);
  ctx.font = '130px "Permanent Marker", cursive';
  glowText(ctx, 'HUNCH', 0, 0, PINK, 35);
  ctx.restore();
  ctx.font = '700 26px "JetBrains Mono", monospace';
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'right';
  ctx.fillText(`RACE TO ${d.target.toLocaleString()}`, W - 90, 120);
  ctx.fillText(new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase(), W - 90, 160);

  // place
  ctx.textAlign = 'center';
  if (d.loser) {
    ctx.save();
    ctx.translate(W / 2, 470);
    ctx.rotate(-0.12);
    ctx.font = '230px "Permanent Marker", cursive';
    ctx.strokeStyle = RED;
    ctx.lineWidth = 10;
    ctx.strokeRect(-430, -200, 860, 250);
    splitText(ctx, 'LOSER', 0, 10, RED);
    ctx.restore();
  } else {
    ctx.font = '380px "Bebas Neue", Impact, sans-serif';
    splitText(ctx, d.placeLabel, W / 2, 560, d.place === 1 ? ACID : d.place ? CYAN : PAPER);
  }

  // name + total
  ctx.font = '120px "Bebas Neue", Impact, sans-serif';
  ctx.fillStyle = PAPER;
  ctx.fillText(d.name.toUpperCase(), W / 2, 700);
  ctx.font = '700 40px "JetBrains Mono", monospace';
  glowText(ctx, `${d.total.toLocaleString()} PTS`, W / 2, 770, PINK, 18);
  ctx.fillStyle = MUTED;
  ctx.font = '700 26px "JetBrains Mono", monospace';
  ctx.fillText(d.loser ? `${ordinalWord(d.rank)} of ${d.crewSize} · never broke ${d.target.toLocaleString()}` : `of ${d.crewSize} legends`, W / 2, 815);

  // stat grid
  const stats: [string, string][] = [
    ['CRACKED', `${d.cracked}/${d.played}`],
    ['FASTEST', d.fastestMs !== null ? fmtTime(d.fastestMs) : '—'],
    ['BLIND HUNCHES', String(d.blind)],
    ['DEEPEST', d.deepest ? DEPTH_NAMES[d.deepest].toUpperCase() : '—'],
  ];
  stats.forEach(([k, v], i) => {
    const cx = i % 2 === 0 ? 300 : 780;
    const cy = 870 + Math.floor(i / 2) * 124;
    ctx.fillStyle = 'rgba(7,8,14,0.85)';
    ctx.fillRect(cx - 220, cy - 10, 440, 110);
    ctx.strokeStyle = 'rgba(255,45,149,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 220, cy - 10, 440, 110);
    ctx.fillStyle = MUTED;
    ctx.font = '700 22px "JetBrains Mono", monospace';
    ctx.fillText(k, cx, cy + 24);
    ctx.font = '62px "Bebas Neue", Impact, sans-serif';
    ctx.fillStyle = i === 0 ? CYAN : PAPER;
    ctx.fillText(v, cx, cy + 88);
  });

  // round history bars
  const bars = d.history.slice(-16);
  if (bars.length) {
    const max = Math.max(1, ...bars);
    const bw = 34;
    const gap = 10;
    const startX = W / 2 - (bars.length * (bw + gap) - gap) / 2;
    bars.forEach((v, i) => {
      const h = 6 + (v / max) * 52;
      ctx.fillStyle = v > 0 ? PINK : '#2a2633';
      ctx.shadowColor = PINK;
      ctx.shadowBlur = v > 0 ? 12 : 0;
      ctx.fillRect(startX + i * (bw + gap), 1250 - h, bw, h);
    });
    ctx.shadowBlur = 0;
  }

  // footer
  ctx.font = '34px "Permanent Marker", cursive';
  if (d.hardestWord) glowText(ctx, `hardest crack: ${d.hardestWord}`, W / 2, 1150, ACID, 14);
  ctx.textAlign = 'center';
  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillStyle = MUTED;
  ctx.fillText('CAN YOU CRACK IT?', W / 2, 1294);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Card render failed'))), 'image/png'));
}

function ordinalWord(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** Opens the share sheet with the image; falls back to download + copied text. */
export async function shareCard(blob: Blob, text: string, filename: string): Promise<'shared' | 'saved' | 'cancelled'> {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text, title: 'HUNCH' });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard blocked */
  }
  return 'saved';
}
