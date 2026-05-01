import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useParams } from "react-router-dom";

import { CodeEditor } from "../components/CodeEditor";
import {
  compileLatex,
  coverLetterToPdf,
  downloadPdf,
  downloadTex,
} from "../lib/latex";
import {
  getResumeTemplateLatex,
  LATEX_TEMPLATE_OPTIONS,
} from "../lib/latexTemplates";
import {
  generateCoverLetter,
  generateResume,
  getOpenAiErrorMessage,
} from "../lib/openai";
import {
  getAppSettings,
  getApplications,
  getUserProfile,
  patchAppSettings,
  setApplications,
} from "../lib/storage";
import type { AppSettings, Application } from "../types";

const streamBoxClass =
  "max-h-64 overflow-y-auto whitespace-pre-wrap rounded border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs text-neutral-800";

const btnPrimary =
  "rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50";

const btnSecondary =
  "rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50";

const tabBase =
  "border-b-2 px-3 py-2 text-sm font-medium transition-colors";
const tabActive = "border-neutral-900 text-neutral-900";
const tabIdle =
  "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-800";

function safeFilenamePart(s: string): string {
  const t = s.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");
  return t.slice(0, 64) || "document";
}

function downloadPlainText(text: string, filename: string): void {
  const name = filename.toLowerCase().endsWith(".txt")
    ? filename
    : `${filename}.txt`;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}

function applicationEqual(a: Application, b: Application): boolean {
  return (
    a.id === b.id &&
    a.createdAt === b.createdAt &&
    a.jobTitle === b.jobTitle &&
    a.company === b.company &&
    a.jobDescriptionText === b.jobDescriptionText &&
    a.resumeLatex === b.resumeLatex &&
    a.coverLetterText === b.coverLetterText &&
    a.pdfBlobId === b.pdfBlobId &&
    a.notes === b.notes
  );
}

/** Write one application to localStorage (immediate; used after successful re-generate). */
function persistApplicationRecord(updated: Application): void {
  const apps = getApplications();
  const i = apps.findIndex((a) => a.id === updated.id);
  if (i === -1) return;
  const next = [...apps];
  next[i] = updated;
  setApplications(next);
}

type TabId = "resume" | "cover";

export function Editor() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const [application, setApplication] = useState<Application | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<TabId>("resume");

  const [compiling, setCompiling] = useState(false);
  const [lastPdf, setLastPdf] = useState<Uint8Array | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [resumeRegenerating, setResumeRegenerating] = useState(false);
  const [resumeRegenStream, setResumeRegenStream] = useState("");
  const [coverRegenerating, setCoverRegenerating] = useState(false);
  const [coverRegenStream, setCoverRegenStream] = useState("");
  const [regenError, setRegenError] = useState<string | null>(null);

  const [resumeLatexTemplate, setResumeLatexTemplate] = useState<
    AppSettings["latexTemplate"]
  >("jake");
  /** Bumps on window focus so custom-template body from Setup is re-read (same-tab string compare may skip updates). */
  const [templateStorageRevision, setTemplateStorageRevision] = useState(0);

  /** Revoke via `previewUrlRef` so cleanup always targets the live blob URL. */
  const setPreviewFromPdf = useCallback((pdf: Uint8Array | null) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    if (pdf && pdf.length > 0) {
      const blob = new Blob([new Uint8Array(pdf)], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  }, []);

  useEffect(() => {
    if (!applicationId) {
      setApplication(null);
      setLoaded(true);
      return;
    }
    const apps = getApplications();
    setApplication(apps.find((a) => a.id === applicationId) ?? null);
    setLoaded(true);
  }, [applicationId]);

  useEffect(() => {
    const s = getAppSettings();
    setResumeLatexTemplate(s?.latexTemplate ?? "jake");
  }, [applicationId]);

  useEffect(() => {
    function onFocus() {
      const s = getAppSettings();
      setResumeLatexTemplate(s?.latexTemplate ?? "jake");
      setTemplateStorageRevision((n) => n + 1);
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const onResumeTemplateChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value as AppSettings["latexTemplate"];
      patchAppSettings({ latexTemplate: v });
      setResumeLatexTemplate(v);
    },
    []
  );

  const customTemplateMissing = useMemo(
    () =>
      resumeLatexTemplate === "custom" &&
      !getAppSettings()?.customLatexTemplate?.trim(),
    [resumeLatexTemplate, templateStorageRevision]
  );

  useEffect(() => {
    setLastPdf(null);
    setCompileError(null);
    setPreviewFromPdf(null);
  }, [applicationId, setPreviewFromPdf]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!application) return;
    const id = application.id;
    const snapshot = application;
    const t = window.setTimeout(() => {
      const apps = getApplications();
      const persisted = apps.find((a) => a.id === id);
      if (!persisted) return;
      if (applicationEqual(persisted, snapshot)) return;
      const i = apps.findIndex((a) => a.id === id);
      if (i === -1) return;
      const next = [...apps];
      next[i] = snapshot;
      setApplications(next);
    }, 500);
    return () => window.clearTimeout(t);
  }, [application]);

  const baseName = application
    ? `${safeFilenamePart(application.jobTitle)}-${safeFilenamePart(application.company)}`
    : "document";

  const updateResumeLatex = useCallback((latex: string) => {
    setApplication((a) => (a ? { ...a, resumeLatex: latex } : null));
  }, []);

  const updateCoverLetter = useCallback((text: string) => {
    setApplication((a) => (a ? { ...a, coverLetterText: text } : null));
  }, []);

  async function handleCompile() {
    if (!application) return;
    setCompiling(true);
    setCompileError(null);
    try {
      const { pdf, errors } = await compileLatex(application.resumeLatex);
      if (pdf && pdf.length > 0) {
        setLastPdf(pdf);
        setCompileError(null);
        setPreviewFromPdf(pdf);
      } else {
        setLastPdf(null);
        setPreviewFromPdf(null);
        setCompileError(errors?.trim() || "Compilation produced no PDF.");
      }
    } catch (e) {
      setLastPdf(null);
      setPreviewFromPdf(null);
      setCompileError(
        e instanceof Error ? e.message : "Compilation failed unexpectedly."
      );
    } finally {
      setCompiling(false);
    }
  }

  async function handleRegenerateResume() {
    if (!applicationId) return;
    setRegenError(null);

    const appFromStorage = getApplications().find((a) => a.id === applicationId);
    if (!appFromStorage) {
      setRegenError("This application is no longer in your saved list.");
      return;
    }

    let profile = getUserProfile();
    if (!profile) {
      setRegenError("No profile found. Complete your profile first.");
      return;
    }
    let settings = getAppSettings();
    if (!settings?.openaiApiKey?.trim()) {
      setRegenError("No API key. Add one in Setup.");
      return;
    }

    const jd = appFromStorage.jobDescriptionText;
    if (!jd.trim()) {
      setRegenError("This application has no saved job description text.");
      return;
    }

    const templatePreview = getResumeTemplateLatex(settings);
    if (templatePreview === null) {
      setRegenError(
        "Custom template is selected but no template text is saved. Open Setup and paste your LaTeX skeleton, then try again."
      );
      return;
    }

    setResumeRegenStream("");
    setResumeRegenerating(true);
    try {
      profile = getUserProfile();
      if (!profile) {
        throw new Error("No profile found. Complete your profile first.");
      }
      settings = getAppSettings();
      if (!settings?.openaiApiKey?.trim()) {
        throw new Error("No API key. Add one in Setup.");
      }

      const appForPrompt = getApplications().find((a) => a.id === applicationId);
      if (!appForPrompt?.jobDescriptionText.trim()) {
        throw new Error(
          "This application has no saved job description text."
        );
      }

      const template = getResumeTemplateLatex(settings);
      if (template === null) {
        throw new Error(
          "Custom template is selected but no template text is saved. Paste your LaTeX in Setup."
        );
      }
      const latex = await generateResume(
        profile,
        appForPrompt.jobDescriptionText,
        template,
        settings,
        (c) => setResumeRegenStream((s) => s + c)
      );

      setApplication((prev) => {
        if (!prev || prev.id !== applicationId) return prev;
        const next: Application = { ...prev, resumeLatex: latex };
        persistApplicationRecord(next);
        return next;
      });
    } catch (err) {
      setRegenError(getOpenAiErrorMessage(err));
    } finally {
      setResumeRegenerating(false);
    }
  }

  async function handleRegenerateCoverLetter() {
    if (!applicationId) return;
    setRegenError(null);

    const appFromStorage = getApplications().find((a) => a.id === applicationId);
    if (!appFromStorage) {
      setRegenError("This application is no longer in your saved list.");
      return;
    }

    let profile = getUserProfile();
    if (!profile) {
      setRegenError("No profile found. Complete your profile first.");
      return;
    }
    let settings = getAppSettings();
    if (!settings?.openaiApiKey?.trim()) {
      setRegenError("No API key. Add one in Setup.");
      return;
    }

    const jd = appFromStorage.jobDescriptionText;
    if (!jd.trim()) {
      setRegenError("This application has no saved job description text.");
      return;
    }

    setCoverRegenStream("");
    setCoverRegenerating(true);
    try {
      profile = getUserProfile();
      if (!profile) {
        throw new Error("No profile found. Complete your profile first.");
      }
      settings = getAppSettings();
      if (!settings?.openaiApiKey?.trim()) {
        throw new Error("No API key. Add one in Setup.");
      }

      const appForPrompt = getApplications().find((a) => a.id === applicationId);
      if (!appForPrompt?.jobDescriptionText.trim()) {
        throw new Error(
          "This application has no saved job description text."
        );
      }

      const text = await generateCoverLetter(
        profile,
        appForPrompt.jobDescriptionText,
        appForPrompt.jobTitle,
        appForPrompt.company,
        settings,
        (c) => setCoverRegenStream((s) => s + c)
      );

      setApplication((prev) => {
        if (!prev || prev.id !== applicationId) return prev;
        const next: Application = { ...prev, coverLetterText: text };
        persistApplicationRecord(next);
        return next;
      });
    } catch (err) {
      setRegenError(getOpenAiErrorMessage(err));
    } finally {
      setCoverRegenerating(false);
    }
  }

  function handleDownloadResumePdf() {
    if (!lastPdf || !lastPdf.length) return;
    downloadPdf(lastPdf, `${baseName}-resume`);
  }

  function handleDownloadTex() {
    if (!application) return;
    downloadTex(application.resumeLatex, `${baseName}-resume`);
  }

  async function handleCoverLetterPdf() {
    if (!application) return;
    try {
      await coverLetterToPdf(
        application.coverLetterText,
        `${baseName}-cover-letter`
      );
    } catch (e) {
      setRegenError(
        e instanceof Error ? e.message : "Could not build cover letter PDF."
      );
    }
  }

  function handleCoverLetterTxt() {
    if (!application) return;
    downloadPlainText(application.coverLetterText, `${baseName}-cover-letter`);
  }

  if (!loaded) {
    return (
      <main className="p-6">
        <p className="text-sm text-neutral-600">Loading…</p>
      </main>
    );
  }

  if (!application) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <h1 className="text-xl font-semibold text-neutral-900">
          Application not found
        </h1>
        <p className="mt-3 text-sm text-neutral-700">
          There is no saved application for this link. It may have been removed
          or the URL is incorrect.
        </p>
        <Link
          to="/history"
          className="mt-4 inline-block rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Back to history
        </Link>
      </main>
    );
  }

  const aiBusy = resumeRegenerating || coverRegenerating;

  return (
    <main className="flex min-h-screen flex-col bg-white">
      <header className="shrink-0 border-b border-neutral-200 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold text-neutral-900">
              {application.jobTitle}
            </h1>
            <p className="text-sm text-neutral-600">{application.company}</p>
          </div>
          <Link
            to="/history"
            className="text-sm font-medium text-neutral-700 underline-offset-2 hover:text-neutral-900 hover:underline"
          >
            History
          </Link>
        </div>

        <nav className="mt-3 flex gap-1 border-b border-neutral-200">
          <button
            type="button"
            className={`${tabBase} ${tab === "resume" ? tabActive : tabIdle} disabled:cursor-not-allowed disabled:opacity-50`}
            onClick={() => setTab("resume")}
            disabled={aiBusy}
          >
            Resume
          </button>
          <button
            type="button"
            className={`${tabBase} ${tab === "cover" ? tabActive : tabIdle} disabled:cursor-not-allowed disabled:opacity-50`}
            onClick={() => setTab("cover")}
            disabled={aiBusy}
          >
            Cover Letter
          </button>
        </nav>
      </header>

      {regenError ? (
        <div
          className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 sm:px-6"
          role="alert"
        >
          {regenError}
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => setRegenError(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {tab === "resume" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-0 lg:flex-row">
          <section className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-neutral-200 lg:border-b-0 lg:border-r">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-100 px-3 py-2">
              <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                <span className="whitespace-nowrap">Template</span>
                <select
                  aria-label="LaTeX resume template"
                  value={resumeLatexTemplate}
                  onChange={onResumeTemplateChange}
                  disabled={aiBusy}
                  className="max-w-[10.5rem] rounded border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-900 shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {LATEX_TEMPLATE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={btnPrimary}
                onClick={handleCompile}
                disabled={compiling || aiBusy}
              >
                {compiling ? (
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                      aria-hidden
                    />
                    Compiling…
                  </span>
                ) : (
                  "Compile"
                )}
              </button>
              <button
                type="button"
                className={btnSecondary}
                onClick={handleDownloadResumePdf}
                disabled={!lastPdf || !lastPdf.length || compiling || aiBusy}
              >
                Download PDF
              </button>
              <button
                type="button"
                className={btnSecondary}
                onClick={handleDownloadTex}
                disabled={aiBusy}
              >
                Download .tex
              </button>
              <button
                type="button"
                className={btnSecondary}
                onClick={handleRegenerateResume}
                disabled={aiBusy}
              >
                {resumeRegenerating ? "Regenerating…" : "Re-generate Resume"}
              </button>
            </div>
            {customTemplateMissing ? (
              <div
                className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 sm:px-4"
                role="status"
              >
                Custom template is selected, but no LaTeX skeleton is saved yet.{" "}
                <Link
                  to="/setup"
                  className="font-medium text-amber-900 underline hover:text-amber-950"
                >
                  Open Setup
                </Link>{" "}
                and paste your template, then save.
              </div>
            ) : null}
            <div className="flex min-h-0 flex-1 flex-col p-2 sm:p-3">
              <CodeEditor
                value={application.resumeLatex}
                onChange={updateResumeLatex}
                language="latex"
                readOnly={resumeRegenerating}
              />
            </div>
            {resumeRegenerating ? (
              <div className="shrink-0 border-t border-neutral-200 px-3 py-2 sm:px-4">
                <h2 className="text-xs font-semibold text-neutral-900">
                  Regenerating resume…
                </h2>
                <div className={`mt-2 ${streamBoxClass}`}>
                  {resumeRegenStream || "…"}
                </div>
              </div>
            ) : null}
          </section>

          <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-neutral-50">
            <div className="shrink-0 px-3 py-2 text-xs font-medium text-neutral-600">
              PDF preview
            </div>
            <div className="relative min-h-[280px] flex-1 min-h-0">
              {compiling ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
                  <div
                    className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-800"
                    role="status"
                    aria-label="Compiling"
                  />
                </div>
              ) : null}
              {previewUrl ? (
                <iframe
                  title="Resume PDF preview"
                  src={previewUrl}
                  className="h-full w-full border-0 bg-white"
                />
              ) : compileError ? (
                <pre className="h-full overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs text-red-900">
                  {compileError}
                </pre>
              ) : (
                <p className="p-4 text-sm text-neutral-500">
                  Compile to see a PDF preview here.
                </p>
              )}
            </div>
          </section>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-0 lg:flex-row">
          <section className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-neutral-200 lg:border-b-0 lg:border-r">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-100 px-3 py-2">
              <button
                type="button"
                className={btnPrimary}
                onClick={handleCoverLetterPdf}
                disabled={aiBusy}
              >
                Download as PDF
              </button>
              <button
                type="button"
                className={btnSecondary}
                onClick={handleCoverLetterTxt}
                disabled={aiBusy}
              >
                Download as TXT
              </button>
              <button
                type="button"
                className={btnSecondary}
                onClick={handleRegenerateCoverLetter}
                disabled={aiBusy}
              >
                {coverRegenerating
                  ? "Regenerating…"
                  : "Re-generate Cover Letter"}
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col p-2 sm:p-3">
              <CodeEditor
                value={application.coverLetterText}
                onChange={updateCoverLetter}
                language="plaintext"
                readOnly={coverRegenerating}
              />
            </div>
            {coverRegenerating ? (
              <div className="shrink-0 border-t border-neutral-200 px-3 py-2 sm:px-4">
                <h2 className="text-xs font-semibold text-neutral-900">
                  Regenerating cover letter…
                </h2>
                <div className={`mt-2 ${streamBoxClass}`}>
                  {coverRegenStream || "…"}
                </div>
              </div>
            ) : null}
          </section>

          <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-neutral-50">
            <div className="shrink-0 px-3 py-2 text-xs font-medium text-neutral-600">
              Preview
            </div>
            <div className="min-h-[280px] flex-1 min-h-0 overflow-auto p-4">
              <div className="max-w-none whitespace-pre-wrap text-sm leading-relaxed text-neutral-900">
                {application.coverLetterText || (
                  <span className="text-neutral-400">No content yet.</span>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
