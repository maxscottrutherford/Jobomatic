import type { AppSettings } from "../types";

export const LATEX_TEMPLATE_OPTIONS: {
  value: AppSettings["latexTemplate"];
  label: string;
}[] = [
  { value: "jake", label: "Jake's Resume" },
  { value: "moderncv", label: "ModernCV" },
  { value: "custom", label: "Custom" },
];

/** Jake's Resume — full article-class skeleton with placeholder comments for the model. */
const JAKE_SKELETON = `% === RESUME TEMPLATE: Jake's Resume ===
% Fill in each section below based on the user's profile and job description.
% Do NOT add any text outside of LaTeX commands.
% Output only valid LaTeX. Do not include explanations or markdown.

\\documentclass[letterpaper,11pt]{article}

\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage[margin=0.75in]{geometry}
\\usepackage{hyperref}
\\usepackage{enumitem}
\\setlist{nosep,leftmargin=*}

\\pagestyle{empty}
\\hypersetup{hidelinks}

\\begin{document}

% --- HEADER ---
% Insert: full name, phone, email, LinkedIn URL, GitHub URL

% --- EDUCATION ---
% Insert: institution, degree, graduation date, GPA if provided

% --- EXPERIENCE ---
% Insert: work experience entries, most recent first
% Each entry: company, title, date range, 3-5 tailored bullet points

% --- PROJECTS ---
% Insert: relevant projects with descriptions and tech stack

% --- SKILLS ---
% Insert: technical skills, grouped by category if possible

\\end{document}
`;

/** ModernCV — full skeleton; model fills \\name, sections, and \\cventry blocks. */
const MODERNCV_SKELETON = `% === RESUME TEMPLATE: ModernCV ===
% Fill in each section below based on the user's profile and job description.
% Use moderncv macros (\\cventry, \\cvitem, \\section, etc.).
% Do NOT add any text outside of LaTeX commands.
% Output only valid LaTeX. Do not include explanations or markdown.

\\documentclass[11pt,a4paper,sans]{moderncv}

\\moderncvstyle{classic}
\\moderncvcolor{blue}

\\usepackage[utf8]{inputenc}
\\usepackage[scale=0.75]{geometry}

% --- HEADER / PERSONAL DATA ---
% Insert: \\name{First}{Last}, optional \\title{}, \\address, \\phone, \\email,
% \\social[linkedin]{handle}{url}, \\social[github]{handle}{url}

\\begin{document}
\\makecvtitle

% --- EDUCATION ---
% Insert: \\section{Education} and \\cventry entries (degree, institution, dates, details)

% --- EXPERIENCE ---
% Insert: \\section{Experience} and \\cventry for each role (dates, title, employer, location, bullets)

% --- PROJECTS ---
% Insert: \\section{Projects} with \\cventry or \\cvitem for each project

% --- SKILLS ---
% Insert: \\section{Skills} with \\cvitem or grouped \\cvdoubleitem as appropriate

\\end{document}
`;

/**
 * Returns the LaTeX skeleton or custom body for generation.
 * When `latexTemplate` is `custom` but no body is saved, returns `null` (caller must handle).
 */
export function getResumeTemplateLatex(settings: AppSettings): string | null {
  if (settings.latexTemplate === "custom") {
    const t = settings.customLatexTemplate?.trim();
    return t ? t : null;
  }
  if (settings.latexTemplate === "moderncv") {
    return MODERNCV_SKELETON;
  }
  return JAKE_SKELETON;
}
