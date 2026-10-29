"use client";

import { useEffect } from "react";

/**
 * Adds a copy button to every highlighted block.
 *
 * The blocks are produced by the MDX pipeline, not by React, so this decorates them after mount
 * instead of asking the content to carry a component.
 */
export default function CodeCopy() {
	useEffect(() => {
		const article = document.querySelector(".prose");
		if (article === null) return;
		const cleanups: (() => void)[] = [];

		for (const figure of article.querySelectorAll("figure[data-rehype-pretty-code-figure]")) {
			if (figure.querySelector(".code-copy") !== null) continue;
			const button = document.createElement("button");
			button.type = "button";
			button.className = "code-copy";
			button.title = "Copy code";
			button.setAttribute("aria-label", "Copy code");
			button.textContent = "⧉";
			let timer = 0;
			const onClick = () => {
				const text = figure.querySelector("pre")?.textContent ?? "";
				void navigator.clipboard.writeText(text).then(() => {
					button.textContent = "✓";
					button.classList.add("copied");
					window.clearTimeout(timer);
					timer = window.setTimeout(() => {
						button.textContent = "⧉";
						button.classList.remove("copied");
					}, 1400);
				});
			};
			button.addEventListener("click", onClick);
			figure.append(button);
			cleanups.push(() => {
				window.clearTimeout(timer);
				button.removeEventListener("click", onClick);
				button.remove();
			});
		}

		return () => {
			for (const cleanup of cleanups) cleanup();
		};
	}, []);

	return null;
}
