import Image from "next/image";
import { instagramUrl } from "@/lib/constants";
import styles from "./menu.module.css";

/**
 * Unlisted single-screen menu card, handed out at physical markets. It is not in
 * the navigation or the sitemap and is marked noindex in the layout.
 *
 * The content here is hard-coded on purpose: it must stay stable and printable
 * even while the online catalogue changes. Bank details are shown because market
 * customers pay by transfer on the spot; the online ordering flow never exposes
 * them publicly and sends them in the confirmation email instead.
 */
const MENU_ITEMS: ReadonlyArray<{ name: string; prices: readonly string[] }> = [
	{ name: "Cupcakes", prices: ["$3 each", "4 for $12"] },
	{ name: "Cookies", prices: ["2 for $5"] },
	{ name: "Brochi", prices: ["$5 / slice"] },
	{ name: "Wingko", prices: ["$5 / slice"] },
	{ name: "Pandan Chiffon Cake", prices: ["$3 / slice"] },
];

const BANK_DETAILS: ReadonlyArray<{ label: string; value: string }> = [
	{ label: "Name", value: "Liviana Ngadi" },
	{ label: "Account", value: "12-3035-0753102-52" },
];

export default function MenuPage() {
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

			<section
				className={styles.pay}
				aria-labelledby="pay-heading">
				<h2
					id="pay-heading"
					className={styles.sectionTitle}>
					bank details
				</h2>
				<dl className={styles.payGrid}>
					{BANK_DETAILS.map((row) => (
						<div
							key={row.label}
							className={styles.payRow}>
							<dt>{row.label}</dt>
							<dd>{row.value}</dd>
						</div>
					))}
				</dl>
			</section>

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
