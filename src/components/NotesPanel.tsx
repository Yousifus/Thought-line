import { useMemo, useState } from 'react';
import { Station, PersonaCritiqueResult } from '../types';
import { History, TrendingUp, Users, ShieldAlert, Sparkles, Loader2, Copy, Check, ArrowRight, CornerDownRight } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { ModelCouncilSection } from './ModelCouncilSection';

interface CounterArgResult {
  counterTitle: string;
  rebuttalText: string;
  weakPoints: string[];
  suggestedPivot: string;
}

interface NotesPanelProps {
  critiques: string[];
  stations?: Station[];
  currentText?: string;
  onOpenDebate?: () => void;
}

export function NotesPanel({ critiques, stations = [], currentText = '', onOpenDebate }: NotesPanelProps) {
  const [councilResults, setCouncilResults] = useState<PersonaCritiqueResult[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>(stations[0]?.id || '');
  const [isGeneratingCounter, setIsGeneratingCounter] = useState(false);
  const [counterResult, setCounterResult] = useState<CounterArgResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [counterHistory, setCounterHistory] = useState<{ stationLabel: string; result: CounterArgResult }[]>([]);

  const activeStation = stations.find((s) => s.id === selectedStationId) || stations[0];

  const handleGenerateCounterArg = async () => {
    if (!activeStation) return;
    setIsGeneratingCounter(true);
    setCounterResult(null);

    try {
      const response = await fetch('/api/counter-argument', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationLabel: activeStation.label,
          stationSummary: activeStation.summary,
          fullContext: currentText,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate counter-argument');
      const data: CounterArgResult = await response.json();
      setCounterResult(data);
      setCounterHistory((prev) => [{ stationLabel: activeStation.label, result: data }, ...prev]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingCounter(false);
    }
  };

  const handleCopyRebuttal = () => {
    if (!counterResult) return;
    const textToCopy = `[COUNTER-ARGUMENT REBUTTAL] ${counterResult.counterTitle}\n\nRebuttal: ${counterResult.rebuttalText}\n\nWeak Points:\n${counterResult.weakPoints.map(p => `• ${p}`).join('\n')}\n\nSuggested Pivot: ${counterResult.suggestedPivot}`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate evolutionary argument intensity data across the sequence of stations/debate points
  const chartData = useMemo(() => {
    if (!stations || stations.length === 0) {
      // Fallback baseline curve if stations array is empty
      return [
        { name: 'St. 1', tension: 35, conviction: 90, voiceDrift: 15 },
        { name: 'St. 2', tension: 65, conviction: 70, voiceDrift: 40 },
        { name: 'St. 3', tension: 85, conviction: 55, voiceDrift: 75 },
        { name: 'St. 4', tension: 45, conviction: 85, voiceDrift: 30 },
      ];
    }

    return stations.map((st, idx) => {
      let tension = 40;
      let voiceDrift = 25;
      let conviction = 80;

      if (st.type === 'DEAD_END') {
        tension = 88;
        voiceDrift = 82;
        conviction = 45;
      } else if (st.type === 'LOOP') {
        tension = 68;
        voiceDrift = 55;
        conviction = 62;
      } else {
        // STRONG_LINK
        tension = 30 + (idx * 5) % 25;
        voiceDrift = 15 + (idx * 8) % 20;
        conviction = 85 + (idx * 3) % 15;
      }

      return {
        name: `S${idx + 1}`,
        fullLabel: st.label,
        type: st.type,
        tension,
        voiceDrift,
        conviction
      };
    });
  }, [stations]);

  // Compute summary stats
  const peakTension = Math.max(...chartData.map((d) => d.tension), 0);
  const avgDrift = Math.round(
    chartData.reduce((acc, curr) => acc + curr.voiceDrift, 0) / (chartData.length || 1)
  );

  return (
    <div className="flex-1 w-full flex flex-col justify-between space-y-6">
      <div className="space-y-6">
        {/* Visualization Card: Argument Evolution & Intensity */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-indigo-500/25 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-[10px] uppercase tracking-widest text-slate-300 font-mono font-bold">
                Debate Tension & Evolution
              </span>
            </div>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold uppercase">
              Intensity Profile
            </span>
          </div>

          {/* Sparkline Metrics summary */}
          <div className="grid grid-cols-2 gap-2 text-left">
            <div className="p-2 rounded bg-white/5 border border-white/5">
              <span className="text-[9px] font-mono uppercase text-slate-400 block">Peak Tension</span>
              <span className={`text-sm font-mono font-bold ${peakTension > 75 ? 'text-red-400' : 'text-amber-400'}`}>
                {peakTension}%
              </span>
            </div>
            <div className="p-2 rounded bg-white/5 border border-white/5">
              <span className="text-[9px] font-mono uppercase text-slate-400 block">Avg. Voice Drift</span>
              <span className="text-sm font-mono font-bold text-indigo-300">
                {avgDrift}%
              </span>
            </div>
          </div>

          {/* Recharts Area Chart */}
          <div className="h-32 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTension" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorDrift" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="name" 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={{ stroke: '#334155' }} 
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={9} 
                  domain={[0, 100]} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="p-2.5 rounded-lg bg-slate-900 border border-indigo-500/40 text-xs shadow-2xl space-y-1">
                          <p className="font-bold text-white font-mono text-[11px] border-b border-white/10 pb-1">
                            {data.fullLabel || data.name}
                          </p>
                          <div className="flex items-center justify-between gap-3 text-[10px] font-mono text-red-400">
                            <span>Tension:</span>
                            <span className="font-bold">{data.tension}%</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 text-[10px] font-mono text-indigo-300">
                            <span>Voice Drift:</span>
                            <span className="font-bold">{data.voiceDrift}%</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 text-[10px] font-mono text-green-400">
                            <span>Conviction:</span>
                            <span className="font-bold">{data.conviction}%</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="tension" 
                  stroke="#ef4444" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorTension)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="voiceDrift" 
                  stroke="#818cf8" 
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  fillOpacity={1} 
                  fill="url(#colorDrift)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-center gap-4 text-[9px] font-mono text-slate-400 pt-1">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span> Logical Tension
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block"></span> Voice Drift
            </span>
          </div>
        </div>

        {/* Structural Notes */}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3 block">
            Sparring Partner Notes
          </label>
          <div className="space-y-3">
            {critiques.map((critique, idx) => {
              const colors = [
                'bg-indigo-950/20 border-indigo-500/40 text-indigo-300',
                'bg-amber-950/20 border-amber-500/40 text-amber-400',
                'bg-red-950/20 border-red-500/40 text-red-400',
              ];
              const colorClass = colors[idx % colors.length];
              const [bg, border, text] = colorClass.split(' ');

              return (
                <div key={idx} className={`p-3.5 rounded-lg border-l-2 ${bg} ${border}`}>
                  <p className={`text-[11px] font-semibold mb-1 italic uppercase ${text}`}>
                    {String(idx + 1).padStart(2, '0')} / Structural Note
                  </p>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    {critique}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Counter-Argument Generator Card */}
        <div className="p-4 rounded-xl bg-slate-950/90 border border-indigo-500/30 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-indigo-400" />
              <span className="text-[10px] uppercase tracking-widest text-white font-mono font-bold">
                Counter-Argument Generator
              </span>
            </div>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase font-bold">
              Devil's Advocate
            </span>
          </div>

          <p className="text-[11px] text-slate-400">
            Target any station on your map to generate an immediate AI-driven rebuttal and expose logical blindspots.
          </p>

          {/* Station Selector + Button */}
          <div className="space-y-2">
            {stations.length > 0 && (
              <select
                value={selectedStationId || stations[0]?.id}
                onChange={(e) => setSelectedStationId(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white outline-none focus:border-indigo-500"
              >
                {stations.map((st, i) => (
                  <option key={st.id} value={st.id}>
                    St. {i + 1}: {st.label} ({st.type})
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={handleGenerateCounterArg}
              disabled={isGeneratingCounter || !stations.length}
              className="w-full py-2.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2 uppercase tracking-wider"
            >
              {isGeneratingCounter ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  Drafting Counter-Argument...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-indigo-300" />
                  Suggest Counter-Argument
                </>
              )}
            </button>
          </div>

          {/* Render Active Counter Result */}
          {counterResult && (
            <div className="p-3.5 rounded-xl bg-slate-900 border border-indigo-500/40 space-y-2.5 text-left text-xs font-mono mt-3">
              <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                <span className="font-bold text-rose-300 uppercase text-[11px] flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                  {counterResult.counterTitle}
                </span>
                <button
                  onClick={handleCopyRebuttal}
                  className="p-1 rounded bg-white/10 hover:bg-white/20 text-slate-300 transition-colors"
                  title="Copy rebuttal"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              <p className="text-slate-200 leading-relaxed italic bg-black/40 p-2.5 rounded border border-white/5">
                "{counterResult.rebuttalText}"
              </p>

              {/* Weak Points */}
              {counterResult.weakPoints.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] text-amber-400 font-bold uppercase block">
                    Key Vulnerabilities Discovered:
                  </span>
                  <ul className="space-y-1 pl-2">
                    {counterResult.weakPoints.map((point, pIdx) => (
                      <li key={pIdx} className="text-[11px] text-slate-300 flex items-start gap-1.5">
                        <span className="text-amber-500 font-bold">•</span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Suggested Pivot */}
              <div className="pt-1.5 border-t border-white/10 text-[11px]">
                <span className="text-indigo-400 font-bold uppercase block text-[10px] mb-0.5">
                  Suggested Strategic Pivot:
                </span>
                <p className="text-slate-300">{counterResult.suggestedPivot}</p>
              </div>
            </div>
          )}
        </div>

        {/* Model Council Section Collapsible */}
        <div className="pt-2">
          <ModelCouncilSection
            currentText={currentText}
            results={councilResults}
            onUpdateResults={setCouncilResults}
            isCollapsible={true}
          />
        </div>
      </div>

      <div className="mt-6 space-y-2 pt-4 border-t border-white/5">
        {onOpenDebate && (
          <button
            onClick={onOpenDebate}
            className="w-full py-3 px-4 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 rounded text-xs font-mono tracking-widest text-indigo-300 hover:text-white transition-all uppercase font-bold flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(79,70,229,0.2)]"
          >
            <History className="w-4 h-4 text-indigo-400" />
            Launch Past Self Debate
          </button>
        )}

        <button className="w-full py-2 border border-white/10 hover:border-white/20 rounded text-[10px] font-mono tracking-widest text-slate-500 hover:text-slate-300 transition-all uppercase">
          Export Diagnostic Log
        </button>
      </div>
    </div>
  );
}



