use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::process::Command;

#[derive(Serialize, Deserialize, Debug)]
pub struct SystemStatus {
    pub ffmpeg_available: bool,
    pub ffmpeg_version: String,
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

// 動画の音声から無音検出（silencedetect）を行い、発話区間を割り出す
#[tauri::command]
fn detect_speech_segments(video_path: String) -> Result<Vec<SpeechSegment>, String> {
    let output = Command::new("ffmpeg")
        .arg("-i")
        .arg(&video_path)
        .arg("-af")
        .arg("silencedetect=noise=-30dB:d=0.4")
        .arg("-f")
        .arg("null")
        .arg("-")
        .output()
        .map_err(|e| format!("FFmpeg実行エラー: {}", e))?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    let mut segments = Vec::new();
    let mut current_speech_start = 0.0;

    for line in stderr.lines() {
        if line.contains("silence_start:") {
            if let Some(pos) = line.find("silence_start:") {
                let val_str = line[pos + 14..].split_whitespace().next().unwrap_or("");
                if let Ok(silence_start) = val_str.parse::<f64>() {
                    if silence_start > current_speech_start + 0.3 {
                        segments.push(SpeechSegment {
                            start: current_speech_start,
                            end: silence_start,
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

    // セグメントが空の場合はフォールバックとして5秒おきのセグメント
    if segments.is_empty() {
        segments.push(SpeechSegment { start: 0.5, end: 3.5 });
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
        srt_file.write_all(srt_entry.as_bytes()).map_err(|e| e.to_string())?;
    }

    // 3. FFmpegコマンド構築
    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y");

    // 背景動画がある場合
    if let Some(ref vpath) = payload.video_path {
        cmd.arg("-i").arg(vpath);
    } else {
        // 背景動画がない場合は黒背景 (1920x1080) を生成
        cmd.arg("-f")
            .arg("lavfi")
            .arg("-i")
            .arg(format!("color=c=#0f0f11:s=1920x1080:d={}:r=30", payload.total_duration));
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
            filter_complex.push_str(&format!("[{}:a]adelay={}|{}[a{}];", i + 1, delay_ms, delay_ms, i));
        }
        for i in 0..wav_files.len() {
            filter_complex.push_str(&format!("[a{}]", i));
        }
        filter_complex.push_str(&format!("amix=inputs={}:dropout_transition=2[outa]", wav_files.len()));

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            check_system_environment,
            detect_speech_segments,
            export_full_video
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
