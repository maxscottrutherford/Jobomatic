/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional URL to a SwiftLaTeX engine script (see `src/lib/latex.ts` header). */
  readonly VITE_SWIFTLATEX_ENGINE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
