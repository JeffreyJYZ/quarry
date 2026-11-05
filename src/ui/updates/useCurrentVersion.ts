import { useEffect, useState } from "react";
import { getDeps } from "@/lib/updates/deps";

/** The running app's version, resolved once. */
export function useCurrentVersion(): string | null {
	const [version, setVersion] = useState<string | null>(null);
	useEffect(() => {
		let live = true;
		getDeps()
			.currentVersion()
			.then(
				(next) => {
					if (live) setVersion(next);
				},
				() => {
					if (live) setVersion(null);
				},
			);
		return () => {
			live = false;
		};
	}, []);
	return version;
}
