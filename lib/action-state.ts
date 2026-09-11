import type { ActionResult } from "./types";

/**
 * The shape every admin form action returns, and its initial value.
 *
 * This lives outside the action modules because a "use server" file may only
 * export async functions, a plain `const` export there is a build error.
 */
export interface FormState {
	result: ActionResult | null;
}

export const EMPTY_FORM_STATE: FormState = { result: null };

/** The field errors from a failed action, or an empty object. */
export function fieldErrorsFrom(state: FormState): Record<string, string> {
	return state.result && !state.result.ok ? (state.result.fieldErrors ?? {}) : {};
}

/** The top-level message from a failed action, or null. */
export function errorFrom(state: FormState): string | null {
	return state.result && !state.result.ok ? state.result.error : null;
}

export function succeeded(state: FormState): boolean {
	return state.result?.ok === true;
}
