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
    script_code: String,
    format: Option<String>,
    type_def: Option<String>,
    voix_lib: Option<String>,
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

    let fmt = format.unwrap_or_else(|| "js".to_string());
    let is_js = fmt == "js" || fmt == "javascript" || fmt == "ts";

    let (script_file, script_filename) = if is_js {
        (dir.join(format!("{}.js", safe_name)), format!("{}.js", safe_name))
    } else {
        (dir.join(format!("{}.voix.yaml", safe_name)), format!("{}.voix.yaml", safe_name))
    };

    // 1. Write the main script file
    fs::write(&script_file, &script_code)
        .map_err(|e| format!("Failed to write script file: {}", e))?;

    // 2. Create .vscode directory
    let vscode_dir = dir.join(".vscode");
    if !vscode_dir.exists() {
        let _ = fs::create_dir_all(&vscode_dir);
    }

    if is_js {
        // Write TypeScript definitions for rich VS Code auto-completion
        if let Some(types) = type_def {
            let _ = fs::write(dir.join("voix.d.ts"), types);
        }
        // Write ES module stub for Node/bundler runtime
        if let Some(lib) = voix_lib {
            let _ = fs::write(dir.join("voix.js"), lib);
        }

        // package.json for ES module support in modern editors
        let package_json = format!(
            r#"{{
  "name": "{}",
  "version": "1.0.0",
  "type": "module",
  "description": "Voix Studio Video Script Project"
}}
"#,
            safe_name
        );
        let _ = fs::write(dir.join("package.json"), package_json);

        // VS Code snippets for JavaScript
        let snippets_json = r#"{
  "Dialogue Line (Zundamon)": {
    "prefix": "z",
    "body": [
      "z(\"$1\");"
    ],
    "description": "Zundamon dialogue line"
  },
  "Dialogue Line with Emotion (Zundamon)": {
    "prefix": "z-smile",
    "body": [
      "z(\"$1\", { expr: \"smile\" });"
    ],
    "description": "Zundamon smiling line"
  },
  "Dialogue Line (Metan)": {
    "prefix": "m",
    "body": [
      "m(\"$1\");"
    ],
    "description": "Metan dialogue line"
  },
  "Dialogue Line with Emotion (Metan)": {
    "prefix": "m-smile",
    "body": [
      "m(\"$1\", { expr: \"smile\" });"
    ],
    "description": "Metan smiling line"
  },
  "Command execution card": {
    "prefix": "cmd",
    "body": [
      "cmd(\"$1\", \"$2\", { se: \"enter\" });"
    ],
    "description": "Dev terminal command execution"
  },
  "Pause / Timing Wait": {
    "prefix": "pause",
    "body": [
      "pause(${1:0.5});"
    ],
    "description": "Pause timeline"
  },
  "For Loop (Dialogue Generator)": {
    "prefix": "forsteps",
    "body": [
      "const steps = [\"$1\", \"$2\"];",
      "for (const step of steps) {",
      "  z(step);",
      "  pause(0.5);",
      "}"
    ],
    "description": "Loop over steps with dialogue"
  }
}
"#;
        let _ = fs::write(vscode_dir.join("voix-snippets.code-snippets"), snippets_json);

        let settings_json = r#"{
  "javascript.suggest.completeFunctionCalls": true,
  "typescript.suggest.completeFunctionCalls": true,
  "editor.tabSize": 2,
  "editor.insertSpaces": true,
  "editor.quickSuggestions": {
    "other": true,
    "comments": false,
    "strings": true
  }
}
"#;
        let _ = fs::write(vscode_dir.join("settings.json"), settings_json);

        let readme_content = format!(
            r#"# {safe_name} - Voix Studio Video Project

This project is powered by **Voix Studio**'s JavaScript & TypeScript Video DSL.

## Workflow (Edit in Code, Live Preview in Voix)
1. Open this folder in **VS Code** (`code .`).
2. Edit `{script_filename}` with real JavaScript:
   - Call `z("...")` and `m("...")` for dialogue.
   - Use functions, loops (`for`, `map`), and variables!
   - Full auto-completion for emotions, sound effects, animations, and commands is provided by `voix.d.ts`.
3. Whenever you save (`Ctrl+S`), **Voix Studio live-reloads the video timeline and audio preview**.
4. Version control with Git:
   - Run `git add . && git commit -m "update script"`
   - Video binaries are excluded via `.gitignore` to keep your repository lightweight (<50KB).
"#
        );
        let _ = fs::write(dir.join("README.md"), readme_content);
    } else {
        // YAML mode
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
        let settings_json = r#"{
  "[yaml]": {
    "editor.tabSize": 2,
    "editor.insertSpaces": true
  }
}
"#;
        let _ = fs::write(vscode_dir.join("settings.json"), settings_json);
    }

    Ok(script_file.to_string_lossy().to_string())
}
