import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'path';

const mockWriteFileSync = jest.fn();
const mockExistsSync = jest.fn(() => true);
const mockReadFileSync = jest.fn(() => JSON.stringify({
  researchIds: [],
  fileSearchStores: {},
  uploadOperations: {},
  pendingResearch: {},
}));

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

const { ResearchWatcher } = await import('./ResearchWatcher');
const { WorkspaceConfigManager } = await import('./config/WorkspaceConfig');

describe('ResearchWatcher', () => {
  const workspaceRoot = '/tmp/research-watcher-test';

  let configState: Record<string, { outputPath: string }>;
  let mockPoll: jest.Mock;
  let mockGenerateMarkdown: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    configState = {};

    // Bare minimum stub: pendingResearch round-trips through fs mocks.
    mockReadFileSync.mockImplementation(() =>
      JSON.stringify({
        researchIds: [],
        fileSearchStores: {},
        uploadOperations: {},
        pendingResearch: configState,
      }),
    );
    mockWriteFileSync.mockImplementation((_path: unknown, content: unknown) => {
      if (typeof _path === 'string' && _path.endsWith('.gemini-research.json')) {
        const parsed = JSON.parse(content as string);
        configState = parsed.pendingResearch ?? {};
      }
    });

    mockPoll = jest.fn();
    mockGenerateMarkdown = jest.fn();
  });

  function makeWatcher(): InstanceType<typeof ResearchWatcher> {
    return new ResearchWatcher({
      researchManager: { poll: mockPoll as never },
      reportGenerator: { generateMarkdown: mockGenerateMarkdown as never },
      pollIntervalMs: 1,
      workspaceRoot,
    });
  }

  it('writes the markdown report and clears pending state when research completes', async () => {
    mockPoll.mockResolvedValue({
      id: 'r-1',
      status: 'completed',
      outputs: [{ kind: 'text', text: 'hello' }],
    } as never);
    mockGenerateMarkdown.mockReturnValue('# Report' as never);

    const watcher = makeWatcher();
    watcher.track('r-1', 'report.md');
    await watcher.settle();

    const reportWrite = mockWriteFileSync.mock.calls.find(
      ([p]) => p === path.resolve(workspaceRoot, 'report.md'),
    );
    expect(reportWrite).toBeDefined();
    expect(reportWrite?.[1]).toBe('# Report');
    expect(configState).toEqual({});
  });

  it('writes an error file with the interaction ID when research fails', async () => {
    mockPoll.mockResolvedValue({
      id: 'r-2',
      status: 'failed',
      outputs: [],
    } as never);

    const watcher = makeWatcher();
    watcher.track('r-2', '/abs/report.md');
    await watcher.settle();

    const errorWrite = mockWriteFileSync.mock.calls.find(([p]) => p === '/abs/report.md');
    expect(errorWrite).toBeDefined();
    const body = errorWrite?.[1] as string;
    expect(body).toContain('Interaction ID: r-2');
    expect(body).toContain('research_status id="r-2"');
    expect(body).toContain('"failed"');
    expect(configState).toEqual({});
  });

  it('writes an error file when poll throws', async () => {
    mockPoll.mockRejectedValue(new Error('network down') as never);

    const watcher = makeWatcher();
    watcher.track('r-3', 'report.md');
    await watcher.settle();

    const errorWrite = mockWriteFileSync.mock.calls.find(
      ([p]) => p === path.resolve(workspaceRoot, 'report.md'),
    );
    expect(errorWrite).toBeDefined();
    const body = errorWrite?.[1] as string;
    expect(body).toContain('network down');
    expect(body).toContain('Interaction ID: r-3');
    expect(configState).toEqual({});
  });

  it('writes an error file when status is completed but outputs are missing', async () => {
    mockPoll.mockResolvedValue({ id: 'r-4', status: 'completed' } as never);

    const watcher = makeWatcher();
    watcher.track('r-4', 'report.md');
    await watcher.settle();

    const write = mockWriteFileSync.mock.calls.find(
      ([p]) => p === path.resolve(workspaceRoot, 'report.md'),
    );
    expect(write?.[1]).toContain('returned no outputs');
  });

  it('persists pending research before polling so it can resume after a restart', async () => {
    let resolvePoll!: (v: unknown) => void;
    mockPoll.mockReturnValue(new Promise((r) => { resolvePoll = r; }) as never);

    const watcher = makeWatcher();
    watcher.track('r-5', 'report.md');

    // While the poll is in flight, pending state should include r-5.
    expect(configState).toEqual({ 'r-5': { outputPath: 'report.md' } });

    resolvePoll({ id: 'r-5', status: 'completed', outputs: [{ kind: 'text', text: 'ok' }] });
    mockGenerateMarkdown.mockReturnValue('done' as never);
    await watcher.settle();

    expect(configState).toEqual({});
  });

  it('resumeAll spawns watchers for every persisted pending interaction', async () => {
    configState = {
      'r-a': { outputPath: 'a.md' },
      'r-b': { outputPath: 'b.md' },
    };
    mockPoll.mockResolvedValue({ id: 'x', status: 'failed', outputs: [] } as never);

    const watcher = makeWatcher();
    watcher.resumeAll();
    await watcher.settle();

    expect(mockPoll).toHaveBeenCalledTimes(2);
    expect(mockPoll.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(['r-a', 'r-b']));
  });

  it('track is idempotent — calling twice for the same id does not double-poll', async () => {
    mockPoll.mockResolvedValue({
      id: 'r-6',
      status: 'completed',
      outputs: [{ kind: 'text', text: 'x' }],
    } as never);
    mockGenerateMarkdown.mockReturnValue('# r' as never);

    const watcher = makeWatcher();
    watcher.track('r-6', 'report.md');
    watcher.track('r-6', 'report.md');
    await watcher.settle();

    expect(mockPoll).toHaveBeenCalledTimes(1);
  });
});

// Silence the assertion: WorkspaceConfigManager isn't directly under test here
// but keeping the import live ensures the schema accepts pendingResearch.
void WorkspaceConfigManager;
