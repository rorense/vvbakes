import { ButtonLink } from "@/components/ui/Button";
import { Container, Section } from "@/components/ui/Container";

/** The "Ready when you are" band that closes the shop and each category page. */
export function OrderPrompt({ tone }: { tone: "paper" | "blush" }) {
	return (
		<Section
			tone={tone}
			size="tight">
			<Container
				width="narrow"
				className="flex flex-col items-center gap-4 text-center">
				<p className="font-display text-2xl">Ready when you are</p>
				<p className="text-cocoa-soft text-sm">
					Put an order together and pick a day. I&rsquo;ll confirm by email.
				</p>
				<ButtonLink
					href="/order"
					size="lg">
					Start an order
				</ButtonLink>
			</Container>
		</Section>
	);
}
