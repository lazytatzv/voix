# Voix

> **Linuxネイティブで動く、YAML管理のゆっくり解説動画スタジオ**

録画した動画（ゲーム実況・作業動画・技術解説など）に、VOICEVOX系の音声・立ち絵・字幕・テロップ・BGM/SEを重ねて、MP4 / MKV / WebM に書き出せるデスクトップアプリです。
Tauri v2 + React 19 + TypeScript + Rust + FFmpeg で構成され、プロジェクトと設定はすべて人間が読める YAML で管理できます。

---

## 主な機能

- **マルチトラック・タイムライン** — 背景動画 / キャラクター / 音声・字幕 / テキスト / 画像 / BGM・SE の6レーン。ドラッグで移動、右端ドラッグで長さ変更、`S` で再生ヘッド位置に分割、波形表示、Altでスナップ解除。
- **WYSIWYGプレビュー** — プレビューと書き出しが同じ Canvas コンポジター（`src/render/overlayRenderer.ts`）を使うため、見た目と出力が一致します。立ち絵はプレビュー上で直接ドラッグ配置でき、枠・中央・下端へスナップします。
- **テロップ・画像モーション** — フェードイン/アウトに加えて、スライド・ズーム・ポップの登場/退場アニメーションをアイテム単位で設定できます。タイミングはプレビューと書き出しで共通です。
- **YAMLプロジェクト** — `.voix.yaml` が標準形式。手編集でき、コメントやキー順も保持されます。旧JSON（`.voix` / `.json`）も読み込み可能。
- **最近使ったプロジェクト** — ヘッダーの履歴メニューから直近8件を開けます。存在しなくなったファイルは自動的に一覧から外れます。
- **自動保存** — `~/.config/voix/autosave.voix.yaml` と localStorage の二重保存。次回起動時に復元します。
- **音声キャッシュ** — 合成済みWAVを `~/.cache/voix/audio` に保存し、`audioKey` としてプロジェクトに記録。再起動後の再合成を不要にします。
- **TTSプロバイダー** — VOICEVOX / COEIROINK / AivisSpeech など、VOICEVOX互換APIに対応。カスタムエンドポイントも追加可能。
- **インスペクター** — 選択アイテムのセリフ・話速・音高・音量・表情・テロップスタイル・画像座標・BGMフェードなどを数値編集。
- **書き出し** — 透過オーバーレイPNGをフレーム合成し、Rust側でFFmpegに渡して背景動画・音声と結合。範囲指定・進捗表示・実行中キャンセルに対応します。
- **Linuxフレンドリー** — XDG準拠の設定/キャッシュ/データディレクトリ、`~` 展開、xdg-open連携。WebKitGTKでも背景動画・BGMを再生できるよう blob URL 経由で読み込みます。

---

## 必要環境

| 依存 | バージョン / 備考 |
|---|---|
| Node.js | 20 以上 |
| pnpm | 9 以上 |
| Rust | stable（edition 2024） |
| Tauri v2 のLinux依存 | `webkit2gtk-4.1`, `libappindicator3`, `librsvg2` など |
| FFmpeg / FFprobe | 書き出しに必須。`ffmpeg -version` で確認 |
| VOICEVOX ENGINE | `http://localhost:50021` で起動（Docker可） |
| 日本語フォント | Noto Sans JP 推奨 |

### VOICEVOX の起動（同梱スクリプト）

```bash
./voicevox.sh start        # CPU版
./voicevox.sh start gpu    # NVIDIA GPU版
./voicevox.sh stop
```

### アプリの起動

```bash
pnpm install
pnpm tauri dev
```

本番ビルド:

```bash
pnpm tauri build
```

---

## プロジェクトYAML

保存すると次のような `.voix.yaml` が生成されます（抜粋）。

```yaml
format: voix-project
version: 1.1.0
name: 技術解説 #01
timeline:
  width: 1920
  height: 1080
  fps: 30
  duration: 42.5
  backgroundColor: '#0f0f11'
  overlayFps: 15
  videoPath: /home/user/Videos/background.mp4
  videoVolume: 1
tracks:
  - id: video
    name: Video
    visible: true
    locked: false
    muted: false
  # character / voice / text / image / audio も同様
characters:
  - id: zundamon
    name: ずんだもん
    ttsProviderId: voicevox
    speakerId: 3
    position: left
    avatar:
      idle: /characters/zundamon.png
      speaking: /characters/zundamon_talking.png
      blinking: /characters/zundamon_blinking.png
items:
  - id: voice_1
    type: voice
    layer: 2
    startTime: 0.5
    duration: 2.4
    name: 'ずんだもん: YAMLで管理するのだ'
    characterId: zundamon
    text: YAMLで台本を管理するのは快適なのだ！
    expression: smile
    speedScale: 1
    pitchScale: 0
    volumeScale: 1
    anim: bounce
    se: pop
    audioKey: 5f3c9a...   # ~/.cache/voix/audio/<key>.wav
  - id: text_1
    type: text
    layer: 4
    startTime: 4
    duration: 3
    text: 'Arch Linux × Neovim'
    xPercent: 50
    yPercent: 20
    widthPercent: 80
    style:
      fontSize: 64
      textColor: '#ffffff'
      strokeColor: '#0a0a0c'
      strokeWidth: 6
      bgStyle: none
      yOffsetPercent: 12
  - id: bgm_1
    type: audio
    layer: 1
    src: /home/user/Music/bgm.mp3
    startTime: 0
    duration: 42.5
    volume: 0.3
    isBgm: true
    loop: true
    fadeIn: 1
    fadeOut: 2
```

### アイテム共通フィールド

| フィールド | 説明 |
|---|---|
| `id` | 一意なID（自動生成） |
| `type` | `voice` / `text` / `image` / `audio` / `video` |
| `layer` | 描画順（大きいほど手前） |
| `startTime` / `duration` | タイムライン上の開始秒・長さ（秒） |
| `name` | タイムライン表示名 |
| `hidden` / `locked` | 個別の非表示・編集ロック |
| `fadeIn` / `fadeOut` | フェード時間（秒）。テロップ・画像・音声に適用 |
| `animIn` / `animOut` | `fade` / `slide-up` / `slide-down` / `slide-left` / `slide-right` / `zoom` / `pop` |
| `src` | 画像・音声・動画の絶対パス（`~` 可） |

### 種類別フィールド

- **voice**: `characterId`, `text`, `subtitleText`, `expression`, `speedScale`, `pitchScale`, `volumeScale`, `audioKey`, `phonemes`, `terminal: { cmd, output }`, `se`, `anim`, `flipH`, `scale`
- **text**: `text`, `style`（`fontSize`, `fontFamily`, `textColor`, `strokeColor`, `strokeWidth`, `outerStrokeColor`, `outerStrokeWidth`, `bgStyle`, `bgColor`, `hasShadow`, `rubyDisplay` など）, `xPercent`, `yPercent`, `widthPercent`, `align`, `rotation`, `opacity`
- **image**: `x`, `y`, `width`, `height`, `rotation`, `opacity`, `flipH`
- **audio**: `volume`, `offset`（曲の頭出し秒）, `isBgm`, `loop`, `fadeIn`, `fadeOut`
- **video**: `volume`, `offsetTime`

> 旧形式の `.voix` / `.json` はそのまま開けます。保存するとYAML形式になります。

---

## 設定とXDGパス

| 用途 | パス |
|---|---|
| 設定 | `$XDG_CONFIG_HOME/voix/settings.yaml`（既定: `~/.config/voix/settings.yaml`） |
| キャラクター素材 | `~/.config/voix/characters.json` |
| 自動保存プロジェクト | `~/.config/voix/autosave.voix.yaml` |
| 音声キャッシュ | `$XDG_CACHE_HOME/voix/audio`（既定: `~/.cache/voix/audio`） |
| 作業データ | `$XDG_DATA_HOME/voix`（既定: `~/.local/share/voix`） |

`settings.yaml` の例:

```yaml
aiProvider: gemini
geminiApiKey: ''
remoteEndpoint: http://192.168.1.100:11434
remoteModel: qwen2.5:latest
voicevoxEndpoint: http://localhost:50021
exportOutputPath: ~/voix_output.mp4
exportFps: 30
exportWidth: 1920
exportHeight: 1080
overlayFps: 15
exportCrf: 20
exportPreset: medium
backgroundColor: '#0f0f11'
autosave: true
enableTerminalOverlay: true
ttsProviders:
  - id: voicevox
    name: VOICEVOX
    endpoint: http://localhost:50021
    enabled: true
```

設定モーダルの **Dotfiles** タブから `settings.yaml` と `characters.json` を直接編集できます（YAML/JSON構文チェック付き）。

---

## キーボードショートカット

| キー | 動作 |
|---|---|
| `Space` | 再生 / 一時停止 |
| `Home` | 先頭へシーク |
| `←` / `→` | 1フレーム移動 |
| `Shift + ←` / `→` | 1秒移動 |
| `Delete` / `Backspace` | 選択アイテム削除 |
| `S` | 選択アイテムを再生ヘッド位置で分割 |
| `Ctrl + Z` | 元に戻す |
| `Ctrl + Shift + Z` / `Ctrl + Y` | やり直し |
| `Ctrl + D` | 選択アイテム複製 |
| `Ctrl + C` / `Ctrl + V` | アイテムをコピー / 再生ヘッド位置に貼り付け |
| `Ctrl + S` | 上書き保存 |
| `Ctrl + Shift + S` | 名前を付けて保存 |
| `Ctrl + O` | プロジェクトを開く |
| `Ctrl + N` | 新規プロジェクト |
| `Ctrl + E` | 書き出し |
| `Ctrl + ,` | 設定 |

タイムライン上では `Alt` を押しながらドラッグするとスナップを解除できます。アイテムをダブルクリックするとインスペクターが開きます。

---

## 書き出しパイプライン

1. **アセット準備** — 立ち絵・画像を読み込み、音声（VOICEVOX / キャッシュ / 読み込み済みBGM）をWAVとして一時ディレクトリへ書き出し。指定範囲に重なる音声だけを切り出し、`offset` で曲の頭出しを反映します。
2. **オーバーレイ描画** — `overlayFps`（既定15fps）で透過PNGフレームをCanvasに描画。プレビューと同じ `drawOverlayFrame()` を使用します。
3. **FFmpeg合成** — Rustの `finish_export_job` が背景動画を範囲開始位置までシークしてループさせ、透過PNGをオーバーレイ。音声は `adelay` / `atrim` / `afade` / `amix` でミックス。
4. **エンコード** — 拡張子に応じて自動選択:
   - `.mp4` / `.mkv` → H.264 (libx264) + AAC
   - `.webm` → VP9 (libvpx-vp9) + Opus
5. **進捗とキャンセル** — `export-progress` イベントでUIにフェーズと%を通知。実行中に **Cancel Export** を押すとFFmpegを停止し、書きかけの出力と一時フレームを削除します。

解像度・FPS・オーバーレイFPS・CRF・プリセットは書き出しモーダル、または設定の **Video & Export** タブで指定できます。**Export range** に開始・終了秒を入れると部分書き出しになり、**Full timeline** で全体に戻せます。

解像度・FPS・オーバーレイFPS・CRF・プリセットは書き出しモーダル、または設定の **Video & Export** タブで指定できます。

> 現在のフレームコンポジター方式は出力の再現性を優先して x264/VP9 でエンコードします。VA-API/NVENCの設定値は保存されますが、このパイプラインでは使用されません。

---

## 開発

```bash
pnpm dev          # Viteのみ（ブラウザでもUI確認可、書き出しは不可）
pnpm build        # TypeScript + Vite本番ビルド
pnpm test         # Vitest（YAML正規化・ハッシュ）
pnpm tauri dev    # デスクトップアプリ
cd src-tauri && cargo check
```

### ディレクトリ構成

```
src/
  App.tsx                     # プロジェクト状態・再生・保存・ショートカット
  components/                 # Header, Timeline, VideoPreview, Inspector, Modals
  render/overlayRenderer.ts   # プレビュー/書き出し共通コンポジター
  render/imageCache.ts        # 画像読み込みキャッシュ
  services/projectService.ts  # YAML保存・読込・自動保存
  services/exportService.ts   # フレーム描画と書き出しオーケストレーション
  services/audioCache.ts      # WAVキャッシュ
  services/waveformCache.ts   # タイムライン波形ピーク
  services/tts/TTSManager.ts  # 合成とキャッシュ
  utils/mediaUrl.ts           # WebKitGTK向け blob URL 変換
  utils/projectYaml.ts        # YAMLスキーマ・正規化・サンプル
  types/index.ts              # データモデル
src-tauri/src/lib.rs          # ファイル/キャッシュ/FFmpegコマンド
```

---

## トラブルシューティング

- **書き出しに失敗する** — `ffmpeg` と `ffprobe` が `PATH` にあるか確認してください。エラーダイアログにはFFmpegの末尾ログが出ます。
- **VOICEVOXに接続できない** — `curl http://localhost:50021/version` で確認。設定のTTSエンドポイントを変更できます。
- **音声が再生成される** — `~/.cache/voix/audio` が削除されたか、テキスト・話速・音高が変更されています。設定の「Clear audio cache」で明示的に消せます。
- **localStorage quota error** — 立ち絵のData URLで容量超過することがありますが、ネイティブ自動保存は継続します。
- **背景動画が表示されない** — WebKitGTKでは `asset:` URLを直接再生できないため、アプリはファイルを blob URL に変換して読み込みます。巨大な動画で失敗する場合はファイルの読み取り権限と空きメモリを確認してください。
- **日本語フォントが微妙** — `Noto Sans JP` をインストールするか、テロップの `fontFamily` を変更してください。
