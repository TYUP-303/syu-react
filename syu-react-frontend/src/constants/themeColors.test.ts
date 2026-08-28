// src/constants/themeColors.test.ts
// 시나리오 4영역 고유색의 클래스 매핑 (2026-08-27 UAT R2-10).
//
// 여기서 지키려는 것은 **Tailwind가 찾을 수 있는 형태로 적혀 있는가**다.
// `bg-theme-${id}-accent`처럼 조립하면 빌드는 통과하는데 유틸리티가 생성되지
// 않아 화면에만 색이 안 나온다 — 배포 뒤에야 드러나는 종류의 실패라 여기서
// 리터럴 여부를 못 박는다.

import { describe, it, expect } from 'vitest';
import {
  FALLBACK_THEME_COLORS,
  THEMED_AREA_IDS,
  themeColorsFor,
} from './themeColors';

describe('themeColorsFor', () => {
  it('스토어의 네 영역 id를 모두 안다', () => {
    // useScenarioStore.fetchThemes의 domains와 같은 네 개다.
    expect(THEMED_AREA_IDS).toEqual(['workplace', 'job-prep', 'relationship', 'daily']);
  });

  it.each([
    ['workplace', 'workplace'],
    ['job-prep', 'job-prep'],
    ['relationship', 'relationship'],
    ['daily', 'daily'],
  ])('%s는 자기 토큰을 가리키는 클래스를 받는다', (id, token) => {
    const colors = themeColorsFor(id);
    expect(colors.accent).toBe(`text-theme-${token}-accent`);
    expect(colors.accentFill).toBe(`bg-theme-${token}-accent`);
    expect(colors.container).toBe(`bg-theme-${token}-container`);
    expect(colors.selected).toContain(`border-theme-${token}-accent`);
  });

  it('네 영역이 서로 다른 색을 쓴다', () => {
    const accents = THEMED_AREA_IDS.map((id) => themeColorsFor(id).accent);
    expect(new Set(accents).size).toBe(THEMED_AREA_IDS.length);
  });

  it('모르는 영역·빈 값은 기존 palette로 떨어진다 (색이 없는 것이지 깨진 것이 아니다)', () => {
    expect(themeColorsFor('nope')).toBe(FALLBACK_THEME_COLORS);
    expect(themeColorsFor(null)).toBe(FALLBACK_THEME_COLORS);
    expect(themeColorsFor(undefined)).toBe(FALLBACK_THEME_COLORS);
  });
});
