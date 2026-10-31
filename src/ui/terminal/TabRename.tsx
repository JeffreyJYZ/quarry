import { useEffect, useRef } from "react";
import { shortCwd, type Session } from "@/lib/terminal/sessions";

type Props = {
	value: string;
	session: Session;
	updateSession: (id: number, updater: (s: Session) => Session) => void;
	onDone: () => void;
};

/** Inline rename field for a terminal tab: commits on Enter or blur, cancels on Escape. */
export default function TabRename({ value, session, updateSession, onDone }: Props) {
	const ref = useRef<HTMLInputElement>(null);
	const done = useRef(false);
	useEffect(() => {
		const el = ref.current;
		if (el === null) return;
		el.focus();
		el.select();
	}, []);
	const finish = () => {
		if (done.current) return;
		done.current = true;
		onDone();
	};
	const commit = () => {
		if (done.current) return;
		done.current = true;
		const next = ref.current?.value ?? value;
		updateSession(session.id, (s) => ({
			...s,
			title: next === "" || next === shortCwd(session.cwd) ? null : next,
		}));
		onDone();
	};
	return (
		<input
			ref={ref}
			type="text"
			className="terminal-tab-rename"
			defaultValue={value}
			onKeyDown={(event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					commit();
				} else if (event.key === "Escape") {
					event.preventDefault();
					finish();
				}
			}}
			onBlur={commit}
		/>
	);
}
