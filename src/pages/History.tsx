import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  deletePdfBlob,
  getApplications,
  probeIndexedDbAvailable,
  setApplications as saveApplications,
} from "../lib/storage";
import type { Application } from "../types";

function sortNewestFirst(apps: Application[]): Application[] {
  return [...apps].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const btnPrimary =
  "inline-flex rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800";

const btnDanger =
  "inline-flex rounded border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50";

export function History() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [idbUnavailable, setIdbUnavailable] = useState(false);

  useEffect(() => {
    setApplications(sortNewestFirst(getApplications()));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await probeIndexedDbAvailable();
      if (!cancelled && !ok) {
        setIdbUnavailable(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleDelete(app: Application) {
    const ok = window.confirm(
      `Delete this application?\n\n${app.jobTitle} — ${app.company}\n\nThis cannot be undone.`
    );
    if (!ok) return;

    if (app.pdfBlobId?.trim()) {
      void deletePdfBlob(app.pdfBlobId).catch(() => {
        /* IndexedDB may be unavailable; local list still updates */
      });
    }

    setApplications((prev) => {
      const next = sortNewestFirst(prev.filter((a) => a.id !== app.id));
      saveApplications(next);
      return next;
    });
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-semibold text-neutral-900">History</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Saved applications, newest first.
      </p>

      {idbUnavailable ? (
        <div
          className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          role="status"
        >
          Offline storage (IndexedDB) is not available in this browser session
          (for example, in some private browsing modes). Your application list
          still works, but cached PDFs tied to IndexedDB may not open or delete
          cleanly.
        </div>
      ) : null}

      {applications.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-6 py-10 text-center">
          <p className="text-sm text-neutral-700">No applications yet.</p>
          <p className="mt-2 text-sm text-neutral-500">
            Create one from a job description to tailor your resume and cover
            letter.
          </p>
          <Link
            to="/new"
            className={`mt-6 ${btnPrimary}`}
          >
            New application
          </Link>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
          {applications.map((app) => (
            <li
              key={app.id}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium text-neutral-900">{app.jobTitle}</p>
                <p className="text-sm text-neutral-600">{app.company}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  {formatCreatedAt(app.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link
                  to={`/editor/${app.id}`}
                  className={btnPrimary}
                >
                  Open
                </Link>
                <button
                  type="button"
                  className={btnDanger}
                  onClick={() => handleDelete(app)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
