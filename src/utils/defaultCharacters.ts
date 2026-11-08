import { Character } from '../types';

function createSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

// 霊夢 (博麗霊夢) SVG立ち絵ジェネレーター
function makeReimuSvg(expression: 'idle' | 'speaking' | 'blinking' | 'smile' | 'shock' | 'trouble' | 'angry'): string {
  const isBlink = expression === 'blinking' || expression === 'smile';
  const isShock = expression === 'shock';
  const isAngry = expression === 'angry';
  const isTrouble = expression === 'trouble';
  const isSpeak = expression === 'speaking';
  const isSmile = expression === 'smile';

  // 目
  let leftEye = `
    <ellipse cx="145" cy="235" rx="18" ry="26" fill="#1e1b1e" />
    <ellipse cx="145" cy="242" rx="14" ry="18" fill="#991b1b" />
    <ellipse cx="145" cy="246" rx="10" ry="12" fill="#ef4444" />
    <circle cx="139" cy="226" r="7" fill="#ffffff" />
    <circle cx="151" cy="244" r="3.5" fill="#ffffff" />
  `;
  let rightEye = `
    <ellipse cx="255" cy="235" rx="18" ry="26" fill="#1e1b1e" />
    <ellipse cx="255" cy="242" rx="14" ry="18" fill="#991b1b" />
    <ellipse cx="255" cy="246" rx="10" ry="12" fill="#ef4444" />
    <circle cx="249" cy="226" r="7" fill="#ffffff" />
    <circle cx="261" cy="244" r="3.5" fill="#ffffff" />
  `;

  if (isBlink) {
    leftEye = `<path d="M 125 240 Q 145 224 165 240" stroke="#2b2123" stroke-width="5" stroke-linecap="round" fill="none" />`;
    rightEye = `<path d="M 235 240 Q 255 224 275 240" stroke="#2b2123" stroke-width="5" stroke-linecap="round" fill="none" />`;
  } else if (isShock) {
    leftEye = `
      <circle cx="145" cy="235" r="14" fill="#1e1b1e" />
      <circle cx="145" cy="235" r="7" fill="#ef4444" />
      <circle cx="142" cy="232" r="3" fill="#ffffff" />
    `;
    rightEye = `
      <circle cx="255" cy="235" r="14" fill="#1e1b1e" />
      <circle cx="255" cy="235" r="7" fill="#ef4444" />
      <circle cx="252" cy="232" r="3" fill="#ffffff" />
    `;
  }

  // 眉
  let eyebrows = `
    <path d="M 125 198 Q 145 194 165 200" stroke="#362a2d" stroke-width="4.5" stroke-linecap="round" fill="none" />
    <path d="M 235 200 Q 255 194 275 198" stroke="#362a2d" stroke-width="4.5" stroke-linecap="round" fill="none" />
  `;
  if (isAngry) {
    eyebrows = `
      <path d="M 128 206 Q 148 200 168 190" stroke="#362a2d" stroke-width="5" stroke-linecap="round" fill="none" />
      <path d="M 232 190 Q 252 200 272 206" stroke="#362a2d" stroke-width="5" stroke-linecap="round" fill="none" />
    `;
  } else if (isTrouble) {
    eyebrows = `
      <path d="M 126 192 Q 146 200 166 204" stroke="#362a2d" stroke-width="4.5" stroke-linecap="round" fill="none" />
      <path d="M 234 204 Q 254 200 274 192" stroke="#362a2d" stroke-width="4.5" stroke-linecap="round" fill="none" />
    `;
  }

  // 口
  let mouth = `<path d="M 188 285 Q 200 293 212 285" stroke="#7f1d1d" stroke-width="4" stroke-linecap="round" fill="none" />`;
  if (isSpeak) {
    mouth = `
      <path d="M 184 278 Q 200 310 216 278 Z" fill="#991b1b" stroke="#7f1d1d" stroke-width="3" />
      <path d="M 190 280 Q 200 286 210 280" stroke="#ffffff" stroke-width="3" fill="none" />
      <ellipse cx="200" cy="298" rx="7" ry="5" fill="#f87171" />
    `;
  } else if (isSmile) {
    mouth = `<path d="M 182 280 Q 200 306 218 280 Z" fill="#991b1b" stroke="#7f1d1d" stroke-width="3" />`;
  } else if (isShock) {
    mouth = `<ellipse cx="200" cy="292" rx="14" ry="18" fill="#1e1b1e" stroke="#7f1d1d" stroke-width="3" />`;
  } else if (isAngry) {
    mouth = `<path d="M 185 292 Q 200 280 215 292" stroke="#7f1d1d" stroke-width="4.5" stroke-linecap="round" fill="none" />`;
  } else if (isTrouble) {
    mouth = `<path d="M 186 288 Q 194 294 202 288 Q 210 282 216 288" stroke="#7f1d1d" stroke-width="4" stroke-linecap="round" fill="none" />`;
  }

  // 汗マーク
  const sweat =
    isShock || isTrouble
      ? `<path d="M 105 190 Q 115 205 105 220 Q 95 205 105 190 Z" fill="#38bdf8" opacity="0.85" />`
      : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 480" width="400" height="480">
    <defs>
      <linearGradient id="reimuRibbon" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ef4444" />
        <stop offset="100%" stop-color="#b91c1c" />
      </linearGradient>
      <linearGradient id="reimuHair" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#382d31" />
        <stop offset="100%" stop-color="#1f181b" />
      </linearGradient>
      <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff1e6" />
        <stop offset="100%" stop-color="#fde2d0" />
      </linearGradient>
    </defs>

    <!-- 後ろリボン -->
    <path d="M 80 50 Q 170 85 200 120 Q 230 85 320 50 C 370 120 330 180 270 160 Q 200 170 130 160 C 70 180 30 120 80 50 Z" fill="url(#reimuRibbon)" stroke="#7f1d1d" stroke-width="4" />
    <path d="M 85 58 Q 160 90 190 120 Q 140 145 95 75 Z" fill="#ffffff" opacity="0.25" />
    <path d="M 315 58 Q 240 90 210 120 Q 260 145 305 75 Z" fill="#ffffff" opacity="0.25" />

    <!-- 後ろ髪 -->
    <path d="M 90 160 C 60 280 80 400 150 430 C 200 440 250 440 300 430 C 340 390 340 280 310 160 Z" fill="url(#reimuHair)" />

    <!-- 体 (巫女服) -->
    <path d="M 120 400 L 90 480 L 310 480 L 280 400 Z" fill="#dc2626" />
    <path d="M 160 400 L 200 450 L 240 400 Z" fill="#ffffff" />
    <path d="M 185 410 L 200 460 L 215 410 Z" fill="#facc15" />

    <!-- 顔の輪郭 -->
    <path d="M 95 210 C 90 320 140 370 200 370 C 260 370 310 320 305 210 C 300 130 100 130 95 210 Z" fill="url(#skin)" />

    <!-- ほっぺ -->
    <ellipse cx="125" cy="275" rx="16" ry="9" fill="#fb7185" opacity="0.55" />
    <ellipse cx="275" cy="275" rx="16" ry="9" fill="#fb7185" opacity="0.55" />

    <!-- 眉・目・口 -->
    ${eyebrows}
    ${leftEye}
    ${rightEye}
    ${mouth}
    ${sweat}

    <!-- 前髪 -->
    <path d="M 95 180 C 130 140 180 140 200 170 C 220 140 270 140 305 180 C 295 215 275 225 260 200 C 240 240 220 230 200 195 C 180 230 160 240 140 200 C 125 225 105 215 95 180 Z" fill="url(#reimuHair)" />

    <!-- 横髪・髪飾り (お札リボン) -->
    <rect x="75" y="240" width="22" height="65" rx="4" fill="#ffffff" stroke="#e5e7eb" stroke-width="2" />
    <rect x="79" y="248" width="14" height="40" fill="#dc2626" opacity="0.8" />
    <rect x="303" y="240" width="22" height="65" rx="4" fill="#ffffff" stroke="#e5e7eb" stroke-width="2" />
    <rect x="307" y="248" width="14" height="40" fill="#dc2626" opacity="0.8" />

    <!-- リボン中央結び目 -->
    <circle cx="200" cy="115" r="16" fill="#991b1b" stroke="#7f1d1d" stroke-width="3" />
  </svg>`;
}

// 魔理沙 (霧雨魔理沙) SVG立ち絵ジェネレーター
function makeMarisaSvg(expression: 'idle' | 'speaking' | 'blinking' | 'smile' | 'shock' | 'trouble' | 'angry'): string {
  const isBlink = expression === 'blinking' || expression === 'smile';
  const isShock = expression === 'shock';
  const isAngry = expression === 'angry';
  const isTrouble = expression === 'trouble';
  const isSpeak = expression === 'speaking';
  const isSmile = expression === 'smile';

  // 目 (琥珀色 / 金色)
  let leftEye = `
    <ellipse cx="145" cy="245" rx="18" ry="26" fill="#1e1b1e" />
    <ellipse cx="145" cy="252" rx="14" ry="18" fill="#d97706" />
    <ellipse cx="145" cy="256" rx="10" ry="12" fill="#fbbf24" />
    <circle cx="139" cy="236" r="7" fill="#ffffff" />
    <circle cx="151" cy="254" r="3.5" fill="#ffffff" />
  `;
  let rightEye = `
    <ellipse cx="255" cy="245" rx="18" ry="26" fill="#1e1b1e" />
    <ellipse cx="255" cy="252" rx="14" ry="18" fill="#d97706" />
    <ellipse cx="255" cy="256" rx="10" ry="12" fill="#fbbf24" />
    <circle cx="249" cy="236" r="7" fill="#ffffff" />
    <circle cx="261" cy="254" r="3.5" fill="#ffffff" />
  `;

  if (isBlink) {
    leftEye = `<path d="M 125 250 Q 145 234 165 250" stroke="#78350f" stroke-width="5" stroke-linecap="round" fill="none" />`;
    rightEye = `<path d="M 235 250 Q 255 234 275 250" stroke="#78350f" stroke-width="5" stroke-linecap="round" fill="none" />`;
  } else if (isShock) {
    leftEye = `
      <circle cx="145" cy="245" r="14" fill="#1e1b1e" />
      <circle cx="145" cy="245" r="7" fill="#f59e0b" />
      <circle cx="142" cy="242" r="3" fill="#ffffff" />
    `;
    rightEye = `
      <circle cx="255" cy="245" r="14" fill="#1e1b1e" />
      <circle cx="255" cy="245" r="7" fill="#f59e0b" />
      <circle cx="252" cy="242" r="3" fill="#ffffff" />
    `;
  }

  // 眉
  let eyebrows = `
    <path d="M 125 208 Q 145 202 165 208" stroke="#92400e" stroke-width="4.5" stroke-linecap="round" fill="none" />
    <path d="M 235 208 Q 255 202 275 208" stroke="#92400e" stroke-width="4.5" stroke-linecap="round" fill="none" />
  `;
  if (isAngry) {
    eyebrows = `
      <path d="M 128 216 Q 148 210 168 198" stroke="#92400e" stroke-width="5" stroke-linecap="round" fill="none" />
      <path d="M 232 198 Q 252 210 272 216" stroke="#92400e" stroke-width="5" stroke-linecap="round" fill="none" />
    `;
  } else if (isTrouble) {
    eyebrows = `
      <path d="M 126 200 Q 146 208 166 212" stroke="#92400e" stroke-width="4.5" stroke-linecap="round" fill="none" />
      <path d="M 234 212 Q 254 208 274 200" stroke="#92400e" stroke-width="4.5" stroke-linecap="round" fill="none" />
    `;
  }

  // 口 (魔理沙特有のにやり八重歯スマイル)
  let mouth = `
    <path d="M 186 295 Q 202 305 218 293" stroke="#854d0e" stroke-width="4" stroke-linecap="round" fill="none" />
    <path d="M 210 294 L 214 301 L 217 294 Z" fill="#ffffff" stroke="#854d0e" stroke-width="1.5" />
  `;
  if (isSpeak) {
    mouth = `
      <path d="M 184 288 Q 200 320 216 288 Z" fill="#b45309" stroke="#78350f" stroke-width="3" />
      <path d="M 190 290 Q 200 296 210 290" stroke="#ffffff" stroke-width="3" fill="none" />
      <ellipse cx="200" cy="308" rx="7" ry="5" fill="#fcd34d" />
    `;
  } else if (isSmile) {
    mouth = `
      <path d="M 182 290 Q 200 318 218 290 Z" fill="#b45309" stroke="#78350f" stroke-width="3" />
      <path d="M 208 290 L 212 298 L 216 290 Z" fill="#ffffff" />
    `;
  } else if (isShock) {
    mouth = `<ellipse cx="200" cy="302" rx="14" ry="18" fill="#1e1b1e" stroke="#78350f" stroke-width="3" />`;
  } else if (isAngry) {
    mouth = `<path d="M 185 302 Q 200 290 215 302" stroke="#78350f" stroke-width="4.5" stroke-linecap="round" fill="none" />`;
  } else if (isTrouble) {
    mouth = `<path d="M 186 298 Q 194 304 202 298 Q 210 292 216 298" stroke="#78350f" stroke-width="4" stroke-linecap="round" fill="none" />`;
  }

  const sweat =
    isShock || isTrouble
      ? `<path d="M 105 200 Q 115 215 105 230 Q 95 215 105 200 Z" fill="#38bdf8" opacity="0.85" />`
      : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 480" width="400" height="480">
    <defs>
      <linearGradient id="marisaHat" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2d3139" />
        <stop offset="100%" stop-color="#111317" />
      </linearGradient>
      <linearGradient id="marisaHair" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fef08a" />
        <stop offset="100%" stop-color="#eab308" />
      </linearGradient>
      <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff1e6" />
        <stop offset="100%" stop-color="#fde2d0" />
      </linearGradient>
    </defs>

    <!-- 後ろ髪 -->
    <path d="M 90 200 C 60 300 70 420 140 440 C 200 450 250 450 310 440 C 350 410 350 300 310 200 Z" fill="url(#marisaHair)" />

    <!-- 体 (黒ベスト & 白シャツ) -->
    <path d="M 120 410 L 90 480 L 310 480 L 280 410 Z" fill="#18181b" />
    <path d="M 160 410 L 200 460 L 240 410 Z" fill="#ffffff" />
    <path d="M 180 425 Q 200 440 220 425 Q 200 415 180 425 Z" fill="#facc15" />

    <!-- 顔の輪郭 -->
    <path d="M 95 220 C 90 330 140 380 200 380 C 260 380 310 330 305 220 C 300 140 100 140 95 220 Z" fill="url(#skin)" />

    <!-- ほっぺ -->
    <ellipse cx="125" cy="285" rx="16" ry="9" fill="#f59e0b" opacity="0.45" />
    <ellipse cx="275" cy="285" rx="16" ry="9" fill="#f59e0b" opacity="0.45" />

    <!-- 眉・目・口 -->
    ${eyebrows}
    ${leftEye}
    ${rightEye}
    ${mouth}
    ${sweat}

    <!-- 前髪 -->
    <path d="M 95 190 C 130 150 180 150 200 180 C 220 150 270 150 305 190 C 295 225 275 235 260 210 C 240 250 220 240 200 205 C 180 240 160 250 140 210 C 125 235 105 225 95 190 Z" fill="url(#marisaHair)" />

    <!-- 横髪おさげ三つ編み (左側) -->
    <path d="M 85 240 Q 60 300 75 350 Q 85 365 95 355 Q 100 300 95 240 Z" fill="url(#marisaHair)" stroke="#ca8a04" stroke-width="2" />
    <circle cx="85" cy="355" r="7" fill="#ffffff" stroke="#94a3b8" stroke-width="1.5" />

    <!-- 魔女帽子 (つば & クラウン) -->
    <ellipse cx="200" cy="155" rx="190" ry="45" fill="url(#marisaHat)" stroke="#090a0c" stroke-width="4" />
    <!-- 帽子リボン -->
    <path d="M 100 140 Q 200 165 300 140 L 290 120 Q 200 145 110 120 Z" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2" />
    <!-- 帽子の山 -->
    <path d="M 115 125 C 130 30 170 10 230 10 C 280 10 270 50 285 125 Z" fill="url(#marisaHat)" stroke="#090a0c" stroke-width="4" />
    <!-- 白いフリル飾り -->
    <circle cx="150" cy="140" r="18" fill="#ffffff" stroke="#cbd5e1" stroke-width="2" />
    <circle cx="150" cy="140" r="8" fill="#f1f5f9" />
  </svg>`;
}

export const reimuAvatars = {
  idle: createSvgDataUrl(makeReimuSvg('idle')),
  speaking: createSvgDataUrl(makeReimuSvg('speaking')),
  blinking: createSvgDataUrl(makeReimuSvg('blinking')),
  expressions: {
    smile: createSvgDataUrl(makeReimuSvg('smile')),
    shock: createSvgDataUrl(makeReimuSvg('shock')),
    trouble: createSvgDataUrl(makeReimuSvg('trouble')),
    angry: createSvgDataUrl(makeReimuSvg('angry')),
  },
};

export const marisaAvatars = {
  idle: createSvgDataUrl(makeMarisaSvg('idle')),
  speaking: createSvgDataUrl(makeMarisaSvg('speaking')),
  blinking: createSvgDataUrl(makeMarisaSvg('blinking')),
  expressions: {
    smile: createSvgDataUrl(makeMarisaSvg('smile')),
    shock: createSvgDataUrl(makeMarisaSvg('shock')),
    trouble: createSvgDataUrl(makeMarisaSvg('trouble')),
    angry: createSvgDataUrl(makeMarisaSvg('angry')),
  },
};

export const TECH_GIRL_CHARACTER: Character = {
  id: 'tech_girl',
  name: 'Tech Girl',
  ttsProviderId: 'voicevox',
  speakerId: 2, // Shikoku Metan
  styleId: 2,
  avatar: {
    idle: '/characters/tech_girl/idle.png?v=smooth',
    speaking: '/characters/tech_girl/explain_right.png?v=smooth',
    expressions: {
      idle: '/characters/tech_girl/idle.png?v=smooth',
      explain_left: '/characters/tech_girl/explain_left.png?v=smooth',
      point_up: '/characters/tech_girl/point_up.png?v=smooth',
      explain_right: '/characters/tech_girl/explain_right.png?v=smooth',
      curious: '/characters/tech_girl/curious.png?v=smooth',
      surprised: '/characters/tech_girl/surprised.png?v=smooth',
      thoughtful: '/characters/tech_girl/thoughtful.png?v=smooth',
      cross_arms: '/characters/tech_girl/cross_arms.png?v=smooth',
      sweat: '/characters/tech_girl/sweat.png?v=smooth',
      shrug: '/characters/tech_girl/shrug.png?v=smooth',
      peace: '/characters/tech_girl/peace.png?v=smooth',
      welcome: '/characters/tech_girl/welcome.png?v=smooth',
      sleep: '/characters/tech_girl/sleep.png?v=smooth',
      trouble: '/characters/tech_girl/trouble.png?v=smooth',
      smug: '/characters/tech_girl/smug.png?v=smooth',
      blush: '/characters/tech_girl/blush.png?v=smooth',
      pout: '/characters/tech_girl/pout.png?v=smooth',
      pray: '/characters/tech_girl/pray.png?v=smooth',
      panic: '/characters/tech_girl/panic.png?v=smooth',
      success: '/characters/tech_girl/success.png?v=smooth',
    },
  },
  subtitleStyle: {
    textColor: '#ffffff',
    fontSize: 42,
    fontFamily: "'Google Sans', 'Noto Sans JP', sans-serif",
    fontWeight: '900',
    strokeColor: '#090a0c',
    strokeWidth: 8,
    outerStrokeColor: '#a855f7', // Lilac purple
    outerStrokeWidth: 14,
    hasShadow: true,
    shadowColor: 'rgba(0, 0, 0, 0.85)',
    shadowBlur: 8,
    shadowOffsetY: 4,
    bgStyle: 'none',
    yOffsetPercent: 12,
  },
  position: 'right',
  scale: 0.9,
  flipH: false,
};

export const DEV_GIRL_CHARACTER: Character = {
  id: 'dev_girl',
  name: 'Maker Girl',
  ttsProviderId: 'coeiroink',
  speakerId: 0, // Tsukuyomi-chan (COEIROINK style 0)
  styleId: 0,
  avatar: {
    idle: '/characters/dev_girl/wave.png?v=smooth',
    speaking: '/characters/dev_girl/point_up.png?v=smooth',
    expressions: {
      idle: '/characters/dev_girl/wave.png?v=smooth',
      wave: '/characters/dev_girl/wave.png?v=smooth',
      surprised: '/characters/dev_girl/surprised.png?v=smooth',
      point_up: '/characters/dev_girl/point_up.png?v=smooth',
      laptop: '/characters/dev_girl/laptop.png?v=smooth',
      laptop_typing: '/characters/dev_girl/laptop_typing.png?v=smooth',
      pcb: '/characters/dev_girl/pcb.png?v=smooth',
      soldering: '/characters/dev_girl/soldering.png?v=smooth',
      robot: '/characters/dev_girl/robot.png?v=smooth',
      robot_arm: '/characters/dev_girl/robot_arm.png?v=smooth',
      tablet: '/characters/dev_girl/tablet.png?v=smooth',
      pointing: '/characters/dev_girl/pointing.png?v=smooth',
      thinking: '/characters/dev_girl/thinking.png?v=smooth',
      sleeping: '/characters/dev_girl/sleeping.png?v=smooth',
      stressed: '/characters/dev_girl/stressed.png?v=smooth',
      shrug: '/characters/dev_girl/shrug.png?v=smooth',
      nod: '/characters/dev_girl/nod.png?v=smooth',
      thumbs_up: '/characters/dev_girl/thumbs_up.png?v=smooth',
      schematic: '/characters/dev_girl/schematic.png?v=smooth',
      wave_smile: '/characters/dev_girl/wave_smile.png?v=smooth',
      success: '/characters/dev_girl/success.png?v=smooth',
    },
  },
  subtitleStyle: {
    textColor: '#ffffff',
    fontSize: 42,
    fontFamily: "'Google Sans', 'Noto Sans JP', sans-serif",
    fontWeight: '900',
    strokeColor: '#090a0c',
    strokeWidth: 8,
    outerStrokeColor: '#38bdf8', // Cyan / tech blue
    outerStrokeWidth: 14,
    hasShadow: true,
    shadowColor: 'rgba(0, 0, 0, 0.85)',
    shadowBlur: 8,
    shadowOffsetY: 4,
    bgStyle: 'none',
    yOffsetPercent: 12,
  },
  position: 'left',
  scale: 0.9,
  flipH: false,
};

export const defaultCharacters: Character[] = [
  DEV_GIRL_CHARACTER,
  TECH_GIRL_CHARACTER,
  {
    id: 'zundamon',
    name: 'ずんだもん',
    ttsProviderId: 'voicevox',
    speakerId: 3,
    styleId: 3,
    avatar: {
      idle: '/characters/zundamon.png?v=3',
      speaking: '/characters/zundamon_talking.png?v=3',
      blinking: '/characters/zundamon_blinking.png?v=3',
      expressions: {
        smile: '/characters/zundamon_smile.png?v=3',
        shock: '/characters/zundamon_shock.png?v=3',
        trouble: '/characters/zundamon_trouble.png?v=3',
        angry: '/characters/zundamon_angry.png?v=3',
      },
    },
    subtitleStyle: {
      textColor: '#ffffff',
      fontSize: 42,
      fontFamily: "'Google Sans', 'Noto Sans JP', sans-serif",
      fontWeight: '900',
      strokeColor: '#090a0c',
      strokeWidth: 8,
      outerStrokeColor: '#16a34a',
      outerStrokeWidth: 14,
      hasShadow: true,
      shadowColor: 'rgba(0, 0, 0, 0.85)',
      shadowBlur: 8,
      shadowOffsetY: 4,
      bgStyle: 'none',
      yOffsetPercent: 12,
    },
    position: 'left',
  },
  {
    id: 'metan',
    name: '四国めたん',
    ttsProviderId: 'voicevox',
    speakerId: 2,
    styleId: 2,
    avatar: {
      idle: '/characters/metan.png?v=3',
      speaking: '/characters/metan_talking.png?v=3',
      blinking: '/characters/metan_blinking.png?v=3',
      expressions: {
        smile: '/characters/metan_smile.png?v=3',
        shock: '/characters/metan_shock.png?v=3',
        trouble: '/characters/metan_trouble.png?v=3',
        angry: '/characters/metan_angry.png?v=3',
      },
    },
    subtitleStyle: {
      textColor: '#ffffff',
      fontSize: 42,
      fontFamily: "'Google Sans', 'Noto Sans JP', sans-serif",
      fontWeight: '900',
      strokeColor: '#090a0c',
      strokeWidth: 8,
      outerStrokeColor: '#ec4899',
      outerStrokeWidth: 14,
      hasShadow: true,
      shadowColor: 'rgba(0, 0, 0, 0.85)',
      shadowBlur: 8,
      shadowOffsetY: 4,
      bgStyle: 'none',
      yOffsetPercent: 12,
    },
    position: 'right',
  },
  {
    id: 'reimu',
    name: '博麗霊夢',
    ttsProviderId: 'voicevox',
    speakerId: 2,
    styleId: 2,
    avatar: reimuAvatars,
    subtitleStyle: {
      textColor: '#ffffff',
      fontSize: 44,
      fontFamily: "'Google Sans', 'Noto Sans JP', sans-serif",
      fontWeight: '900',
      strokeColor: '#090a0c',
      strokeWidth: 8,
      outerStrokeColor: '#dc2626', // 王道霊夢レッド
      outerStrokeWidth: 14,
      hasShadow: true,
      shadowColor: 'rgba(0, 0, 0, 0.9)',
      shadowBlur: 10,
      shadowOffsetY: 5,
      bgStyle: 'none',
      yOffsetPercent: 12,
    },
    position: 'left',
  },
  {
    id: 'marisa',
    name: '霧雨魔理沙',
    ttsProviderId: 'voicevox',
    speakerId: 8,
    styleId: 8,
    avatar: marisaAvatars,
    subtitleStyle: {
      textColor: '#ffffff',
      fontSize: 44,
      fontFamily: "'Google Sans', 'Noto Sans JP', sans-serif",
      fontWeight: '900',
      strokeColor: '#090a0c',
      strokeWidth: 8,
      outerStrokeColor: '#eab308', // 王道魔理沙イエロー
      outerStrokeWidth: 14,
      hasShadow: true,
      shadowColor: 'rgba(0, 0, 0, 0.9)',
      shadowBlur: 10,
      shadowOffsetY: 5,
      bgStyle: 'none',
      yOffsetPercent: 12,
    },
    position: 'right',
  },
];
