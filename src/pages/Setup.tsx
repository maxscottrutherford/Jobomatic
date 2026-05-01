import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { LATEX_TEMPLATE_OPTIONS } from "../lib/latexTemplates";
import { getAppSettings, patchAppSettings } from "../lib/storage";
import type { AppSettings } from "../types";

const MODEL_OPTIONS: { value: AppSettings["preferredModel"]; label: string }[] =
  [
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  ];

export function Setup() {
  const navigate = useNavigate();
  const saved = useMemo(() => getAppSettings(), []);

  const [openaiApiKey, setOpenaiApiKey] = useState(
    () => saved?.openaiApiKey ?? ""
  );
  const [preferredModel, setPreferredModel] = useState<
    AppSettings["preferredModel"]
  >(() => saved?.preferredModel ?? "gpt-4o");
  const [latexTemplate, setLatexTemplate] = useState<
    AppSettings["latexTemplate"]
  >(() => saved?.latexTemplate ?? "jake");
  const [customLatexTemplate, setCustomLatexTemplate] = useState(
    () => saved?.customLatexTemplate ?? ""
  );
  const [keyError, setKeyError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedKey = openaiApiKey.trim();
    setKeyError(null);

    const partial: Partial<AppSettings> = {
      preferredModel,
      latexTemplate,
    };
    if (latexTemplate === "custom") {
      partial.customLatexTemplate = customLatexTemplate;
    }

    if (!trimmedKey) {
      partial.openaiApiKey = "";
      patchAppSettings(partial);
      navigate("/setup", { replace: true });
      return;
    }

    partial.openaiApiKey = trimmedKey;
    const next = patchAppSettings(partial);
    if (next.openaiApiKey.trim()) {
      navigate("/profile", { replace: true });
    }
  }

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-xl font-semibold text-neutral-900">Setup</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Your OpenAI API key is stored only in this browser&apos;s{" "}
        <code className="rounded bg-neutral-100 px-1 text-neutral-800">
          localStorage
        </code>{" "}
        as plain text. It is sent only to{" "}
        <code className="rounded bg-neutral-100 px-1 text-neutral-800">
          api.openai.com
        </code>{" "}
        when you run generation. Suitable for personal use on a trusted machine.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="openai-api-key"
            className="block text-sm font-medium text-neutral-800"
          >
            OpenAI API key
          </label>
          <input
            id="openai-api-key"
            name="openaiApiKey"
            type="password"
            autoComplete="off"
            value={openaiApiKey}
            onChange={(e) => setOpenaiApiKey(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            placeholder="sk-…"
          />
          {keyError ? (
            <p className="mt-1 text-sm text-red-600" role="alert">
              {keyError}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="preferred-model"
            className="block text-sm font-medium text-neutral-800"
          >
            Preferred model
          </label>
          <select
            id="preferred-model"
            name="preferredModel"
            value={preferredModel}
            onChange={(e) =>
              setPreferredModel(e.target.value as AppSettings["preferredModel"])
            }
            className="mt-1 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
          >
            {MODEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="latex-template"
            className="block text-sm font-medium text-neutral-800"
          >
            LaTeX resume template
          </label>
          <select
            id="latex-template"
            name="latexTemplate"
            value={latexTemplate}
            onChange={(e) =>
              setLatexTemplate(e.target.value as AppSettings["latexTemplate"])
            }
            className="mt-1 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
          >
            {LATEX_TEMPLATE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {latexTemplate === "custom" ? (
          <div>
            <label
              htmlFor="custom-latex-template"
              className="block text-sm font-medium text-neutral-800"
            >
              Custom LaTeX template
            </label>
            <textarea
              id="custom-latex-template"
              name="customLatexTemplate"
              value={customLatexTemplate}
              onChange={(e) => setCustomLatexTemplate(e.target.value)}
              rows={12}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 font-mono text-xs shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
              placeholder="Paste full .tex skeleton with placeholders…"
            />
          </div>
        ) : null}

        <button
          type="submit"
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2"
        >
          Save
        </button>
      </form>
    </main>
  );
}
