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

/**
 * The one message to show above a list of repeated rows.
 *
 * The admin edits three of these — a product's extras, the home page's
 * questions, its reviews — as a draft array submitted in a single hidden JSON
 * field. Zod reports failures against a row, as `extras.1.name`, and the rows
 * that were submitted are not the rows on screen: the blank ones somebody added
 * and changed their mind about are dropped on the way out. So the index points
 * at nothing the owner can count to, and is thrown away.
 *
 * The list carries one message instead, which is why the messages on those
 * schemas are written to make sense without an index — "Two of those extras
 * have the same name" rather than "required".
 *
 * The field's own error wins when there is one: a `max` on the array itself is
 * about the list rather than about any row in it.
 */
export function listErrorFrom(errors: Record<string, string>, field: string): string | undefined {
	return errors[field] ?? Object.entries(errors).find(([key]) => key.startsWith(`${field}.`))?.[1];
}
