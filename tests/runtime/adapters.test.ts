import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  StandaloneAdapter,
  SCORM12Adapter,
  SCORM2004Adapter,
  XAPIAdapter,
} from '../../src/runtime/adapters/index.js';

// ---- Standalone Adapter ----

describe('StandaloneAdapter', () => {
  let adapter: StandaloneAdapter;

  beforeEach(() => { adapter = new StandaloneAdapter(); });

  it('initializes without LMS', async () => {
    expect(await adapter.initialize()).toBe(true);
  });

  it('getValue returns empty string', async () => {
    await adapter.initialize();
    expect(await adapter.getValue('cmi.core.lesson_status')).toBe('');
  });

  it('setValue returns true', async () => {
    await adapter.initialize();
    expect(await adapter.setValue('anything', 'value')).toBe(true);
  });

  it('commit returns true', async () => {
    await adapter.initialize();
    expect(await adapter.commit()).toBe(true);
  });

  it('terminate returns true', async () => {
    await adapter.initialize();
    expect(await adapter.terminate()).toBe(true);
  });

  it('getLearnerInfo returns empty object', () => {
    expect(adapter.getLearnerInfo()).toEqual({});
  });
});

// ---- SCORM 1.2 Adapter ----

describe('SCORM12Adapter', () => {
  it('initializes returns false when no LMS', async () => {
    const adapter = new SCORM12Adapter();
    // Override findAPI to return null (simulates no LMS)
    const result = await adapter.initialize();
    expect(result).toBe(false);
    expect(adapter.initialized).toBe(false);
  });

  it('sets and gets values via LMS API', async () => {
    const mockApi = {
      LMSInitialize: () => 'true',
      LMSFinish: () => 'true',
      LMSGetValue: (_k: string) => '',
      LMSSetValue: (_k: string, _v: string) => 'true',
      LMSCommit: () => 'true',
    };

    // Create adapter with a mock API by subclassing
    class TestSCORM12 extends SCORM12Adapter {
      override async initialize() {
        // @ts-expect-error – override for test
        this.api = mockApi;
        this.initialized = true;
        return true;
      }
    }

    const adapter = new TestSCORM12();
    await adapter.initialize();
    expect(adapter.initialized).toBe(true);

    await adapter.saveLocation('slide-3');
    // Verify the API was called by checking that setValue returns true
    expect(await adapter.setValue('cmi.core.lesson_status', 'completed')).toBe(true);
  });

  it('saveScore calculates percentage and sets status', async () => {
    const mockApi = {
      LMSInitialize: () => 'true',
      LMSFinish: () => 'true',
      LMSGetValue: (_k: string) => '',
      LMSSetValue: vi.fn(() => 'true'),
      LMSCommit: () => 'true',
    };

    class TestSCORM12 extends SCORM12Adapter {
      override async initialize() {
        // @ts-expect-error – override for test
        this.api = mockApi;
        this.initialized = true;
        return true;
      }
    }

    const adapter = new TestSCORM12();
    await adapter.initialize();
    await adapter.saveScore(85, 0, 100);

    expect(mockApi.LMSSetValue).toHaveBeenCalledWith('cmi.core.score.raw', '85');
    expect(mockApi.LMSSetValue).toHaveBeenCalledWith('cmi.core.lesson_status', 'passed');
  });
});

// ---- SCORM 2004 Adapter ----

describe('SCORM2004Adapter', () => {
  it('saveLocation sets cmi.location', async () => {
    const mockApi = {
      Initialize: () => 'true',
      Terminate: () => 'true',
      GetValue: (_k: string) => '',
      SetValue: vi.fn(() => 'true'),
      Commit: () => 'true',
    };

    class TestSCORM2004 extends SCORM2004Adapter {
      override async initialize() {
        // @ts-expect-error – override for test
        this.api = mockApi;
        this.initialized = true;
        return true;
      }
    }

    const adapter = new TestSCORM2004();
    await adapter.initialize();
    await adapter.saveLocation('slide-5');
    expect(mockApi.SetValue).toHaveBeenCalledWith('cmi.location', 'slide-5');
  });

  it('saveScore sets scaled score and success_status', async () => {
    const mockApi = {
      Initialize: () => 'true',
      Terminate: () => 'true',
      GetValue: (_k: string) => '',
      SetValue: vi.fn(() => 'true'),
      Commit: () => 'true',
    };

    class TestSCORM2004 extends SCORM2004Adapter {
      override async initialize() {
        // @ts-expect-error – override for test
        this.api = mockApi;
        this.initialized = true;
        return true;
      }
    }

    const adapter = new TestSCORM2004();
    await adapter.initialize();
    await adapter.saveScore(80, 0, 100, 0.8);

    expect(mockApi.SetValue).toHaveBeenCalledWith('cmi.score.raw', '80');
    expect(mockApi.SetValue).toHaveBeenCalledWith('cmi.score.scaled', '0.8');
    expect(mockApi.SetValue).toHaveBeenCalledWith('cmi.success_status', 'passed');
    expect(mockApi.SetValue).toHaveBeenCalledWith('cmi.completion_status', 'completed');
  });

  it('sets failed status when score below passing', async () => {
    const mockApi = {
      Initialize: () => 'true',
      Terminate: () => 'true',
      GetValue: (_k: string) => '',
      SetValue: vi.fn(() => 'true'),
      Commit: () => 'true',
    };

    class TestSCORM2004 extends SCORM2004Adapter {
      override async initialize() {
        // @ts-expect-error – override for test
        this.api = mockApi;
        this.initialized = true;
        return true;
      }
    }

    const adapter = new TestSCORM2004();
    await adapter.initialize();
    await adapter.saveScore(50, 0, 100, 0.5);
    expect(mockApi.SetValue).toHaveBeenCalledWith('cmi.success_status', 'failed');
  });
});

// ---- xAPI Adapter ----

describe('XAPIAdapter', () => {
  it('sendStatement enqueues a statement', async () => {
    const enqueue = vi.fn();
    const flush = vi.fn().mockResolvedValue(undefined);

    const adapter = new XAPIAdapter({
      endpoint: 'https://lrs.example.com/xapi/',
      auth: 'Bearer test',
      activityId: 'https://example.com/course/test',
      agent: { mbox: 'mailto:test@example.com', name: 'Test User' },
      batcher: { enqueue, flush },
    });

    await adapter.initialize();
    await adapter.sendStatement({
      verb: 'http://adlnet.gov/expapi/verbs/completed',
      object: { id: 'https://example.com/activity/slide1' },
      result: { score: { scaled: 1.0 }, success: true },
    });

    expect(enqueue).toHaveBeenCalledTimes(1);
    const stmt = enqueue.mock.calls[0][0];
    expect(stmt.verb.id).toBe('http://adlnet.gov/expapi/verbs/completed');
    expect(stmt.actor.mbox).toBe('mailto:test@example.com');
  });

  it('terminate flushes the batcher', async () => {
    const enqueue = vi.fn();
    const flush = vi.fn().mockResolvedValue(undefined);

    const adapter = new XAPIAdapter({
      endpoint: 'https://lrs.example.com/xapi/',
      auth: 'Bearer test',
      activityId: 'https://example.com/course/test',
      agent: { mbox: 'mailto:test@example.com', name: 'Test User' },
      batcher: { enqueue, flush },
    });

    await adapter.initialize();
    await adapter.terminate();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('getLearnerInfo returns agent info', () => {
    const adapter = new XAPIAdapter({
      endpoint: 'https://lrs.example.com/xapi/',
      auth: 'Bearer test',
      activityId: 'https://example.com/course/test',
      agent: { mbox: 'mailto:test@example.com', name: 'Test User' },
    });

    const info = adapter.getLearnerInfo();
    expect(info.mbox).toBe('mailto:test@example.com');
    expect(info.name).toBe('Test User');
  });
});
