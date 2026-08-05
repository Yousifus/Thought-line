import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

function parseAndCleanErrorMessage(error: any): string {
  const raw = error?.message || String(error);
  if (raw.includes("RESOURCE_EXHAUSTED") || raw.includes("429") || raw.includes("quota")) {
    return "Gemini API rate limit reached (Quota Exhausted). Please wait ~15–30 seconds before retrying.";
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed.error?.message) {
      if (parsed.error.message.includes("RESOURCE_EXHAUSTED")) {
        return "Gemini API rate limit reached. Please wait ~15–30 seconds before retrying.";
      }
      return parsed.error.message;
    }
  } catch (_) {}
  return raw;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to parse JSON bodies
  app.use(express.json({ limit: "50mb" }));

  // API endpoints
  app.post("/api/analyze", async (req, res) => {
    try {
      const { text } = req.body;

      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Text is required" });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not set" });
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const systemInstruction = `You are a rigorous structural editor and creative sparring partner. 
Analyze the following text ONLY for its logical and argumentative structure. Ignore grammar, spelling, and prose style entirely. 
Break the text into 4-10 discrete 'stations' representing distinct ideas or argumentative moves. 
For each station, provide:
- A short, punchy label.
- A one-sentence summary.
- A classification of its connection to prior stations as one of: STRONG_LINK (flows logically from previous point), LOOP (repeats/circles back to an earlier station without adding new evidence), or DEAD_END (introduced but never resolved or connected). The first station should usually be a STRONG_LINK.
- If it is a LOOP, provide the 'id' of the station it loops back to in 'loopsTo'.
- A sentiment score/tone classification for the argument at this station: POSITIVE (optimistic, constructive, supportive), NEGATIVE (skeptical, critical, cautionary, combative), or NEUTRAL (objective, analytical, balanced).
Also identify any INTERCHANGE stations where multiple ideas merge or there's a strong logical turn (provide their IDs in 'interchanges').
Then give 3-5 blunt, specific structural critiques a writer could act on immediately. Be direct and challenge the writer's thinking - do not soften feedback or default to praise.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          { role: "user", parts: [{ text }] }
        ],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              stations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    label: { type: Type.STRING },
                    summary: { type: Type.STRING },
                    type: { type: Type.STRING, enum: ["STRONG_LINK", "LOOP", "DEAD_END"] },
                    loopsTo: { type: Type.STRING, nullable: true },
                    sentiment: { type: Type.STRING, enum: ["POSITIVE", "NEGATIVE", "NEUTRAL"] }
                  },
                  required: ["id", "label", "summary", "type"]
                }
              },
              interchanges: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              critiques: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["stations", "interchanges", "critiques"]
          }
        }
      });

      if (!response.text) {
        throw new Error("No response text from Gemini");
      }

      const analysis = JSON.parse(response.text);
      res.json(analysis);

    } catch (error: any) {
      console.error("Error analyzing text:", error);
      res.status(500).json({ error: parseAndCleanErrorMessage(error) });
    }
  });

  // Counter-Argument Generator Endpoint
  app.post("/api/counter-argument", async (req, res) => {
    try {
      const { stationLabel, stationSummary, fullContext } = req.body;

      if (!stationSummary || typeof stationSummary !== "string") {
        return res.status(400).json({ error: "Station summary is required" });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not set" });
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const systemInstruction = `You are an elite debate strategist and devil's advocate.
Analyze the user's target station argument and craft a compelling, intellectually rigorous counter-argument / rebuttal.

Provide output as JSON:
- counterTitle: A punchy, sharp title for the counter-argument.
- rebuttalText: A robust 2-3 sentence counter-argument directly dismantling the premise, uncovering hidden assumptions, or providing counter-examples.
- weakPoints: An array of 2-3 specific bullet points highlighting logical vulnerabilities in this station's argument.
- suggestedPivot: A 1-2 sentence recommendation for how the writer can preemptively address or absorb this rebuttal.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `STATION: "${stationLabel || 'Target Station'}"
STATION SUMMARY: "${stationSummary}"
FULL DRAFT CONTEXT: "${(fullContext || '').slice(0, 1000)}"`
              }
            ]
          }
        ],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              counterTitle: { type: Type.STRING },
              rebuttalText: { type: Type.STRING },
              weakPoints: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              suggestedPivot: { type: Type.STRING }
            },
            required: ["counterTitle", "rebuttalText", "weakPoints", "suggestedPivot"]
          }
        }
      });

      if (!response.text) {
        throw new Error("No response generated");
      }

      res.json(JSON.parse(response.text));

    } catch (error: any) {
      console.error("Error generating counter argument:", error);
      res.status(500).json({ error: parseAndCleanErrorMessage(error) });
    }
  });

  // Past-Self Debate Generation Endpoint
  app.post("/api/past-self-debate", async (req, res) => {
    try {
      const { currentText, pastWritings, personaType } = req.body;

      if (!currentText || typeof currentText !== "string") {
        return res.status(400).json({ error: "Current text is required" });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not set" });
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const defaultPastContexts: Record<string, string> = {
        idealist: "Past stance (1 Year Ago): Highly ambitious, unwavering moral principles, skeptical of pragmatic compromises or incrementalism.",
        pragmatist: "Past stance (8 Months Ago): Deeply cost-conscious, focused on immediate ROI, ruthlessly minimizing overhead and complexity.",
        skeptic: "Past stance (6 Months Ago): Demands rigorous empirical proof, highly suspicious of hype or unverified assumptions.",
        custom: pastWritings ? `User's Actual Past Writings:\n"""${pastWritings}"""` : "General earlier intellectual stance."
      };

      const selectedContext = defaultPastContexts[personaType || 'idealist'] || (pastWritings ? `User's Past Writings:\n"""${pastWritings}"""` : defaultPastContexts.idealist);

      const systemInstruction = `You are the writer's 'Past Self' — an intellectually sharp, uncompromising sparring partner embodying their past writings and earlier convictions.
Your task is to analyze the user's CURRENT text and compare its core premises against their PAST self perspective (${selectedContext}).

Identify 3-4 specific logical tensions, shifts in perspective, voice drifts, or unexamined assumptions where the current text deviates from or contradicts past commitments.

For each challenge, speak in the 2nd person ("You", "Your") as their Past Self. Be direct, intellectually provocative, and uncompromisingly honest. Force the writer to defend their evolution or preserve their authentic voice.

Structure output as JSON:
1. personaName: A distinct label for this past self (e.g., 'Your Past Self (2024 Idealist)').
2. personaEra: Estimated timeframe (e.g., 'Circa 12 Months Ago').
3. personaContext: Brief summary of the core principles this past self holds dear.
4. coreContradiction: A blunt, punchy callout (1-2 sentences) of the primary philosophical or logical tension between then and now.
5. exchanges: Array of 3-4 challenges, each with:
   - id: unique string
   - pastSelfQuote: Quote or stated principle representing the past stance.
   - currentClaim: Quote or claim from current text that challenges it.
   - challengeType: One of ['LOGICAL_SHIFT', 'VOICE_DRIFT', 'EVIDENCE_GAP', 'PREMISE_FLIP'].
   - pastSelfQuestion: A sharp, direct question confronting the current reasoning.
   - defensePrompt: A prompt instructing the writer on what they must explain or defend.
   - suggestedDefenseOptions: Array of 2-3 concise starting points or angles for defense.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `CURRENT DRAFT TO DEBATE:\n"""${currentText}"""\n\nPAST WRITING / CONTEXT:\n"""${selectedContext}"""`
              }
            ]
          }
        ],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              personaName: { type: Type.STRING },
              personaEra: { type: Type.STRING },
              personaContext: { type: Type.STRING },
              coreContradiction: { type: Type.STRING },
              exchanges: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    pastSelfQuote: { type: Type.STRING },
                    currentClaim: { type: Type.STRING },
                    challengeType: {
                      type: Type.STRING,
                      enum: ["LOGICAL_SHIFT", "VOICE_DRIFT", "EVIDENCE_GAP", "PREMISE_FLIP"]
                    },
                    pastSelfQuestion: { type: Type.STRING },
                    defensePrompt: { type: Type.STRING },
                    suggestedDefenseOptions: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    }
                  },
                  required: ["id", "pastSelfQuote", "currentClaim", "challengeType", "pastSelfQuestion", "defensePrompt"]
                }
              }
            },
            required: ["personaName", "personaEra", "personaContext", "coreContradiction", "exchanges"]
          }
        }
      });

      if (!response.text) {
        throw new Error("No response text from Gemini for debate");
      }

      const debateResult = JSON.parse(response.text);
      res.json(debateResult);

    } catch (error: any) {
      console.error("Error generating past self debate:", error);
      res.status(500).json({ error: parseAndCleanErrorMessage(error) });
    }
  });

  // Past-Self Reply / Rebuttal Endpoint
  app.post("/api/past-self-reply", async (req, res) => {
    try {
      const { currentText, exchange, userDefense, personaName } = req.body;

      if (!userDefense || typeof userDefense !== "string") {
        return res.status(400).json({ error: "Defense response is required" });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not set" });
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const systemInstruction = `You are ${personaName || "the writer's Past Self"}. The user just responded to your challenge regarding their draft.
Assess their defense response.
Did they successfully reconcile the shift in perspective, offer sound logical justification, or clarify their authentic voice? Or are they making excuses, dodging the contradiction, or hand-waving?

Provide a response as JSON:
- rebuttal: A 2-3 sentence direct response from Past Self acknowledging what holds up and where lingering gaps remain.
- reconciledScore: A number from 0 to 100 indicating how thoroughly their defense resolved the logical tension.
- feedback: A 1-2 sentence constructive guidance on how to strengthen their draft to solidify this new position without losing integrity.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `PAST SELF QUESTION: "${exchange.pastSelfQuestion}"
WRITER'S DEFENSE: "${userDefense}"
ORIGINAL DRAFT CONTEXT: "${currentText.slice(0, 500)}..."`
              }
            ]
          }
        ],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              rebuttal: { type: Type.STRING },
              reconciledScore: { type: Type.NUMBER },
              feedback: { type: Type.STRING }
            },
            required: ["rebuttal", "reconciledScore", "feedback"]
          }
        }
      });

      if (!response.text) {
        throw new Error("No rebuttal generated");
      }

      res.json(JSON.parse(response.text));

    } catch (error: any) {
      console.error("Error in past-self reply:", error);
      res.status(500).json({ error: parseAndCleanErrorMessage(error) });
    }
  });

  // Model Council Endpoint: Multi-Persona Critique Analysis
  app.post("/api/model-council", async (req, res) => {
    try {
      const { currentText, personas } = req.body;

      if (!currentText || typeof currentText !== "string" || currentText.trim().length < 10) {
        return res.status(400).json({ error: "Text must be at least 10 characters long" });
      }

      if (!personas || !Array.isArray(personas) || personas.length === 0) {
        return res.status(400).json({ error: "At least one council persona must be provided" });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not set" });
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const personaPromptList = personas
        .map((p: any, idx: number) => `PERSONA ${idx + 1} [ID: ${p.id}]:
Name: ${p.name}
Role/Perspective: ${p.role}
Focus & Concerns: ${p.description}`)
        .join("\n\n");

      const systemInstruction = `You are the Model Council - an elite review panel consisting of diverse stakeholders, domain experts, and critical mindsets.
Evaluate the user's draft text strictly through the lens and specific priorities of each requested persona.

For EACH persona in the requested list:
1. Provide an approval rating (0 to 100%) reflecting how compelling, credible, or well-addressed the text is from their specific viewpoint.
2. Provide an overall verdict (1-2 sentences capturing their core impression and ultimate reaction).
3. Provide 2-3 targeted critiques/observations highlighting:
   - aspect: The key dimension evaluated (e.g. "Strategic Value", "Technical Rigor", "Customer Friction", "Security & Risk", "Semantics").
   - concern: What is weak, unaddressed, dubious, or objectionable from this persona's point of view.
   - recommendation: Specific, actionable change to improve appeal to this persona.
   - sentiment: One of 'CRITICAL', 'NEUTRAL', or 'FAVORABLE'.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `DRAFT TEXT TO EVALUATE:
"""
${currentText}
"""

COUNCIL PERSONAS REVIEWING THIS DRAFT:
${personaPromptList}`
              }
            ]
          }
        ],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              personaResults: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    personaId: { type: Type.STRING },
                    personaName: { type: Type.STRING },
                    personaRole: { type: Type.STRING },
                    approvalRating: { type: Type.NUMBER },
                    overallVerdict: { type: Type.STRING },
                    critiques: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          aspect: { type: Type.STRING },
                          concern: { type: Type.STRING },
                          recommendation: { type: Type.STRING },
                          sentiment: { type: Type.STRING }
                        },
                        required: ["aspect", "concern", "recommendation", "sentiment"]
                      }
                    }
                  },
                  required: ["personaId", "personaName", "personaRole", "approvalRating", "overallVerdict", "critiques"]
                }
              }
            },
            required: ["personaResults"]
          }
        }
      });

      if (!response.text) {
        throw new Error("No council response generated");
      }

      const councilData = JSON.parse(response.text);
      res.json(councilData);

    } catch (error: any) {
      console.error("Error generating Model Council critiques:", error);
      res.status(500).json({ error: parseAndCleanErrorMessage(error) });
    }
  });

  // Logical Integrity Scanner Endpoint
  app.post("/api/analyze-integrity", async (req, res) => {
    try {
      const { text, stations } = req.body;

      if (!stations || !Array.isArray(stations) || stations.length === 0) {
        return res.status(400).json({ error: "Stations list is required" });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not set" });
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const stationListStr = stations
        .map((s: any, idx: number) => `STATION ${idx + 1} [ID: "${s.id}"]:
Label: "${s.label}"
Summary: "${s.summary}"
Type: ${s.type}
LoopsTo: ${s.loopsTo || 'None'}
Sentiment: ${s.sentiment || 'NEUTRAL'}`)
        .join("\n\n");

      const systemInstruction = `You are a world-class formal logic expert and argumentation scientist.
Perform a thorough, proactive Logical Integrity Scan on the provided sequence of stations representing a draft's argument structure.

Scan specifically for:
1. MISSING_PREMISE: Unstated assumptions or essential steps skipped between stations.
2. LOGICAL_FALLACY: Fallacies such as Strawman, False Dichotomy, Circular Reasoning, Post Hoc, Slippery Slope, Ad Hominem, or Appeal to Ignorance.
3. UNLINKED_ARGUMENT: Floating claims that lack logical ties to previous or subsequent stations.
4. EVIDENCE_GAP: Empirical claims made without backing or logical proof.
5. CIRCULAR_LOGIC: Arguments that prove a conclusion by assuming it in a loop.

Provide output as JSON:
- overallScore: A number from 0 to 100 representing the overall logical rigor and integrity of the argument chain.
- summary: A 1-2 sentence executive assessment of the argument's structural soundness.
- issues: An array of 2-5 specific logical vulnerabilities detected. Each issue MUST contain:
  - id: string (e.g. "issue_1")
  - stationId: string (MUST exactly match one of the provided station IDs, e.g. "${stations[0]?.id || 's1'}")
  - type: string (one of ['MISSING_PREMISE', 'LOGICAL_FALLACY', 'UNLINKED_ARGUMENT', 'EVIDENCE_GAP', 'CIRCULAR_LOGIC'])
  - severity: string (one of ['HIGH', 'MEDIUM', 'LOW'])
  - title: A short 3-6 word title (e.g. "False Dichotomy Fallacy", "Unsubstantiated Causal Jump")
  - explanation: 2-3 sentences explaining precisely why this station contains a logical flaw or vulnerability.
  - suggestedFix: 1-2 sentence actionable recommendation for how the author can repair this vulnerability.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `FULL DRAFT TEXT:\n"""${(text || '').slice(0, 3000)}"""\n\nARGUMENT STATIONS:\n${stationListStr}`
              }
            ]
          }
        ],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overallScore: { type: Type.NUMBER },
              summary: { type: Type.STRING },
              issues: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    stationId: { type: Type.STRING },
                    type: {
                      type: Type.STRING,
                      enum: ["MISSING_PREMISE", "LOGICAL_FALLACY", "UNLINKED_ARGUMENT", "EVIDENCE_GAP", "CIRCULAR_LOGIC"]
                    },
                    severity: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] },
                    title: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                    suggestedFix: { type: Type.STRING }
                  },
                  required: ["id", "stationId", "type", "severity", "title", "explanation", "suggestedFix"]
                }
              }
            },
            required: ["overallScore", "summary", "issues"]
          }
        }
      });

      if (!response.text) {
        throw new Error("No integrity scan response generated");
      }

      const integrityData = JSON.parse(response.text);
      res.json(integrityData);

    } catch (error: any) {
      console.error("Error analyzing logical integrity:", error);
      res.status(500).json({ error: parseAndCleanErrorMessage(error) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
