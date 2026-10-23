//! Wire shapes shared by the Tauri commands and the frontend.
//!
//! Frozen for P0: `src/project/api.ts` mirrors every type here. Add fields only by decision of the
//! controller, never from inside a unit.

#![allow(unused_imports)]
pub use serde::{Deserialize, Serialize};

mod toolsource;
pub use toolsource::*;

mod dapsession;
pub use dapsession::*;

mod launchfile;
pub use launchfile::*;

mod signaturehelp;
pub use signaturehelp::*;
