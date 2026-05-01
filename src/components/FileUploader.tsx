import { useCallback, useEffect, useRef, useState } from "react";

import { extractText } from "../lib/parser";
import { deleteFileBlob, putFileBlob } from "../lib/storage";
import type { UploadedFile } from "../types";

const ACCEPT_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
] as const;

const ACCEPT_INPUT = [
  ...ACCEPT_MIMES,
  ".pdf",
  ".docx",
  ".txt",
  ".md",
].join(",");

const FILE_TYPE_OPTIONS: { value: UploadedFile["fileType"]; label: string }[] =
  [
    { value: "resume", label: "Resume" },
    { value: "portfolio", label: "Portfolio" },
    { value: "transcript", label: "Transcript" },
    { value: "certificate", label: "Certificate" },
    { value: "other", label: "Other" },
  ];

function isAcceptedFile(file: File): boolean {
  if ((ACCEPT_MIMES as readonly string[]).includes(file.type)) {
    return true;
  }
  return /\.(pdf|docx|txt|md)$/i.test(file.name);
}

const dropZoneClass =
  "rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50/80 px-4 py-8 text-center text-sm text-neutral-600 transition-colors";
const dropZoneActiveClass = "border-neutral-500 bg-neutral-100/90 text-neutral-800";

const inputClass =
  "w-full rounded border border-neutral-300 px-3 py-2 text-sm font-mono shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500";
const labelClass = "block text-sm font-medium text-neutral-800";
const btnDanger =
  "rounded border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50";

type FileUploaderProps = {
  uploadedFiles: UploadedFile[];
  onUploadedFilesChange: (files: UploadedFile[]) => void;
};

export function FileUploader({
  uploadedFiles,
  onUploadedFilesChange,
}: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadedFilesRef = useRef(uploadedFiles);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    uploadedFilesRef.current = uploadedFiles;
  }, [uploadedFiles]);

  const processFiles = useCallback(
    async (list: FileList | File[]) => {
      const files = Array.from(list).filter(isAcceptedFile);
      if (files.length === 0) {
        setLastError("No supported files (PDF, DOCX, TXT, or MD).");
        return;
      }

      setBusy(true);
      setLastError(null);
      const newEntries: UploadedFile[] = [];
      const errors: string[] = [];

      for (const file of files) {
        try {
          const parsedText = await extractText(file);
          const id = crypto.randomUUID();
          await putFileBlob({ id, blob: file });
          newEntries.push({
            id,
            name: file.name,
            fileType: "other",
            parsedText,
            uploadedAt: new Date().toISOString(),
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`${file.name}: ${msg}`);
        }
      }

      if (newEntries.length > 0) {
        onUploadedFilesChange([
          ...uploadedFilesRef.current,
          ...newEntries,
        ]);
      }
      if (errors.length > 0) {
        setLastError(errors.join(" · "));
      }
      setBusy(false);
    },
    [onUploadedFilesChange]
  );

  function updateFile(id: string, partial: Partial<UploadedFile>) {
    onUploadedFilesChange(
      uploadedFilesRef.current.map((f) =>
        f.id === id ? { ...f, ...partial } : f
      )
    );
  }

  async function removeFile(id: string) {
    try {
      await deleteFileBlob(id);
    } catch {
      /* still drop from profile so UI stays consistent */
    }
    onUploadedFilesChange(
      uploadedFilesRef.current.filter((f) => f.id !== id)
    );
  }

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        className={`${dropZoneClass} ${dragOver ? dropZoneActiveClass : ""} ${busy ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!busy) inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOver(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          if (!busy && e.dataTransfer.files?.length) {
            void processFiles(e.dataTransfer.files);
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ACCEPT_INPUT}
          multiple
          disabled={busy}
          onChange={(e) => {
            const { files } = e.target;
            if (files?.length) void processFiles(files);
            e.target.value = "";
          }}
        />
        {busy ? (
          <p>Processing files…</p>
        ) : (
          <>
            <p className="font-medium text-neutral-800">
              Drag and drop files here, or click to upload
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              PDF, DOCX, TXT, and Markdown only.
            </p>
          </>
        )}
      </div>

      {lastError ? (
        <p className="text-sm text-red-600" role="alert">
          {lastError}
        </p>
      ) : null}

      <ul className="space-y-4">
        {uploadedFiles.map((f) => (
          <li
            key={f.id}
            className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-medium text-neutral-900">{f.name}</p>
              <button
                type="button"
                className={btnDanger}
                onClick={() => void removeFile(f.id)}
              >
                Remove
              </button>
            </div>

            <div className="mt-3">
              <label className={labelClass} htmlFor={`file-type-${f.id}`}>
                Type
              </label>
              <select
                id={`file-type-${f.id}`}
                className="mt-1 w-full max-w-xs rounded border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
                value={f.fileType}
                onChange={(e) =>
                  updateFile(f.id, {
                    fileType: e.target.value as UploadedFile["fileType"],
                  })
                }
              >
                {FILE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <details className="mt-3 rounded border border-neutral-200 bg-neutral-50/50">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-neutral-800">
                Parsed text
              </summary>
              <div className="border-t border-neutral-200 p-3">
                <label className="sr-only" htmlFor={`parsed-${f.id}`}>
                  Parsed text for {f.name}
                </label>
                <textarea
                  id={`parsed-${f.id}`}
                  rows={8}
                  className={inputClass}
                  value={f.parsedText}
                  onChange={(e) =>
                    updateFile(f.id, { parsedText: e.target.value })
                  }
                />
                <p className="mt-2 text-xs text-neutral-500">
                  You can edit this text before it is saved with your profile.
                </p>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
