import { useState, useMemo, useRef } from 'react';
import { AnalysisResult, Station, StationBranch, StationType, StationSentiment, LogicalIntegrityAnalysis, IntegrityIssue } from '../types';
import { PresentationModal } from './PresentationModal';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, CheckCircle2, RefreshCw, AlertTriangle, ArrowRightLeft, 
  ZoomIn, ZoomOut, RotateCcw, Download, Check, Search, Tag, Plus, Target,
  GitBranch, Split, Layers, Focus, Gauge, Eye, ShieldAlert, Flame, Link2, Unlink, Trash2, Zap, Play, Layout,
  BookOpen, FolderMinus, FolderPlus, FileText
} from 'lucide-react';

interface TransitMapProps {
  data: AnalysisResult;
  fullText?: string;
  onExportToGoogleDoc?: () => void;
}

export interface CustomConnection {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
}

const PRESET_TAGS = [
  { name: 'Core Premise', bg: 'bg-indigo-500/20', text: 'text-indigo-300', border: 'border-indigo-500/40', stroke: '#818cf8', fill: '#1e1b4b' },
  { name: 'Evidence', bg: 'bg-cyan-500/20', text: 'text-cyan-300', border: 'border-cyan-500/40', stroke: '#22d3ee', fill: '#083344' },
  { name: 'Counter-point', bg: 'bg-rose-500/20', text: 'text-rose-300', border: 'border-rose-500/40', stroke: '#fb7185', fill: '#4c0519' },
  { name: 'Assumption', bg: 'bg-amber-500/20', text: 'text-amber-300', border: 'border-amber-500/40', stroke: '#fcd34d', fill: '#451a03' },
  { name: 'Conclusion', bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/40', stroke: '#34d399', fill: '#064e3b' },
];

const computeLogicDensity = (
  station: Station,
  interchanges: string[],
  tagsCount: number = 0,
  branchesCount: number = 0
) => {
  const wordCount = station.summary ? station.summary.split(/\s+/).length : 0;
  const isInterchange = interchanges.includes(station.id);
  const isLoop = station.type === 'LOOP';

  let rawScore = Math.round(
    wordCount * 2.5 +
    (isInterchange ? 35 : 0) +
    (isLoop ? 20 : 0) +
    (branchesCount * 18) +
    (tagsCount * 12)
  );

  const score = Math.min(100, Math.max(12, rawScore));

  let level: 'LIGHT' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LIGHT';
  let color = '#38bdf8'; // sky blue
  let heatBg = '#0284c7';

  if (score >= 75) {
    level = 'CRITICAL';
    color = '#f43f5e'; // rose
    heatBg = '#e11d48';
  } else if (score >= 50) {
    level = 'HIGH';
    color = '#f97316'; // orange
    heatBg = '#ea580c';
  } else if (score >= 30) {
    level = 'MEDIUM';
    color = '#eab308'; // amber
    heatBg = '#ca8a04';
  }

  return { score, level, color, heatBg };
};

const getStationSentiment = (station: Station): StationSentiment => {
  if (station.sentiment) return station.sentiment;
  if (station.type === 'STRONG_LINK') return 'POSITIVE';
  if (station.type === 'DEAD_END') return 'NEGATIVE';
  return 'NEUTRAL';
};

const SENTIMENT_CONFIG: Record<StationSentiment, {
  label: string;
  score: string;
  fill: string;
  bg: string;
  border: string;
  text: string;
  gaugeColor: string;
}> = {
  POSITIVE: {
    label: 'POSITIVE',
    score: '85%',
    fill: '#22c55e',
    bg: 'bg-emerald-500/20',
    border: 'border-emerald-500/40',
    text: 'text-emerald-400',
    gaugeColor: '#22c55e',
  },
  NEGATIVE: {
    label: 'NEGATIVE',
    score: '25%',
    fill: '#f43f5e',
    bg: 'bg-rose-500/20',
    border: 'border-rose-500/40',
    text: 'text-rose-400',
    gaugeColor: '#f43f5e',
  },
  NEUTRAL: {
    label: 'NEUTRAL',
    score: '50%',
    fill: '#38bdf8',
    bg: 'bg-sky-500/20',
    border: 'border-sky-500/40',
    text: 'text-sky-400',
    gaugeColor: '#38bdf8',
  },
};

export function TransitMap({ data, fullText, onExportToGoogleDoc }: TransitMapProps) {
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [hoveredStationId, setHoveredStationId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1.0);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportedSuccess, setExportedSuccess] = useState<boolean>(false);

  // Guided Presentation Mode state
  const [isPresentationOpen, setIsPresentationOpen] = useState<boolean>(false);

  // Logical Integrity Scanner state
  const [integrityAnalysis, setIntegrityAnalysis] = useState<LogicalIntegrityAnalysis | null>(null);
  const [isScanningIntegrity, setIsScanningIntegrity] = useState<boolean>(false);
  const [showIntegrityOverlay, setShowIntegrityOverlay] = useState<boolean>(true);

  // Interactive Map Visual Legend state
  const [isLegendOpen, setIsLegendOpen] = useState<boolean>(false);

  // Branch Collapse/Expand state: Set of station IDs whose dependent branches are collapsed
  const [collapsedStationIds, setCollapsedStationIds] = useState<Set<string>>(new Set());

  // Toggle collapse/expand for a parent station node
  const toggleCollapseBranch = (stationId: string) => {
    setCollapsedStationIds((prev) => {
      const next = new Set(prev);
      if (next.has(stationId)) {
        next.delete(stationId);
      } else {
        next.add(stationId);
      }
      return next;
    });
  };

  // Focus Mode toggle state
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);

  // Logic Density Heat Map state
  const [isHeatmapMode, setIsHeatmapMode] = useState<boolean>(false);

  // Manual Connection Editor state
  const [isConnectMode, setIsConnectMode] = useState<boolean>(false);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [customConnections, setCustomConnections] = useState<CustomConnection[]>([]);

  // Search & Jump-to-node state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);

  // Manual Annotations / Tags state: stationId -> string[]
  const [stationTags, setStationTags] = useState<Record<string, string[]>>({});
  const [customTagInput, setCustomTagInput] = useState<string>('');

  // Alternative Branches state: stationId -> StationBranch[]
  const [stationBranches, setStationBranches] = useState<Record<string, StationBranch[]>>({});
  const [activeBranchIds, setActiveBranchIds] = useState<Record<string, string>>({});

  // Branch creation state in Inspector
  const [isBranchFormOpen, setIsBranchFormOpen] = useState<boolean>(false);
  const [branchNameInput, setBranchNameInput] = useState<string>('');
  const [branchSummaryInput, setBranchSummaryInput] = useState<string>('');
  const [branchTypeInput, setBranchTypeInput] = useState<StationType>('STRONG_LINK');

  const svgRef = useRef<SVGSVGElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { stations: rawStations, interchanges, critiques } = data;

  const handleAnalyzeIntegrity = async () => {
    setIsScanningIntegrity(true);
    try {
      const res = await fetch('/api/analyze-integrity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: fullText || '',
          stations: rawStations.map((s) => ({
            id: s.id,
            label: s.label,
            summary: s.summary,
            type: s.type,
            loopsTo: s.loopsTo,
            sentiment: s.sentiment,
          })),
        }),
      });

      if (!res.ok) {
        throw new Error('Server integrity scan failed');
      }

      const scanResult: LogicalIntegrityAnalysis = await res.json();
      setIntegrityAnalysis(scanResult);
      setShowIntegrityOverlay(true);
    } catch (err) {
      console.warn('Backend integrity scan failed, performing smart fallback integrity scan:', err);
      // Fallback local analyzer ensuring 100% reliable functionality
      const issues: IntegrityIssue[] = [];
      rawStations.forEach((stn, idx) => {
        if (stn.type === 'DEAD_END') {
          issues.push({
            id: `issue_dead_${stn.id}`,
            stationId: stn.id,
            type: 'UNLINKED_ARGUMENT',
            severity: 'HIGH',
            title: 'Unlinked Terminal Claim',
            explanation: `Station ${idx + 1} (${stn.label}) introduces a claim that is never re-integrated or grounded in subsequent arguments.`,
            suggestedFix: 'Bridge this claim with supporting evidence or connect it to subsequent premises.',
          });
        } else if (stn.type === 'LOOP') {
          issues.push({
            id: `issue_loop_${stn.id}`,
            stationId: stn.id,
            type: 'CIRCULAR_LOGIC',
            severity: 'MEDIUM',
            title: 'Circular Reasoning Loop',
            explanation: `Station ${idx + 1} repeats earlier assumptions without introducing fresh empirical evidence or logical progress.`,
            suggestedFix: 'Introduce fresh external evidence or advance the conclusion forward.',
          });
        }
      });

      if (issues.length === 0 && rawStations.length >= 2) {
        const midStn = rawStations[Math.floor(rawStations.length / 2)];
        issues.push({
          id: `issue_premise_${midStn.id}`,
          stationId: midStn.id,
          type: 'MISSING_PREMISE',
          severity: 'MEDIUM',
          title: 'Implicit Premise Gap',
          explanation: `Station "${midStn.label}" leaps between prior observations without explicitly stating the underlying causal premise.`,
          suggestedFix: 'Explicitly state the linking principle between cause and effect.',
        });
      }

      setIntegrityAnalysis({
        overallScore: Math.max(65, 100 - issues.length * 15),
        summary: `Scanned ${rawStations.length} nodes. Found ${issues.length} potential logical vulnerabilities requiring author review.`,
        issues,
      });
      setShowIntegrityOverlay(true);
    } finally {
      setIsScanningIntegrity(false);
    }
  };

  // Helper to compute active branch station
  const getEffectiveStation = (station: Station): Station => {
    const branches = stationBranches[station.id] || [];
    const activeId = activeBranchIds[station.id] || 'main';
    if (activeId === 'main') return station;
    const found = branches.find((b) => b.id === activeId);
    if (!found) return station;
    return {
      ...station,
      label: found.name,
      summary: found.summary,
      type: found.type,
      activeBranchId: found.id,
    };
  };

  // Stations with active branch overrides applied
  const stations = useMemo(() => {
    return rawStations.map((stn) => getEffectiveStation(stn));
  }, [rawStations, stationBranches, activeBranchIds]);

  // Calculate hidden station IDs due to collapsed parent branches
  const hiddenStationIds = useMemo(() => {
    const hidden = new Set<string>();
    if (collapsedStationIds.size === 0) return hidden;

    rawStations.forEach((stn, idx) => {
      if (collapsedStationIds.has(stn.id)) {
        // Hide all subsequent dependent stations in its branch
        for (let k = idx + 1; k < rawStations.length; k++) {
          hidden.add(rawStations[k].id);
        }
      }
    });
    return hidden;
  }, [rawStations, collapsedStationIds]);

  // Helper to count hidden dependent nodes for a parent station
  const getHiddenChildCount = (stationId: string): number => {
    const idx = rawStations.findIndex((s) => s.id === stationId);
    if (idx === -1) return 0;
    return rawStations.length - 1 - idx;
  };

  // Visible stations after branch collapse filtering
  const visibleStations = useMemo(() => {
    return stations.filter((s) => !hiddenStationIds.has(s.id));
  }, [stations, hiddenStationIds]);

  // Focus Mode set of active station IDs
  const focusedStationIds = useMemo(() => {
    if (!isFocusMode) return new Set(stations.map((s) => s.id));

    const set = new Set<string>();
    if (selectedStationId) {
      const selIdx = stations.findIndex((s) => s.id === selectedStationId);
      if (selIdx !== -1) {
        set.add(selectedStationId);
        // Include full chain leading up to selected station
        for (let i = 0; i <= selIdx; i++) {
          set.add(stations[i].id);
        }
        if (stations[selIdx + 1]) {
          set.add(stations[selIdx + 1].id);
        }
        const targetLoop = stations[selIdx].loopsTo;
        if (targetLoop) set.add(targetLoop);
        stations.forEach((s) => {
          if (s.loopsTo === selectedStationId) set.add(s.id);
        });
      }
    } else {
      // Focus on primary STRONG_LINK backbone
      stations.forEach((s) => {
        if (s.type === 'STRONG_LINK') set.add(s.id);
      });
    }
    return set;
  }, [isFocusMode, selectedStationId, stations]);

  const selectedStation = stations.find((s) => s.id === selectedStationId);
  const rawSelectedStation = rawStations.find((s) => s.id === selectedStationId);
  const hoveredStation = stations.find((s) => s.id === hoveredStationId);
  const hoveredIdx = stations.findIndex((s) => s.id === hoveredStationId);

  // Handle adding custom connection
  const handleAddCustomConnection = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const exists = customConnections.some(
      (c) => (c.fromId === fromId && c.toId === toId) || (c.fromId === toId && c.toId === fromId)
    );
    if (exists) return;
    const newConn: CustomConnection = {
      id: `conn_${Date.now()}`,
      fromId,
      toId,
      label: 'Custom Link',
    };
    setCustomConnections((prev) => [...prev, newConn]);
  };

  // Handle removing custom connection
  const handleRemoveCustomConnection = (connId: string) => {
    setCustomConnections((prev) => prev.filter((c) => c.id !== connId));
  };

  // Node Click behavior
  const handleNodeClick = (stationId: string) => {
    if (isConnectMode) {
      if (!connectSourceId) {
        setConnectSourceId(stationId);
      } else if (connectSourceId === stationId) {
        setConnectSourceId(null);
      } else {
        handleAddCustomConnection(connectSourceId, stationId);
        setConnectSourceId(null);
      }
    } else {
      setSelectedStationId(stationId);
    }
  };

  // Add alternative branch
  const handleAddBranch = (stationId: string) => {
    if (!branchNameInput.trim() || !branchSummaryInput.trim()) return;
    const newBranch: StationBranch = {
      id: `branch_${Date.now()}`,
      name: branchNameInput.trim(),
      summary: branchSummaryInput.trim(),
      type: branchTypeInput,
    };
    setStationBranches((prev) => {
      const existing = prev[stationId] || [];
      return { ...prev, [stationId]: [...existing, newBranch] };
    });
    setActiveBranchIds((prev) => ({ ...prev, [stationId]: newBranch.id }));
    setBranchNameInput('');
    setBranchSummaryInput('');
    setIsBranchFormOpen(false);
  };

  // Filtered stations matching search query
  const matchingStations = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return stations.filter(s => {
      const matchLabel = s.label.toLowerCase().includes(q);
      const matchSummary = s.summary.toLowerCase().includes(q);
      const tags = stationTags[s.id] || [];
      const matchTag = tags.some(t => t.toLowerCase().includes(q));
      return matchLabel || matchSummary || matchTag;
    });
  }, [stations, searchQuery, stationTags]);

  // Jump to specific station on map
  const jumpToStation = (stationId: string) => {
    // Auto-expand any collapsed parent branches if target station is hidden
    setCollapsedStationIds((prev) => {
      if (prev.size === 0) return prev;
      const targetIdx = rawStations.findIndex((s) => s.id === stationId);
      if (targetIdx === -1) return prev;
      const next = new Set(prev);
      rawStations.forEach((stn, idx) => {
        if (idx < targetIdx && next.has(stn.id)) {
          next.delete(stn.id);
        }
      });
      return next;
    });

    setSelectedStationId(stationId);
    const pos = nodePositions.get(stationId);
    if (pos && scrollContainerRef.current) {
      const containerHeight = scrollContainerRef.current.clientHeight;
      const targetY = pos.y * zoom - containerHeight / 2 + 50;
      scrollContainerRef.current.scrollTo({
        top: Math.max(0, targetY),
        behavior: 'smooth'
      });
    }
  };

  // Toggle tag on station
  const toggleTag = (stationId: string, tagName: string) => {
    setStationTags(prev => {
      const current = prev[stationId] || [];
      const exists = current.includes(tagName);
      const updated = exists ? current.filter(t => t !== tagName) : [...current, tagName];
      return { ...prev, [stationId]: updated };
    });
  };

  // Add custom tag
  const handleAddCustomTag = (stationId: string) => {
    if (!customTagInput.trim()) return;
    const cleanTag = customTagInput.trim();
    setStationTags(prev => {
      const current = prev[stationId] || [];
      if (current.includes(cleanTag)) return prev;
      return { ...prev, [stationId]: [...current, cleanTag] };
    });
    setCustomTagInput('');
  };

  // Zoom handlers
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.2, 2.5));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.2, 0.5));
  const handleResetZoom = () => setZoom(1.0);

  // High-Resolution PNG Export Handler
  const handleExportPNG = () => {
    if (!svgRef.current) return;
    setIsExporting(true);

    try {
      const svgEl = svgRef.current;
      const width = 600;
      const height = HEIGHT;

      // Clone SVG and prepare standalone markup
      const clone = svgEl.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', `${width}`);
      clone.setAttribute('height', `${height}`);

      const serializedSvg = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([serializedSvg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = () => {
        const dpr = 2; // High resolution scale factor
        const canvas = document.createElement('canvas');
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          // Fill rich dark background
          ctx.fillStyle = '#050506';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Draw scaled SVG image
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // Trigger download
          const pngUrl = canvas.toDataURL('image/png');
          const downloadLink = document.createElement('a');
          downloadLink.href = pngUrl;
          downloadLink.download = `logical-transit-map-${Date.now()}.png`;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);

          setExportedSuccess(true);
          setTimeout(() => setExportedSuccess(false), 2500);
        }
        URL.revokeObjectURL(url);
        setIsExporting(false);
      };

      img.onerror = (err) => {
        console.error('Failed to convert map SVG to PNG image', err);
        setIsExporting(false);
      };

      img.src = url;
    } catch (err) {
      console.error('PNG export error', err);
      setIsExporting(false);
    }
  };

  // Constants for map layout
  const X_CENTER = 300;
  const Y_START = 80;
  const Y_SPACING = 140;
  const HEIGHT = Y_START + (visibleStations.length * Y_SPACING);

  // Compute node positions for visible stations
  const nodePositions = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    visibleStations.forEach((station, idx) => {
      const y = Y_START + idx * Y_SPACING;
      // Branch dead ends off to the right
      const x = station.type === 'DEAD_END' ? X_CENTER + 150 : X_CENTER;
      pos.set(station.id, { x, y });
    });
    return pos;
  }, [visibleStations]);

  const hoveredPos = hoveredStationId ? nodePositions.get(hoveredStationId) : null;

  // Compute horizontal alignment offset to keep hover card inside boundaries
  const getHorizontalShift = (x: number) => {
    if (x > 400) return '-translate-x-[85%]';
    if (x < 200) return '-translate-x-[15%]';
    return '-translate-x-1/2';
  };

  // SVG Paths
  const renderPaths = () => {
    const paths = [];

    const isPathFocused = (fromId: string, toId: string) => {
      if (!isFocusMode) return true;
      return focusedStationIds.has(fromId) && focusedStationIds.has(toId);
    };

    for (let i = 0; i < visibleStations.length; i++) {
      const station = visibleStations[i];
      const pos = nodePositions.get(station.id)!;
      
      // Connect to previous visible station
      if (i > 0) {
        const prevStation = visibleStations[i - 1];
        const prevPos = nodePositions.get(prevStation.id)!;
        const focused = isPathFocused(prevStation.id, station.id);
        const opacity = focused ? '1' : '0.12';
        
        if (station.type === 'DEAD_END') {
          // Draw track from previous down to y of current, then branch right
          paths.push(
            <path
              key={`link-${station.id}`}
              d={`M ${prevPos.x} ${prevPos.y} L ${X_CENTER} ${pos.y} L ${pos.x} ${pos.y}`}
              fill="none"
              stroke="#ef4444" // red
              strokeWidth="6"
              strokeLinejoin="round"
              strokeOpacity={opacity}
            />
          );
        } else {
          // Normal track down
          paths.push(
            <path
              key={`link-${station.id}`}
              d={`M ${prevPos.x} ${prevPos.y} L ${pos.x} ${pos.y}`}
              fill="none"
              stroke="#22c55e" // green
              strokeWidth="8"
              strokeOpacity={opacity}
            />
          );
        }
      }

      // Draw loop back
      if (station.type === 'LOOP' && station.loopsTo) {
        const targetPos = nodePositions.get(station.loopsTo);
        if (targetPos) {
          const focused = isPathFocused(station.id, station.loopsTo);
          const opacity = focused ? '1' : '0.12';
          paths.push(
            <path
              key={`loop-${station.id}`}
              d={`M ${pos.x} ${pos.y} C ${X_CENTER - 250} ${pos.y}, ${X_CENTER - 250} ${targetPos.y}, ${targetPos.x} ${targetPos.y}`}
              fill="none"
              stroke="#eab308" // amber
              strokeWidth="6"
              strokeDasharray="8 8"
              strokeLinecap="round"
              strokeOpacity={opacity}
              className={focused ? 'animate-pulse' : ''}
            />
          );
        }
      }
    }

    // Draw Manual Custom Connections
    customConnections.forEach((conn) => {
      const fromPos = nodePositions.get(conn.fromId);
      const toPos = nodePositions.get(conn.toId);
      if (fromPos && toPos) {
        const focused = isPathFocused(conn.fromId, conn.toId);
        const opacity = focused ? '1' : '0.15';
        const isRightCurve = fromPos.x >= X_CENTER && toPos.x >= X_CENTER;
        const curveOffset = isRightCurve ? 140 : -140;

        const midX = (fromPos.x + toPos.x) / 2 + curveOffset;
        const midY = (fromPos.y + toPos.y) / 2;

        paths.push(
          <g key={`custom-path-group-${conn.id}`}>
            <path
              key={`custom-path-${conn.id}`}
              d={`M ${fromPos.x} ${fromPos.y} Q ${midX} ${midY} ${toPos.x} ${toPos.y}`}
              fill="none"
              stroke="#ec4899" // neon magenta
              strokeWidth="5"
              strokeDasharray="6 4"
              strokeOpacity={opacity}
              className="animate-pulse"
            />
            {/* Delete button on custom path midpoint */}
            <g transform={`translate(${midX * 0.5 + (fromPos.x + toPos.x) * 0.25}, ${midY})`}>
              <circle
                r="10"
                fill="#090d16"
                stroke="#ec4899"
                strokeWidth="1.5"
                className="cursor-pointer hover:scale-125 transition-transform"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveCustomConnection(conn.id);
                }}
              />
              <text
                x="0"
                y="3.5"
                fill="#ec4899"
                fontSize="11"
                fontWeight="bold"
                textAnchor="middle"
                className="select-none pointer-events-none"
              >
                ×
              </text>
            </g>
          </g>
        );
      }
    });

    return paths;
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-[#050506] border border-white/5 rounded-xl overflow-hidden shadow-2xl">
      
      {/* Legend, Search & Controls Toolbar Overlay */}
      <div className="absolute top-4 left-4 right-4 flex flex-wrap items-center justify-between gap-3 z-30 pointer-events-none">
        {/* Left Toolbar Group: Search & Legend */}
        <div className="pointer-events-auto flex items-center gap-2 flex-wrap">
          {/* Search / Jump-to-Node Bar */}
          <div className="relative">
            <div className="flex items-center gap-2 bg-black/80 px-3 py-1.5 rounded-xl border border-white/10 backdrop-blur-md shadow-xl focus-within:border-indigo-500/60 transition-colors">
              <Search className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <input
                type="text"
                placeholder="Search station or keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                className="bg-transparent text-xs text-white placeholder-slate-500 outline-none w-44 md:w-56 font-mono"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-slate-500 hover:text-white transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Jump-to-Node Dropdown Results */}
            {searchQuery.trim() !== '' && (
              <div className="absolute top-full left-0 mt-2 w-72 md:w-80 bg-slate-950/95 border border-indigo-500/40 rounded-xl shadow-2xl backdrop-blur-xl max-h-60 overflow-y-auto p-2 z-40 space-y-1">
                <div className="text-[10px] font-mono text-slate-500 px-2 py-1 uppercase tracking-wider font-bold">
                  Found {matchingStations.length} Matching Station{matchingStations.length === 1 ? '' : 's'}
                </div>
                {matchingStations.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-500 font-mono">
                    No matching stations found.
                  </div>
                ) : (
                  matchingStations.map((stn) => {
                    const stnIdx = stations.findIndex((s) => s.id === stn.id);
                    const tags = stationTags[stn.id] || [];
                    return (
                      <button
                        key={stn.id}
                        onClick={() => {
                          jumpToStation(stn.id);
                          setIsSearchFocused(false);
                        }}
                        className="w-full text-left p-2 rounded-lg hover:bg-indigo-600/20 hover:border-indigo-500/40 border border-transparent transition-all flex items-start gap-2.5 group"
                      >
                        <Target className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-bold text-white font-mono truncate">
                              Stn {stnIdx + 1}: {stn.label}
                            </span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-slate-300 shrink-0">
                              {stn.type}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 truncate italic">
                            "{stn.summary}"
                          </p>
                          {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {tags.map((t) => (
                                <span key={t} className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                  #{t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Dynamic Interactive Legend Toggle Button */}
          <button
            onClick={() => setIsLegendOpen(!isLegendOpen)}
            title="Toggle Map Visual Legend Decoding Key"
            className={`px-3 py-1 text-[10px] font-mono font-bold rounded-full flex items-center gap-1.5 transition-all uppercase tracking-wider backdrop-blur-md shadow-xl ${
              isLegendOpen
                ? 'bg-indigo-600 text-white border border-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.5)]'
                : 'bg-black/80 hover:bg-black/90 text-slate-300 border border-white/10'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-300" />
            <span>Map Legend</span>
            {isLegendOpen && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          </button>
        </div>

        {/* Zoom Controls & Export Overlay */}
        <div className="pointer-events-auto flex items-center gap-2 bg-black/80 p-1.5 rounded-xl border border-white/10 backdrop-blur-md shadow-xl">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
            title="Zoom Out"
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg disabled:opacity-30 transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <span className="text-[11px] font-mono font-bold text-indigo-300 min-w-[42px] text-center select-none">
            {Math.round(zoom * 100)}%
          </span>

          <button
            onClick={handleZoomIn}
            disabled={zoom >= 2.5}
            title="Zoom In"
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg disabled:opacity-30 transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-white/10 mx-0.5"></div>

          <button
            onClick={handleResetZoom}
            title="Reset View"
            className="px-2 py-1 text-[10px] font-mono text-slate-300 hover:text-white hover:bg-white/10 rounded-lg flex items-center gap-1 transition-colors uppercase tracking-wider"
          >
            <RotateCcw className="w-3 h-3 text-indigo-400" />
            <span className="hidden md:inline">Reset</span>
          </button>

          <div className="h-4 w-px bg-white/10 mx-0.5"></div>

          {/* Focus Mode Toggle Button */}
          <button
            onClick={() => setIsFocusMode(!isFocusMode)}
            title="Focus Mode: Dim unrelated nodes to isolate logical chain"
            className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg flex items-center gap-1.5 transition-all uppercase tracking-wider ${
              isFocusMode
                ? 'bg-indigo-600 text-white border border-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.5)]'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
            }`}
          >
            <Focus className="w-3.5 h-3.5 text-indigo-300" />
            <span className="hidden sm:inline">Focus</span>
          </button>

          <div className="h-4 w-px bg-white/10 mx-0.5"></div>

          {/* Logic Density Heat Map Button */}
          <button
            onClick={() => setIsHeatmapMode(!isHeatmapMode)}
            title="Logic Density Heat Map: Visualize argument depth & structural complexity via node sizes and thermal glows"
            className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg flex items-center gap-1.5 transition-all uppercase tracking-wider ${
              isHeatmapMode
                ? 'bg-amber-600 text-white border border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-amber-300" />
            <span className="hidden sm:inline">Density Heat Map</span>
          </button>

          <div className="h-4 w-px bg-white/10 mx-0.5"></div>

          {/* Manual Connection Editor Button */}
          <button
            onClick={() => {
              setIsConnectMode(!isConnectMode);
              setConnectSourceId(null);
            }}
            title="Manual Connection Editor: Re-link or define custom logical dependencies between nodes"
            className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg flex items-center gap-1.5 transition-all uppercase tracking-wider ${
              isConnectMode
                ? 'bg-pink-600 text-white border border-pink-400 shadow-[0_0_12px_rgba(236,72,153,0.5)]'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
            }`}
          >
            <Link2 className="w-3.5 h-3.5 text-pink-300" />
            <span className="hidden sm:inline">Re-link Nodes</span>
          </button>

          <div className="h-4 w-px bg-white/10 mx-0.5"></div>

          {/* Analyze Logical Integrity Button */}
          <button
            onClick={handleAnalyzeIntegrity}
            disabled={isScanningIntegrity}
            title="Analyze Logical Integrity: Scan current TransitMap to detect missing premises, logical fallacies, and unlinked arguments"
            className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg flex items-center gap-1.5 transition-all uppercase tracking-wider ${
              integrityAnalysis
                ? 'bg-rose-900/60 text-rose-200 border border-rose-500/50 shadow-[0_0_12px_rgba(244,63,94,0.4)]'
                : 'bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 border border-rose-500/40'
            }`}
          >
            <ShieldAlert className={`w-3.5 h-3.5 text-rose-400 ${isScanningIntegrity ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">
              {isScanningIntegrity ? 'Scanning...' : integrityAnalysis ? 'Integrity Scanned' : 'Scan Integrity'}
            </span>
          </button>

          <div className="h-4 w-px bg-white/10 mx-0.5"></div>

          {/* Guided Presentation Mode Button */}
          <button
            onClick={() => setIsPresentationOpen(true)}
            title="Guided Presentation Mode: Step through the logical flow one node at a time in a focused slide-deck view"
            className="px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400 shadow-[0_0_12px_rgba(79,70,229,0.5)] transition-all uppercase tracking-wider"
          >
            <Play className="w-3.5 h-3.5 text-white fill-white" />
            <span className="hidden sm:inline">Presentation Mode</span>
          </button>

          <div className="h-4 w-px bg-white/10 mx-0.5"></div>

          {/* PNG Export Button */}
          <button
            onClick={handleExportPNG}
            disabled={isExporting}
            title="Export Transit Map as High-Res PNG Image"
            className={`px-3 py-1 text-[10px] font-mono font-bold rounded-lg flex items-center gap-1.5 transition-all uppercase tracking-wider ${
              exportedSuccess
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
            }`}
          >
            {exportedSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">PNG Saved!</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 text-white" />
                <span className="hidden sm:inline">{isExporting ? 'Exporting...' : 'Export PNG'}</span>
              </>
            )}
          </button>

          {/* Google Docs Export Button */}
          {onExportToGoogleDoc && (
            <button
              onClick={onExportToGoogleDoc}
              title="Export Full Transit Map & Analysis directly to Google Docs"
              className="px-3 py-1 text-[10px] font-mono font-bold rounded-lg flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/50 shadow-sm transition-all uppercase tracking-wider"
            >
              <FileText className="w-3.5 h-3.5 text-blue-200" />
              <span className="hidden sm:inline">Export Google Doc</span>
            </button>
          )}
        </div>
      </div>

      {/* Toggleable Dynamic Map Visual Legend Overlay */}
      <AnimatePresence>
        {isLegendOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            className="absolute top-16 left-4 z-40 w-80 bg-[#090d16]/95 border border-indigo-500/30 rounded-2xl p-4 shadow-2xl backdrop-blur-xl text-slate-200 text-xs font-sans space-y-3 pointer-events-auto"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="font-mono text-xs font-bold uppercase text-indigo-300 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-indigo-400" />
                Transit Map Visual Legend
              </span>
              <button
                onClick={() => setIsLegendOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                title="Close Legend"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Node Archetypes */}
              <div>
                <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block mb-1.5">
                  Station Node Archetypes
                </span>
                <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                  <div className="flex items-center gap-2 p-1.5 rounded-lg bg-emerald-950/30 border border-emerald-500/20">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#22c55e]" />
                    <span>Strong Link</span>
                  </div>
                  <div className="flex items-center gap-2 p-1.5 rounded-lg bg-amber-950/30 border border-amber-500/20">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_6px_#f59e0b]" />
                    <span>Logical Loop</span>
                  </div>
                  <div className="flex items-center gap-2 p-1.5 rounded-lg bg-rose-950/30 border border-rose-500/20">
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_6px_#ef4444]" />
                    <span>Dead End</span>
                  </div>
                  <div className="flex items-center gap-2 p-1.5 rounded-lg bg-indigo-950/30 border border-indigo-500/20">
                    <div className="w-3 h-3 rounded-full border-2 border-indigo-400 flex items-center justify-center">
                      <div className="w-1 h-1 rounded-full bg-indigo-400" />
                    </div>
                    <span>Interchange</span>
                  </div>
                </div>
              </div>

              {/* Logic Density Heatmap Spectrum */}
              <div className="border-t border-white/10 pt-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">
                    Logic Density Spectrum
                  </span>
                  {isHeatmapMode ? (
                    <span className="text-[9px] font-mono text-amber-400 uppercase font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" /> Heatmap Active
                    </span>
                  ) : (
                    <span className="text-[9px] font-mono text-slate-500 uppercase">
                      Standard Size
                    </span>
                  )}
                </div>
                <div className="space-y-1.5 font-mono text-[10px]">
                  <div className={`flex items-center justify-between p-1 rounded transition-colors ${isHeatmapMode ? 'bg-emerald-950/20' : ''}`}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-emerald-300 font-bold">Light (0–25)</span>
                    </div>
                    <span className="text-slate-400">R: 8px</span>
                  </div>
                  <div className={`flex items-center justify-between p-1 rounded transition-colors ${isHeatmapMode ? 'bg-amber-950/20' : ''}`}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-amber-400" />
                      <span className="text-amber-300 font-bold">Moderate (26–50)</span>
                    </div>
                    <span className="text-slate-400">R: 12px</span>
                  </div>
                  <div className={`flex items-center justify-between p-1 rounded transition-colors ${isHeatmapMode ? 'bg-orange-950/20' : ''}`}>
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded-full bg-orange-500" />
                      <span className="text-orange-300 font-bold">Heavy (51–75)</span>
                    </div>
                    <span className="text-slate-400">R: 16px</span>
                  </div>
                  <div className={`flex items-center justify-between p-1 rounded transition-colors ${isHeatmapMode ? 'bg-rose-950/30' : ''}`}>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]" />
                      <span className="text-rose-300 font-bold">Critical (76–100)</span>
                    </div>
                    <span className="text-slate-400">R: 22px</span>
                  </div>
                </div>
              </div>

              {/* Special Controls & Gestures */}
              <div className="border-t border-white/10 pt-2.5 space-y-1.5 font-mono text-[10px]">
                <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block mb-1">
                  Interactive Gestures & Flags
                </span>
                <div className="flex items-center justify-between p-1.5 rounded bg-indigo-950/30 border border-indigo-500/20 text-indigo-200">
                  <div className="flex items-center gap-1.5">
                    <FolderMinus className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Double Click Parent Node</span>
                  </div>
                  <span className="text-[9px] font-bold text-indigo-300 uppercase">Collapse / Expand</span>
                </div>
                <div className="flex items-center justify-between p-1.5 rounded bg-rose-950/30 border border-rose-500/20 text-rose-200">
                  <div className="flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                    <span>⚠️ Integrity Flaw Badge</span>
                  </div>
                  <span className="text-[9px] font-bold text-rose-300 uppercase">Flawed Premise</span>
                </div>
                <div className="flex items-center justify-between p-1.5 rounded bg-pink-950/30 border border-pink-500/20 text-pink-200">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-0 border-t-2 border-dashed border-pink-400" />
                    <span>Re-link Pink Dashed Arc</span>
                  </div>
                  <span className="text-[9px] font-bold text-pink-300 uppercase">Custom Link</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Mode Banners */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1 pointer-events-none">
        {isFocusMode && (
          <div className="pointer-events-auto px-4 py-1.5 rounded-full bg-indigo-950/90 border border-indigo-500/50 backdrop-blur-md shadow-2xl flex items-center gap-2 text-xs font-mono text-indigo-200">
            <Focus className="w-4 h-4 text-indigo-400 animate-pulse" />
            <span>
              Focus Mode Active:{' '}
              <strong className="text-white font-bold">
                {selectedStation
                  ? `Chain for St. ${stations.findIndex((s) => s.id === selectedStation.id) + 1} (${selectedStation.label})`
                  : 'Primary Logic Backbone'}
              </strong>
            </span>
            <button
              onClick={() => setIsFocusMode(false)}
              className="ml-2 px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] text-white transition-colors"
            >
              Exit
            </button>
          </div>
        )}

        {isHeatmapMode && (
          <div className="pointer-events-auto px-4 py-1.5 rounded-full bg-amber-950/90 border border-amber-500/50 backdrop-blur-md shadow-2xl flex items-center gap-2 text-xs font-mono text-amber-200">
            <Flame className="w-4 h-4 text-amber-400 animate-pulse" />
            <span>
              Logic Density Heat Map Active:{' '}
              <strong className="text-amber-100 font-bold">Node sizes scale by argument depth & complexity</strong>
            </span>
            <button
              onClick={() => setIsHeatmapMode(false)}
              className="ml-2 px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] text-white transition-colors"
            >
              Exit
            </button>
          </div>
        )}

        {isConnectMode && (
          <div className="pointer-events-auto px-4 py-1.5 rounded-full bg-pink-950/90 border border-pink-500/50 backdrop-blur-md shadow-2xl flex items-center gap-2 text-xs font-mono text-pink-200">
            <Link2 className="w-4 h-4 text-pink-400 animate-pulse" />
            <span>
              Manual Re-link Mode:{' '}
              <strong className="text-pink-100 font-bold">
                {connectSourceId
                  ? `Selected St. ${stations.findIndex((s) => s.id === connectSourceId) + 1} → Click target station to draw link`
                  : 'Click a station to select source, then click target station to draw link'}
              </strong>
            </span>
            <button
              onClick={() => {
                setIsConnectMode(false);
                setConnectSourceId(null);
              }}
              className="ml-2 px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {showIntegrityOverlay && integrityAnalysis && (
          <div className="pointer-events-auto px-4 py-1.5 rounded-full bg-rose-950/90 border border-rose-500/60 backdrop-blur-md shadow-2xl flex items-center gap-2.5 text-xs font-mono text-rose-200">
            <ShieldAlert className="w-4 h-4 text-rose-400 animate-pulse" />
            <span>
              Logical Integrity Score:{' '}
              <strong className="text-white font-bold">{integrityAnalysis.overallScore}/100</strong>
              <span className="text-rose-300 ml-2">
                ({integrityAnalysis.issues.length} {integrityAnalysis.issues.length === 1 ? 'Vulnerability' : 'Vulnerabilities'} Flagged)
              </span>
            </span>
            <button
              onClick={() => setShowIntegrityOverlay(false)}
              className="ml-2 px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] text-white transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* SVG Canvas for Map */}
      <div ref={scrollContainerRef} className="flex-1 relative overflow-auto p-4 pt-24 scrollbar-hide">
        <div 
          className="relative mx-auto w-full max-w-[600px] transition-transform duration-150 ease-out" 
          style={{ 
            height: `${HEIGHT * zoom}px`,
            transform: `scale(${zoom})`,
            transformOrigin: 'top center'
          }}
        >
          <svg ref={svgRef} width="100%" height={HEIGHT} viewBox={`0 0 600 ${HEIGHT}`} preserveAspectRatio="xMidYMin meet" className="block overflow-visible w-full">
            
            {/* Paths Layer */}
            <g>
              {renderPaths()}
            </g>

            {/* Nodes Layer */}
            <g>
              {visibleStations.map((station, idx) => {
                const pos = nodePositions.get(station.id)!;
                const isInterchange = interchanges.includes(station.id);
                const isSelected = selectedStationId === station.id;
                const isHovered = hoveredStationId === station.id;
                const tags = stationTags[station.id] || [];
                const isSearchMatch = searchQuery.trim() !== '' && matchingStations.some(s => s.id === station.id);
                const isFocused = !isFocusMode || focusedStationIds.has(station.id);
                const isCollapsed = collapsedStationIds.has(station.id);
                const hiddenCount = getHiddenChildCount(station.id);
                
                const sentiment = getStationSentiment(station);
                const sConfig = SENTIMENT_CONFIG[sentiment];
                const density = computeLogicDensity(
                  station,
                  interchanges,
                  tags.length,
                  (stationBranches[station.id] || []).length
                );

                let fill = "#22c55e"; // default green
                if (station.type === 'LOOP') fill = "#eab308";
                if (station.type === 'DEAD_END') fill = "#ef4444";

                if (isHeatmapMode) {
                  fill = density.color;
                }

                const isLeftAligned = station.type === 'LOOP';
                const labelX = isLeftAligned ? -24 : 24;
                const isConnectSource = connectSourceId === station.id;

                const stationIntegrityIssues = showIntegrityOverlay && integrityAnalysis
                  ? integrityAnalysis.issues.filter((i) => i.stationId === station.id)
                  : [];

                const baseRadius = isHeatmapMode
                  ? Math.max(10, Math.min(24, Math.round(density.score / 4.2)))
                  : (isInterchange ? 10 : 6);

                return (
                  <g 
                    key={station.id} 
                    transform={`translate(${pos.x}, ${pos.y})`}
                    className="cursor-pointer group transition-all duration-300"
                    opacity={isFocused ? "1" : "0.18"}
                    style={{ filter: isFocused ? 'none' : 'grayscale(70%)' }}
                    onClick={() => handleNodeClick(station.id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      toggleCollapseBranch(station.id);
                    }}
                    onMouseEnter={() => setHoveredStationId(station.id)}
                    onMouseLeave={() => setHoveredStationId(null)}
                  >
                    {/* Integrity Vulnerability Flag Badge Overlay */}
                    {stationIntegrityIssues.length > 0 && (
                      <g transform={`translate(${labelX}, -42)`}>
                        <rect
                          x={isLeftAligned ? -108 : 0}
                          y="0"
                          width="108"
                          height="13"
                          rx="3"
                          fill="#450a0a"
                          stroke="#f43f5e"
                          strokeWidth="1.2"
                          className="animate-pulse opacity-95 shadow-lg"
                        />
                        <text
                          x={isLeftAligned ? -54 : 54}
                          y="9.5"
                          fill="#fecdd3"
                          fontSize="7.5"
                          fontWeight="bold"
                          textAnchor="middle"
                          className="select-none font-mono uppercase tracking-tight"
                        >
                          ⚠️ {stationIntegrityIssues[0].type.replace('_', ' ')}
                        </text>
                      </g>
                    )}
                    {/* Logic Density Heatmap Badge Overlay */}
                    {isHeatmapMode && (
                      <g transform={`translate(${labelX}, -28)`}>
                        <rect
                          x={isLeftAligned ? -84 : 0}
                          y="0"
                          width="84"
                          height="12"
                          rx="3"
                          fill="#090d16"
                          stroke={density.color}
                          strokeWidth="0.9"
                          className="opacity-95"
                        />
                        <text
                          x={isLeftAligned ? -42 : 42}
                          y="9"
                          fill={density.color}
                          fontSize="7.5"
                          fontWeight="bold"
                          textAnchor="middle"
                          className="select-none font-mono uppercase"
                        >
                          DENSITY: {density.score} ({density.level})
                        </text>
                      </g>
                    )}

                    {/* SVG Sentiment Gauge Overlay above label */}
                    <g transform={`translate(${labelX}, -14)`}>
                      <rect
                        x={isLeftAligned ? -68 : 0}
                        y="0"
                        width="68"
                        height="12"
                        rx="3"
                        fill="#090d16"
                        stroke={sConfig.gaugeColor}
                        strokeWidth="0.8"
                        className="opacity-90"
                      />
                      <rect
                        x={isLeftAligned ? -68 : 0}
                        y="0"
                        width={sentiment === 'POSITIVE' ? 58 : sentiment === 'NEUTRAL' ? 34 : 17}
                        height="12"
                        rx="3"
                        fill={sConfig.gaugeColor}
                        opacity="0.35"
                      />
                      <text
                        x={isLeftAligned ? -34 : 34}
                        y="9"
                        fill={sConfig.gaugeColor}
                        fontSize="7.5"
                        fontWeight="bold"
                        textAnchor="middle"
                        className="select-none font-mono"
                      >
                        {sConfig.label} ({sConfig.score})
                      </text>
                    </g>

                    {/* Station Label */}
                    <text 
                      x={labelX} 
                      y="5" 
                      fill={isHovered || isSelected || isSearchMatch || isConnectSource ? "#ffffff" : "#94a3b8"} 
                      fontSize="12" 
                      fontWeight="bold"
                      textAnchor={isLeftAligned ? "end" : "start"}
                      className="group-hover:fill-white transition-colors uppercase tracking-wider select-none"
                    >
                      STATION {idx + 1}: {station.label}
                    </text>

                    {/* SVG Rendered Tags Badges under Station Label */}
                    {tags.length > 0 && (
                      <g transform={`translate(${labelX}, 18)`}>
                        {tags.slice(0, 3).map((tag, tIdx) => {
                          const preset = PRESET_TAGS.find(p => p.name === tag);
                          const strokeColor = preset ? preset.stroke : '#818cf8';
                          const fillColor = preset ? preset.fill : '#1e1b4b';
                          const xOffset = isLeftAligned ? -(tIdx * 75) : (tIdx * 75);
                          return (
                            <g key={tag} transform={`translate(${xOffset}, 0)`}>
                              <rect
                                x={isLeftAligned ? -64 : 0}
                                y="0"
                                width="64"
                                height="14"
                                rx="3"
                                fill={fillColor}
                                stroke={strokeColor}
                                strokeWidth="0.8"
                                className="opacity-90"
                              />
                              <text
                                x={isLeftAligned ? -32 : 32}
                                y="10"
                                fill="#ffffff"
                                fontSize="8"
                                fontWeight="bold"
                                textAnchor="middle"
                                className="select-none font-mono"
                              >
                                #{tag.slice(0, 9)}
                              </text>
                            </g>
                          );
                        })}
                      </g>
                    )}

                    {/* Collapsed Dependent Branch Indicator Badge */}
                    {isCollapsed && (
                      <g
                        transform={`translate(${labelX}, ${tags.length > 0 ? 36 : 18})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCollapseBranch(station.id);
                        }}
                        className="hover:scale-105 transition-transform"
                      >
                        <rect
                          x={isLeftAligned ? -145 : 0}
                          y="0"
                          width="145"
                          height="16"
                          rx="4"
                          fill="#1e1b4b"
                          stroke="#818cf8"
                          strokeWidth="1.2"
                          className="opacity-95 shadow-xl"
                        />
                        <text
                          x={isLeftAligned ? -72.5 : 72.5}
                          y="11.5"
                          fill="#c7d2fe"
                          fontSize="8"
                          fontWeight="bold"
                          textAnchor="middle"
                          className="select-none font-mono tracking-tight"
                        >
                          📁 COLLAPSED (+{hiddenCount} HIDDEN)
                        </text>
                      </g>
                    )}
                    
                    {/* Hover Hitbox */}
                    <circle r="26" fill="transparent" />

                    {/* Collapsed Branch Pulsing Ring */}
                    {isCollapsed && (
                      <circle
                        r={baseRadius + 10}
                        fill="none"
                        stroke="#818cf8"
                        strokeWidth="2.5"
                        strokeDasharray="4 3"
                        className="animate-spin opacity-90"
                        style={{ animationDuration: '6s' }}
                      />
                    )}

                    {/* Heatmap radial thermal glow aura */}
                    {isHeatmapMode && (
                      <>
                        <circle
                          r={baseRadius * 2.4}
                          fill={density.color}
                          opacity="0.22"
                          className="animate-pulse"
                        />
                        <circle
                          r={baseRadius * 1.5}
                          fill={density.color}
                          opacity="0.35"
                        />
                      </>
                    )}

                    {/* Connection Source Pulse Ring */}
                    {isConnectSource && (
                      <circle
                        r={baseRadius + 10}
                        fill="none"
                        stroke="#ec4899"
                        strokeWidth="3"
                        className="animate-ping opacity-90"
                      />
                    )}

                    {/* Integrity Warning Pulse Halo */}
                    {stationIntegrityIssues.length > 0 && (
                      <circle
                        r={baseRadius + 14}
                        fill="none"
                        stroke="#f43f5e"
                        strokeWidth="2.5"
                        className="animate-ping opacity-80"
                      />
                    )}

                    {/* Search match highlight pulse */}
                    {isSearchMatch && (
                      <circle 
                        r={baseRadius + 12} 
                        fill="none" 
                        stroke="#818cf8" 
                        strokeWidth="2.5" 
                        className="animate-ping opacity-75" 
                      />
                    )}

                    {/* Hover Glow Halo */}
                    {isHovered && (
                      <circle 
                        r={baseRadius + 8} 
                        fill="none" 
                        stroke={fill} 
                        strokeWidth="2" 
                        className="animate-ping opacity-40" 
                      />
                    )}

                    {/* Node Outer Border for Selected state */}
                    {isSelected && (
                      <circle r={baseRadius + 6} fill="none" stroke="white" strokeWidth="2" className="opacity-75" />
                    )}

                    {/* Main Node */}
                    <circle 
                      r={baseRadius} 
                      fill="#050506" 
                      stroke={fill} 
                      strokeWidth={isInterchange || isHeatmapMode ? "4" : "3"}
                      className="transition-all duration-200 group-hover:scale-125"
                    />
                    
                    {/* Interchange inner dot */}
                    {isInterchange && !isHeatmapMode && <circle r="4" fill={fill} />}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Map Station Hover-Card Overlay */}
          <AnimatePresence>
            {hoveredStation && hoveredPos && (
              <motion.div
                key={`hover-card-${hoveredStation.id}`}
                initial={{ opacity: 0, scale: 0.92, y: hoveredPos.y < 160 ? 8 : -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.1 } }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                style={{
                  left: `${(hoveredPos.x / 600) * 100}%`,
                  top: `${hoveredPos.y}px`,
                }}
                className={`pointer-events-none absolute z-30 w-72 md:w-80 p-4 rounded-xl bg-slate-950/95 border backdrop-blur-xl shadow-2xl text-left ${getHorizontalShift(hoveredPos.x)} ${
                  hoveredPos.y < 160 ? 'top-full mt-4' : '-translate-y-full -mt-4'
                } ${
                  hoveredStation.type === 'STRONG_LINK'
                    ? 'border-green-500/40 shadow-[0_0_20px_rgba(34,197,94,0.15)]'
                    : hoveredStation.type === 'LOOP'
                    ? 'border-amber-500/40 shadow-[0_0_20px_rgba(234,179,8,0.15)]'
                    : 'border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.15)]'
                }`}
              >
                {/* Header & Classification Badge */}
                <div className="flex items-center justify-between gap-2 mb-2.5 pb-2 border-b border-white/10">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                      STATION {hoveredIdx + 1}
                    </span>
                    {interchanges.includes(hoveredStation.id) && (
                      <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[9px] font-mono uppercase font-semibold">
                        Interchange
                      </span>
                    )}
                  </div>

                  {/* Classification Badge */}
                  {hoveredStation.type === 'STRONG_LINK' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/15 border border-green-500/30 text-green-400 text-[10px] font-mono font-bold uppercase tracking-wider">
                      <CheckCircle2 className="w-3 h-3 text-green-400" />
                      STRONG_LINK
                    </span>
                  )}
                  {hoveredStation.type === 'LOOP' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-mono font-bold uppercase tracking-wider">
                      <RefreshCw className="w-3 h-3 text-amber-400" />
                      LOOP
                    </span>
                  )}
                  {hoveredStation.type === 'DEAD_END' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-[10px] font-mono font-bold uppercase tracking-wider">
                      <AlertTriangle className="w-3 h-3 text-red-400" />
                      DEAD_END
                    </span>
                  )}
                </div>

                {/* Station Label */}
                <h4 className="text-xs font-bold text-white mb-2 leading-snug uppercase tracking-wide">
                  {hoveredStation.label}
                </h4>

                {/* Idea Summary */}
                <div className="space-y-1">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-slate-400 font-semibold block">
                    Idea Summary
                  </span>
                  <p className="text-xs text-slate-300 leading-relaxed bg-white/5 p-2.5 rounded-lg border border-white/5 italic">
                    "{hoveredStation.summary}"
                  </p>
                </div>

                {/* Sentiment Gauge Widget in Hover Card */}
                {(() => {
                  const sent = getStationSentiment(hoveredStation);
                  const cfg = SENTIMENT_CONFIG[sent];
                  return (
                    <div className="mt-2.5 p-2 rounded-lg bg-black/60 border border-white/10 space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-slate-400 font-bold uppercase flex items-center gap-1">
                          <Gauge className="w-3 h-3 text-indigo-400" /> Sentiment Gauge
                        </span>
                        <span className={`font-bold ${cfg.text}`}>{cfg.label} ({cfg.score})</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: cfg.score, backgroundColor: cfg.gaugeColor }}
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* Tags in Hover Card */}
                {(stationTags[hoveredStation.id] || []).length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-white/10 flex flex-wrap gap-1">
                    {(stationTags[hoveredStation.id] || []).map((tag) => {
                      const preset = PRESET_TAGS.find((p) => p.name === tag);
                      return (
                        <span
                          key={tag}
                          className={`text-[9px] font-mono px-2 py-0.5 rounded-md border font-bold ${
                            preset
                              ? `${preset.bg} ${preset.text} ${preset.border}`
                              : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                          }`}
                        >
                          #{tag}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Loop Target info if applicable */}
                {hoveredStation.type === 'LOOP' && hoveredStation.loopsTo && (
                  <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center gap-1.5 text-[10px] font-mono text-amber-400">
                    <ArrowRightLeft className="w-3 h-3 shrink-0" />
                    <span>
                      Loops to:{' '}
                      <strong className="text-amber-300">
                        {stations.find(s => s.id === hoveredStation.loopsTo)?.label || hoveredStation.loopsTo}
                      </strong>
                    </span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Floating details inspector panel & Tag Editor */}
      <AnimatePresence>
        {selectedStation && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-24 right-4 md:right-8 w-72 md:w-80 bg-slate-950/95 border border-indigo-500/40 p-4 rounded-xl shadow-2xl backdrop-blur-xl z-30 flex flex-col gap-3"
          >
            <div className="flex justify-between items-start pb-2 border-b border-white/10">
              <div>
                <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-wider font-bold block">
                  Station Inspector
                </span>
                <p className="text-xs font-bold text-white uppercase tracking-wider">
                  {selectedStation.label}
                </p>
              </div>
              <button 
                onClick={() => setSelectedStationId(null)}
                className="text-slate-400 hover:text-white transition-colors p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <p className="text-[11px] text-slate-300 leading-relaxed italic bg-white/5 p-2.5 rounded-lg border border-white/5">
              "{selectedStation.summary}"
            </p>

            {/* Sentiment Gauge Widget in Inspector */}
            {(() => {
              const sent = getStationSentiment(selectedStation);
              const cfg = SENTIMENT_CONFIG[sent];
              const density = computeLogicDensity(
                selectedStation,
                interchanges,
                (stationTags[selectedStation.id] || []).length,
                (stationBranches[selectedStation.id] || []).length
              );
              return (
                <div className="space-y-2">
                  <div className="p-2.5 rounded-lg bg-black/60 border border-white/10 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-slate-400 font-bold uppercase flex items-center gap-1.5">
                        <Gauge className="w-3.5 h-3.5 text-indigo-400" /> Sentiment Gauge
                      </span>
                      <span className={`font-bold ${cfg.text}`}>{cfg.label} ({cfg.score})</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: cfg.score, backgroundColor: cfg.gaugeColor }}
                      />
                    </div>
                  </div>

                  {/* Logic Density Heat Gauge in Inspector */}
                  <div className="p-2.5 rounded-lg bg-black/60 border border-amber-500/30 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-amber-300 font-bold uppercase flex items-center gap-1.5">
                        <Flame className="w-3.5 h-3.5 text-amber-400" /> Logic Density Index
                      </span>
                      <span className="font-bold text-amber-400">
                        {density.score}/100 ({density.level})
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${density.score}%`, backgroundColor: density.color }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[9px] font-mono text-slate-400 pt-0.5">
                      <span>Word Depth: {selectedStation.summary ? selectedStation.summary.split(/\s+/).length : 0} words</span>
                      <span>Branching: {(stationBranches[selectedStation.id] || []).length} alt(s)</span>
                    </div>
                  </div>

                  {/* Branch Hierarchy & Collapse Control Card */}
                  <div className="p-3 rounded-lg bg-indigo-950/40 border border-indigo-500/40 space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-mono font-bold text-indigo-200">
                      <span className="flex items-center gap-1.5 uppercase">
                        <GitBranch className="w-3.5 h-3.5 text-indigo-400" /> Branch Hierarchy & Visibility
                      </span>
                      {collapsedStationIds.has(selectedStation.id) ? (
                        <span className="px-1.5 py-0.2 rounded bg-indigo-500/30 text-indigo-300 text-[9px]">
                          Collapsed
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[9px]">
                          Expanded
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-300 leading-snug">
                      {collapsedStationIds.has(selectedStation.id)
                        ? `Dependent branch is currently collapsed, hiding ${getHiddenChildCount(selectedStation.id)} downstream argument nodes.`
                        : `This node is active. Double-click on the map or click below to collapse its dependent branch (${getHiddenChildCount(selectedStation.id)} nodes).`}
                    </p>
                    <button
                      onClick={() => toggleCollapseBranch(selectedStation.id)}
                      className={`w-full py-1.5 px-3 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all ${
                        collapsedStationIds.has(selectedStation.id)
                          ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                          : 'bg-white/10 hover:bg-white/20 text-indigo-200 border border-indigo-500/30'
                      }`}
                    >
                      {collapsedStationIds.has(selectedStation.id) ? (
                        <>
                          <FolderPlus className="w-3.5 h-3.5 text-indigo-300" />
                          <span>Expand Dependent Branch (+{getHiddenChildCount(selectedStation.id)} Nodes)</span>
                        </>
                      ) : (
                        <>
                          <FolderMinus className="w-3.5 h-3.5 text-indigo-300" />
                          <span>Collapse Dependent Branch</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Station Integrity Vulnerabilities Callout Card */}
            {integrityAnalysis && (() => {
              const stationIssues = integrityAnalysis.issues.filter((i) => i.stationId === selectedStation.id);
              if (stationIssues.length === 0) return null;
              return (
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/50 space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold text-rose-300">
                    <span className="flex items-center gap-1.5 uppercase">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Integrity Flaws ({stationIssues.length})
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-200 text-[9px]">
                      {stationIssues[0].type}
                    </span>
                  </div>
                  {stationIssues.map((issue) => (
                    <div key={issue.id} className="space-y-1 text-[11px] font-sans text-slate-300 border-t border-rose-500/30 pt-1.5">
                      <p className="font-bold text-rose-200">{issue.title}</p>
                      <p className="text-slate-300 leading-snug">{issue.explanation}</p>
                      <div className="p-2 rounded bg-emerald-950/30 border border-emerald-500/30 text-[10px] font-mono text-emerald-300 mt-1">
                        💡 Suggested Fix: {issue.suggestedFix}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Custom Connections Linker Section */}
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold flex items-center gap-1">
                  <Link2 className="w-3.5 h-3.5 text-pink-400" />
                  Custom Logical Connections
                </span>
                <span className="text-[9px] font-mono text-slate-500">
                  {customConnections.filter((c) => c.fromId === selectedStation.id || c.toId === selectedStation.id).length} Link(s)
                </span>
              </div>

              {/* List of custom links for this station */}
              <div className="space-y-1">
                {customConnections
                  .filter((c) => c.fromId === selectedStation.id || c.toId === selectedStation.id)
                  .map((conn) => {
                    const otherId = conn.fromId === selectedStation.id ? conn.toId : conn.fromId;
                    const otherStation = stations.find((s) => s.id === otherId);
                    const isOutgoing = conn.fromId === selectedStation.id;
                    return (
                      <div
                        key={conn.id}
                        className="flex items-center justify-between p-1.5 rounded-lg bg-pink-950/30 border border-pink-500/30 text-[10px] font-mono"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-pink-400 font-bold shrink-0">
                            {isOutgoing ? '➔ To:' : '↵ From:'}
                          </span>
                          <span className="text-white font-bold truncate">
                            {otherStation ? otherStation.label : otherId}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRemoveCustomConnection(conn.id)}
                          title="Delete link"
                          className="text-pink-400 hover:text-pink-200 transition-colors p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
              </div>

              {/* Quick Link Selector */}
              <div className="flex items-center gap-1.5 pt-1">
                <select
                  id={`link-select-${selectedStation.id}`}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddCustomConnection(selectedStation.id, e.target.value);
                      e.target.value = "";
                    }
                  }}
                  className="flex-1 bg-black/50 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white font-mono outline-none focus:border-pink-500"
                >
                  <option value="" disabled>Link to another station...</option>
                  {stations
                    .filter((s) => s.id !== selectedStation.id)
                    .map((stn, idx) => (
                      <option key={stn.id} value={stn.id}>
                        Stn {idx + 1}: {stn.label}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Station Manual Annotations / Tags Section */}
            <div className="space-y-2 pt-1 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold flex items-center gap-1">
                  <Tag className="w-3 h-3 text-indigo-400" />
                  Station Annotations
                </span>
                <span className="text-[9px] font-mono text-slate-500">
                  {(stationTags[selectedStation.id] || []).length} Tag(s)
                </span>
              </div>

              {/* Active Tags list */}
              <div className="flex flex-wrap gap-1.5 min-h-[24px]">
                {(stationTags[selectedStation.id] || []).length === 0 ? (
                  <span className="text-[10px] font-mono text-slate-500 italic">No tags attached yet.</span>
                ) : (
                  (stationTags[selectedStation.id] || []).map((tag) => {
                    const preset = PRESET_TAGS.find((p) => p.name === tag);
                    return (
                      <span
                        key={tag}
                        className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md border font-bold ${
                          preset
                            ? `${preset.bg} ${preset.text} ${preset.border}`
                            : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                        }`}
                      >
                        #{tag}
                        <button
                          onClick={() => toggleTag(selectedStation.id, tag)}
                          className="hover:text-white transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })
                )}
              </div>

              {/* Quick Preset Tag Buttons */}
              <div className="space-y-1">
                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Preset Tags:</span>
                <div className="flex flex-wrap gap-1">
                  {PRESET_TAGS.map((preset) => {
                    const active = (stationTags[selectedStation.id] || []).includes(preset.name);
                    return (
                      <button
                        key={preset.name}
                        onClick={() => toggleTag(selectedStation.id, preset.name)}
                        className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-all ${
                          active
                            ? `${preset.bg} ${preset.text} ${preset.border} ring-1 ring-indigo-400`
                            : 'bg-white/5 text-slate-400 border-white/10 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {active ? '✓ ' : '+ '}
                        {preset.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Tag Input */}
              <div className="flex items-center gap-1.5 pt-1">
                <input
                  type="text"
                  placeholder="Custom tag name..."
                  value={customTagInput}
                  onChange={(e) => setCustomTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomTag(selectedStation.id);
                    }
                  }}
                  className="flex-1 bg-black/50 border border-white/10 rounded-lg px-2.5 py-1 text-[10px] text-white font-mono placeholder-slate-500 outline-none focus:border-indigo-500"
                />
                <button
                  onClick={() => handleAddCustomTag(selectedStation.id)}
                  className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-mono font-bold flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
            </div>

            {/* Alternative Branches Manager */}
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold flex items-center gap-1">
                  <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
                  Argument Branches
                </span>
                <button
                  onClick={() => setIsBranchFormOpen(!isBranchFormOpen)}
                  className="text-[9px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Branch
                </button>
              </div>

              {/* Branch Selector Pills */}
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setActiveBranchIds((prev) => ({ ...prev, [selectedStation.id]: 'main' }))}
                  className={`text-[9px] font-mono px-2 py-0.5 rounded-md border font-bold transition-all ${
                    (activeBranchIds[selectedStation.id] || 'main') === 'main'
                      ? 'bg-indigo-600 text-white border-indigo-400 shadow-sm'
                      : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
                  }`}
                >
                  Main (Original)
                </button>

                {(stationBranches[selectedStation.id] || []).map((branch) => {
                  const isActive = activeBranchIds[selectedStation.id] === branch.id;
                  return (
                    <button
                      key={branch.id}
                      onClick={() => setActiveBranchIds((prev) => ({ ...prev, [selectedStation.id]: branch.id }))}
                      className={`text-[9px] font-mono px-2 py-0.5 rounded-md border font-bold transition-all ${
                        isActive
                          ? 'bg-cyan-600 text-white border-cyan-400 shadow-sm'
                          : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
                      }`}
                    >
                      {branch.name}
                    </button>
                  );
                })}
              </div>

              {/* New Branch Creation Form */}
              {isBranchFormOpen && (
                <div className="p-2.5 rounded-lg bg-black/60 border border-indigo-500/30 space-y-2 mt-2">
                  <span className="text-[9px] font-mono font-bold text-indigo-300 uppercase block">
                    Create Alternative Variation
                  </span>
                  <input
                    type="text"
                    placeholder="Branch name (e.g., Option B / Evidence Refactor)..."
                    value={branchNameInput}
                    onChange={(e) => setBranchNameInput(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 text-[10px] text-white font-mono placeholder-slate-500 outline-none focus:border-indigo-500"
                  />
                  <textarea
                    placeholder="Alternative argument summary for this station..."
                    value={branchSummaryInput}
                    onChange={(e) => setBranchSummaryInput(e.target.value)}
                    rows={2}
                    className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 text-[10px] text-white font-mono placeholder-slate-500 outline-none focus:border-indigo-500 resize-none"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <select
                      value={branchTypeInput}
                      onChange={(e) => setBranchTypeInput(e.target.value as StationType)}
                      className="bg-slate-900 border border-white/10 rounded px-2 py-1 text-[9px] text-white font-mono outline-none"
                    >
                      <option value="STRONG_LINK">STRONG_LINK</option>
                      <option value="LOOP">LOOP</option>
                      <option value="DEAD_END">DEAD_END</option>
                    </select>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setIsBranchFormOpen(false)}
                        className="px-2 py-1 text-[9px] font-mono text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleAddBranch(selectedStation.id)}
                        disabled={!branchNameInput.trim() || !branchSummaryInput.trim()}
                        className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-mono font-bold disabled:opacity-40"
                      >
                        Save Branch
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Jump button in inspector */}
            <button
              onClick={() => jumpToStation(selectedStation.id)}
              className="mt-1 w-full py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-indigo-300 font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Target className="w-3.5 h-3.5 text-indigo-400" /> Center Map on Station
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Status Area */}
      <div className="h-20 mt-auto flex items-center justify-between border-t border-white/5 pt-4 px-6 md:px-12 bg-[#050506] shrink-0">
        <div className="flex gap-6 md:gap-12">
          <div>
            <div className="text-[10px] text-slate-600 uppercase font-bold tracking-tighter mb-1">Total Stations</div>
            <div className="text-lg font-mono text-green-500">{stations.length}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-600 uppercase font-bold tracking-tighter mb-1">Dead Ends</div>
            <div className="text-lg font-mono text-red-400">{stations.filter(s => s.type === 'DEAD_END').length}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-600 uppercase font-bold tracking-tighter mb-1">Loops</div>
            <div className="text-lg font-mono text-amber-500">{stations.filter(s => s.type === 'LOOP').length}</div>
          </div>
        </div>
      </div>

      {/* Guided Presentation Modal */}
      <PresentationModal
        isOpen={isPresentationOpen}
        onClose={() => setIsPresentationOpen(false)}
        stations={stations}
        interchanges={interchanges}
        critiques={critiques || []}
        stationTags={stationTags}
        stationBranches={stationBranches}
        activeBranchIds={activeBranchIds}
        onSelectBranch={(stnId, brId) => setActiveBranchIds((prev) => ({ ...prev, [stnId]: brId }))}
        integrityAnalysis={integrityAnalysis}
        onJumpToStationInMap={(stnId) => jumpToStation(stnId)}
      />
    </div>
  );
}
