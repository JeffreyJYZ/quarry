/**
 * The fixture set, one module per family: a fixture module never imports a judge or the entry.
 */

export { generatorFixture } from "./generator";
export { GCC_STDOUT, gccLauncherFixture, gccToolchainFixture, type ToolchainPaths } from "./gcc";
export { MULTI_CONFIG_LEVELS, multiConfigFixture } from "./multi-config";
export { mixedLanguagesFixture, plainFixture } from "./plain";
export { presetsFixture, toolchainFixture } from "./presets";
export { profileFixture, twoTargetsFixture } from "./profiles";
export { multiTargetFixture, systemHeaderFixture } from "./projects";
export { cmakeHeader, type AnalysisProbe, type Fixture } from "./types";
export {
	configProbe,
	VS_BUILD_DIR,
	VS_EXE,
	VS_HALVES,
	VS_TARGET,
	type VsHalf,
	vsFixture,
} from "./windows";
