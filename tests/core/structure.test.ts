// Tests deriveStructure: interchanges, loops (strongly connected components) and dead ends.
import { deriveStructure } from '../../src/core/structure';
import type { Role } from '../../src/core/analysis';

const st = (id: string, role: Role = 'step') => ({ id, claim: id, passage: id, role, expressed: 0.5, grounding: 'assertion' as const });

test('a clean chain has no flags', () => {
  const s = deriveStructure({ stations: [st('a','premise'), st('b'), st('c','conclusion')], links: [{from:'a',to:'b',required:true},{from:'b',to:'c',required:true}] });
  expect(s).toEqual({ interchanges: [], loops: [], deadEnds: [] });
});
test('two supports into one claim make an interchange', () => {
  const s = deriveStructure({ stations: [st('a','premise'), st('b','premise'), st('c','conclusion')], links: [{from:'a',to:'c',required:true},{from:'b',to:'c',required:false}] });
  expect(s.interchanges).toEqual(['c']);
});
test('circular support is a loop', () => {
  const s = deriveStructure({ stations: [st('a'), st('b'), st('c','conclusion')], links: [{from:'a',to:'b',required:true},{from:'b',to:'a',required:true},{from:'b',to:'c',required:true}] });
  expect(s.loops).toEqual([['a','b']]);
});
test('a premise nothing builds on, and an unsupported conclusion, are dead ends', () => {
  const s = deriveStructure({ stations: [st('a','premise'), st('z','conclusion')], links: [] });
  expect(s.deadEnds).toEqual(['a','z']);
});
test('a station linked to itself is a loop', () => {
  const s = deriveStructure({ stations: [st('a','premise'), st('b'), st('c','conclusion')], links: [{from:'a',to:'b',required:true},{from:'b',to:'b',required:true},{from:'b',to:'c',required:true}] });
  expect(s.loops).toEqual([['b']]);
});
test('a station with two outgoing links is an interchange', () => {
  const s = deriveStructure({ stations: [st('a','premise'), st('b','conclusion'), st('c','conclusion')], links: [{from:'a',to:'b',required:true},{from:'a',to:'c',required:true}] });
  expect(s.interchanges).toEqual(['a']);
});
test('outputs are sorted by id and loop ids are sorted', () => {
  const s = deriveStructure({
    stations: [st('z'), st('y'), st('b'), st('a')],
    links: [{from:'z',to:'y',required:true},{from:'y',to:'z',required:true},{from:'b',to:'a',required:true},{from:'a',to:'b',required:true}],
  });
  expect(s.loops).toEqual([['a','b'],['y','z']]);
});
