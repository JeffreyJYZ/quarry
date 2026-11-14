//! UTC timestamps for log lines, without a date crate.
//!
//! `SystemTime` gives seconds since the epoch; converting those to a calendar date is the standard
//! civil-from-days algorithm, which is a dozen lines and needs no dependency. UTC rather than local
//! time on purpose: a report can be matched against other tooling without knowing the machine's
//! zone, and the offset never shifts mid-file across a daylight-saving change.

use std::time::{SystemTime, UNIX_EPOCH};

/// The current instant as `YYYY-MM-DDTHH:MM:SSZ`.
pub fn now_stamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0);
    format_stamp(seconds)
}

/// Format whole seconds since the epoch. Exposed for the test so the shape is pinned.
pub fn format_stamp(seconds: u64) -> String {
    let days = (seconds / 86_400) as i64;
    let rest = seconds % 86_400;
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rest / 3600,
        rest % 3600 / 60,
        rest % 60
    )
}

/// Days since `1970-01-01` to a proleptic Gregorian `(year, month, day)`.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let shifted = days + 719_468;
    let era = if shifted >= 0 {
        shifted
    } else {
        shifted - 146_096
    } / 146_097;
    let day_of_era = (shifted - era * 146_097) as u32;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era as i64 + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_shifted = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_shifted + 2) / 5 + 1;
    let month = if month_shifted < 10 {
        month_shifted + 3
    } else {
        month_shifted - 9
    };
    (year + i64::from(month <= 2), month, day)
}
