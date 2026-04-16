import type { RuntimeQuiz, RuntimeQuestion, QuizAttempt, QuizScore } from './types.js';
import { VariableStore } from './variable-store.js';

/**
 * Quiz state machine — manages attempts, answers, scoring.
 */
export class QuizController {
  private attempts = new Map<string, QuizAttempt>();
  private attemptCount = 0;

  constructor(
    private quiz: RuntimeQuiz,
    private variables: VariableStore
  ) {}

  startAttempt(): QuizAttempt | null {
    if (this.attemptCount >= this.quiz.attemptsAllowed) return null;
    const id = crypto.randomUUID?.() ?? `attempt-${Date.now()}-${Math.random().toString(36)}`;
    const attempt: QuizAttempt = {
      id,
      state: 'in_progress',
      answers: {},
      startTime: Date.now(),
    };
    this.attempts.set(id, attempt);
    this.attemptCount++;
    return attempt;
  }

  recordAnswer(attemptId: string, questionId: string, response: string): void {
    const attempt = this.attempts.get(attemptId);
    if (!attempt || attempt.state !== 'in_progress') return;
    attempt.answers[questionId] = response;
  }

  submitAttempt(attemptId: string): QuizScore | null {
    const attempt = this.attempts.get(attemptId);
    if (!attempt || attempt.state !== 'in_progress') return null;
    attempt.state = 'submitted';
    attempt.submittedAt = Date.now();
    return this.calculateScore(attempt);
  }

  private calculateScore(attempt: QuizAttempt): QuizScore {
    let pointsAwarded = 0;
    let pointsPossible = 0;
    let questionsCorrect = 0;

    for (const question of this.quiz.questions) {
      pointsPossible += question.points;
      const response = attempt.answers[question.id];
      if (response === undefined) continue;

      const isCorrect = this.isAnswerCorrect(question, response);
      if (isCorrect) {
        pointsAwarded += question.points;
        questionsCorrect++;
      }
    }

    const percent = pointsPossible > 0
      ? Math.round((pointsAwarded / pointsPossible) * 1000) / 10
      : 0;
    const status: QuizScore['status'] =
      percent >= this.quiz.passingScore ? 'passed' : 'failed';

    return {
      percent,
      status,
      raw: pointsAwarded,
      possible: pointsPossible,
      questionsCorrect,
      questionsTotal: this.quiz.questions.length,
    };
  }

  private isAnswerCorrect(question: RuntimeQuestion, response: string): boolean {
    switch (question.type) {
      case 'multiple_choice':
      case 'true_false': {
        const correct = question.options?.find(o => o.isCorrect);
        return correct?.id === response;
      }

      case 'multiple_response': {
        const correctIds = new Set(
          question.options?.filter(o => o.isCorrect).map(o => o.id) ?? []
        );
        return correctIds.has(response);
      }

      case 'fill_blank': {
        const answer = (question.correctAnswer as string | undefined)?.trim().toLowerCase();
        const userAnswer = response.trim().toLowerCase();
        if (!answer) return false;
        if (question.caseSensitive) return response.trim() === (question.correctAnswer as string);
        if (question.wildcard) {
          // Glob-style matching
          const regex = new RegExp(`^${answer.replace(/\*/g, '.*')}$`, question.caseSensitive ? '' : 'i');
          return regex.test(userAnswer);
        }
        return userAnswer === answer;
      }

      case 'numeric': {
        const num = parseFloat(response);
        const correct = parseFloat(question.correctAnswer as string);
        const tolerance = question.tolerance ?? 0;
        return Math.abs(num - correct) <= tolerance;
      }

      case 'hotspot': {
        const regions = question.hotspotRegions ?? [];
        return regions.some(r => r.regionId === response && r.isCorrect);
      }

      case 'matching':
      case 'drag_drop': {
        const targets = question.matchTargets ?? [];
        if (targets.length === 0) return false;
        try {
          const placements = JSON.parse(response) as Record<string, string>;
          return targets.every(t => placements[t.itemId] === t.targetId);
        } catch {
          return false;
        }
      }

      case 'sequencing': {
        const expected = question.correctSequence ?? [];
        if (expected.length === 0) return false;
        try {
          const actual = JSON.parse(response) as string[];
          return expected.length === actual.length &&
            expected.every((id, i) => id === actual[i]);
        } catch {
          return false;
        }
      }

      default:
        return false;
    }
  }

  getAttemptResults(attemptId: string): (QuizScore & { attempt: QuizAttempt; answers: Record<string, string> }) | null {
    const attempt = this.attempts.get(attemptId);
    if (!attempt) return null;
    const score = this.calculateScore(attempt);
    return { ...score, attempt, answers: attempt.answers };
  }

  getCurrentAttempt(): QuizAttempt | null {
    for (const attempt of this.attempts.values()) {
      if (attempt.state === 'in_progress') return attempt;
    }
    return null;
  }

  getAttemptCount(): number { return this.attemptCount; }

  getAttemptsAllowed(): number { return this.quiz.attemptsAllowed; }

  serializeState(): { attempts: Record<string, QuizAttempt> } {
    return { attempts: Object.fromEntries(this.attempts) };
  }

  restoreState(state: { attempts: Record<string, QuizAttempt> }): void {
    this.attempts = new Map(Object.entries(state.attempts));
    this.attemptCount = this.attempts.size;
  }

  getQuiz(): RuntimeQuiz { return this.quiz; }
}
