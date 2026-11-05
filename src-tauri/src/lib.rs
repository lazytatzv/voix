mod media_server;

use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::process::Command;

/// Holds the loopback streaming server for the lifetime of the app. `None`
/// means it could not bind; the frontend then falls back to the asset URL
/// (which never copies the whole file into memory).
struct MediaServerState(Option<media_server::MediaServer>);

#[tauri::command]
fn app_log(tag: String, message: String) {
    eprintln!("[{}] {}", tag, message);
}

#[tauri::command]
fn media_stream_url(
    state: tauri::State<'_, MediaServerState>,
    path: String,
) -> Result<String, String> {
    let server = state
        .0
        .as_ref()
        .ok_or_else(|| "メディアサーバーが起動していません".to_string())?;
    let clean_path = expand_tilde(path.trim());
    server
        .url_for(&clean_path)
        .map_err(|err| format!("メディアを開けません ({}): {}", clean_path, err))
}

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
    pub body_type: Option<String>,
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
    let base = std::env::var("XDG_CONFIG_HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            std::path::PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| ".".to_string()))
                .join(".config")
        });
    let path = base.join("voix");
    let _ = fs::create_dir_all(&path);
    path
}

fn get_voix_cache_dir() -> std::path::PathBuf {
    let base = std::env::var("XDG_CACHE_HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            std::path::PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| ".".to_string()))
                .join(".cache")
        });
    let path = base.join("voix");
    let _ = fs::create_dir_all(&path);
    path
}

fn get_voix_data_dir() -> std::path::PathBuf {
    let base = std::env::var("XDG_DATA_HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            std::path::PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| ".".to_string()))
                .join(".local").join("share")
        });
    let path = base.join("voix");
    let _ = fs::create_dir_all(&path);
    path
}

fn decode_base64_data(data: &str) -> Result<Vec<u8>, String> {
    let clean = if let Some(idx) = data.find("base64,") {
        &data[idx + 7..]
    } else {
        data
    };
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(clean.trim())
        .map_err(|e| format!("Base64デコードエラー: {}", e))
}

fn expand_tilde(path: &str) -> String {
    if path == "~" {
        return std::env::var("HOME").unwrap_or_else(|_| path.to_string());
    }
    if let Some(rest) = path.strip_prefix("~/") {
        let home = std::env::var("HOME").unwrap_or_default();
        return format!("{}/{}", home.trim_end_matches('/'), rest);
    }
    path.to_string()
}

#[tauri::command]
fn get_config_dir_path() -> String {
    get_voix_config_dir().to_string_lossy().to_string()
}

#[tauri::command]
fn get_home_dir_path() -> String {
    std::env::var("HOME").unwrap_or_else(|_| ".".to_string())
}

#[tauri::command]
fn get_cache_dir_path() -> String {
    get_voix_cache_dir().to_string_lossy().to_string()
}

#[tauri::command]
fn get_data_dir_path() -> String {
    get_voix_data_dir().to_string_lossy().to_string()
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("読み込み失敗 ({}): {}", path, e))
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, content).map_err(|e| format!("保存失敗 ({}): {}", path, e))
}

#[tauri::command]
fn write_binary_file(path: String, data_base64: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    let bytes = decode_base64_data(&data_base64)?;
    fs::write(&path, bytes).map_err(|e| format!("保存失敗 ({}): {}", path, e))
}

#[tauri::command]
fn read_binary_base64(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| format!("読み込み失敗 ({}): {}", path, e))?;
    use base64::Engine;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
fn save_audio_cache(key: String, data_base64: String) -> Result<String, String> {
    let dir = get_voix_cache_dir().join("audio");
    let _ = fs::create_dir_all(&dir);
    let safe_key = key
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>();
    let path = dir.join(format!("{}.wav", safe_key));
    let bytes = decode_base64_data(&data_base64)?;
    fs::write(&path, bytes).map_err(|e| format!("音声キャッシュ保存失敗: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn load_audio_cache(key: String) -> Result<Option<String>, String> {
    let dir = get_voix_cache_dir().join("audio");
    let safe_key = key
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>();
    let path = dir.join(format!("{}.wav", safe_key));
    if !path.exists() {
        return Ok(None);
    }
    read_binary_base64(path.to_string_lossy().to_string()).map(Some)
}

#[tauri::command]
fn clear_audio_cache() -> Result<(), String> {
    let dir = get_voix_cache_dir().join("audio");
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("キャッシュ削除失敗: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn open_cache_directory() -> Result<(), String> {
    let dir = get_voix_cache_dir();
    let _ = Command::new("xdg-open").arg(&dir).spawn();
    Ok(())
}

#[tauri::command]
fn open_data_directory() -> Result<(), String> {
    let dir = get_voix_data_dir();
    let _ = Command::new("xdg-open").arg(&dir).spawn();
    Ok(())
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

// ==========================================================
// Frame-accurate export pipeline (browser-rendered overlay PNGs)
// ==========================================================

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ExportDucking {
    pub level: f64,
    pub attack: f64,
    pub release: f64,
    /// Voice spans in seconds, relative to the start of the audio clip.
    pub intervals: Vec<[f64; 2]>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ExportAudioClip {
    pub path: String,
    pub start: f64,
    pub duration: f64,
    pub volume: f64,
    #[serde(default)]
    pub offset: f64,
    #[serde(default)]
    pub loop_audio: bool,
    #[serde(default)]
    pub fade_in: f64,
    #[serde(default)]
    pub fade_out: f64,
    #[serde(default)]
    pub ducking: Option<ExportDucking>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ExportJobPayload {
    pub job_dir: String,
    pub output_path: String,
    pub background_path: Option<String>,
    pub background_color: String,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub overlay_fps: u32,
    pub duration: f64,
    #[serde(default)]
    pub start_time: f64,
    pub crf: u32,
    pub preset: String,
    pub background_volume: f64,
    pub audio_clips: Vec<ExportAudioClip>,
}

#[derive(Clone, Serialize)]
struct ExportProgress {
    phase: String,
    percent: f64,
    message: String,
}

/// Shared handle for the FFmpeg process currently owned by an export.
/// The UI can cancel a render even while the blocking encode command is running.
#[derive(Default)]
struct ExportProcessState {
    child: std::sync::Arc<std::sync::Mutex<Option<std::process::Child>>>,
    cancelled: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

#[tauri::command]
fn begin_export_job() -> Result<String, String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let dir = std::env::temp_dir().join(format!("voix_export_{}", stamp));
    fs::create_dir_all(dir.join("frames")).map_err(|e| format!("一時ディレクトリ作成失敗: {}", e))?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn write_export_frame(job_dir: String, index: u32, png_base64: String) -> Result<(), String> {
    let frames = std::path::Path::new(&job_dir).join("frames");
    fs::create_dir_all(&frames).map_err(|e| e.to_string())?;
    let path = frames.join(format!("frame_{:06}.png", index));
    let bytes = decode_base64_data(&png_base64)?;
    fs::write(path, bytes).map_err(|e| format!("フレーム書き込み失敗: {}", e))
}

#[tauri::command]
fn cancel_export_job(
    job_dir: String,
    output_path: Option<String>,
    state: tauri::State<'_, ExportProcessState>,
) -> Result<(), String> {
    state
        .cancelled
        .store(true, std::sync::atomic::Ordering::SeqCst);
    let child = state
        .child
        .lock()
        .map_err(|_| "エクスポート状態ロック失敗".to_string())?
        .take();
    if let Some(mut child) = child {
        let _ = child.kill();
        let _ = child.wait();
    }
    let _ = fs::remove_dir_all(&job_dir);
    if let Some(output_path) = output_path {
        let clean = expand_tilde(&output_path);
        let _ = fs::remove_file(clean);
    }
    Ok(())
}

fn probe_has_audio(path: &str) -> bool {
    Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "csv=p=0",
            path,
        ])
        .output()
        .map(|out| String::from_utf8_lossy(&out.stdout).contains("audio"))
        .unwrap_or(false)
}

fn ducking_volume_expr(ducking: &ExportDucking) -> Option<String> {
    let level = ducking.level.clamp(0.0, 1.0);
    if level >= 0.999 {
        return None;
    }
    let attack = ducking.attack.max(0.0);
    let release = ducking.release.max(0.0);
    let span = 1.0 - level;

    let mut terms = Vec::new();
    for interval in &ducking.intervals {
        let s = interval[0].max(0.0);
        let e = interval[1].max(s);
        if e - s < 0.001 {
            continue;
        }
        let down = (s - attack).max(0.0);
        let before = if attack > 0.0001 && s > down + 0.0001 {
            format!("if(lt(t,{down:.3}),1,1-{span:.6}*(t-{down:.3})/{attack:.4})")
        } else {
            "1".to_string()
        };
        let release_end = e + release;
        let after = if release > 0.0001 {
            format!(
                "if(lt(t,{release_end:.3}),{level:.6}+{span:.6}*(t-{e:.3})/{release:.4},1)"
            )
        } else {
            "1".to_string()
        };
        terms.push(format!(
            "if(lt(t,{s:.3}),{before},if(lt(t,{e:.3}),{level:.6},{after}))"
        ));
    }

    terms
        .into_iter()
        .reduce(|a, b| format!("min({a},{b})"))
        .map(|expr| format!(",volume=volume='{}':eval=frame", expr))
}

#[tauri::command]
async fn finish_export_job(
    payload: ExportJobPayload,
    app: tauri::AppHandle,
) -> Result<String, String> {
    // FFmpeg can run for minutes. Keep it off the main thread so the UI keeps
    // receiving `export-progress` events and the cancel button stays usable.
    tauri::async_runtime::spawn_blocking(move || finish_export_job_blocking(payload, app))
        .await
        .map_err(|e| format!("エクスポートタスク失敗: {}", e))?
}

fn finish_export_job_blocking(
    payload: ExportJobPayload,
    app: tauri::AppHandle,
) -> Result<String, String> {
    use std::io::{BufRead, BufReader};
    use std::sync::atomic::Ordering;
    use tauri::{Emitter, Manager};

    let state = app.state::<ExportProcessState>();

    state
        .cancelled
        .store(false, std::sync::atomic::Ordering::SeqCst);

    let frames_dir = std::path::Path::new(&payload.job_dir).join("frames");
    if !frames_dir.exists() {
        return Err("描画フレームが見つかりません".to_string());
    }

    let output_path = expand_tilde(&payload.output_path);
    if let Some(parent) = std::path::Path::new(&output_path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    let is_webm = output_path.to_lowercase().ends_with(".webm");

    let duration = payload.duration.max(0.1);
    let width = payload.width.max(2);
    let height = payload.height.max(2);
    let fps = payload.fps.max(1);
    let overlay_fps = payload.overlay_fps.max(1);
    let crf = payload.crf.clamp(0, 51);
    let preset = if ["ultrafast", "fast", "medium", "slow"].contains(&payload.preset.as_str()) {
        payload.preset.clone()
    } else {
        "medium".to_string()
    };

    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y");

    let has_bg_audio;
    if let Some(bg) = payload
        .background_path
        .as_deref()
        .filter(|p| !p.trim().is_empty())
    {
        let bg = expand_tilde(bg);
        // Start the background at the export range start, then loop so it
        // always covers the full requested duration.
        cmd.arg("-ss")
            .arg(format!("{:.3}", payload.start_time.max(0.0)));
        cmd.arg("-stream_loop").arg("-1");
        cmd.arg("-i").arg(&bg);
        has_bg_audio = probe_has_audio(&bg);
    } else {
        cmd.arg("-f")
            .arg("lavfi")
            .arg("-i")
            .arg(format!(
                "color=c={}:s={}x{}:r={}:d={}",
                payload.background_color, width, height, fps, duration
            ));
        has_bg_audio = false;
    }

    cmd.arg("-framerate")
        .arg(overlay_fps.to_string())
        .arg("-i")
        .arg(frames_dir.join("frame_%06d.png").to_string_lossy().to_string());

    // Audio inputs start at index 2.
    let mut audio_input_indices = Vec::new();
    for clip in &payload.audio_clips {
        let clip_path = expand_tilde(&clip.path);
        if !std::path::Path::new(&clip_path).exists() {
            continue;
        }
        if clip.loop_audio {
            cmd.arg("-stream_loop").arg("-1");
        }
        cmd.arg("-i").arg(&clip_path);
        // input index depends on background + overlay + previously added clips
        audio_input_indices.push(clip.clone());
    }

    let mut filter = String::new();
    filter.push_str(&format!(
        "[0:v]scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,tpad=stop_mode=clone:stop_duration={d}[bgv];",
        w = width,
        h = height,
        d = duration
    ));
    filter.push_str(&format!(
        "[1:v]format=rgba[ovl];[bgv][ovl]overlay=0:0:format=auto:shortest=0[v];"
    ));

    let mut amix_labels: Vec<String> = Vec::new();
    if has_bg_audio && payload.background_volume > 0.001 {
        filter.push_str(&format!(
            "[0:a]aformat=sample_rates=48000:channel_layouts=stereo,volume={}[abg];",
            payload.background_volume
        ));
        amix_labels.push("[abg]".to_string());
    }

    for (i, clip) in audio_input_indices.iter().enumerate() {
        let input_idx = 2 + i;
        let offset = clip.offset.max(0.0);
        let source_end = offset + clip.duration.max(0.05);
        let mut chain = format!(
            "[{}:a]atrim=start={}:end={},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,volume={}",
            input_idx,
            offset,
            source_end,
            clip.volume.max(0.0)
        );
        if clip.fade_in > 0.001 {
            chain.push_str(&format!(",afade=t=in:st=0:d={}", clip.fade_in));
        }
        if clip.fade_out > 0.001 {
            let start = (clip.duration - clip.fade_out).max(0.0);
            chain.push_str(&format!(",afade=t=out:st={}:d={}", start, clip.fade_out));
        }
        if let Some(ducking) = &clip.ducking {
            if let Some(volume) = ducking_volume_expr(ducking) {
                chain.push_str(&volume);
            }
        }
        let delay_ms = (clip.start.max(0.0) * 1000.0) as u64;
        chain.push_str(&format!(
            ",adelay={}|{},asetpts=PTS-STARTPTS[a{}];",
            delay_ms,
            delay_ms,
            i
        ));
        filter.push_str(&chain);
        amix_labels.push(format!("[a{}]", i));
    }

    let has_audio = !amix_labels.is_empty();
    if has_audio {
        filter.push_str(&format!(
            "{}amix=inputs={}:duration=longest:normalize=0,alimiter=limit=0.95,atrim=0:{}[outa]",
            amix_labels.join(""),
            amix_labels.len(),
            duration
        ));
        cmd.arg("-filter_complex").arg(filter);
        cmd.arg("-map").arg("[v]");
        cmd.arg("-map").arg("[outa]");
    } else {
        cmd.arg("-filter_complex").arg(filter);
        cmd.arg("-map").arg("[v]");
        cmd.arg("-an");
    }

    cmd.arg("-t").arg(format!("{:.3}", duration));
    cmd.arg("-r").arg(fps.to_string());
    if is_webm {
        cmd.arg("-c:v").arg("libvpx-vp9");
        cmd.arg("-b:v").arg("0");
        cmd.arg("-crf").arg((crf + 10).min(63).to_string());
        cmd.arg("-row-mt").arg("1");
        cmd.arg("-pix_fmt").arg("yuv420p");
        if has_audio {
            cmd.arg("-c:a").arg("libopus");
            cmd.arg("-b:a").arg("160k");
        }
    } else {
        cmd.arg("-c:v").arg("libx264");
        cmd.arg("-preset").arg(&preset);
        cmd.arg("-crf").arg(crf.to_string());
        cmd.arg("-pix_fmt").arg("yuv420p");
        if output_path.to_lowercase().ends_with(".mp4") {
            cmd.arg("-movflags").arg("+faststart");
        }
        if has_audio {
            cmd.arg("-c:a").arg("aac");
            cmd.arg("-b:a").arg("192k");
        }
    }
    cmd.arg("-progress").arg("pipe:1");
    cmd.arg("-nostats");
    cmd.arg(&output_path);

    let _ = app.emit(
        "export-progress",
        ExportProgress {
            phase: "encoding".to_string(),
            percent: 0.0,
            message: "FFmpeg encoding video...".to_string(),
        },
    );

    let mut child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("FFmpeg起動失敗: {}", e))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let stdout_thread = if let Some(stdout) = stdout {
        let app_handle = app.clone();
        let total = duration;
        Some(std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                if let Some(value) = line.strip_prefix("out_time_ms=") {
                    if let Ok(ms) = value.trim().parse::<f64>() {
                        let percent = ((ms / 1_000_000.0) / total * 100.0).clamp(0.0, 100.0);
                        let _ = app_handle.emit(
                            "export-progress",
                            ExportProgress {
                                phase: "encoding".to_string(),
                                percent,
                                message: format!("Encoding... {:.0}%", percent),
                            },
                        );
                    }
                }
            }
        }))
    } else {
        None
    };

    // Drain stderr concurrently; FFmpeg writes a lot to it and a full pipe
    // would otherwise deadlock the encoder.
    let stderr_thread = std::thread::spawn(move || {
        use std::io::Read;
        let mut text = String::new();
        if let Some(mut stderr) = stderr {
            let _ = stderr.read_to_string(&mut text);
        }
        text
    });

    {
        let mut guard = state
            .child
            .lock()
            .map_err(|_| "エクスポート状態ロック失敗".to_string())?;
        *guard = Some(child);
    }

    let mut exit_status: Option<std::process::ExitStatus> = None;
    loop {
        if state.cancelled.load(Ordering::SeqCst) {
            let child = state
                .child
                .lock()
                .map_err(|_| "エクスポート状態ロック失敗".to_string())?
                .take();
            if let Some(mut child) = child {
                let _ = child.kill();
                let _ = child.wait();
            }
            break;
        }

        let mut guard = state
            .child
            .lock()
            .map_err(|_| "エクスポート状態ロック失敗".to_string())?;
        match guard.as_mut() {
            Some(child) => match child.try_wait() {
                Ok(Some(status)) => {
                    exit_status = Some(status);
                    *guard = None;
                    break;
                }
                Ok(None) => {}
                Err(e) => {
                    *guard = None;
                    return Err(format!("FFmpeg待機失敗: {}", e));
                }
            },
            None => break,
        }
        drop(guard);
        std::thread::sleep(std::time::Duration::from_millis(40));
    }

    if let Some(handle) = stdout_thread {
        let _ = handle.join();
    }
    let stderr_text = stderr_thread.join().unwrap_or_default();

    if state.cancelled.load(Ordering::SeqCst) {
        let _ = fs::remove_dir_all(&payload.job_dir);
        let _ = fs::remove_file(&output_path);
        return Err("エクスポートはキャンセルされました".to_string());
    }

    let succeeded = exit_status.map(|status| status.success()).unwrap_or(false);
    if !succeeded {
        let tail: String = stderr_text
            .lines()
            .rev()
            .take(12)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join("\n");
        return Err(format!("FFmpeg書き出しエラー:\n{}", tail));
    }

    let _ = fs::remove_dir_all(&payload.job_dir);
    let _ = app.emit(
        "export-progress",
        ExportProgress {
            phase: "done".to_string(),
            percent: 100.0,
            message: "Export complete".to_string(),
        },
    );

    Ok(format!("動画を書き出しました: {}", output_path))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let media_server = match media_server::MediaServer::start() {
        Ok(server) => Some(server),
        Err(err) => {
            eprintln!("[media_server] 起動失敗: {}", err);
            None
        }
    };

    tauri::Builder::default()
        .manage(ExportProcessState::default())
        .manage(MediaServerState(media_server))
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
            read_file_data_url,
            get_config_dir_path,
            get_home_dir_path,
            get_cache_dir_path,
            get_data_dir_path,
            read_text_file,
            write_text_file,
            write_binary_file,
            read_binary_base64,
            file_exists,
            save_audio_cache,
            load_audio_cache,
            clear_audio_cache,
            open_cache_directory,
            open_data_directory,
            begin_export_job,
            write_export_frame,
            cancel_export_job,
            finish_export_job,
            media_stream_url,
            app_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
