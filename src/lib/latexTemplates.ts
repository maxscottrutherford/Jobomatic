import type { AppSettings } from "../types";

/** Minimal Jake-style skeleton; AI fills per template instructions in prompts. */
const JAKE_SKELETON = `% === RESUME TEMPLATE: Jake's Resume ===
\\documentclass[letterpaper,11pt]{article}
\\begin{document}
% --- HEADER --- (name, phone, email, links)
% --- EXPERIENCE ---
% --- EDUCATION ---
% --- PROJECTS ---
% --- SKILLS ---
\\end{document}
`;

/** Minimal ModernCV-style skeleton placeholder. */
const MODERNCV_SKELETON = `% === RESUME TEMPLATE: ModernCV ===
\\documentclass[11pt,a4paper,sans]{moderncv}
\\begin{document}
\\makecvtitle
% --- EXPERIENCE ---
% --- EDUCATION ---
% --- SKILLS ---
\\end{document}
`;

export function getResumeTemplateLatex(settings: AppSettings): string {
  if (
    settings.latexTemplate === "custom" &&
    settings.customLatexTemplate?.trim()
  ) {
    return settings.customLatexTemplate.trim();
  }
  if (settings.latexTemplate === "moderncv") {
    return MODERNCV_SKELETON;
  }
  return JAKE_SKELETON;
}
