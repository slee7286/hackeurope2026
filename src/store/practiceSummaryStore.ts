import type { PracticeSessionSummary } from "../types";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

class PracticeSummaryStore {
  private readonly storageDir: string;
  private readonly storageFilePath: string;

  constructor() {
    this.storageDir = path.resolve(process.cwd(), "data");
    this.storageFilePath = path.join(
      this.storageDir,
      "practice-session-summaries.json"
    );
    this.ensureStorage();
  }

  private ensureStorage(): void {
    if (!existsSync(this.storageDir)) {
      mkdirSync(this.storageDir, { recursive: true });
    }

    if (!existsSync(this.storageFilePath)) {
      this.writeAll([]);
    }
  }

  private readAll(): PracticeSessionSummary[] {
    this.ensureStorage();
    const raw = readFileSync(this.storageFilePath, "utf-8").trim();
    if (!raw) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      // Reset corrupted local store to keep the app operable.
      this.writeAll([]);
      return [];
    }

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item): item is PracticeSessionSummary =>
        !!item &&
        typeof item === "object" &&
        typeof (item as { sessionId?: unknown }).sessionId === "string"
    );
  }

  private writeAll(items: PracticeSessionSummary[]): void {
    writeFileSync(this.storageFilePath, JSON.stringify(items, null, 2), "utf-8");
  }

  getBySessionId(sessionId: string): PracticeSessionSummary | undefined {
    return this.readAll().find((item) => item.sessionId === sessionId);
  }

  save(summary: PracticeSessionSummary): PracticeSessionSummary {
    const current = this.readAll();
    const existingIndex = current.findIndex(
      (item) => item.sessionId === summary.sessionId
    );

    if (existingIndex >= 0) {
      current[existingIndex] = summary;
    } else {
      current.push(summary);
    }

    this.writeAll(current);
    return summary;
  }

  listByPatientId(patientId: string, limit: number): PracticeSessionSummary[] {
    return this.readAll()
      .filter((item) => item.patientId === patientId)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      .slice(0, limit);
  }
}

export const practiceSummaryStore = new PracticeSummaryStore();
