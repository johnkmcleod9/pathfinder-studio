import type { LMSAdapter, LearnerInfo, XAPIStatement } from '../types.js';

// ---- Base adapter ----

export abstract class BaseAdapter implements LMSAdapter {
  abstract initialize(): Promise<boolean>;
  abstract terminate(): Promise<boolean>;
  abstract setValue(key: string, value: string): Promise<boolean>;
  abstract getValue(key: string): Promise<string>;
  abstract commit(): Promise<boolean>;
  sendStatement?(_stmt: XAPIStatement): Promise<void> { return Promise.resolve(); }
  saveLocation?(_slideId: string): Promise<void> { return Promise.resolve(); }
  saveScore?(_raw: number, _min?: number, _max?: number, _scaled?: number): Promise<void> { return Promise.resolve(); }
  saveCompletion?(_status: string): Promise<void> { return Promise.resolve(); }
  getLearnerInfo(): LearnerInfo { return {}; }
}

// ---- Standalone (no LMS) ----

export class StandaloneAdapter extends BaseAdapter {
  async initialize(): Promise<boolean> { return true; }
  async terminate(): Promise<boolean> { return true; }
  async setValue(_key: string, _value: string): Promise<boolean> { return true; }
  async getValue(_key: string): Promise<string> { return ''; }
  async commit(): Promise<boolean> { return true; }
}

// ---- SCORM 1.2 ----

interface SCORM12API {
  LMSInitialize(_: string): string;
  LMSFinish(_: string): string;
  LMSGetValue(_key: string): string;
  LMSSetValue(_key: string, _value: string): string;
  LMSCommit(_: string): string;
}

export class SCORM12Adapter extends BaseAdapter {
  private api: SCORM12API | null = null;
  initialized = false;
  private passingScore = 80;

  findAPI(win: Window & typeof globalThis): SCORM12API | null {
    let current: (Window & typeof globalThis) | null = win;
    while (current && !(current as unknown as { API?: SCORM12API }).API) {
      current = current.parent;
      if (current === win) break; // Avoid infinite loop
    }
    return (current as unknown as { API?: SCORM12API }).API ?? null;
  }

  async initialize(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    this.api = this.findAPI(window);
    if (!this.api) return false;
    const result = this.api.LMSInitialize('');
    this.initialized = result === 'true';
    return this.initialized;
  }

  async terminate(): Promise<boolean> {
    if (!this.api) return false;
    const result = this.api.LMSFinish('');
    return result === 'true';
  }

  async setValue(key: string, value: string): Promise<boolean> {
    if (!this.api) return false;
    return this.api.LMSSetValue(key, value) === 'true';
  }

  async getValue(key: string): Promise<string> {
    if (!this.api) return '';
    return this.api.LMSGetValue(key);
  }

  async commit(): Promise<boolean> {
    if (!this.api) return false;
    return this.api.LMSCommit('') === 'true';
  }

  async saveLocation(slideId: string): Promise<void> {
    await this.setValue('cmi.core.lesson_location', slideId);
    await this.commit();
  }

  async saveScore(raw: number, min = 0, max = 100): Promise<void> {
    await this.setValue('cmi.core.score.raw', String(raw));
    await this.setValue('cmi.core.score.min', String(min));
    await this.setValue('cmi.core.score.max', String(max));
    const pct = max > min ? Math.round(((raw - min) / (max - min)) * 100) : 0;
    const status = pct >= this.passingScore ? 'passed' : 'failed';
    await this.setValue('cmi.core.lesson_status', status);
    await this.commit();
  }

  async saveCompletion(status: string): Promise<void> {
    await this.setValue('cmi.core.lesson_status', status);
    await this.commit();
  }

  getLearnerInfo(): LearnerInfo {
    return { name: undefined, mbox: undefined };
  }
}

// ---- SCORM 2004 ----

interface SCORM2004API {
  Initialize(_: string): string;
  Terminate(_: string): string;
  GetValue(_key: string): string;
  SetValue(_key: string, _value: string): string;
  Commit(_: string): string;
}

export class SCORM2004Adapter extends BaseAdapter {
  private api: SCORM2004API | null = null;
  initialized = false;
  private passingScore = 80;

  findAPI(win: Window & typeof globalThis): SCORM2004API | null {
    let current: (Window & typeof globalThis) | null = win;
    const tried = new Set<(Window & typeof globalThis)>();
    while (current && !tried.has(current)) {
      tried.add(current);
      const api = (current as unknown as { API_1484_11?: SCORM2004API }).API_1484_11;
      if (api) return api;
      const altApi = (current as unknown as { API?: SCORM2004API }).API;
      if (altApi) return altApi;
      current = current.parent;
    }
    return null;
  }

  async initialize(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    this.api = this.findAPI(window);
    if (!this.api) return false;
    const result = this.api.Initialize('');
    this.initialized = result === 'true';
    return this.initialized;
  }

  async terminate(): Promise<boolean> {
    if (!this.api) return false;
    const result = this.api.Terminate('');
    return result === 'true';
  }

  async setValue(key: string, value: string): Promise<boolean> {
    if (!this.api) return false;
    return this.api.SetValue(key, String(value)) === 'true';
  }

  async getValue(key: string): Promise<string> {
    if (!this.api) return '';
    return this.api.GetValue(key);
  }

  async commit(): Promise<boolean> {
    if (!this.api) return false;
    return this.api.Commit('') === 'true';
  }

  async saveLocation(slideId: string): Promise<void> {
    await this.setValue('cmi.location', slideId);
    await this.commit();
  }

  async saveScore(raw: number, min = 0, max = 100, scaled?: number): Promise<void> {
    await this.setValue('cmi.score.raw', String(raw));
    await this.setValue('cmi.score.min', String(min));
    await this.setValue('cmi.score.max', String(max));
    if (scaled !== undefined) {
      await this.setValue('cmi.score.scaled', String(scaled));
    }
    const pct = max > min ? (raw - min) / (max - min) * 100 : 0;
    const successStatus = pct >= this.passingScore ? 'passed' : 'failed';
    await this.setValue('cmi.success_status', successStatus);
    await this.setValue('cmi.completion_status', 'completed');
    await this.commit();
  }

  async saveCompletion(status: string): Promise<void> {
    await this.setValue('cmi.completion_status', status);
    await this.commit();
  }

  getLearnerInfo(): LearnerInfo {
    return {
      name: undefined,
      mbox: undefined,
    };
  }
}

// ---- xAPI Adapter ----

export interface StatementBatcher {
  enqueue(stmt: XAPIStatement): void;
  flush(): Promise<void>;
}

export class XAPIAdapter extends BaseAdapter {
  constructor(
    private config: {
      endpoint: string;
      auth: string;
      activityId: string;
      agent: { mbox?: string; name?: string };
      batcher?: StatementBatcher;
    }
  ) {
    super();
    if (config.batcher) this.batcher = config.batcher;
  }

  batcher: StatementBatcher = {
    enqueue: (_stmt: XAPIStatement) => { /* noop */ },
    flush: async () => { /* noop */ },
  };

  async initialize(): Promise<boolean> { return true; }
  async terminate(): Promise<boolean> { await this.batcher.flush(); return true; }
  async setValue(_key: string, _value: string): Promise<boolean> { return true; }
  async getValue(_key: string): Promise<string> { return ''; }
  async commit(): Promise<boolean> { return true; }

  async sendStatement(stmt: XAPIStatement): Promise<void> {
    const fullStmt = {
      actor: {
        mbox: this.config.agent.mbox ?? 'mailto:unknown@example.com',
        name: this.config.agent.name ?? 'Unknown Learner',
      },
      verb: {
        id: stmt.verb,
        display: { 'en-US': stmt.verb.split('/').pop() ?? stmt.verb },
      },
      object: stmt.object,
      result: stmt.result,
      context: {
        ...stmt.context,
        contextActivities: {
          parent: { id: this.config.activityId },
          grouping: [{ id: this.config.activityId + '/course' }],
        },
        registration: crypto.randomUUID?.() ?? Math.random().toString(36),
      },
      timestamp: new Date().toISOString(),
    };
    this.batcher.enqueue(fullStmt as unknown as XAPIStatement);
  }

  async saveLocation(_slideId: string): Promise<void> { /* xAPI uses statements */ }

  getLearnerInfo(): LearnerInfo {
    return {
      mbox: this.config.agent.mbox,
      name: this.config.agent.name,
    };
  }
}

// ---- Factory ----

export function createLMSAdapter(
  standard: string,
  config?: { endpoint?: string; auth?: string; activityId?: string; agent?: { mbox?: string; name?: string } }
): LMSAdapter {
  switch (standard) {
    case 'scorm12': return new SCORM12Adapter();
    case 'scorm2004': return new SCORM2004Adapter();
    case 'xapi':
      return new XAPIAdapter({
        endpoint: config?.endpoint ?? '',
        auth: config?.auth ?? '',
        activityId: config?.activityId ?? '',
        agent: config?.agent ?? { mbox: 'mailto:anonymous@example.com' },
      });
    default: return new StandaloneAdapter();
  }
}
