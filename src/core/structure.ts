// Derives the argument's structural flags (interchanges, loops, dead ends) from stations and links.
import type { Analysis } from './analysis';

export interface Structure {
  interchanges: string[];
  loops: string[][];
  deadEnds: string[];
}

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function deriveStructure(a: Pick<Analysis, 'stations' | 'links'>): Structure {
  const ids = new Set(a.stations.map(s => s.id));
  // Distinct edges between known stations only.
  const seen = new Set<string>();
  const out = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  for (const id of ids) { out.set(id, []); incoming.set(id, 0); }
  for (const l of a.links) {
    if (!ids.has(l.from) || !ids.has(l.to)) continue;
    const key = JSON.stringify([l.from, l.to]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.get(l.from)!.push(l.to);
    incoming.set(l.to, incoming.get(l.to)! + 1);
  }

  const interchanges = [...ids].filter(id => incoming.get(id)! >= 2 || out.get(id)!.length >= 2).sort(byId);

  const deadEnds = a.stations
    .filter(s => (s.role === 'conclusion' ? incoming.get(s.id) === 0 : out.get(s.id)!.length === 0))
    .map(s => s.id)
    .sort(byId);

  // Tarjan's strongly connected components.
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const loops: string[][] = [];
  const visit = (v: string): void => {
    index.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    for (const w of out.get(v)!) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }
    if (low.get(v) === index.get(v)) {
      const comp: string[] = [];
      let w: string;
      do { w = stack.pop()!; onStack.delete(w); comp.push(w); } while (w !== v);
      if (comp.length >= 2 || out.get(v)!.includes(v)) loops.push(comp.sort(byId));
    }
  };
  for (const id of [...ids].sort(byId)) if (!index.has(id)) visit(id);
  loops.sort((x, y) => byId(x[0], y[0]));

  return { interchanges, loops, deadEnds };
}
