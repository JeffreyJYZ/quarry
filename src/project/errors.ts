/** Normalise a rejected Tauri command (usually a plain string) into a display line. */
export function describeError(error: unknown): string {
	if (typeof error === "string") {
		return error;
	}
	if (error instanceof Error) {
		return error.message;
	}
	if (error && typeof error === "object" && "message" in error) {
		const message = (error as { message?: unknown }).message;
		if (typeof message === "string") {
			return message;
		}
	}
	return "Unknown error";
}
