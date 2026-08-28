// src/constants/strategy.test.ts
// 전략 · 요정 · 색상의 확정 대응을 고정하는 회귀 테스트.
//
// 2026-08-06 이전에는 재평가와 재초점이 서로 반대 요정에 붙어 있었다
// (재평가↔초록이, 재초점↔노랑이). 이 대응은 프로젝트 소개자료의 요정 표와
// 랜딩 시안에서 온 것이라 코드만 보고는 틀렸는지 알 수 없다. 그래서 확정값을
// 테스트로 박아 둔다 — 어긋나면 그건 기획 변경이지 리팩터링이 아니다.

import { describe, expect, it } from 'vitest';
import { STRATEGY_KEYS, STRATEGY_META, getDominantStrategy, type StrategyKey } from './strategy';
import { defaultAngels } from '../store/useScenarioStore';

describe('STRATEGY_META', () => {
  it('수용은 아코 · 파랑이 · primary다', () => {
    expect(STRATEGY_META.accept.fairyName).toBe('아코');
    expect(STRATEGY_META.accept.image).toContain('파랑이');
    expect(STRATEGY_META.accept.text).toBe('text-primary');
  });

  it('재평가는 포코 · 노랑이 · tertiary다', () => {
    expect(STRATEGY_META.reappraisal.fairyName).toBe('포코');
    expect(STRATEGY_META.reappraisal.image).toContain('노랑이');
    expect(STRATEGY_META.reappraisal.text).toBe('text-tertiary');
  });

  it('재초점은 리프 · 초록이 · success다', () => {
    expect(STRATEGY_META.refocus.fairyName).toBe('리프');
    expect(STRATEGY_META.refocus.image).toContain('초록이');
    expect(STRATEGY_META.refocus.text).toBe('text-success');
  });

  it('세 전략이 서로 다른 요정 이미지를 쓴다', () => {
    const images = STRATEGY_KEYS.map((key) => STRATEGY_META[key].image);
    expect(new Set(images).size).toBe(STRATEGY_KEYS.length);
  });

  it('한 전략의 색 토큰은 같은 색 계열로 통일된다', () => {
    STRATEGY_KEYS.forEach((key) => {
      const meta = STRATEGY_META[key];
      const palette = meta.text.replace('text-', '');

      expect(meta.bar).toBe(`bg-${palette}`);
      expect(meta.bg).toBe(`bg-${palette}/10`);
      expect(meta.border).toBe(`border-${palette}/30`);
    });
  });
});

describe('useScenarioStore의 defaultAngels와의 정합성', () => {
  // 요정 호칭은 플레이어(defaultAngels)에, 이미지는 strategy.ts에 따로 있다.
  // 한쪽만 고치면 플레이어가 노란 요정을 띄워 놓고 "리프"라 부르게 된다
  // (2026-08-06 회귀).
  //
  // 2026-08-06 호칭이 색 이름(파랑이/노랑이/초록이)에서 확정 캐릭터 이름
  // (아코/포코/리프)으로 앱 전역 통일되면서, 이름 문자열이 더는 이미지
  // 파일명에 들어 있지 않다. 그래서 "이름이 파일명에 포함되는가" 대신
  // 확정 짝을 양쪽 모두 명시적으로 박아 둔다 — 어느 한쪽이 움직이면
  // 여전히 여기서 걸린다.
  const CONFIRMED: Record<StrategyKey, { fairyName: string; imageFile: string }> = {
    accept: { fairyName: '아코', imageFile: '파랑이' },
    reappraisal: { fairyName: '포코', imageFile: '노랑이' },
    refocus: { fairyName: '리프', imageFile: '초록이' },
  };

  it('플레이어에 노출되는 요정 이름이 확정 캐릭터 이름이다', () => {
    STRATEGY_KEYS.forEach((key) => {
      expect(defaultAngels[key].name).toBe(CONFIRMED[key].fairyName);
    });
  });

  it('플레이어 호칭과 STRATEGY_META의 fairyName이 같은 값을 가리킨다', () => {
    STRATEGY_KEYS.forEach((key) => {
      expect(defaultAngels[key].name).toBe(STRATEGY_META[key].fairyName);
    });
  });

  it('확정 이름이 짝지어진 요정 이미지 파일과 맞물린다', () => {
    STRATEGY_KEYS.forEach((key) => {
      expect(STRATEGY_META[key].fairyName).toBe(CONFIRMED[key].fairyName);
      expect(STRATEGY_META[key].image).toContain(CONFIRMED[key].imageFile);
    });
  });

  // 한 줄 요약(AngelStrategy.strategy)의 기본값은 shortLabel을 참조한다.
  // AngelDetailPanel이 "이 값이 기본값인가"를 shortLabel과 비교해 판단하고
  // (기본값이면 "수용 요정 / 아코의 전략 / 수용"으로 같은 말이 세 번 겹치므로
  // 그 줄을 숨긴다), 두 출처가 어긋나면 원고 없는 회차에 중복된 줄이 조용히
  // 되살아난다.
  it('기본 한 줄 요약이 전략 축약 라벨과 같은 문자열을 가리킨다', () => {
    const CONFIRMED_SHORT_LABEL: Record<StrategyKey, string> = {
      accept: '수용',
      reappraisal: '재평가',
      refocus: '재초점',
    };

    STRATEGY_KEYS.forEach((key) => {
      expect(STRATEGY_META[key].shortLabel).toBe(CONFIRMED_SHORT_LABEL[key]);
      expect(defaultAngels[key].strategy).toBe(STRATEGY_META[key].shortLabel);
    });
  });

  it('요정 이름 셋이 서로 겹치지 않는다', () => {
    const names = STRATEGY_KEYS.map((key) => defaultAngels[key].name);
    expect(new Set(names).size).toBe(STRATEGY_KEYS.length);
  });
});

describe('getDominantStrategy', () => {
  it('가장 많이 선택된 전략을 고른다', () => {
    expect(getDominantStrategy({ accept: 1, reappraisal: 5, refocus: 2 })).toBe('reappraisal');
  });

  it('동점이면 STRATEGY_KEYS 순서상 앞선 키가 이긴다 (결정론적)', () => {
    expect(getDominantStrategy({ accept: 3, reappraisal: 3, refocus: 3 })).toBe('accept');
  });
});
