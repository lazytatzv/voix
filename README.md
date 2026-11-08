# Voix

> **Linuxネイティブで動く、YAML管理のゆっくり解説動画スタジオ**

録画した動画（ゲーム実況・作業動画・技術解説など）に、VOICEVOX系の音声・立ち絵・字幕・テロップ・BGM/SEを重ねて、MP4 / MKV / WebM に書き出せるデスクトップアプリです。
Tauri v2 + React 19 + TypeScript + Rust + FFmpeg で構成され、プロジェクトと設定はすべて人間が読める YAML で管理できます。

---

## 主な機能

- **マルチトラック・タイムライン** — 背景動画 / キャラクター / 音声・字幕 / テキスト / 画像 / BGM・SE の6レーン。ドラッグで移動、右端ドラッグで長さ変更、`S` で再生ヘッド位置に分割、波形表示、Altでスナップ解除。選択アイテムは `Alt+←/→` で1フレームずつ微調整でき、`Shift+Delete` のリップル削除で後続アイテムを詰めて空白を閉じられます。SRTファイルを字幕テキストとして読み込めます。また、音声アイテムのタイミングからSRTを書き出せます。ゆっくりMovieMaker4の `.ymmp` プロジェクトをヘッダーまたはドラッグ＆ドロップで読み込めます（声・テロップ・画像・音声・背景動画に対応、未対応アイテムは件数を表示してスキップ）。
- **マーカー** — タイムラインに名前付きの目印を置き、クリックでシーク。近くのアイテムはマーカーへスナップします。位置はYAMLに保存されます。
- **WYSIWYGプレビュー** — プレビューと書き出しが同じ Canvas コンポジター（`src/render/overlayRenderer.ts`）を使うため、見た目と出力が一致します。立ち絵はプレビュー上で直接ドラッグ配置でき、枠・中央・下端へスナップします。
- **テロップ・画像モーション** — フェードイン/アウトに加えて、スライド・ズーム・ポップの登場/退場アニメーションをアイテム単位で設定できます。タイミングはプレビューと書き出しで共通です。
- **アイテム別ビジュアルエフェクト** — テロップ・画像ごとに明るさ・コントラスト・彩度・ぼかし・色相回転・グレースケール・セピア・反転を調整できます。Canvasフィルターとしてプレビューと書き出しの両方に適用されます。
- **ブレンドモード** — テロップ・画像を乗算・スクリーン・オーバーレイ・加算などの合成モードで背景になじませられます。YMM4の`Blend`もインポート時に変換します。
- **縦書き・行間・字間** — テロップは日本語の縦書き（縦組み）に対応し、行間と字間を数値で調整できます。プレビューと書き出しで同じレイアウトを使います。
- **キーフレーム** — テロップ・画像の位置、拡大率、回転、不透明度を複数キーで打てます。線形・イーズイン/アウト・ホールドで補間し、`K` キーまたはインスペクターから追加。YAMLにも保存され、プレビューと書き出しで同じ補間を使います。
- **音声・動画の速度調整** — BGM/SE は 0.25〜4× の再生速度、背景動画も開始オフセット・速度・フィット（contain / cover / stretch）をプロジェクト設定から調整できます。速度はプレビューとFFmpeg書き出しの両方に反映されます。
- **BGMダッキング** — セリフ中だけBGMを自動で下げ、話し終わると滑らかに戻します。下げ幅・アタック・リリースはプロジェクト設定で調整でき、プレビューと書き出しの両方に同じカーブが適用されます。
- **YAMLプロジェクト** — `.voix.yaml` が標準形式。手編集でき、コメントやキー順も保持されます。旧JSON（`.voix` / `.json`）も読み込み可能。
- **最近使ったプロジェクト** — ヘッダーの履歴メニューから直近8件を開けます。存在しなくなったファイルは自動的に一覧から外れます。
- **自動保存** — `~/.config/voix/autosave.voix.yaml` と localStorage の二重保存。次回起動時に復元します。
- **音声キャッシュ** — 合成済みWAVを `~/.cache/voix/audio` に保存し、`audioKey` としてプロジェクトに記録。再起動後の再合成を不要にします。
- **TTSプロバイダー** — VOICEVOX / COEIROINK / AivisSpeech など、VOICEVOX互換APIに対応。キャラクター設定ではエンジン・キャラクター・スタイルを個別に選べ、VOICEVOXの全話者・全スタイルをそのまま一覧表示します。**All voices** の試聴ブラウザでは、検索しながら各話者・各スタイルの ▶ を押すだけでその声を再生でき、**Play all** で一覧の全ボイスを順番に試聴できます。話者を変えると該当セリフの古い音声キャッシュを破棄して自動で再合成します。
- **インスペクター** — 選択アイテムのセリフ・話速・音高・抑揚・句読点の間・前後の無音・音量・セリフのフェードイン/アウト・表情・テロップスタイル・画像座標・BGMフェードなどを数値編集。
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
  videoOffset: 0        # タイムライン0秒で使う動画内の開始位置（秒）
  videoSpeed: 1         # 背景動画の再生速度（0.25-4）
  videoFit: contain     # contain / cover / stretch
  ducking:
    enabled: true
    level: 0.35        # セリフ中のBGM音量（0-1）
    attack: 0.15       # 下げ始めるまでの秒数
    release: 0.4       # 戻し始めるまでの秒数
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
    speed: 1            # 0.25-4倍速
    isBgm: true
    loop: true
    fadeIn: 1
    fadeOut: 2
markers:
  - id: marker_intro
    time: 4.2
    label: イントロ
    color: '#fbbf24'
  - id: marker_demo
    time: 18.75
    label: デモ開始
```

### マーカー

`markers` はタイムライン上の目印です。`time`（秒）が必須で、`label` と `color` は任意。タイムライン上部の旗をクリックするとシーク、右クリックで削除できます。`M` キーまたは **Marker** ボタンで再生ヘッド位置に追加され、近くをドラッグするとマーカーへスナップします。YAMLは時刻順に自動ソートされます。

### アイテム共通フィールド

| フィールド | 説明 |
|---|---|
| `id` | 一意なID（自動生成） |
| `type` | `voice` / `text` / `image` / `audio` / `video` |
| `layer` | 描画順（大きいほど手前） |
| `startTime` / `duration` | タイムライン上の開始秒・長さ（秒） |
| `name` | タイムライン表示名 |
| `hidden` / `locked` | 個別の非表示・編集ロック |
| `fadeIn` / `fadeOut` | フェード時間（秒）。テロップ・画像・音声・セリフに適用 |
| `animIn` / `animOut` | `fade` / `slide-up` / `slide-down` / `slide-left` / `slide-right` / `zoom` / `pop` |
| `effects` | 描画フィルター: `blur`, `brightness`, `contrast`, `saturation`, `hueRotate`, `grayscale`, `sepia`, `invert` |
| `blendMode` | `normal` / `multiply` / `screen` / `overlay` / `add` などの合成モード（テロップ・画像） |
| `src` | 画像・音声・動画の絶対パス（`~` 可） |

### 種類別フィールド

- **voice**: `characterId`, `text`, `subtitleText`, `expression`, `speedScale`, `pitchScale`, `volumeScale`, `intonationScale`, `prePhonemeLength`, `postPhonemeLength`, `pauseLengthScale`, `audioKey`, `phonemes`, `terminal: { cmd, output }`, `se`, `anim`, `flipH`, `scale`
- **text**: `text`, `style`（`fontSize`, `fontFamily`, `textColor`, `strokeColor`, `strokeWidth`, `outerStrokeColor`, `outerStrokeWidth`, `lineHeight`, `letterSpacing`, `italic`, `underline`, `strikethrough`, `wordWrap`, `vertical`, `bgStyle`, `bgColor`, `hasShadow`, `rubyDisplay` など）, `xPercent`, `yPercent`, `widthPercent`, `align`, `rotation`, `opacity`, `displayInterval`, `displayDirection`, `hideInterval`, `hideDirection`
- **image**: `x`, `y`, `width`, `height`, `rotation`, `opacity`, `flipH`
- **audio**: `volume`, `speed`（0.25-4倍速）, `offset`（曲の頭出し秒）, `isBgm`, `loop`, `fadeIn`, `fadeOut`
- **video**: `volume`, `offsetTime`

### 文字の表示アニメーション

`text` アイテムは文字単位の表示・非表示アニメーションを持てます。

| フィールド | 説明 |
|---|---|
| `displayInterval` | 一文字が現れる間隔（秒）。0で即時表示 |
| `displayDirection` | `from-first`（先頭から）/ `from-last`（末尾から） |
| `hideInterval` | アイテム終端に向けて一文字が消える間隔（秒）。0で即時非表示 |
| `hideDirection` | `from-first` / `from-last` |

表示は文字の最終レイアウトを保ったまま行われるため、タイプライター表示中も行折り返しやルビの位置が揺れません。YMM4の `DisplayInterval` / `DisplayDirection` / `HideInterval` / `HideDirection` はインポート時にこの形式へ変換されます。

### キーフレーム

テキスト・画像アイテムは `keyframes` 配列を持てます。`time` はアイテム先頭からの相対秒です。

```yaml
keyframes:
  - time: 0
    x: 50
    y: 80
    scale: 0.8
    opacity: 0
    easing: ease-out
  - time: 0.6
    scale: 1
    opacity: 1
  - time: 3
    y: 72
    easing: hold
```

| フィールド | 説明 |
|---|---|
| `time` | アイテム先頭からの相対秒 |
| `x` / `y` | テキストは画面％、画像はプロジェクト座標（px） |
| `scale` / `rotation` / `opacity` | 拡大率・回転角・不透明度 |
| `easing` | `linear` / `ease-in` / `ease-out` / `ease-in-out` / `hold` |

省略したプロパティは直前のキー（最初のキーならアイテムの基本値）を引き継ぎます。

> 旧形式の `.voix` / `.json` はそのまま開けます。保存するとYAML形式になります。

---

## YMM4プロジェクトのインポート

ヘッダーの **Import YMM4** から `.ymmp` を選ぶか、ウィンドウへドラッグ＆ドロップすると、ゆっくりMovieMaker4のプロジェクトをVoixに読み込みます。読み込みは現在のプロジェクトを置き換えるため、必要なら先に保存してください。

| YMM4のアイテム | Voixでの扱い |
|---|---|
| VoiceItem | `voice`。CharacterNameからキャラクターを照合し、話速・音高・抑揚・句読点の間・前後無音・音量・`VoiceFadeIn` / `VoiceFadeOut` を引き継ぎます |
| TextItem | `text`。文字色・縁色・フォント・サイズ・位置・回転・不透明度に加え、行間（`LineHeight2`）・文字間隔（`LetterSpacing2`）・太字/斜体/下線/取り消し線・`WordWrap`・一文字ずつの表示/非表示（`DisplayInterval` / `HideInterval`）を変換します |
| AudioItem | `audio`。音量・再生速度・頭出し・ループを引き継ぎます |
| ImageItem | `image`。元画像の自然サイズとZoomから表示サイズを計算し、フレーム中心基準のX/Yを配置に変換します |
| VideoItem（最初の1件） | プロジェクトの背景動画 |
| TachieItem / ShapeItem / GroupItem など | 未対応として件数のみ表示し、スキップします |

- 相対パスの素材は `.ymmp` と同じディレクトリを基準に解決します。絶対パスはそのまま保存されます。
- YMM4側の画面サイズとFPS（30/60）をプロジェクト設定へ反映します。
- タイムラインの`Length`が不正な古いファイルでも、実際のアイテム終端から尺を再計算します。
- インポート直後に素材パスを検査し、見つからないファイルがあればトーストで件数を通知します。
- 現時点ではインポート専用です。`.ymmp` への書き出しや立ち絵パーツ合成は行いません。

### 素材の監査と再リンク

ヘッダー左側の **Assets**（警告ファイルのアイコン）を開くと、プロジェクトが参照している画像・音声・動画・キャラクター素材を一覧表示し、デスクトップアプリでは実ファイルの存在を確認します。

- **Missing** の行は **Locate** から代替ファイルを選ぶと、タイムラインアイテム、背景動画、キャラクターの立ち絵・表情の全参照をまとめて新しいパスへ書き換えます。
- 同じファイルを複数のアイテムが使っている場合も、1回の再リンクで全参照が更新されます。
- ブラウザ版ではファイル存在チェックは行わず、参照一覧のみ表示します。
- Voix同梱の `/characters/...` 素材は監査対象外です。

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
| `Alt + ←` / `→` | 選択アイテムを1フレームずらす |
| `Alt + Shift + ←` / `→` | 選択アイテムを1秒ずらす |
| `Delete` / `Backspace` | 選択アイテム削除 |
| `Shift + Delete` | リップル削除（後続アイテムを詰めて空白を閉じる） |
| `S` | 選択アイテムを再生ヘッド位置で分割 |
| `M` | 再生ヘッド位置にマーカーを追加 |
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

1. **アセット準備** — 立ち絵・画像を読み込み、音声（VOICEVOX / キャッシュ / 読み込み済みBGM）をWAVとして一時ディレクトリへ書き出し。指定範囲に重なる音声だけを切り出し、`offset` の頭出しと `speed` の `atempo` を反映します。
2. **オーバーレイ描画** — `overlayFps`（既定15fps）で透過PNGフレームをCanvasに描画。プレビューと同じ `drawOverlayFrame()` を使用します。
3. **FFmpeg合成** — Rustの `finish_export_job` が `videoOffset` / `videoSpeed` を反映して背景動画をシーク・ループさせ、`contain` / `cover` / `stretch` でフレームに合わせて透過PNGをオーバーレイ。音声は `adelay` / `atrim` / `atempo` / `afade` / `amix` でミックスし、BGMダッキングはセリフ区間に合わせた `volume` オートメーションとして適用します。
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
