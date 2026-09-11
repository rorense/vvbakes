"use client";

import { useActionState } from "react";
import { signIn } from "@/app/admin/(auth)/login/actions";
import { EMPTY_FORM_STATE, errorFrom } from "@/lib/action-state";
import { Button } from "@/components/ui/Button";
import { Field, FormError, Input } from "@/components/ui/Form";

export function LoginForm({ next }: { next: string }) {
	const [state, action, pending] = useActionState(signIn, EMPTY_FORM_STATE);
	const error = errorFrom(state);

	return (
		<form
			action={action}
			className="flex flex-col gap-5">
			<input
				type="hidden"
				name="next"
				value={next}
			/>

			<Field
				label="Email"
				required>
				{(props) => (
					<Input
						{...props}
						name="email"
						type="email"
						autoComplete="username"
						autoFocus
					/>
				)}
			</Field>

			<Field
				label="Password"
				required>
				{(props) => (
					<Input
						{...props}
						name="password"
						type="password"
						autoComplete="current-password"
					/>
				)}
			</Field>

			{error ? <FormError>{error}</FormError> : null}

			<Button
				type="submit"
				size="lg"
				disabled={pending}>
				{pending ? "Signing in…" : "Sign in"}
			</Button>
		</form>
	);
}
