mod media_server;
mod git_service;
mod code_generator;

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

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub duration: f64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub has_audio: bool,
    pub video_codec: String,
    pub audio_codec: String,
    pub size_bytes: u64,
    pub format_name: String,
}

fn parse_rate(value: &str) -> f64 {
    let value = value.trim();
    if value.is_empty() || value == "0/0" {
        return 0.0;
    }
    if let Some((num, den)) = value.split_once('/') {
        let num = num.parse::<f64>().unwrap_or(0.0);
        let den = den.parse::<f64>().unwrap_or(0.0);
        if den.abs() > f64::EPSILON {
            return num / den;
        }
        return 0.0;
    }
    value.parse::<f64>().unwrap_or(0.0)
}

/// Parse the subset of ffprobe's JSON that Voix needs. Kept separate from the
/// command so it can be unit-tested without invoking FFmpeg.
fn parse_media_info(json: &str, size_bytes: u64) -> Result<MediaInfo, String> {
    let root: serde_json::Value =
        serde_json::from_str(json).map_err(|err| format!("ffprobe JSON parse failed: {err}"))?;
    let streams = root
        .get("streams")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();

    let video = streams.iter().find(|stream| {
        stream.get("codec_type").and_then(|v| v.as_str()) == Some("video")
            && stream
                .get("disposition")
                .and_then(|d| d.get("attached_pic"))
                .and_then(|v| v.as_i64())
                .unwrap_or(0)
                == 0
    });
    let Some(video) = video else {
        return Err("ファイルに映像ストリームがありません".to_string());
    };

    let audio = streams
        .iter()
        .find(|stream| stream.get("codec_type").and_then(|v| v.as_str()) == Some("audio"));

    let format = root.get("format");
    let mut duration = format
        .and_then(|value| value.get("duration"))
        .and_then(|value| value.as_str())
        .and_then(|value| value.parse::<f64>().ok())
        .unwrap_or(0.0);
    if !duration.is_finite() || duration <= 0.0 {
        duration = video
            .get("duration")
            .and_then(|value| value.as_str())
            .and_then(|value| value.parse::<f64>().ok())
            .unwrap_or(0.0);
    }

    let fps = {
        let avg = video
            .get("avg_frame_rate")
            .and_then(|value| value.as_str())
            .map(parse_rate)
            .unwrap_or(0.0);
        if avg > 0.0 {
            avg
        } else {
            video
                .get("r_frame_rate")
                .and_then(|value| value.as_str())
                .map(parse_rate)
                .unwrap_or(0.0)
        }
    };

    Ok(MediaInfo {
        duration: if duration.is_finite() { duration.max(0.0) } else { 0.0 },
        width: video
            .get("width")
            .and_then(|value| value.as_u64())
            .unwrap_or(0) as u32,
        height: video
            .get("height")
            .and_then(|value| value.as_u64())
            .unwrap_or(0) as u32,
        fps,
        has_audio: audio.is_some(),
        video_codec: video
            .get("codec_name")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string(),
        audio_codec: audio
            .and_then(|stream| stream.get("codec_name"))
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string(),
        size_bytes,
        format_name: format
            .and_then(|value| value.get("format_name"))
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string(),
    })
}

/// Probe a local media file with ffprobe before the webview tries to decode it.
/// Long recordings sometimes report `Infinity` or a bogus duration through
/// WebKitGTK; having the real duration up front keeps the timeline, seeking
/// and export range correct.
#[tauri::command]
fn probe_media(path: String) -> Result<MediaInfo, String> {
    let clean = expand_tilde(path.trim());
    if clean.trim().is_empty() {
        return Err("メディアパスが空です".to_string());
    }
    let metadata = fs::metadata(&clean).map_err(|err| format!("ファイルを開けません: {err}"))?;
    if !metadata.is_file() {
        return Err("メディアパスがファイルではありません".to_string());
    }
    let output = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-analyzeduration",
            "10000000",
            "-probesize",
            "10000000",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            &clean,
        ])
        .output()
        .map_err(|err| format!("ffprobeを起動できません: {err}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe失敗: {}", stderr.trim()));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_media_info(&stdout, metadata.len())
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
            .arg("-vn")
            .arg("-sn")
            .arg("-dn")
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
    /// Source playback rate (0.25 - 4.0).
    #[serde(default = "default_speed")]
    pub speed: f64,
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
    /// Seconds into the source video used at timeline position 0.
    #[serde(default)]
    pub video_offset: f64,
    /// Background video playback rate (0.25 - 4.0).
    #[serde(default = "default_speed")]
    pub video_speed: f64,
    /// `contain`, `cover`, or `stretch`.
    #[serde(default = "default_video_fit")]
    pub video_fit: String,
    /// Ken Burns style background move: `none`, `zoom-in`, `zoom-out`,
    /// `pan-left`, `pan-right`, `pan-up`, or `pan-down`.
    #[serde(default = "default_video_motion")]
    pub video_motion: String,
    /// Strength of the background move (0.02 - 0.5).
    #[serde(default = "default_video_motion_amount")]
    pub video_motion_amount: f64,
    /// Full project duration, used to pace the background move.
    #[serde(default = "default_timeline_duration")]
    pub timeline_duration: f64,
    pub audio_clips: Vec<ExportAudioClip>,
}

fn default_speed() -> f64 {
    1.0
}

fn default_video_fit() -> String {
    "contain".to_string()
}

fn default_video_motion() -> String {
    "none".to_string()
}

fn default_video_motion_amount() -> f64 {
    0.12
}

fn default_timeline_duration() -> f64 {
    0.0
}

#[derive(Clone, Serialize)]
struct ExportProgress {
    phase: String,
    percent: f64,
    message: String,
}

/// Shared handle for the FFmpeg process currently owned by an export.
/// The UI can cancel a render while frames are still streaming in.
#[derive(Default)]
struct ExportProcessState {
    child: std::sync::Arc<std::sync::Mutex<Option<std::process::Child>>>,
    stdin: std::sync::Arc<std::sync::Mutex<Option<std::process::ChildStdin>>>,
    cancelled: std::sync::Arc<std::sync::atomic::AtomicBool>,
    progress_thread: std::sync::Mutex<Option<std::thread::JoinHandle<()>>>,
    stderr_thread: std::sync::Mutex<Option<std::thread::JoinHandle<()>>>,
    stderr_text: std::sync::Arc<std::sync::Mutex<String>>,
}

#[tauri::command]
fn begin_export_job() -> Result<String, String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let dir = std::env::temp_dir().join(format!("voix_export_{}", stamp));
    fs::create_dir_all(&dir).map_err(|e| format!("一時ディレクトリ作成失敗: {}", e))?;
    Ok(dir.to_string_lossy().to_string())
}

/// Stream one transparent PNG overlay frame into the running FFmpeg process.
/// The frontend sends the PNG bytes as a raw IPC body (`invoke` with a
/// `Uint8Array`), which avoids base64 expansion and per-frame temp files.
#[tauri::command]
async fn write_export_frame_raw(
    request: tauri::ipc::Request<'_>,
    state: tauri::State<'_, ExportProcessState>,
) -> Result<(), String> {
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes.clone(),
        _ => return Err("write_export_frame_raw requires a raw byte payload".to_string()),
    };
    let stdin = state.stdin.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = stdin
            .lock()
            .map_err(|_| "エクスポート状態ロック失敗".to_string())?;
        let pipe = guard
            .as_mut()
            .ok_or_else(|| "エクスポートが開始されていません".to_string())?;
        pipe.write_all(&bytes)
            .map_err(|e| format!("フレーム転送失敗: {}", e))
    })
    .await
    .map_err(|e| format!("フレーム転送タスク失敗: {}", e))?
}

fn join_export_threads(state: &ExportProcessState) {
    if let Ok(mut guard) = state.progress_thread.lock() {
        if let Some(handle) = guard.take() {
            let _ = handle.join();
        }
    }
    if let Ok(mut guard) = state.stderr_thread.lock() {
        if let Some(handle) = guard.take() {
            let _ = handle.join();
        }
    }
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
    // Closing the pipe unblocks any in-flight frame writer.
    if let Ok(mut stdin) = state.stdin.lock() {
        stdin.take();
    }
    join_export_threads(&state);
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

fn atempo_chain(speed: f64) -> String {
    let mut remaining = speed.clamp(0.25, 4.0);
    if (remaining - 1.0).abs() < 0.0001 {
        return String::new();
    }
    let mut parts = Vec::new();
    while remaining > 2.0 {
        parts.push("atempo=2.0".to_string());
        remaining /= 2.0;
    }
    while remaining < 0.5 {
        parts.push("atempo=0.5".to_string());
        remaining /= 0.5;
    }
    if (remaining - 1.0).abs() > 0.0001 {
        parts.push(format!("atempo={:.6}", remaining));
    }
    parts.join(",")
}

/// Build the FFmpeg invocation shared by the streaming export. Overlay frames
/// are read from stdin as concatenated PNGs, so no frames ever touch the disk.
fn prepare_export_command(payload: &ExportJobPayload) -> Result<(Command, String), String> {
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
        // Start the background at the export range start plus the project's
        // trimmed source offset, then loop so it always covers the duration.
        let speed = payload.video_speed.clamp(0.25, 4.0);
        let source_start = (payload.start_time.max(0.0) * speed + payload.video_offset.max(0.0))
            .max(0.0);
        cmd.arg("-ss").arg(format!("{:.3}", source_start));
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

    // Input 1: transparent overlay frames streamed over stdin.
    cmd.arg("-f")
        .arg("image2pipe")
        .arg("-framerate")
        .arg(overlay_fps.to_string())
        .arg("-c:v")
        .arg("png")
        .arg("-i")
        .arg("pipe:0");

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
        audio_input_indices.push(clip.clone());
    }

    let mut filter = String::new();
    let video_speed = payload.video_speed.clamp(0.25, 4.0);
    let setpts = if (video_speed - 1.0).abs() > 0.0001 {
        format!("setpts=PTS/{:.6},", video_speed)
    } else {
        String::new()
    };
    let motion = payload.video_motion.as_str();
    let motion_amount = payload.video_motion_amount.clamp(0.0, 0.5);
    let motion_active = motion != "none" && motion_amount > 0.0001;
    let fit_chain = if motion_active {
        // Camera moves need pixels outside the visible frame, so they always
        // scale to cover and then let zoompan animate the crop window.
        let timeline_duration = payload.timeline_duration.max(0.1);
        let fps_f = fps as f64;
        let progress = format!(
            "min(max(({start:.4}+on/{fps:.4})/{total:.4},0),1)",
            start = payload.start_time.max(0.0),
            fps = fps_f,
            total = timeline_duration
        );
        let zoom_expr = match motion {
            "zoom-in" => format!("1+{:.5}*({})", motion_amount, progress),
            "zoom-out" => format!("1+{:.5}*(1-({}))", motion_amount, progress),
            _ => format!("1+{:.5}", motion_amount),
        };
        let x_expr = match motion {
            "pan-left" => format!("(iw-iw/zoom)*(1-({}))", progress),
            "pan-right" => format!("(iw-iw/zoom)*({})", progress),
            _ => "iw/2-(iw/zoom/2)".to_string(),
        };
        let y_expr = match motion {
            "pan-up" => format!("(ih-ih/zoom)*(1-({}))", progress),
            "pan-down" => format!("(ih-ih/zoom)*({})", progress),
            _ => "ih/2-(ih/zoom/2)".to_string(),
        };
        format!(
            "scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},zoompan=z='{z}':x='{x}':y='{y}':d=1:s={w}x{h}:fps={fps}",
            w = width,
            h = height,
            z = zoom_expr,
            x = x_expr,
            y = y_expr,
            fps = fps
        )
    } else {
        match payload.video_fit.as_str() {
            "cover" => format!(
                "scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}",
                w = width,
                h = height
            ),
            "stretch" => format!("scale={w}:{h}", w = width, h = height),
            _ => format!(
                "scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black",
                w = width,
                h = height
            ),
        }
    };
    filter.push_str(&format!(
        "[0:v]{pts}{chain},setsar=1,tpad=stop_mode=clone:stop_duration={d}[bgv];",
        pts = setpts,
        chain = fit_chain,
        d = duration
    ));
    filter.push_str(
        "[1:v]format=rgba[ovl];[bgv][ovl]overlay=0:0:format=auto:shortest=0[v];",
    );

    let mut amix_labels: Vec<String> = Vec::new();
    if has_bg_audio && payload.background_volume > 0.001 {
        let mut chain = String::from(
            "[0:a]aformat=sample_rates=48000:channel_layouts=stereo",
        );
        let atempo = atempo_chain(video_speed);
        if !atempo.is_empty() {
            chain.push_str(&format!(",{}", atempo));
        }
        chain.push_str(&format!(",volume={}[abg];", payload.background_volume));
        filter.push_str(&chain);
        amix_labels.push("[abg]".to_string());
    }

    for (i, clip) in audio_input_indices.iter().enumerate() {
        let input_idx = 2 + i;
        let offset = clip.offset.max(0.0);
        let speed = if clip.speed.is_finite() {
            clip.speed.clamp(0.25, 4.0)
        } else {
            1.0
        };
        let source_end = offset + clip.duration.max(0.05) * speed;
        let mut chain = format!(
            "[{}:a]atrim=start={}:end={},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo",
            input_idx,
            offset,
            source_end
        );
        let atempo = atempo_chain(speed);
        if !atempo.is_empty() {
            chain.push_str(&format!(",{}", atempo));
        }
        chain.push_str(&format!(",volume={}", clip.volume.max(0.0)));
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

    Ok((cmd, output_path))
}

#[tauri::command]
fn begin_stream_export(
    payload: ExportJobPayload,
    app: tauri::AppHandle,
    state: tauri::State<'_, ExportProcessState>,
) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    use tauri::Emitter;

    state.cancelled.store(false, Ordering::SeqCst);

    let (mut cmd, _output_path) = prepare_export_command(&payload)?;
    let duration = payload.duration.max(0.1);

    let mut child = cmd
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("FFmpeg起動失敗: {}", e))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "FFmpegの入力パイプを開けません".to_string())?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    *state
        .stdin
        .lock()
        .map_err(|_| "エクスポート状態ロック失敗".to_string())? = Some(stdin);
    *state
        .child
        .lock()
        .map_err(|_| "エクスポート状態ロック失敗".to_string())? = Some(child);

    let stderr_text = state.stderr_text.clone();
    if let Ok(mut text) = stderr_text.lock() {
        text.clear();
    }

    let progress_thread = stdout.map(|stdout| {
        let app_handle = app.clone();
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                if let Some(value) = line.strip_prefix("out_time_ms=") {
                    if let Ok(ms) = value.trim().parse::<f64>() {
                        let percent = ((ms / 1_000_000.0) / duration * 100.0).clamp(0.0, 100.0);
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
        })
    });

    let stderr_thread = stderr.map(|mut stderr| {
        let stderr_text = state.stderr_text.clone();
        std::thread::spawn(move || {
            use std::io::Read;
            let mut text = String::new();
            let _ = stderr.read_to_string(&mut text);
            if let Ok(mut guard) = stderr_text.lock() {
                *guard = text;
            }
        })
    });

    if let Ok(mut guard) = state.progress_thread.lock() {
        *guard = progress_thread;
    }
    if let Ok(mut guard) = state.stderr_thread.lock() {
        *guard = stderr_thread;
    }

    let _ = app.emit(
        "export-progress",
        ExportProgress {
            phase: "encoding".to_string(),
            percent: 0.0,
            message: "FFmpeg encoding video...".to_string(),
        },
    );

    Ok(())
}

#[tauri::command]
async fn finish_stream_export(
    job_dir: String,
    output_path: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    // FFmpeg keeps draining frames after stdin closes. Keep the wait off the
    // main thread so the UI still processes progress/cancel events.
    tauri::async_runtime::spawn_blocking(move || {
        finish_stream_export_blocking(job_dir, output_path, app)
    })
    .await
    .map_err(|e| format!("エクスポートタスク失敗: {}", e))?
}

fn finish_stream_export_blocking(
    job_dir: String,
    output_path: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    use std::sync::atomic::Ordering;
    use tauri::{Emitter, Manager};

    let state = app.state::<ExportProcessState>();
    let output_path = expand_tilde(&output_path);

    // EOF for the image2pipe input: FFmpeg encodes whatever is buffered.
    if let Ok(mut stdin) = state.stdin.lock() {
        stdin.take();
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

    join_export_threads(&state);
    let stderr_text = state
        .stderr_text
        .lock()
        .map(|text| text.clone())
        .unwrap_or_default();

    if state.cancelled.load(Ordering::SeqCst) {
        let _ = fs::remove_dir_all(&job_dir);
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
        let _ = fs::remove_dir_all(&job_dir);
        let _ = fs::remove_file(&output_path);
        return Err(format!("FFmpeg書き出しエラー:\n{}", tail));
    }

    let _ = fs::remove_dir_all(&job_dir);
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
        .manage(code_generator::WatcherState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            check_system_environment,
            probe_media,
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
            begin_stream_export,
            write_export_frame_raw,
            cancel_export_job,
            finish_stream_export,
            media_stream_url,
            app_log,
            git_service::git_get_status,
            git_service::git_get_history,
            git_service::git_commit_snapshot,
            git_service::git_init_repository,
            git_service::git_push_remote,
            git_service::git_read_file_at_commit,
            code_generator::open_in_external_editor,
            code_generator::start_file_watcher,
            code_generator::stop_file_watcher,
            code_generator::generate_vscode_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod media_probe_tests {
    use super::parse_media_info;

    #[test]
    fn parses_ffprobe_video_metadata() {
        let json = r#"{
          "streams": [
            {"codec_type":"video","codec_name":"h264","width":1920,"height":1080,
             "avg_frame_rate":"30000/1001","r_frame_rate":"30/1","disposition":{"attached_pic":0}},
            {"codec_type":"audio","codec_name":"aac"}
          ],
          "format": {"duration":"3723.456","format_name":"mov,mp4,m4a,3gp,3g2,mj2"}
        }"#;
        let info = parse_media_info(json, 1024).expect("parse");
        assert_eq!(info.width, 1920);
        assert_eq!(info.height, 1080);
        assert!((info.duration - 3723.456).abs() < 0.001);
        assert!((info.fps - 29.97002997).abs() < 0.001);
        assert!(info.has_audio);
        assert_eq!(info.video_codec, "h264");
        assert_eq!(info.audio_codec, "aac");
        assert_eq!(info.size_bytes, 1024);
    }

    #[test]
    fn rejects_audio_only_files() {
        let json = r#"{"streams":[{"codec_type":"audio","codec_name":"mp3"}],
                       "format":{"duration":"12.5","format_name":"mp3"}}"#;
        assert!(parse_media_info(json, 10).is_err());
    }

    #[test]
    fn falls_back_to_stream_duration() {
        let json = r#"{"streams":[
            {"codec_type":"video","codec_name":"vp9","width":1280,"height":720,
             "avg_frame_rate":"0/0","r_frame_rate":"60/1","duration":"42.25",
             "disposition":{"attached_pic":0}}
          ],"format":{"format_name":"matroska,webm"}}"#;
        let info = parse_media_info(json, 10).expect("parse");
        assert!((info.duration - 42.25).abs() < 0.001);
        assert!((info.fps - 60.0).abs() < 0.001);
        assert!(!info.has_audio);
    }
}
