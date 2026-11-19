extern crate self as codeatlas_native_analyzer;
mod analyze;
mod protocol;
#[doc(hidden)]
pub use protocol::{serve_once, serve_once_with_workers};
pub mod analysis_state;
#[doc(hidden)]
pub mod fixed_commit;
pub mod java;
pub mod java_relations;
pub mod java_syntax;
pub mod language;
pub mod python;
pub mod relation_index;
pub mod request_v3;
pub mod retained;
pub mod source_access;
pub mod syntax;
mod syntax_dispatch;
mod syntax_producer;

pub mod code_syntax;
mod code_syntax_producer;

pub mod binding_syntax;

pub mod binding_sufficiency;

#[cfg(test)]
mod framework_source_characterization;

pub mod framework_surface;
