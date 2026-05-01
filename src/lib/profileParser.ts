import type {
  AppSettings,
  Education,
  Project,
  UploadedFile,
  UserProfile,
  WorkExperience,
} from "../types";

const CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

const USER_PROFILE_SHAPE_REFERENCE = `/*
interface UserProfile {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  linkedIn?: string;
  github?: string;
  portfolio?: string;
  summary?: string;
  experience: WorkExperience[];
  education: Education[];
  skills: string[];
  projects: Project[];
  certifications?: string[];
  extraContext?: string;
  uploadedFiles: UploadedFile[];
}

interface WorkExperience {
  id: string;
  company: string;
  title: string;
  startDate: string;
  endDate: string | "Present";
  bullets: string[];
  tools?: string[];
}

interface Education {
  id: string;
  institution: string;
  degree: string;
  field: string;
  graduationDate: string;
  gpa?: string;
  relevantCoursework?: string[];
}

interface Project {
  id: string;
  name: string;
  description: string;
  url?: string;
  tools: string[];
  bullets: string[];
}

interface UploadedFile {
  id: string;
  name: string;
  fileType: "resume" | "portfolio" | "transcript" | "certificate" | "other";
  parsedText: string;
  uploadedAt: string;
}
*/`;

const SYSTEM_PROMPT = `You are a precise resume parser. Your task is to read unstructured resume text and extract structured data.

Rules:
- Extract only information that is explicitly present or clearly stated in the resume text. Do not invent, infer, or assume employers, dates, degrees, skills, or achievements that are not supported by the text.
- Return ONLY a valid JSON object that matches the UserProfile field names exactly (see the user message for the TypeScript shape).
- For arrays (experience, education, projects, skills, certifications, relevantCoursework, bullets, tools): use [] when nothing is found. Never use null for arrays.
- For optional string fields (phone, location, linkedIn, github, portfolio, summary, extraContext, gpa, url, etc.): use "" when not found. Never use null for strings.
- Required top-level string fields name and email: use "" if not found in the resume.
- For uploadedFiles: always return an empty array [] — file metadata is not present in plain resume text.
- For WorkExperience.endDate: use the string "Present" when the resume indicates a current role; otherwise use the date or range text as given.
- The response must be raw JSON only: no markdown, no code fences, no commentary, no key other than JSON.`;

function mapHttpError(status: number, body: string): Error {
  const snippet = body.trim().slice(0, 300);

  if (status === 401) {
    return new Error(
      "Invalid API key. Check your key in Setup and try again."
    );
  }
  if (status === 429) {
    return new Error(
      "OpenAI rate limit reached. Wait a moment and try again."
    );
  }
  if (status >= 500) {
    return new Error("OpenAI server error. Please try again later.");
  }

  return new Error(
    `OpenAI client error (${status}). Check your request or account.${snippet ? ` Details: ${snippet}` : ""}`
  );
}

function dropField(path: string, reason: string): void {
  console.warn(`[profileParser] Dropped "${path}": ${reason}`);
}

function takeOptionalString(
  value: unknown,
  path: string
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  dropField(path, `expected string, received ${typeof value}`);
  return undefined;
}

/** Include in Partial only when present and valid string. */
function takeTopLevelString(
  value: unknown,
  path: string
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  dropField(path, `expected string, received ${typeof value}`);
  return undefined;
}

function takeStringArray(value: unknown, path: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    dropField(path, "expected array of strings");
    return undefined;
  }
  const out: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const el = value[i];
    if (typeof el === "string") out.push(el);
    else dropField(`${path}[${i}]`, "expected string element");
  }
  return out;
}

function coerceStringInRow(
  value: unknown,
  path: string,
  fallback: string
): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string") return value;
  dropField(path, `expected string, received ${typeof value}`);
  return fallback;
}

function coerceStringArrayInRow(
  value: unknown,
  path: string,
  fallback: string[]
): string[] {
  if (value === undefined || value === null) return fallback;
  if (!Array.isArray(value)) {
    dropField(path, "expected string array");
    return fallback;
  }
  const out: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const el = value[i];
    if (typeof el === "string") out.push(el);
    else dropField(`${path}[${i}]`, "expected string element");
  }
  return out;
}

function sanitizeWorkExperienceRow(
  row: unknown,
  index: number
): WorkExperience | null {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    dropField(`experience[${index}]`, "expected object");
    return null;
  }
  const o = row as Record<string, unknown>;
  return {
    id: "",
    company: coerceStringInRow(o.company, `experience[${index}].company`, ""),
    title: coerceStringInRow(o.title, `experience[${index}].title`, ""),
    startDate: coerceStringInRow(
      o.startDate,
      `experience[${index}].startDate`,
      ""
    ),
    endDate: coerceStringInRow(o.endDate, `experience[${index}].endDate`, ""),
    bullets: coerceStringArrayInRow(
      o.bullets,
      `experience[${index}].bullets`,
      []
    ),
    tools:
      o.tools === undefined
        ? undefined
        : coerceStringArrayInRow(
            o.tools,
            `experience[${index}].tools`,
            []
          ),
  };
}

function sanitizeEducationRow(row: unknown, index: number): Education | null {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    dropField(`education[${index}]`, "expected object");
    return null;
  }
  const o = row as Record<string, unknown>;
  return {
    id: "",
    institution: coerceStringInRow(
      o.institution,
      `education[${index}].institution`,
      ""
    ),
    degree: coerceStringInRow(o.degree, `education[${index}].degree`, ""),
    field: coerceStringInRow(o.field, `education[${index}].field`, ""),
    graduationDate: coerceStringInRow(
      o.graduationDate,
      `education[${index}].graduationDate`,
      ""
    ),
    gpa:
      o.gpa === undefined
        ? undefined
        : takeOptionalString(o.gpa, `education[${index}].gpa`),
    relevantCoursework:
      o.relevantCoursework === undefined
        ? undefined
        : coerceStringArrayInRow(
            o.relevantCoursework,
            `education[${index}].relevantCoursework`,
            []
          ),
  };
}

function sanitizeProjectRow(row: unknown, index: number): Project | null {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    dropField(`projects[${index}]`, "expected object");
    return null;
  }
  const o = row as Record<string, unknown>;
  return {
    id: "",
    name: coerceStringInRow(o.name, `projects[${index}].name`, ""),
    description: coerceStringInRow(
      o.description,
      `projects[${index}].description`,
      ""
    ),
    url:
      o.url === undefined
        ? undefined
        : takeOptionalString(o.url, `projects[${index}].url`),
    tools: coerceStringArrayInRow(o.tools, `projects[${index}].tools`, []),
    bullets: coerceStringArrayInRow(o.bullets, `projects[${index}].bullets`, []),
  };
}

const UPLOADED_FILE_TYPES = new Set<UploadedFile["fileType"]>([
  "resume",
  "portfolio",
  "transcript",
  "certificate",
  "other",
]);

function sanitizeUploadedFileRow(
  row: unknown,
  index: number
): UploadedFile | null {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    dropField(`uploadedFiles[${index}]`, "expected object");
    return null;
  }
  const o = row as Record<string, unknown>;
  const fileType = o.fileType;
  if (typeof fileType !== "string" || !UPLOADED_FILE_TYPES.has(fileType as UploadedFile["fileType"])) {
    dropField(
      `uploadedFiles[${index}].fileType`,
      "invalid or missing fileType"
    );
    return null;
  }
  const name = coerceStringInRow(o.name, `uploadedFiles[${index}].name`, "");
  const parsedText = coerceStringInRow(
    o.parsedText,
    `uploadedFiles[${index}].parsedText`,
    ""
  );
  const uploadedAt = coerceStringInRow(
    o.uploadedAt,
    `uploadedFiles[${index}].uploadedAt`,
    ""
  );
  const idRaw = o.id;
  const id =
    typeof idRaw === "string" && idRaw.trim()
      ? idRaw
      : crypto.randomUUID();
  if (typeof idRaw !== "string" || !idRaw.trim()) {
    dropField(`uploadedFiles[${index}].id`, "expected non-empty string; generated new id");
  }
  return {
    id,
    name,
    fileType: fileType as UploadedFile["fileType"],
    parsedText,
    uploadedAt,
  };
}

/**
 * Keeps only keys that match UserProfile types; drops malformed values with console warnings.
 */
function sanitizeExtractedProfile(
  parsed: Record<string, unknown>
): Partial<UserProfile> {
  const out: Partial<UserProfile> = {};

  const name = takeTopLevelString(parsed.name, "name");
  if (name !== undefined) out.name = name;

  const email = takeTopLevelString(parsed.email, "email");
  if (email !== undefined) out.email = email;

  const phone = takeOptionalString(parsed.phone, "phone");
  if (phone !== undefined) out.phone = phone;

  const location = takeOptionalString(parsed.location, "location");
  if (location !== undefined) out.location = location;

  const linkedIn = takeOptionalString(parsed.linkedIn, "linkedIn");
  if (linkedIn !== undefined) out.linkedIn = linkedIn;

  const github = takeOptionalString(parsed.github, "github");
  if (github !== undefined) out.github = github;

  const portfolio = takeOptionalString(parsed.portfolio, "portfolio");
  if (portfolio !== undefined) out.portfolio = portfolio;

  const summary = takeOptionalString(parsed.summary, "summary");
  if (summary !== undefined) out.summary = summary;

  const extraContext = takeOptionalString(parsed.extraContext, "extraContext");
  if (extraContext !== undefined) out.extraContext = extraContext;

  if (parsed.experience !== undefined) {
    if (!Array.isArray(parsed.experience)) {
      dropField("experience", "expected array");
    } else {
      const rows: WorkExperience[] = [];
      parsed.experience.forEach((row, i) => {
        const s = sanitizeWorkExperienceRow(row, i);
        if (s) rows.push(s);
      });
      out.experience = rows;
    }
  }

  if (parsed.education !== undefined) {
    if (!Array.isArray(parsed.education)) {
      dropField("education", "expected array");
    } else {
      const rows: Education[] = [];
      parsed.education.forEach((row, i) => {
        const s = sanitizeEducationRow(row, i);
        if (s) rows.push(s);
      });
      out.education = rows;
    }
  }

  if (parsed.projects !== undefined) {
    if (!Array.isArray(parsed.projects)) {
      dropField("projects", "expected array");
    } else {
      const rows: Project[] = [];
      parsed.projects.forEach((row, i) => {
        const s = sanitizeProjectRow(row, i);
        if (s) rows.push(s);
      });
      out.projects = rows;
    }
  }

  const skills = takeStringArray(parsed.skills, "skills");
  if (skills !== undefined) out.skills = skills;

  const certifications = takeStringArray(parsed.certifications, "certifications");
  if (certifications !== undefined) out.certifications = certifications;

  if (parsed.uploadedFiles !== undefined) {
    if (!Array.isArray(parsed.uploadedFiles)) {
      dropField("uploadedFiles", "expected array");
    } else {
      const rows: UploadedFile[] = [];
      parsed.uploadedFiles.forEach((row, i) => {
        const s = sanitizeUploadedFileRow(row, i);
        if (s) rows.push(s);
      });
      out.uploadedFiles = rows;
    }
  }

  return out;
}

function assignFreshIds(profile: Partial<UserProfile>): Partial<UserProfile> {
  const next: Partial<UserProfile> = { ...profile };

  if (Array.isArray(next.experience)) {
    next.experience = next.experience.map((row) => ({
      ...row,
      id: crypto.randomUUID(),
    }));
  }

  if (Array.isArray(next.education)) {
    next.education = next.education.map((row) => ({
      ...row,
      id: crypto.randomUUID(),
    }));
  }

  if (Array.isArray(next.projects)) {
    next.projects = next.projects.map((row) => ({
      ...row,
      id: crypto.randomUUID(),
    }));
  }

  return next;
}

/**
 * Calls GPT with resume plain text and returns structured fields for the profile form.
 * Non-streaming; response is one JSON object.
 */
export async function extractProfileFromResume(
  resumeText: string,
  settings: AppSettings
): Promise<Partial<UserProfile>> {
  const apiKey = settings.openaiApiKey?.trim();
  if (!apiKey) {
    throw new Error("No API key. Add one in Setup.");
  }

  const model = settings.preferredModel;
  const userMessage = `${USER_PROFILE_SHAPE_REFERENCE}

--- Resume text to parse ---

${resumeText}`;

  let response: Response;
  try {
    response = await fetch(CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: false,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(
        "Network failure: could not reach OpenAI. Check your connection."
      );
    }
    throw e;
  }

  if (!response.ok) {
    const text = await response.text();
    throw mapHttpError(response.status, text);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      "Profile extraction failed: could not read JSON from OpenAI response."
    );
  }

  const content = (body as { choices?: Array<{ message?: { content?: string } }> })
    ?.choices?.[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new Error(
      "Profile extraction failed: empty or missing assistant message from OpenAI."
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content.trim());
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    const preview = content.trim().slice(0, 240);
    throw new Error(
      `Profile extraction failed: model did not return valid JSON (${reason}). Response preview: ${preview}${content.length > 240 ? "…" : ""}`
    );
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "Profile extraction failed: parsed JSON must be a single object."
    );
  }

  const sanitized = sanitizeExtractedProfile(parsed as Record<string, unknown>);
  return assignFreshIds(sanitized);
}
