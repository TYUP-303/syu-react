// src/constants/themeColors.ts
// 시나리오 4영역의 고유색을 **클래스 이름으로** 나눠 주는 자리 (2026-08-27 R2-10).
//
// 색값 자체는 index.css의 `@theme`에 있다(--color-theme-{영역}-{accent|container|
// on-container}). 여기 있는 것은 그 토큰을 가리키는 Tailwind 유틸리티 문자열뿐이다.
//
// ⚠️ **클래스 이름을 조립하지 않는다.** `bg-theme-${id}-accent`처럼 만들면
// Tailwind가 소스에서 그 문자열을 찾지 못해 유틸리티를 생성하지 않고, 화면에는
// 색이 아예 나오지 않는다(빌드는 통과하므로 배포 뒤에야 드러난다). 그래서 네
// 영역 × 다섯 자리를 **전부 리터럴로** 적어 둔다 — 지루한 대신 안전하다.
//
// 모르는 영역 id에는 색을 주지 않는다. 스토어의 domains가 늘어나면 여기도 함께
// 늘려야 하고, 그때까지는 기존 primary 계열로 그려진다(색이 없는 것이지 깨진
// 것이 아니다).

export interface ThemeColorClasses {
  /** 아이콘·완주율 숫자처럼 **잉크로** 쓰는 자리 */
  accent: string;
  /** 진행 막대 채움처럼 **면으로** 쓰는 자리 */
  accentFill: string;
  /** 아이콘 칸 틴트 */
  container: string;
  /** 선택된 카드의 테두리 + 아주 옅은 면 */
  selected: string;
  /** 완주 체크 등 상태 표시 */
  check: string;
}

const THEME_COLORS: Record<string, ThemeColorClasses> = {
  workplace: {
    accent: 'text-theme-workplace-accent',
    accentFill: 'bg-theme-workplace-accent',
    container: 'bg-theme-workplace-container',
    selected: 'border-theme-workplace-accent bg-theme-workplace-container/50',
    check: 'text-theme-workplace-accent',
  },
  'job-prep': {
    accent: 'text-theme-job-prep-accent',
    accentFill: 'bg-theme-job-prep-accent',
    container: 'bg-theme-job-prep-container',
    selected: 'border-theme-job-prep-accent bg-theme-job-prep-container/50',
    check: 'text-theme-job-prep-accent',
  },
  relationship: {
    accent: 'text-theme-relationship-accent',
    accentFill: 'bg-theme-relationship-accent',
    container: 'bg-theme-relationship-container',
    selected: 'border-theme-relationship-accent bg-theme-relationship-container/50',
    check: 'text-theme-relationship-accent',
  },
  daily: {
    accent: 'text-theme-daily-accent',
    accentFill: 'bg-theme-daily-accent',
    container: 'bg-theme-daily-container',
    selected: 'border-theme-daily-accent bg-theme-daily-container/50',
    check: 'text-theme-daily-accent',
  },
};

/** 색을 모르는 영역이 쓰는 기존 팔레트. 화면이 비지 않게 하는 폴백이다. */
export const FALLBACK_THEME_COLORS: ThemeColorClasses = {
  accent: 'text-primary',
  accentFill: 'bg-primary',
  container: 'bg-surface-container-high',
  selected: 'border-primary bg-primary-container/10',
  check: 'text-secondary',
};

/** themeId에 물린 색 한 벌. 모르는 id면 기존 primary 계열로 떨어진다. */
export function themeColorsFor(themeId: string | null | undefined): ThemeColorClasses {
  if (!themeId) return FALLBACK_THEME_COLORS;
  return THEME_COLORS[themeId] ?? FALLBACK_THEME_COLORS;
}

/** 색이 정의된 영역 id 목록 (테스트·검수용). */
export const THEMED_AREA_IDS = Object.keys(THEME_COLORS);
