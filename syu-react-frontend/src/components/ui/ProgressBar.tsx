// src/components/ui/ProgressBar.tsx
// 진행률 표시용 얇은 가로 막대.
// 색은 호출부가 테마 토큰 유틸리티 클래스로 넘긴다 — 여기서 하드코딩하거나
// 분기하지 않는다 (ui/RatioBar와 같은 규약).

interface ProgressBarProps {
  /** 채움 비율 0~100 */
  percent: number;
  /** 트랙(배경) 색 유틸리티 클래스 */
  trackClassName?: string;
  /** 채움 색 유틸리티 클래스 */
  fillClassName?: string;
  /** 스크린리더용 설명 */
  ariaLabel?: string;
}

export default function ProgressBar({
  percent,
  trackClassName = 'bg-surface-container-high',
  fillClassName = 'bg-primary',
  ariaLabel,
}: ProgressBarProps) {
  const clamped = Math.min(Math.max(percent, 0), 100);

  return (
    <div
      className={`w-full h-1.5 relative overflow-hidden ${trackClassName}`}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <div
        className={`h-full transition-all duration-300 ${fillClassName}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
