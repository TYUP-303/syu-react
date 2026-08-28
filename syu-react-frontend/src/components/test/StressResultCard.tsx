// src/components/test/StressResultCard.tsx
// 스트레스 반응 기제 검사 결과 뷰 — 영역별 비율 막대 3개 + 우세 유형 카드.
//
// 확정 스펙 §2: 비율 = (영역점수 / 세 영역 합) × 100, 유형은 8분류 중
// 'undetermined'를 제외한 7종. 설명문 전문은 reactionType.ts가 소유한다.
// 혼합형·균형형이면 시나리오 순환 배치 안내를 한 줄 덧붙인다.

import RatioBar from '../ui/RatioBar';
import EmphasizedText from '../ui/EmphasizedText';
import { COPY } from '../../constants/copy';
import {
  REACTION_TYPE_KEYS,
  REACTION_TYPE_META,
  STRESS_RESULT_TYPE_DESCRIPTION,
  STRESS_RESULT_TYPE_EMPHASIS,
  STRESS_RESULT_TYPE_LABEL,
  getReactionTypeCycle,
  type ReactionTypeKey,
  type StressResultType,
} from '../../constants/reactionType';
import { TEST_THEME } from '../../constants/testTheme';
import { getStressRatios } from '../../utils/testScoring';

// 이 카드는 스트레스 검사 전용이므로 색 축이 고정이다.
// 영역별(인지·정서·행동) 색은 REACTION_TYPE_META가 따로 소유한다 — 검사 액센트와 다른 축이다.
const stressTheme = TEST_THEME.stress;

interface StressResultCardProps {
  counts: Record<ReactionTypeKey, number>;
  resultType: StressResultType;
  /** '예' 총수 */
  yesCount: number;
  /** 문항 수 (요약 문구용) */
  questionCount: number;
}

export default function StressResultCard({
  counts,
  resultType,
  yesCount,
  questionCount,
}: StressResultCardProps) {
  const ratios = getStressRatios(counts);
  // 유형이 두 개 이상이면 시나리오가 번갈아 배치된다 — 혼합형·균형형만 해당.
  const isCycled = getReactionTypeCycle(resultType).length > 1;

  return (
    <div className="w-full flex flex-col gap-4">
      {/* 영역별 비율 막대 */}
      <div className="w-full bento-card p-5 flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-bold text-on-surface font-headline">
            {COPY.test.resultStressRatioTitle}
          </span>
          <span className="text-[11px] text-outline font-body">
            {COPY.test.resultStressAnswerSummary(yesCount, questionCount)}
          </span>
        </div>

        {REACTION_TYPE_KEYS.map((key) => {
          const meta = REACTION_TYPE_META[key];
          return (
            <RatioBar
              key={key}
              label={meta.shortLabel}
              percent={ratios[key]}
              valueText={`${ratios[key]}%`}
              barClassName={meta.bar}
              labelClassName={meta.text}
            />
          );
        })}
      </div>

      {/* 우세 유형 카드 */}
      <div className="w-full bento-card p-5 flex flex-col gap-3">
        <span
          className={`text-[11px] px-3 py-1 rounded-full font-bold self-start ${stressTheme.containerBg} ${stressTheme.onContainerText}`}
        >
          {COPY.test.resultStressTypeBadge}
        </span>
        <h3 className="text-[20px] font-bold text-on-surface font-headline">
          {COPY.test.resultStressTypeHeadline(STRESS_RESULT_TYPE_LABEL[resultType])}
        </h3>
        {/* 원문은 심리학부 검수문이라 가공하지 않는다. 핵심 구절만 렌더링
            시점에 굵게 감싼다 — 구절 목록은 STRESS_RESULT_TYPE_EMPHASIS. */}
        <p className="text-[13px] leading-[22px] text-on-surface-variant font-body">
          <EmphasizedText
            text={STRESS_RESULT_TYPE_DESCRIPTION[resultType]}
            phrases={STRESS_RESULT_TYPE_EMPHASIS[resultType]}
          />
        </p>
        {isCycled && (
          <p className="text-[12px] leading-[20px] text-on-surface font-body pt-1 border-t border-outline-variant/30">
            {COPY.test.resultStressCycleNotice}
          </p>
        )}
      </div>
    </div>
  );
}
