import type { RuntimeCourse, RuntimeSlide, LMSAdapter } from './types.js';
import { VariableStore } from './variable-store.js';
import { NavigationEngine } from './navigation.js';
import { TriggerExecutor } from './trigger-executor.js';
import { QuizController } from './quiz-controller.js';
import { MediaController } from './media-controller.js';

export interface PathfinderRuntimeOptions {
  course: RuntimeCourse;
  container: HTMLElement;
  lmsAdapter: LMSAdapter;
  onSlideChange?: (slideId: string) => void;
  onComplete?: (result: { score?: unknown }) => void;
}

/**
 * PathfinderRuntime — the main browser-side engine.
 *
 * Reads course.json, renders slides, executes triggers, manages
 * quiz state, and communicates with the LMS via an adapter.
 */
export class PathfinderRuntime {
  private course: RuntimeCourse;
  private container: HTMLElement;
  private variables: VariableStore;
  private navigation: NavigationEngine;
  private triggers: TriggerExecutor;
  private quiz: QuizController | null = null;
  private media: MediaController;
  private lms: LMSAdapter;
  private currentSlideEl: HTMLElement | null = null;
  private onComplete?: (result: { score?: unknown }) => void;
  private started = false;

  constructor(opts: PathfinderRuntimeOptions) {
    this.course = opts.course;
    this.container = opts.container;
    this.lms = opts.lmsAdapter;
    this.onComplete = opts.onComplete;

    this.variables = new VariableStore(opts.course.variables);
    this.navigation = new NavigationEngine(opts.course, (newId) => {
      if (newId) this.navigateToSlide(newId);
      opts.onSlideChange?.(newId);
    });
    this.media = new MediaController(this.container);
    this.triggers = new TriggerExecutor(
      this.variables,
      this.navigation,
      this.media,
      this.lms
    );

    if (opts.course.quiz) {
      this.quiz = new QuizController(opts.course.quiz, this.variables);
    }
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.lms.initialize?.();
    this.navigateToSlide(this.course.navigation.entry);
    // Fire courseStarts triggers on the first slide
    await this.triggers.fireEvent('courseStarts', undefined);
  }

  async terminate(): Promise<void> {
    await this.lms.terminate?.();
    this.media.destroy();
  }

  // ---- Navigation ----

  goToSlide(slideId: string): void {
    this.navigation.goToSlide(slideId);
  }

  goNext(): void {
    const next = this.navigation.getNextSlideId();
    if (next) this.navigation.goToSlide(next);
  }

  goBack(): void {
    this.navigation.goBack();
  }

  getCurrentSlideId(): string {
    return this.navigation.getCurrentSlideId();
  }

  getTotalSlides(): number {
    return this.navigation.getTotalSlides();
  }

  // ---- Variables ----

  getVariable(name: string): unknown {
    return this.variables.get(name);
  }

  setVariable(name: string, value: unknown): void {
    this.variables.set(name, value);
  }

  // ---- Quiz ----

  startQuizAttempt(): ReturnType<QuizController['startAttempt']> {
    return this.quiz?.startAttempt() ?? null;
  }

  recordQuizAnswer(questionId: string, response: string): void {
    const attempt = this.quiz?.getCurrentAttempt();
    if (attempt) this.quiz?.recordAnswer(attempt.id, questionId, response);
  }

  submitQuizAttempt() {
    const attempt = this.quiz?.getCurrentAttempt();
    if (!attempt) return null;
    const score = this.quiz?.submitAttempt(attempt.id) ?? null;
    if (score) {
      this.lms.saveScore?.(score.raw, 0, score.possible, score.percent / 100);
      if (this.onComplete) this.onComplete({ score });
    }
    return score;
  }

  // ---- Slide rendering ----

  private navigateToSlide(slideId: string): void {
    const slide = this.navigation.getSlide(slideId);
    if (!slide) return;

    // Save location to LMS
    this.lms.saveLocation?.(slideId);

    // Remove current slide
    if (this.currentSlideEl) {
      this.currentSlideEl.remove();
    }

    // Render new slide
    const el = this.renderSlide(slide);
    this.container.appendChild(el);
    this.currentSlideEl = el;

    // Register and fire slide triggers
    this.triggers.registerSlideTriggers(slide);
    this.triggers.fireEvent('timelineStarts', undefined);
  }

  private renderSlide(slide: RuntimeSlide): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-slide-id', slide.id);
    wrapper.className = 'pf-slide';
    wrapper.style.cssText = `
      position: relative;
      width: ${this.course.canvas.width}px;
      height: ${this.course.canvas.height}px;
      overflow: hidden;
      background: ${this.renderBackground(slide)};
    `;

    // Render objects
    for (const obj of slide.objects) {
      const objEl = this.renderObject(obj);
      wrapper.appendChild(objEl);
    }

    // Attach click listeners for trigger execution
    this.attachObjectListeners(wrapper, slide);

    return wrapper;
  }

  private renderBackground(slide: RuntimeSlide): string {
    const bg = slide.background;
    if (bg.type === 'solid') return bg.color ?? '#FFFFFF';
    if (bg.type === 'gradient' && bg.stops) {
      const angle = bg.angle ?? 90;
      const stops = bg.stops.map(s => `${s.color} ${s.offset * 100}%`).join(', ');
      return `linear-gradient(${angle}deg, ${stops})`;
    }
    return '#FFFFFF';
  }

  private renderObject(obj: ReturnType<PathfinderRuntime['renderObject']> extends HTMLElement ? never : Parameters<PathfinderRuntime['renderObject']>[0]): HTMLElement {
    // Type guard workaround — this is actually RuntimeObject
    const o = obj as import('./types.js').RuntimeObject;
    const el = document.createElement('div');
    el.setAttribute('data-object-id', o.id);
    el.style.cssText = `
      position: absolute;
      left: ${o.rect[0]}px;
      top: ${o.rect[1]}px;
      width: ${o.rect[2]}px;
      height: ${o.rect[3]}px;
    `;

    switch (o.type) {
      case 'text':
        el.innerHTML = o.content ?? '';
        break;

      case 'button':
      case 'shape':
      case 'image':
        // These are rendered by the player shell
        if (o.label) el.textContent = o.label;
        break;
    }

    return el;
  }

  private attachObjectListeners(wrapper: HTMLElement, slide: RuntimeSlide): void {
    wrapper.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const objectEl = target.closest('[data-object-id]') as HTMLElement | null;
      if (!objectEl) return;
      const objectId = objectEl.getAttribute('data-object-id');
      if (objectId) await this.triggers.fireEvent('userClick', objectId);
    });
  }

  // ---- State ----

  serializeState(): object {
    const state: Record<string, unknown> = {
      currentSlide: this.navigation.getCurrentSlideId(),
      variables: this.variables.toJSON(),
      history: this.navigation.getHistory(),
    };
    if (this.quiz) {
      state.quiz = this.quiz.serializeState();
    }
    return state;
  }

  restoreState(state: Record<string, unknown>): void {
    if (state.variables) this.variables.fromJSON(state.variables as Record<string, unknown>);
    if (state.currentSlide && typeof state.currentSlide === 'string') {
      this.navigation.goToSlide(state.currentSlide);
    }
    if (state.quiz && this.quiz) {
      this.quiz.restoreState(state.quiz as { attempts: import('./types.js').QuizAttempt[] } as Parameters<QuizController['restoreState']>[0]);
    }
  }

  // ---- LMS ----

  getLMSAdapter(): LMSAdapter { return this.lms; }
}
