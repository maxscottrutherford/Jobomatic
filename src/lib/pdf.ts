import { jsPDF } from "jspdf";

/** Section titles expected in AI resume reports (see prompts / context.md). */
export const RESUME_REPORT_SECTION_HEADERS = new Set([
  "SUMMARY",
  "HEADLINE / TITLE",
  "PROFESSIONAL SUMMARY",
  "WORK EXPERIENCE",
  "SKILLS SECTION",
  "KEYWORDS TO ADD",
  "WHAT TO LEAVE UNCHANGED",
]);

/**
 * Split plain-text report into sections. `header` is empty for any preamble before the first known header.
 */
export function parseResumeReportSections(
  text: string
): { header: string; body: string }[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const out: { header: string; body: string }[] = [];
  let currentHeader = "";
  let bodyLines: string[] = [];

  const flush = () => {
    out.push({
      header: currentHeader,
      body: bodyLines.join("\n").replace(/\s+$/u, ""),
    });
  };

  for (const line of lines) {
    const t = line.trim();
    if (RESUME_REPORT_SECTION_HEADERS.has(t)) {
      if (currentHeader !== "" || bodyLines.length > 0) {
        flush();
      }
      currentHeader = t;
      bodyLines = [];
    } else {
      bodyLines.push(line);
    }
  }
  flush();
  return out;
}

/**
 * Resume recommendation report → multi-page PDF (headers bold/larger, body wrapped).
 */
export function reportToPdf(report: string, filename: string): void {
  const name = filename.toLowerCase().endsWith(".pdf")
    ? filename
    : `${filename}.pdf`;

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });
  const margin = 54;
  const pageH = pdf.internal.pageSize.getHeight();
  const maxW = pdf.internal.pageSize.getWidth() - margin * 2;
  const bodyLineHeight = 14;
  const headerLineHeight = 16;
  const bodyFontSize = 11;
  const headerFontSize = 12;

  let y = margin;

  const newPage = (): void => {
    pdf.addPage();
    y = margin;
  };

  const ensureSpace = (h: number): void => {
    if (y + h > pageH - margin) {
      newPage();
    }
  };

  const sections = parseResumeReportSections(report);

  for (const { header, body } of sections) {
    if (header) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(headerFontSize);
      const headerLines = pdf.splitTextToSize(header, maxW);
      for (const hl of headerLines) {
        ensureSpace(headerLineHeight);
        pdf.text(hl, margin, y);
        y += headerLineHeight;
      }
      y += 6;
    }

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(bodyFontSize);

    const paragraphs = body.split(/\n\n+/);
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;
      const lines = pdf.splitTextToSize(trimmed, maxW);
      for (const line of lines) {
        ensureSpace(bodyLineHeight);
        pdf.text(line, margin, y);
        y += bodyLineHeight;
      }
      y += bodyLineHeight * 0.35;
    }
  }

  pdf.save(name);
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

export function downloadTxt(text: string, filename: string): void {
  const name = filename.toLowerCase().endsWith(".txt")
    ? filename
    : `${filename}.txt`;
  const blob = new Blob([text], {
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
 * Plain-text cover letter → simple multi-page PDF via jsPDF.
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
