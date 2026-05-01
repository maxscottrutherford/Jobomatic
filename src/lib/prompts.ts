import type { Project, UploadedFile, UserProfile, WorkExperience } from "../types";

/** Rough OpenAI-style token estimate for budgeting (not exact). */
export const APPROX_CHARS_PER_TOKEN = 4;

/** Default ~25k tokens ≈ 100k chars for `userMessage` before truncation. */
export const DEFAULT_MAX_USER_MESSAGE_TOKENS_APPROX = 25_000;

export function approximateMaxUserMessageChars(
  tokensApprox: number = DEFAULT_MAX_USER_MESSAGE_TOKENS_APPROX
): number {
  return Math.floor(tokensApprox * APPROX_CHARS_PER_TOKEN);
}

/** @deprecated Prefer `approximateMaxUserMessageChars()`; kept for callers using chars directly. */
export const DEFAULT_MAX_USER_MESSAGE_CHARS = approximateMaxUserMessageChars();

const RESUME_SYSTEM_PROMPT =
  "You are an expert resume writer and ATS optimization specialist. Your job is to produce a complete, valid LaTeX resume using the provided template. Tailor the resume specifically to the job description by mirroring its keywords and language. Only include skills and experience that are relevant to this role. Output only valid LaTeX source code — no explanation, no markdown, no code fences.";

const COVER_LETTER_SYSTEM_PROMPT =
  "You are an expert cover letter writer. Write a concise, specific, professional cover letter tailored to the job and company provided. It should sound human, not templated. Output plain text only — no LaTeX, no markdown, no headers.";

/**
 * Full `UserProfile` as labeled plain text for prompts, in context.md order:
 * core sections → uploaded files (`--- [name] (type) ---` blocks) → extra context.
 */
export function serializeProfile(profile: UserProfile): string {
  const blocks: string[] = [];

  blocks.push("PERSONAL INFORMATION:");
  blocks.push(`Name: ${profile.name}`);
  blocks.push(`Email: ${profile.email}`);
  if (profile.phone?.trim()) blocks.push(`Phone: ${profile.phone.trim()}`);
  if (profile.location?.trim()) {
    blocks.push(`Location: ${profile.location.trim()}`);
  }
  if (profile.linkedIn?.trim()) {
    blocks.push(`LinkedIn: ${profile.linkedIn.trim()}`);
  }
  if (profile.github?.trim()) {
    blocks.push(`GitHub: ${profile.github.trim()}`);
  }
  if (profile.portfolio?.trim()) {
    blocks.push(`Portfolio: ${profile.portfolio.trim()}`);
  }

  if (profile.summary?.trim()) {
    blocks.push("");
    blocks.push("PROFESSIONAL SUMMARY:");
    blocks.push(profile.summary.trim());
  }

  if (profile.experience.length > 0) {
    blocks.push("");
    blocks.push("WORK EXPERIENCE:");
    for (const exp of profile.experience) {
      blocks.push("");
      blocks.push(formatWorkExperienceEntry(exp));
    }
  }

  if (profile.education.length > 0) {
    blocks.push("");
    blocks.push("EDUCATION:");
    for (const ed of profile.education) {
      blocks.push("");
      blocks.push(
        [
          `${ed.degree} in ${ed.field}, ${ed.institution}`,
          `Graduation: ${ed.graduationDate}`,
          ed.gpa?.trim() ? `GPA: ${ed.gpa.trim()}` : null,
          ed.relevantCoursework?.length
            ? `Relevant coursework: ${ed.relevantCoursework.join(", ")}`
            : null,
        ]
          .filter(Boolean)
          .join("\n")
      );
    }
  }

  if (profile.skills.length > 0) {
    blocks.push("");
    blocks.push("SKILLS:");
    blocks.push(profile.skills.join(", "));
  }

  if (profile.projects.length > 0) {
    blocks.push("");
    blocks.push("PROJECTS:");
    for (const proj of profile.projects) {
      blocks.push("");
      blocks.push(formatProjectEntry(proj));
    }
  }

  if (profile.certifications?.length) {
    const certs = profile.certifications.filter((c) => c.trim());
    if (certs.length > 0) {
      blocks.push("");
      blocks.push("CERTIFICATIONS:");
      for (const c of certs) blocks.push(`- ${c}`);
    }
  }

  blocks.push("");
  blocks.push("UPLOADED FILES (parsed text):");
  const uploads = serializeUploadedFiles(profile.uploadedFiles).trim();
  blocks.push(uploads || "(None)");

  if (profile.extraContext?.trim()) {
    blocks.push("");
    blocks.push("Additional context from user:");
    blocks.push(profile.extraContext.trim());
  }

  return blocks.join("\n").trim();
}

function formatProjectEntry(proj: Project): string {
  const lines: string[] = [];
  const head = proj.url?.trim()
    ? `${proj.name} (${proj.url.trim()})`
    : proj.name;
  lines.push(head);
  lines.push(proj.description.trim());
  if (proj.tools.length > 0) {
    lines.push(`Tools: ${proj.tools.join(", ")}`);
  }
  if (proj.bullets.length > 0) {
    for (const b of proj.bullets) {
      if (b.trim()) lines.push(`- ${b.trim()}`);
    }
  }
  return lines.join("\n");
}

function formatWorkExperienceEntry(exp: WorkExperience): string {
  const lines: string[] = [];
  lines.push(`${exp.title} at ${exp.company}`);
  lines.push(`${exp.startDate} – ${exp.endDate}`);
  if (exp.tools?.length) {
    lines.push(`Tools: ${exp.tools.join(", ")}`);
  }
  if (exp.bullets.length > 0) {
    for (const b of exp.bullets) {
      if (b.trim()) lines.push(`- ${b.trim()}`);
    }
  }
  return lines.join("\n");
}

/**
 * Formats uploaded files for prompts: each block is
 * `--- [filename] ([fileType]) ---` then parsed text.
 */
export function serializeUploadedFiles(files: UploadedFile[]): string {
  if (files.length === 0) return "";
  return files
    .map(
      (f) =>
        `--- [${f.name}] (${f.fileType}) ---\n${f.parsedText}`
    )
    .join("\n\n");
}

/** One-line consolidation for older roles (context.md: summarize older). Kept short to avoid growing the prompt. */
function summarizeOlderExperienceEntry(exp: WorkExperience): WorkExperience {
  const summary = `Summary: ${exp.title} at ${exp.company} (${exp.startDate} – ${exp.endDate}). Prior bullets omitted for prompt length.`;
  return {
    ...exp,
    tools: undefined,
    bullets: [summary],
  };
}

function buildResumeUserMessage(
  profile: UserProfile,
  jd: string,
  templateLatex: string
): string {
  const parts: string[] = [];

  parts.push(templateLatex.trim());
  parts.push("");
  parts.push(serializeProfile(profile));

  parts.push("");
  parts.push("The full job description text:");
  parts.push(jd.trim());

  parts.push("");
  parts.push("Final instructions:");
  parts.push(
    "- Mirror keywords and phrases from the JD throughout the resume"
  );
  parts.push(
    "- Reorder and rewrite experience bullets to emphasize what's most relevant to this role"
  );
  parts.push(
    "- Only list skills that appear in both the profile and the JD"
  );
  parts.push(
    "- Keep to one page unless experience is 7+ years"
  );
  parts.push(
    "- Output only the `.tex` source — nothing else"
  );

  return parts.join("\n");
}

function buildCoverLetterUserMessage(
  profile: UserProfile,
  jd: string,
  jobTitle: string,
  company: string
): string {
  const parts: string[] = [];

  parts.push(serializeProfile(profile));

  parts.push("");
  parts.push("Job title:");
  parts.push(jobTitle.trim());
  parts.push("Company name:");
  parts.push(company.trim());

  parts.push("");
  parts.push("The full job description text:");
  parts.push(jd.trim());

  parts.push("");
  parts.push("Final instructions:");
  parts.push(
    "- Opening paragraph: reference the specific role and company; hook the reader"
  );
  parts.push(
    "- Middle 1–2 paragraphs: connect the user's most relevant experience and skills directly to the JD requirements; be specific, use real examples"
  );
  parts.push(
    "- Closing paragraph: brief and confident; include a call to action"
  );
  parts.push("- Tone: professional but not stiff");
  parts.push("- Length: 250–350 words");
  parts.push("- Output plain text only");

  return parts.join("\n");
}

/**
 * Truncates per context.md priority (character budget ≈ token limit × 4).
 * Never truncates: personal info, skills, education, job description (JD not on profile).
 */
function truncateProfileForUserMessage(
  profile: UserProfile,
  buildMessage: (p: UserProfile) => string,
  maxChars: number
): UserProfile {
  const p = structuredClone(profile) as UserProfile;
  let message = buildMessage(p);

  let guard = 0;
  while (message.length > maxChars && guard < 50_000) {
    guard += 1;

    // 1) Uploaded file parsed text — longest first
    const sortedFiles = [...p.uploadedFiles].sort(
      (a, b) => b.parsedText.length - a.parsedText.length
    );
    const longest = sortedFiles.find((f) => f.parsedText.length > 0);
    if (longest) {
      const idx = p.uploadedFiles.findIndex((u) => u.id === longest.id);
      const newLen = Math.max(
        0,
        Math.floor(longest.parsedText.length * 0.85)
      );
      p.uploadedFiles[idx] = {
        ...longest,
        parsedText: longest.parsedText.slice(0, newLen),
      };
      message = buildMessage(p);
      continue;
    }

    // 2) Extra context field
    if (p.extraContext && p.extraContext.length > 0) {
      const newLen = Math.max(0, Math.floor(p.extraContext.length * 0.85));
      p.extraContext =
        newLen === 0 ? undefined : p.extraContext.slice(0, newLen);
      message = buildMessage(p);
      continue;
    }

    // 3) Work experience — keep first two entries full; trim then summarize older
    let progressed = false;
    for (let i = 2; i < p.experience.length; i++) {
      const exp = p.experience[i];
      if (exp.bullets.length > 1) {
        const experience = [...p.experience];
        experience[i] = {
          ...exp,
          bullets: exp.bullets.slice(0, -1),
        };
        p.experience = experience;
        message = buildMessage(p);
        progressed = true;
        break;
      }
    }
    if (progressed) continue;

    for (let i = 2; i < p.experience.length; i++) {
      const exp = p.experience[i];
      const longIdx = exp.bullets.findIndex((b) => b.length > 40);
      if (longIdx >= 0) {
        const experience = [...p.experience];
        const bullets = [...exp.bullets];
        const b = bullets[longIdx];
        bullets[longIdx] = b.slice(
          0,
          Math.max(40, Math.floor(b.length * 0.85))
        );
        experience[i] = { ...exp, bullets };
        p.experience = experience;
        message = buildMessage(p);
        progressed = true;
        break;
      }
    }
    if (progressed) continue;

    for (let i = 2; i < p.experience.length; i++) {
      const exp = p.experience[i];
      const head = exp.bullets[0]?.trim() ?? "";
      if (
        exp.bullets.length > 0 &&
        !head.startsWith("Summary:")
      ) {
        const experience = [...p.experience];
        experience[i] = summarizeOlderExperienceEntry(exp);
        p.experience = experience;
        message = buildMessage(p);
        progressed = true;
        break;
      }
    }
    if (progressed) continue;

    // 4) Certifications — drop from end (not listed as protected in context.md)
    if (p.certifications && p.certifications.length > 0) {
      const certifications = p.certifications.slice(0, -1);
      p.certifications =
        certifications.length > 0 ? certifications : undefined;
      message = buildMessage(p);
      continue;
    }

    // 5) Projects — trim longest first (description, then bullets)
    const projIdx = findLongestProjectIndex(p.projects);
    if (projIdx >= 0) {
      const projects = [...p.projects];
      const proj = projects[projIdx];
      if (proj.bullets.length > 1) {
        projects[projIdx] = {
          ...proj,
          bullets: proj.bullets.slice(0, -1),
        };
        p.projects = projects;
        message = buildMessage(p);
        continue;
      }
      if (proj.description.length > 60) {
        projects[projIdx] = {
          ...proj,
          description: proj.description.slice(
            0,
            Math.max(60, Math.floor(proj.description.length * 0.85))
          ),
        };
        p.projects = projects;
        message = buildMessage(p);
        continue;
      }
      if (proj.bullets.length === 1 && proj.bullets[0].length > 40) {
        const bullets = [...proj.bullets];
        bullets[0] = bullets[0].slice(
          0,
          Math.max(40, Math.floor(bullets[0].length * 0.85))
        );
        projects[projIdx] = { ...proj, bullets };
        p.projects = projects;
        message = buildMessage(p);
        continue;
      }
      projects.splice(projIdx, 1);
      p.projects = projects;
      message = buildMessage(p);
      continue;
    }

    break;
  }

  return p;
}

function findLongestProjectIndex(projects: Project[]): number {
  if (projects.length === 0) return -1;
  let best = 0;
  let bestLen = -1;
  for (let i = 0; i < projects.length; i++) {
    const proj = projects[i];
    const len =
      proj.description.length +
      proj.bullets.join("").length +
      proj.tools.join("").length;
    if (len > bestLen) {
      bestLen = len;
      best = i;
    }
  }
  return best;
}

export type BuildPromptOptions = {
  /** Approximate max tokens for `userMessage`; budget = value × APPROX_CHARS_PER_TOKEN */
  maxUserMessageTokensApprox?: number;
  /** Hard character cap (overrides token-based budget if both set — prefer tokens if only tokens set) */
  maxUserMessageChars?: number;
};

export function buildResumePrompt(
  profile: UserProfile,
  jd: string,
  templateLatex: string,
  options?: BuildPromptOptions
): { systemPrompt: string; userMessage: string } {
  const maxChars =
    options?.maxUserMessageChars ??
    approximateMaxUserMessageChars(
      options?.maxUserMessageTokensApprox ??
        DEFAULT_MAX_USER_MESSAGE_TOKENS_APPROX
    );
  const build = (p: UserProfile) =>
    buildResumeUserMessage(p, jd, templateLatex);
  const trimmed = truncateProfileForUserMessage(profile, build, maxChars);
  return {
    systemPrompt: RESUME_SYSTEM_PROMPT,
    userMessage: build(trimmed),
  };
}

export function buildCoverLetterPrompt(
  profile: UserProfile,
  jd: string,
  jobTitle: string,
  company: string,
  options?: BuildPromptOptions
): { systemPrompt: string; userMessage: string } {
  const maxChars =
    options?.maxUserMessageChars ??
    approximateMaxUserMessageChars(
      options?.maxUserMessageTokensApprox ??
        DEFAULT_MAX_USER_MESSAGE_TOKENS_APPROX
    );
  const build = (p: UserProfile) =>
    buildCoverLetterUserMessage(p, jd, jobTitle, company);
  const trimmed = truncateProfileForUserMessage(profile, build, maxChars);
  return {
    systemPrompt: COVER_LETTER_SYSTEM_PROMPT,
    userMessage: build(trimmed),
  };
}
