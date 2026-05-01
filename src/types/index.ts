export interface UserProfile {
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

export interface WorkExperience {
  id: string;
  company: string;
  title: string;
  startDate: string;
  endDate: string | "Present";
  bullets: string[];
  tools?: string[];
}

export interface Education {
  id: string;
  institution: string;
  degree: string;
  field: string;
  graduationDate: string;
  gpa?: string;
  relevantCoursework?: string[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  url?: string;
  tools: string[];
  bullets: string[];
}

export interface UploadedFile {
  id: string;
  name: string;
  fileType: "resume" | "portfolio" | "transcript" | "certificate" | "other";
  parsedText: string;
  uploadedAt: string;
}

export interface Application {
  id: string;
  createdAt: string;
  jobTitle: string;
  company: string;
  jobDescriptionText: string;
  resumeReport: string;
  coverLetterText: string;
  pdfBlobId?: string;
  notes?: string;
}

export interface AppSettings {
  openaiApiKey: string;
  preferredModel: "gpt-4o" | "gpt-4-turbo" | "gpt-3.5-turbo";
  /** Extension sync: active application for autofill (see context.md). */
  activeApplicationId?: string;
}
