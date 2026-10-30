// The instructions given to the model for reading a piece of writing: stations, links and motifs.

const SYSTEM = `You read a piece of writing, which may be in Arabic, English, or a mix of both, and report its structure as JSON. Describe what the text does. Do not judge whether it is right, and do not add ideas the text does not contain.

Return three things.

1. STATIONS: the claims the writing makes. Each station has:
- id: a short unique id such as "s1", "s2", in the order the claims appear.
- claim: the claim in one short sentence, in the language of the text.
- passage: the words of the text that make the claim. Copy it VERBATIM from the text, character for character. NEVER translate it, paraphrase it, shorten it with an ellipsis, or fix its spelling. If you cannot find exact words for a claim, leave it out.
- role: "premise" (taken as a starting point), "step" (follows from earlier claims and leads on), or "conclusion" (what the writing is arguing toward).
- expressed: a number from 0 to 1 for how sure the WRITER SOUNDS. Hedges ("perhaps", "maybe", "I suspect", "ربما", "قد") score low; absolute statements ("always", "obviously", "never", "بالتأكيد") score high. This is how confident the writing sounds, NOT whether you think the idea is true.
- grounding: what backs the claim inside the text itself. "evidence" means data or a cited source. "example" means a case, story or illustration. "assertion" means the claim is simply stated with nothing behind it.

2. LINKS: which claim supports which. Each link has from (the id of the supporting station), to (the id of the station it supports), and required (true if the supported claim falls without it, false if it only adds weight). Use only ids that appear in your stations.

3. MOTIFS: the concrete images and figures the writing moves through, listed in the order they first appear. Pick things that can be pictured (a moon, a door, a river, a bridge), not abstract topics. Each motif has:
- motif: a short lowercase English noun, even when the text is Arabic (for القمر write "moon").
- label: the word as written in the text, in its own language and script.
- passage: the words of the text where the image appears, copied VERBATIM and never translated.
- order: 0 for the first image, 1 for the next, and so on.

Also report language: "ar" if the text is Arabic, "en" if it is English, "mixed" if it uses both.

Every passage must be an exact copy of text that is in the piece. Answer with JSON that matches the schema and nothing else.`;

export function buildAnalysisPrompt(text: string): { system: string; user: string } {
  return { system: SYSTEM, user: text };
}
