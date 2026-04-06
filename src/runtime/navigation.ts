import type { RuntimeCourse, RuntimeSlide } from './types.js';

type SlideChangeListener = (newId: string, oldId: string) => void;

/**
 * Manages slide navigation, history stack, and slide lookup.
 */
export class NavigationEngine {
  private currentId: string;
  private history: string[] = [];
  private onSlideChange: SlideChangeListener;
  private course: RuntimeCourse;

  constructor(course: RuntimeCourse, onSlideChange: SlideChangeListener) {
    this.course = course;
    this.currentId = course.navigation.entry;
    this.history = [this.currentId];
    this.onSlideChange = onSlideChange;
  }

  getCurrentSlideId(): string { return this.currentId; }

  goToSlide(slideId: string): string | null {
    const slide = this.getSlide(slideId);
    if (!slide) return null;
    const old = this.currentId;
    this.currentId = slideId;
    this.history.push(slideId);
    this.onSlideChange(slideId, old);
    return slideId;
  }

  goBack(): string | null {
    if (this.history.length <= 1) return null;
    this.history.pop();
    const prev = this.history[this.history.length - 1];
    if (!prev) return null;
    const old = this.currentId;
    this.currentId = prev;
    this.onSlideChange(prev, old);
    return prev;
  }

  hasNext(): boolean {
    const idx = this.getSlideIndex(this.currentId);
    return idx < this.course.navigation.slides.length - 1;
  }

  hasPrevious(): boolean {
    return this.history.length > 1;
  }

  getNextSlideId(): string | null {
    const idx = this.getSlideIndex(this.currentId);
    const nextId = this.course.navigation.slides[idx + 1];
    return nextId ?? null;
  }

  getPreviousSlideId(): string | null {
    if (this.history.length < 2) return null;
    return this.history[this.history.length - 2];
  }

  getSlide(slideId: string): RuntimeSlide | null {
    return this.course.slides.find(s => s.id === slideId) ?? null;
  }

  getCurrentSlide(): RuntimeSlide | null {
    return this.getSlide(this.currentId);
  }

  getSlideIndex(slideId: string): number {
    return this.course.navigation.slides.indexOf(slideId);
  }

  getTotalSlides(): number { return this.course.navigation.slides.length; }

  getSlideIds(): string[] { return [...this.course.navigation.slides]; }

  getHistory(): string[] { return [...this.history]; }
}
