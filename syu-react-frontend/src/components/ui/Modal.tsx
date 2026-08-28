// src/components/ui/Modal.tsx
// 표준 모달. MobileWrapper의 #app-modal-root로 Portal 렌더링되어
// 어떤 스태킹 컨텍스트(예: relative z-10인 main) 안에서 호출해도
// 항상 헤더·탭바 위(z-50)에 뜬다.

import React from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  children: React.ReactNode;
  /** 백드롭 클릭 시 호출 (미지정 시 백드롭으로 닫기 비활성) */
  onBackdropClick?: () => void;
  /** 모달 카드에 추가할 클래스 */
  cardClassName?: string;
}

export default function Modal({ children, onBackdropClick, cardClassName = '' }: ModalProps) {
  const root = document.getElementById('app-modal-root');
  if (!root) return null;

  return createPortal(
    <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
      <div
        className="absolute inset-0 bg-scrim-bg-60 backdrop-blur-sm animate-fadeIn"
        onClick={onBackdropClick}
      />
      <div
        className={`relative w-full max-w-[340px] bento-card p-6 bg-surface-container text-center space-y-5 animate-scaleIn shadow-2xl ${cardClassName}`}
      >
        {children}
      </div>
    </div>,
    root
  );
}
