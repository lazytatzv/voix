use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::process::Command;

#[derive(Serialize, Deserialize, Debug)]
pub struct SystemStatus {
    pub ffmpeg_available: bool,
    pub ffmpeg_version: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TachieImportResult {
    pub character_name: String,
    pub speaker_id: i32,
    pub theme_color: String,
    pub avatar_data_url: String,
    pub speaking_data_url: Option<String>,
    pub expressions: Option<std::collections::HashMap<String, String>>,
    pub width: u32,
    pub height: u32,
}

static PROCESS_TACHIE_SCRIPT: &str = include_str!("../scripts/process_tachie.py");

#[tauri::command]
fn import_tachie_archive(
    file_path: String,
    filename_hint: Option<String>,
) -> Result<TachieImportResult, String> {
    let is_data = file_path.starts_with("data:")
        || (!std::path::Path::new(&file_path).exists() && file_path.len() > 255);

    let (arg_path, temp_file_guard) = if is_data {
        let clean = if let Some(idx) = file_path.find("base64,") {
            &file_path[idx + 7..]
        } else {
            &file_path
        };
        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(clean.trim())
            .map_err(|e| format!("Base64デコードエラー: {}", e))?;

        let ext = if let Some(ref hint) = filename_hint {
            let lower = hint.to_lowercase();
            if lower.ends_with(".zip") {
                ".zip"
            } else if lower.ends_with(".psd") {
                ".psd"
            } else if lower.ends_with(".png") {
                ".png"
            } else {
                ".zip"
            }
        } else {
            ".zip"
        };

        let tmp_path = std::env::temp_dir().join(format!(
            "voix_tachie_{}{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0),
            ext
        ));
        let mut f = File::create(&tmp_path).map_err(|e| format!("一時ファイル作成失敗: {}", e))?;
        f.write_all(&bytes)
            .map_err(|e| format!("一時ファイル書き込み失敗: {}", e))?;
        let p_str = tmp_path.to_string_lossy().to_string();
        (p_str, Some(tmp_path))
    } else {
        (file_path, None)
    };

    let mut cmd = Command::new("python3");
    cmd.arg("-c").arg(PROCESS_TACHIE_SCRIPT).arg(&arg_path);
    if let Some(hint) = filename_hint {
        cmd.arg(hint);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Python実行エラー: {}", e))?;

    if let Some(tmp) = temp_file_guard {
        let _ = fs::remove_file(tmp);
    }

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("立ち絵抽出エラー: {}", err.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let result: TachieImportResult = serde_json::from_str(&stdout)
        .map_err(|e| format!("JSONパースエラー: {} (出力: {})", e, stdout))?;

    Ok(result)
}

#[tauri::command]
fn check_system_environment() -> SystemStatus {
    let ffmpeg_res = Command::new("ffmpeg").arg("-version").output();
    let (ffmpeg_available, ffmpeg_version) = match ffmpeg_res {
        Ok(out) if out.status.success() => {
            let s = String::from_utf8_lossy(&out.stdout);
            let first_line = s.lines().next().unwrap_or("ffmpeg installed").to_string();
            (true, first_line)
        }
        _ => (false, "Not found".to_string()),
    };

    SystemStatus {
        ffmpeg_available,
        ffmpeg_version,
    }
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SpeechSegment {
    pub start: f64,
    pub end: f64,
}

// 動画の音声から無音検出（silencedetect）を行い、発話区間を割り出す（音声なし動画にも自動対応）
#[tauri::command]
fn detect_speech_segments(video_path: String) -> Result<Vec<SpeechSegment>, String> {
    let path = std::path::Path::new(&video_path);
    if video_path.trim().is_empty() || !path.exists() {
        return Err("有効な動画ファイルが見つかりません".to_string());
    }

    // ffprobe で動画の総尺と音声ストリームの有無を確認
    let probe_out = Command::new("ffprobe")
        .arg("-v")
        .arg("error")
        .arg("-show_entries")
        .arg("format=duration:stream=codec_type")
        .arg("-of")
        .arg("default=noprint_wrappers=1")
        .arg(&video_path)
        .output();

    let (duration, has_audio) = match probe_out {
        Ok(out) if out.status.success() => {
            let s = String::from_utf8_lossy(&out.stdout);
            let mut dur = 15.0;
            let mut audio = false;
            for line in s.lines() {
                if line.starts_with("duration=") {
                    dur = line[9..].parse::<f64>().unwrap_or(15.0);
                } else if line == "codec_type=audio" {
                    audio = true;
                }
            }
            (dur, audio)
        }
        _ => (15.0, false),
    };

    let mut segments = Vec::new();

    if has_audio {
        let output = Command::new("ffmpeg")
            .arg("-i")
            .arg(&video_path)
            .arg("-af")
            .arg("silencedetect=noise=-30dB:d=0.35")
            .arg("-f")
            .arg("null")
            .arg("-")
            .output();

        if let Ok(out) = output {
            let stderr = String::from_utf8_lossy(&out.stderr);
            let mut current_speech_start = 0.0;

            for line in stderr.lines() {
                if line.contains("silence_start:") {
                    if let Some(pos) = line.find("silence_start:") {
                        let val_str = line[pos + 14..].split_whitespace().next().unwrap_or("");
                        if let Ok(silence_start) = val_str.parse::<f64>() {
                            if silence_start > current_speech_start + 0.3 {
                                segments.push(SpeechSegment {
                                    start: (current_speech_start * 100.0).round() / 100.0,
                                    end: (silence_start * 100.0).round() / 100.0,
                                });
                            }
                        }
                    }
                } else if line.contains("silence_end:") {
                    if let Some(pos) = line.find("silence_end:") {
                        let val_str = line[pos + 12..].split_whitespace().next().unwrap_or("");
                        if let Ok(silence_end) = val_str.parse::<f64>() {
                            current_speech_start = silence_end;
                        }
                    }
                }
            }
        }
    }

    // 音声トラックがない動画、または無音部分のみの動画の場合:
    // 動画の尺に合わせて、テンポ良い実況・解説区間（4〜5秒間隔）を自動生成
    if segments.is_empty() {
        let step = 4.2;
        let mut t = 0.5;
        while t + 1.2 < duration {
            let seg_end = (t + 2.4).min(duration);
            segments.push(SpeechSegment {
                start: (t * 10.0).round() / 10.0,
                end: (seg_end * 10.0).round() / 10.0,
            });
            t += step;
        }
        if segments.is_empty() {
            segments.push(SpeechSegment {
                start: 0.5,
                end: 3.5,
            });
        }
    }

    Ok(segments)
}

#[derive(Serialize, Deserialize, Debug)]
pub struct VoiceClipPayload {
    pub id: String,
    pub start_time: f64,
    pub duration: f64,
    pub text: String,
    pub wav_base64: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FullExportPayload {
    pub video_path: Option<String>,
    pub output_path: String,
    pub clips: Vec<VoiceClipPayload>,
    pub total_duration: f64,
}

#[tauri::command]
fn export_full_video(payload: FullExportPayload) -> Result<String, String> {
    let temp_dir = std::env::temp_dir().join("myymm_export");
    let _ = fs::create_dir_all(&temp_dir);

    // 1. 各音声を一時ファイルに書き出し
    let mut wav_files = Vec::new();
    for (i, clip) in payload.clips.iter().enumerate() {
        let file_path = temp_dir.join(format!("voice_{}.wav", i));
        // base64 デコード
        let bytes = base64_decode_simple(&clip.wav_base64)
            .map_err(|e| format!("Base64デコードエラー: {}", e))?;
        let mut f = File::create(&file_path).map_err(|e| e.to_string())?;
        f.write_all(&bytes).map_err(|e| e.to_string())?;
        wav_files.push((file_path, clip.start_time));
    }

    // 2. SRT字幕ファイルを作成
    let srt_path = temp_dir.join("subtitles.srt");
    let mut srt_file = File::create(&srt_path).map_err(|e| e.to_string())?;
    for (i, clip) in payload.clips.iter().enumerate() {
        let srt_entry = format!(
            "{}\n{} --> {}\n{}\n\n",
            i + 1,
            format_srt_time(clip.start_time),
            format_srt_time(clip.start_time + clip.duration),
            clip.text
        );
        srt_file
            .write_all(srt_entry.as_bytes())
            .map_err(|e| e.to_string())?;
    }

    // 3. FFmpegコマンド構築
    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y");

    // 背景動画がある場合
    if let Some(ref vpath) = payload.video_path {
        cmd.arg("-i").arg(vpath);
    } else {
        // 背景動画がない場合は黒背景 (1920x1080) を生成
        cmd.arg("-f").arg("lavfi").arg("-i").arg(format!(
            "color=c=#0f0f11:s=1920x1080:d={}:r=30",
            payload.total_duration
        ));
    }

    // 音声入力を追加
    for (wav_file, _) in &wav_files {
        cmd.arg("-i").arg(wav_file);
    }

    // 音声の遅延配置（adelay）と合成（amix）フィルタ
    if !wav_files.is_empty() {
        let mut filter_complex = String::new();
        for (i, (_, start_sec)) in wav_files.iter().enumerate() {
            let delay_ms = (start_sec * 1000.0) as u64;
            filter_complex.push_str(&format!(
                "[{}:a]adelay={}|{}[a{}];",
                i + 1,
                delay_ms,
                delay_ms,
                i
            ));
        }
        for i in 0..wav_files.len() {
            filter_complex.push_str(&format!("[a{}]", i));
        }
        filter_complex.push_str(&format!(
            "amix=inputs={}:dropout_transition=2[outa]",
            wav_files.len()
        ));

        cmd.arg("-filter_complex").arg(filter_complex);
        cmd.arg("-map").arg("0:v");
        cmd.arg("-map").arg("[outa]");
    } else {
        cmd.arg("-map").arg("0:v");
    }

    // 字幕焼き込み（subtitlesフィルタ）
    cmd.arg("-vf").arg(format!("subtitles='{}':force_style='FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2'", srt_path.to_str().unwrap_or("subtitles.srt")));

    cmd.arg("-c:v").arg("libx264");
    cmd.arg("-preset").arg("fast");
    cmd.arg("-crf").arg("22");
    cmd.arg("-c:a").arg("aac");
    cmd.arg("-b:a").arg("192k");
    cmd.arg("-t").arg(format!("{}", payload.total_duration));
    cmd.arg(&payload.output_path);

    let output = cmd.output().map_err(|e| format!("FFmpeg起動失敗: {}", e))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("FFmpeg書き出しエラー: {}", err));
    }

    // 一時ファイルのクリーンアップ
    let _ = fs::remove_dir_all(&temp_dir);

    Ok(format!("動画を書き出しました: {}", payload.output_path))
}

fn format_srt_time(sec: f64) -> String {
    let hrs = (sec / 3600.0) as u64;
    let mins = ((sec % 3600.0) / 60.0) as u64;
    let s = (sec % 60.0) as u64;
    let ms = ((sec % 1.0) * 1000.0) as u64;
    format!("{:02}:{:02}:{:02},{:03}", hrs, mins, s, ms)
}

fn base64_decode_simple(data: &str) -> Result<Vec<u8>, String> {
    // プレフィックス (data:audio/wav;base64, 等) を削除
    let clean = if let Some(idx) = data.find("base64,") {
        &data[idx + 7..]
    } else {
        data
    };
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(clean.trim())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn extract_video_keyframes(video_path: String, count: Option<u32>) -> Result<Vec<String>, String> {
    let num_frames = count.unwrap_or(4).clamp(2, 8);
    let temp_dir = std::env::temp_dir().join("voix_keyframes");
    let _ = fs::create_dir_all(&temp_dir);

    // 動画の総尺を取得
    let dur_out = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            &video_path,
        ])
        .output()
        .map_err(|e| format!("ffprobeエラー: {}", e))?;

    let dur_str = String::from_utf8_lossy(&dur_out.stdout);
    let total_sec: f64 = dur_str.trim().parse().unwrap_or(30.0);

    let mut base64_frames = Vec::new();

    for i in 1..=num_frames {
        let timestamp = (total_sec / (num_frames as f64 + 1.0)) * (i as f64);
        let out_img = temp_dir.join(format!("kf_{}.jpg", i));

        let _ = Command::new("ffmpeg")
            .args([
                "-y",
                "-ss",
                &format!("{:.2}", timestamp),
                "-i",
                &video_path,
                "-vframes",
                "1",
                "-vf",
                "scale=640:-1",
                "-q:v",
                "4",
                out_img.to_str().unwrap(),
            ])
            .output();

        if let Ok(bytes) = fs::read(&out_img) {
            use base64::Engine;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            base64_frames.push(format!("data:image/jpeg;base64,{}", b64));
            let _ = fs::remove_file(&out_img);
        }
    }

    Ok(base64_frames)
}

fn get_voix_config_dir() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let path = std::path::PathBuf::from(home).join(".config").join("voix");
    let _ = fs::create_dir_all(&path);
    path
}

#[tauri::command]
fn save_app_settings(settings_json: String) -> Result<(), String> {
    let dir = get_voix_config_dir();
    let file = dir.join("settings.json");
    fs::write(file, settings_json).map_err(|e| format!("設定保存エラー: {}", e))?;
    Ok(())
}

#[tauri::command]
fn load_app_settings() -> Result<String, String> {
    let dir = get_voix_config_dir();
    let file = dir.join("settings.json");
    if file.exists() {
        fs::read_to_string(file).map_err(|e| format!("設定読み込みエラー: {}", e))
    } else {
        Ok("{}".to_string())
    }
}

#[tauri::command]
fn save_characters_config(characters_json: String) -> Result<(), String> {
    let dir = get_voix_config_dir();
    let file = dir.join("characters.json");
    fs::write(file, characters_json).map_err(|e| format!("キャラクター保存エラー: {}", e))?;
    Ok(())
}

#[tauri::command]
fn load_characters_config() -> Result<String, String> {
    let dir = get_voix_config_dir();
    let file = dir.join("characters.json");
    if file.exists() {
        fs::read_to_string(file).map_err(|e| format!("キャラクター読み込みエラー: {}", e))
    } else {
        Ok("[]".to_string())
    }
}

#[tauri::command]
fn open_config_directory() -> Result<(), String> {
    let dir = get_voix_config_dir();
    let _ = Command::new("xdg-open").arg(&dir).spawn();
    Ok(())
}

fn percent_decode_str(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut decoded: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""), 16) {
                decoded.push(byte);
                i += 3;
                continue;
            }
        }
        decoded.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&decoded).to_string()
}

#[tauri::command]
fn read_file_data_url(file_path: String) -> Result<String, String> {
    let mut clean_path = file_path;
    if clean_path.starts_with("asset://localhost/") {
        let stripped = &clean_path["asset://localhost/".len()..];
        let decoded = percent_decode_str(stripped);
        clean_path = if !decoded.starts_with('/') {
            format!("/{}", decoded)
        } else {
            decoded
        };
    } else if clean_path.contains('%') {
        clean_path = percent_decode_str(&clean_path);
    }

    let p = std::path::Path::new(&clean_path);
    if !p.exists() {
        return Err(format!("File not found: {}", clean_path));
    }

    let bytes = fs::read(p).map_err(|e| format!("Failed to read file: {}", e))?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let mime = if clean_path.ends_with(".webp") {
        "image/webp"
    } else if clean_path.ends_with(".jpg") || clean_path.ends_with(".jpeg") {
        "image/jpeg"
    } else if clean_path.ends_with(".svg") {
        "image/svg+xml"
    } else {
        "image/png"
    };

    Ok(format!("data:{};base64,{}", mime, b64))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            check_system_environment,
            detect_speech_segments,
            export_full_video,
            import_tachie_archive,
            extract_video_keyframes,
            save_app_settings,
            load_app_settings,
            save_characters_config,
            load_characters_config,
            open_config_directory,
            read_file_data_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
