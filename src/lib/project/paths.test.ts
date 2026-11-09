import { describe, expect, test } from "bun:test";
import {
	directoryOf,
	fileName,
	isAbsolute,
	isUnder,
	joinPath,
	normalizePath,
	parentDir,
	relativeTo,
	segments,
	splitPath,
	trimTrailingSeparators,
} from "@/lib/project/paths";

const POSIX = "/proj/src/main.cpp";
const WIN = "C:\\proj\\src\\main.cpp";
const WIN_FORWARD = "C:/proj/src/main.cpp";

describe("fileName", () => {
	test("takes the last segment of either separator", () => {
		expect(fileName(POSIX)).toBe("main.cpp");
		expect(fileName(WIN)).toBe("main.cpp");
		expect(fileName(WIN_FORWARD)).toBe("main.cpp");
	});

	test("ignores a trailing separator", () => {
		expect(fileName("/proj/src/")).toBe("src");
		expect(fileName("C:\\proj\\src\\")).toBe("src");
	});

	test("keeps a bare name and a drive letter", () => {
		expect(fileName("main.cpp")).toBe("main.cpp");
		expect(fileName("C:\\proj")).toBe("proj");
	});
});

describe("parentDir", () => {
	test("walks up one segment of either separator", () => {
		expect(parentDir(POSIX)).toBe("/proj/src");
		expect(parentDir(WIN)).toBe("C:\\proj\\src");
		expect(parentDir(WIN_FORWARD)).toBe("C:/proj/src");
	});

	test("ignores a trailing separator on the input", () => {
		expect(parentDir("/proj/src/")).toBe("/proj");
		expect(parentDir("C:\\proj\\src\\")).toBe("C:\\proj");
	});

	test("a path directly under its root has no parent to refresh", () => {
		expect(parentDir("/proj")).toBeNull();
		expect(parentDir("C:\\proj")).toBeNull();
		expect(parentDir("C:/proj")).toBeNull();
	});

	test("a root has no parent", () => {
		expect(parentDir("/")).toBeNull();
		expect(parentDir("C:\\")).toBeNull();
		expect(parentDir("C:/")).toBeNull();
	});

	test("a relative path with one segment has no parent", () => {
		expect(parentDir("main.cpp")).toBeNull();
		expect(parentDir("C:main.cpp")).toBeNull();
	});
});

describe("directoryOf", () => {
	test("answers the directory part of either separator", () => {
		expect(directoryOf(POSIX)).toBe("/proj/src");
		expect(directoryOf(WIN)).toBe("C:\\proj\\src");
	});

	test("answers an empty string when there is no directory", () => {
		expect(directoryOf("main.cpp")).toBe("");
		expect(directoryOf("C:\\")).toBe("");
	});
});

describe("joinPath", () => {
	test("joins with the parent's own separator", () => {
		expect(joinPath("/proj/src", "main.cpp")).toBe(POSIX);
		expect(joinPath("C:\\proj\\src", "main.cpp")).toBe(WIN);
		expect(joinPath("C:/proj/src", "main.cpp")).toBe(WIN_FORWARD);
	});

	test("collapses a trailing separator on the parent", () => {
		expect(joinPath("/proj/src/", "main.cpp")).toBe(POSIX);
		expect(joinPath("C:\\proj\\src\\", "main.cpp")).toBe(WIN);
	});

	test("keeps a root as one separator", () => {
		expect(joinPath("/", "main.cpp")).toBe("/main.cpp");
		expect(joinPath("C:\\", "main.cpp")).toBe("C:\\main.cpp");
	});
});

describe("isUnder", () => {
	test("a nested file is inside", () => {
		expect(isUnder("/proj", POSIX)).toBe(true);
		expect(isUnder("C:\\proj", WIN)).toBe(true);
		expect(isUnder("C:\\proj", WIN_FORWARD)).toBe(true);
	});

	test("the root itself is inside", () => {
		expect(isUnder("/proj", "/proj")).toBe(true);
		expect(isUnder("C:\\proj", "C:\\proj")).toBe(true);
		expect(isUnder("C:\\", "C:\\proj")).toBe(true);
	});

	test("a shared prefix is not a parent", () => {
		expect(isUnder("/proj", "/proj-2/src/main.cpp")).toBe(false);
		expect(isUnder("C:\\proj", "C:\\proj-2\\src\\main.cpp")).toBe(false);
	});

	test("a path above the root is not inside", () => {
		expect(isUnder("/proj/src", "/proj/main.cpp")).toBe(false);
		expect(isUnder("C:\\proj\\src", "C:\\proj\\main.cpp")).toBe(false);
	});

	test("empty values are not inside", () => {
		expect(isUnder("", POSIX)).toBe(false);
		expect(isUnder("/proj", "")).toBe(false);
	});
});

describe("relativeTo", () => {
	test("drops the root prefix", () => {
		expect(relativeTo("/proj", POSIX)).toBe("src/main.cpp");
		expect(relativeTo("C:\\proj", WIN)).toBe("src/main.cpp");
		expect(relativeTo("C:/proj/src", WIN_FORWARD)).toBe("main.cpp");
	});

	test("a trailing separator on the root still matches", () => {
		expect(relativeTo("/proj/", POSIX)).toBe("src/main.cpp");
		expect(relativeTo("C:\\proj\\", WIN)).toBe("src/main.cpp");
	});

	test("the root itself is an empty relative path", () => {
		expect(relativeTo("/proj", "/proj")).toBe("");
	});

	test("a path outside the root has no relative part", () => {
		expect(relativeTo("/proj", "/other/main.cpp")).toBeNull();
		expect(relativeTo("C:\\proj", "C:\\other\\main.cpp")).toBeNull();
	});
});

describe("isAbsolute", () => {
	test("recognises POSIX, drive and UNC roots", () => {
		expect(isAbsolute("/proj")).toBe(true);
		expect(isAbsolute("C:\\proj")).toBe(true);
		expect(isAbsolute("C:/proj")).toBe(true);
		expect(isAbsolute("\\\\server\\share")).toBe(true);
	});

	test("a relative path and a drive-relative path are not absolute", () => {
		expect(isAbsolute("src/main.cpp")).toBe(false);
		expect(isAbsolute("C:main.cpp")).toBe(false);
	});
});

describe("segments", () => {
	test("splits either separator and drops empty parts", () => {
		expect(segments(POSIX)).toEqual(["proj", "src", "main.cpp"]);
		expect(segments(WIN)).toEqual(["C:", "proj", "src", "main.cpp"]);
		expect(segments("C:/proj/src/main.cpp")).toEqual(["C:", "proj", "src", "main.cpp"]);
	});
});

describe("splitPath", () => {
	test("splits either separator", () => {
		expect(splitPath(POSIX)).toEqual({ dir: "/proj/src", name: "main.cpp" });
		expect(splitPath(WIN)).toEqual({ dir: "C:\\proj\\src", name: "main.cpp" });
	});

	test("ignores a trailing separator", () => {
		expect(splitPath("/proj/src/")).toEqual({ dir: "/proj", name: "src" });
		expect(splitPath("C:\\proj\\src\\")).toEqual({ dir: "C:\\proj", name: "src" });
	});

	test("a bare name has no directory", () => {
		expect(splitPath("main.cpp")).toEqual({ dir: "", name: "main.cpp" });
	});
});

describe("normalizePath and trimTrailingSeparators", () => {
	test("normalizePath turns backslashes into forward slashes", () => {
		expect(normalizePath(WIN)).toBe(WIN_FORWARD);
	});

	test("trimTrailingSeparators keeps a root intact", () => {
		expect(trimTrailingSeparators("/proj/")).toBe("/proj");
		expect(trimTrailingSeparators("C:\\proj\\")).toBe("C:\\proj");
		expect(trimTrailingSeparators("/")).toBe("/");
		expect(trimTrailingSeparators("C:\\")).toBe("C:\\");
	});
});
