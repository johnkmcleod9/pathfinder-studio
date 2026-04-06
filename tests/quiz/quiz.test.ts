import { describe, it, expect, beforeEach } from 'vitest';
import { QuizEngine } from '../../src/quiz/engine.js';
import { evaluateQuestion, evaluateMultipleChoice, evaluateMultipleResponse, evaluateTrueFalse, evaluateFillBlank, evaluateNumeric, evaluateMatching, evaluateSequencing } from '../../src/quiz/questions.js';
import type { QuizConfig, Question, QuestionResult } from '../../src/quiz/types.js';

const BASE_QUIZ: QuizConfig = {
  id: 'quiz-001',
  title: 'Test Quiz',
  passingScore: 70,
  attemptsAllowed: 3,
  randomizeQuestions: false,
  randomizeOptions: false,
  showCorrectAnswers: true,
  allowReview: true,
  questions: [],
};

function makeQuiz(overrides: Partial<QuizConfig> = {}): QuizEngine {
  return new QuizEngine({ ...BASE_QUIZ, ...overrides });
}

describe('Quiz Engine', () => {
  describe('Start/complete flow', () => {
    it('startAttempt returns attempt ID and number', () => {
      const quiz = makeQuiz({ questions: [] });
      const result = quiz.startAttempt();
      expect(result).not.toBeNull();
      expect(result!.attemptNumber).toBe(1);
    });

    it('startAttempt returns null when attempts exhausted', () => {
      const quiz = makeQuiz({ attemptsAllowed: 1, questions: [] });
      quiz.startAttempt();
      const result = quiz.startAttempt();
      expect(result).toBeNull();
    });

    it('completeAttempt returns score', () => {
      const q: Question = { id:'q1', type:'true_false', text:'Q', points:10, correctAnswer:'true', options:[] };
      const quiz = makeQuiz({ questions: [q] });
      quiz.startAttempt();
      const score = quiz.completeAttempt();
      expect(score).not.toBeNull();
      expect(score!.percent).toBe(0);  // No answers submitted
      expect(score!.status).toBe('failed');  // 0% < passingScore 70%
      expect(score!.questionsTotal).toBe(1);
    });

    it('reset clears all attempts', () => {
      const quiz = makeQuiz({ questions: [] });
      quiz.startAttempt();
      quiz.reset();
      expect(quiz.attemptCount()).toBe(0);
    });

    it('attemptCount returns number of attempts used', () => {
      const quiz = makeQuiz({ questions: [] });
      expect(quiz.attemptCount()).toBe(0);
      quiz.startAttempt();
      expect(quiz.attemptCount()).toBe(1);
    });

    it('attemptsRemaining returns null for unlimited', () => {
      const quiz = makeQuiz({ attemptsAllowed: 0, questions: [] });
      expect(quiz.attemptsRemaining()).toBeNull();
    });

    it('attemptsRemaining returns correct count', () => {
      const quiz = makeQuiz({ attemptsAllowed: 3, questions: [] });
      expect(quiz.attemptsRemaining()).toBe(3);
      quiz.startAttempt();
      expect(quiz.attemptsRemaining()).toBe(2);
    });
  });

  describe('Score calculation', () => {
    it('score is rounded to 1 decimal place', () => {
      const q1: Question = { id: 'q1', type: 'multiple_choice', text: 'Q1', points: 3, options: [{ id: 'a', text: 'A', isCorrect: true }, { id: 'b', text: 'B' }] };
      const q2: Question = { id: 'q2', type: 'multiple_choice', text: 'Q2', points: 7, options: [{ id: 'a', text: 'A', isCorrect: true }, { id: 'b', text: 'B' }] };
      const quiz = makeQuiz({ questions: [q1, q2] });
      quiz.startAttempt();
      quiz.submitAnswer('q1', 'a');
      quiz.submitAnswer('q2', 'b'); // wrong
      const score = quiz.completeAttempt();
      expect(score!.percent).toBe(30); // 3/10 = 30%
      expect(score!.questionsCorrect).toBe(1);
      expect(score!.questionsTotal).toBe(2);
    });

    it('score is 0 for empty quiz', () => {
      const quiz = makeQuiz({ questions: [] });
      quiz.startAttempt();
      const score = quiz.completeAttempt();
      expect(score!.percent).toBe(0);
      expect(score!.passed).toBe(false);
    });
  });

  describe('Pass/fail routing', () => {
    it('passed when score >= passingScore', () => {
      const q: Question = { id: 'q1', type: 'true_false', text: 'Q', points: 10, correctAnswer: 'true', options: [{ id: 't', text: 'True', isCorrect: true }, { id: 'f', text: 'False' }] };
      const quiz = makeQuiz({ questions: [q], passingScore: 70 });
      quiz.startAttempt();
      quiz.submitAnswer('q1', 'true');
      const score = quiz.completeAttempt();
      expect(score!.passed).toBe(true);
      expect(score!.status).toBe('passed');
    });

    it('failed when score < passingScore', () => {
      const q: Question = { id: 'q1', type: 'true_false', text: 'Q', points: 10, correctAnswer: 'true', options: [{ id: 't', text: 'True', isCorrect: true }, { id: 'f', text: 'False' }] };
      const quiz = makeQuiz({ questions: [q], passingScore: 70 });
      quiz.startAttempt();
      quiz.submitAnswer('q1', 'false'); // wrong
      const score = quiz.completeAttempt();
      expect(score!.passed).toBe(false);
      expect(score!.status).toBe('failed');
    });
  });

  describe('Attempt limit enforcement', () => {
    it('startAttempt returns null when attempts exhausted', () => {
      const quiz = makeQuiz({ attemptsAllowed: 1, questions: [] });
      expect(quiz.startAttempt()).not.toBeNull();
      expect(quiz.startAttempt()).toBeNull();
    });

    it('submitAnswer still works for current attempt', () => {
      const q: Question = { id: 'q1', type: 'true_false', text: 'Q', points: 10, correctAnswer: 'true', options: [] };
      const quiz = makeQuiz({ questions: [q], attemptsAllowed: 1 });
      const { attemptId } = quiz.startAttempt()!;
      const result = quiz.submitAnswer('q1', 'true');
      expect(result).not.toBeNull();
      expect(result!.correct).toBe(true);
    });
  });

  describe('Suspend data', () => {
    it('exportSuspendData returns JSON string', () => {
      const quiz = makeQuiz({ questions: [] });
      quiz.startAttempt();
      const suspend = quiz.exportSuspendData();
      expect(suspend).not.toBeNull();
      expect(() => JSON.parse(suspend!)).not.toThrow();
    });

    it('importSuspendData restores attempt state', () => {
      const q: Question = { id: 'q1', type: 'true_false', text: 'Q', points: 10, correctAnswer: 'true', options: [] };
      const quiz = makeQuiz({ questions: [q] });
      quiz.startAttempt();
      quiz.submitAnswer('q1', 'true');
      const suspend = quiz.exportSuspendData()!;

      const quiz2 = makeQuiz({ questions: [q] });
      const restored = quiz2.importSuspendData(suspend);
      expect(restored).toBe(true);
      expect(quiz2.attemptCount()).toBe(1);
    });

    it('importSuspendData rejects wrong quiz ID', () => {
      const quiz = makeQuiz({ id: 'quiz-001', questions: [] });
      quiz.startAttempt();
      const suspend = quiz.exportSuspendData()!;

      const quiz2 = new QuizEngine({ ...BASE_QUIZ, id: 'quiz-002', questions: [] });
      const restored = quiz2.importSuspendData(suspend);
      expect(restored).toBe(false);
    });

    it('round-trip preserves answer state', () => {
      const q: Question = { id: 'q1', type: 'true_false', text: 'Q', points: 10, correctAnswer: 'true', options: [] };
      const quiz = makeQuiz({ questions: [q] });
      quiz.startAttempt();
      quiz.submitAnswer('q1', 'true');
      const suspend = quiz.exportSuspendData()!;

      const quiz2 = makeQuiz({ questions: [q] });
      quiz2.importSuspendData(suspend);
      quiz2.startAttempt(); // This starts a new attempt
      const score = quiz2.completeAttempt();
      // New attempt is blank so score is 0
      expect(score!.percent).toBe(0);
    });
  });

  describe('onComplete callback', () => {
    it('fires on complete with pass routing', () => {
      let completion: any = null;
      const q: Question = { id: 'q1', type: 'true_false', text: 'Q', points: 10, correctAnswer: 'true', options: [] };
      const quiz = new QuizEngine({ ...BASE_QUIZ, questions: [q], passingScore: 50 }, {
        onComplete: (r) => { completion = r; },
      });
      quiz.startAttempt();
      quiz.submitAnswer('q1', 'true');
      quiz.completeAttempt();
      expect(completion).not.toBeNull();
      expect(completion.score.passed).toBe(true);
    });
  });
});

describe('Question Evaluators', () => {
  describe('multiple_choice', () => {
    it('correct answer → correct', () => {
      const q: Question = {
        id: 'q1', type: 'multiple_choice', text: 'Q1', points: 1,
        options: [{ id: 'a', text: 'A', isCorrect: true }, { id: 'b', text: 'B' }],
      };
      expect(evaluateMultipleChoice(q, 'a').correct).toBe(true);
      expect(evaluateMultipleChoice(q, 'a').pointsAwarded).toBe(1);
    });

    it('incorrect answer → incorrect', () => {
      const q: Question = {
        id: 'q1', type: 'multiple_choice', text: 'Q1', points: 1,
        options: [{ id: 'a', text: 'A', isCorrect: true }, { id: 'b', text: 'B' }],
      };
      expect(evaluateMultipleChoice(q, 'b').correct).toBe(false);
      expect(evaluateMultipleChoice(q, 'b').pointsAwarded).toBe(0);
    });

    it('no selection → incorrect', () => {
      const q: Question = {
        id: 'q1', type: 'multiple_choice', text: 'Q1', points: 1,
        options: [{ id: 'a', text: 'A', isCorrect: true }],
      };
      expect(evaluateMultipleChoice(q, '').correct).toBe(false);
    });
  });

  describe('multiple_response', () => {
    it('all correct selected → full credit', () => {
      const q: Question = {
        id: 'q1', type: 'multiple_response', text: 'Q1', points: 2,
        options: [{ id: 'a', isCorrect: true }, { id: 'b', isCorrect: true }, { id: 'c', isCorrect: false }],
      };
      const result = evaluateMultipleResponse(q, ['a', 'b']);
      expect(result.correct).toBe(true);
      expect(result.pointsAwarded).toBe(2);
    });

    it('partial correct → partial credit', () => {
      const q: Question = {
        id: 'q1', type: 'multiple_response', text: 'Q1', points: 2,
        options: [{ id: 'a', isCorrect: true }, { id: 'b', isCorrect: true }, { id: 'c', isCorrect: false }],
        partialCredit: true,
      };
      const result = evaluateMultipleResponse(q, ['a']); // only 1 of 2 correct
      expect(result.pointsAwarded).toBe(1);
    });

    it('incorrect selected → no credit', () => {
      const q: Question = {
        id: 'q1', type: 'multiple_response', text: 'Q1', points: 2,
        options: [{ id: 'a', isCorrect: true }, { id: 'b', isCorrect: false }],
      };
      const result = evaluateMultipleResponse(q, ['b']);
      expect(result.correct).toBe(false);
      expect(result.pointsAwarded).toBe(0);
    });

    it('all-or-nothing mode rejects partial', () => {
      const q: Question = {
        id: 'q1', type: 'multiple_response', text: 'Q1', points: 2,
        options: [{ id: 'a', isCorrect: true }, { id: 'b', isCorrect: true }],
        partialCredit: false,
      };
      const result = evaluateMultipleResponse(q, ['a']); // only 1 of 2
      expect(result.correct).toBe(false);
      expect(result.pointsAwarded).toBe(0);
    });
  });

  describe('true_false', () => {
    it('true correct answer → true', () => {
      const q: Question = { id: 'q1', type: 'true_false', text: 'Q', points: 1, correctAnswer: 'true' };
      expect(evaluateTrueFalse(q, true).correct).toBe(true);
      expect(evaluateTrueFalse(q, 'true').correct).toBe(true);
    });

    it('false correct answer → false', () => {
      const q: Question = { id: 'q1', type: 'true_false', text: 'Q', points: 1, correctAnswer: 'false' };
      expect(evaluateTrueFalse(q, false).correct).toBe(true);
      expect(evaluateTrueFalse(q, 'false').correct).toBe(true);
    });

    it('wrong → incorrect', () => {
      const q: Question = { id: 'q1', type: 'true_false', text: 'Q', points: 1, correctAnswer: 'true' };
      expect(evaluateTrueFalse(q, false).correct).toBe(false);
    });
  });

  describe('fill_blank', () => {
    it('exact match → correct', () => {
      const q: Question = { id: 'q1', type: 'fill_blank', text: 'Capital of France?', points: 1, correctAnswer: 'Paris' };
      expect(evaluateFillBlank(q, 'Paris').correct).toBe(true);
    });

    it('case insensitive by default → correct', () => {
      const q: Question = { id: 'q1', type: 'fill_blank', text: 'Q', points: 1, correctAnswer: 'Paris', caseSensitive: false };
      expect(evaluateFillBlank(q, 'paris').correct).toBe(true);
    });

    it('case sensitive → incorrect', () => {
      const q: Question = { id: 'q1', type: 'fill_blank', text: 'Q', points: 1, correctAnswer: 'Paris', caseSensitive: true };
      expect(evaluateFillBlank(q, 'paris').correct).toBe(false);
    });

    it('wildcard * matches anything after text', () => {
      const q: Question = { id: 'q1', type: 'fill_blank', text: 'Q', points: 1, correctAnswer: 'New *', wildcard: true };
      const result1 = evaluateFillBlank(q, 'New York');
      expect(result1.correct).toBe(true);  // basic match
    });

    it('empty answer → incorrect', () => {
      const q: Question = { id: 'q1', type: 'fill_blank', text: 'Q', points: 1, correctAnswer: 'Paris' };
      expect(evaluateFillBlank(q, '').correct).toBe(false);
    });
  });

  describe('numeric', () => {
    it('exact answer → correct', () => {
      const q: Question = { id: 'q1', type: 'numeric', text: 'Q', points: 1, correctRange: { min: 42, max: 42 } };
      expect(evaluateNumeric(q, 42).correct).toBe(true);
    });

    it('within range → correct', () => {
      const q: Question = { id: 'q1', type: 'numeric', text: 'Q', points: 1, correctRange: { min: 40, max: 50 } };
      expect(evaluateNumeric(q, 45).correct).toBe(true);
    });

    it('outside range → incorrect', () => {
      const q: Question = { id: 'q1', type: 'numeric', text: 'Q', points: 1, correctRange: { min: 40, max: 50 } };
      expect(evaluateNumeric(q, 55).correct).toBe(false);
    });

    it('with tolerance → correct', () => {
      const q: Question = { id: 'q1', type: 'numeric', text: 'Q', points: 1, correctRange: { min: 100, max: 100, tolerance: 5 } };
      expect(evaluateNumeric(q, 103).correct).toBe(true);
      expect(evaluateNumeric(q, 107).correct).toBe(false);
    });
  });

  describe('matching', () => {
    it('all pairs correct → full credit', () => {
      const q: Question = {
        id: 'q1', type: 'matching', text: 'Q', points: 2,
        pairs: [
          { itemId: 'apple', targetId: 'fruit' },
          { itemId: 'carrot', targetId: 'vegetable' },
        ],
      };
      const result = evaluateMatching(q, { apple: 'fruit', carrot: 'vegetable' });
      expect(result.correct).toBe(true);
      expect(result.pointsAwarded).toBe(2);
    });

    it('one wrong → partial credit', () => {
      const q: Question = {
        id: 'q1', type: 'matching', text: 'Q', points: 2,
        pairs: [
          { itemId: 'apple', targetId: 'fruit' },
          { itemId: 'carrot', targetId: 'vegetable' },
        ],
      };
      const result = evaluateMatching(q, { apple: 'fruit', carrot: 'meat' });
      expect(result.correct).toBe(false);
      expect(result.pointsAwarded).toBe(1);
    });

    it('all wrong → 0', () => {
      const q: Question = {
        id: 'q1', type: 'matching', text: 'Q', points: 2,
        pairs: [{ itemId: 'a', targetId: 'x' }],
      };
      const result = evaluateMatching(q, { a: 'wrong' });
      expect(result.pointsAwarded).toBe(0);
    });
  });

  describe('sequencing', () => {
    it('correct order → correct', () => {
      const q: Question = {
        id: 'q1', type: 'sequencing', text: 'Q', points: 2,
        correctSequence: ['a', 'b', 'c'],
      };
      const result = evaluateSequencing(q, ['a', 'b', 'c']);
      expect(result.correct).toBe(true);
      expect(result.pointsAwarded).toBe(2);
    });

    it('wrong order → incorrect', () => {
      const q: Question = {
        id: 'q1', type: 'sequencing', text: 'Q', points: 2,
        correctSequence: ['a', 'b', 'c'],
      };
      const result = evaluateSequencing(q, ['a', 'c', 'b']);
      expect(result.correct).toBe(false);
      expect(result.pointsAwarded).toBe(0);
    });

    it('partial order → incorrect', () => {
      const q: Question = {
        id: 'q1', type: 'sequencing', text: 'Q', points: 2,
        correctSequence: ['a', 'b', 'c'],
      };
      const result = evaluateSequencing(q, ['a', 'b']);
      expect(result.correct).toBe(false);
    });
  });
});
