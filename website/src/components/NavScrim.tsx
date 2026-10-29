"use client";

import { useEffect } from "react";

/** Closes the mobile drawer: a tap outside it, or Escape. */
export default function NavScrim() {
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") document.documentElement.dataset.nav = "";
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	return (
		<button
			type="button"
			className="nav-scrim"
			aria-label="Close the menu"
			onClick={() => {
				document.documentElement.dataset.nav = "";
			}}
		/>
	);
}
