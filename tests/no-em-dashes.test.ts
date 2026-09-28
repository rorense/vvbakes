/**
 * No em dash reaches a visitor.
 *
 * People now read the em dash as the mark of machine-written copy, and anyone
 * can open the page source. So no text that can render may carry one: page
 * copy, meta tags, share-card alt text, the emails. A price with nothing to
 * show uses an en dash instead.
 *
 * Only string literals, templates and JSX text are read. Comments never ship,
 * tests never render, and the admin is seen by the owner alone.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const EM_DASH = String.fromCharCode(0x2014);

const TEXT = new Set([
	ts.SyntaxKind.StringLiteral,
	ts.SyntaxKind.NoSubstitutionTemplateLiteral,
	ts.SyntaxKind.TemplateHead,
	ts.SyntaxKind.TemplateMiddle,
	ts.SyntaxKind.TemplateTail,
	ts.SyntaxKind.JsxText,
]);

function emDashes(path: string): string[] {
	const source = ts.createSourceFile(
		path,
		readFileSync(path, "utf8"),
		ts.ScriptTarget.Latest,
		true,
	);
	const found: string[] = [];
	const visit = (node: ts.Node) => {
		const text = TEXT.has(node.kind) ? node.getText(source) : "";
		if (text.includes(EM_DASH) || text.includes("&mdash;")) {
			const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
			found.push(`${path}:${line + 1}`);
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return found;
}

describe("text a visitor can see", () => {
	it("has no em dashes", () => {
		const files = ["app", "components", "emails", "lib"].flatMap((root) =>
			readdirSync(root, { recursive: true, encoding: "utf8" })
				.map((file) => join(root, file))
				.filter((file) => /\.tsx?$/.test(file) && !file.endsWith(".test.ts"))
				.filter((file) => !file.includes("admin")),
		);

		expect(files.flatMap(emDashes)).toEqual([]);
	});
});
