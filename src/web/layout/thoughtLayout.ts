// Turns a piece's image mentions into the Thought path: one node per image (in order of first appearance), the steps between them, and where the piece ends.
import type { MotifMention } from '../../core';

export interface ThoughtNode { motif: string; label: string; index: number; mentions: number }
export interface ThoughtStep { from: string; to: string; kind: 'forward' | 'return' }

export function layoutThought(motifs: MotifMention[]): { nodes: ThoughtNode[]; steps: ThoughtStep[]; endMotif: string | null } {
  const ordered = [...motifs].sort((a, b) => a.order - b.order);
  const nodes: ThoughtNode[] = [];
  const byMotif = new Map<string, ThoughtNode>();
  const steps: ThoughtStep[] = [];
  let previous: string | null = null;

  for (const m of ordered) {
    let node = byMotif.get(m.motif);
    const seen = node !== undefined;
    if (!node) {
      node = { motif: m.motif, label: m.label, index: nodes.length, mentions: 0 };
      byMotif.set(m.motif, node);
      nodes.push(node);
    }
    node.mentions++;
    // Dwelling on the same image is not a move.
    if (previous !== null && previous !== m.motif) {
      steps.push({ from: previous, to: m.motif, kind: seen ? 'return' : 'forward' });
    }
    previous = m.motif;
  }
  return { nodes, steps, endMotif: previous };
}
