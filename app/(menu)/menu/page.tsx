import Image from "next/image";
import { instagramUrl } from "@/lib/constants";
import { getPrivateSettings } from "@/lib/orders";
import styles from "./menu.module.css";

/**
 * Unlisted single-screen menu card, handed out at physical markets. It is not in
 * the navigation or the sitemap and is marked noindex in the layout.
 *
 * The prices below are hard-coded on purpose: this is a printed card, and it has
 * to keep saying what the card in someone's hand says even while the online
 * catalogue moves underneath it.
 *
 * The bank details are the opposite case, and they come from the admin. They are
 * shown here because market customers pay by transfer while standing there, but
 * the day the account changes is precisely the day this card must not still be
 * quoting the old one — and having the number written down in two places is how
 * one of them ends up wrong. The site's other copy of it is private, shown to a
 * customer only once their order is confirmed; this page is the deliberate
 * exception, not a second source of truth.
 */
const MENU_ITEMS: ReadonlyArray<{ name: string; prices: readonly string[] }> = [
	{ name: "Cupcakes", prices: ["$3 each", "4 for $12"] },
	{ name: "Cookies", prices: ["$5 / pack"] },
	{ name: "Brochi", prices: ["$5 / slice"] },
	{ name: "Wingko", prices: ["$5 / slice"] },
	{ name: "Pandan Chiffon Cake", prices: ["$3 / slice"] },
];

/**
 * Cached like the other public pages rather than rendered per request. A market
 * stall is the worst network this site ever sees, and a fast card is worth a
 * lot.
 *
 * The account number changing is the one case this must not get wrong, and the
 * timer is no longer what carries it: `revalidateCatalogue()` purges this path
 * on every settings save. Same window as the home page, for the reason there.
 */
export const revalidate = 3600;

export default async function MenuPage() {
	const { bankAccountName, bankAccountNumber } = await getPrivateSettings();

	// Whatever is actually filled in. A missing one is left out rather than
	// printed as a blank row, and if the read fails entirely the section goes
	// with it: a card with no bank details is recoverable at a stall, one
	// showing the wrong number is not.
	const bankDetails = [
		{ label: "Name", value: bankAccountName },
		{ label: "Account", value: bankAccountNumber },
	].filter((row): row is { label: string; value: string } => Boolean(row.value));

	return (
		<div className={styles.page}>
			<header>
				<Image
					className={styles.logo}
					src="/logo.png"
					alt=""
					aria-hidden="true"
					width={800}
					height={800}
					priority
				/>
				<h1 className={styles.brand}>vvbakes</h1>
				<p className={styles.tagline}>inspired desserts</p>
			</header>

			<section aria-labelledby="menu-heading">
				<h2
					id="menu-heading"
					className={styles.sectionTitle}>
					menu
				</h2>
				<ul className={styles.menuList}>
					{MENU_ITEMS.map((item) => (
						<li
							key={item.name}
							className={styles.menuItem}>
							<h3>{item.name}</h3>
							{item.prices.length > 1 ? (
								<div className={styles.prices}>
									{item.prices.map((price) => (
										<span
											key={price}
											className={styles.price}>
											{price}
										</span>
									))}
								</div>
							) : (
								<span className={styles.price}>{item.prices[0]}</span>
							)}
						</li>
					))}
				</ul>
			</section>

			{bankDetails.length === 0 ? null : (
				<section
					className={styles.pay}
					aria-labelledby="pay-heading">
					<h2
						id="pay-heading"
						className={styles.sectionTitle}>
						bank details
					</h2>
					<dl className={styles.payGrid}>
						{bankDetails.map((row) => (
							<div
								key={row.label}
								className={styles.payRow}>
								<dt>{row.label}</dt>
								<dd>{row.value}</dd>
							</div>
						))}
					</dl>
				</section>
			)}

			<footer className={styles.footer}>
				<p className={styles.thanks}>thank you for supporting vvbakes</p>
				<p className={styles.ig}>
					instagram:{" "}
					<a
						href={instagramUrl()}
						target="_blank"
						rel="noopener noreferrer">
						@vv.bakes
					</a>
				</p>
			</footer>
		</div>
	);
}
