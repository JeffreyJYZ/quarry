# Integration probes

Run all probes:

    bun scripts/integration.ts

Tool detection:

    bun scripts/detect-tools.ts          # required tools; exits 1 if missing
    bun scripts/detect-tools.ts --optional

Pinned versions: `docs/testing/tool-versions.md`.

Probes needing a GUI or debugger permission (`dap-cpp-probe`, `dap-eval-probe`, `dap-spike`) are marked SKIPPED, never forced.

## CI job

`.github/workflows/ci.yml` runs the probes in an `integration` job on `macos-latest`, separate from the `ci` gate job. It checks out the repo, installs Bun, installs Rust with the `rust-analyzer` component, caches the cargo registry, then runs `bun install --frozen-lockfile` and:

    bun scripts/detect-tools.ts
    bun scripts/integration.ts

The runner image already carries Xcode and Homebrew, so `clang`, `clangd`, `lldb-dap`, `cmake` and `ninja` need no install step; `rust-analyzer` is the only tool the job adds. `detect-tools` runs first so a missing toolchain prints one line per tool and exits 1 instead of surfacing later as a probe failure.

The job fails only when a probe that ran returns non-zero — that is the exit code `scripts/integration.ts` already produces, so there is no `continue-on-error`. A probe whose required tool is missing is SKIPPED, and the `manualOnly` probes are never run: they need `DevToolsSecurity` enabled, which the job does not do because it would require sudo.

The job has a 20-minute timeout, so a hung language server cannot hold a runner for hours.
