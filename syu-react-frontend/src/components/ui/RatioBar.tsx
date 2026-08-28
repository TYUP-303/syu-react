// src/components/ui/RatioBar.tsx
// 라벨 + 가로 막대 + 값 표시의 재사용 통계 막대.
// 색은 호출부가 테마 토큰 유틸리티(bg-secondary 등)로 넘긴다 — 여기서 색을
// 하드코딩하거나 분기하지 않는다.

interface RatioBarProps {
  label: string;
  /** 막대 채움 비율 0~100 */
  percent: number;
  /** 우측에 표시할 값 문자열 (예: "50%", "3 / 4") */
  valueText: string;
  /** 채움 색 유틸리티 클래스 (예: 'bg-secondary') */
  barClassName: string;
  /** 라벨 색 유틸리티 클래스 (예: 'text-secondary') */
  labelClassName?: string;
}

export default function RatioBar({
  label,
  percent,
  valueText,
  barClassName,
  labelClassName = 'text-on-surface',
}: RatioBarProps) {
  const clamped = Math.min(Math.max(percent, 0), 100);

  return (
    <div className="w-full flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className={`text-[13px] font-bold font-headline ${labelClassName}`}>{label}</span>
        <span className="text-[12px] text-on-surface-variant font-body">{valueText}</span>
      </div>
      <div
        className="w-full h-2.5 rounded-full bg-surface-container-high overflow-hidden"
        role="img"
        aria-label={`${label} ${valueText}`}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${barClassName}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
