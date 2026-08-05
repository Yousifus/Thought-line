import { useState, useEffect } from 'react';
import { 
  X, Check, ExternalLink, Loader2, FileText, 
  Sparkles, CheckCircle2, ShieldAlert
} from 'lucide-react';
import { User } from 'firebase/auth';
import { googleSignIn, googleSignOut, initAuth, getAccessToken } from '../lib/workspaceAuth';
import { exportToGoogleDoc, ExportToDocsPayload } from '../lib/googleDocsExport';

interface GoogleWorkspaceExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  payload: ExportToDocsPayload;
}

export function GoogleWorkspaceExportModal({ isOpen, onClose, payload }: GoogleWorkspaceExportModalProps) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [createdDocUrl, setCreatedDocUrl] = useState<string | null>(null);

  const [docTitle, setDocTitle] = useState<string>(
    payload.title || `Argument Map Analysis - ${new Date().toLocaleDateString()}`
  );

  const [includeText, setIncludeText] = useState<boolean>(true);
  const [includeMap, setIncludeMap] = useState<boolean>(true);
  const [includeIntegrity, setIncludeIntegrity] = useState<boolean>(true);
  const [includeCouncil, setIncludeCouncil] = useState<boolean>(true);
  const [includeDebate, setIncludeDebate] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = initAuth(
      (currUser, currToken) => {
        setUser(currUser);
        setToken(currToken || getAccessToken());
      },
      () => {
        setUser(null);
        setToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (payload.title) {
      setDocTitle(payload.title);
    }
  }, [payload.title]);

  if (!isOpen) return null;

  const handleSignIn = async () => {
    setIsAuthenticating(true);
    setExportError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
      }
    } catch (err: any) {
      console.error('Google sign in error:', err);
      setExportError(err?.message || 'Failed to authenticate with Google.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleConfirmExport = async () => {
    let activeToken = token || getAccessToken();

    if (!user || !activeToken) {
      try {
        setIsAuthenticating(true);
        const res = await googleSignIn();
        if (res) {
          setUser(res.user);
          setToken(res.accessToken);
          activeToken = res.accessToken;
        } else {
          setExportError('Authentication required to create Google Document.');
          setIsAuthenticating(false);
          return;
        }
      } catch (err: any) {
        setExportError(err?.message || 'Authentication failed.');
        setIsAuthenticating(false);
        return;
      } finally {
        setIsAuthenticating(false);
      }
    }

    if (!activeToken) {
      setExportError('No valid Google access token found.');
      return;
    }

    setIsExporting(true);
    setExportError(null);

    try {
      const filteredPayload: ExportToDocsPayload = {
        title: docTitle,
        originalText: includeText ? payload.originalText : undefined,
        analysis: includeMap ? payload.analysis : undefined,
        integrityAnalysis: includeIntegrity ? payload.integrityAnalysis : undefined,
        councilResponse: includeCouncil ? payload.councilResponse : undefined,
        pastSelfDebate: includeDebate ? payload.pastSelfDebate : undefined,
      };

      const result = await exportToGoogleDoc(activeToken, filteredPayload);
      setCreatedDocUrl(result.documentUrl);
    } catch (err: any) {
      console.error('Failed to export to Google Doc:', err);
      setExportError(err?.message || 'Failed to generate Google Document in Drive.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg bg-[#0c101c] border border-indigo-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 font-sans">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-indigo-950/30">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-400/40 flex items-center justify-center text-indigo-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Export to Google Docs
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold uppercase">
                  Google Workspace
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Save full transit map, critiques & integrity audits directly to Google Drive.
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

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          
          {/* User Account Auth Status */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10 flex items-center justify-between">
            {user ? (
              <div className="flex items-center gap-3">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || 'User'} className="w-8 h-8 rounded-full border border-indigo-400" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-xs text-white">
                    {user.email?.[0].toUpperCase() || 'U'}
                  </div>
                )}
                <div className="text-xs">
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    {user.displayName || user.email}
                    <span className="w-2 h-2 rounded-full bg-emerald-400" title="Connected" />
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400">Connected to Google Docs & Drive</span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-300">
                <span className="font-semibold text-indigo-300 block mb-0.5">Google Sign-in Required</span>
                <span className="text-[11px] text-slate-400">Sign in with your Google Account to create documents.</span>
              </div>
            )}

            {!user && (
              <button
                type="button"
                onClick={handleSignIn}
                disabled={isAuthenticating}
                className="px-3 py-1.5 rounded-lg bg-white text-slate-900 hover:bg-slate-100 font-medium text-xs flex items-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                {isAuthenticating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-900" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                )}
                <span>Sign in</span>
              </button>
            )}

            {user && (
              <button
                type="button"
                onClick={googleSignOut}
                className="text-[10px] font-mono text-slate-400 hover:text-rose-400 underline"
              >
                Sign out
              </button>
            )}
          </div>

          {/* Success Result Screen */}
          {createdDocUrl ? (
            <div className="p-5 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-center space-y-4 animate-scale-up">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-400 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-bold text-emerald-200">Google Doc Created Successfully!</h4>
                <p className="text-xs text-slate-300">
                  Your document "<span className="font-semibold text-white">{docTitle}</span>" is saved and ready in your Google Drive.
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <a
                  href={createdDocUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open in Google Docs</span>
                </a>
                <button
                  type="button"
                  onClick={() => setCreatedDocUrl(null)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-medium"
                >
                  Create Another
                </button>
              </div>
            </div>
          ) : (
            /* Document Options Form */
            <div className="space-y-4">
              
              {/* Title Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-bold uppercase text-slate-300 block">
                  Google Document Title
                </label>
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="Enter document title..."
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/15 focus:border-indigo-400 focus:outline-none text-xs text-white placeholder-slate-500 transition-colors"
                />
              </div>

              {/* Sections Checkboxes */}
              <div className="space-y-2">
                <label className="text-xs font-mono font-bold uppercase text-slate-300 block">
                  Include Sections in Export
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-900/60 border border-white/5 cursor-pointer hover:bg-slate-800/60 transition-colors">
                    <input
                      type="checkbox"
                      checked={includeText}
                      onChange={(e) => setIncludeText(e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-slate-300 font-medium">Source Text Draft</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-900/60 border border-white/5 cursor-pointer hover:bg-slate-800/60 transition-colors">
                    <input
                      type="checkbox"
                      checked={includeMap}
                      onChange={(e) => setIncludeMap(e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-slate-300 font-medium">Transit Map Topology</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-900/60 border border-white/5 cursor-pointer hover:bg-slate-800/60 transition-colors">
                    <input
                      type="checkbox"
                      checked={includeIntegrity}
                      onChange={(e) => setIncludeIntegrity(e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-slate-300 font-medium">Logical Integrity Audit</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-900/60 border border-white/5 cursor-pointer hover:bg-slate-800/60 transition-colors">
                    <input
                      type="checkbox"
                      checked={includeCouncil}
                      onChange={(e) => setIncludeCouncil(e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-slate-300 font-medium">Model Council Reviews</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-900/60 border border-white/5 cursor-pointer hover:bg-slate-800/60 transition-colors sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={includeDebate}
                      onChange={(e) => setIncludeDebate(e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-slate-300 font-medium">Past-Self Dialectical Debates</span>
                  </label>
                </div>
              </div>

              {/* Error Notice */}
              {exportError && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-200 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{exportError}</span>
                </div>
              )}

              {/* Confirmation Action Button */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmExport}
                  disabled={isExporting || isAuthenticating}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-medium text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Creating Document...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-indigo-200" />
                      <span>Confirm & Export to Google Docs</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
