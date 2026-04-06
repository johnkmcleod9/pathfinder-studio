/**
 * Quiz Engine — manages quiz lifecycle, scoring, and state.
 *
 * Handles:
 * - Starting/completing quiz attempts
 * - Score calculation (rounded to 1 decimal)
 * - Pass/fail routing
 * - Attempt limit enforcement
 * - LMS suspend_data serialization
 */

import { randomUUID } from 'crypto';
import type {
  QuizConfig,
  QuizScore,
  QuizAttempt,
  QuizSuspendData,
  QuestionResult,
  Question,
} from './types.js';
import { evaluateQuestion } from './questions.js';

export interface QuizEngineOptions {
  /** Called when quiz is completed — for triggering navigation */
  onComplete?: (result: QuizCompletion) => void;
}

export interface QuizCompletion {
  score: QuizScore;
  routingAction: 'pass' | 'fail' | 'completed';
  passTarget?: string;   // Slide ID to jump to on pass
  failTarget?: string;   // Slide ID to jump to on fail
}

export class QuizEngine {
  private config: QuizConfig;
  private attempts: Map<string, QuizAttempt> = new Map();
  private currentAttemptId: string | null = null;
  private options: QuizEngineOptions;

  constructor(config: QuizConfig, options: QuizEngineOptions = {}) {
    this.config = config;
    this.options = options;
  }

  // ─── Attempt Lifecycle ───────────────────────────────────────────────────

  /**
   * Start a new quiz attempt.
   * Returns the attempt ID, or null if attempts are exhausted.
   */
  startAttempt(): { attemptId: string; attemptNumber: number } | null {
    const usedAttempts = this.attemptCount();

    if (this.config.attemptsAllowed > 0 && usedAttempts >= this.config.attemptsAllowed) {
      return null; // Attempts exhausted
    }

    const attemptId = randomUUID();
    const attemptNumber = usedAttempts + 1;

    const attempt: QuizAttempt = {
      id: attemptId,
      startedAt: new Date().toISOString(),
      answers: {},
      results: [],
      score: this.blankScore(),
    };

    this.attempts.set(attemptId, attempt);
    this.currentAttemptId = attemptId;

    return { attemptId, attemptNumber };
  }

  /**
   * Submit an answer for a specific question.
   * Returns the question result (points awarded, correct, feedback).
   */
  submitAnswer(
    questionId: string,
    answer: unknown
  ): QuestionResult | null {
    const attempt = this.currentAttempt();
    if (!attempt) return null;

    const question = this.config.questions.find(q => q.id === questionId);
    if (!question) return null;

    // Get current attempt count for this question
    const previousAttempts = this.attemptResults(attempt.id, questionId).length;

    const result = evaluateQuestion(question, answer, previousAttempts);
    attempt.answers[questionId] = answer;
    attempt.results.push(result);

    return result;
  }

  /**
   * Complete the current quiz attempt and return the final score.
   */
  completeAttempt(): QuizScore | null {
    const attempt = this.currentAttempt();
    if (!attempt) return null;

    const score = this.calculateScore(attempt.results, this.config.questions.length);

    attempt.score = score;
    attempt.completedAt = new Date().toISOString();

    const completion: QuizCompletion = {
      score,
      routingAction: score.passed ? 'pass' : (score.status === 'failed' ? 'fail' : 'completed'),
    };
    this.options.onComplete?.(completion);

    this.currentAttemptId = null;
    return score;
  }

  /**
   * Reset the quiz (clear all attempts).
   */
  reset(): void {
    this.attempts.clear();
    this.currentAttemptId = null;
  }

  // ─── Score Calculation ───────────────────────────────────────────────────

  /**
   * Calculate the final score from all question results.
   */
  calculateScore(results: QuestionResult[], totalQuestions?: number): QuizScore {
    const pointsAwarded = results.reduce((sum, r) => sum + r.pointsAwarded, 0);
    const pointsPossible = results.reduce((sum, r) => sum + r.pointsPossible, 0);
    const questionsCorrect = results.filter(r => r.correct).length;
    const questionsTotal = totalQuestions ?? results.length;

    const percent = pointsPossible > 0
      ? Math.round((pointsAwarded / pointsPossible) * 1000) / 10  // 1 decimal
      : 0;

    const passed = percent >= this.config.passingScore;

    let status: QuizScore['status'] = 'in_progress';
    if (percent >= this.config.passingScore) status = 'passed';
    else if (percent < this.config.passingScore) status = 'failed';

    return {
      raw: pointsAwarded,
      percent,
      pointsAwarded,
      pointsPossible,
      questionsCorrect,
      questionsTotal,
      passed,
      status,
    };
  }

  private blankScore(): QuizScore {
    return {
      raw: 0,
      percent: 0,
      pointsAwarded: 0,
      pointsPossible: 0,
      questionsCorrect: 0,
      questionsTotal: this.config.questions.length,
      passed: false,
      status: 'not_started',
    };
  }

  // ─── Attempt Tracking ───────────────────────────────────────────────────

  /** Number of attempts used so far. */
  attemptCount(): number {
    return this.attempts.size;
  }

  /** Remaining attempts (null = unlimited). */
  attemptsRemaining(): number | null {
    if (this.config.attemptsAllowed === 0) return null;
    return Math.max(0, this.config.attemptsAllowed - this.attempts.size);
  }

  /** Get results for a specific question within an attempt. */
  attemptResults(attemptId: string, questionId: string): QuestionResult[] {
    const attempt = this.attempts.get(attemptId);
    if (!attempt) return [];
    return attempt.results.filter(r => r.questionId === questionId);
  }

  /** Get the current active attempt. */
  private currentAttempt(): QuizAttempt | null {
    if (!this.currentAttemptId) return null;
    return this.attempts.get(this.currentAttemptId) ?? null;
  }

  /** Get all attempts. */
  getAttempts(): QuizAttempt[] {
    return [...this.attempts.values()];
  }

  /** Get the most recent completed attempt. */
  mostRecentCompleted(): QuizAttempt | null {
    let latest: QuizAttempt | null = null;
    for (const attempt of this.attempts.values()) {
      if (attempt.completedAt) {
        if (!latest || attempt.completedAt > latest.completedAt) {
          latest = attempt;
        }
      }
    }
    return latest;
  }

  // ─── Suspend Data (LMS persistence) ─────────────────────────────────────

  /**
   * Export current state as a serializable object for LMS suspend_data.
   */
  exportSuspendData(): string | null {
    const attempt = this.currentAttempt();
    if (!attempt) return null;

    const data: QuizSuspendData = {
      quizId: this.config.id,
      attemptId: attempt.id,
      answers: attempt.answers,
      questionResults: attempt.results,
      attemptCount: this.attemptCount(),
      startedAt: attempt.startedAt,
    };

    return JSON.stringify(data);
  }

  /**
   * Restore state from LMS suspend_data.
   * Must be called before startAttempt() to resume.
   */
  importSuspendData(json: string): boolean {
    try {
      const data = JSON.parse(json) as QuizSuspendData;
      if (data.quizId !== this.config.id) return false;

      const attempt: QuizAttempt = {
        id: data.attemptId,
        startedAt: data.startedAt,
        answers: data.answers,
        results: data.questionResults,
        score: this.calculateScore(data.questionResults),
      };

      this.attempts.set(attempt.id, attempt);
      this.currentAttemptId = attempt.id;

      return true;
    } catch {
      return false;
    }
  }

  // ─── Quiz Config ────────────────────────────────────────────────────────

  getConfig(): QuizConfig {
    return this.config;
  }

  /** Update config (e.g., after authoring changes). */
  updateConfig(config: QuizConfig): void {
    this.config = config;
  }
}
