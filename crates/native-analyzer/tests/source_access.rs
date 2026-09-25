use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

use codeatlas_native_analyzer::source_access::{SourceAccessError, read_verified_source};
use sha2::{Digest, Sha256};

static NEXT_ID: AtomicUsize = AtomicUsize::new(0);

struct Scratch(PathBuf);

impl Scratch {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "codeatlas-source-access-{}-{}",
            std::process::id(),
            NEXT_ID.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).expect("test scratch removed");
    }
}

fn fingerprint(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

#[test]
fn reads_only_the_expected_bounded_source_bytes() {
    let scratch = Scratch::new();
    let root = scratch.path().join("repo");
    fs::create_dir_all(root.join("src")).unwrap();
    let bytes = b"class A {}";
    fs::write(root.join("src/A.java"), bytes).unwrap();
    assert_eq!(
        read_verified_source(&root, "src/A.java", &fingerprint(bytes), bytes.len()).unwrap(),
        bytes
    );
    assert!(matches!(
        read_verified_source(&root, "src/A.java", &fingerprint(bytes), bytes.len() - 1),
        Err(SourceAccessError::BudgetExceeded)
    ));
}

#[test]
fn rejects_traversal_absolute_paths_and_missing_files() {
    let scratch = Scratch::new();
    let root = scratch.path().join("repo");
    fs::create_dir_all(root.join("src")).unwrap();
    for path in [
        "src/../secret.java",
        "../secret.java",
        "/secret.java",
        "C:/secret.java",
        "src//A.java",
        "src\\A.java",
    ] {
        assert!(
            matches!(
                read_verified_source(&root, path, &fingerprint(b"secret"), 4096),
                Err(SourceAccessError::InvalidPath)
            ),
            "accepted {path}"
        );
    }
    assert!(matches!(
        read_verified_source(&root, "src/Missing.java", &fingerprint(b""), 4096),
        Err(SourceAccessError::Changed)
    ));
    assert!(matches!(
        read_verified_source(Path::new("relative"), "src/A.java", &fingerprint(b""), 4096),
        Err(SourceAccessError::InvalidRoot)
    ));
}

#[test]
fn same_length_replacement_is_source_changed() {
    let scratch = Scratch::new();
    let root = scratch.path().join("repo");
    fs::create_dir_all(root.join("src")).unwrap();
    fs::write(root.join("src/A.java"), b"class B {}").unwrap();
    assert!(matches!(
        read_verified_source(&root, "src/A.java", &fingerprint(b"class A {}"), 4096),
        Err(SourceAccessError::Changed)
    ));
}

#[test]
fn symlinked_parent_and_file_are_denied() {
    let scratch = Scratch::new();
    let root = scratch.path().join("repo");
    let outside = scratch.path().join("outside");
    fs::create_dir_all(&root).unwrap();
    fs::create_dir_all(&outside).unwrap();
    fs::write(outside.join("A.java"), b"private sentinel").unwrap();
    if !make_dir_link(&outside, &root.join("linked")) {
        eprintln!("SKIP symlinked parent: OS did not permit link creation");
        return;
    }
    assert!(matches!(
        read_verified_source(
            &root,
            "linked/A.java",
            &fingerprint(b"private sentinel"),
            4096
        ),
        Err(SourceAccessError::LinkDenied)
    ));
    if make_file_link(&outside.join("A.java"), &root.join("Alias.java")) {
        assert!(matches!(
            read_verified_source(&root, "Alias.java", &fingerprint(b"private sentinel"), 4096),
            Err(SourceAccessError::LinkDenied)
        ));
    } else {
        eprintln!("SKIP symlinked file: OS did not permit link creation");
    }
}

#[cfg(windows)]
#[test]
fn junction_parent_is_denied_without_reading_outside_bytes() {
    let scratch = Scratch::new();
    let root = scratch.path().join("repo");
    let outside = scratch.path().join("outside");
    fs::create_dir_all(&root).unwrap();
    fs::create_dir_all(&outside).unwrap();
    fs::write(outside.join("A.java"), b"private sentinel").unwrap();
    let junction = root.join("junction");
    let output = std::process::Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(&junction)
        .arg(&outside)
        .output()
        .expect("cmd available on Windows");
    if !output.status.success() {
        eprintln!("SKIP junction parent: OS did not permit junction creation");
        return;
    }
    assert!(matches!(
        read_verified_source(
            &root,
            "junction/A.java",
            &fingerprint(b"private sentinel"),
            4096
        ),
        Err(SourceAccessError::LinkDenied)
    ));
    fs::remove_dir(&junction).expect("junction removed without visiting target");
}

#[cfg(windows)]
fn make_dir_link(target: &Path, link: &Path) -> bool {
    std::os::windows::fs::symlink_dir(target, link).is_ok()
}
#[cfg(unix)]
fn make_dir_link(target: &Path, link: &Path) -> bool {
    std::os::unix::fs::symlink(target, link).is_ok()
}
#[cfg(windows)]
fn make_file_link(target: &Path, link: &Path) -> bool {
    std::os::windows::fs::symlink_file(target, link).is_ok()
}
#[cfg(unix)]
fn make_file_link(target: &Path, link: &Path) -> bool {
    std::os::unix::fs::symlink(target, link).is_ok()
}
