// src/components/ui/PageLayout.tsx
// 앱 셸 표준 레이아웃: 고정 헤더/푸터 + 스크롤 콘텐츠.
//
// 헤더·푸터는 스크롤 컨테이너 "밖"에 있으므로 오버스크롤 바운스의
// 영향을 받지 않는다 (sticky 방식은 러버밴드 때 콘텐츠와 함께 밀린다).
// 콘텐츠 영역의 overscroll-y-none이 스크롤 체이닝과 바운스를 차단한다.
//
// z-index 규약: 콘텐츠 0 / 헤더·푸터 20 / 페이지 오버레이 40 / 모달(Portal) 50

import React from 'react';

interface PageLayoutProps {
  /** 스크롤과 무관하게 상단에 고정되는 영역 (보통 PageHeader) */
  header?: React.ReactNode;
  /** 스크롤과 무관하게 하단에 고정되는 영역 (CTA, 탭바 등) */
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** 스크롤 콘텐츠 래퍼에 추가할 클래스 (보통 px-6 등 패딩) */
  contentClassName?: string;
}

export default function PageLayout({
  header,
  footer,
  children,
  className = '',
  contentClassName = '',
}: PageLayoutProps) {
  return (
    <div className={`h-full flex flex-col bg-surface ${className}`}>
      {header && <div className="shrink-0 z-20">{header}</div>}
      <main
        className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-none ${contentClassName}`}
      >
        {children}
      </main>
      {footer && <div className="shrink-0 z-20">{footer}</div>}
    </div>
  );
}
