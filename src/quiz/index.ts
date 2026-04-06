// Quiz module public exports
export type {
  QuestionType,
  Question,
  QuizConfig,
  QuizStatus,
  QuizScore,
  QuizAttempt,
  QuizSuspendData,
  QuestionResult,
  AnswerOption,
  NumericRange,
  MatchingPair,
} from './types.js';
export {
  evaluateMultipleChoice,
  evaluateMultipleResponse,
  evaluateTrueFalse,
  evaluateFillBlank,
  evaluateNumeric,
  evaluateMatching,
  evaluateSequencing,
  evaluateHotspot,
  evaluateDragDrop,
  evaluateQuestion,
} from './questions.js';
export { QuizEngine, type QuizEngineOptions, type QuizCompletion } from './engine.js';
