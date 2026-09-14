"use client";

import {
	Analytics as VercelAnalytics,
	type BeforeSendEvent as AnalyticsEvent,
} from "@vercel/analytics/next";
import { SpeedInsights as VercelSpeedInsights } from "@vercel/speed-insights/next";
import type { BeforeSendMiddleware } from "@vercel/speed-insights";
import { redactUrl } from "@/lib/analytics";

/**
 * Both scripts re-register their handler whenever its identity changes, so
 * these are defined once here rather than inline in the JSX.
 */
function beforeSendView(event: AnalyticsEvent): AnalyticsEvent | null {
	const url = redactUrl(event.url);
	return url === null ? null : { ...event, url };
}

const beforeSendVital: BeforeSendMiddleware = (event) => {
	const url = redactUrl(event.url);
	return url === null ? null : { ...event, url };
};

/**
 * Vercel Web Analytics: how many people came, and to which pages.
 *
 * Cookie-free and without a consent banner to show for it — nothing is stored
 * on the visitor's device and nobody is followed between sites. In development
 * the package swaps in a script that only logs to the console, so local
 * clicking around never reaches the dashboard.
 */
export function Analytics() {
	return <VercelAnalytics beforeSend={beforeSendView} />;
}

/**
 * Vercel Speed Insights: what the site actually felt like on real phones.
 *
 * Worth having on this site in particular. The visitors are on mobile data in
 * New Zealand and the server functions are in Seoul, which is the one thing a
 * desktop test on fibre will never show you.
 */
export function SpeedInsights() {
	return <VercelSpeedInsights beforeSend={beforeSendVital} />;
}
