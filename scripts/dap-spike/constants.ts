/**
 * What the spike measures against, and the timeouts it waits with.
 *
 * The generated project is fixed on purpose: every reading in `docs/spikes/dap.md` is about these
 * exact locals, so a probe that generated a different program would not reproduce that table.
 */

export const REQUEST_TIMEOUT_MS = 20_000;
export const EVENT_TIMEOUT_MS = 20_000;

/** The bytes `MAIN_RS` puts in the `Vec`, and what `readMemory` must return from the pointer. */
export const KNOWN_BYTES = [0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22, 0x33];
export const KNOWN_STRING = "quarry";
export const KNOWN_OPTION_VALUE = 1234;

export const CARGO_GUESS = "/opt/homebrew/opt/rustup/bin/cargo";

export const MAIN_RS = `use std::hint::black_box;

static mut COUNTER: u32 = 0;

fn inspect(tag: u8) -> u64 {
    let v: Vec<u8> = vec![0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22, 0x33];
    let s: String = String::from("${KNOWN_STRING}");
    let o: Option<u32> = Some(${KNOWN_OPTION_VALUE});
    let raw: *const u8 = v.as_ptr();
    let n: u32 = v.len() as u32;
    unsafe { COUNTER += n; }
    black_box((&v, &s, &o, raw, n, tag));
    let sum = black_box(unsafe { *raw } as u64 + n as u64 + tag as u64);
    sum
}

fn main() {
    let a = inspect(1);
    let b = inspect(2);
    black_box(a + b);
    println!("{a} {b}");
}
`;
