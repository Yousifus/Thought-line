// The Thought path: the images a piece moves through, as stops along one line. Forward steps run along the line,
// returns to an image already visited curve back over it, and the image the piece ends on carries a terminus.
// Clicking an image selects the passage of its first mention. Every mark has a shape or a dash as well as a colour.
import { useId, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { findPassage, readingKey, textDirection } from '../../core';
import type { MotifMention, PieceView, Range } from '../../core';
import { layoutThought } from '../layout/thoughtLayout';
import type { ThoughtNode } from '../layout/thoughtLayout';

const SPACING = 96;
const MARGIN_X = 52;
const LINE_Y = 112;
const LABEL_Y = LINE_Y + 36;
const COUNT_Y = LINE_Y + 52;
const HEIGHT = LINE_Y + 66;
const LABEL_CHARS = 12;
const NOT_FOUND = 'Not found in the text';
const END_NOTE = 'Where the piece ends';

const xOf = (index: number) => MARGIN_X + index * SPACING;
const radiusOf = (mentions: number) => 8 + Math.min(mentions - 1, 4) * 1.5;
const f = (n: number) => Math.round(n * 10) / 10;

/** Cuts a long label to fit its slot; the full word stays in the accessible name and the tooltip. */
function shorten(label: string): string {
  const chars = Array.from(label);
  return chars.length <= LABEL_CHARS ? label : `${chars.slice(0, LABEL_CHARS - 1).join('')}…`;
}

/** An arc over the line from one image back to an earlier one. The wider the jump, the higher it rises. */
function arcPath(fromIndex: number, toIndex: number): string {
  const span = Math.abs(fromIndex - toIndex);
  const rise = Math.min(80, 20 + 16 * span);
  const dir = toIndex < fromIndex ? -1 : 1;
  const a = xOf(fromIndex) + dir * 6;
  const b = xOf(toIndex) - dir * 6;
  const top = LINE_Y - 12;
  return `M${f(a)} ${top} Q${f((a + b) / 2)} ${f(top - rise * 2)} ${f(b)} ${top}`;
}

export function ThoughtPath({ view, onSelectRange }: {
  view: PieceView;
  /** Called with the first mention's passage located in the analysed text, or null when it is not there. */
  onSelectRange(r: Range | null): void;
}) {
  const version = view.version;
  const motifs = version?.analysis.motifs;
  const markerId = useId();
  // The selection belongs to one reading, so a re-read starts with nothing selected even under the same version id.
  const reading = version ? readingKey(version) : '';
  const [selection, setSelection] = useState<{ reading: string; motif: string } | null>(null);

  const laid = useMemo(() => (motifs ? layoutThought(motifs) : null), [motifs]);
  // The first mention of each image, in walking order: the passage a click goes to.
  const firstMention = useMemo(() => {
    const first = new Map<string, MotifMention>();
    for (const m of [...(motifs ?? [])].sort((a, b) => a.order - b.order)) if (!first.has(m.motif)) first.set(m.motif, m);
    return first;
  }, [motifs]);

  if (!version || !laid) return <p className="placeholder">Not analysed yet. Use Save and analyse.</p>;
  if (laid.nodes.length === 0) return <p className="placeholder">The model found no images in this piece.</p>;

  const selectedMotif = selection?.reading === reading ? selection.motif : null;
  const rangeOf = (motif: string) => {
    const m = firstMention.get(motif);
    return m && m.unanchored !== true ? findPassage(version.text, m.passage) : null;
  };
  const indexOf = new Map(laid.nodes.map(n => [n.motif, n.index]));
  const returns = laid.steps.filter(s => s.kind === 'return');
  const last = laid.nodes.length - 1;
  const width = xOf(last) + MARGIN_X;

  return (
    <div className="thought-map">
      <div className="map-scroll">
        <svg
          className="thought-svg"
          viewBox={`0 0 ${width} ${HEIGHT}`}
          style={{ maxWidth: width, minWidth: Math.round(width * 0.75) }}
          role="group"
          aria-label={`Thought path: ${laid.nodes.length} ${laid.nodes.length === 1 ? 'image' : 'images'}`}
        >
          <defs>
            <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M1 1 L9 5 L1 9 z" className="arrow" />
            </marker>
          </defs>
          {last > 0 ? <line className="forward-line" x1={xOf(0)} x2={xOf(last)} y1={LINE_Y} y2={LINE_Y} /> : null}
          {returns.map((s, i) => (
            <path key={`${s.from}>${s.to}#${i}`} className="return-arc" d={arcPath(indexOf.get(s.from)!, indexOf.get(s.to)!)} markerEnd={`url(#${markerId})`} />
          ))}
          {laid.nodes.map(n => (
            <Stop
              key={n.motif}
              node={n}
              first={firstMention.get(n.motif)!}
              isEnd={n.motif === laid.endMotif}
              unanchored={rangeOf(n.motif) === null}
              selected={selectedMotif === n.motif}
              onActivate={() => { setSelection({ reading, motif: n.motif }); onSelectRange(rangeOf(n.motif)); }}
            />
          ))}
        </svg>
      </div>
      <Key />
    </div>
  );
}

function Stop({ node, first, isEnd, unanchored, selected, onActivate }: {
  node: ThoughtNode;
  first: MotifMention;
  isEnd: boolean;
  unanchored: boolean;
  selected: boolean;
  onActivate(): void;
}) {
  const x = xOf(node.index);
  const r = radiusOf(node.mentions);
  const dir = textDirection(node.label);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(); }
  };
  const parts = [`${node.label}.`, `${node.mentions} ${node.mentions === 1 ? 'mention' : 'mentions'}.`];
  if (isEnd) parts.push(`${END_NOTE}.`);
  if (unanchored) parts.push(`${NOT_FOUND}.`);

  return (
    <g
      className={`stop${selected ? ' selected' : ''}`}
      transform={`translate(${x} 0)`}
      role="button"
      tabIndex={0}
      aria-label={parts.join(' ')}
      aria-current={selected ? 'true' : undefined}
      onClick={onActivate}
      onKeyDown={onKeyDown}
    >
      <title>{`${node.label}: ${first.passage}`}</title>
      <rect className="hit" x={-SPACING / 2 + 4} y={LINE_Y - 30} width={SPACING - 8} height={HEIGHT - LINE_Y + 24} rx={10} />
      {unanchored ? <circle className="ring-unanchored" cx={0} cy={LINE_Y} r={r + 7}><title>{NOT_FOUND}</title></circle> : null}
      {isEnd ? (
        <g className="terminus">
          <circle className="ring-outer" cx={0} cy={LINE_Y} r={r + 5} />
          <line className="end-bar" x1={r + 13} x2={r + 13} y1={LINE_Y - 14} y2={LINE_Y + 14} />
        </g>
      ) : null}
      <circle className="dot" cx={0} cy={LINE_Y} r={r} />
      <text className="node-label" x={0} y={LABEL_Y} textAnchor="middle" direction={dir}>{shorten(node.label)}</text>
      {node.mentions > 1 ? <text className="node-count" x={0} y={COUNT_Y} textAnchor="middle">{`×${node.mentions}`}</text> : null}
    </g>
  );
}

function Key() {
  return (
    <details className="map-key">
      <summary>How to read the path</summary>
      <ul>
        <li>Each stop is an image the piece comes back to. A larger stop is mentioned more often.</li>
        <li>The line runs from the first image to the last, in the order they first appear.</li>
        <li>A curve over the line is a return to an image already visited.</li>
        <li>A double ring with a bar is where the piece ends.</li>
        <li>A dotted ring means the passage was not found in the text.</li>
      </ul>
    </details>
  );
}
