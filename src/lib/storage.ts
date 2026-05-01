import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AppSettings, Application, UserProfile } from "../types";

const DB_NAME = "resumeTailorDB";
const DB_VERSION = 1;

const LS_KEYS = {
  settings: "resumeTailor:settings",
  profile: "resumeTailor:profile",
  applications: "resumeTailor:applications",
} as const;

export interface StoredFileRecord {
  id: string;
  blob: Blob;
}

export interface StoredPdfRecord {
  id: string;
  blob: Blob;
}

interface ResumeTailorDB extends DBSchema {
  files: {
    key: string;
    value: StoredFileRecord;
  };
  pdfs: {
    key: string;
    value: StoredPdfRecord;
  };
}

let dbPromise: Promise<IDBPDatabase<ResumeTailorDB>> | null = null;

function getDb(): Promise<IDBPDatabase<ResumeTailorDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ResumeTailorDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("files")) {
          db.createObjectStore("files", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("pdfs")) {
          db.createObjectStore("pdfs", { keyPath: "id" });
        }
      },
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

/** Returns false if IndexedDB is missing or opening the app database fails (e.g. some private browsing modes). */
export async function probeIndexedDbAvailable(): Promise<boolean> {
  if (typeof indexedDB === "undefined") {
    return false;
  }
  try {
    await getDb();
    return true;
  } catch {
    return false;
  }
}

function readJson<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getAppSettings(): AppSettings | null {
  return readJson<AppSettings>(LS_KEYS.settings);
}

export function setAppSettings(settings: AppSettings): void {
  writeJson(LS_KEYS.settings, settings);
}

export function patchAppSettings(partial: Partial<AppSettings>): AppSettings {
  const current = getAppSettings();
  const next: AppSettings = {
    openaiApiKey: "",
    preferredModel: "gpt-4o",
    ...current,
    ...partial,
  };
  setAppSettings(next);
  return next;
}

export function hasApiKey(): boolean {
  const key = getAppSettings()?.openaiApiKey?.trim();
  return Boolean(key);
}

export function getUserProfile(): UserProfile | null {
  return readJson<UserProfile>(LS_KEYS.profile);
}

export function setUserProfile(profile: UserProfile): void {
  writeJson(LS_KEYS.profile, profile);
}

type StoredApplication = Application & { resumeLatex?: string };

export function getApplications(): Application[] {
  const list = readJson<StoredApplication[]>(LS_KEYS.applications) ?? [];
  return list.map(({ resumeLatex, ...rest }) => ({
    ...rest,
    resumeReport: rest.resumeReport ?? resumeLatex ?? "",
  }));
}

export function setApplications(apps: Application[]): void {
  writeJson(LS_KEYS.applications, apps);
}

export async function putFileBlob(record: StoredFileRecord): Promise<void> {
  const db = await getDb();
  await db.put("files", record);
}

export async function getFileBlob(id: string): Promise<Blob | undefined> {
  const db = await getDb();
  const row = await db.get("files", id);
  return row?.blob;
}

export async function deleteFileBlob(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("files", id);
}

export async function putPdfBlob(record: StoredPdfRecord): Promise<void> {
  const db = await getDb();
  await db.put("pdfs", record);
}

export async function getPdfBlob(id: string): Promise<Blob | undefined> {
  const db = await getDb();
  const row = await db.get("pdfs", id);
  return row?.blob;
}

export async function deletePdfBlob(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("pdfs", id);
}
