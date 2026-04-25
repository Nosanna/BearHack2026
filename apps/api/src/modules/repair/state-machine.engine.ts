import type {
  RepairState,
  RepairStateMachine,
  StateId,
} from '@fixit/shared';

export interface AdvanceResult {
  /** Next state id after applying input. */
  nextStateId: StateId;
  /** True if the input caused a transition (vs. waiting for more input on same state). */
  advanced: boolean;
  /** True if the new state is terminal (complete / escalate). */
  terminal: boolean;
}

/**
 * Pure functions over the state machine. Side effects (DB writes, AI calls)
 * live in RepairService.
 */
export class StateMachineEngine {
  static getState(sm: RepairStateMachine, id: StateId): RepairState {
    const s = sm.states[id];
    if (!s) throw new Error(`State "${id}" not found in state machine.`);
    return s;
  }

  static isTerminal(state: RepairState): boolean {
    return state.type === 'complete' || state.type === 'escalate';
  }

  /**
   * Advance from `currentStateId` based on a user's textual answer.
   * Only valid when the current state is `instruction` (auto-advance to `next`)
   * or `question`.
   */
  static advanceWithAnswer(
    sm: RepairStateMachine,
    currentStateId: StateId,
    answer: string,
  ): AdvanceResult {
    const state = this.getState(sm, currentStateId);

    if (state.type === 'instruction') {
      const next = state.next;
      this.getState(sm, next);
      return { nextStateId: next, advanced: true, terminal: this.isTerminal(this.getState(sm, next)) };
    }

    if (state.type === 'question') {
      const lc = answer.toLowerCase();
      if (state.branches?.length) {
        for (const b of state.branches) {
          if (lc.includes(b.match.toLowerCase())) {
            return {
              nextStateId: b.next,
              advanced: true,
              terminal: this.isTerminal(this.getState(sm, b.next)),
            };
          }
        }
      }
      if (state.next) {
        return {
          nextStateId: state.next,
          advanced: true,
          terminal: this.isTerminal(this.getState(sm, state.next)),
        };
      }
      // No matching branch and no fallback — stay put.
      return { nextStateId: currentStateId, advanced: false, terminal: false };
    }

    if (this.isTerminal(state)) {
      return { nextStateId: currentStateId, advanced: false, terminal: true };
    }

    // verify_photo expects a photo, not an answer.
    return { nextStateId: currentStateId, advanced: false, terminal: false };
  }

  /**
   * Advance from a verify_photo state given a verification verdict.
   */
  static advanceWithPhoto(
    sm: RepairStateMachine,
    currentStateId: StateId,
    passed: boolean,
  ): AdvanceResult {
    const state = this.getState(sm, currentStateId);
    if (state.type !== 'verify_photo') {
      return { nextStateId: currentStateId, advanced: false, terminal: this.isTerminal(state) };
    }
    const next = passed ? state.pass : state.fail;
    this.getState(sm, next);
    return {
      nextStateId: next,
      advanced: true,
      terminal: this.isTerminal(this.getState(sm, next)),
    };
  }
}
