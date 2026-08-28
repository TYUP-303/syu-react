// src/components/common/UnlockNoticeModal.tsx
// "무언가 열렸어요" 알림 모달 — 영역 완주 흐름의 두 매듭이 함께 쓴다.
//
//   10편 완료 → [에필로그가 열렸어요]   → 에필로그 플레이어
//   에필로그 끝 → [회복일기 기록 완성]  → 유형 보고서 또는 회복일기 탭
//
// 두 자리가 같은 그림이어야 하는 이유는 장식이 아니다. 사용자는 연속한 두
// 매듭을 **같은 종류의 알림**으로 읽어야 "하나 더 남았구나"를 안다 — 모양이
// 다르면 두 번째 모달이 첫 번째와 무관한 팝업으로 보인다. 2026-08-27 UAT
// R2-25·R2-28에서 회복일기 해금 모달의 마크업을 여기로 끌어올렸다.
//
// 문구는 전부 호출부가 정한다(단일 출처는 constants/copy). 여기서 정하는 것은
// 배치뿐이다.

import type { ReactNode } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

interface UnlockNoticeModalProps {
  /** Material Symbols 아이콘 이름 (원형 배지 안에 뜬다) */
  icon: string;
  title: string;
  body: ReactNode;
  ctaLabel: string;
  onCta: () => void;
  /**
   * 보조 동작. 넘기지 않으면 버튼 자체가 없다 — 회복일기 안내처럼 "여기서
   * 끝내고 나가는" 선택지가 없는 자리도 있어서 옵셔널이다.
   */
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export default function UnlockNoticeModal({
  icon,
  title,
  body,
  ctaLabel,
  onCta,
  secondaryLabel,
  onSecondary,
}: UnlockNoticeModalProps) {
  return (
    <Modal>
      <div className="relative w-16 h-16 mx-auto flex items-center justify-center bg-secondary-container/20 rounded-full border border-secondary/30">
        <span className="material-symbols-outlined text-[36px] text-secondary animate-bounce">
          {icon}
        </span>
      </div>
      <div className="space-y-1">
        <h4 className="text-[18px] font-bold text-on-surface font-headline">{title}</h4>
        <p className="text-[12px] text-outline leading-relaxed font-body">{body}</p>
      </div>
      <div className="space-y-2">
        <Button
          variant="primary"
          onClick={onCta}
          className="w-full py-3 rounded-control font-bold"
        >
          {ctaLabel}
        </Button>
        {secondaryLabel && onSecondary && (
          <Button variant="ghost" onClick={onSecondary} className="w-full py-2">
            {secondaryLabel}
          </Button>
        )}
      </div>
    </Modal>
  );
}
