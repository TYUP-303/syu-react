// src/components/scenario/player/ApplyContent.tsx
// APPLY_STRATEGY 단계의 시트 내용 — 고른 전략을 써 본 뒤의 주인공 반응.
//
// 화자가 바뀌는 지점이다. 직전 시트(요정 조언, `detail`)의 화자는 요정이었고
// 여기(`feedback`)의 화자는 주인공이다 — 원고의 두 필드 구분이 그대로 화자
// 구분이므로, 시트 이름표도 그에 맞춰 닉네임으로 바뀐다(호출부가 넘긴다).
// 예전에는 큰따옴표로 대사임을 표시했는데, 이름표가 생긴 뒤로는 중복이라 걷었다.

import Button from '../../ui/Button';
import SheetBackButton from './SheetBackButton';
import type { AngelStrategy } from '../../../api/scenarioMockData';
import { strategyDisplayName } from '../../../api/diaryContent';
import { STRATEGY_META, type StrategyKey } from '../../../constants/strategy';
import { COPY } from '../../../constants/copy';
import { usePersonalizedText } from '../usePersonalizedText';

interface ApplyContentProps {
  angelKey: StrategyKey;
  angel: AngelStrategy;
  onNext: () => void;
  /**
   * 요정 브라우즈로 되돌아가기 (2026-08-27 R2-05). 되돌아가면 **다른 전략으로
   * 바꿀 수 있다** — 결과 기록은 마지막 평가에서 한 번만 쓰이므로 여기서
   * 바꿔도 기록이 둘로 늘어나지 않는다.
   */
  onBack: () => void;
}

export default function ApplyContent({ angelKey, angel, onNext, onBack }: ApplyContentProps) {
  // 실행 반응 대사(scenario_angels.csv의 *_AFTER)도 주인공을 '백설'로 적는다.
  const personalize = usePersonalizedText();
  const meta = STRATEGY_META[angelKey];

  return (
    <div className="w-full flex flex-col gap-3">
      {/* 되돌리기는 요정 화면과 **같은 자리·같은 모양**이다(SheetBackButton). */}
      <SheetBackButton
        label={COPY.player.backToAngels}
        ariaLabel={COPY.player.backToAngelsAria}
        onClick={onBack}
        className="self-start -mb-1"
      />

      {/* 무엇을 골랐는지는 무대(동행 요정)가 먼저 말하지만, 전략 이름까지는
          그림이 못 한다. 한 줄 라벨로 짚어 준다. */}
      <p className="text-[11px] font-bold text-outline">
        {COPY.player.selectedStrategyLabel}
        <span className={`ml-1.5 ${meta.text}`}>{strategyDisplayName(angelKey, angel.name)}</span>
      </p>

      {/* 대사 시트와 같은 4줄 예약 — 회차마다 길이가 달라도 시트가 뛰지 않는다.
          *_AFTER는 최대 36자로 짧은 편이라 여기서는 바닥값이 곧 실제 높이다. */}
      <p className="text-[14px] text-on-surface leading-relaxed min-h-[72px]">
        {personalize(angel.feedback)}
      </p>

      {/* 라운드는 Button이 base에서 rounded-control로 정한다 — 여기서 덮어쓰지 않는다 */}
      <Button variant="primary" onClick={onNext} className="w-full py-3 text-[15px]">
        {COPY.player.next}
      </Button>
    </div>
  );
}
