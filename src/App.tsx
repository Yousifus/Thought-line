import { useState, useEffect } from 'react';
import { AnalysisResult, PersonaCritiqueResult, SavedSession } from './types';
import { InputSection } from './components/InputSection';
import { TransitMap } from './components/TransitMap';
import { NotesPanel } from './components/NotesPanel';
import { PastSelfDebate } from './components/PastSelfDebate';
import { ModelCouncilSection } from './components/ModelCouncilSection';
import { SessionHistoryModal } from './components/SessionHistoryModal';
import { ExecutiveSummaryView } from './components/ExecutiveSummaryView';
import { SessionCompareModal } from './components/SessionCompareModal';
import { GoogleWorkspaceExportModal } from './components/GoogleWorkspaceExportModal';
import { ExportToDocsPayload } from './lib/googleDocsExport';
import { motion, AnimatePresence } from 'motion/react';
import { RotateCcw, Map, History, Users, Clock, FileText, ArrowRightLeft } from 'lucide-react';

const STORAGE_KEY = 'mind_transit_history';

export default function App() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [currentText, setCurrentText] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'map' | 'summary' | 'debate' | 'council'>('map');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [councilResults, setCouncilResults] = useState<PersonaCritiqueResult[]>([]);
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportPayload, setExportPayload] = useState<ExportToDocsPayload>({});

  const handleOpenExportModal = () => {
    setExportPayload({
      title: currentText.trim() ? `Argument Map - ${currentText.trim().slice(0, 35)}...` : undefined,
      originalText: currentText,
      analysis: result,
      councilResponse: councilResults.length > 0 ? { personaResults: councilResults } : undefined,
    });
    setIsExportModalOpen(true);
  };

  // Load session history from local storage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setSessions(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to parse saved session history:', e);
    }
  }, []);

  const saveSessionToHistory = (text: string, analysis: AnalysisResult) => {
    const newSession: SavedSession = {
      id: `session_${Date.now()}`,
      timestamp: Date.now(),
      textSnippet: text.slice(0, 110) + (text.length > 110 ? '...' : ''),
      fullText: text,
      result: analysis
    };

    setSessions((prev) => {
      // Avoid duplicate exact text if re-run, keep max 5
      const filtered = prev.filter((s) => s.fullText !== text);
      const updated = [newSession, ...filtered].slice(0, 5);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to save session to local storage:', err);
      }
      return updated;
    });
  };

  const handleClearHistory = () => {
    setSessions([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error('Failed to clear history from local storage:', err);
    }
  };

  const handleSelectSession = (session: SavedSession) => {
    setCurrentText(session.fullText);
    setResult(session.result);
    setActiveTab('map');
  };

  const handleAnalyze = async (text: string) => {
    setCurrentText(text);
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to analyze text');
      }

      const data = await response.json();
      setResult(data);
      saveSessionToHistory(text, data);
      setActiveTab('map');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemap = () => {
    setResult(null);
    setError(null);
  };

  return (
    <div className="h-screen w-full bg-[#050506] text-slate-100 flex flex-col overflow-hidden font-sans">
      
      {/* Header */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 lg:px-8 bg-[#0a0a0c] shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-sm flex items-center justify-center font-bold text-lg rotate-45 shadow-[0_0_12px_rgba(79,70,229,0.5)]">
              <span className="-rotate-45 block text-white">T</span>
            </div>
            <h1 className="text-xl font-medium tracking-tight text-white hidden sm:block">
              Thought-Line <span className="text-indigo-400 font-bold uppercase text-sm tracking-widest ml-1">Engine</span>
            </h1>
          </div>

          {/* Mode Switcher Header Tabs (when text or result exists) */}
          {(result || currentText.trim().length > 10) && (
            <div className="flex items-center p-1 bg-white/5 border border-white/10 rounded-lg font-mono text-xs">
              <button
                onClick={() => setActiveTab('map')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all ${
                  activeTab === 'map'
                    ? 'bg-indigo-600 text-white font-bold shadow-[0_0_12px_rgba(79,70,229,0.4)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Map className="w-3.5 h-3.5" />
                <span>Transit Map</span>
              </button>

              <button
                onClick={() => setActiveTab('summary')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all ${
                  activeTab === 'summary'
                    ? 'bg-indigo-600 text-white font-bold shadow-[0_0_12px_rgba(79,70,229,0.4)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-indigo-300" />
                <span>Summary</span>
              </button>

              <button
                onClick={() => setActiveTab('debate')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all ${
                  activeTab === 'debate'
                    ? 'bg-indigo-600 text-white font-bold shadow-[0_0_12px_rgba(79,70,229,0.4)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5 text-indigo-300" />
                <span>Past Self Debate</span>
              </button>

              <button
                onClick={() => setActiveTab('council')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all ${
                  activeTab === 'council'
                    ? 'bg-indigo-600 text-white font-bold shadow-[0_0_12px_rgba(79,70,229,0.4)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-indigo-300" />
                <span>Model Council</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isLoading && (
            <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-xs text-green-400 font-mono">ANALYSIS ACTIVE</span>
            </div>
          )}

          {/* Export to Google Docs Header Button */}
          {(result || currentText.trim().length > 10) && (
            <button
              onClick={handleOpenExportModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white transition-all text-xs font-mono uppercase tracking-wider shadow-sm active:scale-95"
              title="Export complete analysis to Google Docs"
            >
              <FileText className="w-3.5 h-3.5 text-blue-100" />
              <span className="hidden md:inline">Google Doc</span>
            </button>
          )}

          {/* Session Compare Button */}
          {sessions.length >= 1 && (
            <button
              onClick={() => setIsCompareOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600/20 border border-indigo-500/40 hover:bg-indigo-600/30 text-indigo-200 transition-colors text-xs font-mono uppercase tracking-wider"
              title="Compare saved session diffs"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-300" />
              <span className="hidden md:inline">Compare</span>
            </button>
          )}

          {/* Session History Button */}
          <button
            onClick={() => setIsHistoryOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-indigo-500/10 border border-indigo-500/30 hover:bg-indigo-500/20 text-indigo-300 transition-colors text-xs font-mono uppercase tracking-wider relative"
            title="View saved session history"
          >
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">History</span>
            {sessions.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-indigo-500 text-white text-[10px] font-bold">
                {sessions.length}
              </span>
            )}
          </button>

          {result && (
            <button
              onClick={handleRemap}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-xs font-mono uppercase tracking-widest text-slate-300"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              New Draft
            </button>
          )}
        </div>
      </header>

      {/* Session History Modal */}
      <SessionHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        sessions={sessions}
        onSelectSession={handleSelectSession}
        onClearHistory={handleClearHistory}
        onOpenCompare={() => setIsCompareOpen(true)}
      />

      {/* Session Compare Modal */}
      <SessionCompareModal
        isOpen={isCompareOpen}
        onClose={() => setIsCompareOpen(false)}
        sessions={sessions}
        onSelectSession={handleSelectSession}
      />

      <main className="flex-1 flex overflow-hidden">
        <AnimatePresence mode="wait">
          {!result && activeTab !== 'debate' && activeTab !== 'council' && activeTab !== 'summary' ? (
            <motion.div 
              key="input-section"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col justify-center items-center p-6 lg:p-12 overflow-y-auto"
            >
              {error && (
                <div className="mb-6 w-full max-w-3xl p-4 rounded-lg bg-red-950/20 border border-red-500/40 text-red-400 text-sm">
                  {error}
                </div>
              )}
              <InputSection 
                onAnalyze={handleAnalyze} 
                isLoading={isLoading} 
                onDirectDebate={(text) => {
                  setCurrentText(text);
                  setActiveTab('debate');
                }}
              />
            </motion.div>
          ) : activeTab === 'summary' ? (
            <motion.div
              key="summary-section"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 p-6 lg:p-12 overflow-y-auto bg-[#050506]"
            >
              {result ? (
                <ExecutiveSummaryView
                  data={result}
                  currentText={currentText}
                  onJumpToMap={() => setActiveTab('map')}
                  onJumpToDebate={() => setActiveTab('debate')}
                  onExportToGoogleDoc={handleOpenExportModal}
                />
              ) : (
                <div className="py-20 text-center text-slate-500 font-mono text-xs">
                  Please submit an argument draft first to generate an Executive Summary.
                </div>
              )}
            </motion.div>
          ) : activeTab === 'debate' ? (
            <motion.div
              key="debate-section"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 p-6 lg:p-12 overflow-y-auto bg-[#050506]"
            >
              <PastSelfDebate currentText={currentText} />
            </motion.div>
          ) : activeTab === 'council' ? (
            <motion.div
              key="council-section"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 p-6 lg:p-12 overflow-y-auto bg-[#050506] max-w-5xl mx-auto w-full"
            >
              <div className="mb-6 space-y-1">
                <h2 className="text-xl font-mono font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-400" />
                  Model Council Review Panel
                </h2>
                <p className="text-xs text-slate-400">
                  Convene executive, technical, end-user, investor, and custom persona reviewers to critique your draft structure.
                </p>
              </div>

              <ModelCouncilSection
                currentText={currentText}
                results={councilResults}
                onUpdateResults={setCouncilResults}
                isCollapsible={false}
              />
            </motion.div>
          ) : (
            <motion.div 
              key="result-section"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col md:flex-row overflow-hidden"
            >
              <aside className="w-full md:w-[380px] border-r border-white/5 flex flex-col p-6 bg-[#0a0a0c]/50 overflow-y-auto shrink-0">
                <div className="mb-6 flex justify-between items-center">
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block">
                    Diagnostic Output
                  </label>
                  <button
                    onClick={handleRemap}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-[10px] font-mono uppercase tracking-widest text-slate-300"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                </div>
                <NotesPanel 
                  critiques={result.critiques} 
                  stations={result.stations} 
                  currentText={currentText}
                  onOpenDebate={() => setActiveTab('debate')} 
                />
              </aside>
              
              <section className="flex-1 bg-[#050506] relative p-6 lg:p-12 overflow-hidden flex flex-col">
                <TransitMap 
                  data={result} 
                  fullText={currentText} 
                  onExportToGoogleDoc={handleOpenExportModal} 
                />
              </section>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Google Workspace Export Modal */}
      <GoogleWorkspaceExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        payload={exportPayload}
      />
    </div>
  );
}

