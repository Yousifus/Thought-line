// Lays a piece's claims out as a left-to-right transit map with dagre: stations carry their flags, links carry the route to draw.
// Positions are in SVG user units; x and y of a station are its marker (the dot), and links start and end on the markers.
import dagre from '@dagrejs/dagre';
import type { Graph } from '@dagrejs/dagre';
import type { Analysis, Jump, Link, Station, Structure } from '../../core';

/** Size of the box dagre reserves per station: badges above the marker, the label below it. */
export const NODE_W = 136;
export const NODE_H = 116;
/** The marker sits this far below the top of its box. */
export const MARKER_TOP = 46;
const MARGIN = 16;
/** dagre positions the middle of a box; the marker is this far below it. */
const MARKER_DY = MARKER_TOP - NODE_H / 2;

export interface LaidOutStation { id: string; x: number; y: number; station: Station; isInterchange: boolean; isDeadEnd: boolean; inLoop: boolean; jump: Jump | null; noteCount: number }
export interface LaidOutLink { from: string; to: string; points: Array<{ x: number; y: number }>; required: boolean; intoJump: boolean; inLoop: boolean }
export interface LogicLayout { stations: LaidOutStation[]; links: LaidOutLink[]; width: number; height: number }

type Pt = { x: number; y: number };

export function layoutLogic(analysis: Analysis, structure: Structure, jumps: Jump[], noteCounts: Record<string, number>): LogicLayout {
  if (analysis.stations.length === 0) return { stations: [], links: [], width: 0, height: 0 };

  const ids = new Set(analysis.stations.map(s => s.id));
  // A link to a station that does not exist cannot be drawn; the analysis step is meant to prevent it, but a bad one must not break the page.
  const links = analysis.links.filter(l => ids.has(l.from) && ids.has(l.to));

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 14, ranksep: 44, edgesep: 14, marginx: MARGIN, marginy: MARGIN });
  g.setDefaultEdgeLabel(() => ({}));
  for (const s of analysis.stations) g.setNode(s.id, { width: NODE_W, height: NODE_H });
  // A station that supports itself is drawn by hand; dagre would only reserve room for it.
  for (const l of links) if (l.from !== l.to) g.setEdge(l.from, l.to);
  dagre.layout(g);

  const marker = (id: string): Pt => { const n = g.node(id); return { x: n.x, y: n.y + MARKER_DY }; };

  const interchanges = new Set(structure.interchanges);
  const deadEnds = new Set(structure.deadEnds);
  const loopOf = new Map<string, number>();
  structure.loops.forEach((members, i) => members.forEach(id => loopOf.set(id, i)));
  const jumpAt = new Map(jumps.map(j => [j.stationId, j]));

  const stations: LaidOutStation[] = analysis.stations.map(station => {
    const p = marker(station.id);
    return {
      id: station.id,
      x: p.x,
      y: p.y,
      station,
      isInterchange: interchanges.has(station.id),
      isDeadEnd: deadEnds.has(station.id),
      inLoop: loopOf.has(station.id),
      jump: jumpAt.get(station.id) ?? null,
      noteCount: noteCounts[station.id] ?? 0,
    };
  });

  const laidLinks: LaidOutLink[] = links.map((l: Link) => ({
    from: l.from,
    to: l.to,
    points: routeOf(g, l, marker),
    required: l.required,
    intoJump: jumpAt.has(l.to),
    inLoop: loopOf.has(l.from) && loopOf.get(l.from) === loopOf.get(l.to),
  }));

  const graph = g.graph();
  return { stations, links: laidLinks, width: Math.ceil(graph.width ?? 0), height: Math.ceil(graph.height ?? 0) };
}

/** Marker to marker, through the bends dagre chose for links that skip a rank. */
function routeOf(g: Graph, l: Link, marker: (id: string) => Pt): Pt[] {
  const from = marker(l.from);
  const to = marker(l.to);
  if (l.from === l.to) return [from, to];
  const bends = (g.edge(l.from, l.to)?.points ?? []) as Pt[];
  // dagre's own first and last points sit on the box edges; the markers replace them. The rest are shifted like the markers.
  const inner = bends.slice(1, -1).map(p => ({ x: p.x, y: p.y + MARKER_DY }));
  return [from, ...inner, to];
}

/** Breaks a claim into at most `maxLines` lines of about `maxChars` characters; the last line ends in an ellipsis when text was dropped. */
export function wrapLabel(claim: string, maxChars = 18, maxLines = 3): string[] {
  const words = claim.trim().split(/\s+/).filter(Boolean).flatMap(w => {
    const chars = Array.from(w);
    const parts: string[] = [];
    for (let i = 0; i < chars.length; i += maxChars) parts.push(chars.slice(i, i + maxChars).join(''));
    return parts;
  });
  const lines: string[] = [];
  let current = '';
  let used = 0;
  for (; used < words.length; used++) {
    const w = words[used];
    const joined = current === '' ? w : `${current} ${w}`;
    if (Array.from(joined).length <= maxChars) { current = joined; continue; }
    lines.push(current);
    current = w;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current !== '') { lines.push(current); used = words.length; }
  if (used < words.length) {
    const last = Array.from(lines[maxLines - 1]);
    lines[maxLines - 1] = (last.length >= maxChars ? last.slice(0, maxChars - 1) : last).join('') + '…';
  }
  return lines.slice(0, maxLines);
}
