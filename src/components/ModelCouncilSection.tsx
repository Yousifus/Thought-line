import React, { useState, FormEvent } from 'react';
import { ModelCouncilPersona, PersonaCritiqueResult } from '../types';
import { 
  Users, 
  Plus, 
  Loader2, 
  ChevronDown, 
  ChevronUp, 
  Briefcase, 
  Microscope, 
  UserCheck, 
  TrendingUp, 
  Scale, 
  Sparkles, 
  Check, 
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  Info
} from 'lucide-react';

export const DEFAULT_COUNCIL_PERSONAS: ModelCouncilPersona[] = [
  {
    id: 'exec',
    name: 'Executive Skeptic',
    role: 'CEO / C-Suite Sponsor',
    description: 'Demands bottom-line ROI, strategic clarity, risk mitigation, and quick executive pitch appeal.',
    iconName: 'Briefcase'
  },
  {
    id: 'tech',
    name: 'Technical Peer',
    role: 'Lead Architect / Academic Reviewer',
    description: 'Focuses on technical feasibility, edge cases, methodological rigor, and missing caveats.',
    iconName: 'Microscope'
  },
  {
    id: 'user',
    name: 'Target End User',
    role: 'Primary Customer / Audience',
    description: 'Focuses on clarity of value proposition, friction, jargon, and immediate usability.',
    iconName: 'UserCheck'
  },
  {
    id: 'vc',
    name: 'VC Pitch Critic',
    role: 'Venture Investor',
    description: 'Focuses on defensibility, scalability, market differentiation, moat, and urgency.',
    iconName: 'TrendingUp'
  },
  {
    id: 'philosopher',
    name: 'Pedantic Critic',
    role: 'Epistemologist & Ethicist',
    description: 'Uncovers hidden assumptions, semantic slights of hand, and unstated logical premises.',
    iconName: 'Scale'
  }
];

interface ModelCouncilSectionProps {
  currentText: string;
  results?: PersonaCritiqueResult[];
  onUpdateResults?: (results: PersonaCritiqueResult[]) => void;
  isCollapsible?: boolean;
}

export function ModelCouncilSection({
  currentText,
  results,
  onUpdateResults,
  isCollapsible = true
}: ModelCouncilSectionProps) {
  const [availablePersonas, setAvailablePersonas] = useState<ModelCouncilPersona[]>(DEFAULT_COUNCIL_PERSONAS);
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>(['exec', 'tech', 'user']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Custom persona form state
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [customDesc, setCustomDesc] = useState('');

  // UI state for collapsed council section
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedPersonaId, setExpandedPersonaId] = useState<string | null>(null);

  const togglePersonaSelection = (id: string) => {
    setSelectedPersonaIds((prev) =>
      prev.includes(id) ? prev.filter((pId) => pId !== id) : [...prev, id]
    );
  };

  const handleAddCustomPersona = (e: FormEvent) => {
    e.preventDefault();
    if (!customName.trim() || !customRole.trim()) return;

    const newPersona: ModelCouncilPersona = {
      id: `custom_${Date.now()}`,
      name: customName.trim(),
      role: customRole.trim(),
      description: customDesc.trim() || `Focuses on ${customRole} concerns and expectations.`,
      isCustom: true
    };

    setAvailablePersonas((prev) => [...prev, newPersona]);
    setSelectedPersonaIds((prev) => [...prev, newPersona.id]);
    setCustomName('');
    setCustomRole('');
    setCustomDesc('');
    setShowCustomForm(false);
  };

  const runCouncilAnalysis = async () => {
    if (!currentText || currentText.trim().length < 10) {
      setError('Please enter or select a draft with at least 10 characters.');
      return;
    }

    if (selectedPersonaIds.length === 0) {
      setError('Please select at least one persona for the Model Council.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const selectedPersonas = availablePersonas.filter((p) =>
      selectedPersonaIds.includes(p.id)
    );

    try {
      const response = await fetch('/api/model-council', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentText,
          personas: selectedPersonas
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to analyze council feedback');
      }

      const data = await response.json();
      if (onUpdateResults) {
        onUpdateResults(data.personaResults);
      }
      setIsExpanded(true);
    } catch (err: any) {
      console.error('Council error:', err);
      setError(err.message || 'Error reaching Model Council');
    } finally {
      setIsLoading(false);
    }
  };

  const renderIcon = (iconName?: string) => {
    switch (iconName) {
      case 'Briefcase':
        return <Briefcase className="w-3.5 h-3.5 text-indigo-400" />;
      case 'Microscope':
        return <Microscope className="w-3.5 h-3.5 text-cyan-400" />;
      case 'UserCheck':
        return <UserCheck className="w-3.5 h-3.5 text-emerald-400" />;
      case 'TrendingUp':
        return <TrendingUp className="w-3.5 h-3.5 text-amber-400" />;
      case 'Scale':
        return <Scale className="w-3.5 h-3.5 text-purple-400" />;
      default:
        return <Users className="w-3.5 h-3.5 text-indigo-400" />;
    }
  };

  return (
    <div className="w-full rounded-xl bg-slate-950/90 border border-indigo-500/30 overflow-hidden shadow-2xl transition-all">
      {/* Header Bar */}
      <div className="p-3.5 bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-950 border-b border-indigo-500/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30">
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
              Model Council
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                Persona Critique Panel
              </span>
            </h3>
            <p className="text-[10px] text-slate-400">
              Multi-stakeholder analysis evaluating draft appeal across domain roles
            </p>
          </div>
        </div>

        {isCollapsible && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Body Content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Persona Selector Chips */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] uppercase font-mono tracking-widest text-slate-400 font-semibold block">
                Select Active Council Personas:
              </label>
              <button
                type="button"
                onClick={() => setShowCustomForm(!showCustomForm)}
                className="text-[10px] font-mono text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Custom Persona
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {availablePersonas.map((persona) => {
                const isSelected = selectedPersonaIds.includes(persona.id);
                return (
                  <button
                    key={persona.id}
                    type="button"
                    onClick={() => togglePersonaSelection(persona.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono transition-all flex items-center gap-1.5 border ${
                      isSelected
                        ? 'bg-indigo-950/60 border-indigo-500/60 text-indigo-200 shadow-[0_0_10px_rgba(99,102,241,0.2)]'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                    }`}
                  >
                    {renderIcon(persona.iconName)}
                    <span>{persona.name}</span>
                    {isSelected && <Check className="w-3 h-3 text-indigo-400 ml-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Persona Creation Form */}
          {showCustomForm && (
            <form onSubmit={handleAddCustomPersona} className="p-3 rounded-lg bg-indigo-950/20 border border-indigo-500/30 space-y-2.5">
              <div className="text-[10px] font-mono font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-indigo-400" /> Define Custom Reviewer Persona
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Persona Name (e.g. Compliance Officer)"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="px-2.5 py-1.5 rounded bg-slate-900 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                  required
                />
                <input
                  type="text"
                  placeholder="Role (e.g. Enterprise Security Director)"
                  value={customRole}
                  onChange={(e) => setCustomRole(e.target.value)}
                  className="px-2.5 py-1.5 rounded bg-slate-900 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                  required
                />
              </div>
              <input
                type="text"
                placeholder="Core Priorities & Concerns (e.g. Demands zero data leakage and SOC2 compliance guarantees)"
                value={customDesc}
                onChange={(e) => setCustomDesc(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCustomForm(false)}
                  className="px-3 py-1 rounded text-xs text-slate-400 hover:text-white font-mono"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-bold"
                >
                  Add Persona
                </button>
              </div>
            </form>
          )}

          {/* Execute Council Button */}
          <div className="pt-1">
            <button
              type="button"
              onClick={runCouncilAnalysis}
              disabled={isLoading || !currentText || currentText.trim().length < 10}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-mono font-bold transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 uppercase tracking-wider"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                  Convening Council...
                </>
              ) : (
                <>
                  <Users className="w-3.5 h-3.5 text-white" />
                  Run Model Council Review
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-red-950/30 border border-red-500/40 text-red-300 text-xs font-mono flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Results Display */}
          {results && results.length > 0 && (
            <div className="space-y-3 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold">
                  Council Feedback ({results.length} Personas)
                </span>
                <span className="text-[10px] text-indigo-300 font-mono">
                  Avg. Approval:{' '}
                  <strong className="text-white">
                    {Math.round(
                      results.reduce((acc, r) => acc + r.approvalRating, 0) / results.length
                    )}
                    %
                  </strong>
                </span>
              </div>

              <div className="space-y-3">
                {results.map((res) => {
                  const isPersonaExpanded = expandedPersonaId === res.personaId || expandedPersonaId === null;
                  
                  // Color rating badge based on approval
                  let badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
                  if (res.approvalRating < 50) {
                    badgeColor = 'bg-red-500/20 text-red-300 border-red-500/40';
                  } else if (res.approvalRating < 75) {
                    badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
                  }

                  return (
                    <div
                      key={res.personaId}
                      className="rounded-lg bg-slate-900 border border-white/10 overflow-hidden transition-all"
                    >
                      {/* Persona Summary Header */}
                      <div
                        onClick={() =>
                          setExpandedPersonaId(expandedPersonaId === res.personaId ? null : res.personaId)
                        }
                        className="p-3 bg-white/5 hover:bg-white/10 cursor-pointer flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 rounded bg-slate-800 border border-white/10">
                            {renderIcon(
                              DEFAULT_COUNCIL_PERSONAS.find((p) => p.id === res.personaId)?.iconName
                            )}
                          </div>
                          <div>
                            <span className="text-xs font-mono font-bold text-white block">
                              {res.personaName}
                            </span>
                            <span className="text-[10px] text-slate-400 block font-mono">
                              {res.personaRole}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${badgeColor}`}>
                            {res.approvalRating}% Approval
                          </span>
                          {isPersonaExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                          )}
                        </div>
                      </div>

                      {/* Expanded Details */}
                      {isPersonaExpanded && (
                        <div className="p-3 border-t border-white/5 space-y-2.5 bg-slate-950/40">
                          {/* Overall Verdict */}
                          <div className="p-2.5 rounded bg-indigo-950/20 border-l-2 border-indigo-500">
                            <span className="text-[9px] font-mono uppercase text-indigo-300 font-bold block mb-0.5">
                              Overall Verdict:
                            </span>
                            <p className="text-[11px] text-slate-300 leading-relaxed italic">
                              "{res.overallVerdict}"
                            </p>
                          </div>

                          {/* Critiques breakdown */}
                          <div className="space-y-2">
                            {res.critiques.map((crit, idx) => {
                              let critBorder = 'border-amber-500/30 bg-amber-950/10 text-amber-200';
                              if (crit.sentiment === 'CRITICAL') {
                                critBorder = 'border-red-500/30 bg-red-950/10 text-red-200';
                              } else if (crit.sentiment === 'FAVORABLE') {
                                critBorder = 'border-emerald-500/30 bg-emerald-950/10 text-emerald-200';
                              }

                              return (
                                <div key={idx} className={`p-2.5 rounded border ${critBorder} space-y-1`}>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider">
                                      Aspect: {crit.aspect}
                                    </span>
                                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-black/30 text-slate-300">
                                      {crit.sentiment}
                                    </span>
                                  </div>

                                  <div className="text-[11px] text-slate-300 leading-normal">
                                    <strong className="text-slate-200 font-semibold">Concern: </strong>
                                    {crit.concern}
                                  </div>

                                  <div className="text-[11px] text-indigo-300 leading-normal pt-1 border-t border-white/5">
                                    <strong className="text-indigo-200 font-semibold">Recommendation: </strong>
                                    {crit.recommendation}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
