// Checks the model-output schema: validation and a strict-mode friendly JSON schema.
import { ModelAnalysisSchema, modelAnalysisJsonSchema } from '../../src/core/analysis';

test('the JSON schema is strict-mode friendly at every object level', () => {
  const walk = (node: any): void => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object') {
      expect(node.additionalProperties).toBe(false);
      expect([...node.required].sort()).toEqual(Object.keys(node.properties).sort());
    }
    for (const v of Object.values(node)) walk(v);
  };
  walk(modelAnalysisJsonSchema);
  expect((modelAnalysisJsonSchema as any).required).toEqual(['stations', 'links', 'motifs', 'language']);
});
test('the schema accepts a valid analysis and rejects a fractional motif order', () => {
  const ok = { stations: [], links: [], motifs: [{ motif: 'moon', label: 'القمر', passage: 'القمر', order: 0 }], language: 'ar' };
  expect(ModelAnalysisSchema.safeParse(ok).success).toBe(true);
  expect(ModelAnalysisSchema.safeParse({ ...ok, motifs: [{ ...ok.motifs[0], order: 0.5 }] }).success).toBe(false);
});
