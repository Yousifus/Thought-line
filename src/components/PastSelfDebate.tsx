import { useState, useRef, useEffect } from 'react';
import { PastSelfDebateResult, DebateExchange, ChallengeType, PastPersonaPreset } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  History, 
  Sparkles, 
  ShieldAlert, 
  MessageSquareQuote, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Mic, 
  MicOff, 
  Flame, 
  ArrowRight, 
  FileText, 
  UserCheck,
  Zap,
  HelpCircle
} from 'lucide-react';

interface PastSelfDebateProps {
  currentText: string;
  initialDebateResult?: PastSelfDebateResult | null;
}

const PRESET_PERSONAS: PastPersonaPreset[] = [
  {
    id: 'idealist',
    title: 'The 1-Year-Ago Idealist',
    era: 'Circa 12 Months Ago',
    description: 'Uncompromising vision, high moral conviction, deeply skeptical of pragmatic shortcuts.',
    sampleText: 'We must never sacrifice core principles or long-term integrity for short-term convenience or incremental gains.'
  },
  {
    id: 'pragmatist',
    title: 'The Pragmatic Minimalist',
    era: 'Circa 8 Months Ago',
    description: 'Ruthlessly focused on execution, ROI, and eliminating bloat or over-engineering.',
    sampleText: 'Ideas are worthless without lean execution. Strip away all unnecessary layers and focus purely on what works today.'
  },
  {
    id: 'skeptic',
    title: 'The Empirical Skeptic',
    era: 'Circa 6 Months Ago',
    description: 'Demands hard data, empirical proof, and explicit risk mitigation before accepting claims.',
    sampleText: 'Show me the evidence. Unverified optimism is just self-deception waiting for reality to strike.'
  },
  {
    id: 'custom',
    title: 'Custom Past Writing Sample',
    era: 'Your Personal Archive',
    description: 'Paste an actual excerpt from a previous journal entry, essay, or draft.',
    sampleText: ''
  }
];

export function PastSelfDebate({ currentText, initialDebateResult }: PastSelfDebateProps) {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('idealist');
  const [customPastText, setCustomPastText] = useState<string>('');
  const [debateResult, setDebateResult] = useState<PastSelfDebateResult | null>(initialDebateResult || null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Per-exchange defense state
  const [defenses, setDefenses] = useState<Record<string, string>>({});
  const [replies, setReplies] = useState<Record<string, { rebuttal: string; reconciledScore: number; feedback: string }>>({});
  const [isReplying, setIsReplying] = useState<Record<string, boolean>>({});

  // Speech recognition for dictating defenses
  const [listeningForId, setListeningForId] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal && listeningForId) {
            setDefenses((prev) => ({
              ...prev,
              [listeningForId]: (prev[listeningForId] || '') + ' ' + transcript
            }));
          }
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error in debate:', event.error);
        setListeningForId(null);
      };

      recognition.onend = () => {
        setListeningForId(null);
      };

      recognitionRef.current = recognition;
    }
  }, [listeningForId]);

  const toggleMicForExchange = (exchangeId: string) => {
    if (listeningForId === exchangeId) {
      recognitionRef.current?.stop();
      setListeningForId(null);
    } else {
      setListeningForId(exchangeId);
      try {
        recognitionRef.current?.start();
      } catch (err) {
        console.error('Mic start error:', err);
      }
    }
  };

  const handleStartDebate = async () => {
    if (!currentText || currentText.trim().length < 10) {
      setError('Please provide a current draft of at least 10 words to debate.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/past-self-debate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentText,
          personaType: selectedPersonaId,
          pastWritings: selectedPersonaId === 'custom' ? customPastText : undefined
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to initialize debate');
      }

      const data = await response.json();
      setDebateResult(data);
      setDefenses({});
      setReplies({});
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to start Past Self debate.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitDefense = async (exchange: DebateExchange) => {
    const userDef = defenses[exchange.id];
    if (!userDef || userDef.trim().length === 0) return;

    setIsReplying((prev) => ({ ...prev, [exchange.id]: true }));
    try {
      const response = await fetch('/api/past-self-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentText,
          exchange,
          userDefense: userDef,
          personaName: debateResult?.personaName
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get rebuttal');
      }

      const replyData = await response.json();
      setReplies((prev) => ({
        ...prev,
        [exchange.id]: replyData
      }));
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsReplying((prev) => ({ ...prev, [exchange.id]: false }));
    }
  };

  const getChallengeBadge = (type: ChallengeType) => {
    switch (type) {
      case 'LOGICAL_SHIFT':
        return (
          <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono uppercase font-bold tracking-wider inline-flex items-center gap-1">
            <Zap className="w-3 h-3 text-indigo-400" /> LOGICAL_SHIFT
          </span>
        );
      case 'PREMISE_FLIP':
        return (
          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono uppercase font-bold tracking-wider inline-flex items-center gap-1">
            <Flame className="w-3 h-3 text-amber-400" /> PREMISE_FLIP
          </span>
        );
      case 'VOICE_DRIFT':
        return (
          <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-mono uppercase font-bold tracking-wider inline-flex items-center gap-1">
            <UserCheck className="w-3 h-3 text-purple-400" /> VOICE_DRIFT
          </span>
        );
      case 'EVIDENCE_GAP':
        return (
          <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-mono uppercase font-bold tracking-wider inline-flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-rose-400" /> EVIDENCE_GAP
          </span>
        );
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-8 pb-12">
      {/* Feature Title Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 rounded-xl bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-black border border-indigo-500/20 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-indigo-600/20 border border-indigo-500/40 text-indigo-400">
            <History className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-tight">Past Self Debate</h2>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono uppercase font-semibold">
                Authenticity & Consistency Sparring
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Confront your current reasoning with your past convictions. Defend your evolving perspective without losing your authentic voice.
            </p>
          </div>
        </div>

        {debateResult && (
          <button
            onClick={() => setDebateResult(null)}
            className="px-3 py-1.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 text-xs text-slate-300 font-mono uppercase tracking-wider flex items-center gap-1.5 transition-colors shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Change Persona
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-950/30 border border-red-500/40 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Setup View: Select Persona or Input Past Writing */}
      {!debateResult && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-6"
        >
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-widest text-slate-400 font-bold block">
              1. Select Your Past Self Persona / Writing Archive
            </label>
            <p className="text-xs text-slate-500">
              Choose an earlier intellectual stance or paste your actual past essay to serve as your sparring partner.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PRESET_PERSONAS.map((persona) => {
              const isSelected = selectedPersonaId === persona.id;
              return (
                <div
                  key={persona.id}
                  onClick={() => setSelectedPersonaId(persona.id)}
                  className={`p-5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'bg-indigo-950/30 border-indigo-500/60 shadow-[0_0_20px_rgba(79,70,229,0.2)]'
                      : 'bg-white/5 border-white/10 hover:bg-white/[0.08] hover:border-white/20'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-indigo-400">
                        {persona.era}
                      </span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-400" />}
                    </div>
                    <h3 className="text-sm font-bold text-white">{persona.title}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">{persona.description}</p>
                  </div>

                  {persona.sampleText && (
                    <div className="mt-4 pt-3 border-t border-white/10 text-[11px] font-mono text-slate-500 italic">
                      "{persona.sampleText}"
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Custom Text input if selected */}
          {selectedPersonaId === 'custom' && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-2"
            >
              <label className="text-xs font-mono text-indigo-300 font-bold block">
                Paste Your Actual Past Essay or Journal Excerpt:
              </label>
              <textarea
                value={customPastText}
                onChange={(e) => setCustomPastText(e.target.value)}
                placeholder="Paste an excerpt from an old draft, blog post, or journal entry where you articulated your previous perspective..."
                className="w-full h-36 bg-black/50 border border-white/10 rounded-lg p-4 text-xs font-mono text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </motion.div>
          )}

          {/* Action Button */}
          <button
            onClick={handleStartDebate}
            disabled={isLoading || (selectedPersonaId === 'custom' && !customPastText.trim())}
            className="self-center mt-2 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(79,70,229,0.4)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2.5"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Generating Past-Self Counter-Arguments...</span>
              </>
            ) : (
              <>
                <Flame className="w-4 h-4 text-indigo-300" />
                <span>Initiate Debate With Past Self</span>
              </>
            )}
          </button>
        </motion.div>
      )}

      {/* Debate Results & Sparring Arena */}
      {debateResult && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col gap-8"
        >
          {/* Persona & Core Contradiction Banner */}
          <div className="p-6 rounded-xl bg-slate-950 border border-indigo-500/30 shadow-2xl relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest font-bold">
                    SPARRING OPPONENT
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400">
                    {debateResult.personaEra}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-white tracking-tight">{debateResult.personaName}</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-2xl">{debateResult.personaContext}</p>
              </div>

              <div className="px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-center gap-2 shrink-0">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{debateResult.exchanges.length} Active Challenges</span>
              </div>
            </div>

            {/* Core Contradiction Highlight */}
            <div className="p-4 rounded-lg bg-red-950/30 border border-red-500/40 text-slate-200 space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-red-400 block">
                Primary Contradiction Callout
              </span>
              <p className="text-xs leading-relaxed font-semibold text-red-200 italic">
                "{debateResult.coreContradiction}"
              </p>
            </div>
          </div>

          {/* List of Challenges & Sparring Boxes */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <MessageSquareQuote className="w-4 h-4 text-indigo-400" />
                Direct Challenges & Philosophical Sparring
              </h3>
              <span className="text-[11px] text-slate-500 font-mono">
                Respond to each question to reconcile your evolving perspective.
              </span>
            </div>

            {debateResult.exchanges.map((exchange, idx) => {
              const reply = replies[exchange.id];
              const isReplyingThis = isReplying[exchange.id];

              return (
                <div 
                  key={exchange.id}
                  className="p-6 rounded-xl bg-slate-900/60 border border-white/10 hover:border-indigo-500/30 transition-all space-y-5"
                >
                  {/* Top Bar: Index & Classification */}
                  <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 text-xs font-mono font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-mono text-slate-300 font-bold uppercase tracking-wider">
                        Challenge #{idx + 1}
                      </span>
                    </div>
                    {getChallengeBadge(exchange.challengeType)}
                  </div>

                  {/* Contrast Box: Past Quote vs Current Claim */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3.5 rounded-lg bg-black/40 border border-indigo-500/20 space-y-1.5">
                      <span className="text-[9px] font-mono text-indigo-400 uppercase tracking-widest font-bold block">
                        Past Stance / Premise
                      </span>
                      <p className="text-xs text-slate-300 italic leading-relaxed">
                        "{exchange.pastSelfQuote}"
                      </p>
                    </div>

                    <div className="p-3.5 rounded-lg bg-black/40 border border-amber-500/20 space-y-1.5">
                      <span className="text-[9px] font-mono text-amber-400 uppercase tracking-widest font-bold block">
                        Current Draft Claim
                      </span>
                      <p className="text-xs text-slate-300 italic leading-relaxed">
                        "{exchange.currentClaim}"
                      </p>
                    </div>
                  </div>

                  {/* Past Self Question */}
                  <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/30 flex items-start gap-3">
                    <div className="p-2 rounded-full bg-indigo-600/30 text-indigo-300 shrink-0 mt-0.5">
                      <History className="w-4 h-4" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-indigo-300 uppercase tracking-widest font-bold">
                        {debateResult.personaName} asks:
                      </span>
                      <p className="text-xs text-white font-semibold leading-relaxed">
                        "{exchange.pastSelfQuestion}"
                      </p>
                    </div>
                  </div>

                  {/* Defense Guidance & Suggested Angles */}
                  <div className="space-y-2">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                      Required Defense Focus: <span className="text-slate-300 font-normal italic">{exchange.defensePrompt}</span>
                    </div>

                    {exchange.suggestedDefenseOptions && exchange.suggestedDefenseOptions.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <span className="text-[10px] font-mono text-slate-500 self-center uppercase">Quick Angles:</span>
                        {exchange.suggestedDefenseOptions.map((opt, optIdx) => (
                          <button
                            key={optIdx}
                            type="button"
                            onClick={() => {
                              setDefenses((prev) => ({
                                ...prev,
                                [exchange.id]: opt
                              }));
                            }}
                            className="text-[10px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-indigo-500/40 text-slate-300 transition-colors text-left"
                          >
                            + {opt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* User Defense Input Box */}
                  <div className="space-y-3 pt-2">
                    <div className="relative">
                      <textarea
                        value={defenses[exchange.id] || ''}
                        onChange={(e) =>
                          setDefenses((prev) => ({ ...prev, [exchange.id]: e.target.value }))
                        }
                        placeholder="Write or speak your defense to your Past Self... How do you reconcile or justify this shift?"
                        className="w-full h-28 bg-black/60 border border-white/15 rounded-lg p-3.5 pr-12 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                      />

                      {/* Speech to text button for defense */}
                      <button
                        type="button"
                        onClick={() => toggleMicForExchange(exchange.id)}
                        title={listeningForId === exchange.id ? 'Stop recording' : 'Dictate defense'}
                        className={`absolute top-3 right-3 p-2 rounded-full transition-all ${
                          listeningForId === exchange.id
                            ? 'bg-red-500/20 text-red-400 border border-red-500/50 animate-pulse'
                            : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {listeningForId === exchange.id ? (
                          <MicOff className="w-3.5 h-3.5 text-red-400" />
                        ) : (
                          <Mic className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-mono text-slate-500">
                        {defenses[exchange.id]?.trim().length || 0} characters
                      </span>

                      <button
                        type="button"
                        onClick={() => handleSubmitDefense(exchange)}
                        disabled={!defenses[exchange.id]?.trim() || isReplyingThis}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-mono uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-all shadow-[0_0_12px_rgba(79,70,229,0.3)]"
                      >
                        {isReplyingThis ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Evaluating...
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            Submit Defense
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Past Self Rebuttal Display */}
                  <AnimatePresence>
                    {reply && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 rounded-xl bg-gradient-to-r from-slate-950 to-indigo-950/40 border border-indigo-500/40 space-y-3 mt-4"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-bold text-indigo-300 uppercase tracking-widest flex items-center gap-1.5">
                            <History className="w-3.5 h-3.5 text-indigo-400" />
                            Past Self Rebuttal
                          </span>

                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-slate-400">Consistency Score:</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                              reply.reconciledScore >= 75
                                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                                : reply.reconciledScore >= 50
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-red-500/20 text-red-300 border border-red-500/30'
                            }`}>
                              {reply.reconciledScore}% Reconciled
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-slate-200 leading-relaxed italic bg-black/40 p-3 rounded-lg border border-white/5">
                          "{reply.rebuttal}"
                        </p>

                        <div className="text-[11px] text-indigo-200 font-mono bg-indigo-500/10 p-2.5 rounded-lg border border-indigo-500/20 flex items-start gap-2">
                          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                          <span><strong>Synthesis Tip:</strong> {reply.feedback}</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}
