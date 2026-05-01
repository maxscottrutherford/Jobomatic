import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  generateCoverLetter,
  generateResume,
  getOpenAiErrorMessage,
} from "../lib/openai";
import { getResumeTemplateLatex } from "../lib/latexTemplates";
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

export function NewApplication() {
  const navigate = useNavigate();
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
    if (!title || !co || !jd) {
      setError("Job title, company, and job description are required.");
      return;
    }

    const template = getResumeTemplateLatex(settings);

    setResumeStream("");
    setCoverStream("");
    setGenerating(true);

    try {
      const [resumeLatex, coverLetterText] = await Promise.all([
        generateResume(p, jd, template, settings, (c) => {
          setResumeStream((s) => s + c);
        }),
        generateCoverLetter(p, jd, title, co, settings, (c) => {
          setCoverStream((s) => s + c);
        }),
      ]);

      setPhaseDone(true);

      const application: Application = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        jobTitle: title,
        company: co,
        jobDescriptionText: jd,
        resumeLatex,
        coverLetterText,
        pdfBlobId: undefined,
        notes: undefined,
      };

      const apps = getApplications();
      setApplications([...apps, application]);

      setGenerating(false);

      window.setTimeout(() => {
        navigate(`/editor/${application.id}`, { replace: true });
      }, 400);
    } catch (err) {
      setGenerating(false);
      setPhaseDone(false);
      setError(getOpenAiErrorMessage(err));
    }
  }

  if (!profile) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <h1 className="text-xl font-semibold text-neutral-900">
          New application
        </h1>
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
      <h1 className="text-xl font-semibold text-neutral-900">
        New application
      </h1>
      <p className="mt-1 text-sm text-neutral-600">
        Paste a job description or upload a PDF, DOCX, or TXT job posting. Both
        resume and cover letter generate in parallel.
      </p>

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
                ? "Tailoring resume…"
                : "Resume (LaTeX)"}
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
