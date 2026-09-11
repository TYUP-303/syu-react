// src/components/ui/Toast.tsx
// 화면 하단에 잠깐 떠 있다 사라지는 한 줄 안내.
//
// AlertDialog는 확인을 눌러야 닫히고 화면을 덮는다 — "왜 여기로 왔는지"처럼
// 읽고 지나가면 되는 말에는 과하다. 이 컴포넌트는 덮지 않고, 몇 초 뒤
// 스스로 사라지며, 누르면 바로 닫힌다. 스크린리더에는 role="status"로
// 곁들이는 안내로 읽힌다(NoticeBanner와 같은 원칙).

import { useEffect } from 'react';

interface ToastProps {
  /** null이면 렌더링하지 않는다 */
  message: string | null;
  /** 스크린리더용 이름 (무슨 안내인지) */
  label: string;
  /** 사라질 때 호출 — 상태를 비우는 책임 */
  onClose: () => void;
  /** 자동으로 닫히기까지의 시간(ms) */
  durationMs?: number;
}

export default function Toast({ message, label, onClose, durationMs = 4000 }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(id);
  }, [message, durationMs, onClose]);

  if (!message) return null;

  return (
    <div className="absolute inset-x-0 bottom-6 z-40 flex justify-center px-6 pointer-events-none">
      <button
        type="button"
        role="status"
        aria-label={label}
        onClick={onClose}
        className="pointer-events-auto max-w-full rounded-pane bg-inverse-surface text-inverse-on-surface text-[13px] font-body leading-snug px-4 py-3 shadow-lg text-left"
      >
        {message}
      </button>
    </div>
  );
}
