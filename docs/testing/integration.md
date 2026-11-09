# Integration probes

Run all probes:

    bun scripts/integration.ts

Tool detection:

    bun scripts/detect-tools.ts          # required tools; exits 1 if missing
    bun scripts/detect-tools.ts --optional

Pinned versions: `docs/testing/tool-versions.md`.

Probes needing a GUI or debugger permission (`dap-cpp-probe`, `dap-eval-probe`, `dap-spike`) are marked SKIPPED, never forced.

## CI job (text only, not applied)

```
integration:
  runs-on: macos-latest
  steps:
    - uses: actions/checkout@v4
    - uses: oven-sh/setup-bun@v2
    - run: rustup component add rust-analyzer
    - run: xcode-select --install || true
    - run: sudo DevToolsSecurity -enable
    - run: bun scripts/detect-tools.ts
    - run: bun scripts/integration.ts
```

Ubuntu variant installs `clangd-18 lldb-18 cmake ninja-build clang` via apt; lldb-dap probes remain skipped there.
