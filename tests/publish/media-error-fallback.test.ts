// @vitest-environment jsdom
/// <reference lib="dom" />

/**
 * Browser PathfinderRuntime — media error fallbacks
 *
 * When a course references a missing or broken media file the
 * runtime previously showed:
 *   - <img> → browser broken-image icon
 *   - <video>/<audio> → empty player chrome
 * No diagnostic, no fallback, no event the host page could react to.
 *
 * Behavior:
 * - Each media element gets an onerror listener that:
 *     1. Replaces the element with a labelled fallback <div> showing
 *        "Image not available" / "Video not available" / "Audio not
 *        available" + the alt text when present
 *     2. Emits 'mediaerror' with {objectId, type, src, altText}
 * - Object skipped entirely when src is empty / undefined and the
 *   altText is empty too (not an error — just no media to render)
 * - When src is empty but altText is present, render alt text alone
 *   (graceful when an author hasn't yet uploaded the media)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { BROWSER_RUNTIME } from '../../src/publish/browser-runtime.js';

beforeEach(() => {
  delete (globalThis as unknown as { PathfinderRuntime?: unknown }).PathfinderRuntime;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(BROWSER_RUNTIME)();
  document.body.innerHTML = '';
});

interface RuntimeCtor {
  new (opts: { course: unknown; container: HTMLElement; lmsAdapter?: unknown }): RuntimeInstance;
}
interface RuntimeInstance {
  start(): void;
  on(e: string, cb: (...a: unknown[]) => void): void;
}
function getRuntimeCtor(): RuntimeCtor {
  return (globalThis as unknown as { PathfinderRuntime: RuntimeCtor }).PathfinderRuntime;
}
function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function mediaCourse(objects: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    format: 'pathfinder-v1',
    metadata: { id: 'mc', title: 'M', author: 'A', language: 'en' },
    canvas: { width: 800, height: 600, backgroundColor: '#FFF' },
    slides: [{
      id: 's1', title: 'One',
      background: { type: 'solid', color: '#FFF' },
      objects, triggers: [],
    }],
    variables: {},
    navigation: { entry: 's1', slides: ['s1'], arrows: false, progress: false },
    lms: { standard: 'html5' },
  };
}

function fireError(el: HTMLElement): void {
  el.dispatchEvent(new Event('error'));
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Media error fallback: image', () => {
  it('replaces a broken <img> with a fallback <div>', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({
      course: mediaCourse([{
        id: 'pic', type: 'image', rect: [0, 0, 200, 100],
        src: 'media/missing.png', altText: 'A whale',
      }]),
      container,
    });
    rt.start();
    const img = container.querySelector('img[data-object-id="pic"]') as HTMLImageElement;
    expect(img).not.toBeNull();
    fireError(img);
    // Original <img> replaced with fallback div bearing the same data-object-id.
    expect(container.querySelector('img[data-object-id="pic"]')).toBeNull();
    const fallback = container.querySelector('div[data-object-id="pic"][data-media-error="true"]');
    expect(fallback).not.toBeNull();
  });

  it('fallback shows the alt text when present', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({
      course: mediaCourse([{
        id: 'pic', type: 'image', rect: [0, 0, 200, 100],
        src: 'media/missing.png', altText: 'A whale',
      }]),
      container,
    });
    rt.start();
    fireError(container.querySelector('img[data-object-id="pic"]') as HTMLElement);
    const fallback = container.querySelector('[data-object-id="pic"]') as HTMLElement;
    expect(fallback.textContent).toContain('A whale');
  });

  it('fallback shows "Image not available" when alt is empty', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({
      course: mediaCourse([{
        id: 'pic', type: 'image', rect: [0, 0, 200, 100],
        src: 'media/missing.png',
      }]),
      container,
    });
    rt.start();
    fireError(container.querySelector('img[data-object-id="pic"]') as HTMLElement);
    const fallback = container.querySelector('[data-object-id="pic"]') as HTMLElement;
    expect(fallback.textContent).toContain('Image not available');
  });

  it('emits mediaerror with {objectId, type, src, altText}', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const events: Array<Record<string, unknown>> = [];
    const rt = new Ctor({
      course: mediaCourse([{
        id: 'pic', type: 'image', rect: [0, 0, 200, 100],
        src: 'media/missing.png', altText: 'A whale',
      }]),
      container,
    });
    rt.on('mediaerror', (p: unknown) => events.push(p as Record<string, unknown>));
    rt.start();
    fireError(container.querySelector('img[data-object-id="pic"]') as HTMLElement);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      objectId: 'pic',
      type: 'image',
      src: 'media/missing.png',
      altText: 'A whale',
    });
  });
});

describe('Media error fallback: video', () => {
  it('replaces a broken <video> with a fallback', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({
      course: mediaCourse([{
        id: 'vid', type: 'video', rect: [0, 0, 400, 200],
        src: 'media/missing.mp4',
      }]),
      container,
    });
    rt.start();
    const vid = container.querySelector('video[data-object-id="vid"]') as HTMLElement;
    fireError(vid);
    expect(container.querySelector('video[data-object-id="vid"]')).toBeNull();
    const fallback = container.querySelector('div[data-object-id="vid"][data-media-error="true"]');
    expect(fallback).not.toBeNull();
    expect(fallback!.textContent).toContain('Video not available');
  });
});

describe('Media error fallback: audio', () => {
  it('replaces a broken <audio> with a fallback', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({
      course: mediaCourse([{
        id: 'aud', type: 'audio', rect: [0, 0, 200, 50],
        src: 'media/missing.mp3',
      }]),
      container,
    });
    rt.start();
    const aud = container.querySelector('audio[data-object-id="aud"]') as HTMLElement;
    fireError(aud);
    const fallback = container.querySelector('div[data-object-id="aud"][data-media-error="true"]');
    expect(fallback).not.toBeNull();
    expect(fallback!.textContent).toContain('Audio not available');
  });
});

describe('Media error fallback: empty src handling', () => {
  it('renders alt text alone when src is empty but altText is present', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({
      course: mediaCourse([{
        id: 'pic', type: 'image', rect: [0, 0, 200, 100],
        src: '', altText: 'Coming soon',
      }]),
      container,
    });
    rt.start();
    const fallback = container.querySelector('[data-object-id="pic"]') as HTMLElement;
    expect(fallback).not.toBeNull();
    expect(fallback.tagName).not.toBe('IMG'); // would be a broken image
    expect(fallback.textContent).toContain('Coming soon');
  });

  it('still emits mediaerror only on actual load failure (not on empty src)', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const events: unknown[] = [];
    const rt = new Ctor({
      course: mediaCourse([{
        id: 'pic', type: 'image', rect: [0, 0, 200, 100],
        src: '', altText: 'Coming soon',
      }]),
      container,
    });
    rt.on('mediaerror', (p: unknown) => events.push(p));
    rt.start();
    expect(events).toHaveLength(0);
  });
});

describe('Media error fallback: ARIA on the fallback', () => {
  it('fallback exposes a role + aria-label so screen readers can announce it', () => {
    const Ctor = getRuntimeCtor();
    const container = makeContainer();
    const rt = new Ctor({
      course: mediaCourse([{
        id: 'pic', type: 'image', rect: [0, 0, 200, 100],
        src: 'media/missing.png', altText: 'A whale',
      }]),
      container,
    });
    rt.start();
    fireError(container.querySelector('img[data-object-id="pic"]') as HTMLElement);
    const fallback = container.querySelector('[data-object-id="pic"]') as HTMLElement;
    expect(fallback.getAttribute('role')).toBe('img');
    expect(fallback.getAttribute('aria-label')).toContain('A whale');
  });
});
