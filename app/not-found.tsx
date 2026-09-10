import Link from "next/link";

export default function NotFound() {
	return (
		<main className="grid min-h-screen place-content-center gap-6 px-6 text-center">
			<p className="text-2xs text-cocoa-soft font-sans tracking-widest uppercase">404</p>
			<h1 className="font-display text-3xl">We can&rsquo;t find that page</h1>
			<p className="text-cocoa-soft mx-auto max-w-sm">
				The link may be out of date. Everything we&rsquo;re baking right now is in the shop.
			</p>
			<div className="flex flex-wrap justify-center gap-3">
				<Link
					href="/shop"
					className="rounded-pill bg-rose hover:bg-rose-deep px-6 py-3 text-sm font-medium">
					Browse the shop
				</Link>
				<Link
					href="/"
					className="rounded-pill border-line hover:border-cocoa border px-6 py-3 text-sm font-medium">
					Go home
				</Link>
			</div>
		</main>
	);
}
