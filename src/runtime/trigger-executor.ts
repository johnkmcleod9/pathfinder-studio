import type { RuntimeSlide, RuntimeTrigger, ActionNode, Condition, LMSAdapter } from './types.js';
import { VariableStore } from './variable-store.js';
import { NavigationEngine } from './navigation.js';
import { MediaController } from './media-controller.js';

// ---- TriggerExecutor ----


/**
 * Registers event listeners and executes trigger action graphs.
 */
export class TriggerExecutor {
  // eventType → source → [triggers]
  private listeners = new Map<string, Map<string | undefined, RuntimeTrigger[]>>();
  // eventType → [wildcard triggers (no source filter)]
  private wildcardListeners = new Map<string, RuntimeTrigger[]>();

  constructor(
    private variables: VariableStore,
    private navigation: NavigationEngine,
    _media: MediaController,
    private lms: LMSAdapter
  ) {
    void _media;
  }

  registerSlideTriggers(slide: RuntimeSlide): void {
    for (const trigger of slide.triggers) {
      this.registerTrigger(trigger);
    }
  }

  registerTrigger(trigger: RuntimeTrigger): void {
    const eventType = trigger.event.type;
    const source = trigger.event.source;

    if (source) {
      if (!this.listeners.has(eventType)) this.listeners.set(eventType, new Map());
      const sourceMap = this.listeners.get(eventType)!;
      const list = sourceMap.get(source) ?? [];
      list.push(trigger);
      sourceMap.set(source, list);
    } else {
      if (!this.wildcardListeners.has(eventType)) this.wildcardListeners.set(eventType, []);
      this.wildcardListeners.get(eventType)!.push(trigger);
    }
  }

  unregisterSlideTriggers(slide: RuntimeSlide): void {
    for (const trigger of slide.triggers) {
      const eventType = trigger.event.type;
      const source = trigger.event.source;

      if (source) {
        const sourceMap = this.listeners.get(eventType);
        if (sourceMap) {
          const list = sourceMap.get(source) ?? [];
          sourceMap.set(source, list.filter(t => t.id !== trigger.id));
        }
      } else {
        const list = this.wildcardListeners.get(eventType) ?? [];
        this.wildcardListeners.set(eventType, list.filter(t => t.id !== trigger.id));
      }
    }
  }

  /**
   * Fire all triggers matching an event type and optional source.
   */
  async fireEvent(eventType: string, source?: string): Promise<void> {
    const triggers: RuntimeTrigger[] = [];

    // Wildcard triggers (no source filter)
    for (const t of this.wildcardListeners.get(eventType) ?? []) {
      triggers.push(t);
    }

    // Source-specific triggers
    const sourceMap = this.listeners.get(eventType);
    if (sourceMap) {
      // Exact match
      for (const t of sourceMap.get(source ?? '') ?? []) {
        triggers.push(t);
      }
      // Wildcard: also fire triggers registered without a specific source
      for (const t of sourceMap.get('') ?? []) {
        triggers.push(t);
      }
    }

    // Sort by priority (lower = higher priority)
    triggers.sort((a, b) => a.priority - b.priority);

    for (const trigger of triggers) {
      await this.executeTrigger(trigger);
    }
  }

  private async executeTrigger(trigger: RuntimeTrigger): Promise<void> {
    // Check conditions first
    if (trigger.conditions && trigger.conditions.length > 0) {
      const allMatch = trigger.conditions.every(c => this.evaluateCondition(c));
      if (!allMatch) return;
    }
    await this.executeActionNode(trigger.action);
  }

  private evaluateCondition(cond: Condition): boolean {
    switch (cond.type) {
      case 'variableEquals':
        return this.variables.get(cond.variable!) === cond.value;
      case 'variableNotEquals':
        return this.variables.get(cond.variable!) !== cond.value;
      case 'variableGreaterThan':
        return (this.variables.get(cond.variable!) as number) > (cond.value as number);
      case 'variableLessThan':
        return (this.variables.get(cond.variable!) as number) < (cond.value as number);
      case 'variableGreaterThanOrEqual':
        return (this.variables.get(cond.variable!) as number) >= (cond.value as number);
      case 'variableLessThanOrEqual':
        return (this.variables.get(cond.variable!) as number) <= (cond.value as number);
      case 'scoreGreaterThan':
        return (cond.scoreValue ?? 0) > (cond.value as number);
      case 'scoreLessThan':
        return (cond.scoreValue ?? 0) < (cond.value as number);
      case 'interactionCorrect':
        return cond.interactionResult === 'correct';
      case 'interactionIncorrect':
        return cond.interactionResult === 'incorrect';
      default:
        return false;
    }
  }

  async executeActionNode(node: ActionNode): Promise<void> {
    switch (node.type) {
      case 'jumpToSlide':
        if (node.target) this.navigation.goToSlide(node.target);
        break;

      case 'showLayer':
        // Layer visibility handled by slide renderer
        break;

      case 'hideLayer':
        break;

      case 'setVariable':
        if (node.variable !== undefined) this.variables.set(node.variable, node.value);
        break;

      case 'adjustVariable':
        if (node.variable !== undefined && node.operation !== undefined) {
          this.variables.adjust(node.variable, node.operation, (node.value as number) ?? 0);
        }
        break;

      case 'playMedia':
        // Media playback
        break;

      case 'pauseMedia':
        break;

      case 'submitQuiz':
        break;

      case 'exitCourse':
        // Exit sentinel
        break;

      case 'fireXAPIStatement': {
        const sendStmt = this.lms?.sendStatement as ((s: unknown) => Promise<void>) | undefined;
        if (sendStmt) {
          await sendStmt({
            verb: node.verb ?? 'completed',
            object: node.object ?? { id: '' },
            result: node.result,
          });
        }
        break;
      }

      case 'conditional': {
        const branch = node.branches?.find(b =>
          b.conditions.every(c => this.evaluateCondition(c))
        );
        if (branch) {
          for (const action of branch.then) await this.executeActionNode(action);
        } else if (node.else) {
          for (const action of node.else) await this.executeActionNode(action);
        }
        break;
      }

      case 'delay':
        if (node.duration) await new Promise(resolve => setTimeout(resolve, node.duration));
        break;

      case 'startTimeline':
      case 'pauseTimeline':
        // Animation handled by renderer
        break;
    }
  }
}
