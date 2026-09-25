use std::io::{self, Read};
use std::path::{Path, PathBuf};

use cap_std::fs::{Dir, File, Metadata};
use sha2::{Digest, Sha256};

#[derive(Debug)]
pub enum SourceAccessError {
    InvalidRoot,
    InvalidPath,
    LinkDenied,
    Changed,
    BudgetExceeded,
    Io(io::Error),
}

pub fn read_verified_source(
    root: &Path,
    relative_path: &str,
    expected_fingerprint: &str,
    max_bytes: usize,
) -> Result<Vec<u8>, SourceAccessError> {
    if !root.is_absolute() || !root.is_dir() {
        return Err(SourceAccessError::InvalidRoot);
    }
    let path = validate_relative_components(relative_path)?;
    let directory =
        Dir::open_ambient_dir(root, cap_std::ambient_authority()).map_err(SourceAccessError::Io)?;
    reject_linked_components(&directory, &path)?;
    let before = directory.symlink_metadata(&path).map_err(map_missing)?;
    if !before.is_file() || is_link_or_reparse(&before) {
        return Err(SourceAccessError::LinkDenied);
    }
    let mut file = directory.open(&path).map_err(map_missing)?;
    let opened = file.metadata().map_err(SourceAccessError::Io)?;
    if !same_file(&before, &opened) {
        return Err(SourceAccessError::Changed);
    }
    let bytes = read_bounded(&mut file, max_bytes)?;
    verify_unchanged_and_hash(
        &directory,
        &path,
        &file,
        &before,
        &bytes,
        expected_fingerprint,
    )?;
    Ok(bytes)
}

fn validate_relative_components(relative_path: &str) -> Result<PathBuf, SourceAccessError> {
    if relative_path.is_empty()
        || relative_path.contains('\\')
        || relative_path.contains(':')
        || relative_path
            .split('/')
            .any(|component| component.is_empty() || component == "." || component == "..")
        || Path::new(relative_path).is_absolute()
    {
        return Err(SourceAccessError::InvalidPath);
    }
    Ok(relative_path.split('/').collect())
}

fn reject_linked_components(directory: &Dir, path: &Path) -> Result<(), SourceAccessError> {
    let mut current = PathBuf::new();
    for component in path.components() {
        current.push(component);
        let metadata = directory.symlink_metadata(&current).map_err(map_missing)?;
        if is_link_or_reparse(&metadata) {
            return Err(SourceAccessError::LinkDenied);
        }
    }
    Ok(())
}

fn read_bounded(file: &mut File, max_bytes: usize) -> Result<Vec<u8>, SourceAccessError> {
    let mut bytes = Vec::new();
    file.take(max_bytes.saturating_add(1) as u64)
        .read_to_end(&mut bytes)
        .map_err(SourceAccessError::Io)?;
    if bytes.len() > max_bytes {
        return Err(SourceAccessError::BudgetExceeded);
    }
    Ok(bytes)
}

fn verify_unchanged_and_hash(
    directory: &Dir,
    path: &Path,
    file: &File,
    before: &Metadata,
    bytes: &[u8],
    expected_fingerprint: &str,
) -> Result<(), SourceAccessError> {
    let after_handle = file.metadata().map_err(SourceAccessError::Io)?;
    let after_path = directory.symlink_metadata(path).map_err(map_missing)?;
    reject_linked_components(directory, path)?;
    if !same_file(before, &after_handle)
        || !same_file(before, &after_path)
        || after_handle.len() != bytes.len() as u64
    {
        return Err(SourceAccessError::Changed);
    }
    let fingerprint = format!("sha256:{:x}", Sha256::digest(bytes));
    if expected_fingerprint != fingerprint {
        return Err(SourceAccessError::Changed);
    }
    Ok(())
}

fn same_file(left: &Metadata, right: &Metadata) -> bool {
    if !right.is_file()
        || is_link_or_reparse(right)
        || left.len() != right.len()
        || left.modified().ok() != right.modified().ok()
        || left.created().ok() != right.created().ok()
    {
        return false;
    }
    #[cfg(unix)]
    {
        use cap_std::fs::MetadataExt;
        if left.dev() != right.dev() || left.ino() != right.ino() {
            return false;
        }
    }
    true
}

fn is_link_or_reparse(metadata: &Metadata) -> bool {
    if metadata.is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use cap_std::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return true;
        }
    }
    false
}

fn map_missing(error: io::Error) -> SourceAccessError {
    if error.kind() == io::ErrorKind::NotFound {
        SourceAccessError::Changed
    } else {
        SourceAccessError::Io(error)
    }
}
