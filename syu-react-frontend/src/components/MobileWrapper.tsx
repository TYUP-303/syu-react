// src/components/MobileWrapper.tsx
// 데스크톱에서도 모바일 뷰포트(430px)를 유지하는 래퍼 컴포넌트.
// 스크롤은 이 컴포넌트가 아니라 각 페이지의 PageLayout 콘텐츠 영역이
// 소유한다 — 헤더/푸터를 스크롤러 밖에 두어 오버스크롤 바운스로부터
// 고정 요소를 분리하기 위한 구조다.

import React from 'react';

interface MobileWrapperProps {
  children: React.ReactNode;
  /**
   * 프레임 최상단에 고정되는 앱 전역 행 (현재는 공지 배너 하나).
   *
   * children 안에 넣지 않고 슬롯으로 받는 이유는 **스크롤러 밖에 두어야
   * 하기 때문**이다. 페이지 컴포넌트는 저마다 h-full PageLayout이라,
   * children으로 나란히 넣으면 배너 높이만큼 페이지가 넘쳐 프레임 밖으로
   * 밀린다. 여기서 flex 행으로 받아야 페이지가 남은 높이를 정확히 갖는다.
   */
  banner?: React.ReactNode;
}

export default function MobileWrapper({ children, banner }: MobileWrapperProps) {
  return (
    // h-dvh: 실제 가시 뷰포트에 정확히 맞춤 (min-h-screen=100vh는 모바일
    // URL바가 보일 때 뷰포트보다 커져 문서 스크롤을 만들었다)
    <div className="h-dvh bg-canvas-bg flex justify-center overflow-hidden">
      <div
        className="
          relative w-full max-w-[430px] h-full
          bg-surface shadow-2xl overflow-hidden
        "
        style={{
          boxShadow: '0 0 60px var(--color-mobile-frame-shadow), 0 0 0 1px var(--color-mobile-frame-border)',
        }}
      >
        {/* 배너가 없으면 자식 하나짜리 flex-col이라 예전의 h-full과 같다 */}
        <div className="h-full flex flex-col">
          {banner}
          <div className="flex-1 min-h-0">{children}</div>
        </div>
        {/* 모달 Portal 타깃 — absolute 자식이 프레임 기준으로 배치된다 */}
        <div id="app-modal-root" />
      </div>
    </div>
  );
}
