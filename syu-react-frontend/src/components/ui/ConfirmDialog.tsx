// src/components/ui/ConfirmDialog.tsx
// 취소 · 확인 2버튼 확인 다이얼로그.
//
// AlertDialog는 네이티브 alert()의 1:1 대체(확인 버튼 하나)라 "되돌리기
// 어려운 동작을 진행할지 묻는" 자리에는 쓸 수 없다. 이 컴포넌트가 그 자리를
// 맡는다 — Modal(포털)을 감싼 얇은 래퍼로 아이콘 + 제목 + 본문 + [취소][확인]만
// 얹는다. 백드롭 클릭은 취소로 취급한다(확인이 기본이면 실수로 진행된다).
//
// tone='destructive'는 색의 역할을 뒤집는다. 기본 배치에서는 확인 버튼이
// primary(파랑 = 권장) 채움이라, "나가기"·"초기화"·"탈퇴" 같은 파괴적 선택지가
// 화면에서 가장 권하는 버튼처럼 보였다. destructive에서는 확인을 error 채움으로,
// 취소를 primary로 둬서 "머무르는 쪽"이 권장이 되게 한다.

import Modal from './Modal';
import Button from './Button';

export type ConfirmTone = 'default' | 'destructive';

interface ConfirmDialogProps {
  /** false면 렌더링하지 않는다 */
  open: boolean;
  title: string;
  message: string;
  /** material symbol 이름 */
  icon?: string;
  confirmLabel: string;
  cancelLabel: string;
  /** 되돌릴 수 없는 확인이면 'destructive' — 확인=error, 취소=primary */
  tone?: ConfirmTone;
  /** 처리 중이면 두 버튼을 모두 잠근다 (초기화·탈퇴처럼 시간이 걸리는 확인) */
  busy?: boolean;
  /** 확인 버튼 · 되돌리기 어려운 쪽 */
  onConfirm: () => void;
  /** 취소 버튼 · 백드롭 클릭 */
  onCancel: () => void;
}

const TONE: Record<
  ConfirmTone,
  {
    iconWrap: string;
    iconText: string;
    confirmVariant: 'primary' | 'danger';
    cancelVariant: 'primary' | 'outline';
  }
> = {
  default: {
    iconWrap: 'bg-primary/10 border-primary/30',
    iconText: 'text-primary',
    confirmVariant: 'primary',
    cancelVariant: 'outline',
  },
  destructive: {
    iconWrap: 'bg-error/10 border-error/30',
    iconText: 'text-error',
    confirmVariant: 'danger',
    cancelVariant: 'primary',
  },
};

export default function ConfirmDialog({
  open,
  title,
  message,
  icon = 'help',
  confirmLabel,
  cancelLabel,
  tone = 'default',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const t = TONE[tone];

  return (
    <Modal onBackdropClick={busy ? undefined : onCancel}>
      <div
        className={`relative w-14 h-14 mx-auto flex items-center justify-center rounded-full border ${t.iconWrap}`}
      >
        <span className={`material-symbols-outlined text-[30px] ${t.iconText}`}>{icon}</span>
      </div>
      <div className="space-y-1">
        <h4 className="text-[17px] font-bold text-on-surface font-headline">{title}</h4>
        <p className="text-[13px] text-outline leading-relaxed font-body whitespace-pre-line">
          {message}
        </p>
      </div>
      <div className="flex gap-3">
        <Button variant={t.cancelVariant} onClick={onCancel} disabled={busy} className="flex-1">
          {cancelLabel}
        </Button>
        <Button variant={t.confirmVariant} onClick={onConfirm} disabled={busy} className="flex-1">
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
