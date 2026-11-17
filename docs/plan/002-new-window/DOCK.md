# Dock menu lane

macOS only. Right-clicking quarry's Dock icon must offer **New Window**.

Tauri 2.12 has no dock-menu API — `rg -ri dockmenu` over `tauri`, `tauri-runtime-wry`, `tao`,
`wry` and `muda` in `~/.cargo/registry/src/index.crates.io-*/` returns nothing. So this is an
AppKit job, in our own crate.

## Hard constraints

- The file set is `src-tauri/src/dock/**` only. You may **not** edit `src-tauri/src/lib.rs`,
  `menu/mod.rs`, `lifecycle.rs`, `tauri.conf.json` or anything outside `dock/`; the wiring is done
  by the parent after your branch lands.
- The public entry point is exactly:

    ```rust
    pub fn install<F>(app: &tauri::AppHandle, on_new_window: F) -> Result<(), String>
    where
        F: Fn() + Send + Sync + 'static;
    ```

    It registers the Dock menu so the callback fires when the item is chosen. It compiles and does
    nothing on non-macOS arms: `#[cfg(not(target_os = "macos"))] pub fn install<F>(...) -> Result<(), String> { Ok(()) }`.

- AppKit work is `#[cfg(target_os = "macos")]`. `objc2` / `objc2-app-kit` 0.3 / `objc2-foundation`
  are already in the lockfile (they come in through Tauri), but **a direct dependency must be added
  to `src-tauri/Cargo.toml`** — that one file is the single exception to the file-set rule, because
  a crate cannot use a dependency it does not declare. Add the minimum features.
- Never launch the app. `cargo check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`
  and `rustfmt` only.

## The delegate problem, stated so you do not trip on it

`NSApplication.applicationDockMenu` is an `NSApplicationDelegate` method, and AppKit already owns a
delegate it sets up itself (Tauri/tao rely on it for `applicationWillFinishLaunching`,
`applicationShouldTerminateAfterLastWindowClosed` and friends). Installing our own delegate that
does not forward quietly breaks window and quit behaviour.

Any correct answer forwards everything it does not implement to the previous delegate
(`forwardingTargetForSelector:`, or a wrapper that answers `respondsToSelector:` for the original
delegate's selectors). Choose an approach you can defend in one paragraph, and write that reasoning
into the module doc comment.

## Verification you can actually do without a GUI

- The menu construction and its item title/action are testable in isolation where possible.
- The forwarding wrapper's selector decisions are testable as pure functions.
- `cargo clippy --all-targets -- -D warnings` with the macOS arm active on this machine.
- Say plainly which part only a real Dock right-click can prove.
