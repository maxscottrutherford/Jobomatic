import * as pdfjs from "pdfjs-dist";
import mammoth from "mammoth";

import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const PDF_TYPES = new Set(["application/pdf"]);
const DOCX_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const TEXT_TYPES = new Set(["text/plain", "text/markdown"]);

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("Could not read file as text"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsText(file);
  });
}

async function extractPdfText(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    parts.push(line);
  }
  return parts.join("\n\n").trim();
}

async function extractDocxText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer });
  return value.trim();
}

/**
 * Routes on `file.type` per context.md:
 * PDF → pdfjs-dist, DOCX → mammoth, plain/markdown → FileReader.
 */
export async function extractText(file: File): Promise<string> {
  const { type } = file;

  if (PDF_TYPES.has(type)) {
    return extractPdfText(file);
  }
  if (DOCX_TYPES.has(type)) {
    return extractDocxText(file);
  }
  if (TEXT_TYPES.has(type)) {
    return (await readFileAsText(file)).trim();
  }

  throw new Error(`Unsupported file type: ${type || "(empty)"}`);
}
