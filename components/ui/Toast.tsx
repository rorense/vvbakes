"use client";

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
	useTransition,
} from "react";
import { errorFrom, succeeded, type FormState } from "@/lib/action-state";
import { cn } from "@/lib/cn";

/**
 * The line that rises to say how a save went.
 *
 * The admin used to answer only in place: a bad field marked under the field, a
 * refused save printed above the button, a small "Saved." next to it that the
 * next render often took away. On a phone, halfway down a long form, none of
 * that is where the thumb is looking — and a save that worked usually redraws a
 * page that looks exactly like the page that was already there, so a good save
 * and a press that never fired are the same picture.
 *
 * So both outcomes come down here as well. What went wrong still stays where it
 * went wrong — the field errors, and the sentence above the button — because a
 * message that leaves after a few seconds is no place to put something the owner
 * has to act on. The toast is the part that finds her wherever she is looking.
 */

export type ToastTone = "good" | "bad";

/**
 * Good news reads in a glance and is gone. Bad news is a sentence she has to
 * take in, and usually one she then has to do something about, so it stays
 * about as long as it takes to read twice.
 */
const DWELL_MS: Record<ToastTone, number> = {
	good: 4000,
	bad: 7000,
};

/**
 * Older lines are dropped past this. Three is already more than the admin can
 * produce without deliberately hammering a button, and a column taller than
 * that starts covering the page it is reporting on.
 */
const MAX_VISIBLE = 3;

const TONE_STYLES: Record<ToastTone, string> = {
	// Solid blocks, where the rest of the admin is paper and hairlines. This is
	// the one thing that floats over the page, and there are no shadows anywhere
	// in this design to lift it off — so it separates itself by being the only
	// filled block on the screen.
	good: "bg-cocoa text-paper",
	bad: "bg-danger text-paper",
};

interface Toast {
	id: number;
	message: string;
	tone: ToastTone;
}

const ToastContext = createContext<((message: string, tone?: ToastTone) => void) | null>(null);

/** Says one line. Must be called under a `ToastProvider`. */
export function useToast(): (message: string, tone?: ToastTone) => void {
	const toast = useContext(ToastContext);
	if (!toast) throw new Error("useToast needs a ToastProvider above it.");
	return toast;
}

/**
 * Reports how a form action went, the moment it comes back.
 *
 * A success says `message`; a failure says whatever the action itself said,
 * because the action is the only thing that knows why it refused. Field errors
 * are left alone — they are already written under the fields they belong to,
 * and repeating "Please check the highlighted fields" is the useful half of
 * that down here anyway.
 *
 * `useActionState` hands back a fresh state object for every result, so saving
 * the same form twice says it twice, while a re-render that had nothing to do
 * with the action reuses the old object and stays quiet.
 *
 * Deliberately a hook rather than something the form calls at submit time:
 * several of these forms close or unmount on success, and a toast raised from
 * an effect lands in the provider above them, which outlives the form.
 */
export function useToastOnResult(state: FormState<unknown>, message: string): void {
	const toast = useToast();

	// Each state object is reported once and then remembered. Without that, a
	// form whose message depends on what was pressed — the order transitions —
	// says the same result twice the moment that message is recomputed.
	const reported = useRef<FormState<unknown> | null>(null);

	useEffect(() => {
		if (state === reported.current) return;
		reported.current = state;

		if (succeeded(state)) {
			toast(message);
			return;
		}

		const error = errorFrom(state);
		if (error) toast(error, "bad");
	}, [state, message, toast]);
}

/**
 * A transition that reports its own failures.
 *
 * The admin's list rows — a product, a category — do their work through actions
 * that answer with nothing at all: the row simply redraws from the server when
 * they land. A failure there has no shape of its own, so a chip that flips back
 * to where it was is indistinguishable from a tap that never registered. This
 * is the transition those rows already use, with a line for when that happens.
 *
 * `success` is optional because most of these already say so themselves: the
 * chip flips, the row moves, and a toast per tap down a list of twenty products
 * would be noise. Deleting is the one that needs saying, because all it leaves
 * behind is a gap.
 */
export function useToastedTransition(): [
	boolean,
	(work: () => Promise<void>, failure: string, success?: string) => void,
] {
	const [pending, startTransition] = useTransition();
	const toast = useToast();

	const run = useCallback(
		(work: () => Promise<void>, failure: string, success?: string) => {
			startTransition(async () => {
				try {
					await work();
					if (success) toast(success);
				} catch {
					toast(failure, "bad");
				}
			});
		},
		[toast],
	);

	return [pending, run];
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
	const [toasts, setToasts] = useState<Toast[]>([]);

	const dismiss = useCallback((id: number) => {
		setToasts((current) => current.filter((toast) => toast.id !== id));
	}, []);

	// The id is only ever a React key and a handle for dismissing, so the clock
	// plus a counter is enough; two toasts raised in the same millisecond are
	// separated by the length of the list they are joining.
	const push = useCallback((message: string, tone: ToastTone = "good") => {
		setToasts((current) =>
			[...current, { id: Date.now() + current.length, message, tone }].slice(-MAX_VISIBLE),
		);
	}, []);

	return (
		<ToastContext.Provider value={push}>
			{children}

			{/*
			  The region is in the document whether or not anything is in it. A
			  live region announces what is added to it, so one mounted alongside
			  its first toast is a region a screen reader has nothing to compare
			  against, and the first save of the session goes unsaid.

			  Polite, including for a failure, because a failure is announced
			  assertively already: every form that can raise one also prints it
			  above its button in a `role="alert"`, and two interruptions for one
			  refusal is worse than one.

			  Sits above the phone's tab bar rather than over it: the bar is how
			  she leaves the page, and a line covering it would be in the way of
			  the thing it is congratulating her for finishing.
			*/}
			<div
				aria-live="polite"
				aria-atomic="false"
				className="pointer-events-none fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-50 px-4 sm:bottom-6">
				<ol className="mx-auto flex w-full max-w-sm flex-col gap-2">
					{toasts.map((toast) => (
						<ToastRow
							key={toast.id}
							toast={toast}
							onDismiss={dismiss}
						/>
					))}
				</ol>
			</div>
		</ToastContext.Provider>
	);
}

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
	useEffect(() => {
		const timer = setTimeout(() => onDismiss(toast.id), DWELL_MS[toast.tone]);
		return () => clearTimeout(timer);
	}, [toast.id, toast.tone, onDismiss]);

	return (
		<li className="toast-rise pointer-events-auto">
			<div
				className={cn(
					"flex items-start justify-between gap-3 rounded-md px-4 py-3 text-sm",
					TONE_STYLES[toast.tone],
				)}>
				<span>{toast.message}</span>
				<button
					type="button"
					onClick={() => onDismiss(toast.id)}
					aria-label="Dismiss"
					className="tap-safe -my-1 -mr-1 shrink-0 rounded-md px-1 py-1 text-base leading-none opacity-70 hover:opacity-100">
					<span aria-hidden="true">×</span>
				</button>
			</div>
		</li>
	);
}
