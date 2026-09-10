"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "@/app/admin/(auth)/login/actions";
import { Button } from "@/components/ui/Button";
import { Field, FormError, Input } from "@/components/ui/Form";

const INITIAL: LoginState = { result: null };

export function LoginForm({ next }: { next: string }) {
	const [state, action, pending] = useActionState(signIn, INITIAL);
	const error = state.result && !state.result.ok ? state.result.error : null;

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
