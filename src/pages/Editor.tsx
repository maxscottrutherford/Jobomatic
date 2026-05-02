import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  coverLetterToPdf,
  downloadTxt,
  parseResumeReportSections,
  reportToPdf,
} from "../lib/pdf";
import {
  generateCoverLetter,
  generateResumeReport,
  getOpenAiErrorMessage,
} from "../lib/openai";
import {
  getAppSettings,
  getApplications,
  getUserProfile,
  setApplications,
} from "../lib/storage";
import type { Application } from "../types";

const btnPrimary =
  "inline-flex items-center justify-center rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50";

const btnSecondary =
  "inline-flex items-center justify-center rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50";

const tabBase =
  "border-b-2 px-3 py-2 text-sm font-medium transition-colors";
const tabActive = "border-neutral-900 text-neutral-900";
const tabIdle =
  "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-800";

function safeFilenamePart(s: string): string {
  const t = s.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");
  return t.slice(0, 64) || "document";
}

function reportDownloadBasename(app: Application): string {
  return `${safeFilenamePart(app.company)}-${safeFilenamePart(app.jobTitle)}-resume-recommendations`;
}

/** While regenerating, show the live stream once it has content; otherwise fall back to saved report. */
function currentResumeReportText(
  app: Application,
  regenerating: boolean,
  stream: string
): string {
  if (regenerating) return stream.length > 0 ? stream : app.resumeReport;
  return app.resumeReport;
}

function currentCoverLetterText(
  app: Application,
  regenerating: boolean,
  stream: string
): string {
  if (regenerating) return stream.length > 0 ? stream : app.coverLetterText;
  return app.coverLetterText;
}

function ResumeReportReadOnly({ text }: { text: string }) {
  const sections = parseResumeReportSections(text);
  if (!text.trim()) {
    return (
      <p className="text-sm text-neutral-400">No report yet.</p>
    );
  }
  if (sections.length === 0) {
    return (
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">
        {text}
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {sections.map((sec, i) => (
        <div key={i}>
          {sec.header ? (
            <h3 className="mb-2 border-b border-neutral-200 pb-1 text-xs font-bold uppercase tracking-wide text-neutral-900">
              {sec.header}
            </h3>
          ) : null}
          {sec.body ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">
              {sec.body}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
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

      const report = await generateResumeReport(
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

  const app = application;
  const aiBusy = resumeRegenerating || coverRegenerating;
  const reportDisplayText = currentResumeReportText(
    app,
    resumeRegenerating,
    resumeRegenStream
  );
  const canDownloadReport = reportDisplayText.trim().length > 0;

  function handleDownloadReportTxt() {
    downloadTxt(reportDisplayText, reportDownloadBasename(app));
  }

  function handleDownloadReportPdf() {
    try {
      reportToPdf(reportDisplayText, reportDownloadBasename(app));
    } catch (e) {
      setRegenError(
        e instanceof Error ? e.message : "Could not build report PDF."
      );
    }
  }

  const coverDisplayText = currentCoverLetterText(
    app,
    coverRegenerating,
    coverRegenStream
  );
  const canDownloadCover = coverDisplayText.trim().length > 0;
  const coverBasename = `${safeFilenamePart(app.jobTitle)}-${safeFilenamePart(app.company)}`;

  async function handleCoverLetterPdf() {
    try {
      await coverLetterToPdf(coverDisplayText, `${coverBasename}-cover-letter`);
    } catch (e) {
      setRegenError(
        e instanceof Error ? e.message : "Could not build cover letter PDF."
      );
    }
  }

  function handleCoverLetterTxt() {
    downloadTxt(coverDisplayText, `${coverBasename}-cover-letter`);
  }

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
          <Link to="/history" className={btnSecondary}>
            History
          </Link>
        </div>

        <nav className="mt-3 flex gap-1">
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
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-100 px-3 py-2">
            <button
              type="button"
              className={btnPrimary}
              onClick={handleDownloadReportPdf}
              disabled={aiBusy || !canDownloadReport}
            >
              Download as PDF
            </button>
            <button
              type="button"
              className={btnSecondary}
              onClick={handleDownloadReportTxt}
              disabled={aiBusy || !canDownloadReport}
            >
              Download as TXT
            </button>
            <button
              type="button"
              className={btnSecondary}
              onClick={handleRegenerateResume}
              disabled={aiBusy}
            >
              {resumeRegenerating ? "Regenerating…" : "Re-generate Report"}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-3 px-4 py-8 sm:px-6 sm:py-10">
              {resumeRegenerating ? (
                <p className="shrink-0 text-center text-xs font-medium text-neutral-500">
                  Streaming updated report…
                </p>
              ) : null}
              <div className="shrink-0 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
                <ResumeReportReadOnly text={reportDisplayText} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-100 px-3 py-2">
            <button
              type="button"
              className={btnPrimary}
              onClick={handleCoverLetterPdf}
              disabled={aiBusy || !canDownloadCover}
            >
              Download as PDF
            </button>
            <button
              type="button"
              className={btnSecondary}
              onClick={handleCoverLetterTxt}
              disabled={aiBusy || !canDownloadCover}
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
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-3 px-4 py-8 sm:px-6 sm:py-10">
              {coverRegenerating ? (
                <p className="shrink-0 text-center text-xs font-medium text-neutral-500">
                  Streaming updated cover letter…
                </p>
              ) : null}
              <div className="shrink-0 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
                {coverDisplayText.trim() ? (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-900">
                    {coverDisplayText}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-400">No content yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
