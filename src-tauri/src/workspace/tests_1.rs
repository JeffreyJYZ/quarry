#![allow(unused_imports)]

pub(crate) use crate::ignore;
pub(crate) use crate::types::FileEntry;
pub use std::fs;
pub use std::fs::OpenOptions;
pub use std::io::Write;
#[cfg(unix)]
pub use std::os::unix::fs::PermissionsExt;
pub use std::path::Path;
pub use std::sync::atomic::{AtomicU64, Ordering};

use super::*;

/// Writes one text file atomically: write a sibling temporary file, then rename over the target.
///
/// The text is encoded with `encoding` first — the label the buffer was read with, so GB18030 stays
/// GB18030, a read byte-order mark is written again, and a file with no known encoding is UTF-8. A
/// label this build does not know is refused rather than written as UTF-8 behind the user's back.
///
/// The temporary file lives in the target's own directory, so the rename never crosses a
/// filesystem. Existing unix permissions are kept; a new file is created `0o644`. Parent
/// directories are never created, and no temporary file survives any outcome.
#[tauri::command]
pub fn write_text_file(path: String, text: String, encoding: Option<String>) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.is_absolute() {
        return Err(format!("cannot write {path}: not an absolute path"));
    }
    contained(target)?;
    let encoding = match encoding {
        Some(label) => TextEncoding::parse(&label)
            .map_err(|reason| format!("cannot write {path}: {reason}"))?,
        None => TextEncoding::Utf8,
    };
    let bytes =
        encode_text(&text, encoding).map_err(|reason| format!("cannot write {path}: {reason}"))?;
    let size = bytes.len() as u64;
    if size > MAX_TEXT_BYTES {
        return Err(format!(
            "cannot write {path}: {size} bytes exceeds the {MAX_TEXT_BYTES} byte limit"
        ));
    }

    let mode = match fs::metadata(target) {
        Ok(metadata) => {
            if metadata.is_dir() {
                return Err(format!("not a file: {path}"));
            }
            #[cfg(unix)]
            {
                metadata.permissions().mode() & 0o777
            }
            #[cfg(not(unix))]
            {
                NEW_FILE_MODE
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => NEW_FILE_MODE,
        Err(error) => return Err(format!("cannot write {path}: {error}")),
    };

    let parent = target
        .parent()
        .ok_or_else(|| format!("cannot write {path}: no directory"))?;
    if !parent.is_dir() {
        return Err(format!(
            "cannot write {path}: missing directory {}",
            parent.display()
        ));
    }
    let name = target
        .file_name()
        .ok_or_else(|| format!("cannot write {path}: no file name"))?;

    let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let temp = parent.join(format!(
        "{}.{}.{counter}.tmp",
        name.to_string_lossy(),
        std::process::id()
    ));

    let written = fill_temp_file(&temp, &bytes, mode)
        .and_then(|()| fs::rename(&temp, target).map_err(|error| error.to_string()));
    if let Err(error) = written {
        let _ = fs::remove_file(&temp);
        return Err(format!("cannot write {path}: {error}"));
    }
    Ok(())
}
/// Creates `temp` exclusively, writes the bytes, flushes them to disk and applies `mode`.
pub fn fill_temp_file(temp: &Path, bytes: &[u8], mode: u32) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(temp)
        .map_err(|error| error.to_string())?;
    file.write_all(bytes).map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    #[cfg(unix)]
    fs::set_permissions(temp, fs::Permissions::from_mode(mode))
        .map_err(|error| error.to_string())?;
    #[cfg(not(unix))]
    let _ = mode;
    Ok(())
}
