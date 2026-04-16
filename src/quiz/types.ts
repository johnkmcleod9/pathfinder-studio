/**
 * Quiz Types — question types, scoring, and quiz configuration.
 *
 * Question types:
 * - multiple_choice: Single correct answer from options
 * - multiple_response: Multiple correct answers (partial credit)
 * - true_false: Boolean correct/incorrect
 * - fill_blank: Text answer with wildcard matching
 * - numeric: Number with range tolerance
 * - matching: Pair matching (drag items to targets)
 * - sequencing: Ordered items
 * - hotspot: Click on region of an image
 * - drag_drop: Drag items to zones
 */

// ─── Question Types ─────────────────────────────────────────────────────────────

export type QuestionType =
  | 'multiple_choice'
  | 'multiple_response'
  | 'true_false'
  | 'fill_blank'
  | 'numeric'
  | 'matching'
  | 'sequencing'
  | 'hotspot'
  | 'drag_drop';

// ─── Answer Options ───────────────────────────────────────────────────────────

export interface AnswerOption {
  id: string;
  text: string;
  isCorrect?: boolean;   // MC / multiple_response
  matchId?: string;    // matching
  orderIndex?: number;  // sequencing
  regionId?: string;   // hotspot
  dropZoneId?: string; // drag_drop
  feedback?: string;
  feedbackIncorrect?: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;                    // Question stem (may contain %var% placeholders)
  points: number;                 // Max points for this question
  attemptsAllowed?: number;        // 0 = unlimited (default: 0)
  options?: AnswerOption[];       // MC, multiple_response, matching, sequencing, hotspot, drag_drop
  correctAnswer?: string;          // fill_blank (text), true_false (true/false)
  correctRange?: NumericRange;    // numeric
  correctSequence?: string[];      // sequencing (ordered option IDs)
  pairs?: MatchingPair[];         // matching
  wildcard?: boolean;             // fill_blank: allow wildcard matching
  caseSensitive?: boolean;         // fill_blank: case-sensitive matching
  partialCredit?: boolean;         // multiple_response: allow partial credit
  required?: boolean;              // Must be answered
  feedbackCorrect?: string;
  feedbackIncorrect?: string;
}

export interface NumericRange {
  min: number;
  max: number;
  tolerance?: number;  // Allow ±tolerance
}

export interface MatchingPair {
  itemId: string;
  targetId: string;
}

// ─── Quiz Config ─────────────────────────────────────────────────────────────

export interface QuizConfig {
  id: string;
  title: string;
  passingScore: number;        // 0-100 percentage
  passingScoreRaw?: number;    // Alternative: raw point threshold
  attemptsAllowed: number;     // 0 = unlimited
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  showCorrectAnswers: boolean;  // Show correct answers after submission
  allowReview: boolean;
  questions: Question[];
}

export type QuizStatus = 'not_started' | 'in_progress' | 'completed' | 'passed' | 'failed';

// ─── Score ───────────────────────────────────────────────────────────────────

export interface QuestionResult {
  questionId: string;
  pointsAwarded: number;
  pointsPossible: number;
  correct: boolean;
  answered: boolean;
  attemptCount: number;
  feedback?: string;
}

export interface QuizScore {
  raw: number;           // Total raw points
  percent: number;       // 0-100 rounded to 1 decimal
  pointsAwarded: number;
  pointsPossible: number;
  questionsCorrect: number;
  questionsTotal: number;
  passed: boolean;
  status: QuizStatus;
}

export interface QuizAttempt {
  id: string;
  startedAt: string;
  completedAt?: string;
  answers: Record<string, unknown>;  // questionId → answer value
  results: QuestionResult[];
  score: QuizScore;
}

// ─── Suspend Data (LMS persistence) ─────────────────────────────────────────

export interface QuizSuspendData {
  quizId: string;
  attemptId: string;
  answers: Record<string, unknown>;
  questionResults: QuestionResult[];
  attemptCount: number;
  startedAt: string;
  completedAt?: string;
}
