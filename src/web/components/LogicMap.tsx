// The Logic map: claims drawn as stations on a transit map, supports as lines, with honest flags for where certainty jumps,
// dead ends, loops and passages the model could not find. Every flag has a shape or dash as well as a colour.
import { useId, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { deriveStructure, findPassage, textDirection } from '../../core';
import type { PieceView, Range } from '../../core';
import { MARKER_TOP, NODE_H, NODE_W, layoutLogic, wrapLabel } from '../layout/logicLayout';
import type { LaidOutLink, LaidOutStation } from '../layout/logicLayout';

/** The map is never drawn smaller than this fraction of its natural size; a wider map scrolls inside the pane instead. */
const MIN_SCALE = 0.75;
const LINE_HEIGHT = 16;
const LABEL_BASELINE = 30;
const BADGE_Y = -42;
const BADGE_H = 20;
const CHAR_W = 7;
const NOT_FOUND = 'Not found in the text';

type Pt = { x: number; y: number };

export function LogicMap({ view, noteCounts, onSelectRange }: {
  view: PieceView;
  noteCounts: Record<string, number>;
  /** Called with the station's passage located in the analysed text, or null when it is not there. */
  onSelectRange(r: Range | null): void;
}) {
  const version = view.version;
  const analysis = version?.analysis;
  const structure = view.structure;
  const jumps = view.jumps;
  const layout = useMemo(
    () => (analysis ? layoutLogic(analysis, structure ?? deriveStructure(analysis), jumps, noteCounts) : null),
    [analysis, structure, jumps, noteCounts],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const markerId = useId();

  if (!version || !layout) return <p className="placeholder">Not analysed yet. Use Save and analyse.</p>;
  if (layout.stations.length === 0) return <p className="placeholder">The model found no claims in this piece.</p>;

  const roleOf = new Map(layout.stations.map(s => [s.id, s.station.role]));
  const activate = (s: LaidOutStation) => {
    setSelectedId(s.id);
    onSelectRange(findPassage(version.text, s.station.passage));
  };

  return (
    <div className="logic-map">
      <div className="map-scroll">
        <svg
          className="logic-svg"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          style={{ maxWidth: layout.width, minWidth: Math.round(layout.width * MIN_SCALE) }}
          role="group"
          aria-label={`Logic map: ${layout.stations.length} ${layout.stations.length === 1 ? 'claim' : 'claims'}`}
        >
          <defs>
            <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M1 1 L9 5 L1 9 z" className="arrow" />
            </marker>
          </defs>
          <g>
            {layout.links.map((l, i) => (
              <path
                key={`${l.from}>${l.to}#${i}`}
                className={linkClass(l, roleOf.get(l.from))}
                d={linkPath(l)}
                markerEnd={l.inLoop ? `url(#${markerId})` : undefined}
              />
            ))}
          </g>
          <g>
            {layout.stations.map(s => (
              <Station key={s.id} s={s} selected={selectedId === s.id} onActivate={() => activate(s)} />
            ))}
          </g>
        </svg>
      </div>
      <Key />
    </div>
  );
}

function Station({ s, selected, onActivate }: { s: LaidOutStation; selected: boolean; onActivate(): void }) {
  const { station } = s;
  const dir = textDirection(station.claim);
  const lines = wrapLabel(station.claim);
  const unanchored = station.unanchored === true;
  const outer = s.isInterchange ? 15 : 9;
  const bar = station.role === 'conclusion' ? -1 : 1; // the end bar sits on the side where the line stops
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(); }
  };

  const badges: Array<{ text: string; kind: 'jump' | 'notes' }> = [];
  if (s.jump) badges.push({ text: `+${s.jump.excess.toFixed(2)} over`, kind: 'jump' });
  if (s.noteCount > 0) badges.push({ text: `${s.noteCount} ${s.noteCount === 1 ? 'note' : 'notes'}`, kind: 'notes' });
  const widths = badges.map(b => b.text.length * CHAR_W + 14);
  const rowWidth = widths.reduce((a, b) => a + b, 0) + 6 * Math.max(0, badges.length - 1);
  const badgeX = (i: number) => -rowWidth / 2 + widths.slice(0, i).reduce((a, b) => a + b + 6, 0);

  return (
    <g
      className={`station role-${station.role}${selected ? ' selected' : ''}`}
      transform={`translate(${s.x} ${s.y})`}
      role="button"
      tabIndex={0}
      aria-label={ariaLabelOf(s)}
      aria-pressed={selected}
      onClick={onActivate}
      onKeyDown={onKeyDown}
    >
      <title>{station.claim}</title>
      <rect className="hit" x={-NODE_W / 2} y={-MARKER_TOP} width={NODE_W} height={NODE_H} rx={10} />
      {unanchored ? (
        <circle className="ring-unanchored" r={outer + 6}><title>{NOT_FOUND}</title></circle>
      ) : null}
      {s.isInterchange ? <circle className="ring-outer" r={15} /> : null}
      <circle className={s.isDeadEnd ? 'dot hollow' : 'dot'} r={9} />
      {s.isDeadEnd ? <line className="end-bar" x1={bar * (outer + 9)} x2={bar * (outer + 9)} y1={-13} y2={13} /> : null}
      {badges.map((b, i) => (
        <g key={b.kind} className={`badge badge-${b.kind}`} transform={`translate(${badgeX(i)} ${BADGE_Y})`}>
          <rect width={widths[i]} height={BADGE_H} rx={BADGE_H / 2} />
          <text x={widths[i] / 2} y={14} textAnchor="middle">{b.text}</text>
        </g>
      ))}
      <text className="label" y={LABEL_BASELINE} direction={dir} textAnchor="start">
        {lines.map((line, i) => (
          // In SVG, "start" follows the text direction, so a right-to-left label starts at, and grows leftwards from, the right edge of its box.
          <tspan key={i} x={dir === 'rtl' ? NODE_W / 2 - 4 : -NODE_W / 2 + 4} dy={i === 0 ? 0 : LINE_HEIGHT}>{line}</tspan>
        ))}
      </text>
    </g>
  );
}

const ROLE_NAME = { premise: 'Premise', step: 'Step', conclusion: 'Conclusion' } as const;

function ariaLabelOf(s: LaidOutStation): string {
  const parts = [`${s.station.claim}.`, `${ROLE_NAME[s.station.role]}.`];
  if (s.isInterchange) parts.push('Interchange.');
  if (s.jump) parts.push(`Stated more surely than its support allows, ${s.jump.excess.toFixed(2)} over.`);
  if (s.isDeadEnd) parts.push('Dead end.');
  if (s.inLoop) parts.push('In a loop.');
  if (s.station.unanchored) parts.push(`${NOT_FOUND}.`);
  if (s.noteCount > 0) parts.push(`${s.noteCount} ${s.noteCount === 1 ? 'note' : 'notes'}.`);
  return parts.join(' ');
}

function linkClass(l: LaidOutLink, role: string | undefined): string {
  return ['link', l.required ? 'required' : 'optional', l.intoJump ? 'into-jump' : '', l.inLoop ? 'in-loop' : '', role ? `role-${role}` : '']
    .filter(Boolean)
    .join(' ');
}

const f = (n: number) => Math.round(n * 10) / 10;

function linkPath(l: LaidOutLink): string {
  const pts = l.points;
  const a = pts[0];
  const b = pts[pts.length - 1];
  if (l.from === l.to) {
    // A claim that supports itself: a small loop over the marker, ending short of it for the arrowhead.
    return `M${f(a.x - 7)} ${f(a.y - 12)} C${f(a.x - 34)} ${f(a.y - 58)} ${f(a.x + 34)} ${f(a.y - 58)} ${f(a.x + 7)} ${f(a.y - 15)}`;
  }
  if (l.inLoop) return arcPath(a, b);
  if (pts.length > 2) return `M${f(a.x)} ${f(a.y)}` + pts.slice(1).map(p => ` L${f(p.x)} ${f(p.y)}`).join('');
  if (Math.abs(a.y - b.y) < 0.5) return `M${f(a.x)} ${f(a.y)} L${f(b.x)} ${f(b.y)}`;
  const mid = (a.x + b.x) / 2;
  return `M${f(a.x)} ${f(a.y)} C${f(mid)} ${f(a.y)} ${f(mid)} ${f(b.y)} ${f(b.x)} ${f(b.y)}`;
}

/** A point `d` units from `from` towards `to`. */
function towards(from: Pt, to: Pt, d: number): Pt {
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return { x: from.x + ((to.x - from.x) / len) * d, y: from.y + ((to.y - from.y) / len) * d };
}

/** A returning arc: bows to the right of its direction of travel, so a cycle of two links draws as a ring. Stops short of both markers; the arrowhead sits at the end. */
function arcPath(a: Pt, b: Pt): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bulge = Math.min(64, 26 + len * 0.25);
  const ctrl = { x: (a.x + b.x) / 2 - (dy / len) * bulge * 2, y: (a.y + b.y) / 2 + (dx / len) * bulge * 2 };
  const start = towards(a, ctrl, 12);
  const end = towards(b, ctrl, 17);
  return `M${f(start.x)} ${f(start.y)} Q${f(ctrl.x)} ${f(ctrl.y)} ${f(end.x)} ${f(end.y)}`;
}

function Key() {
  return (
    <details className="map-key">
      <summary>How to read the map</summary>
      <ul>
        <li>Each station is a claim. A thick line is a required support; a thin line is an optional one.</li>
        <li>A double ring is an interchange, where several lines meet.</li>
        <li>A hollow station with a bar is a dead end: a claim that leads nowhere, or a conclusion nothing supports.</li>
        <li>A dashed line with a badge enters a claim stated more surely than its supports allow.</li>
        <li>A line that curves back is a loop.</li>
        <li>A dotted ring means the passage was not found in the text.</li>
      </ul>
    </details>
  );
}
