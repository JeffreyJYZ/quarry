import { useEffect } from "react";
import { startUpdatePolling } from "@/lib/updates/poll";
import { useNativeMenu } from "@/ui/app/useNativeMenu";

/** The shell's two long-lived listeners: the macOS menu bridge and the quiet update poller. */
export function useShellEffects(runCommand: (id: string) => void): void {
	useNativeMenu(runCommand);
	// Updates stay quiet: check and download in the background, then offer a restart in the title bar.
	useEffect(() => startUpdatePolling(), []);
}
