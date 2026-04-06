export interface MediaRef {
  id: string;
  type: 'audio' | 'video';
  src: string;
  volume: number;
  loop: boolean;
}

/**
 * Manages HTML5 audio/video element lifecycle.
 */
export class MediaController {
  private elements = new Map<string, HTMLMediaElement>();

  constructor(private container: HTMLElement) {}

  async play(ref: MediaRef): Promise<void> {
    let el = this.elements.get(ref.id);
    if (!el) {
      el = this.createElement(ref);
      this.elements.set(ref.id, el);
      this.container.appendChild(el);
    }
    el.volume = ref.volume ?? 1;
    el.loop = ref.loop ?? false;
    try {
      await el.play();
    } catch (err) {
      // Autoplay may be blocked — ignore
    }
  }

  pause(refOrId: MediaRef | string): void {
    const id = typeof refOrId === 'string' ? refOrId : refOrId.id;
    const el = this.elements.get(id);
    if (el) el.pause();
  }

  stop(id: string): void {
    const el = this.elements.get(id);
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
  }

  destroy(): void {
    this.elements.forEach(el => {
      el.pause();
      el.remove();
    });
    this.elements.clear();
  }

  private createElement(ref: MediaRef): HTMLMediaElement {
    const tag = ref.type === 'video' ? 'video' : 'audio';
    const el = document.createElement(tag) as HTMLMediaElement;
    el.src = ref.src;
    el.volume = ref.volume ?? 1;
    el.loop = ref.loop ?? false;
    el.preload = 'auto';
    el.style.display = 'none';
    return el;
  }
}
