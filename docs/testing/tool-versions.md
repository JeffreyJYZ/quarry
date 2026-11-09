# Pinned tool versions for integration probes

The probes under `scripts/lsp-*.ts`, `scripts/dap-*.ts` and `scripts/cxx-smoke.ts` need these tools on PATH.

| Tool          | Pinned                                                             | How to install                                                                |
| ------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| rust-analyzer | 1.99.0 (rustup component, matches rustc 1.99)                      | `rustup component add rust-analyzer`                                          |
| clangd        | Apple clangd 21.0.0 (clang-2100.4.1.1) on macOS; LLVM 18 on Ubuntu | macOS: Xcode; Ubuntu: `apt install clangd-18`                                 |
| lldb-dap      | Xcode LLVM 21.0.0 (`xcrun --find lldb-dap`)                        | macOS: Xcode + `sudo DevToolsSecurity -enable`; Ubuntu: `apt install lldb-18` |
| cmake         | 3.28+                                                              | macOS: `brew install cmake`; Ubuntu: `apt install cmake`                      |
| ninja         | 1.11+                                                              | macOS: `brew install ninja`; Ubuntu: `apt install ninja-build`                |
| clang++       | Apple clang 21 / clang 18                                          | macOS: Xcode; Ubuntu: `apt install clang`                                     |

Detection order: PATH first, then `/opt/homebrew/bin`, `/usr/local/bin`, `~/.cargo/bin`, then `xcrun --find` for Apple tools. See `scripts/detect-tools.ts`.
