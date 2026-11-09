//! The debounce decision: a burst becomes one batch, one path becomes one entry.

#![allow(unused_imports)]

use super::*;

#[cfg(test)]
mod debounce {
    use super::*;

    fn at(start: Instant, millis: u64) -> Instant {
        start + Duration::from_millis(millis)
    }

    #[test]
    fn rapid_events_for_one_path_collapse_to_one_entry() {
        let start = Instant::now();
        let mut coalescer = Coalescer::new(Duration::from_millis(250));
        for step in 0..8 {
            coalescer.push("/project/src/main.rs".to_string(), at(start, step * 10));
        }
        assert_eq!(
            coalescer.take(at(start, 249)),
            None,
            "the window is still open"
        );
        assert_eq!(
            coalescer.take(at(start, 329)),
            Some(vec!["/project/src/main.rs".to_string()]),
            "eight events for one path are one entry"
        );
    }

    #[test]
    fn different_paths_in_one_burst_become_one_sorted_batch() {
        let start = Instant::now();
        let mut coalescer = Coalescer::new(Duration::from_millis(250));
        coalescer.push("/project/b.rs".to_string(), at(start, 0));
        coalescer.push("/project/a.rs".to_string(), at(start, 30));
        coalescer.push("/project/c.rs".to_string(), at(start, 60));
        assert_eq!(
            coalescer.take(at(start, 310)),
            Some(vec![
                "/project/a.rs".to_string(),
                "/project/b.rs".to_string(),
                "/project/c.rs".to_string(),
            ])
        );
    }

    #[test]
    fn a_batch_is_handed_out_once() {
        let start = Instant::now();
        let mut coalescer = Coalescer::new(Duration::from_millis(250));
        coalescer.push("/project/src/lib.rs".to_string(), at(start, 0));
        assert!(coalescer.take(at(start, 500)).is_some());
        assert!(coalescer.is_empty(), "a taken batch leaves nothing behind");
        assert_eq!(coalescer.take(at(start, 900)), None);
    }
}
