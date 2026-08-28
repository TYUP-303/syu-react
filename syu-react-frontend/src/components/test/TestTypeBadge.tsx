// src/components/test/TestTypeBadge.tsx
// 지금 진행 중인 검사가 무엇인지 알려 주는 칩. 검사 준비/진행 화면 상단에
// 공통으로 얹어, 색(검사별 틴트)과 텍스트(검사명) 두 경로로 구분되게 한다.
//
// 색은 TEST_THEME 별칭만 참조한다 — 원색 토큰 직접 사용 금지.

import { TEST_THEME, type TestType } from '../../constants/testTheme';
import { COPY } from '../../constants/copy';

interface TestTypeBadgeProps {
  testType: TestType;
  className?: string;
}

export default function TestTypeBadge({ testType, className = '' }: TestTypeBadgeProps) {
  const theme = TEST_THEME[testType];

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-3 py-1 rounded-full
        text-[12px] font-bold font-headline whitespace-nowrap
        ${theme.containerBg} ${theme.onContainerText} ${className}
      `}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${theme.accentBg}`} aria-hidden="true" />
      {COPY.test.byType[testType].navTitle}
    </span>
  );
}
