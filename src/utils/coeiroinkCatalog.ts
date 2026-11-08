import { Speaker } from '../types';

export interface CoeiroinkCharacterMeta {
  uuid: string;
  name: string;
  styles: { id: number; name: string }[];
  color: string;
  description: string;
}

/**
 * Standard COEIROINK character catalog.
 * Provides immediate offline fallback & preview support when COEIROINK engine
 * on port 50032 is not yet started.
 */
export const COEIROINK_CATALOG: CoeiroinkCharacterMeta[] = [
  {
    uuid: '3c37646f-3881-5374-2a83-149267990abc',
    name: 'つくよみちゃん',
    color: '#e06a8b',
    description: 'COEIROINKの看板キャラクター。清楚で穏やかな語り口が特徴。',
    styles: [
      { id: 0, name: 'れいせい' },
      { id: 1, name: 'おしとやか' },
      { id: 2, name: 'うれしい' },
      { id: 3, name: 'かなしい' },
    ],
  },
  {
    uuid: '6dd87654-20a8-4c8d-8a58-37a3b3fa6939',
    name: 'おふとんP',
    color: '#6395b8',
    description: '落ち着いたトーンの男性ボイス。解説やナレーションに最適。',
    styles: [
      { id: 100, name: 'ノーマル' },
      { id: 101, name: 'ささやき' },
    ],
  },
  {
    uuid: 'a7d8c032-6a68-4a67-a8b2-4d5e23901bce',
    name: '黒岩妖平',
    color: '#4f5d75',
    description: '低音でクールな男性ボイス。渋い解説やツッコミに活躍。',
    styles: [
      { id: 200, name: 'ノーマル' },
      { id: 201, name: '気合' },
    ],
  },
  {
    uuid: 'c891e456-11f8-4d56-b812-789a01cdef23',
    name: 'でじこんちゃん',
    color: '#34d399',
    description: '明るく元気な少女ボイス。テンポの良い実況やコントに最適。',
    styles: [
      { id: 300, name: 'ノーマル' },
      { id: 301, name: 'ハイテンション' },
    ],
  },
  {
    uuid: 'e102f567-22a9-5e67-c923-890b12def034',
    name: 'アルマ',
    color: '#a78bfa',
    description: '知性的で澄んだトーン。テクノロジー解説や朗読に向いている。',
    styles: [
      { id: 400, name: 'ノーマル' },
      { id: 401, name: 'クール' },
    ],
  },
];

export const COEIROINK_CATALOG_SPEAKERS: Speaker[] = COEIROINK_CATALOG.map((c) => ({
  id: c.uuid,
  name: c.name,
  styles: c.styles.map((s) => ({
    id: s.id,
    name: s.name,
    type: 'talk',
  })),
}));
