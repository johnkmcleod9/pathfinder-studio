// Trigger module public exports
export { TriggerEngine, VariableStore, type EngineOptions, type ActionResult, type ExecutionContext } from './engine.js';
export type { Trigger, TriggerEvent, TriggerAction, Slide, SlideObject, CourseProject } from './engine.js';
export { TRIGGER_EVENTS, EVENT_TYPES, isKnownEvent, getEventDefinition } from './events.js';
export type { EventDefinition } from './events.js';
export { TRIGGER_ACTIONS, ACTION_TYPES, isKnownAction, getActionDefinition } from './actions.js';
export type { ActionDefinition, ActionParameter } from './actions.js';
export { evaluateCondition, isConditionValid, collectConditionVariables } from './conditions.js';
export type { Condition, ConditionType, VariableStore as IVariableStore } from './conditions.js';
