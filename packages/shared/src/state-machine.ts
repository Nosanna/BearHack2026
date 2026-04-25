/**
 * Repair state-machine schema (spec 04_state_machine_schema.md).
 *
 * The planner LLM emits one of these JSON documents and the API persists
 * it on RepairPlan.stateMachine. The repair runtime engine in apps/api
 * walks the graph as the user submits responses and photos.
 */

export type StateId = string;

export interface InstructionState {
  type: 'instruction';
  text: string;
  next: StateId;
  /** Optional list of safety reminders to surface in the UI. */
  safetyWarnings?: string[];
}

export interface QuestionState {
  type: 'question';
  text: string;
  /** Free-form answer routes through `next`; multiple choice routes through `branches`. */
  next?: StateId;
  branches?: Array<{
    /** Substring (case-insensitive) or option label that triggers this branch. */
    match: string;
    next: StateId;
  }>;
}

export interface VerifyPhotoState {
  type: 'verify_photo';
  text?: string;
  /** What the model should be able to identify in the user's photo for a pass. */
  expected_visual: string[];
  pass: StateId;
  fail: StateId;
}

export interface CompleteState {
  type: 'complete';
  text: string;
}

export interface EscalateState {
  type: 'escalate';
  text: string;
  /** Reason surfaced to the user (e.g. "out of scope for DIY"). */
  reason: string;
}

export type RepairState =
  | InstructionState
  | QuestionState
  | VerifyPhotoState
  | CompleteState
  | EscalateState;

export interface RepairStateMachine {
  version: 1;
  start_state: StateId;
  states: Record<StateId, RepairState>;
}

export interface RepairPlanPayload {
  diagnosis: string;
  safety_warnings: string[];
  state_machine: RepairStateMachine;
}
