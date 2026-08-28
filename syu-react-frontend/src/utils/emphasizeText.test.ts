// src/utils/emphasizeText.test.ts
// 이 유틸의 존재 이유는 "검수된 원문을 고치지 않고 강조만 얹는 것"이다.
// 따라서 지켜야 할 불변식은 하나다: **이어붙이면 언제나 원문 그대로.**
// 구절이 틀렸거나 서로 겹쳐도 문장을 잘라먹거나 던지면 안 된다.

import { describe, it, expect } from 'vitest';
import { splitByPhrases } from './emphasizeText';

const TEXT = '스트레스를 받으면 먼저 상황을 정리하고, 원인을 파악하려는 경향이 있습니다.';

describe('splitByPhrases', () => {
  it('구간을 이어붙이면 언제나 원문과 정확히 같다', () => {
    const cases: string[][] = [
      ['원인을 파악하려는 경향'],
      ['먼저 상황을 정리하고', '원인을 파악하려는 경향'],
      ['원문에 없는 구절'],
      [],
      [''],
    ];

    for (const phrases of cases) {
      const joined = splitByPhrases(TEXT, phrases)
        .map((s) => s.text)
        .join('');
      expect(joined, JSON.stringify(phrases)).toBe(TEXT);
    }
  });

  it('일치하는 구절만 강조 구간으로 표시한다', () => {
    const segments = splitByPhrases(TEXT, ['원인을 파악하려는 경향']);

    expect(segments.filter((s) => s.emphasized).map((s) => s.text)).toEqual([
      '원인을 파악하려는 경향',
    ]);
  });

  it('원문에 없는 구절은 조용히 무시한다 (평문으로 남는다)', () => {
    const segments = splitByPhrases(TEXT, ['존재하지 않는 문구']);

    expect(segments.every((s) => !s.emphasized)).toBe(true);
    expect(segments.map((s) => s.text).join('')).toBe(TEXT);
  });

  it('구절이 서로 겹치면 뒤의 것을 버린다 (구간이 잘리지 않게)', () => {
    const segments = splitByPhrases(TEXT, ['원인을 파악하려는 경향', '파악하려는']);

    expect(segments.filter((s) => s.emphasized).map((s) => s.text)).toEqual([
      '원인을 파악하려는 경향',
    ]);
    expect(segments.map((s) => s.text).join('')).toBe(TEXT);
  });

  it('구절 순서가 뒤섞여 있어도 원문 순서대로 이어붙인다', () => {
    const segments = splitByPhrases(TEXT, ['원인을 파악하려는 경향', '먼저 상황을 정리하고']);

    expect(segments.map((s) => s.text).join('')).toBe(TEXT);
    expect(segments.filter((s) => s.emphasized).map((s) => s.text)).toEqual([
      '먼저 상황을 정리하고',
      '원인을 파악하려는 경향',
    ]);
  });

  it('같은 구절이 두 번 나오면 첫 번째 등장만 강조한다', () => {
    const repeated = '경향이 있습니다. 다시 경향이 있습니다.';
    const segments = splitByPhrases(repeated, ['경향이 있습니다']);

    expect(segments.filter((s) => s.emphasized)).toHaveLength(1);
    expect(segments.map((s) => s.text).join('')).toBe(repeated);
  });
});
