// src/components/ui/AlertDialog.tsx
// 네이티브 alert() 대체 다이얼로그.
//
// alert()는 430px 프레임 밖 브라우저 최상단에 뜨고 디자인 시스템을
// 무시하며, JS 스레드를 막아 뒤따르는 상태 변경 타이밍까지 바꾼다.
// 이 컴포넌트는 Modal(포털)을 감싼 얇은 래퍼로, 메시지 + 확인 버튼만
// 얹는다. onConfirm을 주면 확인을 누른 뒤 실행되므로 "알림을 본 다음
// 화면을 닫는다" 같은 순서를 그대로 표현할 수 있다.

import Modal from './Modal';
import Button from './Button';
import { COPY } from '../../constants/copy';

export type AlertTone = 'info' | 'success' | 'error';

interface AlertDialogProps {
  /** null이면 렌더링하지 않는다 (alert 호출 여부와 1:1 대응) */
  message: string | null;
  tone?: AlertTone;
  confirmLabel?: string;
  /** 확인 · 백드롭 클릭 시 호출 (다이얼로그를 닫는 책임) */
  onClose: () => void;
  /** 확인을 누른 뒤 이어서 실행할 동작 (닫기 후 호출) */
  onConfirm?: () => void;
}

const TONE: Record<AlertTone, { icon: string; text: string; bg: string; border: string }> = {
  info: { icon: 'info', text: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' },
  success: { icon: 'check_circle', text: 'text-success', bg: 'bg-success/10', border: 'border-success/30' },
  error: { icon: 'error', text: 'text-error', bg: 'bg-error/10', border: 'border-error/30' },
};

export default function AlertDialog({
  message,
  tone = 'info',
  confirmLabel,
  onClose,
  onConfirm,
}: AlertDialogProps) {
  if (!message) return null;

  const t = TONE[tone];
  const handleConfirm = () => {
    onClose();
    onConfirm?.();
  };

  return (
    <Modal onBackdropClick={handleConfirm}>
      <div
        className={`relative w-14 h-14 mx-auto flex items-center justify-center rounded-full ${t.bg} border ${t.border}`}
      >
        <span className={`material-symbols-outlined text-[30px] ${t.text}`}>{t.icon}</span>
      </div>
      <p className="text-[13px] text-on-surface leading-relaxed font-body whitespace-pre-line">
        {message}
      </p>
      <Button variant="primary" onClick={handleConfirm} className="w-full">
        {confirmLabel ?? COPY.common.confirm}
      </Button>
    </Modal>
  );
}
