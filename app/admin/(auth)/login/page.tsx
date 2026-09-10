import type { Metadata } from "next";
import Image from "next/image";
import { LoginForm } from "@/components/admin/LoginForm";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{ next?: string }>;
}) {
	const { next } = await searchParams;

	return (
		<main className="bg-paper grid min-h-screen place-content-center px-5 py-16">
			<div className="flex w-full max-w-sm flex-col gap-8">
				<div className="flex flex-col items-center gap-3 text-center">
					<Image
						src="/logo.png"
						alt=""
						aria-hidden="true"
						width={800}
						height={800}
						className="size-16"
						priority
					/>
					<h1 className="font-display text-2xl">vvbakes admin</h1>
				</div>

				<LoginForm next={next ?? "/admin"} />
			</div>
		</main>
	);
}
