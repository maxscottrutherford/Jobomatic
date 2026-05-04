# Resume Tailor — Project Context

## Overview

Resume Tailor is a client-side web application that automates the job application process. Given a user's professional profile and a target job description, it uses the OpenAI API to produce (1) a **structured resume recommendation report**—plain text / markdown that tells the user exactly what to change in their existing resume to match the job and pass ATS screening—and (2) a tailored cover letter. The user reviews the report in a readable layout on the Editor page, copies sections or downloads the report as TXT or PDF, and edits their actual resume outside the app (e.g. in Word or Overleaf).

The app runs entirely in the browser. No backend server is required. All data (API key, profile, applications, uploaded files) is persisted in `localStorage` and `IndexedDB`. The OpenAI API is called directly from the client using the user-provided API key.

**Priority: functionality over aesthetics.** Get the core workflows working before investing in UI polish.

---

## Goals

- Functional over polished — core workflows first
- Zero backend — everything runs client-side
- Modular — each major feature (profile, resume report, cover letter, editor) is its own self-contained module
- Actionable output — the recommendation report should be specific enough to edit a real resume without guessing

---

## Tech Stack

- **Framework**: React (Vite)
- **Language**: TypeScript
- **Styling**: Tailwind CSS (utility-only, minimal styling for now)
- **Editor display**: Read-only structured plain text for the resume report (section headings) and the cover letter; no in-app source editor for either
- **PDF export**: Cover letter and resume report PDFs via `jsPDF` (`src/lib/pdf.ts`); TXT downloads for both
- **File parsing**:
  - PDF text extraction: `pdfjs-dist`
  - DOCX text extraction: `mammoth.js`
  - TXT/MD: native `FileReader` API
- **Storage**:
  - `localStorage` for profile data, API key, settings, application records (including report text)
  - `IndexedDB` (via `idb`) for uploaded file blobs and optional binary caches
- **AI**: OpenAI API (`gpt-4o` default), called directly from the browser
- **Routing**: `react-router-dom` v6

**Not in scope:** LaTeX generation, in-browser LaTeX compilation, LaTeX templates, or a LaTeX source editor for the resume.

---

## Project Structure

```
src/
  main.tsx
  App.tsx
  pages/
    Setup.tsx              # API key entry + model settings
    Profile.tsx            # User profile builder + file uploads
    NewApplication.tsx     # Job description input + AI generation trigger
    Editor.tsx             # Resume report + cover letter tabs (no LaTeX)
    History.tsx            # Past saved applications
  components/
    ApiKeyGate.tsx         # Redirect to /setup if no API key found
    FileUploader.tsx       # Reusable drag-and-drop file upload with parsing
  lib/
    openai.ts              # All OpenAI API calls with streaming support
    pdf.ts                 # jsPDF: cover letter PDF, resume report PDF, TXT download helper
    storage.ts             # localStorage + IndexedDB read/write helpers
    parser.ts              # PDF, DOCX, TXT text extraction
    profileParser.ts       # Resume plain text → OpenAI → structured UserProfile for form autofill
    prompts.ts             # GPT prompt templates (resume report + cover letter)
  types/
    index.ts               # All shared TypeScript interfaces
```

---

## Data Models

### `UserProfile`

```ts
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
  skills: string[];           // flat list: ["Python", "React", "AWS", ...]
  projects: Project[];
  certifications?: string[];
  extraContext?: string;      // freeform textarea for anything the user wants AI to draw from
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
  parsedText: string;     // extracted text, injected into AI prompts as context
  uploadedAt: string;
}
```

### `Application`

```ts
interface Application {
  id: string;
  createdAt: string;
  jobTitle: string;
  company: string;
  jobDescriptionText: string;
  resumeReport: string;      // plain text / markdown recommendation report from AI
  coverLetterText: string;   // plain text
  pdfBlobId?: string;        // optional; reserved if caching exported blobs in IndexedDB
  notes?: string;
}
```

### `AppSettings`

```ts
interface AppSettings {
  openaiApiKey: string;
  preferredModel: "gpt-4o" | "gpt-4-turbo" | "gpt-3.5-turbo";
}
```

---

## Pages & Features

### 1. Setup (`/setup`)

- Text input for OpenAI API key (saved to `localStorage`)
- Key is never sent anywhere except directly to `api.openai.com`
- Dropdown for preferred model (default: `gpt-4o`)
- No LaTeX template settings (removed from product scope)

### 2. Profile Builder (`/profile`)

**Autofill from resume (first visit):**

- When the user first opens the profile page, show a prominent **resume upload** path (same accepted types as elsewhere: PDF, DOCX, TXT, MD).
- Extract plain text with `parser.ts`, then call the OpenAI API (orchestrated from `profileParser.ts`, prompts in `prompts.ts`) to **extract structured fields** matching `UserProfile` (personal info, summary, experience, education, skills, projects, certifications as present in the source).
- Merge the result into the form so the user can **review and edit** everything before relying on it; existing manual entries may be replaced or merged per product rules (implementation detail).
- Show loading / error states if the API call fails; the user can still fill the form manually.

**Sections of the profile form:**

- **Personal Info**: name, email, phone, location, LinkedIn, GitHub, portfolio URL
- **Summary**: short bio / professional summary textarea
- **Work Experience**: repeatable entries (company, title, dates, bullet points, tools used). Add/remove/reorder entries.
- **Education**: repeatable entries (institution, degree, field, graduation date, GPA, coursework)
- **Skills**: tag-style input — type and press Enter to add, click to remove
- **Projects**: repeatable entries (name, description, URL, tools, bullet points)
- **Certifications**: simple list
- **Extra Context**: large freeform textarea. The user can paste anything here — a LinkedIn bio, a list of achievements, personal notes, or anything else they want the AI to consider during generation. This is injected verbatim into prompts.
- **Uploaded Files**: drag-and-drop or click-to-upload area
  - Accepted: PDF, DOCX, TXT, MD
  - On upload: extract text via `parser.ts`, store blob in IndexedDB, store parsed text in profile
  - Display each file with: filename, type tag (dropdown to set: resume/portfolio/transcript/certificate/other), parsed text preview (collapsible), and a remove button
  - User can manually edit the parsed text before saving

Profile auto-saves to `localStorage` on every change (debounced 500ms).

### 3. New Application (`/new`)

- Input fields: Job Title, Company Name
- Large textarea to paste the job description text
- OR upload a JD file (PDF/DOCX/TXT) — extracted text populates the textarea automatically
- "Generate" button triggers AI generation
- Generation runs **resume report** and cover letter **in parallel** via `Promise.all`
- Show loading states with live status: "Analyzing resume fit...", "Writing cover letter...", "Done"
- On completion, save the new `Application` (with `resumeReport` + `coverLetterText`) to storage and navigate to `/editor/:id`

### 4. Editor (`/editor/:applicationId`)

Two tabs: **Resume** and **Cover Letter**

**Resume tab:**

- Display the `resumeReport` in a readable format (formatted markdown or structured sections with clear headings—not a LaTeX code editor).
- Actions: **Copy** (full report or per-section if implemented), **Download as TXT**, **Download as PDF** (simple export—implementation may use `jsPDF` or similar).
- **Re-generate report** button — re-runs the resume-report AI call with the same job description, replaces the stored report
- No PDF preview of a compiled resume, no Compile button, no Overleaf integration for resume

**Cover Letter tab:**

- Read-only formatted view of `coverLetterText` (same centered card pattern as the resume tab)
- "Download as PDF" button — multi-page PDF via `jsPDF`
- "Download as TXT" button
- "Re-generate Cover Letter" button

The resume and cover letter are updated in storage when the user re-generates from this page (and when parallel generation completes on New Application). There is no in-Editor text editing for either tab; users copy or download to edit elsewhere.

### 5. History (`/history`)

- List of all saved `Application` objects, sorted by date descending
- Each entry shows: job title, company, creation date
- "Open" button — navigates to `/editor/:id`
- "Delete" button — removes from storage (with confirmation)

---

## AI Generation

All prompt templates live in `src/lib/prompts.ts`. All API call logic lives in `src/lib/openai.ts`.

### Profile autofill from resume

Structured extraction of `UserProfile` fields from parsed resume text. Prompt templates for this flow live in `src/lib/profileParser.ts` / `prompts.ts`. The HTTP call may be implemented in `src/lib/openai.ts` and composed by `src/lib/profileParser.ts`.

```ts
// src/lib/profileParser.ts

async function parseResumeIntoProfile(
  resumePlainText: string,
  settings: AppSettings,
  onChunk?: (chunk: string) => void
): Promise<UserProfile>
// Sends resume plain text + instructions; expects model output mapped to UserProfile
// (generate stable `id` fields for WorkExperience, Education, Project rows as needed)
```

### Resume recommendation report

The model **does not** output LaTeX. It outputs a **structured plain-text / markdown report** the user follows to edit their own resume.

**System + user prompts** are built with `buildResumeReportPrompt()` (or equivalent) in `prompts.ts`, mirroring the cover-letter pattern: system role + user message with serialized profile, uploads, extra context, and full JD.

**Required report structure (instruct GPT to follow this format exactly, using these section headings):**

```markdown
## SUMMARY
A 2–3 sentence overview of how well the profile matches the job and what the biggest gaps are.

## HEADLINE / TITLE
Recommended job title wording to use at the top of the resume.

## PROFESSIONAL SUMMARY
Suggested rewrite of their summary/objective section, tailored to this specific role.

## WORK EXPERIENCE
For each relevant job in their profile:
- Job title + company (as a header)
- List of specific bullet point rewrites, each starting with a strong action verb, incorporating keywords from the JD
- Flag any bullets that should be removed as not relevant

## SKILLS SECTION
- Skills to ADD (present in JD but missing from profile)
- Skills to REMOVE (not relevant to this role)
- Recommended groupings/ordering

## KEYWORDS TO ADD
A flat list of ATS keywords from the job description that are not currently present anywhere in the profile. These should be woven into the sections above.

## WHAT TO LEAVE UNCHANGED
Brief list of things in the profile that are already strong for this role — so the user knows what not to touch.
```

**User message should include (in order):**

1. The user's profile, serialized as labeled plain-text sections (not JSON)
2. Parsed text from each uploaded file, each labeled with filename and type
3. The extra context field (if non-empty), labeled as "Additional context from user:"
4. The full job description text
5. Final instructions: obey the section structure; be specific and quote JD language where helpful; do not invent jobs or degrees not in the profile; output only the report (no preamble)

### Cover Letter Generation

**System prompt:**
> You are an expert cover letter writer. Write a concise, specific, professional cover letter tailored to the job and company provided. It should sound human, not templated. Output plain text only — no Markdown or other markup, and no heading lines (e.g. lines starting with #).

**User message includes:**
1. The user's profile, serialized as labeled plain-text sections
2. Parsed text from each uploaded file, labeled by filename and type
3. The extra context field (if non-empty)
4. The job title and company name
5. The full job description text
6. Final instructions:
   - Opening paragraph: reference the specific role and company; hook the reader
   - Middle 1–2 paragraphs: connect the user's most relevant experience and skills directly to the JD requirements; be specific, use real examples
   - Closing paragraph: brief and confident; include a call to action
   - Tone: professional but not stiff
   - Length: 250–350 words
   - Output plain text only

### API Call Implementation

```ts
// src/lib/openai.ts

async function generateWithStreaming(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  model: string,
  onChunk: (chunk: string) => void
): Promise<string>
// Calls POST https://api.openai.com/v1/chat/completions
// stream: true
// Reads SSE chunks, calls onChunk with each new text delta
// Returns the full accumulated response string

async function generateResumeReport(profile: UserProfile, jd: string, settings: AppSettings, onChunk?: (c: string) => void): Promise<string>

async function generateCoverLetter(profile: UserProfile, jd: string, jobTitle: string, company: string, settings: AppSettings, onChunk?: (c: string) => void): Promise<string>
```

Run both in parallel from `NewApplication.tsx`:

```ts
const [resumeReport, coverLetterText] = await Promise.all([
  generateResumeReport(profile, jd, settings, onReportChunk),
  generateCoverLetter(profile, jd, jobTitle, company, settings, onCoverChunk),
]);
```

Handle errors gracefully: invalid API key (401), rate limit (429), and generic 5xx errors should each show a user-facing message.

### Context Window Management

If the combined prompt approaches token limits, truncate in this priority order (truncate last items first):
1. Uploaded file parsed text (truncate longest files first)
2. Extra context field
3. Work experience bullets (keep most recent 2 jobs full, summarize older ones)
4. Never truncate: personal info, skills list, education, job description

---

## File Upload & Parsing

All parsing logic in `src/lib/parser.ts`.

```ts
async function extractText(file: File): Promise<string>
// Routes based on file.type:
// - application/pdf → pdfjs-dist
// - application/vnd.openxmlformats-officedocument.wordprocessingml.document → mammoth.js
// - text/plain | text/markdown → FileReader
// Returns extracted plain text string
```

Uploaded files are stored as blobs in IndexedDB under the `files` object store, keyed by UUID. The parsed text is stored in the `UserProfile.uploadedFiles` array in `localStorage`. If the user deletes a file, remove both the IndexedDB blob and the profile entry.

Accepted MIME types: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain`, `text/markdown`.

---

## Storage Strategy

| Data | Location | Notes |
|---|---|---|
| OpenAI API key | `localStorage` | Plain text — personal use only, no backend |
| App settings | `localStorage` | Model only (no LaTeX fields) |
| UserProfile (all text fields) | `localStorage` | Auto-saved |
| Uploaded file blobs | `IndexedDB` (`files` store) | Keyed by UUID |
| All `Application` records | `localStorage` | `resumeReport` + `coverLetterText` |
| Optional PDF blobs | `IndexedDB` (`pdfs` store) | If used for exports |

Use the `idb` library. Single database: `resumeTailorDB`, version 1. Object stores: `files` (keyPath: `id`) and `pdfs` (keyPath: `id`).

---

## Routing

```
/              → Redirect: /profile if API key exists, else /setup
/setup         → API key + settings
/profile       → Profile builder
/new           → New application
/editor/:id    → Report + cover letter for a specific application
/history       → Saved applications list
```

`ApiKeyGate` wraps all routes except `/setup`. If no API key found in localStorage, redirect to `/setup`.

---

## Key Dependencies

```json
{
  "react": "^18",
  "react-dom": "^18",
  "react-router-dom": "^6",
  "typescript": "^5",
  "vite": "^5",
  "pdfjs-dist": "^4",
  "mammoth": "^1",
  "idb": "^8",
  "jspdf": "^2",
  "tailwindcss": "^3"
}
```

The Editor uses read-only views only; no CodeMirror or LaTeX-related editor packages.

---

## Development Phases

### Phase 1 — Foundation
- [ ] Vite + React + TypeScript + Tailwind project setup
- [ ] Define all types in `types/index.ts`
- [ ] Implement `storage.ts` (localStorage helpers + IndexedDB via `idb`)
- [ ] Implement `parser.ts` (PDF, DOCX, TXT extraction)
- [ ] Basic routing + `ApiKeyGate`

### Phase 2 — Profile & Setup
- [ ] Setup page (API key, model)
- [ ] Full profile builder form with all sections
- [ ] File upload component (drag-and-drop, parse on upload, display parsed text)
- [ ] Profile auto-save

### Phase 3 — AI Generation
- [ ] Write resume report + cover letter prompt templates in `prompts.ts`
- [ ] Implement `openai.ts` with streaming support
- [ ] New Application page (JD input + upload)
- [ ] Parallel resume report + cover letter generation with live streaming output
- [ ] Error handling (invalid key, rate limit, token overflow)

### Phase 4 — Editor & Export
- [ ] Editor: resume report view (readable markdown/sections)
- [ ] Copy + download TXT/PDF for report
- [ ] Cover letter plain-text editor
- [ ] Cover letter PDF export via jsPDF

### Phase 5 — History & Cleanup
- [ ] History page with saved applications list
- [ ] Re-generate flows for report and cover letter
- [ ] Edge case handling and basic error boundaries

---

## Constraints & Notes

- The OpenAI API key is stored in `localStorage` in plain text. This is acceptable and expected for a personal-use tool. Note this clearly on the Setup page.
- The recommendation report is guidance only; the user applies changes in their own resume file.
- Nothing is sent to any server other than `api.openai.com`. No analytics, no telemetry.
- All generated content belongs to the user.

