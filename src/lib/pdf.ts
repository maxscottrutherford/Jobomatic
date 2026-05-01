import { jsPDF } from "jspdf";

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
