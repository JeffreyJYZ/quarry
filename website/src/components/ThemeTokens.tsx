import { themeVariables } from "@/lib/themes/apply";
import { oneDark } from "@/lib/themes/builtin/one-dark";
import { oneLight } from "@/lib/themes/builtin/one-light";

/** One theme's tokens as a declaration block, straight from the app's own theme modules. */
function declarations(tokens: Parameters<typeof themeVariables>[0]): string {
	return Object.entries(themeVariables(tokens))
		.map(([name, value]) => `${name}:${value}`)
		.join(";");
}

/**
 * The site's palette is the app's palette.
 *
 * `src/lib/themes/model.ts` publishes one CSS variable per token, and the two built-in themes the
 * site offers are the app's own `oneDark` and `oneLight` objects — so a change to either theme shows
 * up here without a second copy to keep in step.
 */
export default function ThemeTokens() {
	const css = [
		`:root{${declarations(oneDark.tokens)}}`,
		`:root[data-theme="light"]{${declarations(oneLight.tokens)}}`,
	].join("\n");

	return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
