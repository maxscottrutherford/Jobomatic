import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Link } from "react-router-dom";

import { FileUploader } from "../components/FileUploader";
import { getUserProfile, setUserProfile } from "../lib/storage";
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
