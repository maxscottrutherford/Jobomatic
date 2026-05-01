import {
  buildCoverLetterPrompt,
  buildResumePrompt,
} from "./prompts";
import type { AppSettings, UserProfile } from "../types";

const CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

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

/** Normalizes thrown values from this module for UI display. */
export function getOpenAiErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Generation failed unexpectedly. Please try again.";
}

function parseSseDataLines(chunk: string): { events: string[]; rest: string } {
  const lines = chunk.split("\n");
  const rest = lines.pop() ?? "";
  const events: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(":")) continue;
    if (!trimmed.startsWith("data:")) continue;
    events.push(trimmed.slice(5).trim());
  }
  return { events, rest };
}

/**
 * POST chat/completions with `stream: true`, reads SSE chunks, calls `onChunk`
 * for each text delta, returns the full assistant message.
 */
export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (typeof err === "object" &&
      err !== null &&
      "name" in err &&
      (err as { name?: string }).name === "AbortError")
  );
}

export async function generateWithStreaming(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  model: string,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal,
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });
  } catch (e) {
    if (isAbortError(e)) {
      throw e;
    }
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

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body from OpenAI.");
  }

  const decoder = new TextDecoder();
  let carry = "";
  let full = "";

  try {
    while (true) {
      let readResult: ReadableStreamReadResult<Uint8Array>;
      try {
        readResult = await reader.read();
      } catch (e) {
        if (isAbortError(e)) {
          throw e;
        }
        throw new Error(
          "Network failure: connection lost while streaming from OpenAI."
        );
      }

      const { done, value } = readResult;
      if (done) break;

      carry += decoder.decode(value, { stream: true });
      const { events, rest } = parseSseDataLines(carry);
      carry = rest;

      for (const data of events) {
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{
              delta?: { content?: string | null };
            }>;
          };
          const piece = parsed.choices?.[0]?.delta?.content;
          if (piece) {
            full += piece;
            onChunk(piece);
          }
        } catch {
          /* ignore malformed SSE JSON lines */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  carry += decoder.decode();
  if (carry.trim()) {
    const { events } = parseSseDataLines(carry + "\n");
    for (const data of events) {
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string | null } }>;
        };
        const piece = parsed.choices?.[0]?.delta?.content;
        if (piece) {
          full += piece;
          onChunk(piece);
        }
      } catch {
        /* ignore */
      }
    }
  }

  return full;
}

const noopChunk = (): void => {};

export async function generateResume(
  profile: UserProfile,
  jd: string,
  template: string,
  settings: AppSettings,
  onChunk?: (c: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const { systemPrompt, userMessage } = buildResumePrompt(profile, jd, template);
  return generateWithStreaming(
    systemPrompt,
    userMessage,
    settings.openaiApiKey,
    settings.preferredModel,
    onChunk ?? noopChunk,
    signal
  );
}

export async function generateCoverLetter(
  profile: UserProfile,
  jd: string,
  jobTitle: string,
  company: string,
  settings: AppSettings,
  onChunk?: (c: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const { systemPrompt, userMessage } = buildCoverLetterPrompt(
    profile,
    jd,
    jobTitle,
    company
  );
  return generateWithStreaming(
    systemPrompt,
    userMessage,
    settings.openaiApiKey,
    settings.preferredModel,
    onChunk ?? noopChunk,
    signal
  );
}
