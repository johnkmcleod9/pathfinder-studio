// Variable module public exports
export { VariableStore, type VariableDef, type VariableOptions, type Scope } from './store.js';
export type { VariableChangeListener } from './store.js';
export type { VariableType, TypeConstraint, VariableTypeDefinition } from './types.js';
export { VARIABLE_TYPES, VARIABLE_TYPE_NAMES, getTypeDefinition, coerceToType, validateValue } from './types.js';
export type { SystemVariableDef, SystemVariableScope } from './system-variables.js';
export { SYSTEM_VARIABLES, getSystemVariable, isSystemVariable, isMediaVariable, getMediaVariableDef } from './system-variables.js';
export { expandPlaceholders, collectPlaceholders, validatePlaceholders, type ExpansionResult, type ExpansionOptions } from './placeholders.js';
