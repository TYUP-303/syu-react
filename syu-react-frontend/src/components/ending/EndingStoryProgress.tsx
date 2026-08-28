// src/components/ending/EndingStoryProgress.tsx
// 화면 상단의 스토리형 진행 표시.
//
// 지난 칸은 가득, 현재 칸은 그 챕터의 체류 시간에 맞춰 차오르고, 남은 칸은 비어
// 있다. 체류 시간은 getChapterDurationMs가 챕터 글자 수로 계산한 값을 그대로
// 받으므로, 막대가 차는 속도와 실제 전환 시점이 어긋나지 않는다.
//
// 마지막 챕터(크레딧)도 똑같이 차오른다. 자동 진행만 없을 뿐이다. 이전에는
// 자동 진행이 없다는 이유로 진입하자마자 가득 채웠는데, 다른 장과 움직임이
// 달라 "이미 다 지나갔다"는 인상을 주었다.

interface EndingStoryProgressProps {
  total: number;
  current: number;
  /** 현재 챕터의 체류 시간(ms). 막대가 차는 데 걸리는 시간이기도 하다. */
  durationMs: number;
  reducedMotion: boolean;
  onSelect: (index: number) => void;
}

export default function EndingStoryProgress({
  total,
  current,
  durationMs,
  reducedMotion,
  onSelect,
}: EndingStoryProgressProps) {
  return (
    <div className="flex items-center gap-1 px-4 pt-3">
      {Array.from({ length: total }, (_, index) => {
        const isPast = index < current;
        const isCurrent = index === current;
        // 모션을 줄이는 환경에서는 차오르는 연출 없이 바로 채운다.
        const isFilled = isPast || (isCurrent && reducedMotion);

        return (
          <button
            key={index}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelect(index);
            }}
            // py로 터치 영역을 넓히고 -my로 시각적 높이는 그대로 둔다.
            className="flex-1 py-2 -my-2"
            aria-label={`${index + 1}번째 장면으로 이동`}
            aria-current={isCurrent ? 'step' : undefined}
          >
            <span className="block h-[3px] rounded-full bg-inverse-on-surface/25 overflow-hidden">
              <span
                // key에 current를 섞어 챕터가 바뀔 때마다 애니메이션을 다시 시작시킨다.
                key={`${index}-${current}`}
                className="block h-full rounded-full bg-inverse-on-surface origin-left"
                style={
                  isFilled
                    ? { transform: 'scaleX(1)' }
                    : isCurrent
                      ? { animation: `endingSegmentFill ${durationMs}ms linear forwards` }
                      : { transform: 'scaleX(0)' }
                }
              />
            </span>
          </button>
        );
      })}

      <style>{`
        @keyframes endingSegmentFill {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
      `}</style>
    </div>
  );
}
