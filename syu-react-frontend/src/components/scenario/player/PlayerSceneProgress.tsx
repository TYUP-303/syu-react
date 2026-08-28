// src/components/scenario/player/PlayerSceneProgress.tsx
// 상단 씬 세그먼트 바 — "네 장면 중 지금 몇 번째인가".
//
// 엔딩 플레이어(EndingStoryProgress)의 문법을 그대로 가져왔다. 다른 점은 둘이다:
//   1) 자동 진행이 없다. 그래서 현재 칸이 시간에 맞춰 차오르지 않고 곧바로 찬다.
//   2) 칸을 눌러 이동하지 않는다. 앞으로 건너뛰면 읽지 않은 대사를 지나치게
//      되고, 뒤로는 화면 좌측 30% 탭과 ←키가 이미 담당한다. 눌리는 것처럼
//      보이지 않도록 <span>으로 그린다.
//
// 대사 단계를 지나면(요정 등장 이후) 네 칸이 모두 찬다 — 장면은 끝났고 지금은
// 그 상황을 어떻게 다룰지 고르는 중이라는 뜻이다.

import { COPY } from '../../../constants/copy';

interface PlayerSceneProgressProps {
  /** 전체 씬 수 (CSV상 에피소드당 4씬 고정) */
  total: number;
  /** 현재 씬 인덱스(0-based) */
  current: number;
  /** 대사 단계를 지나 모든 칸이 찬 상태인가 */
  allFilled: boolean;
}

export default function PlayerSceneProgress({
  total,
  current,
  allFilled,
}: PlayerSceneProgressProps) {
  return (
    <div
      className="flex items-center gap-1"
      role="group"
      aria-label={COPY.player.sceneProgressLabel(Math.min(current + 1, total), total)}
    >
      {Array.from({ length: total }, (_, index) => {
        const isFilled = allFilled || index <= current;
        return (
          <span
            key={index}
            aria-current={!allFilled && index === current ? 'step' : undefined}
            className="flex-1 h-[3px] rounded-full bg-outline-variant/40 overflow-hidden"
          >
            <span
              className={`block h-full rounded-full bg-primary origin-left transition-transform duration-300 ${
                isFilled ? 'scale-x-100' : 'scale-x-0'
              }`}
            />
          </span>
        );
      })}
    </div>
  );
}
