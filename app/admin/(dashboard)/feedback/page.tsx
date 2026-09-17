import Link from "next/link";
import { deleteFeedback, publishFeedback } from "./actions";
import { adminFeedback, adminSettings } from "@/lib/admin-queries";
import { AdminHeader, EmptyState } from "@/components/admin/AdminShell";
import { FeedbackRow } from "@/components/admin/FeedbackRow";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feedback" };

/**
 * What customers said when the shop asked.
 *
 * Everything here arrived through one form, linked from one email, a day after
 * an order was collected. Nothing on this page is public, and nothing becomes
 * public on its own: the only route from here to the website is the button on a
 * row, and it only exists where the customer ticked the box.
 */
export default async function AdminFeedbackPage() {
	const [feedback, settings] = await Promise.all([adminFeedback(), adminSettings()]);

	const waiting = feedback.filter((row) => row.consented && !row.publishedAt).length;

	return (
		<>
			<AdminHeader
				title="Feedback"
				description={
					feedback.length === 0
						? "Asked for a day after every order is collected."
						: `${feedback.length} in all${waiting > 0 ? ` · ${waiting} you could put up` : ""}`
				}
			/>

			{feedback.length === 0 ? (
				<EmptyState>
					Nothing yet. A day after an order is collected, the customer gets an email asking how it
					went; whatever they write comes back here.
				</EmptyState>
			) : (
				<ul className="flex flex-col gap-3">
					{feedback.map((row) => (
						<FeedbackRow
							key={row.id}
							feedback={row}
							timezone={settings.timezone}
							onPublish={publishFeedback}
							onDelete={deleteFeedback}
						/>
					))}
				</ul>
			)}

			<p className="text-cocoa-soft mt-6 text-xs">
				Anything you put up lands at the end of{" "}
				<Link
					href="/admin/settings#reviews"
					className="underline underline-offset-2">
					Kind words
				</Link>{" "}
				in Settings, which is where the wording, the order and the line under the name are yours to
				change, and the only place a review comes back down.
			</p>
		</>
	);
}
