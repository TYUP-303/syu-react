// src/components/ui/PageHeader.tsx
// 표준 상단 앱 바. PageLayout의 header 슬롯에 넣어 사용한다.
// 좌/중앙/우 3슬롯 구조 — onBack/onClose를 주면 기본 버튼이 생기고,
// left/right로 완전히 교체할 수도 있다.

import React from 'react';

interface PageHeaderProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  onBack?: () => void;
  onClose?: () => void;
  /** 좌측 슬롯 커스텀 (지정 시 onBack 기본 버튼 대신 렌더링) */
  left?: React.ReactNode;
  /** 우측 슬롯 커스텀 (지정 시 onClose 기본 버튼 대신 렌더링) */
  right?: React.ReactNode;
  /** 하단 보더 표시 여부 */
  bordered?: boolean;
}

const iconButtonClass =
  'text-outline hover:text-primary transition-colors p-2 rounded-full cursor-pointer flex items-center';

export default function PageHeader({
  title,
  subtitle,
  onBack,
  onClose,
  left,
  right,
  bordered = true,
}: PageHeaderProps) {
  return (
    <header
      className={`
        w-full flex justify-between items-center px-4 h-16
        bg-surface/80 backdrop-blur-md
        ${bordered ? 'border-b border-outline-variant/30' : ''}
      `}
    >
      <div className="w-10 flex justify-start shrink-0">
        {left ??
          (onBack && (
            <button onClick={onBack} className={iconButtonClass} aria-label="뒤로가기">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
          ))}
      </div>

      <div className="flex-1 min-w-0 flex flex-col items-center text-center">
        {title && (
          <span className="text-[15px] font-bold text-on-surface font-headline truncate w-full">
            {title}
          </span>
        )}
        {subtitle && (
          <span className="text-[11px] text-primary font-bold truncate w-full">{subtitle}</span>
        )}
      </div>

      <div className="w-10 flex justify-end shrink-0">
        {right ??
          (onClose && (
            <button onClick={onClose} className={iconButtonClass} aria-label="닫기">
              <span className="material-symbols-outlined">close</span>
            </button>
          ))}
      </div>
    </header>
  );
}
