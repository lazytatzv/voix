use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Default)]
pub struct WatcherState {
    pub watchers: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct FileChangeEvent {
    pub path: String,
    pub content: String,
}

#[tauri::command]
pub fn open_in_external_editor(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    let target = if p.is_file() {
        p.parent().unwrap_or(p)
    } else {
        p
    };

    // Try VS Code first
    if Command::new("code").arg(target).spawn().is_ok() {
        return Ok("Opened in VS Code".to_string());
    }

    // Fallback to xdg-open / system default
    if Command::new("xdg-open").arg(target).spawn().is_ok() {
        return Ok("Opened in default system viewer".to_string());
    }

    Err("Could not launch code or system editor".to_string())
}

#[tauri::command]
pub fn start_file_watcher(
    app: AppHandle,
    state: tauri::State<'_, WatcherState>,
    file_path: String,
) -> Result<(), String> {
    let path_buf = PathBuf::from(&file_path);
    if !path_buf.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    let mut map = state.watchers.lock().unwrap();
    // Stop any existing watcher for this file
    if let Some(existing) = map.remove(&file_path) {
        existing.store(true, Ordering::Relaxed);
    }

    let shutdown_flag = Arc::new(AtomicBool::new(false));
    map.insert(file_path.clone(), Arc::clone(&shutdown_flag));

    let watch_path = file_path.clone();
    let thread_flag = Arc::clone(&shutdown_flag);

    thread::Builder::new()
        .name(format!("voix-watcher-{}", watch_path))
        .spawn(move || {
            let mut last_modified = fs::metadata(&watch_path)
                .and_then(|m| m.modified())
                .ok();

            while !thread_flag.load(Ordering::Relaxed) {
                thread::sleep(Duration::from_millis(400));
                if thread_flag.load(Ordering::Relaxed) {
                    break;
                }

                if let Ok(meta) = fs::metadata(&watch_path) {
                    if let Ok(modified) = meta.modified() {
                        if Some(modified) != last_modified {
                            last_modified = Some(modified);
                            // Debounce brief write locks
                            thread::sleep(Duration::from_millis(60));
                            if let Ok(content) = fs::read_to_string(&watch_path) {
                                let _ = app.emit(
                                    "file-changed:script",
                                    FileChangeEvent {
                                        path: watch_path.clone(),
                                        content,
                                    },
                                );
                            }
                        }
                    }
                }
            }
        })
        .map_err(|e| format!("Failed to spawn watcher thread: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn stop_file_watcher(
    state: tauri::State<'_, WatcherState>,
    file_path: String,
) -> Result<(), String> {
    let mut map = state.watchers.lock().unwrap();
    if let Some(flag) = map.remove(&file_path) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
pub fn generate_vscode_project(
    target_dir: String,
    project_name: String,
    script_yaml: String,
) -> Result<String, String> {
    let dir = Path::new(&target_dir);
    if !dir.exists() {
        fs::create_dir_all(dir).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let safe_name = if project_name.trim().is_empty() {
        "video_project".to_string()
    } else {
        project_name
            .trim()
            .replace(|c: char| !c.is_alphanumeric() && c != '_' && c != '-', "_")
    };

    // 1. Write the main script YAML file
    let script_file = dir.join(format!("{}.voix.yaml", safe_name));
    fs::write(&script_file, &script_yaml)
        .map_err(|e| format!("Failed to write script file: {}", e))?;

    // 2. Create .vscode directory
    let vscode_dir = dir.join(".vscode");
    if !vscode_dir.exists() {
        let _ = fs::create_dir_all(&vscode_dir);
    }

    // 3. Write VS Code snippets for rapid dialogue editing
    let snippets_json = r#"{
  "Dialogue Line (Zundamon)": {
    "prefix": "z",
    "body": [
      "- z: \"$1\""
    ],
    "description": "Zundamon dialogue line"
  },
  "Dialogue Line with Emotion (Zundamon)": {
    "prefix": "z-smile",
    "body": [
      "- z(smile): \"$1\""
    ],
    "description": "Zundamon smiling line"
  },
  "Dialogue Line (Metan)": {
    "prefix": "m",
    "body": [
      "- m: \"$1\""
    ],
    "description": "Metan dialogue line"
  },
  "Dialogue Line with Emotion (Metan)": {
    "prefix": "m-smile",
    "body": [
      "- m(smile): \"$1\""
    ],
    "description": "Metan smiling line"
  },
  "Dialogue with Sound Effect": {
    "prefix": "se",
    "body": [
      "- z: \"$1\"",
      "  se: ${2|pop,chime,boom,punch,slash,question,shock,applause|}"
    ],
    "description": "Dialogue line with synchronized sound effect"
  },
  "Terminal / Command Card": {
    "prefix": "cmd",
    "body": [
      "- z: \"$1\"",
      "  cmd: \"$2\"",
      "  output: \"$3\"",
      "  se: chime",
      "  anim: bounce"
    ],
    "description": "Dev terminal command snippet card"
  },
  "Pause / Timing Wait": {
    "prefix": "pause",
    "body": [
      "- pause: ${1:0.5}"
    ],
    "description": "Timing pause between lines"
  }
}
"#;
    let _ = fs::write(vscode_dir.join("voix-snippets.code-snippets"), snippets_json);

    // 4. Write .vscode/extensions.json
    let extensions_json = r#"{
  "recommendations": [
    "redhat.vscode-yaml"
  ]
}
"#;
    let _ = fs::write(vscode_dir.join("extensions.json"), extensions_json);

    // 5. Write .vscode/settings.json
    let settings_json = r#"{
  "[yaml]": {
    "editor.tabSize": 2,
    "editor.insertSpaces": true,
    "editor.quickSuggestions": {
      "other": true,
      "comments": false,
      "strings": true
    }
  }
}
"#;
    let _ = fs::write(vscode_dir.join("settings.json"), settings_json);

    // 6. Write README.md
    let readme_content = format!(
        r#"# {safe_name} - Voix Studio Video Project

This project was generated by **Voix Studio** (STM32CubeMX-style Code Generator).

## Workflow (Edit in Code, Preview in Voix)
1. Open this folder in **VS Code** (`code .`).
2. Edit `{safe_name}.voix.yaml` using your favorite keyboard shortcuts & snippets:
   - Type `z` + Tab -> `- z: "..."`
   - Type `m` + Tab -> `- m: "..."`
   - Type `cmd` + Tab -> Terminal execution card with SE & animation
   - Type `se` + Tab -> Synchronized sound effect
3. Whenever you save (`Ctrl+S`), **Voix Studio live-reloads the video timeline and audio preview**.
4. Version control with Git:
   - Run `git add . && git commit -m "update script"`
   - Video files are excluded via `.gitignore` to keep your repository lightweight (<100KB).
"#
    );
    let _ = fs::write(dir.join("README.md"), readme_content);

    Ok(script_file.to_string_lossy().to_string())
}
