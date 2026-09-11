import type { ActionResult } from "./types";

/**
 * The shape every form action returns, and its initial value.
 *
 * This lives outside the action modules because a "use server" file may only
 * export async functions, a plain `const` export there is a build error.
 *
 * `T` is whatever a success carries. Most actions carry nothing and the form
 * simply re-renders; the order form needs the new order's token so it can send
 * the customer to their status page.
 */
export interface FormState<T = undefined> {
	result: ActionResult<T> | null;
}

/** Typed `never` so it can start any form, whatever that form's success carries. */
export const EMPTY_FORM_STATE: FormState<never> = { result: null };

/** The field errors from a failed action, or an empty object. */
export function fieldErrorsFrom(state: FormState<unknown>): Record<string, string> {
	return state.result && !state.result.ok ? (state.result.fieldErrors ?? {}) : {};
}

/** The top-level message from a failed action, or null. */
export function errorFrom(state: FormState<unknown>): string | null {
	return state.result && !state.result.ok ? state.result.error : null;
}

export function succeeded(state: FormState<unknown>): boolean {
	return state.result?.ok === true;
}
