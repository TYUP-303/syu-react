// src/components/test/AdhdResultCard.tsx
// ADHD 경향성 검사 결과 뷰 — 환산점수 게이지 + 개인/공통 설명문.
//
// 확정 스펙 §1: 점수는 (원점수/24)×100 환산이며, 설명문은 "가능성·심각도·
// 백분위를 의미하지 않는다"는 문장이 핵심이다. 상담·의료기관 방문 권고 문구는
// 넣지 않는다 (7차 자문회의 확정).

import { COPY } from '../../constants/copy';
import { TEST_THEME } from '../../constants/testTheme';
import { describeAdhdFrequency } from '../../utils/testScoring';
import type { TestResultData } from '../../store/useTestStore';

// 이 카드는 ADHD 검사 전용이므로 색 축이 고정이다. 값은 primary와 같지만
// 검사 화면의 색 분기는 testTheme 별칭 하나만 보게 두어야 나중에 재조정할 때
// index.css의 별칭 6개만 고치면 된다.
const adhdTheme = TEST_THEME.adhd;

interface AdhdResultCardProps {
  result: TestResultData;
  /** 문항 CSV의 선택지 라벨 (빈도 구간 문구 생성용). 없으면 개인 설명문 생략 */
  optionLabels: string[];
  /** 문항 수 — 평균 응답 배점 산출용 */
  questionCount: number;
}

export default function AdhdResultCard({
  result,
  optionLabels,
  questionCount,
}: AdhdResultCardProps) {
  const rawScore = result.rawScore ?? 0;
  const average = questionCount > 0 ? rawScore / questionCount : 0;
  const frequencyPhrase = describeAdhdFrequency(average, optionLabels);

  return (
    <div className="w-full flex flex-col gap-4">
      {/* 점수 게이지 */}
      <div className="w-full bento-card p-5 flex flex-col gap-3">
        <span className="text-[12px] text-outline font-body">{COPY.test.resultAdhdScoreLabel}</span>
        {/* 단위는 '점', 만점은 뒤에 붙는 보조 캡션이다 (2026-08-26 UAT 1-2).
            "62 /100"은 점수인지 진행률인지 읽히지 않는다는 지적이었다.

            2026-08-27 UAT R1-09: 그 뒤로도 "58 점 100점 만점"으로 세 덩어리가
            같은 간격으로 늘어서 어디까지가 내 점수인지 갈리지 않았다. 숫자와
            '점'은 gap을 없애 붙이고(→ "58점"), 슬래시를 사이에 넣어
            "58점 / 100점 만점"으로 끊는다. 슬래시는 화면에서만 끊어 주는
            장식이라 aria-hidden이다 — 낭독은 아래 게이지의 대체 텍스트가
            "62점 (100점 만점)"으로 이미 또렷하게 맡고 있다. */}
        <div className="flex items-baseline">
          <span className={`text-[40px] leading-none font-bold font-headline ${adhdTheme.accentText}`}>
            {result.score}
          </span>
          <span className="text-[16px] text-on-surface-variant font-headline">
            {COPY.test.resultAdhdScoreUnit}
          </span>
          <span className="text-[12px] text-outline font-body px-1.5" aria-hidden="true">
            {COPY.test.resultAdhdScoreDivider}
          </span>
          <span className="text-[12px] text-outline font-body">
            {COPY.test.resultAdhdScoreMax}
          </span>
        </div>
        <div
          className="w-full h-3 rounded-full bg-surface-container-high overflow-hidden"
          role="img"
          aria-label={`${result.score}${COPY.test.resultAdhdScoreUnit} (${COPY.test.resultAdhdScoreMax})`}
        >
          <div
            className={`h-full rounded-full transition-all duration-700 ${adhdTheme.accentBg}`}
            style={{ width: `${Math.min(Math.max(result.score, 0), 100)}%` }}
          />
        </div>
      </div>

      {/* 개인 설명문 — ⚠️ 문구는 시트 확정 템플릿(COPY.test.resultAdhdPersonalDesc)이다.
          윤문·요약 금지. 여기서 바꿀 수 있는 것은 감싸는 카드의 색뿐이다. */}
      {frequencyPhrase && (
        <div className={`w-full bento-card p-5 border border-outline-variant ${adhdTheme.containerGlow}`}>
          <p className="text-[13px] leading-[22px] text-on-surface font-body">
            {COPY.test.resultAdhdPersonalDesc(result.score, frequencyPhrase)}
          </p>
        </div>
      )}

      {/* 공통 설명문 */}
      <p className="text-[12px] leading-[20px] text-on-surface-variant font-body px-1">
        {COPY.test.resultAdhdCommonDesc}
      </p>
    </div>
  );
}
