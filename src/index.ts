import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import {
  FileSearchManager,
  FileUploader,
  UploadOperationManager,
  Interaction,
  TextContent,
  ResearchManager,
  ReportGenerator,
} from '@allenhutchison/gemini-utils';
import { WorkspaceConfigManager, WorkspaceOperationStorage } from './config/WorkspaceConfig.js';
import * as fs from 'fs';
import * as path from 'path';

// Initialize SDK and Managers
const apiKey = process.env.GEMINI_DEEP_RESEARCH_API_KEY || process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error('Error: API key not found.');
  console.error('Please set either GEMINI_DEEP_RESEARCH_API_KEY or GEMINI_API_KEY environment variable.');
  process.exit(1);
}

const client = new GoogleGenAI({ apiKey, vertexai: false });

const defaultModel = process.env.GEMINI_DEEP_RESEARCH_MODEL || process.env.GEMINI_MODEL || 'models/gemini-flash-latest';

const fileSearchManager = new FileSearchManager(client);
const fileUploader = new FileUploader(client);
const uploadOperationManager = new UploadOperationManager(new WorkspaceOperationStorage());
const researchManager = new ResearchManager(client);
const reportGenerator = new ReportGenerator();

const server = new McpServer({
  name: 'gemini-deep-research',
  version: '0.0.1',
});

// --- File Search Tools ---

server.registerTool(
  'file_search_create_store',
  {
    description: 'Creates a new file search store for RAG grounding.',
    inputSchema: z.object({
      displayName: z.string().describe('The display name for the store'),
    }).shape,
  },
  async ({ displayName }) => {
    const store = await fileSearchManager.createStore(displayName);
    WorkspaceConfigManager.addFileSearchStore(displayName, store.name!);
    return { content: [{ type: 'text', text: `Created store: ${store.name} (${displayName})` }] };
  }
);

server.registerTool(
  'file_search_list_stores',
  {
    description: 'Lists all available file search stores.',
    inputSchema: z.object({}).shape,
  },
  async () => {
    const stores = await fileSearchManager.listStores();
    const storeList = [];
    for await (const store of stores) {
      storeList.push({ name: store.name, displayName: store.displayName });
    }
    return { content: [{ type: 'text', text: JSON.stringify(storeList, null, 2) }] };
  }
);

server.registerTool(
  'file_search_upload',
  {
    description: 'Starts an async upload of a file or directory to a file search store. Returns immediately with an operation ID. Use file_search_upload_status to check progress.',
    inputSchema: z.object({
      path: z.string().describe('Absolute path to the local file or directory'),
      storeName: z.string().describe('The resource name of the file search store (e.g., fileSearchStores/...)'),
      smartSync: z.boolean().optional().default(false).describe('If true, skip uploading files that have not changed (based on hash comparison)'),
    }).shape,
  },
  async ({ path: fsPath, storeName, smartSync }) => {
    if (!fs.existsSync(fsPath)) {
      return { isError: true, content: [{ type: 'text', text: `Path not found: ${fsPath}` }] };
    }

    const stats = fs.statSync(fsPath);
    if (!stats.isDirectory() && !stats.isFile()) {
      return { isError: true, content: [{ type: 'text', text: `Path is not a file or directory: ${fsPath}` }] };
    }

    // Create the operation record
    const operation = uploadOperationManager.createOperation(fsPath, storeName, smartSync);
    const operationId = operation.id;

    // Start the upload in the background (fire-and-forget)
    (async (): Promise<void> => {
      try {
        if (stats.isDirectory()) {
          let completedFiles = 0;
          let skippedFiles = 0;
          let failedFiles = 0;

          await fileUploader.uploadDirectory(fsPath, storeName, {
            smartSync,
            onProgress: (event) => {
              if (event.type === 'start') {
                // Mark as in progress with total file count from the uploader
                uploadOperationManager.markInProgress(operationId, event.totalFiles ?? 0);
                console.error(`[${operationId}] Starting upload of ${event.totalFiles} files...${smartSync ? ' (smart sync enabled)' : ''}`);
              } else if (event.type === 'file_complete') {
                completedFiles = event.completedFiles ?? completedFiles;
                console.error(`[${operationId}] [${event.percentage}%] Uploaded: ${event.currentFile}`);
                uploadOperationManager.updateProgress(operationId, completedFiles, skippedFiles, failedFiles);
              } else if (event.type === 'file_skipped') {
                skippedFiles = event.skippedFiles ?? skippedFiles;
                console.error(`[${operationId}] [${event.percentage}%] Skipped (unchanged): ${event.currentFile}`);
                uploadOperationManager.updateProgress(operationId, completedFiles, skippedFiles, failedFiles);
              } else if (event.type === 'file_error') {
                failedFiles++;
                const errorMsg = event.error?.message || 'Unknown error';
                console.error(`[${operationId}] Error uploading: ${event.currentFile} - ${errorMsg}`);
                uploadOperationManager.addFailedFile(operationId, event.currentFile || 'unknown', errorMsg);
              } else if (event.type === 'complete') {
                console.error(`[${operationId}] Upload complete: ${event.completedFiles} uploaded, ${event.skippedFiles ?? 0} skipped, ${event.failedFiles} failed`);
              }
            }
          });

          uploadOperationManager.markCompleted(operationId);
        } else {
          // Single file upload
          uploadOperationManager.markInProgress(operationId, 1);
          console.error(`[${operationId}] Starting upload of single file: ${fsPath}`);

          await fileUploader.uploadFile(fsPath, storeName);

          uploadOperationManager.updateProgress(operationId, 1, 0, 0);
          uploadOperationManager.markCompleted(operationId);
          console.error(`[${operationId}] Upload complete`);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[${operationId}] Upload failed:`, message);
        uploadOperationManager.markFailed(operationId, message);
      }
    })();

    // Return immediately with the operation ID
    return {
      content: [{
        type: 'text',
        text: `Upload started. Operation ID: ${operationId}\nStatus: pending\nUse file_search_upload_status to check progress.`
      }]
    };
  }
);

server.registerTool(
  'file_search_delete_store',
  {
    description: 'Deletes a file search store.',
    inputSchema: z.object({
      name: z.string().describe('The resource name of the store to delete'),
      force: z.boolean().optional().default(false).describe('Whether to force delete even if contains documents'),
    }).shape,
  },
  async ({ name, force }) => {
    await fileSearchManager.deleteStore(name, force);
    return { content: [{ type: 'text', text: `Deleted store: ${name}` }] };
  }
);

server.registerTool(
  'file_search_upload_status',
  {
    description: 'Checks the status of an upload operation. Returns progress information including completed/skipped/failed file counts.',
    inputSchema: z.object({
      operationId: z.string().describe('The upload operation ID returned by file_search_upload'),
    }).shape,
  },
  async ({ operationId }) => {
    const operation = uploadOperationManager.getOperation(operationId);

    if (!operation) {
      return { isError: true, content: [{ type: 'text', text: `Operation not found: ${operationId}` }] };
    }

    const percentage = operation.totalFiles > 0
      ? Math.round(((operation.completedFiles + operation.skippedFiles) / operation.totalFiles) * 100)
      : 0;

    const statusInfo: Record<string, unknown> = {
      operationId: operation.id,
      status: operation.status,
      path: operation.path,
      storeName: operation.storeName,
      smartSync: operation.smartSync,
      progress: {
        totalFiles: operation.totalFiles,
        completedFiles: operation.completedFiles,
        skippedFiles: operation.skippedFiles,
        failedFiles: operation.failedFiles,
        percentage,
      },
      startedAt: operation.startedAt,
      completedAt: operation.completedAt,
      error: operation.error,
    };

    // Only include failedFilesList if there are failed files
    if (operation.failedFilesList && operation.failedFilesList.length > 0) {
      statusInfo.failedFilesList = operation.failedFilesList;
    }

    return { content: [{ type: 'text', text: JSON.stringify(statusInfo, null, 2) }] };
  }
);

server.registerTool(
  'file_search_query',
  {
    description: 'Queries a file search store using a model to get grounded answers.',
    inputSchema: z.object({
      query: z.string().describe('The question to ask the model'),
      storeName: z.string().describe('The resource name of the file search store'),
    }).shape,
  },
  async ({ query, storeName }) => {
    try {
      const interaction: Interaction = await fileSearchManager.queryStore(storeName, query, defaultModel);

      // Runtime guard: ensure outputs is an array
      if (!interaction.outputs || !Array.isArray(interaction.outputs)) {
        return { content: [{ type: 'text', text: 'No response generated.' }] };
      }

      // Find the first text output with proper type guard
      const textOutput = interaction.outputs.find(
        (output): output is TextContent => output.type === 'text'
      );
      const text = textOutput?.text || 'No response generated.';

      return { content: [{ type: 'text', text }] };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { isError: true, content: [{ type: 'text', text: `Query failed: ${message}` }] };
    }
  }
);

// --- Research Tools ---

server.registerTool(
  'research_start',
  {
    description: 'Starts a new Deep Research interaction in the background.',
    inputSchema: z.object({
      input: z.string().describe('The research query or instructions'),
      report_format: z.string().optional().describe('The desired format of the report (e.g., "Executive Brief", "Technical Deep Dive", "Comprehensive Research Report")'),
      model: z.string().optional().default('deep-research-pro-preview-12-2025').describe('The agent to use (default: deep-research-pro-preview-12-2025)'),
      fileSearchStoreNames: z.array(z.string()).optional().describe('Optional list of file search store names for grounding'),
    }).shape,
  },
  async ({ input, report_format, model, fileSearchStoreNames }) => {
    let finalInput = input;
    if (report_format) {
      finalInput = `[Report Format: ${report_format}]\n\n${input}`;
    }

    try {
      const interaction = await researchManager.startResearch({
        input: finalInput,
        model,
        fileSearchStoreNames,
      });
      if (interaction.id) {
          WorkspaceConfigManager.addResearchId(interaction.id);
      }
      return {
        content: [{
          type: 'text',
          text: `Research started. ID: ${interaction.id}\nStatus: ${interaction.status}\nUse research_status to check progress.`
        }]
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const isQuotaError = message.includes('429') || message.toLowerCase().includes('quota') || message.toLowerCase().includes('too many requests');

      if (isQuotaError) {
        return {
          isError: true,
          content: [{
            type: 'text',
            text: `Deep Research quota error: ${message}\n\n` +
              `This typically means your API key does not have access to the Deep Research feature.\n` +
              `Deep Research requires a paid Google AI API key — free-tier keys do not have quota for this feature.\n\n` +
              `To resolve this:\n` +
              `1. Ensure you have a paid API key from Google AI Studio (https://aistudio.google.com/apikey)\n` +
              `2. Verify billing is enabled on your Google Cloud project\n` +
              `3. Set the key via GEMINI_DEEP_RESEARCH_API_KEY or GEMINI_API_KEY environment variable`,
          }],
        };
      }

      return {
        isError: true,
        content: [{ type: 'text', text: `Research failed to start: ${message}` }],
      };
    }
  }
);

server.registerTool(
  'research_status',
  {
    description: 'Checks the status and retrieves outputs of a Deep Research interaction.',
    inputSchema: z.object({
      id: z.string().describe('The interaction ID'),
    }).shape,
  },
  async ({ id }) => {
    const interaction = await researchManager.getStatus(id);
    return { content: [{ type: 'text', text: JSON.stringify(interaction, null, 2) }] };
  }
);

server.registerTool(
  'research_save_report',
  {
    description: 'Generates a Markdown report from a completed research interaction and saves it to a file.',
    inputSchema: z.object({
      id: z.string().describe('The interaction ID'),
      filePath: z.string().describe('The local file path to save the report (e.g., report.md)'),
    }).shape,
  },
  async ({ id, filePath }) => {
    const interaction = await researchManager.getStatus(id);
    if (interaction.status !== 'completed') {
      return { isError: true, content: [{ type: 'text', text: `Interaction ${id} is not completed. Current status: ${interaction.status}` }] };
    }
    
    if (!interaction.outputs) {
      return { isError: true, content: [{ type: 'text', text: 'No outputs found for this interaction.' }] };
    }

    const markdown = reportGenerator.generateMarkdown(interaction.outputs);
    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.env.GEMINI_WORKSPACE_PATH || '.', filePath);
    fs.writeFileSync(resolvedPath, markdown);
    return { content: [{ type: 'text', text: `Report saved to ${resolvedPath}` }] };
  }
);

// --- Start Server ---

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  // Ensure config file exists
  WorkspaceConfigManager.load();
  await server.connect(transport);
  console.error('Gemini Deep Research MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main:', error);
  process.exit(1);
});
