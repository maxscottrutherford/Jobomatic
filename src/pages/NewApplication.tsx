import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import {
  generateCoverLetter,
  generateResumeReport,
  getOpenAiErrorMessage,
  isAbortError,
} from "../lib/openai";
import { extractText } from "../lib/parser";
import {
  getAppSettings,
  getApplications,
  getUserProfile,
  setApplications,
} from "../lib/storage";
import type { Application } from "../types";

const inputClass =
  "w-full rounded border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500";
const labelClass = "block text-sm font-medium text-neutral-800";
const streamBoxClass =
  "max-h-64 overflow-y-auto whitespace-pre-wrap rounded border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs text-neutral-800";

const JD_ACCEPT =
  "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,.pdf,.docx,.txt";

const navHistoryBtnClass =
  "inline-flex shrink-0 rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-neutral-50";

type NewAppLocationState = { profileIncompleteWarning?: boolean };

export function NewApplication() {
  const navigate = useNavigate();
  const location = useLocation();
  const generateAbortRef = useRef<AbortController | null>(null);

  const showProfileIncompleteBanner = Boolean(
    (location.state as NewAppLocationState | null)?.profileIncompleteWarning
  );

  const [, setStorageTick] = useState(0);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "resumeTailor:profile" || e.key === null) {
        setStorageTick((n) => n + 1);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    return () => {
      generateAbortRef.current?.abort();
    };
  }, []);

  const profile = getUserProfile();

  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jdText, setJdText] = useState("");
  const [resumeStream, setResumeStream] = useState("");
  const [coverStream, setCoverStream] = useState("");
  const [generating, setGenerating] = useState(false);
  const [phaseDone, setPhaseDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onJdFile = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    try {
      const text = await extractText(file);
      setJdText(text);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not read job description file."
      );
    }
  }, []);

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPhaseDone(false);

    const p = getUserProfile();
    if (!p) {
      setError("No profile found. Complete your profile first.");
      return;
    }

    const settings = getAppSettings();
    if (!settings?.openaiApiKey?.trim()) {
      setError("No API key. Add one in Setup.");
      return;
    }

    const jd = jdText.trim();
    const title = jobTitle.trim();
    const co = company.trim();
    if (!title) {
      setError("Job title is required.");
      return;
    }
    if (!co) {
      setError("Company name is required.");
      return;
    }
    if (!jd) {
      setError(
        "Job description is required. Paste the posting text or upload a file."
      );
      return;
    }

    generateAbortRef.current?.abort();
    const ac = new AbortController();
    generateAbortRef.current = ac;

    setResumeStream("");
    setCoverStream("");
    setGenerating(true);

    try {
      const [resumeReport, coverLetterText] = await Promise.all([
        generateResumeReport(
          p,
          jd,
          settings,
          (c) => {
            setResumeStream((s) => s + c);
          },
          ac.signal
        ),
        generateCoverLetter(
          p,
          jd,
          title,
          co,
          settings,
          (c) => {
            setCoverStream((s) => s + c);
          },
          ac.signal
        ),
      ]);

      setPhaseDone(true);

      const application: Application = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        jobTitle: title,
        company: co,
        jobDescriptionText: jd,
        resumeReport,
        coverLetterText,
        pdfBlobId: undefined,
        notes: undefined,
      };

      const apps = getApplications();
      setApplications([...apps, application]);

      setGenerating(false);

      generateAbortRef.current = null;

      window.setTimeout(() => {
        navigate(`/editor/${application.id}`, { replace: true });
      }, 400);
    } catch (err) {
      generateAbortRef.current = null;
      setGenerating(false);
      setPhaseDone(false);
      if (isAbortError(err)) {
        return;
      }
      setError(getOpenAiErrorMessage(err));
    }
  }

  if (!profile) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-xl font-semibold text-neutral-900">
            New application
          </h1>
          <Link to="/history" className={navHistoryBtnClass}>
            History
          </Link>
        </div>
        <p className="mt-3 text-sm text-neutral-700">
          You need a saved profile before you can tailor a resume and cover
          letter. Fill out your profile first, then come back here.
        </p>
        <Link
          to="/profile"
          className="mt-4 inline-block rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Go to profile
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">
            New application
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            Paste a job description or upload a PDF, DOCX, or TXT job posting.
            Both the resume recommendation report and cover letter generate in
            parallel.
          </p>
        </div>
        <Link to="/history" className={navHistoryBtnClass}>
          History
        </Link>
      </div>

      {showProfileIncompleteBanner ? (
        <div
          className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          role="status"
        >
          Your profile has no work experience, education, or skills yet.
          Generation still runs, but you will get better results after you add
          those sections on{" "}
          <Link
            to="/profile"
            className="font-medium text-amber-900 underline hover:text-amber-950"
          >
            Profile
          </Link>
          .
        </div>
      ) : null}

      {error ? (
        <div
          className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <form onSubmit={handleGenerate} className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="job-title">
              Job title
            </label>
            <input
              id="job-title"
              className={`mt-1 ${inputClass}`}
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              disabled={generating}
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="company">
              Company name
            </label>
            <input
              id="company"
              className={`mt-1 ${inputClass}`}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              disabled={generating}
              required
            />
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="jd-text">
            Job description
          </label>
          <textarea
            id="jd-text"
            rows={10}
            className={`mt-1 ${inputClass}`}
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            disabled={generating}
            placeholder="Paste the job description here…"
            required
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="jd-file">
            Or upload job description file
          </label>
          <input
            id="jd-file"
            type="file"
            accept={JD_ACCEPT}
            className="mt-1 block w-full text-sm text-neutral-600 file:mr-3 file:rounded file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium"
            disabled={generating}
            onChange={onJdFile}
          />
          <p className="mt-1 text-xs text-neutral-500">
            PDF, DOCX, or TXT. Extracted text replaces the textarea contents.
          </p>
        </div>

        <button
          type="submit"
          disabled={generating}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? "Generating…" : "Generate"}
        </button>
      </form>

      {generating || phaseDone ? (
        <div className="mt-10 space-y-8">
          {phaseDone ? (
            <p className="text-sm font-medium text-green-800">Done.</p>
          ) : null}
          <section>
            <h2 className="text-sm font-semibold text-neutral-900">
              {generating && !phaseDone
                ? "Analyzing your resume against this role..."
                : "Resume report"}
            </h2>
            <div className={`mt-2 ${streamBoxClass}`}>
              {resumeStream || (generating && !phaseDone ? "…" : "")}
            </div>
          </section>
          <section>
            <h2 className="text-sm font-semibold text-neutral-900">
              {generating && !phaseDone
                ? "Writing cover letter…"
                : "Cover letter"}
            </h2>
            <div className={`mt-2 ${streamBoxClass}`}>
              {coverStream || (generating && !phaseDone ? "…" : "")}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
