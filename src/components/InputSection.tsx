import { useState, FormEvent, useEffect, useRef } from 'react';
import { Loader2, Mic, MicOff, History, Map, Sparkles, Volume2, BookOpen, Lightbulb } from 'lucide-react';

interface InputSectionProps {
  onAnalyze: (text: string) => Promise<void>;
  onDirectDebate?: (text: string) => void;
  isLoading: boolean;
}

const SAMPLE_PRESETS = [
  {
    title: 'AI Governance & Safety',
    desc: 'Regulatory bottlenecks vs. open source self-regulation circular loop.',
    text: 'Artificial intelligence models must be strictly governed by open safety standards before autonomous deployment. However, relying on central regulatory boards inevitably creates bureaucratic bottlenecks that stall open-source innovation. Therefore, we should trust open-source developer consensus to self-regulate AI safety. But open-source consensus has no enforcement mechanism for malicious actors, which brings us right back to needing central regulatory oversight.',
  },
  {
    title: 'Remote Work Productivity',
    desc: 'Flexibility vs. spontaneous mentorship & mandatory hybrid policy.',
    text: 'Fully remote work increases employee satisfaction and reduces corporate overhead expenses. Increased satisfaction leads directly to higher focus and output quality. However, remote collaboration undermines spontaneous cross-team innovation and mentorship. Therefore, mandatory hybrid office attendance is required three days a week. Yet mandatory office days reduce satisfaction, creating friction among top performers who demand full flexibility.',
  },
  {
    title: 'Deep Space Mining Thesis',
    desc: 'Terrestrial resource scarcity vs. high upfront capital risk.',
    text: 'Investing in deep space resource extraction is critical for long-term human civilization sustainability because Earth\'s rare minerals are rapidly depleting. Off-world mining will drop raw material costs dramatically. However, the immense capital expenditure required upfront diverts funds from urgent terrestrial climate solutions. Therefore, private commercial ventures should fund orbital mining independently. But commercial ventures require short-term ROI, which deep space mining cannot guarantee.',
  },
];

export function InputSection({ onAnalyze, onDirectDebate, isLoading }: InputSectionProps) {
  const [text, setText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [autoAnalyzeOnStop, setAutoAnalyzeOnStop] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let finalChunk = '';
        let interimChunk = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalChunk += transcript + ' ';
          } else {
            interimChunk += transcript;
          }
        }

        if (finalChunk) {
          setText((prev) => (prev ? prev.trim() + ' ' + finalChunk.trim() : finalChunk.trim()));
          setInterimText('');
        } else {
          setInterimText(interimChunk);
        }

        // Reset silence timer on incoming speech
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        if (autoAnalyzeOnStop) {
          silenceTimerRef.current = setTimeout(() => {
            if (recognitionRef.current && isListening) {
              console.log('Silence detected, auto-stopping recording');
              recognitionRef.current.stop();
            }
          }, 4000); // 4 seconds silence auto-stop
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setMicError('Microphone permission denied. Please allow mic access in browser settings.');
        } else if (event.error !== 'no-speech') {
          setMicError(`Speech error: ${event.error}`);
        }
        setIsListening(false);
        setInterimText('');
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimText('');
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      };

      recognitionRef.current = recognition;
    } else {
      setMicError('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
    }

    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, [autoAnalyzeOnStop, isListening]);

  const toggleListening = () => {
    setMicError(null);
    if (!recognitionRef.current) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setMicError('Speech recognition is not supported in this browser environment.');
        return;
      }
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setInterimText('');
      // Trigger analysis if text is present and autoAnalyze is on
      if (autoAnalyzeOnStop && text.trim().length >= 10) {
        onAnalyze(text.trim());
      }
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (err: any) {
        console.error('Failed to start recognition:', err);
        setIsListening(false);
      }
    }
  };

  const handleStopAndAnalyze = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setInterimText('');
    }
    const fullCombined = (text + ' ' + interimText).trim();
    if (fullCombined.length >= 10) {
      onAnalyze(fullCombined);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleStopAndAnalyze();
  };

  const wordCount = (text + ' ' + interimText).split(/\s+/).filter((w) => w.length > 0).length;

  return (
    <div className="flex flex-col gap-6 w-full max-w-3xl mx-auto">
      <div className="space-y-2 text-center mb-2">
        <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block italic underline decoration-indigo-500">
          The Messy Middle
        </label>
        <p className="text-sm text-slate-400">
          Paste or speak your draft directly to transcribe and map its logical structure onto the TransitMap.
        </p>

        {/* Quick Sample Draft Presets Bar */}
        <div className="pt-3 flex flex-wrap items-center justify-center gap-2">
          <span className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1 mr-1">
            <Lightbulb className="w-3 h-3 text-amber-400" /> Quick Drafts:
          </span>
          {SAMPLE_PRESETS.map((preset) => (
            <button
              key={preset.title}
              type="button"
              disabled={isLoading}
              onClick={() => {
                setText(preset.text);
                setInterimText('');
              }}
              className="px-2.5 py-1 rounded-lg bg-indigo-950/40 hover:bg-indigo-900/60 border border-indigo-500/30 hover:border-indigo-400/60 text-indigo-200 hover:text-white transition-all text-[11px] font-mono flex items-center gap-1.5 shadow-sm active:scale-95"
              title={preset.desc}
            >
              <BookOpen className="w-3 h-3 text-indigo-400" />
              <span>{preset.title}</span>
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="relative group">
          <textarea
            value={text + (interimText ? (text ? ' ' : '') + interimText : '')}
            onChange={(e) => {
              setText(e.target.value);
              setInterimText('');
            }}
            placeholder="Paste your argument draft or click the microphone button to speak your thoughts live..."
            className={`w-full h-64 bg-black/40 border rounded-xl p-6 pr-14 text-sm leading-relaxed focus:outline-none transition-all resize-y font-mono ${
              isListening
                ? 'border-indigo-500/80 shadow-[0_0_20px_rgba(99,102,241,0.2)] text-white'
                : 'border-white/10 text-slate-300 focus:border-indigo-500/50'
            }`}
            disabled={isLoading}
          />

          {/* Mic Button inside Textarea Top Right */}
          <button
            type="button"
            onClick={toggleListening}
            disabled={isLoading}
            title={isListening ? 'Stop recording microphone' : 'Speak your thoughts live'}
            className={`absolute top-4 right-4 p-3 rounded-full transition-all flex items-center justify-center ${
              isListening
                ? 'bg-rose-500 text-white shadow-[0_0_18px_rgba(244,63,94,0.8)] animate-pulse'
                : 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-600 hover:text-white'
            }`}
          >
            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <div className="absolute bottom-4 right-4 text-[10px] text-slate-500 font-mono italic pointer-events-none">
            {wordCount} words
          </div>
        </div>

        {/* Live Speech Feedback & Waveform Visualizer */}
        {isListening && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-gradient-to-r from-rose-950/40 via-indigo-950/40 to-slate-950/60 border border-indigo-500/40 p-3.5 rounded-xl text-xs font-mono">
            <div className="flex items-center gap-3">
              {/* Soundwave animation bars */}
              <div className="flex items-center gap-1 h-5">
                <span className="w-1 h-3 bg-rose-500 rounded-full animate-[bounce_1s_infinite_100ms]"></span>
                <span className="w-1 h-5 bg-indigo-400 rounded-full animate-[bounce_1s_infinite_300ms]"></span>
                <span className="w-1 h-2 bg-rose-400 rounded-full animate-[bounce_1s_infinite_200ms]"></span>
                <span className="w-1 h-4 bg-cyan-400 rounded-full animate-[bounce_1s_infinite_400ms]"></span>
              </div>
              <div className="text-left">
                <span className="text-white font-bold block flex items-center gap-1">
                  <Volume2 className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                  Transcribing spoken arguments live...
                </span>
                <span className="text-[10px] text-slate-400">
                  {interimText ? `"${interimText}"` : 'Listening for audio input...'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleStopAndAnalyze}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] uppercase tracking-wider transition-colors shrink-0 flex items-center gap-1.5 shadow-md"
            >
              <Sparkles className="w-3.5 h-3.5" /> Stop & Map Now
            </button>
          </div>
        )}

        {/* Mic Error Banner */}
        {micError && (
          <div className="text-xs text-amber-400 bg-amber-950/30 border border-amber-500/40 p-3 rounded-xl text-center font-mono">
            {micError}
          </div>
        )}

        {/* Action Toolbar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-400 font-mono">
            <input
              type="checkbox"
              checked={autoAnalyzeOnStop}
              onChange={(e) => setAutoAnalyzeOnStop(e.target.checked)}
              className="rounded bg-black border-white/20 text-indigo-600 focus:ring-0 focus:ring-offset-0"
            />
            Auto-trigger TransitMap analysis when voice recording stops
          </label>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="submit"
              disabled={isLoading || wordCount === 0}
              className="w-full sm:w-auto px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-mono font-bold transition-all shadow-[0_0_18px_rgba(79,70,229,0.4)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 uppercase tracking-widest"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  Tracing Logic...
                </>
              ) : (
                <>
                  <Map className="w-4 h-4 text-white" />
                  Map My Thinking
                </>
              )}
            </button>

            {onDirectDebate && (
              <button
                type="button"
                disabled={isLoading || wordCount === 0}
                onClick={() => onDirectDebate(text + ' ' + interimText)}
                className="w-full sm:w-auto px-5 py-3.5 bg-white/5 border border-indigo-500/30 hover:bg-indigo-950/30 text-indigo-300 hover:text-white rounded-xl text-xs font-mono font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 uppercase tracking-widest shrink-0"
              >
                <History className="w-4 h-4 text-indigo-400" />
                Debate Past Self
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

