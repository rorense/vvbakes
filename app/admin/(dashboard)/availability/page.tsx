import { adminOrderCounts, adminOverrides, adminRules, adminSettings } from "@/lib/admin-queries";
import { buildCalendarMonth } from "@/lib/availability";
import { addDays, addMonths, endOfMonth, isIsoDate, startOfMonth, todayIn } from "@/lib/dates";
import { AdminHeader } from "@/components/admin/AdminShell";
import { AvailabilityCalendar } from "@/components/admin/AvailabilityCalendar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar" };

export default async function AvailabilityPage({
	searchParams,
}: {
	searchParams: Promise<{ month?: string }>;
}) {
	const { month: requested } = await searchParams;
	const settings = await adminSettings();

	const today = todayIn(settings.timezone);
	const month = isIsoDate(requested ?? "") ? startOfMonth(requested!) : startOfMonth(today);

	// The grid spills into the neighbouring months, so read a little either side.
	const from = addDays(startOfMonth(addMonths(month, -1)), 0);
	const to = endOfMonth(addMonths(month, 1));

	const [rules, overrides, counts] = await Promise.all([
		adminRules(),
		adminOverrides(from, to),
		adminOrderCounts(from, to),
	]);

	const days = buildCalendarMonth({
		month,
		rules,
		overrides,
		counts,
		timezone: settings.timezone,
	});

	return (
		<>
			<AdminHeader
				title="Calendar"
				description="Which days you're baking, and how many orders you can take."
			/>
			<AvailabilityCalendar
				month={month}
				days={days}
				rules={rules}
				timezone={settings.timezone}
			/>
		</>
	);
}
