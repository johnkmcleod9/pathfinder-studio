/**
 * SCORM 1.2 / 2004 API adapters — SaveSessionTime formatting
 *
 * The adapters take milliseconds and write to the right cmi.* path
 * with the right format:
 *   SCORM 1.2  : cmi.core.session_time   = HHHH:MM:SS.SS
 *   SCORM 2004 : cmi.session_time        = PT#H#M#S (ISO 8601)
 *
 * We eval each adapter IIFE into a sandbox that fakes the LMS API
 * (window.API for 1.2; window.API_1484_11 for 2004), then drive
 * SaveSessionTime and assert the value the adapter sent to SetValue.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SCORM_12_ADAPTER,
  SCORM_2004_ADAPTER,
} from '../../src/publish/scorm-manifest.js';

interface FakeLms {
  setCalls: Array<[string, string]>;
  commitCalls: number;
}

interface SandboxGlobal {
  window?: Record<string, unknown>;
  globalThis?: Record<string, unknown>;
  console?: { warn: (...args: unknown[]) => void };
}

function evalAdapter(
  adapterSrc: string,
  fakeApi: Record<string, (...args: unknown[]) => string>,
  apiKey: 'API' | 'API_1484_11'
): {
  adapter: {
    Initialize: () => string;
    Terminate: (p: string) => string;
    SaveSessionTime: (ms: number) => void;
  };
  lms: FakeLms;
} {
  const lms: FakeLms = { setCalls: [], commitCalls: 0 };
  // Mutable map serving as the parent windows of the simulated frame
  // chain. The adapter walks .parent until it finds API or hits a
  // self-referential window.
  const sandbox: Record<string, unknown> & { window?: unknown } = {
    [apiKey]: fakeApi,
    parent: null as unknown,
  };
  sandbox.parent = sandbox; // self-loop so findAPI terminates
  sandbox.window = sandbox;
  const adapterGlobals = {
    SCORM2004Adapter: undefined as unknown,
    SCORM12Adapter: undefined as unknown,
  };
  // The IIFE writes its export to its global. We simulate `globalThis`
  // and `window` both pointing at our sandbox.
  const fn = new Function('window', 'globalThis', 'console', adapterSrc);
  fn(sandbox, adapterGlobals, { warn: () => {} });
  const adapter = (adapterGlobals.SCORM2004Adapter ?? adapterGlobals.SCORM12Adapter) as {
    Initialize: () => string;
    Terminate: (p: string) => string;
    SaveSessionTime: (ms: number) => void;
  };
  // Wire the fake API's SetValue / Commit to the lms tracker.
  const wrappedSet = fakeApi[apiKey === 'API' ? 'LMSSetValue' : 'SetValue'];
  fakeApi[apiKey === 'API' ? 'LMSSetValue' : 'SetValue'] = (...args: unknown[]) => {
    lms.setCalls.push([args[0] as string, args[1] as string]);
    return wrappedSet(...args);
  };
  const wrappedCommit = fakeApi[apiKey === 'API' ? 'LMSCommit' : 'Commit'];
  fakeApi[apiKey === 'API' ? 'LMSCommit' : 'Commit'] = (...args: unknown[]) => {
    lms.commitCalls++;
    return wrappedCommit(...args);
  };
  return { adapter, lms };
}

function makeFakeApi12(): Record<string, (...args: unknown[]) => string> {
  return {
    LMSInitialize: () => 'true',
    LMSFinish: () => 'true',
    LMSGetValue: () => '',
    LMSSetValue: () => 'true',
    LMSCommit: () => 'true',
    LMSGetLastError: () => '0',
    LMSGetErrorString: () => '',
    LMSGetDiagnostic: () => '',
  };
}

function makeFakeApi2004(): Record<string, (...args: unknown[]) => string> {
  return {
    Initialize: () => 'true',
    Terminate: () => 'true',
    GetValue: () => '',
    SetValue: () => 'true',
    Commit: () => 'true',
    GetLastError: () => '0',
    GetErrorString: () => '',
    GetDiagnostic: () => '',
  };
}

// ─── SCORM 1.2 ─────────────────────────────────────────────────────────────────

describe('SCORM 1.2 adapter — SaveSessionTime', () => {
  let adapter: ReturnType<typeof evalAdapter>['adapter'];
  let lms: FakeLms;

  beforeEach(() => {
    const r = evalAdapter(SCORM_12_ADAPTER, makeFakeApi12(), 'API');
    adapter = r.adapter;
    lms = r.lms;
    adapter.Initialize();
    lms.setCalls.length = 0; // clear init-time noise
    lms.commitCalls = 0;
  });

  it('writes to cmi.core.session_time', () => {
    adapter.SaveSessionTime(60_000);
    const targets = lms.setCalls.map((c) => c[0]);
    expect(targets).toContain('cmi.core.session_time');
  });

  it('formats 60_000 ms as 00:01:00.00', () => {
    adapter.SaveSessionTime(60_000);
    const call = lms.setCalls.find((c) => c[0] === 'cmi.core.session_time');
    expect(call![1]).toBe('00:01:00.00');
  });

  it('formats 30_500 ms as 00:00:30.50 (centiseconds)', () => {
    adapter.SaveSessionTime(30_500);
    const call = lms.setCalls.find((c) => c[0] === 'cmi.core.session_time');
    expect(call![1]).toBe('00:00:30.50');
  });

  it('formats 3_661_000 ms (1h 1m 1s) as 01:01:01.00', () => {
    adapter.SaveSessionTime(3_661_000);
    const call = lms.setCalls.find((c) => c[0] === 'cmi.core.session_time');
    expect(call![1]).toBe('01:01:01.00');
  });

  it('commits after writing', () => {
    adapter.SaveSessionTime(5_000);
    expect(lms.commitCalls).toBeGreaterThan(0);
  });
});

// ─── SCORM 2004 ────────────────────────────────────────────────────────────────

describe('SCORM 2004 adapter — SaveSessionTime', () => {
  let adapter: ReturnType<typeof evalAdapter>['adapter'];
  let lms: FakeLms;

  beforeEach(() => {
    const r = evalAdapter(SCORM_2004_ADAPTER, makeFakeApi2004(), 'API_1484_11');
    adapter = r.adapter;
    lms = r.lms;
    adapter.Initialize();
    lms.setCalls.length = 0;
    lms.commitCalls = 0;
  });

  it('writes to cmi.session_time', () => {
    adapter.SaveSessionTime(60_000);
    const targets = lms.setCalls.map((c) => c[0]);
    expect(targets).toContain('cmi.session_time');
  });

  it('formats 1 minute as PT1M', () => {
    adapter.SaveSessionTime(60_000);
    const call = lms.setCalls.find((c) => c[0] === 'cmi.session_time');
    expect(call![1]).toBe('PT1M');
  });

  it('formats 1h 1m 1s as PT1H1M1S', () => {
    adapter.SaveSessionTime(3_661_000);
    const call = lms.setCalls.find((c) => c[0] === 'cmi.session_time');
    expect(call![1]).toBe('PT1H1M1S');
  });

  it('formats 0 as PT0S (a value is required)', () => {
    adapter.SaveSessionTime(0);
    const call = lms.setCalls.find((c) => c[0] === 'cmi.session_time');
    expect(call![1]).toBe('PT0S');
  });

  it('omits zero components but keeps non-zero ones (PT2H30S)', () => {
    adapter.SaveSessionTime(2 * 3600 * 1000 + 30 * 1000);
    const call = lms.setCalls.find((c) => c[0] === 'cmi.session_time');
    expect(call![1]).toBe('PT2H30S');
  });

  it('commits after writing', () => {
    adapter.SaveSessionTime(5_000);
    expect(lms.commitCalls).toBeGreaterThan(0);
  });
});
