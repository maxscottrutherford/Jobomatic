import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Link } from "react-router-dom";

import { FileUploader } from "../components/FileUploader";
import { extractProfileFromResume } from "../lib/profileParser";
import { extractText } from "../lib/parser";
import { getAppSettings, getUserProfile, setUserProfile } from "../lib/storage";
import type {
  Education,
  Project,
  UserProfile,
  WorkExperience,
} from "../types";

function newId(): string {
  return crypto.randomUUID();
}

function loadProfile(): UserProfile {
  const raw = getUserProfile();
  if (!raw) {
    return {
      name: "",
      email: "",
      experience: [],
      education: [],
      skills: [],
      projects: [],
      uploadedFiles: [],
    };
  }
  return {
    name: raw.name ?? "",
    email: raw.email ?? "",
    phone: raw.phone,
    location: raw.location,
    linkedIn: raw.linkedIn,
    github: raw.github,
    portfolio: raw.portfolio,
    summary: raw.summary,
    experience: (raw.experience ?? []).map((e) => ({
      ...e,
      id: e.id || newId(),
      bullets: e.bullets ?? [],
      tools: e.tools ?? [],
    })),
    education: (raw.education ?? []).map((e) => ({
      ...e,
      id: e.id || newId(),
      relevantCoursework: e.relevantCoursework ?? [],
    })),
    skills: raw.skills ?? [],
    projects: (raw.projects ?? []).map((p) => ({
      ...p,
      id: p.id || newId(),
      tools: p.tools ?? [],
      bullets: p.bullets ?? [],
    })),
    certifications: raw.certifications,
    extraContext: raw.extraContext,
    uploadedFiles: raw.uploadedFiles ?? [],
  };
}

function emptyWorkExperience(): WorkExperience {
  return {
    id: newId(),
    company: "",
    title: "",
    startDate: "",
    endDate: "",
    bullets: [],
    tools: [],
  };
}

function emptyEducation(): Education {
  return {
    id: newId(),
    institution: "",
    degree: "",
    field: "",
    graduationDate: "",
    relevantCoursework: [],
  };
}

function emptyProject(): Project {
  return {
    id: newId(),
    name: "",
    description: "",
    tools: [],
    bullets: [],
  };
}

function isCoreProfileEmpty(profile: UserProfile): boolean {
  return (
    profile.experience.length === 0 &&
    profile.education.length === 0 &&
    profile.skills.length === 0
  );
}

const RESUME_AUTOFILL_ACCEPT_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
] as const;

const RESUME_AUTOFILL_ACCEPT = [
  ...RESUME_AUTOFILL_ACCEPT_MIMES,
  ".pdf",
  ".docx",
  ".txt",
  ".md",
].join(",");

function isResumeAutofillFile(file: File): boolean {
  if ((RESUME_AUTOFILL_ACCEPT_MIMES as readonly string[]).includes(file.type)) {
    return true;
  }
  return /\.(pdf|docx|txt|md)$/i.test(file.name);
}

function stringIsEmpty(s: string | undefined): boolean {
  return s == null || String(s).trim() === "";
}

function mergeOptionalString(
  existing: string | undefined,
  extracted: string | undefined
): string | undefined {
  if (!stringIsEmpty(existing)) return existing;
  if (!stringIsEmpty(extracted)) return extracted!.trim();
  return existing;
}

function mergeSkillsLikeLists(a: string[], b: string[] | undefined): string[] {
  const ext = b ?? [];
  if (a.length === 0) return ext;
  if (ext.length === 0) return a;
  const seen = new Set(a.map((s) => s.toLowerCase()));
  const out = [...a];
  for (const s of ext) {
    const k = s.trim();
    if (!k) continue;
    const lower = k.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      out.push(k);
    }
  }
  return out;
}

function mergeRecordLists<T extends { id: string }>(
  existing: T[],
  extracted: T[] | undefined
): T[] {
  const ext = extracted ?? [];
  if (existing.length === 0) {
    return ext.length > 0 ? ext.map((row) => ({ ...row })) : existing;
  }
  if (ext.length === 0) return existing;
  return [...existing, ...ext.map((row) => ({ ...row }))];
}

const MIN_RESUME_AUTOFILL_CHARS = 100;

function countExtractedNonEmptyFields(
  extracted: Partial<UserProfile>
): number {
  let n = 0;
  const scalars: (string | undefined)[] = [
    extracted.name,
    extracted.email,
    extracted.phone,
    extracted.location,
    extracted.linkedIn,
    extracted.github,
    extracted.portfolio,
    extracted.summary,
    extracted.extraContext,
  ];
  for (const s of scalars) {
    if (typeof s === "string" && s.trim() !== "") n++;
  }
  if (extracted.skills?.some((s) => s.trim() !== "")) n++;
  if (extracted.certifications?.some((s) => s.trim() !== "")) n++;
  if (
    extracted.experience?.some(
      (row) =>
        row.company.trim() !== "" ||
        row.title.trim() !== "" ||
        row.startDate.trim() !== "" ||
        row.bullets.some((b) => b.trim() !== "")
    )
  ) {
    n++;
  }
  if (
    extracted.education?.some(
      (row) =>
        row.institution.trim() !== "" ||
        row.degree.trim() !== "" ||
        row.field.trim() !== ""
    )
  ) {
    n++;
  }
  if (
    extracted.projects?.some(
      (row) =>
        row.name.trim() !== "" ||
        row.description.trim() !== "" ||
        row.bullets.some((b) => b.trim() !== "")
    )
  ) {
    n++;
  }
  if (extracted.uploadedFiles && extracted.uploadedFiles.length > 0) n++;
  return n;
}

function mergeProfile(
  existing: UserProfile,
  extracted: Partial<UserProfile>
): UserProfile {
  const e = extracted;

  const name =
    stringIsEmpty(existing.name) && !stringIsEmpty(e.name)
      ? e.name!.trim()
      : existing.name;
  const email =
    stringIsEmpty(existing.email) && !stringIsEmpty(e.email)
      ? e.email!.trim()
      : existing.email;

  const phone = mergeOptionalString(existing.phone, e.phone);
  const location = mergeOptionalString(existing.location, e.location);
  const linkedIn = mergeOptionalString(existing.linkedIn, e.linkedIn);
  const github = mergeOptionalString(existing.github, e.github);
  const portfolio = mergeOptionalString(existing.portfolio, e.portfolio);
  const summary = mergeOptionalString(existing.summary, e.summary);
  const extraContext = mergeOptionalString(existing.extraContext, e.extraContext);

  const experience = mergeRecordLists(existing.experience, e.experience);
  const education = mergeRecordLists(existing.education, e.education);
  const projects = mergeRecordLists(existing.projects, e.projects);
  const skills = mergeSkillsLikeLists(existing.skills, e.skills);

  let certifications: string[] | undefined;
  {
    const ex = existing.certifications ?? [];
    const ext = e.certifications ?? [];
    if (ext.length === 0) {
      certifications = existing.certifications;
    } else if (ex.length === 0) {
      certifications = ext.length > 0 ? ext : undefined;
    } else {
      const merged = mergeSkillsLikeLists(ex, ext);
      certifications = merged.length > 0 ? merged : undefined;
    }
  }

  return {
    ...existing,
    name,
    email,
    phone,
    location,
    linkedIn,
    github,
    portfolio,
    summary,
    experience,
    education,
    skills,
    projects,
    certifications,
    extraContext,
    uploadedFiles: existing.uploadedFiles,
  };
}

const resumeAutofillDropClass =
  "rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50/80 px-4 py-6 text-center text-sm text-neutral-600 transition-colors";
const resumeAutofillDropActiveClass =
  "border-neutral-500 bg-neutral-100/90 text-neutral-800";

type TagInputProps = {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
};

function TagInput({ label, tags, onChange, placeholder }: TagInputProps) {
  const [draft, setDraft] = useState("");

  const add = useCallback(() => {
    const t = draft.trim();
    if (!t || tags.includes(t)) return;
    onChange([...tags, t]);
    setDraft("");
  }, [draft, onChange, tags]);

  return (
    <div>
      <span className="block text-sm font-medium text-neutral-800">{label}</span>
      <div className="mt-1 flex min-h-[2.5rem] flex-wrap gap-2 rounded border border-neutral-200 bg-neutral-50/80 p-2">
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => onChange(tags.filter((x) => x !== tag))}
            className="rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs font-medium text-neutral-800 hover:bg-neutral-300"
            title="Remove"
          >
            {tag}
            <span className="ml-1 text-neutral-500">×</span>
          </button>
        ))}
      </div>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        placeholder={placeholder}
        className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
      />
      <p className="mt-1 text-xs text-neutral-500">Press Enter to add.</p>
    </div>
  );
}

const inputClass =
  "w-full rounded border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500";
const labelClass = "block text-sm font-medium text-neutral-800";
const sectionTitle = "text-lg font-semibold text-neutral-900";
const btnSecondary =
  "rounded border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-50";
const btnDanger =
  "rounded border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50";

export function Profile() {
  const [profile, setProfile] = useState<UserProfile>(loadProfile);

  const resumeAutofillInputRef = useRef<HTMLInputElement>(null);
  const [resumeAutofillDrag, setResumeAutofillDrag] = useState(false);
  const [autofillPhase, setAutofillPhase] = useState<
    "idle" | "reading" | "filling"
  >("idle");
  const [autofillError, setAutofillError] = useState<string | null>(null);
  const [autofillSuccess, setAutofillSuccess] = useState<string | null>(null);
  const [autofillNeedsSetupLink, setAutofillNeedsSetupLink] = useState(false);
  const [autofillSparseWarning, setAutofillSparseWarning] = useState<
    string | null
  >(null);

  const processResumeAutofillFile = useCallback(async (file: File) => {
    setAutofillError(null);
    setAutofillSuccess(null);
    setAutofillNeedsSetupLink(false);
    setAutofillSparseWarning(null);

    if (!isResumeAutofillFile(file)) {
      setAutofillError("Use a PDF, DOCX, or TXT resume file.");
      return;
    }

    const settings = getAppSettings();
    if (!settings?.openaiApiKey?.trim()) {
      setAutofillNeedsSetupLink(true);
      return;
    }

    setAutofillPhase("reading");
    let resumePlain: string;
    try {
      resumePlain = await extractText(file);
    } catch (err) {
      setAutofillPhase("idle");
      setAutofillError(
        err instanceof Error ? err.message : "Could not read the resume file."
      );
      return;
    }

    if (resumePlain.trim().length < MIN_RESUME_AUTOFILL_CHARS) {
      setAutofillPhase("idle");
      setAutofillError(
        "Could not read enough text from this file. Try a different format or paste your resume text manually."
      );
      return;
    }

    setAutofillPhase("filling");
    try {
      const extracted = await extractProfileFromResume(resumePlain, settings);
      const extractedFieldCount = countExtractedNonEmptyFields(extracted);
      setProfile((prev) => {
        const merged = mergeProfile(prev, extracted);
        setUserProfile(merged);
        return merged;
      });
      setAutofillSuccess(
        "Profile filled from resume. Review your details below."
      );
      if (extractedFieldCount < 3) {
        setAutofillSparseWarning(
          "Not much was found in this file. You may want to fill in your profile manually."
        );
      }
    } catch (err) {
      setAutofillError(
        err instanceof Error
          ? err.message
          : "Could not extract profile from resume."
      );
    } finally {
      setAutofillPhase("idle");
    }
  }, []);

  const onResumeAutofillInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (f) void processResumeAutofillFile(f);
    },
    [processResumeAutofillFile]
  );

  const coreProfileEmpty = useMemo(() => isCoreProfileEmpty(profile), [profile]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setUserProfile(profile);
    }, 500);
    return () => window.clearTimeout(t);
  }, [profile]);

  function updateProfile(partial: Partial<UserProfile>) {
    setProfile((prev) => ({ ...prev, ...partial }));
  }

  function moveItem<T extends { id: string }>(
    list: T[],
    index: number,
    dir: -1 | 1
  ): T[] {
    const j = index + dir;
    if (j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[index], next[j]] = [next[j], next[index]];
    return next;
  }

  return (
    <main className="mx-auto max-w-3xl p-6 pb-16">
      <h1 className="text-xl font-semibold text-neutral-900">Profile</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Changes save automatically (debounced 500ms).
      </p>

      <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-neutral-900">
          Upload your resume to autofill your profile
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          PDF, DOCX, TXT, or Markdown — drop a file here or click to browse.
        </p>
        <input
          ref={resumeAutofillInputRef}
          type="file"
          accept={RESUME_AUTOFILL_ACCEPT}
          className="hidden"
          onChange={onResumeAutofillInputChange}
          disabled={autofillPhase !== "idle"}
        />
        <div
          role="button"
          tabIndex={0}
          className={`${resumeAutofillDropClass} mt-3 cursor-pointer select-none ${
            resumeAutofillDrag ? resumeAutofillDropActiveClass : ""
          } ${autofillPhase !== "idle" ? "pointer-events-none opacity-60" : ""}`}
          onClick={() =>
            autofillPhase === "idle" && resumeAutofillInputRef.current?.click()
          }
          onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
            if (autofillPhase !== "idle") return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              resumeAutofillInputRef.current?.click();
            }
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setResumeAutofillDrag(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setResumeAutofillDrag(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setResumeAutofillDrag(false);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setResumeAutofillDrag(false);
            if (autofillPhase !== "idle") return;
            const f = e.dataTransfer.files?.[0];
            if (f) void processResumeAutofillFile(f);
          }}
        >
          {autofillPhase === "reading" ? (
            <p className="text-sm text-neutral-800">Reading your resume...</p>
          ) : autofillPhase === "filling" ? (
            <p className="text-sm text-neutral-800">Filling in your profile...</p>
          ) : (
            <p className="text-sm text-neutral-700">
              Drop your resume here or click to choose a file
            </p>
          )}
        </div>
        {autofillSuccess ? (
          <p
            className="mt-3 text-sm font-medium text-green-800"
            role="status"
          >
            {autofillSuccess}
          </p>
        ) : null}
        {autofillSparseWarning ? (
          <p className="mt-3 text-sm text-amber-900" role="status">
            {autofillSparseWarning}
          </p>
        ) : null}
        {autofillNeedsSetupLink ? (
          <p className="mt-3 text-sm text-neutral-800" role="status">
            Add your OpenAI API key in{" "}
            <Link
              to="/setup"
              className="font-medium text-neutral-900 underline hover:text-neutral-950"
            >
              Settings
            </Link>{" "}
            before using autofill.
          </p>
        ) : null}
        {autofillError ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {autofillError}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          to="/new"
          state={
            coreProfileEmpty
              ? { profileIncompleteWarning: true as const }
              : undefined
          }
          className="inline-flex rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          New application
        </Link>
        {coreProfileEmpty ? (
          <p className="max-w-xl text-xs text-amber-900" role="status">
            You have no work experience, education, or skills yet. You can still
            open New application, but generation works best with at least one of
            these filled in.
          </p>
        ) : null}
      </div>

      <form
        onSubmit={(e: FormEvent) => e.preventDefault()}
        className="mt-8 space-y-10"
      >
        <section>
          <h2 className={sectionTitle}>Personal info</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="profile-name">
                Name
              </label>
              <input
                id="profile-name"
                className={`mt-1 ${inputClass}`}
                value={profile.name}
                onChange={(e) => updateProfile({ name: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="profile-email">
                Email
              </label>
              <input
                id="profile-email"
                type="email"
                className={`mt-1 ${inputClass}`}
                value={profile.email}
                onChange={(e) => updateProfile({ email: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="profile-phone">
                Phone
              </label>
              <input
                id="profile-phone"
                className={`mt-1 ${inputClass}`}
                value={profile.phone ?? ""}
                onChange={(e) =>
                  updateProfile({
                    phone: e.target.value || undefined,
                  })
                }
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="profile-location">
                Location
              </label>
              <input
                id="profile-location"
                className={`mt-1 ${inputClass}`}
                value={profile.location ?? ""}
                onChange={(e) =>
                  updateProfile({
                    location: e.target.value || undefined,
                  })
                }
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="profile-linkedin">
                LinkedIn
              </label>
              <input
                id="profile-linkedin"
                className={`mt-1 ${inputClass}`}
                value={profile.linkedIn ?? ""}
                onChange={(e) =>
                  updateProfile({
                    linkedIn: e.target.value || undefined,
                  })
                }
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="profile-github">
                GitHub
              </label>
              <input
                id="profile-github"
                className={`mt-1 ${inputClass}`}
                value={profile.github ?? ""}
                onChange={(e) =>
                  updateProfile({
                    github: e.target.value || undefined,
                  })
                }
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="profile-portfolio">
                Portfolio URL
              </label>
              <input
                id="profile-portfolio"
                className={`mt-1 ${inputClass}`}
                value={profile.portfolio ?? ""}
                onChange={(e) =>
                  updateProfile({
                    portfolio: e.target.value || undefined,
                  })
                }
              />
            </div>
          </div>
        </section>

        <section>
          <h2 className={sectionTitle}>Summary</h2>
          <label className={`${labelClass} mt-4`} htmlFor="profile-summary">
            Professional summary
          </label>
          <textarea
            id="profile-summary"
            rows={4}
            className={`mt-1 ${inputClass}`}
            value={profile.summary ?? ""}
            onChange={(e) =>
              updateProfile({
                summary: e.target.value || undefined,
              })
            }
          />
        </section>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={sectionTitle}>Work experience</h2>
            <button
              type="button"
              className={btnSecondary}
              onClick={() =>
                updateProfile({
                  experience: [...profile.experience, emptyWorkExperience()],
                })
              }
            >
              Add experience
            </button>
          </div>
          <div className="mt-4 space-y-6">
            {profile.experience.length === 0 ? (
              <p className="text-sm text-neutral-500">No entries yet.</p>
            ) : null}
            {profile.experience.map((exp, i) => (
              <div
                key={exp.id}
                className="rounded-lg border border-neutral-200 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-neutral-700">
                    Role {i + 1}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className={btnSecondary}
                      disabled={i === 0}
                      onClick={() =>
                        updateProfile({
                          experience: moveItem(profile.experience, i, -1),
                        })
                      }
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className={btnSecondary}
                      disabled={i === profile.experience.length - 1}
                      onClick={() =>
                        updateProfile({
                          experience: moveItem(profile.experience, i, 1),
                        })
                      }
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className={btnDanger}
                      onClick={() =>
                        updateProfile({
                          experience: profile.experience.filter(
                            (_, j) => j !== i
                          ),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Company</label>
                    <input
                      className={`mt-1 ${inputClass}`}
                      value={exp.company}
                      onChange={(e) => {
                        const experience = [...profile.experience];
                        experience[i] = {
                          ...experience[i],
                          company: e.target.value,
                        };
                        updateProfile({ experience });
                      }}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Title</label>
                    <input
                      className={`mt-1 ${inputClass}`}
                      value={exp.title}
                      onChange={(e) => {
                        const experience = [...profile.experience];
                        experience[i] = { ...experience[i], title: e.target.value };
                        updateProfile({ experience });
                      }}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Start date</label>
                    <input
                      className={`mt-1 ${inputClass}`}
                      value={exp.startDate}
                      onChange={(e) => {
                        const experience = [...profile.experience];
                        experience[i] = {
                          ...experience[i],
                          startDate: e.target.value,
                        };
                        updateProfile({ experience });
                      }}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>End date</label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        className={inputClass}
                        disabled={exp.endDate === "Present"}
                        value={exp.endDate === "Present" ? "" : exp.endDate}
                        onChange={(e) => {
                          const experience = [...profile.experience];
                          experience[i] = {
                            ...experience[i],
                            endDate: e.target.value,
                          };
                          updateProfile({ experience });
                        }}
                      />
                    </div>
                    <label className="mt-2 flex items-center gap-2 text-sm text-neutral-700">
                      <input
                        type="checkbox"
                        checked={exp.endDate === "Present"}
                        onChange={(e) => {
                          const experience = [...profile.experience];
                          experience[i] = {
                            ...experience[i],
                            endDate: e.target.checked ? "Present" : "",
                          };
                          updateProfile({ experience });
                        }}
                      />
                      Present
                    </label>
                  </div>
                </div>
                <div className="mt-4">
                  <span className={labelClass}>Bullet points</span>
                  <div className="mt-2 space-y-2">
                    {exp.bullets.map((b, bi) => (
                      <div key={bi} className="flex gap-2">
                        <input
                          className={inputClass}
                          value={b}
                          onChange={(e) => {
                            const experience = [...profile.experience];
                            const bullets = [...experience[i].bullets];
                            bullets[bi] = e.target.value;
                            experience[i] = { ...experience[i], bullets };
                            updateProfile({ experience });
                          }}
                        />
                        <button
                          type="button"
                          className={btnDanger}
                          onClick={() => {
                            const experience = [...profile.experience];
                            const bullets = experience[i].bullets.filter(
                              (_, j) => j !== bi
                            );
                            experience[i] = { ...experience[i], bullets };
                            updateProfile({ experience });
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className={btnSecondary}
                      onClick={() => {
                        const experience = [...profile.experience];
                        experience[i] = {
                          ...experience[i],
                          bullets: [...experience[i].bullets, ""],
                        };
                        updateProfile({ experience });
                      }}
                    >
                      Add bullet
                    </button>
                  </div>
                </div>
                <div className="mt-4">
                  <TagInput
                    label="Tools used"
                    tags={exp.tools ?? []}
                    onChange={(tools) => {
                      const experience = [...profile.experience];
                      experience[i] = { ...experience[i], tools };
                      updateProfile({ experience });
                    }}
                    placeholder="e.g. Python"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={sectionTitle}>Education</h2>
            <button
              type="button"
              className={btnSecondary}
              onClick={() =>
                updateProfile({
                  education: [...profile.education, emptyEducation()],
                })
              }
            >
              Add education
            </button>
          </div>
          <div className="mt-4 space-y-6">
            {profile.education.length === 0 ? (
              <p className="text-sm text-neutral-500">No entries yet.</p>
            ) : null}
            {profile.education.map((ed, i) => (
              <div
                key={ed.id}
                className="rounded-lg border border-neutral-200 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-neutral-700">
                    School {i + 1}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className={btnSecondary}
                      disabled={i === 0}
                      onClick={() =>
                        updateProfile({
                          education: moveItem(profile.education, i, -1),
                        })
                      }
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className={btnSecondary}
                      disabled={i === profile.education.length - 1}
                      onClick={() =>
                        updateProfile({
                          education: moveItem(profile.education, i, 1),
                        })
                      }
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className={btnDanger}
                      onClick={() =>
                        updateProfile({
                          education: profile.education.filter(
                            (_, j) => j !== i
                          ),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Institution</label>
                    <input
                      className={`mt-1 ${inputClass}`}
                      value={ed.institution}
                      onChange={(e) => {
                        const education = [...profile.education];
                        education[i] = {
                          ...education[i],
                          institution: e.target.value,
                        };
                        updateProfile({ education });
                      }}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Degree</label>
                    <input
                      className={`mt-1 ${inputClass}`}
                      value={ed.degree}
                      onChange={(e) => {
                        const education = [...profile.education];
                        education[i] = { ...education[i], degree: e.target.value };
                        updateProfile({ education });
                      }}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Field</label>
                    <input
                      className={`mt-1 ${inputClass}`}
                      value={ed.field}
                      onChange={(e) => {
                        const education = [...profile.education];
                        education[i] = { ...education[i], field: e.target.value };
                        updateProfile({ education });
                      }}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Graduation date</label>
                    <input
                      className={`mt-1 ${inputClass}`}
                      value={ed.graduationDate}
                      onChange={(e) => {
                        const education = [...profile.education];
                        education[i] = {
                          ...education[i],
                          graduationDate: e.target.value,
                        };
                        updateProfile({ education });
                      }}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>GPA</label>
                    <input
                      className={`mt-1 ${inputClass}`}
                      value={ed.gpa ?? ""}
                      onChange={(e) => {
                        const education = [...profile.education];
                        education[i] = {
                          ...education[i],
                          gpa: e.target.value || undefined,
                        };
                        updateProfile({ education });
                      }}
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <TagInput
                    label="Relevant coursework"
                    tags={ed.relevantCoursework ?? []}
                    onChange={(relevantCoursework) => {
                      const education = [...profile.education];
                      education[i] = { ...education[i], relevantCoursework };
                      updateProfile({ education });
                    }}
                    placeholder="Course name"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className={sectionTitle}>Skills</h2>
          <div className="mt-4">
            <TagInput
              label="Add skills"
              tags={profile.skills}
              onChange={(skills) => updateProfile({ skills })}
              placeholder="e.g. TypeScript"
            />
          </div>
        </section>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={sectionTitle}>Projects</h2>
            <button
              type="button"
              className={btnSecondary}
              onClick={() =>
                updateProfile({
                  projects: [...profile.projects, emptyProject()],
                })
              }
            >
              Add project
            </button>
          </div>
          <div className="mt-4 space-y-6">
            {profile.projects.length === 0 ? (
              <p className="text-sm text-neutral-500">No entries yet.</p>
            ) : null}
            {profile.projects.map((proj, i) => (
              <div
                key={proj.id}
                className="rounded-lg border border-neutral-200 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-neutral-700">
                    Project {i + 1}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className={btnSecondary}
                      disabled={i === 0}
                      onClick={() =>
                        updateProfile({
                          projects: moveItem(profile.projects, i, -1),
                        })
                      }
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className={btnSecondary}
                      disabled={i === profile.projects.length - 1}
                      onClick={() =>
                        updateProfile({
                          projects: moveItem(profile.projects, i, 1),
                        })
                      }
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className={btnDanger}
                      onClick={() =>
                        updateProfile({
                          projects: profile.projects.filter((_, j) => j !== i),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Name</label>
                    <input
                      className={`mt-1 ${inputClass}`}
                      value={proj.name}
                      onChange={(e) => {
                        const projects = [...profile.projects];
                        projects[i] = { ...projects[i], name: e.target.value };
                        updateProfile({ projects });
                      }}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Description</label>
                    <textarea
                      className={`mt-1 ${inputClass}`}
                      rows={3}
                      value={proj.description}
                      onChange={(e) => {
                        const projects = [...profile.projects];
                        projects[i] = {
                          ...projects[i],
                          description: e.target.value,
                        };
                        updateProfile({ projects });
                      }}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>URL</label>
                    <input
                      className={`mt-1 ${inputClass}`}
                      value={proj.url ?? ""}
                      onChange={(e) => {
                        const projects = [...profile.projects];
                        projects[i] = {
                          ...projects[i],
                          url: e.target.value || undefined,
                        };
                        updateProfile({ projects });
                      }}
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <TagInput
                    label="Tools"
                    tags={proj.tools}
                    onChange={(tools) => {
                      const projects = [...profile.projects];
                      projects[i] = { ...projects[i], tools };
                      updateProfile({ projects });
                    }}
                    placeholder="e.g. React"
                  />
                </div>
                <div className="mt-4">
                  <span className={labelClass}>Bullet points</span>
                  <div className="mt-2 space-y-2">
                    {proj.bullets.map((b, bi) => (
                      <div key={bi} className="flex gap-2">
                        <input
                          className={inputClass}
                          value={b}
                          onChange={(e) => {
                            const projects = [...profile.projects];
                            const bullets = [...projects[i].bullets];
                            bullets[bi] = e.target.value;
                            projects[i] = { ...projects[i], bullets };
                            updateProfile({ projects });
                          }}
                        />
                        <button
                          type="button"
                          className={btnDanger}
                          onClick={() => {
                            const projects = [...profile.projects];
                            const bullets = projects[i].bullets.filter(
                              (_, j) => j !== bi
                            );
                            projects[i] = { ...projects[i], bullets };
                            updateProfile({ projects });
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className={btnSecondary}
                      onClick={() => {
                        const projects = [...profile.projects];
                        projects[i] = {
                          ...projects[i],
                          bullets: [...projects[i].bullets, ""],
                        };
                        updateProfile({ projects });
                      }}
                    >
                      Add bullet
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className={sectionTitle}>Certifications</h2>
          <div className="mt-4">
            <TagInput
              label="Add certifications"
              tags={profile.certifications ?? []}
              onChange={(certs) =>
                updateProfile({
                  certifications: certs.length ? certs : undefined,
                })
              }
              placeholder="e.g. AWS Solutions Architect"
            />
          </div>
        </section>

        <section>
          <h2 className={sectionTitle}>Extra context</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Anything else you want the AI to consider (pasted verbatim into
            prompts).
          </p>
          <textarea
            id="profile-extra"
            rows={8}
            className={`mt-3 ${inputClass}`}
            value={profile.extraContext ?? ""}
            onChange={(e) =>
              updateProfile({
                extraContext: e.target.value || undefined,
              })
            }
          />
        </section>

        <section>
          <h2 className={sectionTitle}>Uploaded files</h2>
          <p className="mt-1 text-sm text-neutral-600">
            PDF, DOCX, TXT, or Markdown. Text is extracted for AI prompts; the
            file is stored in your browser. You can edit the extracted text
            below—changes save with your profile.
          </p>
          <div className="mt-4">
            <FileUploader
              uploadedFiles={profile.uploadedFiles}
              onUploadedFilesChange={(uploadedFiles) =>
                updateProfile({ uploadedFiles })
              }
            />
          </div>
        </section>
      </form>
    </main>
  );
}
