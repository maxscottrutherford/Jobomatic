import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { Link, useParams } from "react-router-dom";

import { CodeEditor } from "../components/CodeEditor";
import { coverLetterToPdf, downloadTxt } from "../lib/pdf";
import {
  generateCoverLetter,
  generateResume,
  getOpenAiErrorMessage,
} from "../lib/openai";
import {
  getAppSettings,
  getApplications,
  getUserProfile,
  setApplications,
} from "../lib/storage";
import type { Application } from "../types";

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

function applicationEqual(a: Application, b: Application): boolean {
  return (
    a.id === b.id &&
    a.createdAt === b.createdAt &&
    a.jobTitle === b.jobTitle &&
    a.company === b.company &&
    a.jobDescriptionText === b.jobDescriptionText &&
    a.resumeReport === b.resumeReport &&
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

  const [resumeRegenerating, setResumeRegenerating] = useState(false);
  const [resumeRegenStream, setResumeRegenStream] = useState("");
  const [coverRegenerating, setCoverRegenerating] = useState(false);
  const [coverRegenStream, setCoverRegenStream] = useState("");
  const [regenError, setRegenError] = useState<string | null>(null);

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

  const updateResumeReport = useCallback((text: string) => {
    setApplication((a) => (a ? { ...a, resumeReport: text } : null));
  }, []);

  const updateCoverLetter = useCallback((text: string) => {
    setApplication((a) => (a ? { ...a, coverLetterText: text } : null));
  }, []);

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

      const report = await generateResume(
        profile,
        appForPrompt.jobDescriptionText,
        settings,
        (c) => setResumeRegenStream((s) => s + c)
      );

      setApplication((prev) => {
        if (!prev || prev.id !== applicationId) return prev;
        const next: Application = { ...prev, resumeReport: report };
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

  function handleDownloadReportTxt() {
    if (!application) return;
    downloadTxt(application.resumeReport, `${baseName}-resume-report`);
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
    downloadTxt(application.coverLetterText, `${baseName}-cover-letter`);
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
            Resume report
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
              <button
                type="button"
                className={btnSecondary}
                onClick={handleDownloadReportTxt}
                disabled={aiBusy}
              >
                Download report (.txt)
              </button>
              <button
                type="button"
                className={btnSecondary}
                onClick={handleRegenerateResume}
                disabled={aiBusy}
              >
                {resumeRegenerating ? "Regenerating…" : "Re-generate report"}
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col p-2 sm:p-3">
              <CodeEditor
                value={application.resumeReport}
                onChange={updateResumeReport}
                language="plaintext"
                readOnly={resumeRegenerating}
              />
            </div>
            {resumeRegenerating ? (
              <div className="shrink-0 border-t border-neutral-200 px-3 py-2 sm:px-4">
                <h2 className="text-xs font-semibold text-neutral-900">
                  Regenerating resume report…
                </h2>
                <div className={`mt-2 ${streamBoxClass}`}>
                  {resumeRegenStream || "…"}
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
                {application.resumeReport || (
                  <span className="text-neutral-400">No report yet.</span>
                )}
              </div>
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
