// src/components/scenario/player/SheetBackButton.tsx
// 시트 안의 **되돌리기** 하나 — 단계가 달라도 자리와 모양이 같아야 한다.
//
// ── 왜 컴포넌트로 뺐나 (2026-08-27 2차 UAT R2-05) ────────────────────
//
// 원래 되돌리기는 평가 단계(핵심 요인 → 도움 평가) 한 곳에만 있었고, 그 모양은
// EvaluateContent 안의 지역 클래스였다. 2차 UAT에서 "전략을 고르는 단계에서
// 시나리오로 돌아갈 수가 없다"는 지적을 받아 되돌리기가 네 자리로 늘었는데,
// 자리마다 다른 모양으로 서면 사용자는 그것이 같은 동작인지 알 수 없다.
// 그래서 **모양은 이 파일이, 자리는 부르는 쪽이** 정한다.
//
// 모양의 원칙은 그대로 물려받는다: 시트 안의 선택지들과 경쟁하지 않도록 면도
// 테두리도 없이 글자만 세운다. 되돌리기는 그 화면의 주된 동작이 아니다.
//
// ⚠️ 아이콘 글리프 이름('chevron_left')은 버튼 이름에서 뺀다(aria-hidden).
// 빼지 않으면 낭독이 "chevron_left 이전"이 된다 — 방향 표시일 뿐이다.

import { COPY } from '../../../constants/copy';

interface SheetBackButtonProps {
  /** 눈에 보이는 라벨. 어디로 돌아가는지를 동사로 밝힌다(copy.tsx). */
  label: string;
  /**
   * 화면 낭독기용 이름. **보이는 라벨을 그대로 품은 문장**이어야 한다 —
   * 음성 조작은 보이는 글자로 버튼을 부르므로, 이름이 라벨을 포함하지 않으면
   * "장면 다시 보기"라고 말해도 눌리지 않는다(WCAG 2.5.3 Label in Name).
   * 생략하면 라벨이 곧 이름이다.
   */
  ariaLabel?: string;
  onClick: () => void;
  disabled?: boolean;
  /** 자리는 부르는 쪽이 정한다 — 흐름 안(self-start)이든 겹침(absolute)이든. */
  className?: string;
}

export default function SheetBackButton({
  label,
  ariaLabel,
  onClick,
  disabled = false,
  className = '',
}: SheetBackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`
        flex items-center gap-0.5 text-[12px] font-medium
        text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer
        disabled:opacity-40 disabled:cursor-default ${className}
      `}
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
        {COPY.player.backIcon}
      </span>
      {label}
    </button>
  );
}
