#!/usr/bin/env python3
"""
Voix Tachie (Avatar Material) Importer
Extracts transparent character avatar images from ZIP archives (containing PSDs or PNGs) or direct PSD/PNG files.
Auto-detects character names (Zundamon, Metan, Tsumugi, Ritsu, etc.) and suggests VOICEVOX speaker IDs and theme colors.
"""

import sys
import os
import zipfile
import io
import base64
import json

def detect_character_info(filepath: str, inner_names: list[str]):
    all_text = (filepath + " " + " ".join(inner_names)).lower()
    
    if "ずんだもん" in all_text or "zundamon" in all_text:
        return {"name": "ずんだもん", "speaker_id": 3, "theme_color": "#10b981"}
    elif "めたん" in all_text or "四国めたん" in all_text or "metan" in all_text:
        return {"name": "四国めたん", "speaker_id": 2, "theme_color": "#ec4899"}
    elif "つむぎ" in all_text or "春日部つむぎ" in all_text or "tsumugi" in all_text:
        return {"name": "春日部つむぎ", "speaker_id": 8, "theme_color": "#f59e0b"}
    elif "リツ" in all_text or "波音リツ" in all_text or "ritsu" in all_text:
        return {"name": "波音リツ", "speaker_id": 9, "theme_color": "#ef4444"}
    elif "雨晴はう" in all_text or "hau" in all_text:
        return {"name": "雨晴はう", "speaker_id": 10, "theme_color": "#06b6d4"}
    elif "玄野武宏" in all_text or "takehiro" in all_text:
        return {"name": "玄野武宏", "speaker_id": 11, "theme_color": "#3b82f6"}
    elif "冥鳴ひまり" in all_text or "himari" in all_text:
        return {"name": "冥鳴ひまり", "speaker_id": 14, "theme_color": "#8b5cf6"}
    elif "九州そら" in all_text or "sora" in all_text:
        return {"name": "九州そら", "speaker_id": 16, "theme_color": "#6366f1"}
    elif "もち子" in all_text or "mochiko" in all_text:
        return {"name": "もち子さん", "speaker_id": 20, "theme_color": "#f97316"}
    elif "剣崎雌雄" in all_text:
        return {"name": "剣崎雌雄", "speaker_id": 21, "theme_color": "#64748b"}

    # Default fallback: derive from filename without extension
    clean_name = os.path.splitext(os.path.basename(filepath))[0]
    for noise in ["立ち絵素材", "立ち絵", "素材", "ver", "v1", "v2", "v3", ".", "_", "-"]:
        clean_name = clean_name.replace(noise, "")
    clean_name = clean_name.strip() or "Custom Character"
    return {"name": clean_name, "speaker_id": 3, "theme_color": "#8ab4f8"}

def remove_white_background(im):
    """白ベタ塗り背景（JPGや非透過PNG）を自動検出し、外周からフラッドフィルで透過処理"""
    try:
        import numpy as np
        import cv2
        from PIL import Image

        rgba = np.array(im.convert("RGBA"))
        h, w = rgba.shape[:2]

        corners = [rgba[0, 0], rgba[0, w - 1], rgba[h - 1, 0], rgba[h - 1, w - 1]]
        # 既に角が透過されているなら何もしない
        if any(c[3] < 50 for c in corners):
            return im

        # 角が白色系（R, G, B > 220）かチェック
        is_white_corner = any(c[0] > 220 and c[1] > 220 and c[2] > 220 for c in corners)
        if not is_white_corner:
            return im

        mask = np.zeros((h + 2, w + 2), np.uint8)
        bgr = cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGR)

        diff = (22, 22, 22)
        seeds = [
            (0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
            (w // 2, 0), (0, h // 2), (w - 1, h // 2), (w // 2, h - 1)
        ]
        for sx, sy in seeds:
            b, g, r = bgr[sy, sx]
            if r > 210 and g > 210 and b > 210:
                cv2.floodFill(
                    bgr, mask, (sx, sy), (0, 0, 0),
                    loDiff=diff, upDiff=diff,
                    flags=cv2.FLOODFILL_MASK_ONLY | (255 << 8)
                )

        filled = (mask[1:h + 1, 1:w + 1] == 255)
        alpha = rgba[:, :, 3]
        alpha[filled] = 0
        rgba[:, :, 3] = alpha

        return Image.fromarray(rgba)
    except Exception as e:
        sys.stderr.write(f"remove_white_background notice: {e}\n")
        return im

def process_file_or_data(filepath_or_data: str, filename_hint: str = ""):
    from PIL import Image

    inner_names = []
    im = None
    effective_psd_path = None
    filepath = filepath_or_data.strip()

    # Check if raw base64 or data URL
    if filepath.startswith("data:") or len(filepath) > 500 and not os.path.exists(filepath):
        clean_b64 = filepath
        if "base64," in clean_b64:
            clean_b64 = clean_b64.split("base64,")[1]
        raw_bytes = base64.b64decode(clean_b64)
        
        # Check if zip (magic bytes PK\x03\x04)
        if raw_bytes[:4] == b"PK\x03\x04":
            with zipfile.ZipFile(io.BytesIO(raw_bytes), "r") as z:
                psd_info = None
                png_infos = []
                for info in z.infolist():
                    try:
                        fn = info.filename.encode("cp437").decode("cp932")
                    except Exception:
                        fn = info.filename
                    inner_names.append(fn)

                    if fn.lower().endswith(".psd") and not "__macosx" in fn.lower():
                        psd_info = info
                        break
                    elif fn.lower().endswith(".png") and not "__macosx" in fn.lower():
                        png_infos.append((info.file_size, info))

                if psd_info:
                    data = z.read(psd_info)
                    effective_psd_path = "/tmp/voix_temp_avatar.psd"
                    with open(effective_psd_path, "wb") as f:
                        f.write(data)
                    im = Image.open(io.BytesIO(data))
                elif png_infos:
                    png_infos.sort(key=lambda x: x[0], reverse=True)
                    data = z.read(png_infos[0][1])
                    im = Image.open(io.BytesIO(data))
                else:
                    raise ValueError("No PSD or PNG image found inside the uploaded ZIP archive.")
        else:
            im = Image.open(io.BytesIO(raw_bytes))

        effective_path = filename_hint or "Uploaded Avatar"
    else:
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"File not found: {filepath}")

        effective_path = filepath
        if filepath.lower().endswith(".zip"):
            with zipfile.ZipFile(filepath, "r") as z:
                psd_info = None
                png_infos = []

                for info in z.infolist():
                    try:
                        fn = info.filename.encode("cp437").decode("cp932")
                    except Exception:
                        fn = info.filename
                    inner_names.append(fn)

                    if fn.lower().endswith(".psd") and not "__macosx" in fn.lower():
                        psd_info = info
                        break
                    elif fn.lower().endswith(".png") and not "__macosx" in fn.lower():
                        png_infos.append((info.file_size, info))

                if psd_info:
                    data = z.read(psd_info)
                    effective_psd_path = "/tmp/voix_temp_avatar.psd"
                    with open(effective_psd_path, "wb") as f:
                        f.write(data)
                    im = Image.open(io.BytesIO(data))
                elif png_infos:
                    png_infos.sort(key=lambda x: x[0], reverse=True)
                    data = z.read(png_infos[0][1])
                    im = Image.open(io.BytesIO(data))
                else:
                    raise ValueError("No PSD or PNG image found inside the ZIP archive.")

        elif filepath.lower().endswith(".psd"):
            effective_psd_path = filepath
            im = Image.open(filepath)
        elif filepath.lower().endswith(".png") or filepath.lower().endswith(".webp"):
            im = Image.open(filepath)
        else:
            im = Image.open(filepath)

    if im is None:
        raise ValueError("Failed to load image from given source.")

    if im.mode != "RGBA":
        im = im.convert("RGBA")

    # 白ベタ塗り背景の自動透過処理
    im = remove_white_background(im)

    unscaled_height = im.height
    max_height = 1600
    if im.height > max_height:
        scale = max_height / float(im.height)
        new_width = max(1, int(im.width * scale))
        im = im.resize((new_width, max_height), Image.Resampling.LANCZOS)

    char_info = detect_character_info(effective_path, inner_names)

    # 抽出画像をローカルLinuxの ~/.config/voix/characters/ へ直接PNG保存 (base64肥大化・フリーズ防止)
    output_base = os.path.expanduser("~/.config/voix/characters")
    safe_name = "".join(c for c in char_info["name"] if c.isalnum() or c in ("_", "-")).strip() or "character"
    import time
    char_dir = os.path.join(output_base, f"{safe_name}_{int(time.time())}")
    os.makedirs(char_dir, exist_ok=True)

    idle_path = os.path.join(char_dir, "idle.png")
    im.save(idle_path, format="PNG", optimize=True)

    avatar_data_url = idle_path
    speaking_data_url = idle_path
    expressions = {}

    if effective_psd_path and os.path.exists(effective_psd_path):
        try:
            import subprocess
            out = subprocess.check_output(['identify', '-format', '%[label]\n', effective_psd_path], stderr=subprocess.DEVNULL)
            lines = out.splitlines()
            target_idx = None
            expr_candidates = {
                'smile': [],
                'shock': [],
                'trouble': [],
                'angry': []
            }
            scale_factor = im.height / float(unscaled_height) if 'unscaled_height' in locals() and unscaled_height else 1.0

            for i, line in enumerate(lines):
                decoded = line.decode('cp932', errors='replace')
                if target_idx is None and any(k in decoded for k in ['ほあー', 'ほあ', 'あー', 'わあー', '▽', 'open']):
                    target_idx = i
                
                if any(k in decoded for k in ['にっこり', '><', 'ほほえみ', '赤面']):
                    expr_candidates['smile'].append(i)
                elif any(k in decoded for k in ['青ざめ', '見開き']):
                    expr_candidates['shock'].append(i)
                elif any(k in decoded for k in ['困り', '汗']):
                    expr_candidates['trouble'].append(i)
                elif any(k in decoded for k in ['おこ', '怒り']):
                    expr_candidates['angry'].append(i)

            def make_composite(layer_indices, output_filename):
                comp = im.copy()
                for idx in layer_indices:
                    geom = subprocess.check_output(['magick', 'identify', '-format', '%w %h %X %Y', f'{effective_psd_path}[{idx}]'], stderr=subprocess.DEVNULL).decode().strip().split()
                    if len(geom) == 4:
                        raw_x = int(geom[2].replace('+', ''))
                        raw_y = int(geom[3].replace('+', ''))
                        b = subprocess.check_output(['magick', f'{effective_psd_path}[{idx}]', 'png:-'], stderr=subprocess.DEVNULL)
                        l_im = Image.open(io.BytesIO(b)).convert('RGBA')
                        sx = int(raw_x * scale_factor)
                        sy = int(raw_y * scale_factor)
                        sl = l_im.resize((max(1, int(l_im.width * scale_factor)), max(1, int(l_im.height * scale_factor))), Image.Resampling.LANCZOS)
                        comp.paste(sl, (sx, sy), sl)
                out_path = os.path.join(char_dir, output_filename)
                comp.save(out_path, format='PNG', optimize=True)
                return out_path

            if target_idx is not None:
                speaking_data_url = make_composite([target_idx], "speaking.png")

            for k, indices in expr_candidates.items():
                if indices:
                    expressions[k] = make_composite(indices[:3], f"{k}.png")
        except Exception as e:
            sys.stderr.write(f"Expression composite notice: {e}\n")

    return {
        "character_name": char_info["name"],
        "speaker_id": char_info["speaker_id"],
        "theme_color": char_info["theme_color"],
        "avatar_data_url": avatar_data_url,
        "speaking_data_url": speaking_data_url,
        "expressions": expressions,
        "width": im.width,
        "height": im.height
    }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: process_tachie.py <archive_path_or_stdin> [filename_hint]"}), file=sys.stderr)
        sys.exit(1)

    arg1 = sys.argv[1]
    filename_hint = sys.argv[2] if len(sys.argv) > 2 else ""

    if arg1 == "-":
        filepath_or_data = sys.stdin.read().strip()
    else:
        filepath_or_data = arg1

    try:
        res = process_file_or_data(filepath_or_data, filename_hint)
        print(json.dumps(res))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
