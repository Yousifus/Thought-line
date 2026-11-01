// Shared vocabulary for an analysis of a piece: stations, links, motifs, and the schema the model must return.
import { z } from 'zod';

export type Privacy = 'private' | 'public';
export type Grounding = 'evidence' | 'example' | 'assertion';
export type Role = 'premise' | 'step' | 'conclusion';

export interface Station {
  id: string;
  claim: string;
  passage: string;
  role: Role;
  expressed: number;
  grounding: Grounding;
  unanchored?: boolean;
}

/** `from` supports `to`. */
export interface Link {
  from: string;
  to: string;
  required: boolean;
}

/** `motif` is a short lowercase English noun gloss ("moon") even for Arabic text; `label` is the word as written. */
export interface MotifMention {
  motif: string;
  label: string;
  passage: string;
  order: number;
  unanchored?: boolean;
}

export interface Analysis {
  stations: Station[];
  links: Link[];
  motifs: MotifMention[];
  language: 'ar' | 'en' | 'mixed';
  model: string;
  /** Fingerprint of the prompt that produced this reading, recorded with `model`. Missing on versions saved before it existed. */
  promptVersion?: string;
  /** The temperature the reading was drawn at, so a version can say what produced it. Missing on versions saved before it existed. */
  temperature?: number;
  /** The analysis schema the reading was validated against. Missing on versions saved before it existed. */
  schemaVersion?: string;
  createdAt: string;
}

/** What the model returns. `expressed` has no range here: it is normalized after validation. */
export const ModelAnalysisSchema = z.object({
  stations: z.array(z.object({
    id: z.string(),
    claim: z.string(),
    passage: z.string(),
    role: z.enum(['premise', 'step', 'conclusion']),
    expressed: z.number(),
    grounding: z.enum(['evidence', 'example', 'assertion']),
  })),
  links: z.array(z.object({
    from: z.string(),
    to: z.string(),
    required: z.boolean(),
  })),
  motifs: z.array(z.object({
    motif: z.string(),
    label: z.string(),
    passage: z.string(),
    order: z.number().int(),
  })),
  language: z.enum(['ar', 'en', 'mixed']),
});

export type ModelAnalysis = z.infer<typeof ModelAnalysisSchema>;

/** Bumped when `ModelAnalysisSchema` changes in a way that changes what a stored reading means. */
export const SCHEMA_VERSION = 'analysis/1';

/** JSON Schema for the model's structured output (every property required, no extra properties). */
export const modelAnalysisJsonSchema: object = z.toJSONSchema(ModelAnalysisSchema);
