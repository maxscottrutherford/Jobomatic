# Jobomatic

**Jobomatic** is a client-side web app that turns a professional profile and a target job description into two concrete outputs: a **structured resume recommendation report** (what to change for fit and ATS) and a **tailored cover letter**. It is built to demonstrate how LLMs can power a focused, end-to-end workflow without a custom backend—ideal for a portfolio piece aimed at teams building AI products.

The app calls the **OpenAI Chat Completions API** directly from the browser (with the user’s own API key), streams tokens for responsive generation, and persists everything locally in **`localStorage`** and **IndexedDB**. There is no application server and no third-party analytics; traffic goes to your hosting (if any) and to `api.openai.com`.

---

## Why this project exists

Job searches often mean repeating the same mental work: map the job description to your experience, surface missing keywords, rewrite bullets, and draft a letter that does not sound generic. Jobomatic automates that **analysis and drafting** step while keeping the user in control: you still edit your real resume in Word, Google Docs, LaTeX, or wherever you prefer—the app produces **actionable guidance and text**, not a locked-in template.

It was created to explore:

- **Structured prompting** for repeatable, sectioned outputs (resume report vs. plain-text cover letter).
- **Streaming UX** so long generations feel responsive.
- **Privacy-by-architecture**: credentials and data stay on the device unless you choose to call OpenAI.
- **Document ingestion** in the browser (PDF, DOCX, plain text) as context for the model.

---

## Features (at a glance)

| Area | What you get |
|------|----------------|
| **Setup** | Save OpenAI API key and preferred model (`gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo`). |
| **Profile** | Rich profile builder, optional resume upload with AI-assisted structuring, attachments with parsed text. |
| **New application** | Job title, company, job description (paste or upload); parallel generation of report + cover letter. |
| **Editor** | Read-only review, copy/download (TXT/PDF), re-generate report or letter per application. |
| **History** | List, open, and delete saved applications. |

---

## Architecture (data flow)

All routes except `/setup` are gated on a stored API key. Generation composes prompts from the profile, uploads, and job description, then streams results back into the UI and storage.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Browser (React + Vite)                          │
│                                                                              │
│   ┌──────────┐   ┌──────────┐   ┌──────────────┐   ┌──────────┐   ┌───────┐ │
│   │  Setup   │   │ Profile  │   │ NewApplication│   │ Editor  │   │History│ │
│   │ /setup   │   │ /profile │   │    /new       │   │/editor/:id│  │/history│
│   └────┬─────┘   └────┬─────┘   └───────┬──────┘   └────┬────┘   └───┬───┘ │
│        │              │                  │               │            │     │
│        │              │    upload PDF/    │               │            │     │
│        │              │    DOCX / TXT     │               │            │     │
│        │              ▼                  ▼               │            │     │
│        │         ┌──────────────────────────────────┐      │            │     │
│        │         │  parser.ts (pdfjs, mammoth,    │      │            │     │
│        │         │  FileReader for text/markdown)  │      │            │     │
│        │         └──────────────────┬───────────────┘      │            │     │
│        │                            │ parsed text          │            │     │
│        │                            ▼                      │            │     │
│        │         ┌──────────────────────────────────┐      │            │     │
│        └────────►│  storage.ts                     │◄─────┴────────────┘     │
│                  │  • localStorage: settings,      │                             │
│                  │    profile, applications        │                             │
│                  │  • IndexedDB (idb): file blobs  │                             │
│                  └──────────────────┬───────────────┘                             │
│                                     │                                             │
│                                     │ profile + JD + prompts                      │
│                                     ▼                                             │
│                  ┌──────────────────────────────────┐                             │
│                  │  prompts.ts → openai.ts          │                             │
│                  │  Streaming POST chat/completions │                             │
│                  └──────────────────┬───────────────┘                             │
│                                     │                                             │
└─────────────────────────────────────┼─────────────────────────────────────────┘
                                      │
                                      ▼
                        ┌─────────────────────────┐
                        │   api.openai.com        │
                        │   (user’s API key)      │
                        └─────────────────────────┘
```

**Request path summary:** UI collects or loads state → optional file parse → prompts built from `prompts.ts` → `openai.ts` streams the completion → results saved with the `Application` record → Editor/History read from storage.

---

## Tech stack

- **React 18** + **TypeScript** + **Vite 5**
- **React Router v6** for navigation and an API-key gate
- **Tailwind CSS** for styling
- **OpenAI** Chat Completions API (streaming SSE)
- **pdfjs-dist** / **mammoth** for PDF and DOCX text extraction
- **idb** for IndexedDB; **jsPDF** / **html2canvas** for exports (see `src/lib/pdf.ts`)

---

## Prerequisites

- **Node.js** 18.x or newer (LTS recommended)
- **npm** (ships with Node)
- An **OpenAI API key** with access to the models you select in Setup

---

## Setup

1. **Clone the repository** and open the project root.

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Start the dev server:**

   ```bash
   npm run dev
   ```

   Vite prints a local URL (typically `http://localhost:5173`). Open it in a modern browser.

4. **Configure the app in the UI:** go to **Setup**, paste your OpenAI API key, choose a model, and save. The key is stored in the browser’s `localStorage` only (suitable for personal use; do not use a shared machine for production secrets).

5. **Build for production** (optional):

   ```bash
   npm run build
   npm run preview
   ```

   `npm run build` runs the TypeScript project build and Vite’s production bundle.

---

## Project layout

```
src/
  App.tsx                 # Routes and API-key gate
  main.tsx
  components/             # ApiKeyGate, FileUploader, ErrorBoundary, …
  pages/                  # Setup, Profile, NewApplication, Editor, History
  lib/
    openai.ts             # Streaming OpenAI client
    prompts.ts            # Resume report + cover letter prompts
    parser.ts             # Extract text from uploads
    profileParser.ts      # Resume → structured profile (AI-assisted)
    storage.ts            # localStorage + IndexedDB
    pdf.ts                # Export helpers
  types/index.ts          # Shared TypeScript models
```

Additional product and prompt specifications for contributors live in `context.md`.

---

## Security and privacy notes

- The API key is **never** sent to this project’s servers—there aren’t any. It is used only from the browser to authenticate requests to OpenAI.
- Profile data, applications, and generated text live in **browser storage** on your device. Clearing site data or using a different browser/profile starts fresh unless you export or back up what you need.
- For a **portfolio demo**, consider using a **restricted** API key and low spend limits in the OpenAI dashboard.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server with HMR |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |

---

## License and attribution

This repository is intended as a **portfolio** project. If you fork it, keep notices required by dependencies (e.g. OpenAI, pdf.js, Mammoth) and comply with their licenses.

If you find this useful or want to discuss how it was built, open an issue or reach out—the README is written for clarity for reviewers and hiring managers as much as for day-to-day development.
