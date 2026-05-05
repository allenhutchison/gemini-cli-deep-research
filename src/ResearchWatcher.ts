import * as fs from 'fs';
import * as path from 'path';
import {
  Interaction,
  ReportGenerator,
  ResearchManager,
} from '@allenhutchison/gemini-utils';
import { WorkspaceConfigManager } from './config/WorkspaceConfig.js';

const DEFAULT_POLL_INTERVAL_MS = 60_000;

export interface ResearchWatcherDeps {
  researchManager: Pick<ResearchManager, 'poll'>;
  reportGenerator: Pick<ReportGenerator, 'generateMarkdown'>;
  pollIntervalMs?: number;
  workspaceRoot?: string;
}

export class ResearchWatcher {
  private readonly researchManager: ResearchWatcherDeps['researchManager'];
  private readonly reportGenerator: ResearchWatcherDeps['reportGenerator'];
  private readonly pollIntervalMs: number;
  private readonly workspaceRoot: string;
  private readonly active = new Map<string, Promise<void>>();

  constructor(deps: ResearchWatcherDeps) {
    this.researchManager = deps.researchManager;
    this.reportGenerator = deps.reportGenerator;
    this.pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.workspaceRoot = deps.workspaceRoot ?? process.env.GEMINI_WORKSPACE_PATH ?? '.';
  }

  /**
   * Begins watching a research interaction. Persists the (id, outputPath) so
   * the watcher can resume after a server restart, then kicks off the async
   * poll loop. Returns immediately.
   */
  track(id: string, outputPath: string): void {
    WorkspaceConfigManager.addPendingResearch(id, outputPath);
    this.spawn(id, outputPath);
  }

  /**
   * Resumes watchers for any research interactions that were in flight when
   * the previous server process exited. Safe to call on startup.
   */
  resumeAll(): void {
    const pending = WorkspaceConfigManager.getAllPendingResearch();
    for (const [id, { outputPath }] of Object.entries(pending)) {
      this.spawn(id, outputPath);
    }
  }

  /**
   * For tests: returns a promise that resolves when all in-flight watcher
   * tasks have settled.
   */
  async settle(): Promise<void> {
    await Promise.all(this.active.values());
  }

  private spawn(id: string, outputPath: string): void {
    if (this.active.has(id)) return;
    const task = this.run(id, outputPath).finally(() => {
      this.active.delete(id);
    });
    this.active.set(id, task);
  }

  private async run(id: string, outputPath: string): Promise<void> {
    const resolved = this.resolve(outputPath);
    let interaction: Interaction;
    try {
      interaction = await this.researchManager.poll(id, this.pollIntervalMs);
    } catch (err) {
      this.writeError(resolved, id, err instanceof Error ? err.message : String(err));
      WorkspaceConfigManager.removePendingResearch(id);
      return;
    }

    if (interaction.status === 'completed' && interaction.outputs) {
      try {
        const markdown = this.reportGenerator.generateMarkdown(interaction.outputs);
        fs.writeFileSync(resolved, markdown);
      } catch (err) {
        this.writeError(resolved, id, err instanceof Error ? err.message : String(err));
      }
    } else {
      const reason =
        interaction.status === 'completed'
          ? 'Research completed but returned no outputs.'
          : `Research ended with status "${interaction.status ?? 'unknown'}".`;
      this.writeError(resolved, id, reason);
    }
    WorkspaceConfigManager.removePendingResearch(id);
  }

  private resolve(outputPath: string): string {
    return path.isAbsolute(outputPath)
      ? outputPath
      : path.resolve(this.workspaceRoot, outputPath);
  }

  private writeError(resolved: string, id: string, message: string): void {
    const body = [
      `Deep Research did not produce a report.`,
      ``,
      `Reason: ${message}`,
      ``,
      `Interaction ID: ${id}`,
      `You can query the API directly with: research_status id="${id}"`,
      ``,
    ].join('\n');
    try {
      fs.writeFileSync(resolved, body);
    } catch (err) {
      console.error(`[research-watcher] failed to write error file ${resolved}:`, err);
    }
  }
}
