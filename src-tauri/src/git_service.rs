use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitRepoStatus {
    pub is_repo: bool,
    pub branch: String,
    pub remote_url: Option<String>,
    pub clean: bool,
    pub modified_count: usize,
    pub untracked_count: usize,
    pub last_commit_message: Option<String>,
    pub last_commit_hash: Option<String>,
    pub last_commit_date: Option<String>,
    pub repo_root: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommitEntry {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

fn resolve_dir(input_path: &str) -> PathBuf {
    let p = Path::new(input_path);
    if p.is_file() {
        p.parent().unwrap_or(p).to_path_buf()
    } else if p.exists() {
        p.to_path_buf()
    } else {
        // Fallback: if input_path doesn't exist, try parent or current dir
        p.parent().unwrap_or_else(|| Path::new(".")).to_path_buf()
    }
}

fn run_git_cmd(dir: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .map_err(|e| format!("Failed to execute git command: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if err.is_empty() {
            format!("git {:?} failed with exit code {:?}", args, output.status.code())
        } else {
            err
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub fn git_get_status(path: String) -> Result<GitRepoStatus, String> {
    let dir = resolve_dir(&path);

    // Check if inside git work tree
    let is_inside = run_git_cmd(&dir, &["rev-parse", "--is-inside-work-tree"]);
    if is_inside.is_err() || is_inside.unwrap() != "true" {
        return Ok(GitRepoStatus {
            is_repo: false,
            branch: String::new(),
            remote_url: None,
            clean: true,
            modified_count: 0,
            untracked_count: 0,
            last_commit_message: None,
            last_commit_hash: None,
            last_commit_date: None,
            repo_root: None,
        });
    }

    let repo_root = run_git_cmd(&dir, &["rev-parse", "--show-toplevel"]).ok();
    let branch = run_git_cmd(&dir, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_else(|_| "main".to_string());
    let remote_url = run_git_cmd(&dir, &["config", "--get", "remote.origin.url"]).ok();

    // Check porcelain status
    let status_out = run_git_cmd(&dir, &["status", "--porcelain"]).unwrap_or_default();
    let mut modified_count = 0;
    let mut untracked_count = 0;
    for line in status_out.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("??") {
            untracked_count += 1;
        } else if !trimmed.is_empty() {
            modified_count += 1;
        }
    }
    let clean = modified_count == 0 && untracked_count == 0;

    // Last commit info
    let (last_commit_hash, last_commit_message, last_commit_date) = match run_git_cmd(
        &dir,
        &["log", "-1", "--format=%H%x1f%s%x1f%cr"],
    ) {
        Ok(out) if !out.is_empty() => {
            let parts: Vec<&str> = out.split('\x1f').collect();
            let hash = parts.first().map(|s| s.to_string());
            let msg = parts.get(1).map(|s| s.to_string());
            let date = parts.get(2).map(|s| s.to_string());
            (hash, msg, date)
        }
        _ => (None, None, None),
    };

    Ok(GitRepoStatus {
        is_repo: true,
        branch,
        remote_url,
        clean,
        modified_count,
        untracked_count,
        last_commit_message,
        last_commit_hash,
        last_commit_date,
        repo_root,
    })
}

#[tauri::command]
pub fn git_get_history(path: String, limit: Option<usize>) -> Result<Vec<GitCommitEntry>, String> {
    let dir = resolve_dir(&path);
    let n = limit.unwrap_or(30).to_string();

    let out = match run_git_cmd(&dir, &["log", "-n", &n, "--format=%H%x1f%h%x1f%s%x1f%an%x1f%cr"]) {
        Ok(s) => s,
        Err(_) => return Ok(Vec::new()),
    };

    let mut entries = Vec::new();
    for line in out.lines() {
        let parts: Vec<&str> = line.split('\x1f').collect();
        if parts.len() >= 5 {
            entries.push(GitCommitEntry {
                hash: parts[0].to_string(),
                short_hash: parts[1].to_string(),
                message: parts[2].to_string(),
                author: parts[3].to_string(),
                date: parts[4].to_string(),
            });
        }
    }

    Ok(entries)
}

#[tauri::command]
pub fn git_commit_snapshot(
    path: String,
    message: String,
    files: Option<Vec<String>>,
) -> Result<String, String> {
    let dir = resolve_dir(&path);

    // Stage files
    if let Some(target_files) = files {
        if !target_files.is_empty() {
            let mut args = vec!["add", "--"];
            for f in &target_files {
                args.push(f.as_str());
            }
            run_git_cmd(&dir, &args)?;
        } else {
            run_git_cmd(&dir, &["add", "-A"])?;
        }
    } else {
        run_git_cmd(&dir, &["add", "-A"])?;
    }

    let msg = if message.trim().is_empty() {
        "Snapshot project edit".to_string()
    } else {
        message.trim().to_string()
    };

    // Ensure user identity exists for commit
    let name_check = run_git_cmd(&dir, &["config", "--get", "user.name"]);
    let email_check = run_git_cmd(&dir, &["config", "--get", "user.email"]);

    let mut commit_args = vec!["commit", "-m", &msg];
    let custom_name_arg = "-c";
    let custom_name_val = "user.name=Voix Studio";
    let custom_email_arg = "-c";
    let custom_email_val = "user.email=voix@local";

    let mut full_args = Vec::new();
    if name_check.is_err() || name_check.unwrap().is_empty() {
        full_args.push(custom_name_arg);
        full_args.push(custom_name_val);
    }
    if email_check.is_err() || email_check.unwrap().is_empty() {
        full_args.push(custom_email_arg);
        full_args.push(custom_email_val);
    }
    full_args.extend(commit_args.drain(..));

    let commit_out = run_git_cmd(&dir, &full_args)?;
    Ok(commit_out)
}

#[tauri::command]
pub fn git_init_repository(path: String) -> Result<String, String> {
    let dir = resolve_dir(&path);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    run_git_cmd(&dir, &["init"])?;

    // Create .gitignore to exclude heavy video binaries
    let gitignore_path = dir.join(".gitignore");
    if !gitignore_path.exists() {
        let gitignore_content = r#"# Voix Video Project .gitignore
# Exclude heavy video and audio binaries
*.mp4
*.mkv
*.mov
*.avi
*.webm
*.flv
*.wmv
*.wav
*.m4a
*.aac

# Cache, renders and temp files
cache/
output/
dist/
*.tmp
*.bak
.voix-cache/

# Explicitly keep project configurations, yaml scripts and subtitles
!*.voix.yaml
!*.voix.json
!*.yaml
!*.yml
!*.srt
!*.vtt
"#;
        fs::write(&gitignore_path, gitignore_content)
            .map_err(|e| format!("Failed to write .gitignore: {}", e))?;
    }

    let _ = run_git_cmd(&dir, &["add", ".gitignore"]);
    let _ = run_git_cmd(
        &dir,
        &[
            "-c",
            "user.name=Voix Studio",
            "-c",
            "user.email=voix@local",
            "commit",
            "-m",
            "Initialize Voix project repository (configured lightweight media filters)",
        ],
    );

    Ok("Initialized Git repository with video filters".to_string())
}

#[tauri::command]
pub fn git_set_remote_url(path: String, remote_url: String) -> Result<String, String> {
    let dir = resolve_dir(&path);
    let url = remote_url.trim();
    if url.is_empty() {
        return Err("Remote URL cannot be empty".to_string());
    }

    // Check if origin already exists
    let has_origin = run_git_cmd(&dir, &["remote", "get-url", "origin"]).is_ok();
    if has_origin {
        run_git_cmd(&dir, &["remote", "set-url", "origin", url])
    } else {
        run_git_cmd(&dir, &["remote", "add", "origin", url])
    }
}

#[tauri::command]
pub fn git_push_remote(path: String) -> Result<String, String> {
    let dir = resolve_dir(&path);
    let branch = run_git_cmd(&dir, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_else(|_| "main".to_string());
    run_git_cmd(&dir, &["push", "origin", &branch])
}

#[tauri::command]
pub fn git_read_file_at_commit(
    path: String,
    commit_hash: String,
    relative_file_path: String,
) -> Result<String, String> {
    let dir = resolve_dir(&path);
    let target = format!("{}:{}", commit_hash, relative_file_path);
    run_git_cmd(&dir, &["show", &target])
}
