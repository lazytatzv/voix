#!/usr/bin/env python3
"""
Voix Tachie (Avatar Material) Importer
Extracts transparent character avatar images from ZIP archives (containing PSDs or PNGs) or direct PSD/PNG files.
Auto-detects character names (Zundamon, Metan, Tsumugi, Ritsu, etc.) and suggests VOICEVOX speaker IDs and theme colors.
Performs intelligent PSD layer exclusive selection (avoiding duplicate brows/mouths/accessories)
and uniform transparent bounding-box auto-cropping so any PSD sits naturally on screen with zero floating gap.
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
        if any(c[3] < 50 for c in corners):
            return im

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

def crop_transparent_padding(im, padding=(16, 20, 16, 0)):
    """単一画像から透明余白を取り除く (左右, 上, 下のパディング)"""
    import numpy as np
    arr = np.array(im)
    if arr.ndim < 3 or arr.shape[2] < 4:
        return im
    alpha = arr[:, :, 3]
    pts = np.argwhere(alpha > 8)
    if len(pts) == 0:
        return im
    y0, x0 = pts.min(axis=0)
    y1, x1 = pts.max(axis=0)
    pad_l, pad_t, pad_r, pad_b = padding
    x1_c = max(0, x0 - pad_l)
    y1_c = max(0, y0 - pad_t)
    x2_c = min(im.width, x1 + pad_r)
    y2_c = min(im.height, y1 + 1 + pad_b)
    return im.crop((x1_c, y1_c, x2_c, y2_c))

def process_file_or_data(filepath_or_data: str, filename_hint: str = ""):
    from PIL import Image
    import numpy as np

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

    char_info = detect_character_info(effective_path, inner_names)

    # 保存先ディレクトリ
    output_base = os.path.expanduser("~/.config/voix/characters")
    cname = char_info["name"].lower()
    if "ずんだもん" in cname or "zundamon" in cname:
        safe_name = "zundamon"
    elif "めたん" in cname or "metan" in cname:
        safe_name = "metan"
    elif "つむぎ" in cname or "tsumugi" in cname:
        safe_name = "tsumugi"
    elif "リツ" in cname or "ritsu" in cname:
        safe_name = "ritsu"
    else:
        ascii_chars = "".join(c for c in char_info["name"] if c.isascii() and (c.isalnum() or c in ("_", "-"))).strip()
        safe_name = ascii_chars or f"char_{char_info.get('speaker_id', 3)}"
    import time
    char_dir = os.path.join(output_base, f"{safe_name}_{int(time.time())}")
    os.makedirs(char_dir, exist_ok=True)

    max_height = 1600
    expressions = {}
    idle_path = os.path.join(char_dir, "idle.png")
    speaking_data_url = idle_path
    avatar_data_url = idle_path

    # PSD素材の場合の高品質コンポジット & 排他選択 & 統一クロップ
    if effective_psd_path and os.path.exists(effective_psd_path):
        try:
            from psd_tools import PSDImage
            psd_obj = PSDImage.open(effective_psd_path)

            # 初期状態の全レイヤー可視性を記録 (目セット等のネストフォルダで不要な多重合成を完全防止)
            initial_vis = {l: l.visible for l in psd_obj.descendants()}

            EXCLUDE_KEYWORDS = ["前髪", "髪", "hair", "もみあげ", "腕", "arm", "服", "cloth", "装飾", "アクセサリ", "体", "body"]

            def find_groups(container):
                eye_g, mouth_g, brow_g, blush_g = None, None, None, None
                for layer in container:
                    if not layer.is_group():
                        continue
                    lname = layer.name.lower()
                    if any(ex in lname or ex in layer.name for ex in EXCLUDE_KEYWORDS):
                        continue

                    if ("目" in layer.name or "eye" in lname or "瞳" in layer.name) and not eye_g:
                        eye_g = layer
                    elif ("口" in layer.name or "mouth" in lname or "くち" in layer.name) and not mouth_g:
                        mouth_g = layer
                    elif ("眉" in layer.name or "brow" in lname or "まゆ" in layer.name) and not brow_g:
                        brow_g = layer
                    elif any(k in layer.name for k in ["顔色", "ほっぺ", "チーク", "赤面", "照れ"]) and not blush_g:
                        blush_g = layer

                    sub_eye, sub_mouth, sub_brow, sub_blush = find_groups(layer)
                    if not eye_g and sub_eye: eye_g = sub_eye
                    if not mouth_g and sub_mouth: mouth_g = sub_mouth
                    if not brow_g and sub_brow: brow_g = sub_brow
                    if not blush_g and sub_blush: blush_g = sub_blush
                return eye_g, mouth_g, brow_g, blush_g

            eye_g, mouth_g, brow_g, blush_g = find_groups(psd_obj)

            # 表情以外のラジオボタン(*レイヤー)の初期化: 複数表示されている場合は最初の1つだけに整理
            expr_groups = {g for g in [eye_g, mouth_g, brow_g, blush_g] if g is not None}
            def sanitize_radio_groups(container):
                for layer in container:
                    if layer in expr_groups:
                        continue
                    if layer.is_group():
                        radio_children = [c for c in layer if c.name.startswith('*')]
                        if len(radio_children) > 1:
                            visible_ones = [c for c in radio_children if c.visible and not '非表示' in c.name]
                            if len(visible_ones) > 1:
                                for c in visible_ones[1:]:
                                    c.visible = False
                            elif len(visible_ones) == 0:
                                first_valid = [c for c in radio_children if not '非表示' in c.name]
                                if first_valid:
                                    first_valid[0].visible = True
                        sanitize_radio_groups(layer)

            sanitize_radio_groups(psd_obj)

            def select_one_layer(group, keywords, allow_none=False, avoid_keywords=None):
                if not group:
                    return None
                for layer in group:
                    layer.visible = False
                    if layer.is_group():
                        for sub in layer.descendants():
                            sub.visible = False

                chosen = None
                if keywords:
                    for kw in keywords:
                        for layer in group:
                            clean = layer.name.lstrip('*!')
                            if clean == kw or layer.name == kw:
                                if avoid_keywords and any(av in layer.name for av in avoid_keywords):
                                    continue
                                chosen = layer
                                break
                        if chosen is not None:
                            break

                        for layer in group:
                            if kw in layer.name:
                                if avoid_keywords and any(av in layer.name for av in avoid_keywords):
                                    continue
                                chosen = layer
                                break
                        if chosen is not None:
                            break

                    if chosen is None and avoid_keywords:
                        for kw in keywords:
                            for layer in group:
                                clean = layer.name.lstrip('*!')
                                if clean == kw or layer.name == kw or kw in layer.name:
                                    chosen = layer
                                    break
                            if chosen is not None:
                                break

                if chosen is None and not allow_none and len(group) > 0:
                    valid_first = [l for l in group if not (avoid_keywords and any(av in l.name for av in avoid_keywords))]
                    chosen = valid_first[0] if valid_first else list(group)[0]

                if chosen is not None:
                    chosen.visible = True
                    if chosen.is_group():
                        # サブレイヤーの初期可視性を忠実に復元 (見開き白目や複数黒目の多重重複を完全に防止)
                        for sub in chosen.descendants():
                            sub.visible = initial_vis.get(sub, False)
                        for container in [chosen] + [d for d in chosen.descendants() if d.is_group()]:
                            radios = [c for c in container if c.name.startswith('*')]
                            if radios and not any(c.visible for c in radios):
                                radios[0].visible = True
                    return chosen

                return None

            def render_raw_expr(eye_kw, mouth_kw, brow_kw, blush_kw):
                select_one_layer(eye_g, eye_kw)
                select_one_layer(mouth_g, mouth_kw)
                select_one_layer(brow_g, brow_kw, avoid_keywords=["太眉", "太"])
                select_one_layer(blush_g, blush_kw, allow_none=True)

                comp_img = psd_obj.composite(ignore_preview=True)
                if comp_img.mode != 'RGBA':
                    comp_img = comp_img.convert('RGBA')
                return comp_img

            expr_specs = {
                "idle": (["普通目", "目セット"], ["むふ", "んー", "△", "ほほえみ", "む", "普通"], ["普通眉", "普通", "ごきげん"], ["ほっぺ", "普通"]),
                "speaking": (["普通目", "目セット"], ["ほあー", "わあー", "▽", "お", "あー"], ["普通眉", "普通", "ごきげん"], ["ほっぺ", "普通"]),
                "blinking": (["にっこり", "なごみ目", "目閉じ", "細め目"], ["むふ", "んー", "△", "ほほえみ", "む", "普通"], ["普通眉", "普通", "ごきげん"], ["ほっぺ", "普通"]),
                "smile": (["にっこり", "><", "目閉じ"], ["ほほえみ", "△", "むふ", "にやり"], ["ごきげん", "普通眉", "普通"], ["赤面", "ほっぺ赤め", "ほっぺ"]),
                "angry": (["普通目", "目セット"], ["むー", "む", "んー"], ["怒り眉", "おこ", "上がり眉"], []),
                "shock": (["〇〇", "見開き", "ぐるぐる"], ["おほお", "お", "わあー"], ["困り眉", "こまり"], ["青ざめ", "かげり"]),
                "trouble": (["ジト目", "細め目"], ["んー", "むふ", "む"], ["困り眉", "こまり"], ["ほっぺ", "普通"]),
            }

            raw_images = {}
            for key, spec in expr_specs.items():
                raw_images[key] = render_raw_expr(*spec)

            # 全表情共通の不透明バウンディングボックスを算出 (Unified Auto Crop)
            min_x, min_y = 999999, 999999
            max_x, max_y = 0, 0
            orig_w, orig_h = psd_obj.size

            for key, c_img in raw_images.items():
                arr = np.array(c_img)
                alpha = arr[:, :, 3]
                pts = np.argwhere(alpha > 8)
                if len(pts) > 0:
                    y0, x0 = pts.min(axis=0)
                    y1, x1 = pts.max(axis=0)
                    min_x = min(min_x, int(x0))
                    min_y = min(min_y, int(y0))
                    max_x = max(max_x, int(x1))
                    max_y = max(max_y, int(y1))

            if max_x > min_x and max_y > min_y:
                crop_x1 = max(0, min_x - 16)
                crop_y1 = max(0, min_y - 20)
                crop_x2 = min(orig_w, max_x + 16)
                crop_y2 = min(orig_h, max_y + 1)
                crop_box = (crop_x1, crop_y1, crop_x2, crop_y2)
            else:
                crop_box = (0, 0, orig_w, orig_h)

            saved_images = {}
            for key, c_img in raw_images.items():
                cropped = c_img.crop(crop_box)
                if cropped.height > max_height:
                    scale = max_height / float(cropped.height)
                    new_w = max(1, int(cropped.width * scale))
                    cropped = cropped.resize((new_w, max_height), Image.Resampling.LANCZOS)
                out_p = os.path.join(char_dir, f"{key}.png")
                cropped.save(out_p, format="PNG", optimize=True)
                saved_images[key] = (out_p, cropped)

            idle_path = saved_images["idle"][0]
            avatar_data_url = idle_path
            speaking_data_url = saved_images["speaking"][0]
            expressions["blinking"] = saved_images["blinking"][0]
            expressions["smile"] = saved_images["smile"][0]
            expressions["angry"] = saved_images["angry"][0]
            expressions["shock"] = saved_images["shock"][0]
            expressions["trouble"] = saved_images["trouble"][0]
            
            final_w, final_h = saved_images["idle"][1].size
            body_type = "full_body" if (final_h / float(max(1, final_w))) >= 1.6 else "bust_up"

            return {
                "character_name": char_info["name"],
                "speaker_id": char_info["speaker_id"],
                "theme_color": char_info["theme_color"],
                "avatar_data_url": avatar_data_url,
                "speaking_data_url": speaking_data_url,
                "expressions": expressions,
                "width": final_w,
                "height": final_h,
                "body_type": body_type
            }
        except Exception as e_psd:
            sys.stderr.write(f"psd_tools composite notice: {e_psd}\n")

    # PSDが読み込めないか単一画像の場合のフォールバック
    im = crop_transparent_padding(im)
    if im.height > max_height:
        scale = max_height / float(im.height)
        new_width = max(1, int(im.width * scale))
        im = im.resize((new_width, max_height), Image.Resampling.LANCZOS)

    im.save(idle_path, format="PNG", optimize=True)
    body_type = "full_body" if (im.height / float(max(1, im.width))) >= 1.6 else "bust_up"

    return {
        "character_name": char_info["name"],
        "speaker_id": char_info["speaker_id"],
        "theme_color": char_info["theme_color"],
        "avatar_data_url": idle_path,
        "speaking_data_url": idle_path,
        "expressions": expressions,
        "width": im.width,
        "height": im.height,
        "body_type": body_type
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
