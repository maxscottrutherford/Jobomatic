# Resume Tailor — Project Context

## Overview

Resume Tailor is a client-side web application that automates the job application process. Given a user's professional profile and a target job description, it uses the OpenAI API to generate an ATS-optimized LaTeX resume and a tailored cover letter. The user can edit both outputs in a live editor and export them as PDFs.

The app runs entirely in the browser. No backend server is required. All data (API key, profile, resume versions, uploaded files) is persisted in `localStorage` and `IndexedDB`. The OpenAI API is called directly from the client using the user-provided API key.

**Priority: functionality over aesthetics.** Get the core workflows working before investing in UI polish.

---

## Goals

- Functional over polished — core workflows first
- Zero backend — everything runs client-side
- Modular — each major feature (profile, resume, cover letter, editor) is its own self-contained module
- Portable output — the generated LaTeX + PDF should be usable anywhere, independent of this app

---

## Tech Stack

- **Framework**: React (Vite)
- **Language**: TypeScript
- **Styling**: Tailwind CSS (utility-only, minimal styling for now)
- **LaTeX compilation**: [SwiftLaTeX](https://github.com/SwiftLaTeX/SwiftLaTeX) (WASM, runs in browser, full pdflatex support). Fallback: [latex.js](https://latex.js.org/) if SwiftLaTeX is too heavy to set up initially.
- **PDF export**: Compiled PDF output from the LaTeX engine. Cover letter PDF via `jsPDF`.
- **Code editor**: [CodeMirror 6](https://codemirror.net/) with LaTeX syntax highlighting
- **File parsing**:
  - PDF text extraction: `pdfjs-dist`
  - DOCX text extraction: `mammoth.js`
  - TXT/MD: native `FileReader` API
- **Storage**:
  - `localStorage` for profile data, API key, settings, and small text blobs
  - `IndexedDB` (via `idb`) for uploaded file blobs, compiled PDFs, and application version history
- **AI**: OpenAI API (`gpt-4o` default), called directly from the browser
- **Routing**: `react-router-dom` v6

---

## Project Structure

```
src/
  main.tsx
  App.tsx
  pages/
    Setup.tsx              # API key entry + model/template settings
    Profile.tsx            # User profile builder + file uploads
    NewApplication.tsx     # Job description input + AI generation trigger
    Editor.tsx             # LaTeX editor + PDF preview (resume + cover letter tabs)
    History.tsx            # Past saved applications
  components/
    ApiKeyGate.tsx         # Redirect to /setup if no API key found
    FileUploader.tsx       # Reusable drag-and-drop file upload with parsing
  lib/
    openai.ts              # All OpenAI API calls with streaming support
    latex.ts               # LaTeX compilation + PDF export helpers
    storage.ts             # localStorage + IndexedDB read/write helpers
    parser.ts              # PDF, DOCX, TXT text extraction
    prompts.ts             # All GPT prompt templates (resume + cover letter)
    latexTemplates.ts      # Built-in LaTeX resume template strings
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
  resumeLatex: string;
  coverLetterText: string;   // plain text
  pdfBlobId?: string;        // references a record in IndexedDB
  notes?: string;
}
```

### `AppSettings`

```ts
interface AppSettings {
  openaiApiKey: string;
  preferredModel: "gpt-4o" | "gpt-4-turbo" | "gpt-3.5-turbo";
  latexTemplate: "jake" | "moderncv" | "custom";
  customLatexTemplate?: string;
}
```

---

## Pages & Features

### 1. Setup (`/setup`)

- Text input for OpenAI API key (saved to `localStorage`)
- Key is never sent anywhere except directly to `api.openai.com`
- Dropdown for preferred model (default: `gpt-4o`)
- Dropdown for LaTeX resume template (Jake's Resume, ModernCV)
- Option to paste a custom LaTeX template

### 2. Profile Builder (`/profile`)

Sections of the profile form:

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
- Generation runs resume and cover letter **in parallel** via `Promise.all`
- Show loading states with live status: "Tailoring resume...", "Writing cover letter...", "Done"
- On completion, save the new `Application` to storage and navigate to `/editor/:id`

### 4. Editor (`/editor/:applicationId`)

Two tabs: **Resume** and **Cover Letter**

**Resume tab:**

- Left pane: CodeMirror 6 editor loaded with the generated `.tex` source. LaTeX syntax highlighting enabled.
- Right pane: Compiled PDF preview. Compile is triggered by a "Compile" button (not on every keystroke — LaTeX compilation is slow). Show compile errors in the preview pane if the LaTeX is invalid.
- "Download PDF" button — exports the compiled PDF
- "Download .tex" button — exports the raw LaTeX source file
- "Re-generate Resume" button — re-runs the resume AI call with the same job description, replaces the editor content

**Cover Letter tab:**

- Left pane: Plain text editor (CodeMirror or simple `<textarea>`) with the generated cover letter
- Right pane: Simple formatted text preview
- "Download as PDF" button — generates a simple single-page PDF via `jsPDF`
- "Download as TXT" button
- "Re-generate Cover Letter" button

Both tabs auto-save changes to the `Application` record in storage (debounced).

### 5. History (`/history`)

- List of all saved `Application` objects, sorted by date descending
- Each entry shows: job title, company, creation date
- "Open" button — navigates to `/editor/:id`
- "Delete" button — removes from storage (with confirmation)

---

## AI Generation

All prompt templates live in `src/lib/prompts.ts`. All API call logic lives in `src/lib/openai.ts`.

### Resume Generation

**System prompt:**
> You are an expert resume writer and ATS optimization specialist. Your job is to produce a complete, valid LaTeX resume using the provided template. Tailor the resume specifically to the job description by mirroring its keywords and language. Only include skills and experience that are relevant to this role. Output only valid LaTeX source code — no explanation, no markdown, no code fences.

**User message includes (in order):**
1. The selected LaTeX template skeleton (full boilerplate with placeholder comments)
2. The user's profile, serialized as labeled plain-text sections (not JSON)
3. Parsed text from each uploaded file, each labeled with filename and type
4. The extra context field (if non-empty), labeled as "Additional context from user:"
5. The full job description text
6. Final instructions:
   - Mirror keywords and phrases from the JD throughout the resume
   - Reorder and rewrite experience bullets to emphasize what's most relevant to this role
   - Only list skills that appear in both the profile and the JD
   - Keep to one page unless experience is 7+ years
   - Output only the `.tex` source — nothing else

### Cover Letter Generation

**System prompt:**
> You are an expert cover letter writer. Write a concise, specific, professional cover letter tailored to the job and company provided. It should sound human, not templated. Output plain text only — no LaTeX, no markdown, no headers.

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

async function generateResume(profile: UserProfile, jd: string, template: string, settings: AppSettings, onChunk?: (c: string) => void): Promise<string>

async function generateCoverLetter(profile: UserProfile, jd: string, jobTitle: string, company: string, settings: AppSettings, onChunk?: (c: string) => void): Promise<string>
```

Run both in parallel from `NewApplication.tsx`:

```ts
const [resumeLatex, coverLetterText] = await Promise.all([
  generateResume(profile, jd, template, settings, onResumeChunk),
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

## LaTeX Templates

Stored as string constants in `src/lib/latexTemplates.ts`. Each template is a full `.tex` file with placeholder comments that the AI prompt instructs GPT to fill in.

**Available templates:**
- `jake` — Jake's Resume (popular single-column ATS-friendly template)
- `moderncv` — ModernCV (clean header + two-column layout)

Template skeleton example pattern:

```latex
% === RESUME TEMPLATE: Jake's Resume ===
% Fill in each section below based on the user's profile and job description.
% Do NOT add any text outside of LaTeX commands.
% Output only valid LaTeX. Do not include explanations or markdown.

\documentclass[letterpaper,11pt]{article}
% ... full preamble with packages ...

\begin{document}

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

\end{document}
```

---

## Storage Strategy

| Data | Location | Notes |
|---|---|---|
| OpenAI API key | `localStorage` | Plain text — personal use only, no backend |
| App settings | `localStorage` | Model, template preference |
| UserProfile (all text fields) | `localStorage` | Auto-saved |
| Uploaded file blobs | `IndexedDB` (`files` store) | Keyed by UUID |
| All `Application` records | `localStorage` | LaTeX + cover letter text |
| Compiled PDF blobs | `IndexedDB` (`pdfs` store) | Keyed by application ID |

Use the `idb` library. Single database: `resumeTailorDB`, version 1. Object stores: `files` (keyPath: `id`) and `pdfs` (keyPath: `id`).

---

## Routing

```
/              → Redirect: /profile if API key exists, else /setup
/setup         → API key + settings
/profile       → Profile builder
/new           → New application
/editor/:id    → LaTeX editor for a specific application
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
  "@codemirror/lang-latex": "latest",
  "codemirror": "^6",
  "pdfjs-dist": "^4",
  "mammoth": "^1",
  "idb": "^8",
  "jspdf": "^2",
  "tailwindcss": "^3",
  "uuid": "^9"
}
```

SwiftLaTeX is loaded via CDN or as a WASM asset — check the SwiftLaTeX repo for current integration instructions. If it proves difficult to integrate, use latex.js as a fallback and add a prominent "Open in Overleaf" button that passes the `.tex` source as a URL parameter.

---

## Development Phases

### Phase 1 — Foundation
- [ ] Vite + React + TypeScript + Tailwind project setup
- [ ] Define all types in `types/index.ts`
- [ ] Implement `storage.ts` (localStorage helpers + IndexedDB via `idb`)
- [ ] Implement `parser.ts` (PDF, DOCX, TXT extraction)
- [ ] Basic routing + `ApiKeyGate`

### Phase 2 — Profile & Setup
- [ ] Setup page (API key, model, template)
- [ ] Full profile builder form with all sections
- [ ] File upload component (drag-and-drop, parse on upload, display parsed text)
- [ ] Profile auto-save

### Phase 3 — AI Generation
- [ ] Write all prompt templates in `prompts.ts`
- [ ] Implement `openai.ts` with streaming support
- [ ] New Application page (JD input + upload)
- [ ] Parallel resume + cover letter generation with live streaming output
- [ ] Error handling (invalid key, rate limit, token overflow)

### Phase 4 — Editor & Export
- [ ] CodeMirror 6 LaTeX editor
- [ ] LaTeX WASM compilation (SwiftLaTeX or latex.js)
- [ ] Compiled PDF preview pane with error display
- [ ] PDF download + .tex download
- [ ] Cover letter plain-text editor
- [ ] Cover letter PDF export via jsPDF

### Phase 5 — History & Cleanup
- [ ] History page with saved applications list
- [ ] Re-generate flows for resume and cover letter
- [ ] Template switching
- [ ] Edge case handling and basic error boundaries

---

## Constraints & Notes

- The OpenAI API key is stored in `localStorage` in plain text. This is acceptable and expected for a personal-use tool. Note this clearly on the Setup page.
- LaTeX WASM compilation can take 2–5 seconds. Use a "Compile" button rather than live compilation. Show a spinner and display compile errors in the preview pane.
- The AI will occasionally produce invalid LaTeX. The preview pane should show the raw error output from the LaTeX engine so the user can identify and fix the issue manually or re-generate.
- Nothing is sent to any server other than `api.openai.com`. No analytics, no telemetry.
- All generated content belongs to the user.

---

## Browser Extension

### Overview

The browser extension is a companion to the main web app. It lets the user select one of their tailored `Application` records from the main app, then automatically fills in job application forms on third-party sites (Workday, Greenhouse, Lever, LinkedIn Easy Apply, etc.) using the structured data from that application's associated `UserProfile` and resume.

The extension reads data directly from the same `localStorage` and `IndexedDB` database that the main app writes to — no sync, no backend, no duplication. This only works when the main app is hosted on a known origin (e.g. `localhost:5173` during development, or a deployed URL in production). The extension uses `chrome.storage` to remember which application the user has "selected" as active.

### Extension Type

Chrome Extension, Manifest V3. Also compatible with Firefox via the WebExtensions API with minor adjustments.

### Extension Structure

```
extension/
  manifest.json
  popup/
    popup.html          # Extension popup UI
    popup.tsx           # React component for the popup
    popup.css
  content/
    content.ts          # Content script — injected into job application pages
    autofill.ts         # Field detection + fill logic
    fieldMap.ts         # Known field selectors for Workday, Greenhouse, Lever, etc.
  background/
    background.ts       # Service worker — handles storage reads + message passing
  shared/
    types.ts            # Shared types (mirrors main app types where needed)
    dataReader.ts       # Reads UserProfile + Application data from the main app's origin
```

### How Data Access Works

The main app stores all data in `localStorage` under `window.origin` (e.g. `http://localhost:5173`). The extension cannot access another origin's `localStorage` directly — but it can inject a content script into the main app's own page to read and relay data.

**Approach: background script reads from the main app tab**

1. The background service worker uses `chrome.scripting.executeScript` to inject a one-time script into an open tab running the main app
2. That injected script reads `localStorage` (profile, applications, settings) and returns the data
3. The background script caches this in `chrome.storage.session` for use by the content script on job sites
4. The popup triggers a fresh sync whenever it opens

This means the main app must be open in a tab for the extension to sync. If no tab with the app is found, the popup shows a "Open Resume Tailor to sync" message.

Alternatively, the main app can proactively push data to the extension by calling `chrome.runtime.sendMessage` (if the extension ID is known) whenever profile or application data changes. This is cleaner but optional — implement the pull approach first.

### `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "Resume Tailor Autofill",
  "version": "1.0.0",
  "description": "Auto-fill job applications using your tailored Resume Tailor data.",
  "permissions": [
    "activeTab",
    "scripting",
    "storage",
    "tabs"
  ],
  "host_permissions": [
    "https://*.workday.com/*",
    "https://*.greenhouse.io/*",
    "https://*.lever.co/*",
    "https://www.linkedin.com/*",
    "https://*.myworkdayjobs.com/*",
    "http://localhost:5173/*"
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_title": "Resume Tailor"
  },
  "background": {
    "service_worker": "background/background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": [
        "https://*.workday.com/*",
        "https://*.greenhouse.io/*",
        "https://*.lever.co/*",
        "https://www.linkedin.com/*",
        "https://*.myworkdayjobs.com/*"
      ],
      "js": ["content/content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

### Popup UI

The popup is a small React app (~300×400px). It has two states:

**State 1 — No data synced yet:**
- Message: "Open Resume Tailor in a tab to sync your data"
- "Sync Now" button — triggers `chrome.scripting.executeScript` to pull data from the app tab

**State 2 — Data synced:**
- Dropdown: "Active Resume" — lists all saved `Application` records by job title + company
- When the user selects one, it is saved to `chrome.storage.local` as `activeApplicationId`
- Shows: selected job title, company, date created
- "Autofill This Page" button — sends a message to the content script on the active tab to begin autofill
- "Sync" button — re-pulls latest data from the main app

### Content Script (`content.ts` + `autofill.ts`)

The content script listens for a message from the popup (`{ action: "autofill" }`), then:

1. Reads the active `Application` and `UserProfile` from `chrome.storage.session`
2. Detects which job platform the current page is on by checking `window.location.hostname`
3. Loads the appropriate field map from `fieldMap.ts`
4. Calls `autofill.ts` to locate and fill each form field

**Autofill strategy:**

For each known field, try selectors in order until one matches a visible, enabled input:
1. Exact `id` or `name` attribute match
2. `aria-label` or `placeholder` text match
3. Associated `<label>` text match
4. CSS selector from the platform-specific field map

Once a matching field is found, fill it using the appropriate method:
- `<input type="text">` / `<textarea>`: set `.value`, then dispatch `input` and `change` events (React-controlled inputs require the native input value setter)
- `<select>`: set `.value` and dispatch `change`
- `<input type="file">`: **do not autofill** — browsers block programmatic file input. Instead, show a tooltip next to the file input saying "📎 Your resume is ready — click to upload manually" and put the PDF blob URL on the clipboard
- For checkboxes / radio buttons: match by label text and set `.checked`

Always dispatch both `input` and `change` events after setting a value, using the React native input value setter trick:

```ts
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype, 'value'
)?.set;
nativeInputValueSetter?.call(field, value);
field.dispatchEvent(new Event('input', { bubbles: true }));
field.dispatchEvent(new Event('change', { bubbles: true }));
```

After attempting autofill, inject a small floating status panel into the page showing:
- How many fields were filled successfully
- How many fields were found but could not be filled
- Any fields that need manual attention (e.g. the file upload)

### `fieldMap.ts` — Platform Field Maps

```ts
interface FieldMap {
  firstName?: string[];        // ordered list of selectors to try
  lastName?: string[];
  email?: string[];
  phone?: string[];
  address?: string[];
  city?: string[];
  state?: string[];
  zip?: string[];
  linkedIn?: string[];
  github?: string[];
  portfolio?: string[];
  yearsOfExperience?: string[];
  coverLetter?: string[];
  resumeUpload?: string[];     // file input — handled separately
  // ... add more as needed
}

const workdayFieldMap: FieldMap = {
  firstName: ['[data-automation-id="legalNameSection_firstName"]'],
  lastName:  ['[data-automation-id="legalNameSection_lastName"]'],
  email:     ['[data-automation-id="email"]'],
  phone:     ['[data-automation-id="phone"]'],
  // ...
};

const greenhouseFieldMap: FieldMap = {
  firstName: ['#first_name', '[name="job_application[first_name]"]'],
  lastName:  ['#last_name',  '[name="job_application[last_name]"]'],
  email:     ['#email',      '[name="job_application[email]"]'],
  phone:     ['#phone',      '[name="job_application[phone]"]'],
  coverLetter: ['#cover_letter_text'],
  // ...
};

const leverFieldMap: FieldMap = { ... };
const linkedInFieldMap: FieldMap = { ... };

// Generic fallback: tries common label text patterns when no platform-specific map matches
const genericFieldMap: FieldMap = { ... };
```

Add more platforms over time. The field maps are the most maintenance-intensive part of the extension — job platforms change their markup. Keep them in one file for easy updates.

### Data Mapping

The content script maps `UserProfile` fields to form fields. Key mappings:

| Form field | Source |
|---|---|
| First name | `profile.name.split(' ')[0]` |
| Last name | `profile.name.split(' ').slice(1).join(' ')` |
| Email | `profile.email` |
| Phone | `profile.phone` |
| City / State | Parsed from `profile.location` |
| LinkedIn | `profile.linkedIn` |
| GitHub | `profile.github` |
| Website / Portfolio | `profile.portfolio` |
| Cover letter | `application.coverLetterText` |
| Years of experience | Computed from earliest `experience.startDate` to today |
| Resume file | Cannot autofill — show tooltip with clipboard copy instead |

For fields that require parsing (city/state from a combined location string, years of experience), do the parsing in `autofill.ts` at fill time.

### `Application` type addition

Add a `selectedForExtension` field to `AppSettings` (not to `Application`) to track which application is currently active in the extension:

```ts
// In AppSettings
activeApplicationId?: string;   // ID of the Application selected for autofill
```

This is also stored in `chrome.storage.local` so the extension persists it independently.

### Extension Development Notes

- Build the extension with Vite using a separate `vite.config.extension.ts` that outputs to `extension/dist/`. Use `vite-plugin-web-extension` or configure manual entry points for popup, background, and content scripts.
- Content scripts cannot use ES module imports directly — bundle each entry point into a self-contained IIFE.
- During development, load the extension unpacked from `extension/dist/` via `chrome://extensions` with Developer Mode on.
- Test autofill against real Workday and Greenhouse pages — their React-based forms require the native input value setter trick or they will silently reject the fill.
- LinkedIn Easy Apply uses a multi-step modal — the content script needs a MutationObserver to detect when new form steps are loaded and re-trigger autofill on each step.

### Extension Development Phase (Phase 6)

- [ ] Set up Vite extension build config with separate entry points
- [ ] Implement `background.ts` with data pull from main app tab
- [ ] Build popup UI (sync + application selector + autofill trigger)
- [ ] Implement `fieldMap.ts` for Workday and Greenhouse (highest priority platforms)
- [ ] Implement `autofill.ts` with React-compatible value setter + event dispatch
- [ ] Implement floating status panel injected into the page post-fill
- [ ] Add MutationObserver support for multi-step forms (LinkedIn Easy Apply)
- [ ] Expand field maps to Lever, LinkedIn, and generic fallback
- [ ] Test across all target platforms and iterate on selectors
