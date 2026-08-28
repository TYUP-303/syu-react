/// <reference types="node" />
// src/constants/reactionType.test.ts
// 강조 구절 목록(STRESS_RESULT_TYPE_EMPHASIS)이 검수문 원문과 어긋나지 않는지
// 지킨다. 어긋나면 화면은 깨지지 않지만 강조가 조용히 사라지므로, 눈으로는
// 알아채기 어렵다 — 그래서 테스트가 필요하다.
//
// 원문(STRESS_RESULT_TYPE_DESCRIPTION)이 개정되어 이 테스트가 깨지면, 원문을
// 되돌리는 것이 아니라 강조 구절 쪽을 새 원문에 맞춰 고칠 것.
//
// 파일 아래쪽에는 성격이 다른 블록이 하나 더 있다 — REACTION_TYPE_META의 색
// 토큰 계약(2026-08-26). 같은 이유로 붙였다: 토큰이 사라지거나 밝아져도
// 화면은 깨지지 않고 대비만 조용히 무너진다.

import { describe, it, expect } from 'vitest';
import {
  REACTION_TYPE_KEYS,
  REACTION_TYPE_META,
  STRESS_RESULT_TYPE_DESCRIPTION,
  STRESS_RESULT_TYPE_EMPHASIS,
  STRESS_RESULT_TYPE_LABEL,
  type StressResultType,
} from './reactionType';
import { splitByPhrases } from '../utils/emphasizeText';
import { readFileSync } from 'node:fs';

// ⚠️ CSS는 `?raw`로 읽을 수 없다 — vitest는 CSS import를 기본값(css: false)으로
// 스텁 처리해서 `?raw`를 붙여도 빈 문자열이 온다(2026-08-26 실측). 그래서 파일을
// 직접 읽는다. tsconfig.app.json의 `types`가 ["vite/client"]라 node 타입이 전역
// 포함되지 않으므로, 이 파일에서만 참조를 켠다 — tsconfig를 건드리면 앱 코드
// 전체에 node 전역이 열린다.
const indexCss = readFileSync(new URL('../index.css', import.meta.url), 'utf-8');

const TYPES = Object.keys(STRESS_RESULT_TYPE_LABEL) as StressResultType[];

describe('STRESS_RESULT_TYPE_EMPHASIS', () => {
  it('8유형 전부에 강조 구절이 정의되어 있다', () => {
    for (const type of TYPES) {
      expect(STRESS_RESULT_TYPE_EMPHASIS[type], type).toBeDefined();
      expect(STRESS_RESULT_TYPE_EMPHASIS[type].length, type).toBeGreaterThanOrEqual(2);
    }
  });

  it('모든 강조 구절은 해당 유형의 원문에 그대로 존재한다', () => {
    for (const type of TYPES) {
      const description = STRESS_RESULT_TYPE_DESCRIPTION[type];
      for (const phrase of STRESS_RESULT_TYPE_EMPHASIS[type]) {
        expect(description.includes(phrase), `${type}: "${phrase}"`).toBe(true);
      }
    }
  });

  it('강조 구절끼리 겹치지 않아 하나도 버려지지 않는다', () => {
    for (const type of TYPES) {
      const phrases = STRESS_RESULT_TYPE_EMPHASIS[type];
      const emphasized = splitByPhrases(STRESS_RESULT_TYPE_DESCRIPTION[type], phrases).filter(
        (s) => s.emphasized,
      );
      expect(emphasized.length, type).toBe(phrases.length);
    }
  });

  it('원문 전체를 굵게 칠하지 않는다 (강조 비중 70% 미만)', () => {
    for (const type of TYPES) {
      const description = STRESS_RESULT_TYPE_DESCRIPTION[type];
      const emphasizedLength = splitByPhrases(description, STRESS_RESULT_TYPE_EMPHASIS[type])
        .filter((s) => s.emphasized)
        .reduce((sum, s) => sum + s.text.length, 0);

      expect(emphasizedLength / description.length, type).toBeLessThan(0.7);
    }
  });
});

// ── 축 A 색 계약 (2026-08-26, UAT 1-1 "검사 결과 색을 요정 색으로 통일") ──
//
// 이 블록이 지키는 것은 두 가지다.
//   1) REACTION_TYPE_META가 축 A 전용 토큰(type-*)만 쓴다 — 팔레트의 상태색
//      (error 등)을 다시 빌려 쓰면 "빨강 = 오류"와 충돌한다.
//   2) 그 토큰이 index.css에 실제로 있고, 밝은 표면 위에서 본문 AA(4.5:1)를
//      넘는다 — 토큰이 사라지면 Tailwind가 유틸리티를 만들지 않아 **화면에서만
//      조용히 실패**하고, 값만 밝히면 대비가 조용히 무너진다. 둘 다 눈으로는
//      알아채기 어려워서 여기서 원문을 직접 읽어 계산한다.

/** #rrggbb → WCAG 2.x 상대 휘도 */
function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** @theme 블록에서 `--<name>: #rrggbb;` 한 줄을 집어 온다. 없으면 null. */
function readHexToken(name: string): string | null {
  const match = new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(indexCss);
  return match ? match[1].toLowerCase() : null;
}

describe('REACTION_TYPE_META 색 토큰', () => {
  it('세 유형 모두 축 A 전용 토큰(type-*)을 쓴다', () => {
    const EXPECTED = {
      cognitive: 'type-cognitive',
      emotional: 'type-emotional',
      behavioral: 'type-behavioral',
    } as const;

    for (const key of REACTION_TYPE_KEYS) {
      const meta = REACTION_TYPE_META[key];
      expect(meta.text, key).toBe(`text-${EXPECTED[key]}`);
      expect(meta.bar, key).toBe(`bg-${EXPECTED[key]}`);
      expect(meta.bg, key).toBe(`bg-${EXPECTED[key]}/10`);
      expect(meta.border, key).toBe(`border-${EXPECTED[key]}/30`);
    }
  });

  it('상태색(error) 같은 의미 있는 슬롯을 빌려 쓰지 않는다', () => {
    // 2026-08-26 이전에는 정서가 text-error였다. 되돌아오면 결과 화면의
    // 정서 막대가 오류 표시와 같은 색이 된다.
    for (const key of REACTION_TYPE_KEYS) {
      const classes = Object.values(REACTION_TYPE_META[key]).join(' ');
      expect(classes, key).not.toMatch(/\berror\b/);
    }
  });

  it('세 토큰이 index.css @theme에 정의되어 있다', () => {
    expect(indexCss.length).toBeGreaterThan(0);
    for (const name of ['type-cognitive', 'type-emotional', 'type-behavioral']) {
      expect(readHexToken(`color-${name}`), name).not.toBeNull();
    }
  });

  it('밝은 표면 4종 위에서 본문 AA(4.5:1)를 넘는다', () => {
    // 캔버스(surface)·카드(lowest)·틴트 면(container)·트랙(high). 이 넷이
    // 축 A 라벨과 막대가 실제로 얹히는 배경이다.
    const backgrounds = [
      'color-surface',
      'color-surface-container-lowest',
      'color-surface-container',
      'color-surface-container-high',
    ].map((name) => {
      const hex = readHexToken(name);
      expect(hex, name).not.toBeNull();
      return [name, hex as string] as const;
    });

    for (const name of ['type-cognitive', 'type-emotional', 'type-behavioral']) {
      const fg = readHexToken(`color-${name}`) as string;
      for (const [bgName, bg] of backgrounds) {
        expect(contrastRatio(fg, bg), `${name} on ${bgName}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
