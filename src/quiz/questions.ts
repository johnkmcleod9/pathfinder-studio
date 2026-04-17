/**
 * Question Evaluators — evaluate learner answers for each question type.
 *
 * Each evaluator:
 * 1. Receives the learner's answer
 * 2. Compares against correct answer(s)
 * 3. Returns { correct, pointsAwarded, feedback }
 */

import type { Question, QuestionResult } from './types.js';

// ─── Scoring helpers ─────────────────────────────────────────────────────────

function wildcardMatch(answer: string, pattern: string, caseSensitive: boolean): boolean {
  if (!caseSensitive) {
    const lower = pattern.toLowerCase();
    const lowerAnswer = answer.toLowerCase();
    // Simple wildcard: * matches anything
    if (lower === '*') return true;
    const parts = lower.split('*').filter(Boolean);
    if (parts.length === 0) return true;
    if (parts.length === 1) return lowerAnswer.includes(parts[0]);

    // All parts must appear in order
    let pos = 0;
    for (const part of parts) {
      const idx = lowerAnswer.indexOf(part, pos);
      if (idx === -1) return false;
      pos = idx + part.length;
    }
    return true;
  }

  const parts = pattern.split('*').filter(Boolean);
  if (parts.length === 0) return true;
  if (parts.length === 1) return answer.includes(parts[0]);

  let pos = 0;
  for (const part of parts) {
    const idx = answer.indexOf(part, pos);
    if (idx === -1) return false;
    pos = idx + part.length;
  }
  return true;
}

// ─── Evaluators ─────────────────────────────────────────────────────────────

export function evaluateMultipleChoice(
  question: Question,
  selectedId: string | string[]
): { correct: boolean; pointsAwarded: number; feedback?: string } {
  const options = question.options ?? [];
  const selected = Array.isArray(selectedId) ? selectedId[0] : selectedId;
  const correctOption = options.find(o => o.isCorrect);

  if (!selected || !correctOption) return { correct: false, pointsAwarded: 0 };
  if (selected !== correctOption.id) {
    return {
      correct: false,
      pointsAwarded: 0,
      feedback: question.feedbackIncorrect ?? correctOption.feedback ?? 'Incorrect',
    };
  }

  return {
    correct: true,
    pointsAwarded: question.points,
    feedback: question.feedbackCorrect ?? correctOption.feedback,
  };
}

export function evaluateMultipleResponse(
  question: Question,
  selectedIds: string[]
): { correct: boolean; pointsAwarded: number; feedback?: string } {
  const options = question.options ?? [];
  const correctIds = new Set(options.filter(o => o.isCorrect).map(o => o.id));
  const selectedSet = new Set(selectedIds ?? []);

  if (selectedSet.size === 0) {
    return { correct: false, pointsAwarded: 0 };
  }

  // Check correctness
  const correctSelected = [...selectedSet].filter(id => correctIds.has(id)).length;
  const incorrectSelected = selectedSet.size - correctSelected;
  const totalCorrect = correctIds.size;

  if (question.partialCredit) {
    // Partial credit: (correct_selected - incorrect_selected) / total_correct
    const score = Math.max(0, (correctSelected - incorrectSelected) / totalCorrect);
    const pointsAwarded = Math.round(score * question.points * 10) / 10;
    return {
      correct: correctSelected === totalCorrect && incorrectSelected === 0,
      pointsAwarded,
      feedback: question.feedbackCorrect,
    };
  }

  // All-or-nothing
  const correct = correctSelected === totalCorrect && incorrectSelected === 0;
  return {
    correct,
    pointsAwarded: correct ? question.points : 0,
    feedback: correct ? question.feedbackCorrect : question.feedbackIncorrect,
  };
}

export function evaluateTrueFalse(
  question: Question,
  answer: string | boolean
): { correct: boolean; pointsAwarded: number; feedback?: string } {
  const expected = question.correctAnswer === 'true' || (question.correctAnswer as unknown) === true;
  const given = answer === true || answer === 'true' || answer === 'True';

  const correct = given === expected;
  return {
    correct,
    pointsAwarded: correct ? question.points : 0,
    feedback: correct ? question.feedbackCorrect : question.feedbackIncorrect,
  };
}

export function evaluateFillBlank(
  question: Question,
  answer: string
): { correct: boolean; pointsAwarded: number; feedback?: string } {
  const correctAnswer = String(question.correctAnswer ?? '');
  const caseSensitive = question.caseSensitive ?? false;

  if (!answer.trim()) return { correct: false, pointsAwarded: 0 };

  let correct: boolean;
  if (question.wildcard ?? false) {
    correct = wildcardMatch(answer, correctAnswer, caseSensitive);
  } else {
    correct = caseSensitive
      ? answer === correctAnswer
      : answer.toLowerCase() === correctAnswer.toLowerCase();
  }

  return {
    correct,
    pointsAwarded: correct ? question.points : 0,
    feedback: correct ? question.feedbackCorrect : question.feedbackIncorrect,
  };
}

export function evaluateNumeric(
  question: Question,
  answer: number
): { correct: boolean; pointsAwarded: number; feedback?: string } {
  const range = question.correctRange ?? { min: Number(question.correctAnswer ?? 0), max: Number(question.correctAnswer ?? 0) };
  const tolerance = range.tolerance ?? 0;
  const min = range.min - tolerance;
  const max = range.max + tolerance;

  const correct = answer >= min && answer <= max;
  return {
    correct,
    pointsAwarded: correct ? question.points : 0,
    feedback: correct ? question.feedbackCorrect : question.feedbackIncorrect,
  };
}

export function evaluateMatching(
  question: Question,
  pairs: Record<string, string> // itemId → targetId
): { correct: boolean; pointsAwarded: number; feedback?: string } {
  const questionPairs = question.pairs ?? [];
  if (Object.keys(pairs).length === 0) return { correct: false, pointsAwarded: 0 };

  let correctCount = 0;
  for (const { itemId, targetId } of questionPairs) {
    if (pairs[itemId] === targetId) correctCount++;
  }

  const allCorrect = correctCount === questionPairs.length;
  const score = correctCount / questionPairs.length;
  const pointsAwarded = Math.round(score * question.points * 10) / 10;

  return {
    correct: allCorrect,
    pointsAwarded: pointsAwarded,
    feedback: allCorrect ? question.feedbackCorrect : question.feedbackIncorrect,
  };
}

export function evaluateSequencing(
  question: Question,
  sequence: string[] // ordered option IDs
): { correct: boolean; pointsAwarded: number; feedback?: string } {
  const correctSequence = question.correctSequence ?? [];
  if (sequence.length === 0) return { correct: false, pointsAwarded: 0 };

  const correct = correctSequence.length === sequence.length &&
    correctSequence.every((id, i) => id === sequence[i]);

  return {
    correct,
    pointsAwarded: correct ? question.points : 0,
    feedback: correct ? question.feedbackCorrect : question.feedbackIncorrect,
  };
}

export function evaluateHotspot(
  question: Question,
  clickedRegionId: string
): { correct: boolean; pointsAwarded: number; feedback?: string } {
  const correctOption = question.options?.find(o => o.regionId === clickedRegionId && o.isCorrect);
  const correct = !!correctOption;
  return {
    correct,
    pointsAwarded: correct ? question.points : 0,
    feedback: correct ? question.feedbackCorrect : question.feedbackIncorrect,
  };
}

export function evaluateDragDrop(
  question: Question,
  drops: Record<string, string> // itemId → dropZoneId
): { correct: boolean; pointsAwarded: number; feedback?: string } {
  return evaluateMatching(question, drops); // Same logic: item → zone mapping
}

/**
 * Evaluate any question type.
 */
export function evaluateQuestion(
  question: Question,
  answer: unknown,
  attemptCount: number
): QuestionResult {
  // Check if attempts are exhausted
  const attemptsAllowed = question.attemptsAllowed ?? 0;
  if (attemptsAllowed > 0 && attemptCount >= attemptsAllowed) {
    return {
      questionId: question.id,
      pointsAwarded: 0,
      pointsPossible: question.points,
      correct: false,
      answered: false,
      attemptCount,
      feedback: `No attempts remaining (${attemptsAllowed} used).`,
    };
  }

  let result: { correct: boolean; pointsAwarded: number; feedback?: string };

  switch (question.type) {
    case 'multiple_choice':
      result = evaluateMultipleChoice(question, answer as string | string[]);
      break;
    case 'multiple_response':
      result = evaluateMultipleResponse(question, answer as string[]);
      break;
    case 'true_false':
      result = evaluateTrueFalse(question, answer as string | boolean);
      break;
    case 'fill_blank':
      result = evaluateFillBlank(question, String(answer ?? ''));
      break;
    case 'numeric':
      result = evaluateNumeric(question, Number(answer));
      break;
    case 'matching':
      result = evaluateMatching(question, answer as Record<string, string>);
      break;
    case 'sequencing':
      result = evaluateSequencing(question, answer as string[]);
      break;
    case 'hotspot':
      result = evaluateHotspot(question, String(answer ?? ''));
      break;
    case 'drag_drop':
      result = evaluateDragDrop(question, answer as Record<string, string>);
      break;
    default:
      result = { correct: false, pointsAwarded: 0, feedback: 'Unknown question type' };
  }

  return {
    questionId: question.id,
    pointsAwarded: result.pointsAwarded,
    pointsPossible: question.points,
    correct: result.correct,
    answered: answer !== undefined && answer !== null && answer !== '',
    attemptCount: attemptCount + 1,
    feedback: result.feedback,
  };
}
