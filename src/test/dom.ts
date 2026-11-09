/**
 * A DOM for component tests.
 *
 * Imported for its side effect *before* `@testing-library/react`, so the testing library finds a
 * document when its module is evaluated. The guard lets one test worker load several files.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (typeof document === "undefined") GlobalRegistrator.register();
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
