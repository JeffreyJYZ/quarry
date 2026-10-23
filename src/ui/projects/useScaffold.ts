import { type RefObject, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { createProject } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import { defaultStandard, joinPath, type Kind, parentOf } from "./kinds";

export type Scaffold = {
	parent: string;
	name: string;
	kind: Kind;
	standard: string;
	creating: boolean;
	error: string | null;
	target: string | null;
	canCreate: boolean;
	parentRef: RefObject<HTMLInputElement | null>;
	nameRef: RefObject<HTMLInputElement | null>;
	setName: (next: string) => void;
	setStandard: (next: string) => void;
	selectKind: (next: Kind) => void;
	chooseParent: (next: string) => void;
	browse: () => Promise<void>;
	submit: () => Promise<void>;
};

/**
 * The new-project dialog's form state, plus the one call that actually scaffolds.
 *
 * Nothing is created until `submit` runs; on success the caller receives the new root.
 */
export function useScaffold(input: {
	open: boolean;
	initialParent: string;
	onParentChange: (parent: string) => void;
	onCreated: (root: string) => void;
}): Scaffold {
	const { open: isOpen, initialParent, onParentChange, onCreated } = input;
	const [parent, setParent] = useState(initialParent);
	const [name, setName] = useState("");
	const [kind, setKind] = useState<Kind>("rust-bin");
	const [standard, setStandard] = useState(defaultStandard("rust-bin"));
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const nameRef = useRef<HTMLInputElement>(null);
	const parentRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!isOpen) return;
		setError(null);
		setParent(initialParent);
		(parent === "" ? parentRef : nameRef).current?.focus();
	}, [initialParent, isOpen, parent]);

	const target = parent !== "" && name.trim() !== "" ? joinPath(parent, name) : null;
	const canCreate = target !== null && !creating;

	const chooseParent = (next: string) => {
		setParent(next);
		onParentChange(next);
	};

	const selectKind = (next: Kind) => {
		setKind(next);
		setStandard(defaultStandard(next));
	};

	const browse = async () => {
		try {
			const picked = await open({
				directory: true,
				multiple: false,
				title: "Choose a parent folder",
			});
			if (typeof picked === "string") chooseParent(picked);
		} catch (cause) {
			setError(describeError(cause));
		}
	};

	const submit = async () => {
		if (!canCreate || target === null) return;
		setCreating(true);
		setError(null);
		try {
			const info = await createProject(parentOf(parent), name.trim(), kind, standard);
			setName("");
			onCreated(info.root);
		} catch (cause) {
			setError(describeError(cause));
		} finally {
			setCreating(false);
		}
	};

	return {
		parent,
		name,
		kind,
		standard,
		creating,
		error,
		target,
		canCreate,
		parentRef,
		nameRef,
		setName,
		setStandard,
		selectKind,
		chooseParent,
		browse,
		submit,
	};
}
