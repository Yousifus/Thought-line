// The certainty rule: how sure a claim is allowed to sound given what supports it, and where it sounds surer than that.
import type { Analysis, Grounding } from './analysis';
import { deriveStructure } from './structure';

/** How far above its support a station may be stated before it counts as a jump. */
export const JUMP_LIMIT = 0.15;

/** Support for a station nothing builds on, by how the claim is grounded. */
export const GROUNDING_SUPPORT: Record<Grounding, number> = { evidence: 0.8, example: 0.6, assertion: 0.4 };

export interface Jump { stationId: string; expressed: number; support: number; excess: number }

type Input = Pick<Analysis, 'stations' | 'links'>;

const EPSILON = 1e-9;
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const round2 = (x: number) => Math.round(x * 100) / 100;

interface Support {
  support: Map<string, number>;
  allowed: Map<string, number>;
}

function compute(a: Input): Support {
  const byStation = new Map(a.stations.map(s => [s.id, s]));

  // Stations sharing a loop: links between them are ignored so cycles terminate.
  const loopOf = new Map<string, number>();
  deriveStructure(a).loops.forEach((comp, i) => comp.forEach(id => loopOf.set(id, i)));

  // Distinct links between known stations, outside any loop, as incoming lists.
  const seen = new Set<string>();
  const incoming = new Map<string, { from: string; required: boolean }[]>();
  const pending = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const id of byStation.keys()) { incoming.set(id, []); pending.set(id, 0); outgoing.set(id, []); }
  for (const l of a.links) {
    if (!byStation.has(l.from) || !byStation.has(l.to)) continue;
    const key = JSON.stringify([l.from, l.to]);
    if (seen.has(key)) continue;
    seen.add(key);
    const lf = loopOf.get(l.from);
    if (lf !== undefined && lf === loopOf.get(l.to)) continue;
    incoming.get(l.to)!.push({ from: l.from, required: l.required });
    outgoing.get(l.from)!.push(l.to);
    pending.set(l.to, pending.get(l.to)! + 1);
  }

  // Topological order (Kahn): what remains is acyclic, because every cycle lies inside a loop.
  const support = new Map<string, number>();
  const allowed = new Map<string, number>();
  const credited = new Map<string, number>();
  const queue = [...byStation.keys()].filter(id => pending.get(id) === 0).sort(byId);
  while (queue.length) {
    const id = queue.shift()!;
    const s = byStation.get(id)!;
    const ins = incoming.get(id)!;
    let value: number;
    if (ins.length === 0) {
      value = GROUNDING_SUPPORT[s.grounding];
    } else {
      const required = ins.filter(i => i.required).map(i => credited.get(i.from)!);
      value = required.length > 0
        ? Math.min(...required)
        : Math.max(...ins.map(i => credited.get(i.from)!));
    }
    const limit = value + JUMP_LIMIT;
    support.set(id, value);
    allowed.set(id, limit);
    credited.set(id, Math.min(s.expressed, limit));
    for (const next of outgoing.get(id)!) {
      pending.set(next, pending.get(next)! - 1);
      if (pending.get(next) === 0) queue.push(next);
    }
  }
  return { support, allowed };
}

/** Support per station id: the certainty its inputs (or, for a root, its grounding) back. */
export function supportOf(a: Input): Map<string, number> {
  return compute(a).support;
}

/** Stations stated more surely than their support allows, sorted by station id. */
export function findJumps(a: Input): Jump[] {
  const { support, allowed } = compute(a);
  const jumps: Jump[] = [];
  for (const s of a.stations) {
    const limit = allowed.get(s.id)!;
    if (s.expressed - limit > EPSILON) {
      jumps.push({ stationId: s.id, expressed: s.expressed, support: support.get(s.id)!, excess: round2(s.expressed - limit) });
    }
  }
  return jumps.sort((x, y) => byId(x.stationId, y.stationId));
}
