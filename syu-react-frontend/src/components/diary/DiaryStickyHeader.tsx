// src/components/diary/DiaryStickyHeader.tsx
// 회복일기 계열 2뎁스 화면(영역 상세 · 종합 인사이트 · 이번 훈련 기록)의
// 공통 고정 헤더.
//
// ── 왜 뒤로가기가 제목 위 별도 행인가 ──
// 예전에는 세 화면 모두 `[뒤로가기][제목]` 가로 배치였다. 그러면 제목의
// x좌표가 버튼 폭(32px) + gap(12px) = 44px만큼 오른쪽으로 밀려, 뒤로가기가
// 없는 1뎁스(DiaryListView의 "회복일기")와 제목 시작점이 어긋난다.
// "뎁스와 무관하게 제목이 같은 자리에서 시작할 것"이 요구사항이므로
// 뒤로가기를 제목 위 별도 행으로 올렸다. 세 화면 모두 이 컴포넌트를 쓰므로
// 한 화면만 어긋날 수 없다.
//
// ── 여백 계산 (1뎁스와 반드시 같아야 하는 값) ──
//   -mt-10 / -mx-10 : 위·옆 여백(HomePage 래퍼 24px + 각 뷰의 p-4 16px,
//                     합 40px)을 정확히 상쇄해 스크롤포트 모서리에 플러시.
//                     딱 맞게 상쇄해야 sticky 보정이 0이 되어 스크롤 0에서
//                     아래 카드와 겹치지 않는다.
//   px-10           : 안쪽 여백 복원. 불투명 bg가 지나가는 카드를 가린다.
//   px-1 (본문 블록) : DiaryListView 고정 블록의 <header className="... px-1">과
//                     같은 값. **이 둘이 어긋나면 제목 x가 다시 벌어진다.**

import type { ReactNode } from 'react';

interface DiaryStickyHeaderProps {
  title: string;
  /** 제목 아래 한 줄 설명 */
  description: ReactNode;
  onBack: () => void;
  /** 뒤로가기 버튼 접근성 라벨 */
  backLabel?: string;
}

export default function DiaryStickyHeader({
  title,
  description,
  onBack,
  backLabel = '뒤로가기',
}: DiaryStickyHeaderProps) {
  return (
    <header className="sticky top-0 z-20 -mt-10 -mx-10 px-10 pt-4 pb-3 bg-diary-surface flex flex-col gap-2">
      {/* 페이드 엣지 — 고정 헤더 아래로 카드가 지나갈 때 뚝 끊기지 않게 하는 스크롤 어포던스 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-full h-4 bg-gradient-to-b from-diary-surface to-transparent"
      />

      {/* 뒤로가기 행 — 제목과 같은 px-1 안에 두어 좌측 정렬을 맞춘다 */}
      <div className="px-1">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-full bg-diary-surface-container hover:bg-diary-surface-high
            flex items-center justify-center text-diary-on-surface-variant transition-colors"
          aria-label={backLabel}
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        </button>
      </div>

      <div className="space-y-1 px-1">
        <h2 className="text-[19px] font-extrabold text-diary-on-surface font-headline">{title}</h2>
        <p className="text-[12px] leading-[20px] text-diary-on-surface-variant font-body">
          {description}
        </p>
      </div>
    </header>
  );
}
