import Link from "next/link";

export default function NotFound() {
	return (
		<main className="grid min-h-screen place-content-center gap-6 px-6 text-center">
			<p className="font-sans text-2xs tracking-widest text-cocoa-soft uppercase">404</p>
			<h1 className="font-display text-3xl">We can&rsquo;t find that page</h1>
			<p className="mx-auto max-w-sm text-cocoa-soft">
				The link may be out of date. Everything we&rsquo;re baking right now is in the shop.
			</p>
			<div className="flex flex-wrap justify-center gap-3">
				<Link
					href="/shop"
					className="rounded-pill bg-rose px-6 py-3 text-sm font-medium hover:bg-rose-deep">
					Browse the shop
				</Link>
				<Link
					href="/"
					className="rounded-pill border border-line px-6 py-3 text-sm font-medium hover:border-cocoa">
					Go home
				</Link>
			</div>
		</main>
	);
}
