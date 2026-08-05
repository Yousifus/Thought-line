export type StationType = 'STRONG_LINK' | 'LOOP' | 'DEAD_END';
export type StationSentiment = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';

export interface StationBranch {
  id: string;
  name: string;
  summary: string;
  type: StationType;
  loopsTo?: string;
  sentiment?: StationSentiment;
}

export interface Station {
  id: string;
  label: string;
  summary: string;
  type: StationType;
  loopsTo?: string; // id of the station it loops back to
  sentiment?: StationSentiment;
  branches?: StationBranch[];
  activeBranchId?: string;
}

export interface AnalysisResult {
  stations: Station[];
  interchanges: string[]; // ids of stations that are interchanges
  critiques: string[];
}

export type ChallengeType = 'LOGICAL_SHIFT' | 'VOICE_DRIFT' | 'EVIDENCE_GAP' | 'PREMISE_FLIP';

export interface DebateExchange {
  id: string;
  pastSelfQuote: string;
  currentClaim: string;
  challengeType: ChallengeType;
  pastSelfQuestion: string;
  defensePrompt: string;
  suggestedDefenseOptions?: string[];
  userDefense?: string;
  pastSelfRebuttal?: string;
}

export interface PastSelfDebateResult {
  personaName: string;
  personaEra: string;
  personaContext: string;
  coreContradiction: string;
  exchanges: DebateExchange[];
}

export interface ModelCouncilPersona {
  id: string;
  name: string;
  role: string;
  description: string;
  iconName?: string;
  isCustom?: boolean;
}

export interface CouncilCritique {
  aspect: string;
  concern: string;
  recommendation: string;
  sentiment: 'CRITICAL' | 'NEUTRAL' | 'FAVORABLE';
}

export interface PersonaCritiqueResult {
  personaId: string;
  personaName: string;
  personaRole: string;
  approvalRating: number; // 0 to 100
  overallVerdict: string;
  critiques: CouncilCritique[];
}

export interface ModelCouncilResponse {
  personaResults: PersonaCritiqueResult[];
}

export interface IntegrityIssue {
  id: string;
  stationId: string;
  type: 'MISSING_PREMISE' | 'LOGICAL_FALLACY' | 'UNLINKED_ARGUMENT' | 'EVIDENCE_GAP' | 'CIRCULAR_LOGIC';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  explanation: string;
  suggestedFix: string;
}

export interface LogicalIntegrityAnalysis {
  overallScore: number; // 0 to 100
  summary: string;
  issues: IntegrityIssue[];
}

export interface SavedSession {
  id: string;
  timestamp: number;
  textSnippet: string;
  fullText: string;
  result: AnalysisResult;
}

export interface PastPersonaPreset {
  id: string;
  title: string;
  era: string;
  description: string;
  sampleText: string;
}


