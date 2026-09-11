import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * eslint-config-next ships flat configs directly, so there is no need for the
 * eslintrc compatibility bridge, which in fact throws on this version.
 */
const eslintConfig = [
	{
		ignores: [".next/**", "node_modules/**", "next-env.d.ts", ".email-preview/**"],
	},
	...coreWebVitals,
	...typescript,
	{
		rules: {
			// Unused function arguments are meaningful in server actions, where the
			// previous state is part of the signature whether or not it is read.
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
		},
	},
];

export default eslintConfig;
