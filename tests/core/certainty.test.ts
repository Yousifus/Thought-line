// Tests the certainty rule: support from grounding and inputs, and where a station is stated more surely than allowed.
import { findJumps, supportOf, JUMP_LIMIT, GROUNDING_SUPPORT } from '../../src/core/certainty';
import type { Grounding } from '../../src/core/analysis';

const st = (id: string, grounding: Grounding, expressed: number) => ({ id, claim: id, passage: id, role: 'step' as const, expressed, grounding });

test('the constants are the spec values', () => {
  expect(JUMP_LIMIT).toBe(0.15);
  expect(GROUNDING_SUPPORT).toEqual({ evidence: 0.8, example: 0.6, assertion: 0.4 });
});
test('an evidenced root may be stated up to 0.95', () => {
  expect(findJumps({ stations: [st('a','evidence',0.95)], links: [] })).toEqual([]);
});
test('a bare assertion stated at 0.9 is a jump of 0.35', () => {
  expect(findJumps({ stations: [st('a','assertion',0.9)], links: [] }))
    .toEqual([{ stationId: 'a', expressed: 0.9, support: 0.4, excess: 0.35 }]);
});
test('a step may sit exactly 0.15 above its input, not more', () => {
  const links = [{ from: 'a', to: 'b', required: true }];
  expect(findJumps({ stations: [st('a','evidence',0.7), st('b','assertion',0.85)], links })).toEqual([]);
  expect(findJumps({ stations: [st('a','evidence',0.7), st('b','assertion',0.86)], links })[0].excess).toBe(0.01);
});
test('required inputs cap at the weakest; optional inputs take the strongest', () => {
  const stations = [st('a','evidence',0.7), st('b','assertion',0.5), st('c','assertion',0.5)];
  expect(supportOf({ stations, links: [{from:'a',to:'c',required:true},{from:'b',to:'c',required:true}] }).get('c')).toBe(0.5);
  expect(supportOf({ stations, links: [{from:'a',to:'c',required:false},{from:'b',to:'c',required:false}] }).get('c')).toBe(0.7);
});
test('a loop does not hang and falls back to grounding', () => {
  const s = supportOf({ stations: [st('a','assertion',0.5), st('b','example',0.5)], links: [{from:'a',to:'b',required:true},{from:'b',to:'a',required:true}] });
  expect([s.get('a'), s.get('b')]).toEqual([0.4, 0.6]);
});
test('a station never passes on more than it claims, so inflation does not compound', () => {
  // a is only 0.5 sure; b claims 0.9. b's support is 0.5 (what a claims), not a's allowance.
  const links = [{ from: 'a', to: 'b', required: true }];
  const s = supportOf({ stations: [st('a','evidence',0.5), st('b','assertion',0.9)], links });
  expect(s.get('b')).toBe(0.5);
});
test('a station never passes on more than it is allowed, so a jump is not laundered downstream', () => {
  // a is a bare assertion stated at 0.9 (allowed 0.55); c builds on b which builds on a.
  const links = [{ from: 'a', to: 'b', required: true }, { from: 'b', to: 'c', required: true }];
  const stations = [st('a','assertion',0.9), st('b','assertion',0.9), st('c','assertion',0.9)];
  const s = supportOf({ stations, links });
  expect(s.get('b')).toBe(0.55);
  expect(s.get('c')).toBeCloseTo(0.7, 9);
  expect(findJumps({ stations, links }).map(j => j.stationId)).toEqual(['a', 'b', 'c']);
});
test('a link inside a loop is ignored, but a link into the loop from outside still counts', () => {
  const stations = [st('r','evidence',0.5), st('a','assertion',0.9), st('b','assertion',0.9)];
  const links = [{from:'r',to:'a',required:true},{from:'a',to:'b',required:true},{from:'b',to:'a',required:true}];
  const s = supportOf({ stations, links });
  expect(s.get('a')).toBe(0.5);   // supported from r
  expect(s.get('b')).toBe(0.4);   // only an in-loop input, so grounding
});
test('a self-link is ignored for support', () => {
  const s = supportOf({ stations: [st('a','example',0.5)], links: [{from:'a',to:'a',required:true}] });
  expect(s.get('a')).toBe(0.6);
});
test('dangling and duplicate links cannot crash or skew support', () => {
  const stations = [st('a','evidence',0.7), st('b','assertion',0.5)];
  const links = [{from:'a',to:'b',required:true},{from:'a',to:'b',required:true},{from:'ghost',to:'b',required:true},{from:'a',to:'ghost',required:true}];
  expect(supportOf({ stations, links }).get('b')).toBe(0.7);
  expect(supportOf({ stations, links }).has('ghost')).toBe(false);
});
test('jumps come back sorted by station id', () => {
  const j = findJumps({ stations: [st('z','assertion',0.9), st('m','assertion',0.9), st('a','assertion',0.9)], links: [] });
  expect(j.map(x => x.stationId)).toEqual(['a', 'm', 'z']);
});
