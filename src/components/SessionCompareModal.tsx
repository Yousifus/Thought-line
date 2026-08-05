import { useState, useMemo } from 'react';
import { SavedSession, Station } from '../types';
import { X, ArrowRightLeft, Clock, MapPin, AlertTriangle, RefreshCw, CheckCircle2, Plus, Minus, ArrowRight, Sparkles, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SessionCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: SavedSession[];
  onSelectSession: (session: SavedSession) => void;
}

export function SessionCompareModal({
  isOpen,
  onClose,
  sessions,
  onSelectSession,
}: SessionCompareModalProps) {
  if (!isOpen) return null;

  // Default Session A to 2nd most recent (index 1) and Session B to most recent (index 0)
  const [sessionAId, setSessionAId] = useState<string>(
    sessions.length >= 2 ? sessions[1].id : sessions[0]?.id || ''
  );
  const [sessionBId, setSessionBId] = useState<string>(
    sessions[0]?.id || ''
  );

  const sessionA = useMemo(() => sessions.find((s) => s.id === sessionAId), [sessions, sessionAId]);
  const sessionB = useMemo(() => sessions.find((s) => s.id === sessionBId), [sessions, sessionBId]);

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return (
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
      ' · ' +
      d.toLocaleDateString([], { month: 'short', day: 'numeric' })
    );
  };

  // Compute Diffs
  const diffMetrics = useMemo(() => {
    if (!sessionA || !sessionB) return null;

    const wordCountA = sessionA.fullText.split(/\s+/).filter(Boolean).length;
    const wordCountB = sessionB.fullText.split(/\s+/).filter(Boolean).length;
    const wordDiff = wordCountB - wordCountA;

    const stationsA = sessionA.result.stations;
    const stationsB = sessionB.result.stations;
    const stationDiff = stationsB.length - stationsA.length;

    const deadEndsA = stationsA.filter((s) => s.type === 'DEAD_END').length;
    const deadEndsB = stationsB.filter((s) => s.type === 'DEAD_END').length;
    const deadEndsDiff = deadEndsB - deadEndsA;

    const loopsA = stationsA.filter((s) => s.type === 'LOOP').length;
    const loopsB = stationsB.filter((s) => s.type === 'LOOP').length;
    const loopsDiff = loopsB - loopsA;

    const linksA = stationsA.filter((s) => s.type === 'STRONG_LINK').length;
    const linksB = stationsB.filter((s) => s.type === 'STRONG_LINK').length;
    const linksDiff = linksB - linksA;

    // Station changes
    const labelsA = new Set(stationsA.map((s) => s.label.toLowerCase()));
    const labelsB = new Set(stationsB.map((s) => s.label.toLowerCase()));

    const addedStations = stationsB.filter((s) => !labelsA.has(s.label.toLowerCase()));
    const removedStations = stationsA.filter((s) => !labelsB.has(s.label.toLowerCase()));
    const keptStations = stationsB.filter((s) => labelsA.has(s.label.toLowerCase()));

    return {
      wordCountA,
      wordCountB,
      wordDiff,
      stationDiff,
      deadEndsA,
      deadEndsB,
      deadEndsDiff,
      loopsA,
      loopsB,
      loopsDiff,
      linksA,
      linksB,
      linksDiff,
      addedStations,
      removedStations,
      keptStations,
    };
  }, [sessionA, sessionB]);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-4xl bg-[#08090d] border border-indigo-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-4 sm:p-5 bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-950 border-b border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30">
                <ArrowRightLeft className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  Session Compare & Map Evolution
                </h3>
                <p className="text-xs text-slate-400">
                  Analyze structural changes, resolved loops, and argument shifts between two draft checkpoints.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Session Pickers Toolbar */}
          <div className="p-4 bg-black/60 border-b border-white/10 grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
            {/* Session A Dropdown */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-indigo-300 uppercase tracking-wider font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                Base Session (Version A):
              </label>
              <select
                value={sessionAId}
                onChange={(e) => setSessionAId(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-indigo-500"
              >
                {sessions.map((s, idx) => (
                  <option key={s.id} value={s.id}>
                    #{sessions.length - idx} · {formatDate(s.timestamp)} ({s.result.stations.length} stns)
                  </option>
                ))}
              </select>
            </div>

            {/* Session B Dropdown */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-cyan-300 uppercase tracking-wider font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                Compared Session (Version B):
              </label>
              <select
                value={sessionBId}
                onChange={(e) => setSessionBId(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-cyan-500"
              >
                {sessions.map((s, idx) => (
                  <option key={s.id} value={s.id}>
                    #{sessions.length - idx} · {formatDate(s.timestamp)} ({s.result.stations.length} stns)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Main Diff Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {(!sessionA || !sessionB) ? (
              <div className="py-12 text-center text-slate-500 font-mono text-xs">
                Please select two sessions to view their comparison.
              </div>
            ) : sessionAId === sessionBId ? (
              <div className="py-12 text-center text-slate-400 font-mono text-xs space-y-2">
                <ArrowRightLeft className="w-8 h-8 mx-auto text-indigo-400/50" />
                <p>You have selected the same session for Version A and Version B.</p>
                <p className="text-[11px] text-slate-500">Pick two different saved sessions above to view structural diffs.</p>
              </div>
            ) : diffMetrics && (
              <>
                {/* Metric Summary Cards Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Word Count Diff */}
                  <div className="bg-slate-900/80 border border-white/10 p-3 rounded-xl flex flex-col justify-between">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Word Count</span>
                    <div className="flex items-baseline justify-between mt-2">
                      <span className="text-lg font-mono font-bold text-white">{diffMetrics.wordCountB}</span>
                      <span className={`text-xs font-mono font-bold ${
                        diffMetrics.wordDiff > 0 ? 'text-green-400' : diffMetrics.wordDiff < 0 ? 'text-amber-400' : 'text-slate-500'
                      }`}>
                        {diffMetrics.wordDiff > 0 ? `+${diffMetrics.wordDiff}` : diffMetrics.wordDiff}
                      </span>
                    </div>
                  </div>

                  {/* Stations Count Diff */}
                  <div className="bg-slate-900/80 border border-white/10 p-3 rounded-xl flex flex-col justify-between">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Transit Stations</span>
                    <div className="flex items-baseline justify-between mt-2">
                      <span className="text-lg font-mono font-bold text-white">{sessionB.result.stations.length}</span>
                      <span className={`text-xs font-mono font-bold ${
                        diffMetrics.stationDiff > 0 ? 'text-green-400' : diffMetrics.stationDiff < 0 ? 'text-rose-400' : 'text-slate-500'
                      }`}>
                        {diffMetrics.stationDiff > 0 ? `+${diffMetrics.stationDiff}` : diffMetrics.stationDiff}
                      </span>
                    </div>
                  </div>

                  {/* Loops Diff */}
                  <div className="bg-slate-900/80 border border-white/10 p-3 rounded-xl flex flex-col justify-between">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Logical Loops</span>
                    <div className="flex items-baseline justify-between mt-2">
                      <span className="text-lg font-mono font-bold text-amber-400">{diffMetrics.loopsB}</span>
                      <span className={`text-xs font-mono font-bold ${
                        diffMetrics.loopsDiff < 0 ? 'text-green-400' : diffMetrics.loopsDiff > 0 ? 'text-rose-400' : 'text-slate-500'
                      }`}>
                        {diffMetrics.loopsDiff < 0 ? `${diffMetrics.loopsDiff} (Resolved)` : diffMetrics.loopsDiff > 0 ? `+${diffMetrics.loopsDiff}` : 'No change'}
                      </span>
                    </div>
                  </div>

                  {/* Dead Ends Diff */}
                  <div className="bg-slate-900/80 border border-white/10 p-3 rounded-xl flex flex-col justify-between">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Dead Ends</span>
                    <div className="flex items-baseline justify-between mt-2">
                      <span className="text-lg font-mono font-bold text-rose-400">{diffMetrics.deadEndsB}</span>
                      <span className={`text-xs font-mono font-bold ${
                        diffMetrics.deadEndsDiff < 0 ? 'text-green-400' : diffMetrics.deadEndsDiff > 0 ? 'text-rose-400' : 'text-slate-500'
                      }`}>
                        {diffMetrics.deadEndsDiff < 0 ? `${diffMetrics.deadEndsDiff} (Fixed)` : diffMetrics.deadEndsDiff > 0 ? `+${diffMetrics.deadEndsDiff}` : 'No change'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Station Evolution Breakdown */}
                <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-white/10">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    Station Evolution & Map Structural Diffs
                  </h4>

                  {/* Added Stations */}
                  {diffMetrics.addedStations.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-mono text-green-400 uppercase font-bold flex items-center gap-1">
                        <Plus className="w-3 h-3" /> Newly Added Stations in Version B ({diffMetrics.addedStations.length}):
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {diffMetrics.addedStations.map((stn) => (
                          <div key={stn.id} className="p-2.5 rounded-lg bg-green-950/20 border border-green-500/30 text-xs">
                            <span className="font-bold font-mono text-green-300 block">{stn.label}</span>
                            <span className="text-[11px] text-slate-300 italic block mt-0.5">"{stn.summary}"</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Removed Stations */}
                  {diffMetrics.removedStations.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-mono text-rose-400 uppercase font-bold flex items-center gap-1">
                        <Minus className="w-3 h-3" /> Stations Pruned / Removed from Version A ({diffMetrics.removedStations.length}):
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {diffMetrics.removedStations.map((stn) => (
                          <div key={stn.id} className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-500/30 text-xs">
                            <span className="font-bold font-mono text-rose-300 block line-through">{stn.label}</span>
                            <span className="text-[11px] text-slate-400 italic block mt-0.5">"{stn.summary}"</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Kept/Evolved Stations */}
                  {diffMetrics.keptStations.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-mono text-indigo-300 uppercase font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Maintained Stations ({diffMetrics.keptStations.length}):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {diffMetrics.keptStations.map((stn) => (
                          <span key={stn.id} className="text-[10px] font-mono px-2 py-1 rounded bg-white/5 border border-white/10 text-slate-300">
                            {stn.label} ({stn.type})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Side-by-Side Text Comparison */}
                <div className="space-y-3">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-400" />
                    Side-by-Side Draft Text Comparison
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Version A Text */}
                    <div className="p-3.5 rounded-xl bg-slate-900/90 border border-indigo-500/30 space-y-2">
                      <div className="flex items-center justify-between pb-2 border-b border-white/10">
                        <span className="text-[10px] font-mono font-bold text-indigo-300 uppercase">
                          Version A ({formatDate(sessionA.timestamp)})
                        </span>
                        <button
                          onClick={() => {
                            onSelectSession(sessionA);
                            onClose();
                          }}
                          className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 transition-colors"
                        >
                          Load Version A
                        </button>
                      </div>
                      <p className="text-xs text-slate-300 font-mono leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
                        {sessionA.fullText}
                      </p>
                    </div>

                    {/* Version B Text */}
                    <div className="p-3.5 rounded-xl bg-slate-900/90 border border-cyan-500/30 space-y-2">
                      <div className="flex items-center justify-between pb-2 border-b border-white/10">
                        <span className="text-[10px] font-mono font-bold text-cyan-300 uppercase">
                          Version B ({formatDate(sessionB.timestamp)})
                        </span>
                        <button
                          onClick={() => {
                            onSelectSession(sessionB);
                            onClose();
                          }}
                          className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-600/30 hover:bg-cyan-600 text-cyan-200 transition-colors"
                        >
                          Load Version B
                        </button>
                      </div>
                      <p className="text-xs text-slate-300 font-mono leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
                        {sessionB.fullText}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 bg-slate-950 border-t border-white/10 flex items-center justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-mono text-white transition-colors"
            >
              Close Comparison
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
