import { useState, useMemo } from 'react';
import { AnalysisResult } from '../types';
import { Sparkles, Copy, Check, FileText, ArrowRight, ShieldAlert, CheckCircle2, RefreshCw, Share2 } from 'lucide-react';
import { motion } from 'motion/react';

interface ExecutiveSummaryViewProps {
  data: AnalysisResult;
  currentText: string;
  onJumpToMap: () => void;
  onJumpToDebate: () => void;
  onExportToGoogleDoc?: () => void;
}

export function ExecutiveSummaryView({
  data,
  currentText,
  onJumpToMap,
  onJumpToDebate,
  onExportToGoogleDoc,
}: ExecutiveSummaryViewProps) {
  const [copied, setCopied] = useState(false);

  const { stations, interchanges, critiques } = data;

  // Auto-generate crisp single-paragraph executive summary based on station analysis
  const executiveSummaryParagraph = useMemo(() => {
    if (!stations || stations.length === 0) {
      return "No active transit map data available. Please submit an argument draft to synthesize an executive summary.";
    }

    const firstStation = stations[0];
    const lastStation = stations[stations.length - 1];
    const loops = stations.filter((s) => s.type === 'LOOP');
    const deadEnds = stations.filter((s) => s.type === 'DEAD_END');
    const strongLinks = stations.filter((s) => s.type === 'STRONG_LINK');

    const totalWordCount = currentText.split(/\s+/).filter(Boolean).length;

    let paragraph = `This draft (${totalWordCount} words) establishes a logical progression across ${stations.length} core argument stations, originating from the initial premise "${firstStation.summary.slice(0, 90)}${firstStation.summary.length > 90 ? '...' : ''}" (${firstStation.label}) and culminating in the target conclusion "${lastStation.summary.slice(0, 90)}${lastStation.summary.length > 90 ? '...' : ''}" (${lastStation.label}). `;

    if (interchanges.length > 0) {
      const interchangeLabels = stations
        .filter((s) => interchanges.includes(s.id))
        .map((s) => s.label)
        .join(', ');
      paragraph += `Critical structural interchanges occur at Station ${interchangeLabels}, where primary logical pathways intersect. `;
    }

    if (loops.length > 0 || deadEnds.length > 0) {
      paragraph += `However, the argument suffers from structural vulnerabilities: `;
      if (loops.length > 0) {
        paragraph += `${loops.length} recursive logical loop(s) detected (e.g., ${loops[0].label}: "${loops[0].summary.slice(0, 60)}..."), `;
      }
      if (deadEnds.length > 0) {
        paragraph += `${deadEnds.length} unsupported dead end(s) lacking empirical backing (e.g., ${deadEnds[0].label}), `;
      }
      paragraph += `resulting in ${critiques.length} key areas requiring immediate structural revision before final publication.`;
    } else {
      paragraph += `The line of reasoning demonstrates robust structural integrity across ${strongLinks.length} connected stations, with minimal logical friction or unbacked premises.`;
    }

    return paragraph;
  }, [stations, interchanges, critiques, currentText]);

  // Key Briefing Bullets
  const keyTakeaways = useMemo(() => {
    return [
      {
        title: 'Core Foundation',
        detail: stations[0] ? `${stations[0].label}: ${stations[0].summary}` : 'N/A',
        status: 'VALIDATED',
      },
      {
        title: 'Structural Integrity',
        detail: `${stations.filter((s) => s.type === 'STRONG_LINK').length} / ${stations.length} Stations with verified logical links.`,
        status: stations.filter((s) => s.type === 'STRONG_LINK').length >= stations.length * 0.7 ? 'HIGH' : 'MODERATE',
      },
      {
        title: 'Primary Vulnerability',
        detail: critiques[0] || 'No major structural gap identified.',
        status: critiques.length > 0 ? 'NEEDS_ATTENTION' : 'CLEAR',
      },
    ];
  }, [stations, critiques]);

  const handleCopy = () => {
    navigator.clipboard.writeText(executiveSummaryParagraph);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950/80 via-slate-900 to-slate-950 border border-indigo-500/30 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/40">
              <Sparkles className="w-4 h-4" />
            </span>
            <h2 className="text-lg font-mono font-bold text-white uppercase tracking-wider">
              Auto-Synthesized Executive Summary
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Distilled single-paragraph intelligence report of your current TransitMap argument topology.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onExportToGoogleDoc && (
            <button
              onClick={onExportToGoogleDoc}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-bold transition-all shadow-[0_0_15px_rgba(37,99,235,0.4)] flex items-center gap-2"
            >
              <FileText className="w-4 h-4 text-blue-200" />
              Export to Google Docs
            </button>
          )}

          <button
            onClick={handleCopy}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold transition-all shadow-[0_0_15px_rgba(79,70,229,0.4)] flex items-center gap-2"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied Summary!' : 'Copy Executive Paragraph'}
          </button>
        </div>
      </div>

      {/* Main Single-Paragraph Summary Box */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 sm:p-8 rounded-2xl bg-[#090a0f] border border-white/10 shadow-2xl space-y-4 relative overflow-hidden"
      >
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <span className="text-[10px] font-mono font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Executive Briefing Statement
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            {currentText.split(/\s+/).filter(Boolean).length} Words Input · {stations.length} Stations Analyzed
          </span>
        </div>

        <p className="text-sm sm:text-base font-sans text-slate-200 leading-relaxed tracking-wide bg-black/40 p-5 rounded-xl border border-indigo-500/20 shadow-inner italic">
          "{executiveSummaryParagraph}"
        </p>

        {/* Action Shortcuts */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-3">
            <button
              onClick={onJumpToMap}
              className="px-3.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors flex items-center gap-1.5"
            >
              Inspect Transit Map <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
            </button>
            <button
              onClick={onJumpToDebate}
              className="px-3.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors flex items-center gap-1.5"
            >
              Debate Vulnerabilities <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
            </button>
          </div>

          <span className="text-[10px] text-slate-500 italic">
            Auto-generated by Thought-Line AI Engine
          </span>
        </div>
      </motion.div>

      {/* Key Executive Takeaways Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {keyTakeaways.map((item, idx) => (
          <div
            key={idx}
            className="p-4 rounded-xl bg-slate-900/80 border border-white/10 space-y-2 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                  {item.title}
                </span>
                <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold ${
                  item.status === 'VALIDATED' || item.status === 'HIGH' || item.status === 'CLEAR'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                  {item.status}
                </span>
              </div>
              <p className="text-xs text-slate-200 font-mono leading-relaxed line-clamp-3">
                {item.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
