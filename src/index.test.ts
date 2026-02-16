import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock the gemini-utils module
const mockCreateStore = jest.fn();
const mockListStores = jest.fn();
const mockDeleteStore = jest.fn();
const mockQueryStore = jest.fn();
const mockUploadFile = jest.fn();
const mockUploadDirectory = jest.fn();
const mockCreateOperation = jest.fn();
const mockGetOperation = jest.fn();
const mockMarkInProgress = jest.fn();
const mockMarkCompleted = jest.fn();
const mockMarkFailed = jest.fn();
const mockUpdateProgress = jest.fn();
const mockAddFailedFile = jest.fn();
const mockStartResearch = jest.fn();
const mockGetStatus = jest.fn();
const mockGenerateMarkdown = jest.fn();

jest.unstable_mockModule('@allenhutchison/gemini-utils', () => ({
  FileSearchManager: jest.fn().mockImplementation(() => ({
    createStore: mockCreateStore,
    listStores: mockListStores,
    deleteStore: mockDeleteStore,
    queryStore: mockQueryStore,
  })),
  FileUploader: jest.fn().mockImplementation(() => ({
    uploadFile: mockUploadFile,
    uploadDirectory: mockUploadDirectory,
  })),
  UploadOperationManager: jest.fn().mockImplementation(() => ({
    createOperation: mockCreateOperation,
    getOperation: mockGetOperation,
    markInProgress: mockMarkInProgress,
    markCompleted: mockMarkCompleted,
    markFailed: mockMarkFailed,
    updateProgress: mockUpdateProgress,
    addFailedFile: mockAddFailedFile,
  })),
  ResearchManager: jest.fn().mockImplementation(() => ({
    startResearch: mockStartResearch,
    getStatus: mockGetStatus,
  })),
  ReportGenerator: jest.fn().mockImplementation(() => ({
    generateMarkdown: mockGenerateMarkdown,
  })),
  Interaction: {},
  TextContent: {},
}));

// Mock GoogleGenAI
jest.unstable_mockModule('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({})),
}));

// Mock fs
const mockExistsSync = jest.fn();
const mockStatSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockReadFileSync = jest.fn();

jest.unstable_mockModule('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    statSync: mockStatSync,
    writeFileSync: mockWriteFileSync,
    readFileSync: mockReadFileSync,
  },
  existsSync: mockExistsSync,
  statSync: mockStatSync,
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
}));

// Mock WorkspaceConfig
const mockAddFileSearchStore = jest.fn();
const mockAddResearchId = jest.fn();
const mockLoad = jest.fn();

jest.unstable_mockModule('./config/WorkspaceConfig.js', () => ({
  WorkspaceConfigManager: {
    addFileSearchStore: mockAddFileSearchStore,
    addResearchId: mockAddResearchId,
    load: mockLoad,
  },
  WorkspaceOperationStorage: jest.fn(),
}));

// Mock MCP SDK
const mockRegisterTool = jest.fn();
const mockConnect = jest.fn();

jest.unstable_mockModule('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: jest.fn().mockImplementation(() => ({
    registerTool: mockRegisterTool,
    connect: mockConnect,
  })),
}));

jest.unstable_mockModule('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn(),
}));

// Set API key before importing
process.env.GEMINI_API_KEY = 'test-api-key';

// Helper type for MCP tool results
interface McpToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

// Helper function for type-safe result parsing
function parseResultText(result: unknown): Record<string, unknown> {
  const mcpResult = result as McpToolResult;
  return JSON.parse(mcpResult.content[0].text);
}

describe('MCP Server Tools', () => {
  // Store tool handlers for testing
  let toolHandlers: Record<string, (params: Record<string, unknown>) => Promise<unknown>>;

  beforeEach(async () => {
    jest.clearAllMocks();
    toolHandlers = {};

    // Capture tool handlers when registerTool is called
    mockRegisterTool.mockImplementation((name: unknown, _schema: unknown, handler: unknown) => {
      toolHandlers[name as string] = handler as (params: Record<string, unknown>) => Promise<unknown>;
    });

    // Import the module to trigger tool registration
    await import('./index.js');
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe('file_search_create_store', () => {
    it('should create a store and save to config', async () => {
      mockCreateStore.mockResolvedValue({ name: 'stores/store-123', displayName: 'Test Store' });

      const result = await toolHandlers['file_search_create_store']({ displayName: 'Test Store' });

      expect(mockCreateStore).toHaveBeenCalledWith('Test Store');
      expect(mockAddFileSearchStore).toHaveBeenCalledWith('Test Store', 'stores/store-123');
      expect(result).toEqual({
        content: [{ type: 'text', text: 'Created store: stores/store-123 (Test Store)' }],
      });
    });
  });

  describe('file_search_list_stores', () => {
    it('should list all stores', async () => {
      const mockStores = [
        { name: 'stores/1', displayName: 'Store 1' },
        { name: 'stores/2', displayName: 'Store 2' },
      ];
      mockListStores.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const store of mockStores) {
            yield store;
          }
        },
      });

      const result = await toolHandlers['file_search_list_stores']({});

      expect(mockListStores).toHaveBeenCalled();
      expect(result).toEqual({
        content: [{
          type: 'text',
          text: JSON.stringify([
            { name: 'stores/1', displayName: 'Store 1' },
            { name: 'stores/2', displayName: 'Store 2' },
          ], null, 2),
        }],
      });
    });
  });

  describe('file_search_upload', () => {
    it('should return error if path does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await toolHandlers['file_search_upload']({
        path: '/nonexistent',
        storeName: 'stores/123',
        smartSync: false,
      });

      expect(result).toEqual({
        isError: true,
        content: [{ type: 'text', text: 'Path not found: /nonexistent' }],
      });
    });

    it('should return error if path is not file or directory', async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isDirectory: () => false,
        isFile: () => false,
      });

      const result = await toolHandlers['file_search_upload']({
        path: '/some/socket',
        storeName: 'stores/123',
        smartSync: false,
      });

      expect(result).toEqual({
        isError: true,
        content: [{ type: 'text', text: 'Path is not a file or directory: /some/socket' }],
      });
    });

    it('should start directory upload and return operation ID', async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isDirectory: () => true,
        isFile: () => false,
      });
      mockCreateOperation.mockReturnValue({ id: 'op-123' });
      mockUploadDirectory.mockResolvedValue(undefined);

      const result = await toolHandlers['file_search_upload']({
        path: '/test/dir',
        storeName: 'stores/123',
        smartSync: true,
      });

      expect(mockCreateOperation).toHaveBeenCalledWith('/test/dir', 'stores/123', true);
      expect(result).toEqual({
        content: [{
          type: 'text',
          text: 'Upload started. Operation ID: op-123\nStatus: pending\nUse file_search_upload_status to check progress.',
        }],
      });
    });

    it('should start single file upload', async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        isDirectory: () => false,
        isFile: () => true,
      });
      mockCreateOperation.mockReturnValue({ id: 'op-456' });
      mockUploadFile.mockResolvedValue(undefined);

      const result = await toolHandlers['file_search_upload']({
        path: '/test/file.txt',
        storeName: 'stores/123',
        smartSync: false,
      });

      expect(mockCreateOperation).toHaveBeenCalledWith('/test/file.txt', 'stores/123', false);
      expect(result).toEqual({
        content: [{
          type: 'text',
          text: 'Upload started. Operation ID: op-456\nStatus: pending\nUse file_search_upload_status to check progress.',
        }],
      });
    });
  });

  describe('file_search_delete_store', () => {
    it('should delete a store', async () => {
      mockDeleteStore.mockResolvedValue(undefined);

      const result = await toolHandlers['file_search_delete_store']({
        name: 'stores/123',
        force: true,
      });

      expect(mockDeleteStore).toHaveBeenCalledWith('stores/123', true);
      expect(result).toEqual({
        content: [{ type: 'text', text: 'Deleted store: stores/123' }],
      });
    });
  });

  describe('file_search_upload_status', () => {
    it('should return error for non-existent operation', async () => {
      mockGetOperation.mockReturnValue(undefined);

      const result = await toolHandlers['file_search_upload_status']({ operationId: 'op-999' });

      expect(result).toEqual({
        isError: true,
        content: [{ type: 'text', text: 'Operation not found: op-999' }],
      });
    });

    it('should return operation status', async () => {
      mockGetOperation.mockReturnValue({
        id: 'op-123',
        status: 'in_progress',
        path: '/test/dir',
        storeName: 'stores/123',
        smartSync: true,
        totalFiles: 10,
        completedFiles: 5,
        skippedFiles: 2,
        failedFiles: 0,
        failedFilesList: [],
        startedAt: '2024-01-01T00:00:00Z',
      });

      const result = await toolHandlers['file_search_upload_status']({ operationId: 'op-123' });

      const parsed = parseResultText(result);
      expect(parsed.operationId).toBe('op-123');
      expect(parsed.status).toBe('in_progress');
      expect((parsed.progress as Record<string, unknown>).percentage).toBe(70);
    });

    it('should include failed files list when present', async () => {
      mockGetOperation.mockReturnValue({
        id: 'op-123',
        status: 'completed',
        path: '/test/dir',
        storeName: 'stores/123',
        smartSync: false,
        totalFiles: 10,
        completedFiles: 8,
        skippedFiles: 0,
        failedFiles: 2,
        failedFilesList: [
          { file: 'file1.txt', error: 'Too large' },
          { file: 'file2.txt', error: 'Invalid format' },
        ],
        startedAt: '2024-01-01T00:00:00Z',
        completedAt: '2024-01-01T00:01:00Z',
      });

      const result = await toolHandlers['file_search_upload_status']({ operationId: 'op-123' });

      const parsed = parseResultText(result);
      expect(parsed.failedFilesList).toHaveLength(2);
    });
  });

  describe('file_search_query', () => {
    it('should query store and return text response', async () => {
      mockQueryStore.mockResolvedValue({
        outputs: [{ type: 'text', text: 'Here is the answer.' }],
      });

      const result = await toolHandlers['file_search_query']({
        query: 'What is the answer?',
        storeName: 'stores/123',
      });

      expect(mockQueryStore).toHaveBeenCalledWith('stores/123', 'What is the answer?', expect.any(String));
      expect(result).toEqual({
        content: [{ type: 'text', text: 'Here is the answer.' }],
      });
    });

    it('should return default message if no outputs', async () => {
      mockQueryStore.mockResolvedValue({ outputs: null });

      const result = await toolHandlers['file_search_query']({
        query: 'Test query',
        storeName: 'stores/123',
      });

      expect(result).toEqual({
        content: [{ type: 'text', text: 'No response generated.' }],
      });
    });

    it('should handle query errors', async () => {
      mockQueryStore.mockRejectedValue(new Error('Query failed'));

      const result = await toolHandlers['file_search_query']({
        query: 'Test query',
        storeName: 'stores/123',
      });

      expect(result).toEqual({
        isError: true,
        content: [{ type: 'text', text: 'Query failed: Query failed' }],
      });
    });
  });

  describe('research_start', () => {
    it('should start research and save ID to config', async () => {
      mockStartResearch.mockResolvedValue({
        id: 'research-123',
        status: 'in_progress',
      });

      const result = await toolHandlers['research_start']({
        input: 'Research topic',
        model: 'deep-research-pro-preview-12-2025',
      });

      expect(mockStartResearch).toHaveBeenCalledWith({
        input: 'Research topic',
        model: 'deep-research-pro-preview-12-2025',
        fileSearchStoreNames: undefined,
      });
      expect(mockAddResearchId).toHaveBeenCalledWith('research-123');
      expect(result).toEqual({
        content: [{
          type: 'text',
          text: 'Research started. ID: research-123\nStatus: in_progress\nUse research_status to check progress.',
        }],
      });
    });

    it('should include report format in input if provided', async () => {
      mockStartResearch.mockResolvedValue({
        id: 'research-456',
        status: 'in_progress',
      });

      await toolHandlers['research_start']({
        input: 'Research topic',
        report_format: 'Executive Brief',
        model: 'deep-research-pro-preview-12-2025',
      });

      expect(mockStartResearch).toHaveBeenCalledWith({
        input: '[Report Format: Executive Brief]\n\nResearch topic',
        model: 'deep-research-pro-preview-12-2025',
        fileSearchStoreNames: undefined,
      });
    });

    it('should pass file search store names', async () => {
      mockStartResearch.mockResolvedValue({
        id: 'research-789',
        status: 'in_progress',
      });

      await toolHandlers['research_start']({
        input: 'Research with files',
        model: 'deep-research-pro-preview-12-2025',
        fileSearchStoreNames: ['stores/1', 'stores/2'],
      });

      expect(mockStartResearch).toHaveBeenCalledWith({
        input: 'Research with files',
        model: 'deep-research-pro-preview-12-2025',
        fileSearchStoreNames: ['stores/1', 'stores/2'],
      });
    });

    it('should return helpful message on 429 quota error', async () => {
      mockStartResearch.mockRejectedValue(new Error('429 {"error":{"message":"You do not have enough quota to make this request.","code":"too_many_requests"}}'));

      const result = await toolHandlers['research_start']({
        input: 'Research topic',
        model: 'deep-research-pro-preview-12-2025',
      }) as McpToolResult;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Deep Research quota error');
      expect(result.content[0].text).toContain('paid Google AI API key');
      expect(result.content[0].text).toContain('aistudio.google.com');
    });

    it('should return helpful message on generic quota error', async () => {
      mockStartResearch.mockRejectedValue(new Error('quota exceeded'));

      const result = await toolHandlers['research_start']({
        input: 'Research topic',
        model: 'deep-research-pro-preview-12-2025',
      }) as McpToolResult;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Deep Research quota error');
    });

    it('should return generic error for non-quota failures', async () => {
      mockStartResearch.mockRejectedValue(new Error('Network connection failed'));

      const result = await toolHandlers['research_start']({
        input: 'Research topic',
        model: 'deep-research-pro-preview-12-2025',
      }) as McpToolResult;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Research failed to start');
      expect(result.content[0].text).toContain('Network connection failed');
      expect(result.content[0].text).not.toContain('paid Google AI API key');
    });
  });

  describe('research_status', () => {
    it('should return research status', async () => {
      const mockInteraction = {
        id: 'research-123',
        status: 'completed',
        outputs: [{ type: 'text', text: 'Final report' }],
      };
      mockGetStatus.mockResolvedValue(mockInteraction);

      const result = await toolHandlers['research_status']({ id: 'research-123' });

      expect(mockGetStatus).toHaveBeenCalledWith('research-123');
      const parsed = parseResultText(result);
      expect(parsed.id).toBe('research-123');
      expect(parsed.status).toBe('completed');
    });
  });

  describe('research_save_report', () => {
    it('should return error if research not completed', async () => {
      mockGetStatus.mockResolvedValue({
        id: 'research-123',
        status: 'in_progress',
      });

      const result = await toolHandlers['research_save_report']({
        id: 'research-123',
        filePath: '/output/report.md',
      });

      expect(result).toEqual({
        isError: true,
        content: [{
          type: 'text',
          text: 'Interaction research-123 is not completed. Current status: in_progress',
        }],
      });
    });

    it('should return error if no outputs', async () => {
      mockGetStatus.mockResolvedValue({
        id: 'research-123',
        status: 'completed',
        outputs: null,
      });

      const result = await toolHandlers['research_save_report']({
        id: 'research-123',
        filePath: '/output/report.md',
      });

      expect(result).toEqual({
        isError: true,
        content: [{ type: 'text', text: 'No outputs found for this interaction.' }],
      });
    });

    it('should generate and save report', async () => {
      mockGetStatus.mockResolvedValue({
        id: 'research-123',
        status: 'completed',
        outputs: [{ type: 'text', text: 'Report content' }],
      });
      mockGenerateMarkdown.mockReturnValue('# Generated Report\n\nContent here.');

      const result = await toolHandlers['research_save_report']({
        id: 'research-123',
        filePath: '/output/report.md',
      });

      expect(mockGenerateMarkdown).toHaveBeenCalledWith([{ type: 'text', text: 'Report content' }]);
      expect(mockWriteFileSync).toHaveBeenCalledWith('/output/report.md', '# Generated Report\n\nContent here.');
      expect(result).toEqual({
        content: [{ type: 'text', text: 'Report saved to /output/report.md' }],
      });
    });
  });
});
