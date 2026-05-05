import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'path';

// Mock fs before importing WorkspaceConfigManager
const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();

jest.unstable_mockModule('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}));

// Dynamic import after mocking
const { WorkspaceConfigManager } = await import('./WorkspaceConfig');

describe('WorkspaceConfigManager', () => {
  const mockConfigPath = path.resolve(process.cwd(), '.gemini-research.json');
  const mockConfig = {
    researchIds: ['research-123'],
    fileSearchStores: {
      'my-store': 'stores/store-456',
    },
    uploadOperations: {},
    pendingResearch: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should load existing config', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));

    const config = WorkspaceConfigManager.load();
    expect(config).toEqual(mockConfig);
    expect(mockReadFileSync).toHaveBeenCalledWith(mockConfigPath, 'utf-8');
  });

  it('should return default config if file does not exist', () => {
    mockExistsSync.mockReturnValue(false);

    const config = WorkspaceConfigManager.load();
    expect(config).toEqual({ researchIds: [], fileSearchStores: {}, uploadOperations: {}, pendingResearch: {} });
  });

  it('should save config', () => {
    WorkspaceConfigManager.save(mockConfig);
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      mockConfigPath,
      JSON.stringify(mockConfig, null, 2)
    );
  });

  it('should add a research ID', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ researchIds: [], fileSearchStores: {} }));

    WorkspaceConfigManager.addResearchId('new-id');

    expect(mockWriteFileSync).toHaveBeenCalledWith(
        mockConfigPath,
        expect.stringContaining('"researchIds": [\n    "new-id"\n  ]')
    );
  });

  it('should add a file search store', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ researchIds: [], fileSearchStores: {} }));

    WorkspaceConfigManager.addFileSearchStore('new-store', 'stores/123');

    expect(mockWriteFileSync).toHaveBeenCalledWith(
        mockConfigPath,
        expect.stringContaining('"new-store": "stores/123"')
    );
  });

  it('should return default config and warn when file is corrupt', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('{ invalid json }');

    const config = WorkspaceConfigManager.load();

    expect(config).toEqual({ researchIds: [], fileSearchStores: {}, uploadOperations: {}, pendingResearch: {} });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load workspace config'),
      expect.anything()
    );
    warnSpy.mockRestore();
  });

  it('should return default config and warn when schema validation fails', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockExistsSync.mockReturnValue(true);
    // Valid JSON but invalid schema: researchIds should be an array, not a string
    mockReadFileSync.mockReturnValue(JSON.stringify({ researchIds: 'not-an-array' }));

    const config = WorkspaceConfigManager.load();

    expect(config).toEqual({ researchIds: [], fileSearchStores: {}, uploadOperations: {}, pendingResearch: {} });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load workspace config'),
      expect.anything()
    );
    warnSpy.mockRestore();
  });

  it('should not add duplicate research ID', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ researchIds: ['existing-id'], fileSearchStores: {}, uploadOperations: {} }));

    WorkspaceConfigManager.addResearchId('existing-id');

    // Should not call save since ID already exists
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('should get upload operation by id', () => {
    const mockOperation = {
      id: 'op-123',
      status: 'completed',
      path: '/test/path',
      storeName: 'store-1',
      smartSync: false,
      totalFiles: 10,
      completedFiles: 10,
      skippedFiles: 0,
      failedFiles: 0,
      failedFilesList: [],
      startedAt: '2024-01-01T00:00:00Z',
    };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      researchIds: [],
      fileSearchStores: {},
      uploadOperations: { 'op-123': mockOperation }
    }));

    const operation = WorkspaceConfigManager.getUploadOperation('op-123');

    expect(operation).toEqual(mockOperation);
  });

  it('should return undefined for non-existent upload operation', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ researchIds: [], fileSearchStores: {}, uploadOperations: {} }));

    const operation = WorkspaceConfigManager.getUploadOperation('non-existent');

    expect(operation).toBeUndefined();
  });

  it('should set upload operation', () => {
    const mockOperation = {
      id: 'op-456',
      status: 'in_progress' as const,
      path: '/new/path',
      storeName: 'store-2',
      smartSync: true,
      totalFiles: 5,
      completedFiles: 2,
      skippedFiles: 1,
      failedFiles: 0,
      failedFilesList: [],
      startedAt: '2024-01-01T00:00:00Z',
    };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ researchIds: [], fileSearchStores: {}, uploadOperations: {} }));

    WorkspaceConfigManager.setUploadOperation('op-456', mockOperation);

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      mockConfigPath,
      expect.stringContaining('"op-456"')
    );
  });

  it('should get all upload operations', () => {
    const mockOperations = {
      'op-1': { id: 'op-1', status: 'completed', path: '/path1', storeName: 'store', smartSync: false, totalFiles: 1, completedFiles: 1, skippedFiles: 0, failedFiles: 0, failedFilesList: [], startedAt: '2024-01-01' },
      'op-2': { id: 'op-2', status: 'pending', path: '/path2', storeName: 'store', smartSync: true, totalFiles: 0, completedFiles: 0, skippedFiles: 0, failedFiles: 0, failedFilesList: [], startedAt: '2024-01-02' },
    };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      researchIds: [],
      fileSearchStores: {},
      uploadOperations: mockOperations
    }));

    const operations = WorkspaceConfigManager.getAllUploadOperations();

    expect(operations).toEqual(mockOperations);
  });
});

// Dynamic import WorkspaceOperationStorage
const { WorkspaceOperationStorage } = await import('./WorkspaceConfig');

describe('WorkspaceOperationStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should get operation via WorkspaceConfigManager', () => {
    const mockOperation = {
      id: 'op-789',
      status: 'completed',
      path: '/test',
      storeName: 'store',
      smartSync: false,
      totalFiles: 1,
      completedFiles: 1,
      skippedFiles: 0,
      failedFiles: 0,
      failedFilesList: [],
      startedAt: '2024-01-01',
    };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      researchIds: [],
      fileSearchStores: {},
      uploadOperations: { 'op-789': mockOperation }
    }));

    const storage = new WorkspaceOperationStorage();
    const operation = storage.get('op-789');

    expect(operation).toEqual(mockOperation);
  });

  it('should set operation via WorkspaceConfigManager', () => {
    const mockOperation = {
      id: 'op-new',
      status: 'pending' as const,
      path: '/new',
      storeName: 'store',
      smartSync: false,
      totalFiles: 0,
      completedFiles: 0,
      skippedFiles: 0,
      failedFiles: 0,
      failedFilesList: [],
      startedAt: '2024-01-01',
    };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ researchIds: [], fileSearchStores: {}, uploadOperations: {} }));

    const storage = new WorkspaceOperationStorage();
    storage.set('op-new', mockOperation);

    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it('should get all operations via WorkspaceConfigManager', () => {
    const mockOperations = {
      'op-a': { id: 'op-a', status: 'completed', path: '/a', storeName: 'store', smartSync: false, totalFiles: 1, completedFiles: 1, skippedFiles: 0, failedFiles: 0, failedFilesList: [], startedAt: '2024-01-01' },
    };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      researchIds: [],
      fileSearchStores: {},
      uploadOperations: mockOperations
    }));

    const storage = new WorkspaceOperationStorage();
    const operations = storage.getAll();

    expect(operations).toEqual(mockOperations);
  });
});
