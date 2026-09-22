import Link from "next/link";
import { deleteFeedback, publishFeedback, resubscribe } from "./actions";
import {
	adminFeedback,
	adminFeedbackOptOuts,
	adminFeedbackRatings,
	adminSettings,
} from "@/lib/admin-queries";
import { AdminHeader, EmptyState } from "@/components/admin/AdminShell";
import { FeedbackRow } from "@/components/admin/FeedbackRow";
import { OptOutList } from "@/components/admin/OptOutList";

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
	const [feedback, optOuts, settings, ratings] = await Promise.all([
		adminFeedback(),
		adminFeedbackOptOuts(),
		adminSettings(),
		adminFeedbackRatings(),
	]);

	const waiting = feedback.filter((row) => row.consented && !row.publishedAt).length;

	return (
		<>
			<AdminHeader
				title="Feedback"
				description={
					feedback.length === 0
						? "Asked for the morning after you mark an order collected."
						: `${feedback.length} in all${waiting > 0 ? ` · ${waiting} you could put up` : ""}`
				}
			/>

			{feedback.length === 0 ? (
				<EmptyState>
					Nothing yet. The morning after you mark an order collected, that customer gets an email
					asking how it went; whatever they write comes back here.
				</EmptyState>
			) : (
				<ul className="flex flex-col gap-3">
					{feedback.map((row) => (
						<FeedbackRow
							key={row.id}
							feedback={row}
							ratings={ratings.get(row.id)}
							timezone={settings.timezone}
							onPublish={publishFeedback}
							onDelete={deleteFeedback}
						/>
					))}
				</ul>
			)}

			<OptOutList
				optOuts={optOuts}
				timezone={settings.timezone}
				onResubscribe={resubscribe}
			/>

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

			{/* Said out loud because it is the one thing on this page that is not
			    waiting on her. Everything else here is private until she presses a
			    button; the stars are already out. */}
			<p className="text-cocoa-soft mt-2 text-xs">
				The stars work the other way round: they are already on the product pages, folded into an
				average, whether or not the customer let you quote them. Nobody&rsquo;s name goes with them.
				Deleting a piece of feedback takes its stars out of the average too, and that is the only
				way to remove one.
			</p>
		</>
	);
}
