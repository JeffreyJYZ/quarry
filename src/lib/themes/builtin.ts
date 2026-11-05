import { BUILTIN_THEMES } from "@/lib/consts/themes";
import type { Theme } from "@/lib/themes/model";

export { BUILTIN_THEMES, DEFAULT_THEME } from "@/lib/consts/themes";

export function builtinTheme(id: string): Theme | undefined {
	return BUILTIN_THEMES.find((theme) => theme.id === id);
}
