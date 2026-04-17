import { describe, it, expect } from 'vitest';
import { QuizController } from '../../src/runtime/quiz-controller.js';
import { VariableStore } from '../../src/runtime/variable-store.js';
import type { RuntimeQuiz, RuntimeQuestion } from '../../src/runtime/types.js';

function makeQuiz(questions: RuntimeQuestion[], overrides?: Partial<RuntimeQuiz>): RuntimeQuiz {
  return {
    id: 'quiz-1',
    passingScore: 50,
    attemptsAllowed: 99,
    allowReview: true,
    questions,
    ...overrides,
  };
}

function scoreOne(question: RuntimeQuestion, response: string): boolean {
  const quiz = makeQuiz([question]);
  const ctrl = new QuizController(quiz, new VariableStore());
  const attempt = ctrl.startAttempt()!;
  ctrl.recordAnswer(attempt.id, question.id, response);
  const score = ctrl.submitAttempt(attempt.id)!;
  return score.questionsCorrect === 1;
}

describe('QuizController — hotspot scoring', () => {
  it('correct region click → correct', () => {
    const q: RuntimeQuestion = {
      id: 'q1', type: 'hotspot', text: 'Click correct region', points: 1,
      hotspotRegions: [
        { regionId: 'region-a', isCorrect: true },
        { regionId: 'region-b', isCorrect: false },
      ],
    };
    expect(scoreOne(q, 'region-a')).toBe(true);
  });

  it('wrong region click → incorrect', () => {
    const q: RuntimeQuestion = {
      id: 'q1', type: 'hotspot', text: 'Click correct region', points: 1,
      hotspotRegions: [
        { regionId: 'region-a', isCorrect: true },
        { regionId: 'region-b', isCorrect: false },
      ],
    };
    expect(scoreOne(q, 'region-b')).toBe(false);
  });

  it('nonexistent region → incorrect', () => {
    const q: RuntimeQuestion = {
      id: 'q1', type: 'hotspot', text: 'Click', points: 1,
      hotspotRegions: [{ regionId: 'region-a', isCorrect: true }],
    };
    expect(scoreOne(q, 'no-such')).toBe(false);
  });
});

describe('QuizController — drag_drop scoring', () => {
  it('all correct placements → correct', () => {
    const q: RuntimeQuestion = {
      id: 'q1', type: 'drag_drop', text: 'Drag items', points: 1,
      matchTargets: [
        { itemId: 'a', targetId: 'zone-1' },
        { itemId: 'b', targetId: 'zone-2' },
      ],
    };
    // Encode as JSON since runtime controller uses string responses
    expect(scoreOne(q, JSON.stringify({ a: 'zone-1', b: 'zone-2' }))).toBe(true);
  });

  it('one wrong placement → incorrect', () => {
    const q: RuntimeQuestion = {
      id: 'q1', type: 'drag_drop', text: 'Drag items', points: 1,
      matchTargets: [
        { itemId: 'a', targetId: 'zone-1' },
        { itemId: 'b', targetId: 'zone-2' },
      ],
    };
    expect(scoreOne(q, JSON.stringify({ a: 'zone-1', b: 'wrong' }))).toBe(false);
  });
});

describe('QuizController — matching scoring', () => {
  it('all pairs correct → correct', () => {
    const q: RuntimeQuestion = {
      id: 'q1', type: 'matching', text: 'Match', points: 1,
      matchTargets: [
        { itemId: 'apple', targetId: 'fruit' },
        { itemId: 'carrot', targetId: 'vegetable' },
      ],
    };
    expect(scoreOne(q, JSON.stringify({ apple: 'fruit', carrot: 'vegetable' }))).toBe(true);
  });

  it('one wrong pair → incorrect', () => {
    const q: RuntimeQuestion = {
      id: 'q1', type: 'matching', text: 'Match', points: 1,
      matchTargets: [
        { itemId: 'apple', targetId: 'fruit' },
        { itemId: 'carrot', targetId: 'vegetable' },
      ],
    };
    expect(scoreOne(q, JSON.stringify({ apple: 'fruit', carrot: 'meat' }))).toBe(false);
  });
});

describe('QuizController — sequencing scoring', () => {
  it('correct order → correct', () => {
    const q: RuntimeQuestion = {
      id: 'q1', type: 'sequencing', text: 'Order these', points: 1,
      correctSequence: ['a', 'b', 'c'],
    };
    expect(scoreOne(q, JSON.stringify(['a', 'b', 'c']))).toBe(true);
  });

  it('wrong order → incorrect', () => {
    const q: RuntimeQuestion = {
      id: 'q1', type: 'sequencing', text: 'Order these', points: 1,
      correctSequence: ['a', 'b', 'c'],
    };
    expect(scoreOne(q, JSON.stringify(['a', 'c', 'b']))).toBe(false);
  });
});
