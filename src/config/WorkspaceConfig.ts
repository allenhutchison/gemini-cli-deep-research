import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { OperationStorage, UploadOperation } from '@allenhutchison/gemini-utils';

// Re-export types from gemini-utils for convenience
export type { OperationStorage, UploadOperation } from '@allenhutchison/gemini-utils';

// Zod schemas for validation when reading from disk
const FailedFileSchema = z.object({
  file: z.string(),
  error: z.string(),
});

const UploadOperationSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
  path: z.string(),
  storeName: z.string(),
  smartSync: z.boolean(),
  totalFiles: z.number(),
  completedFiles: z.number(),
  skippedFiles: z.number(),
  failedFiles: z.number(),
  failedFilesList: z.array(FailedFileSchema).default([]),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
});

const PendingResearchSchema = z.object({
  outputPath: z.string(),
});

export type PendingResearch = z.infer<typeof PendingResearchSchema>;

export const WorkspaceConfigSchema = z.object({
  researchIds: z.array(z.string()).default([]),
  fileSearchStores: z.record(z.string(), z.string()).default({}),
  uploadOperations: z.record(z.string(), UploadOperationSchema).default({}),
  pendingResearch: z.record(z.string(), PendingResearchSchema).default({}),
});

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

export class WorkspaceConfigManager {
  private static configPath = path.resolve(process.cwd(), '.gemini-research.json');

  static load(): WorkspaceConfig {
    if (!fs.existsSync(this.configPath)) {
      const defaultConfig: WorkspaceConfig = { researchIds: [], fileSearchStores: {}, uploadOperations: {}, pendingResearch: {} };
      this.save(defaultConfig);
      return defaultConfig;
    }

    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(content);
      return WorkspaceConfigSchema.parse(parsed);
    } catch (error) {
      // If file is corrupt, safer to return default to avoid crashing, but warn the user
      console.warn(`Failed to load workspace config from ${this.configPath}:`, error);
      return { researchIds: [], fileSearchStores: {}, uploadOperations: {}, pendingResearch: {} };
    }
  }

  static save(config: WorkspaceConfig): void {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  static addResearchId(id: string): void {
    const config = this.load();
    if (!config.researchIds.includes(id)) {
        config.researchIds.push(id);
        this.save(config);
    }
  }

  static addFileSearchStore(name: string, resourceName: string): void {
    const config = this.load();
    config.fileSearchStores[name] = resourceName;
    this.save(config);
  }

  static getUploadOperation(id: string): UploadOperation | undefined {
    const config = this.load();
    return config.uploadOperations[id];
  }

  static setUploadOperation(id: string, operation: UploadOperation): void {
    const config = this.load();
    config.uploadOperations[id] = operation;
    this.save(config);
  }

  static getAllUploadOperations(): Record<string, UploadOperation> {
    const config = this.load();
    return config.uploadOperations;
  }

  static addPendingResearch(id: string, outputPath: string): void {
    const config = this.load();
    config.pendingResearch[id] = { outputPath };
    this.save(config);
  }

  static removePendingResearch(id: string): void {
    const config = this.load();
    if (config.pendingResearch[id]) {
      delete config.pendingResearch[id];
      this.save(config);
    }
  }

  static getAllPendingResearch(): Record<string, PendingResearch> {
    const config = this.load();
    return config.pendingResearch;
  }
}

/**
 * OperationStorage implementation that persists to disk via WorkspaceConfigManager.
 * This adapter bridges gemini-utils' UploadOperationManager with our disk-based persistence.
 */
export class WorkspaceOperationStorage implements OperationStorage {
  get(id: string): UploadOperation | undefined {
    return WorkspaceConfigManager.getUploadOperation(id);
  }

  set(id: string, operation: UploadOperation): void {
    WorkspaceConfigManager.setUploadOperation(id, operation);
  }

  getAll(): Record<string, UploadOperation> {
    return WorkspaceConfigManager.getAllUploadOperations();
  }
}
