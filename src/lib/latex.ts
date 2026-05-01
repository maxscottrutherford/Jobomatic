/**
 * LaTeX → PDF (browser)
 *
 * **SwiftLaTeX:** This repo does not vendor SwiftLaTeX’s PdfTeX/XeTeX WASM bundle
 * (GitHub release + worker assets). To use it, set `VITE_SWIFTLATEX_ENGINE_URL` to a
 * script URL that registers a global engine constructor (e.g. `PdfTeXEngine` or
 * `LaTeXEngine`), implements `loadEngine()`, `writeMemFSFile`, `setEngineMainFile`,
 * and `compileLaTeX()` returning `{ pdf: ArrayBuffer | Uint8Array, log?: string }`.
 * If unset or load/compile fails, we fall through.
 *
 * **Fallback (what runs by default):** `latex.js` (LaTeX → HTML5) + `html2canvas`
 * rasterization + `jspdf`. This is **not** pdfTeX: complex packages (e.g. moderncv,
 * TikZ) often fail or look unlike true LaTeX PDF. Errors from the parser or canvas
 * step are returned as `errors` for the preview pane.
 *
 * Compilation is synchronous from the caller’s perspective only after a user action;
 * this module does not auto-compile on keystroke.
 */

import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { HtmlGenerator, parse } from "latex.js";

const LATEX_JS_ASSET_BASE =
  "https://cdn.jsdelivr.net/npm/latex.js@0.12.6/dist/";

type SwiftCompileResult = {
  pdf?: ArrayBuffer | Uint8Array | null;
  log?: string;
  status?: number;
};

type SwiftEngine = {
  loadEngine: () => Promise<void>;
  writeMemFSFile: (path: string, content: string) => void;
  setEngineMainFile: (path: string) => void;
  compileLaTeX: () => Promise<SwiftCompileResult>;
};

function uint8FromPdfOutput(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/**
 * Optional SwiftLaTeX path when `VITE_SWIFTLATEX_ENGINE_URL` is set and the script
 * exposes a compatible engine global.
 */
async function tryCompileSwiftLatex(
  texSource: string
): Promise<{ pdf: Uint8Array; errors: null } | { pdf: null; errors: string } | null> {
  const scriptUrl = import.meta.env.VITE_SWIFTLATEX_ENGINE_URL as
    | string
    | undefined;
  if (!scriptUrl?.trim()) {
    return null;
  }

  await import(/* @vite-ignore */ scriptUrl);

  const g = globalThis as unknown as {
    PdfTeXEngine?: new () => SwiftEngine;
    LaTeXEngine?: new () => SwiftEngine;
  };
  const Ctor = g.PdfTeXEngine ?? g.LaTeXEngine;
  if (!Ctor) {
    return {
      pdf: null,
      errors:
        "SwiftLaTeX script loaded but no PdfTeXEngine / LaTeXEngine global was found.",
    };
  }

  const engine = new Ctor();
  await engine.loadEngine();
  engine.writeMemFSFile("main.tex", texSource);
  engine.setEngineMainFile("main.tex");
  const r = await engine.compileLaTeX();
  const pdfBytes = r.pdf;
  const len =
    pdfBytes instanceof Uint8Array
      ? pdfBytes.length
      : pdfBytes instanceof ArrayBuffer
        ? pdfBytes.byteLength
        : 0;

  if (len > 0 && pdfBytes) {
    return { pdf: uint8FromPdfOutput(pdfBytes), errors: null };
  }

  const log = r.log?.trim() || "SwiftLaTeX compile returned no PDF.";
  return { pdf: null, errors: log };
}

function appendStylesToHead(links: DocumentFragment): HTMLElement[] {
  const injected: HTMLElement[] = [];
  for (const node of [...links.childNodes]) {
    if (node instanceof HTMLElement) {
      document.head.appendChild(node);
      injected.push(node);
    }
  }
  return injected;
}

/**
 * latex.js → HTML in an off-screen container → rasterize → single-page PDF (scaled).
 */
async function compileWithLatexJsPipeline(
  texSource: string
): Promise<{ pdf: Uint8Array | null; errors: string | null }> {
  const host = document.createElement("div");
  host.setAttribute("data-latexjs-compile-host", "");
  host.style.position = "fixed";
  host.style.left = "-12000px";
  host.style.top = "0";
  host.style.width = "794px";
  host.style.background = "#fff";
  host.style.padding = "24px";
  document.body.appendChild(host);

  const gen = new HtmlGenerator({ hyphenate: false });
  let injected: HTMLElement[] = [];

  try {
    parse(texSource, { generator: gen });
    injected = appendStylesToHead(gen.stylesAndScripts(LATEX_JS_ASSET_BASE));
    host.appendChild(gen.domFragment());
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));

    const canvas = await html2canvas(host, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
    });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 28;
    const availW = pageW - 2 * margin;
    const availH = pageH - 2 * margin;
    const scale = Math.min(availW / canvas.width, availH / canvas.height);
    const drawW = canvas.width * scale;
    const drawH = canvas.height * scale;
    const img = canvas.toDataURL("image/jpeg", 0.92);
    pdf.addImage(img, "JPEG", margin, margin, drawW, drawH);

    const buf = pdf.output("arraybuffer");
    return { pdf: new Uint8Array(buf), errors: null };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
    return {
      pdf: null,
      errors:
        msg ||
        "latex.js / html2canvas / jsPDF pipeline failed (see console for details).",
    };
  } finally {
    for (const el of injected) {
      el.remove();
    }
    host.remove();
  }
}

/**
 * Compile LaTeX source to PDF bytes for preview/download.
 * Call only from explicit UI (e.g. Compile button), not on every editor change.
 */
export async function compileLatex(
  texSource: string
): Promise<{ pdf: Uint8Array | null; errors: string | null }> {
  const trimmed = texSource.trim();
  if (!trimmed) {
    return { pdf: null, errors: "No LaTeX source to compile." };
  }

  try {
    const swift = await tryCompileSwiftLatex(trimmed);
    if (swift) {
      if (swift.pdf) {
        return { pdf: swift.pdf, errors: null };
      }
      const err = swift.errors;
      const fallback = await compileWithLatexJsPipeline(trimmed);
      if (fallback.pdf) {
        return {
          pdf: fallback.pdf,
          errors: null,
        };
      }
      return {
        pdf: null,
        errors: [err, fallback.errors].filter(Boolean).join("\n---\n"),
      };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const fallback = await compileWithLatexJsPipeline(trimmed);
    if (fallback.pdf) {
      return { pdf: fallback.pdf, errors: null };
    }
    return {
      pdf: null,
      errors: [`SwiftLaTeX: ${msg}`, fallback.errors].filter(Boolean).join("\n---\n"),
    };
  }

  try {
    return await compileWithLatexJsPipeline(trimmed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      pdf: null,
      errors:
        msg.trim() ||
        "LaTeX compilation failed unexpectedly (see console for details).",
    };
  }
}

export function downloadPdf(pdf: Uint8Array, filename: string): void {
  const name = filename.toLowerCase().endsWith(".pdf")
    ? filename
    : `${filename}.pdf`;
  const blob = new Blob([new Uint8Array(pdf)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadTex(texSource: string, filename: string): void {
  const name = filename.toLowerCase().endsWith(".tex")
    ? filename
    : `${filename}.tex`;
  const blob = new Blob([texSource], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Plain-text cover letter → simple multi-page PDF via jsPDF (no LaTeX).
 */
export async function coverLetterToPdf(
  text: string,
  filename: string
): Promise<void> {
  const name = filename.toLowerCase().endsWith(".pdf")
    ? filename
    : `${filename}.pdf`;

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });
  const margin = 54;
  const lineHeight = 16;
  const maxWidth = pdf.internal.pageSize.getWidth() - margin * 2;
  const pageH = pdf.internal.pageSize.getHeight();

  const paragraphs = text.replace(/\r\n/g, "\n").split(/\n\n+/);
  let y = margin;

  for (const block of paragraphs) {
    const lines = pdf.splitTextToSize(block.trim(), maxWidth);
    for (const line of lines) {
      if (y > pageH - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.text(line, margin, y);
      y += lineHeight;
    }
    y += lineHeight * 0.35;
  }

  pdf.save(name);
}
