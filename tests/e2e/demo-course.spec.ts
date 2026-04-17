import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, Page } from '@playwright/test';
import { compileFixture } from './helpers/compile-fixture.js';
import { serveDir, StaticServer } from './helpers/serve-dir.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(HERE, 'fixtures/demo-course');

let server: StaticServer;
let cleanup: () => void;

test.beforeAll(async () => {
  const compiled = await compileFixture(FIXTURE_DIR);
  cleanup = compiled.cleanup;
  server = await serveDir(compiled.packageDir);
});

test.afterAll(async () => {
  if (server) await server.close();
  if (cleanup) cleanup();
});

async function bootCourse(page: Page): Promise<void> {
  await page.goto(`${server.url}/index.html`);
  await page.waitForFunction(() => {
    const rt = (window as unknown as { runtime?: unknown }).runtime;
    return rt !== null && rt !== undefined;
  });
}

test.describe('Demo course — smoke', () => {
  test('index.html loads and exposes PathfinderRuntime', async ({ page }) => {
    await bootCourse(page);
    const hasRuntime = await page.evaluate(
      () => typeof (window as unknown as { PathfinderRuntime?: unknown }).PathfinderRuntime === 'function'
    );
    expect(hasRuntime).toBe(true);
  });

  test('first slide renders the welcome title', async ({ page }) => {
    await bootCourse(page);
    const slide = page.locator('[data-slide-id="welcome"]');
    await expect(slide).toBeVisible();
    await expect(slide.locator('[data-object-id="welcome-title"]')).toHaveText('Pathfinder Studio');
  });

  test('first slide has ARIA region with correct label', async ({ page }) => {
    await bootCourse(page);
    const slide = page.locator('[data-slide-id="welcome"]');
    await expect(slide).toHaveAttribute('role', 'region');
    await expect(slide).toHaveAttribute('aria-label', /^Slide 1 of 8: Welcome$/);
  });
});

test.describe('Demo course — navigation', () => {
  test('shell Next button advances slides', async ({ page }) => {
    await bootCourse(page);
    await page.locator('#btn-next').click();
    await expect(page.locator('[data-slide-id="greeting"]')).toBeVisible();
  });

  test('keyboard ArrowRight advances and ArrowLeft goes back', async ({ page }) => {
    await bootCourse(page);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-slide-id="greeting"]')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('[data-slide-id="welcome"]')).toBeVisible();
  });

  test('Home jumps to first slide, End jumps to last', async ({ page }) => {
    await bootCourse(page);
    await page.keyboard.press('End');
    await expect(page.locator('[data-slide-id="results"]')).toBeVisible();
    await page.keyboard.press('Home');
    await expect(page.locator('[data-slide-id="welcome"]')).toBeVisible();
  });

  test('clicking the welcome CTA triggers jumpToSlide → greeting', async ({ page }) => {
    await bootCourse(page);
    await page.locator('[data-object-id="welcome-cta"]').click();
    await expect(page.locator('[data-slide-id="greeting"]')).toBeVisible();
  });
});

test.describe('Demo course — text + variables', () => {
  test('variable substitution renders the default LearnerName', async ({ page }) => {
    await bootCourse(page);
    await page.locator('[data-object-id="welcome-cta"]').click();
    await expect(page.locator('[data-object-id="greeting-h"]')).toHaveText('Hello, friend.');
  });

  test('setVariable trigger updates substituted text on re-render', async ({ page }) => {
    await bootCourse(page);
    await page.locator('[data-object-id="welcome-cta"]').click();
    await page.locator('[data-object-id="greeting-setname"]').click();
    await expect(page.locator('[data-object-id="greeting-h"]')).toHaveText('Hello, Daisy.');
  });

  test('conditional visibility reveals text when variable condition is met', async ({ page }) => {
    await bootCourse(page);
    await page.locator('[data-object-id="welcome-cta"]').click();
    await expect(page.locator('[data-object-id="greeting-reveal"]')).toHaveCount(0);
    await page.locator('[data-object-id="greeting-setname"]').click();
    await expect(page.locator('[data-object-id="greeting-reveal"]')).toBeVisible();
  });
});

async function goToShowcase(page: Page): Promise<void> {
  await bootCourse(page);
  await page.locator('[data-object-id="welcome-cta"]').click();
  await page.locator('[data-object-id="greeting-next"]').click();
  await expect(page.locator('[data-slide-id="showcase"]')).toBeVisible();
}

test.describe('Demo course — images, shapes, layers', () => {
  test('image renders as <img> with alt text and lazy loading', async ({ page }) => {
    await goToShowcase(page);
    const hero = page.locator('[data-object-id="showcase-hero"]');
    await expect(hero).toHaveAttribute('alt', 'Navy-to-teal gradient with scattered gold stars');
    await expect(hero).toHaveAttribute('loading', 'lazy');
    await expect(hero).toHaveJSProperty('naturalWidth', 480);
  });

  test('decorative shape gets aria-hidden', async ({ page }) => {
    await goToShowcase(page);
    const shape = page.locator('[data-object-id="showcase-shape"]');
    await expect(shape).toHaveAttribute('aria-hidden', 'true');
  });

  test('layer objects are hidden until showLayer trigger fires', async ({ page }) => {
    await goToShowcase(page);
    await expect(page.locator('[data-object-id="tip-text"]')).toHaveCount(0);
    await page.locator('[data-object-id="showcase-tip-btn"]').click();
    await expect(page.locator('[data-object-id="tip-text"]')).toBeVisible();
    await expect(page.locator('[data-object-id="tip-text"]')).toHaveAttribute('data-layer-id', 'tip-layer');
  });

  test('hideLayer trigger removes the layer overlay', async ({ page }) => {
    await goToShowcase(page);
    await page.locator('[data-object-id="showcase-tip-btn"]').click();
    await expect(page.locator('[data-object-id="tip-text"]')).toBeVisible();
    await page.locator('[data-object-id="tip-hide"]').click();
    await expect(page.locator('[data-object-id="tip-text"]')).toHaveCount(0);
  });

  test('navigating away and back resets layer visibility', async ({ page }) => {
    await goToShowcase(page);
    await page.locator('[data-object-id="showcase-tip-btn"]').click();
    await expect(page.locator('[data-object-id="tip-text"]')).toBeVisible();
    // Use keyboard navigation — the modal-style tip layer intentionally
    // blocks clicks on base-slide objects while it's open.
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-slide-id="q1-mc"]')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('[data-slide-id="showcase"]')).toBeVisible();
    await expect(page.locator('[data-object-id="tip-text"]')).toHaveCount(0);
  });
});

async function gotoQuizSlide(page: Page, target: string): Promise<void> {
  await bootCourse(page);
  await page.locator('[data-object-id="welcome-cta"]').click();
  await page.locator('[data-object-id="greeting-next"]').click();
  await page.locator('[data-object-id="showcase-next"]').click();
  await expect(page.locator('[data-slide-id="q1-mc"]')).toBeVisible();
  while (target !== 'q1-mc') {
    const current = await page.evaluate(() => {
      const el = document.querySelector('[data-slide-id]');
      return el?.getAttribute('data-slide-id') ?? null;
    });
    if (current === target) break;
    const nextBtn = page.locator(`[data-slide-id="${current}"] button[data-object-id$="-next"]`).first();
    await nextBtn.click();
    await page.waitForFunction(
      (prev) => document.querySelector('[data-slide-id]')?.getAttribute('data-slide-id') !== prev,
      current
    );
  }
}

test.describe('Demo course — quiz interactions', () => {
  test('multiple_choice question renders radios inside a fieldset', async ({ page }) => {
    await gotoQuizSlide(page, 'q1-mc');
    const q = page.locator('[data-object-id="q1-q"]');
    await expect(q.locator('fieldset legend')).toContainText('Pathfinder Studio compile for LMS delivery');
    await expect(q.locator('input[type="radio"]')).toHaveCount(3);
  });

  test('true_false and fill_blank render in a grouped fieldset', async ({ page }) => {
    await gotoQuizSlide(page, 'q2-tf-fill');
    const tf = page.locator('[data-object-id="q2-tf"]');
    await expect(tf.locator('input[type="radio"]')).toHaveCount(2);
    const fill = page.locator('[data-object-id="q2-fill"]');
    await expect(fill.locator('input[type="text"]')).toHaveCount(1);
  });

  test('multiple_response renders checkboxes, numeric renders a text input', async ({ page }) => {
    await gotoQuizSlide(page, 'q3-mr-num');
    await expect(page.locator('[data-object-id="q3-mr"] input[type="checkbox"]')).toHaveCount(4);
    await expect(page.locator('[data-object-id="q3-num"] input[type="text"]')).toHaveCount(1);
  });

  test('matching renders a <select> per item, sequencing renders reorder buttons', async ({ page }) => {
    await gotoQuizSlide(page, 'q4-match-seq');
    await expect(page.locator('[data-object-id="q4-match"] select')).toHaveCount(3);
    await expect(page.locator('[data-object-id="q4-seq"] [data-seq-item]')).toHaveCount(4);
  });

  test('answering every question correctly and submitting scores 100%', async ({ page }) => {
    await gotoQuizSlide(page, 'q1-mc');

    // q1: multiple choice — option mc-b is correct
    await page.locator('#pf-q-mc-mc-b').check();
    await page.locator('[data-object-id="q1-next"]').click();

    // q2: true_false + fill_blank
    await page.locator('#pf-q-tf-tf-t').check();
    await page.locator('[data-object-id="q2-fill"] input[type="text"]').fill('html5');
    await page.locator('[data-object-id="q2-next"]').click();

    // q3: multi-response + numeric
    await page.locator('#pf-q-mr-mr-a').check();
    await page.locator('#pf-q-mr-mr-c').check();
    await page.locator('#pf-q-mr-mr-d').check();
    await page.locator('[data-object-id="q3-num"] input[type="text"]').fill('8');
    await page.locator('[data-object-id="q3-next"]').click();

    // q4: matching + sequencing (defaults for sequencing already match; set matches explicitly)
    await page.locator('[data-object-id="q4-match"] select[data-item-id="mt-a"]').selectOption('tgt-overlay');
    await page.locator('[data-object-id="q4-match"] select[data-item-id="mt-b"]').selectOption('tgt-state');
    await page.locator('[data-object-id="q4-match"] select[data-item-id="mt-c"]').selectOption('tgt-actions');

    // Capture the quizcomplete event before submitting
    const scorePromise = page.evaluate(
      () =>
        new Promise<{ raw: number; possible: number; percent: number; passed: boolean }>((resolve) => {
          const rt = (window as unknown as {
            runtime: { on: (evt: string, cb: (score: unknown) => void) => void };
          }).runtime;
          rt.on('quizcomplete', (score) => resolve(score as never));
        })
    );

    await page.locator('[data-object-id="q4-submit"]').click();
    const score = await scorePromise;
    expect(score.percent).toBe(100);
    expect(score.passed).toBe(true);
    await expect(page.locator('[data-slide-id="results"]')).toBeVisible();
  });

  test('sequencing buttons reorder items and affect the submitted answer', async ({ page }) => {
    await gotoQuizSlide(page, 'q4-match-seq');
    const seq = page.locator('[data-object-id="q4-seq"]');
    const itemsBefore = await seq.locator('[data-seq-item]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-seq-item'))
    );
    expect(itemsBefore).toEqual(['sq-a', 'sq-b', 'sq-c', 'sq-d']);
    await seq.locator('[data-seq-item="sq-b"] button[data-action="down"]').click();
    const itemsAfter = await seq.locator('[data-seq-item]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-seq-item'))
    );
    expect(itemsAfter).toEqual(['sq-a', 'sq-c', 'sq-b', 'sq-d']);
  });

  test('fill_blank wrong answer + no other selections scores below passing', async ({ page }) => {
    await gotoQuizSlide(page, 'q1-mc');
    // Pick a wrong answer, leave everything else blank.
    await page.locator('#pf-q-mc-mc-a').check();
    await page.locator('[data-object-id="q1-next"]').click();
    await page.locator('#pf-q-tf-tf-f').check();
    await page.locator('[data-object-id="q2-fill"] input[type="text"]').fill('pdf');
    await page.locator('[data-object-id="q2-next"]').click();
    await page.locator('[data-object-id="q3-next"]').click();
    const scorePromise = page.evaluate(
      () =>
        new Promise<{ percent: number; passed: boolean }>((resolve) => {
          const rt = (window as unknown as {
            runtime: { on: (evt: string, cb: (score: unknown) => void) => void };
          }).runtime;
          rt.on('quizcomplete', (score) => resolve(score as never));
        })
    );
    await page.locator('[data-object-id="q4-submit"]').click();
    const score = await scorePromise;
    expect(score.passed).toBe(false);
    await expect(page.locator('[data-object-id="results-fail"]')).toBeVisible();
    await expect(page.locator('[data-object-id="results-pass"]')).toHaveCount(0);
  });

  test('score-conditional text reveals pass message after a passing submit', async ({ page }) => {
    await gotoQuizSlide(page, 'q1-mc');
    // Answer every question correctly — same flow as above, condensed.
    await page.locator('#pf-q-mc-mc-b').check();
    await page.locator('[data-object-id="q1-next"]').click();
    await page.locator('#pf-q-tf-tf-t').check();
    await page.locator('[data-object-id="q2-fill"] input[type="text"]').fill('html5');
    await page.locator('[data-object-id="q2-next"]').click();
    await page.locator('#pf-q-mr-mr-a').check();
    await page.locator('#pf-q-mr-mr-c').check();
    await page.locator('#pf-q-mr-mr-d').check();
    await page.locator('[data-object-id="q3-num"] input[type="text"]').fill('8');
    await page.locator('[data-object-id="q3-next"]').click();
    await page.locator('[data-object-id="q4-match"] select[data-item-id="mt-a"]').selectOption('tgt-overlay');
    await page.locator('[data-object-id="q4-match"] select[data-item-id="mt-b"]').selectOption('tgt-state');
    await page.locator('[data-object-id="q4-match"] select[data-item-id="mt-c"]').selectOption('tgt-actions');
    await page.locator('[data-object-id="q4-submit"]').click();

    await expect(page.locator('[data-object-id="results-pass"]')).toBeVisible();
    await expect(page.locator('[data-object-id="results-pass"]')).toContainText('You passed');
    await expect(page.locator('[data-object-id="results-fail"]')).toHaveCount(0);
  });
});

test.describe('Demo course — visual regression', () => {
  test('welcome slide matches baseline', async ({ page }) => {
    await bootCourse(page);
    await expect(page.locator('[data-slide-id="welcome"]')).toHaveScreenshot('welcome.png');
  });

  test('greeting slide (after name confirmed) matches baseline', async ({ page }) => {
    await bootCourse(page);
    await page.locator('[data-object-id="welcome-cta"]').click();
    await page.locator('[data-object-id="greeting-setname"]').click();
    await expect(page.locator('[data-slide-id="greeting"]')).toHaveScreenshot('greeting-named.png');
  });

  test('showcase slide with tip layer visible matches baseline', async ({ page }) => {
    await goToShowcase(page);
    await page.locator('[data-object-id="showcase-tip-btn"]').click();
    await expect(page.locator('[data-slide-id="showcase"]')).toHaveScreenshot('showcase-with-tip.png');
  });

  test('quiz slide — multiple choice matches baseline', async ({ page }) => {
    await gotoQuizSlide(page, 'q1-mc');
    await expect(page.locator('[data-slide-id="q1-mc"]')).toHaveScreenshot('q1-mc.png');
  });

  test('results slide (passing) matches baseline', async ({ page }) => {
    await gotoQuizSlide(page, 'q1-mc');
    await page.locator('#pf-q-mc-mc-b').check();
    await page.locator('[data-object-id="q1-next"]').click();
    await page.locator('#pf-q-tf-tf-t').check();
    await page.locator('[data-object-id="q2-fill"] input[type="text"]').fill('html5');
    await page.locator('[data-object-id="q2-next"]').click();
    await page.locator('#pf-q-mr-mr-a').check();
    await page.locator('#pf-q-mr-mr-c').check();
    await page.locator('#pf-q-mr-mr-d').check();
    await page.locator('[data-object-id="q3-num"] input[type="text"]').fill('8');
    await page.locator('[data-object-id="q3-next"]').click();
    await page.locator('[data-object-id="q4-match"] select[data-item-id="mt-a"]').selectOption('tgt-overlay');
    await page.locator('[data-object-id="q4-match"] select[data-item-id="mt-b"]').selectOption('tgt-state');
    await page.locator('[data-object-id="q4-match"] select[data-item-id="mt-c"]').selectOption('tgt-actions');
    await page.locator('[data-object-id="q4-submit"]').click();
    await expect(page.locator('[data-slide-id="results"]')).toHaveScreenshot('results-passed.png');
  });
});
