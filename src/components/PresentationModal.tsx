import { useState, useEffect, useCallback } from 'react';
import { Station, StationBranch, LogicalIntegrityAnalysis } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, ChevronLeft, ChevronRight, Play, Pause, 
  MapPin, AlertTriangle, ShieldAlert, CheckCircle2, 
  GitBranch, Tag, Sparkles, Gauge, Flame, Layers, Layout
} from 'lucide-react';

interface PresentationModalProps {
  isOpen: boolean;
  onClose: () => void;
  stations: Station[];
  interchanges: string[];
  critiques: string[];
  stationTags: Record<string, string[]>;
  stationBranches: Record<string, StationBranch[]>;
  activeBranchIds: Record<string, string>;
  onSelectBranch?: (stationId: string, branchId: string) => void;
  integrityAnalysis: LogicalIntegrityAnalysis | null;
  onJumpToStationInMap?: (stationId: string) => void;
}

export function PresentationModal({
  isOpen,
  onClose,
  stations,
  interchanges,
  critiques,
  stationTags,
  stationBranches,
  activeBranchIds,
  onSelectBranch,
  integrityAnalysis,
  onJumpToStationInMap,
}: PresentationModalProps) {
  // Slide index: 0 = Intro, 1..N = Stations 1..N, N+1 = Summary
  const [slideIndex, setSlideIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playSpeed, setPlaySpeed] = useState<number>(5000); // 5 seconds per slide

  const totalSlides = stations.length + 2; // Intro + N stations + Summary

  // Reset slide index when opening
  useEffect(() => {
    if (isOpen) {
      setSlideIndex(0);
      setIsPlaying(false);
    }
  }, [isOpen]);

  const handleNext = useCallback(() => {
    setSlideIndex((prev) => (prev + 1) % totalSlides);
  }, [totalSlides]);

  const handlePrev = useCallback(() => {
    setSlideIndex((prev) => (prev - 1 + totalSlides) % totalSlides);
  }, [totalSlides]);

  // Auto-play timer
  useEffect(() => {
    if (!isPlaying || !isOpen) return;
    const timer = setInterval(() => {
      handleNext();
    }, playSpeed);
    return () => clearInterval(timer);
  }, [isPlaying, isOpen, playSpeed, handleNext]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Space') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleNext, handlePrev, onClose]);

  if (!isOpen) return null;

  const currentStationIndex = slideIndex - 1;
  const currentStation = slideIndex >= 1 && slideIndex <= stations.length ? stations[currentStationIndex] : null;

  return (
    <div className="fixed inset-0 z-50 bg-[#050508]/95 backdrop-blur-xl flex flex-col text-slate-100 font-sans select-none overflow-hidden">
      
      {/* Presentation Top Control Header */}
      <div className="h-16 px-6 border-b border-white/10 bg-[#0a0a0e] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 font-mono text-xs">
            <Layout className="w-4 h-4 text-indigo-400" />
            <span className="font-bold uppercase tracking-wider">Guided Presentation Mode</span>
          </div>

          <div className="text-xs font-mono text-slate-400 hidden sm:block">
            Slide <strong className="text-white">{slideIndex + 1}</strong> of <strong className="text-white">{totalSlides}</strong>
          </div>
        </div>

        {/* Progress Step Bar */}
        <div className="hidden lg:flex items-center gap-1.5 flex-1 max-w-md mx-8">
          {Array.from({ length: totalSlides }).map((_, idx) => (
            <button
              key={idx}
              onClick={() => setSlideIndex(idx)}
              className={`h-2 rounded-full transition-all flex-1 ${
                idx === slideIndex
                  ? 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.6)]'
                  : idx < slideIndex
                  ? 'bg-indigo-900/60 hover:bg-indigo-700/60'
                  : 'bg-white/10 hover:bg-white/20'
              }`}
              title={`Jump to slide ${idx + 1}`}
            />
          ))}
        </div>

        {/* Controls Right */}
        <div className="flex items-center gap-3">
          {/* Speed Selector */}
          {isPlaying && (
            <select
              value={playSpeed}
              onChange={(e) => setPlaySpeed(Number(e.target.value))}
              className="bg-black/50 border border-white/10 rounded px-2 py-1 text-xs font-mono text-slate-300 outline-none"
            >
              <option value={3000}>3s / slide</option>
              <option value={5000}>5s / slide</option>
              <option value={8000}>8s / slide</option>
            </select>
          )}

          {/* Auto-Play Toggle Button */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all ${
              isPlaying
                ? 'bg-amber-600 text-white border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
            }`}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isPlaying ? 'Pause' : 'Auto-Play'}</span>
          </button>

          {/* Close Modal Button */}
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/15 text-slate-300 hover:text-white transition-colors"
            title="Exit Presentation Mode (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Slide Canvas Area */}
      <div className="flex-1 relative flex items-center justify-center p-6 md:p-12 overflow-y-auto">
        <AnimatePresence mode="wait">
          
          {/* SLIDE 0: INTRO OVERVIEW */}
          {slideIndex === 0 && (
            <motion.div
              key="slide-intro"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.04 }}
              transition={{ duration: 0.3 }}
              className="max-w-4xl w-full bg-[#0a0a0f] border border-white/10 rounded-2xl p-8 md:p-12 shadow-2xl space-y-8"
            >
              <div className="space-y-3 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 font-mono text-xs uppercase tracking-widest">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  Guided Argumentation Deck
                </div>
                <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white">
                  Thought-Line Structural Presentation
                </h1>
                <p className="text-slate-400 text-sm md:text-base max-w-2xl mx-auto font-sans">
                  Step through the logical sequence of arguments node-by-node. Examine structural flow, logical dependencies, sentiment shifts, and alternative perspectives.
                </p>
              </div>

              {/* Quick Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-white/10">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                  <span className="text-2xl font-mono font-bold text-indigo-400">{stations.length}</span>
                  <p className="text-[11px] font-mono text-slate-400 uppercase mt-1">Total Stations</p>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                  <span className="text-2xl font-mono font-bold text-emerald-400">
                    {stations.filter((s) => s.type === 'STRONG_LINK').length}
                  </span>
                  <p className="text-[11px] font-mono text-slate-400 uppercase mt-1">Strong Links</p>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                  <span className="text-2xl font-mono font-bold text-amber-400">
                    {stations.filter((s) => s.type === 'LOOP').length}
                  </span>
                  <p className="text-[11px] font-mono text-slate-400 uppercase mt-1">Loops</p>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                  <span className="text-2xl font-mono font-bold text-rose-400">
                    {stations.filter((s) => s.type === 'DEAD_END').length}
                  </span>
                  <p className="text-[11px] font-mono text-slate-400 uppercase mt-1">Dead Ends</p>
                </div>
              </div>

              {/* Station Jump Selector Grid */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider font-bold">
                  Sequence Nodes Preview
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {stations.map((stn, idx) => {
                    const isInterchange = interchanges.includes(stn.id);
                    return (
                      <button
                        key={stn.id}
                        onClick={() => setSlideIndex(idx + 1)}
                        className="p-3 rounded-xl bg-white/5 hover:bg-indigo-600/20 border border-white/10 hover:border-indigo-500/50 transition-all text-left group flex items-start gap-3"
                      >
                        <div className="w-6 h-6 rounded-md bg-indigo-600/30 text-indigo-300 font-mono text-xs font-bold flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                          {idx + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-200 group-hover:text-white truncate">
                            {stn.label}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate mt-0.5">
                            {stn.summary}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 flex justify-center">
                <button
                  onClick={() => setSlideIndex(1)}
                  className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono font-bold text-sm uppercase tracking-wider flex items-center gap-2 shadow-[0_0_20px_rgba(79,70,229,0.5)] transition-all hover:scale-105"
                >
                  <span>Start Guided Walkthrough</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* SLIDE 1..N: INDIVIDUAL STATION DETAIL */}
          {currentStation && (
            <motion.div
              key={`slide-station-${currentStation.id}`}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.3 }}
              className="max-w-4xl w-full bg-[#0a0a0f] border border-white/10 rounded-2xl p-8 md:p-12 shadow-2xl space-y-8 relative overflow-hidden"
            >
              {/* Top Station Badge Banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white font-mono font-bold text-lg flex items-center justify-center shadow-[0_0_15px_rgba(79,70,229,0.5)]">
                    {currentStationIndex + 1}
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">
                      Station {currentStationIndex + 1} of {stations.length}
                    </span>
                    <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                      {currentStation.label}
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold uppercase border ${
                    currentStation.type === 'STRONG_LINK'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : currentStation.type === 'LOOP'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}>
                    {currentStation.type}
                  </span>

                  {interchanges.includes(currentStation.id) && (
                    <span className="px-3 py-1 rounded-full text-xs font-mono font-bold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                      INTERCHANGE
                    </span>
                  )}
                </div>
              </div>

              {/* One-Sentence Summary Quote Block */}
              <div className="p-6 rounded-2xl bg-indigo-950/20 border border-indigo-500/30 space-y-2">
                <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-wider font-bold block">
                  Core Argumentative Premise:
                </span>
                <p className="text-lg md:text-xl font-medium text-indigo-100 leading-relaxed italic">
                  "{currentStation.summary}"
                </p>
              </div>

              {/* Station Details & Analysis Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Left: Sentiment & Connection Info */}
                <div className="p-5 rounded-xl bg-white/5 border border-white/10 space-y-4">
                  <h4 className="text-xs font-mono text-slate-400 uppercase tracking-wider font-bold flex items-center gap-1.5">
                    <Gauge className="w-4 h-4 text-indigo-400" />
                    Logical Connection & Sentiment
                  </h4>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-mono">Tone Sentiment:</span>
                      <span className={`font-mono font-bold uppercase ${
                        currentStation.sentiment === 'POSITIVE'
                          ? 'text-emerald-400'
                          : currentStation.sentiment === 'NEGATIVE'
                          ? 'text-rose-400'
                          : 'text-sky-400'
                      }`}>
                        {currentStation.sentiment || 'NEUTRAL'}
                      </span>
                    </div>

                    {currentStation.loopsTo && (
                      <div className="p-2.5 rounded bg-amber-950/30 border border-amber-500/30 text-xs font-mono text-amber-200">
                        🔁 Loops back to Station: {currentStation.loopsTo}
                      </div>
                    )}

                    {/* Tags for this station */}
                    {(stationTags[currentStation.id] || []).length > 0 && (
                      <div className="pt-2 border-t border-white/10 space-y-1.5">
                        <span className="text-[10px] font-mono text-slate-400 uppercase">Tags & Annotations:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {stationTags[currentStation.id].map((tag) => (
                            <span key={tag} className="px-2 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/30 text-[10px] font-mono text-indigo-300">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Alternative Branches / Perspectives */}
                <div className="p-5 rounded-xl bg-white/5 border border-white/10 space-y-4">
                  <h4 className="text-xs font-mono text-slate-400 uppercase tracking-wider font-bold flex items-center gap-1.5">
                    <GitBranch className="w-4 h-4 text-cyan-400" />
                    Alternative Branches
                  </h4>

                  {(() => {
                    const branches = stationBranches[currentStation.id] || [];
                    if (branches.length === 0) {
                      return (
                        <p className="text-xs text-slate-500 font-mono italic">
                          No alternative branches added for this station yet.
                        </p>
                      );
                    }
                    return (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {branches.map((b) => {
                          const isSelected = activeBranchIds[currentStation.id] === b.id;
                          return (
                            <div
                              key={b.id}
                              onClick={() => onSelectBranch && onSelectBranch(currentStation.id, b.id)}
                              className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-cyan-950/40 border-cyan-500 text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                                  : 'bg-black/40 border-white/10 text-slate-300 hover:border-white/20'
                              }`}
                            >
                              <div className="flex justify-between items-center font-bold font-mono">
                                <span>{b.name}</span>
                                {isSelected && <span className="text-[10px] uppercase font-bold text-cyan-400">Active</span>}
                              </div>
                              <p className="text-[11px] text-slate-400 mt-1">{b.summary}</p>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

              </div>

              {/* Integrity Vulnerabilities Alert Section if applicable */}
              {integrityAnalysis && (() => {
                const issuesForStation = integrityAnalysis.issues.filter((i) => i.stationId === currentStation.id);
                if (issuesForStation.length === 0) return null;

                return (
                  <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/40 space-y-2">
                    <div className="flex items-center gap-2 text-rose-300 font-mono text-xs font-bold uppercase">
                      <ShieldAlert className="w-4 h-4 text-rose-400" />
                      <span>Logical Integrity Scan Flags ({issuesForStation.length}):</span>
                    </div>
                    {issuesForStation.map((issue) => (
                      <div key={issue.id} className="text-xs space-y-1 pl-6 border-l-2 border-rose-500">
                        <p className="font-bold text-rose-200">{issue.title} [{issue.severity} Severity]</p>
                        <p className="text-slate-300">{issue.explanation}</p>
                        <p className="text-emerald-300 font-mono text-[11px]">💡 Suggested Fix: {issue.suggestedFix}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Jump to Map Button */}
              {onJumpToStationInMap && (
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => {
                      onJumpToStationInMap(currentStation.id);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 text-xs font-mono text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Locate in Interactive Transit Map</span>
                  </button>
                </div>
              )}

            </motion.div>
          )}

          {/* SLIDE N+1: SUMMARY & CONCLUSION */}
          {slideIndex === stations.length + 1 && (
            <motion.div
              key="slide-summary"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.04 }}
              transition={{ duration: 0.3 }}
              className="max-w-4xl w-full bg-[#0a0a0f] border border-white/10 rounded-2xl p-8 md:p-12 shadow-2xl space-y-8"
            >
              <div className="space-y-3 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs uppercase tracking-widest">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Presentation Synthesis
                </div>
                <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
                  Structural Presentation Complete
                </h2>
                <p className="text-slate-400 text-sm max-w-xl mx-auto">
                  You have reviewed all {stations.length} argumentation nodes in the logical sequence.
                </p>
              </div>

              {/* Key Structural Critiques Summary */}
              {critiques.length > 0 && (
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                  <h3 className="text-xs font-mono text-indigo-400 uppercase tracking-wider font-bold">
                    Primary Structural Recommendations:
                  </h3>
                  <div className="space-y-2">
                    {critiques.map((critique, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-300">
                        <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-300 font-mono font-bold flex items-center justify-center shrink-0 mt-0.5 text-[10px]">
                          {idx + 1}
                        </span>
                        <p className="leading-relaxed">{critique}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
                <button
                  onClick={() => setSlideIndex(0)}
                  className="px-6 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-200 font-mono font-bold text-xs uppercase tracking-wider transition-colors"
                >
                  Restart Presentation
                </button>
                <button
                  onClick={onClose}
                  className="px-8 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(79,70,229,0.5)] transition-colors"
                >
                  Return to Transit Map
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Slide Navigation Bottom Bar */}
      <div className="h-16 px-6 border-t border-white/10 bg-[#0a0a0e] flex items-center justify-between shrink-0">
        <button
          onClick={handlePrev}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-200 transition-colors text-xs font-mono font-bold uppercase"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Previous Slide</span>
        </button>

        {/* Slide Counter / Quick Jump */}
        <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
          <span className="hidden sm:inline">Nav: Use ← → keys or Space</span>
        </div>

        <button
          onClick={handleNext}
          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all text-xs font-mono font-bold uppercase shadow-[0_0_15px_rgba(79,70,229,0.4)]"
        >
          <span>Next Slide</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

    </div>
  );
}
