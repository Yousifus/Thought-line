import { SavedSession } from '../types';
import { Clock, ArrowRight, Trash2, X, MapPin, AlertTriangle, RefreshCw, Sparkles, ArrowRightLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SessionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: SavedSession[];
  onSelectSession: (session: SavedSession) => void;
  onClearHistory: () => void;
  onOpenCompare?: () => void;
}

export function SessionHistoryModal({
  isOpen,
  onClose,
  sessions,
  onSelectSession,
  onClearHistory,
  onOpenCompare
}: SessionHistoryModalProps) {
  if (!isOpen) return null;

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
      ' · ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-2xl bg-[#090a0f] border border-indigo-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        >
          {/* Header */}
          <div className="p-4 sm:p-5 bg-gradient-to-r from-indigo-950/50 via-slate-900 to-slate-950 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30">
                <Clock className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  Session History
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono font-bold">
                    Last {sessions.length} Saved
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Automatically saved in local storage. Click any past run to revisit its map & feedback.
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

          {/* List of Sessions */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
            {sessions.length === 0 ? (
              <div className="py-12 text-center text-slate-500 font-mono text-xs space-y-2">
                <Clock className="w-8 h-8 mx-auto text-slate-600 opacity-50" />
                <p>No saved sessions yet.</p>
                <p className="text-[11px] text-slate-600">Analyze an argument draft to start building your history stack.</p>
              </div>
            ) : (
              sessions.map((session, idx) => {
                const deadEnds = session.result.stations.filter(s => s.type === 'DEAD_END').length;
                const loops = session.result.stations.filter(s => s.type === 'LOOP').length;
                const strongLinks = session.result.stations.filter(s => s.type === 'STRONG_LINK').length;

                return (
                  <div
                    key={session.id}
                    onClick={() => {
                      onSelectSession(session);
                      onClose();
                    }}
                    className="group p-4 rounded-xl bg-slate-900/80 hover:bg-indigo-950/30 border border-white/10 hover:border-indigo-500/40 transition-all cursor-pointer flex flex-col gap-3 shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-indigo-300 border border-white/10">
                          #{sessions.length - idx}
                        </span>
                        <span className="text-xs font-mono text-slate-400">
                          {formatDate(session.timestamp)}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[10px] font-mono">
                        <span className="flex items-center gap-1 text-green-400">
                          <MapPin className="w-3 h-3" /> {strongLinks} Links
                        </span>
                        {loops > 0 && (
                          <span className="flex items-center gap-1 text-amber-400">
                            <RefreshCw className="w-3 h-3" /> {loops} Loops
                          </span>
                        )}
                        {deadEnds > 0 && (
                          <span className="flex items-center gap-1 text-red-400">
                            <AlertTriangle className="w-3 h-3" /> {deadEnds} Dead Ends
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-slate-200 font-mono line-clamp-2 leading-relaxed bg-black/40 p-2.5 rounded-lg border border-white/5 italic group-hover:border-indigo-500/30 transition-colors">
                      "{session.textSnippet}"
                    </p>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">
                        {session.result.critiques.length} Structural Critiques
                      </span>
                      <span className="text-xs font-mono text-indigo-400 group-hover:text-indigo-300 font-bold flex items-center gap-1 transition-colors">
                        Revisit Version <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {sessions.length > 0 && (
            <div className="p-4 bg-slate-950 border-t border-white/10 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClearHistory}
                className="text-xs font-mono text-slate-500 hover:text-red-400 flex items-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Local History
              </button>

              <div className="flex items-center gap-2">
                {onOpenCompare && sessions.length >= 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCompare();
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    Compare Sessions Diff
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-mono text-white transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
