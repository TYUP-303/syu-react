// src/components/report/EmotionProfileReport.tsx
// "나의 정서 대응 프로필" — 최초 완주 1회 보고서 (시안 09·11).
//
// 구성 순서는 2026-08-07 PM 확정을 따른다:
//   종합 진단 카드(최상단, 김도영) → 축 A 블록(기본 ON, 분리 컴포넌트)
//   → 축 B 요정 빈도 → 체감률 → 강점/연습 방향 → 훈련 가이드
// 2026-08-26 UAT 1-8로 체감률만 진단 바로 아래(2번)로 올렸다.
//
// 스토어는 읽기 전용으로만 쓴다 — 이 화면은 집계와 표시만 하고
// EpisodeProgress·TestResultData 어느 쪽도 쓰지 않는다.

import { useScenarioStore, type ScenarioProgressMap } from '../../store/useScenarioStore';
import { useTestStore } from '../../store/useTestStore';
import { STRESS_RESULT_TYPE_DESCRIPTION, STRESS_RESULT_TYPE_LABEL } from '../../constants/reactionType';
import { buildAdhdScoreNote, buildProfileNarrative, buildReportHeadline } from '../../api/diaryContent';
import { computeThemeStats } from '../../utils/strategyStats';
import Button from '../ui/Button';
import AxisAProfileCard from './AxisAProfileCard';
import DiagnosisCard from './DiagnosisCard';
import HelpfulnessCard from './HelpfulnessCard';
import ReasonTopCard from './ReasonTopCard';
import StrategyFrequencyCard from './StrategyFrequencyCard';
import StrengthPracticeCard from './StrengthPracticeCard';
import TrainingGuideCard from './TrainingGuideCard';

interface EmotionProfileReportProps {
  /** 이 보고서를 연 계기가 된 영역 */
  themeId: string;
  onClose: () => void;
  /** 나가기 버튼 라벨 */
  closeLabel?: string;
  /**
   * 표시용 진행도 주입구. 생략하면 스토어의 실 진행도를 읽는다.
   * 개발자 디버그 해금이 합성 진행도를 흘려보낼 때만 채워진다 —
   * 이 값은 어떤 경우에도 저장되지 않는다(읽기 전용 계약 유지).
   */
  progress?: ScenarioProgressMap;
}

export default function EmotionProfileReport({
  themeId,
  onClose,
  closeLabel = '보고서 닫기',
  progress: progressOverride,
}: EmotionProfileReportProps) {
  const themes = useScenarioStore((s) => s.themes);
  const storeProgress = useScenarioStore((s) => s.progress);
  const progress = progressOverride ?? storeProgress;
  const adhdResult = useTestStore((s) => s.adhdResult);
  const stressResult = useTestStore((s) => s.stressResult);

  const theme = themes.find((t) => t.id === themeId);
  const stats = computeThemeStats(themes, themeId, progress);

  // 레거시 폴백: resultType이 없으면 축 A의 유형 표시·설명문을 숨긴다
  // (마이그레이션하지 않기로 한 데이터 — 공유 계약 2번).
  const resultType = stressResult?.resultType ?? null;
  const resultTypeLabel = resultType ? STRESS_RESULT_TYPE_LABEL[resultType] : null;
  const resultTypeDescription = resultType ? STRESS_RESULT_TYPE_DESCRIPTION[resultType] : null;

  const adhdScore = typeof adhdResult?.score === 'number' ? adhdResult.score : null;
  const narrative = buildProfileNarrative(stats);
  const headline = buildReportHeadline(theme?.title ?? '이번', stats);

  return (
    <div className="diary-scope w-full flex flex-col gap-4 p-4 rounded-pane animate-fadeIn">
      {/* 헤더 */}
      <header className="space-y-1.5 px-1">
        <h1 className="text-[22px] font-extrabold text-diary-on-surface font-headline leading-tight">
          나의 정서 대응 프로필
        </h1>
        <p className="text-[12px] leading-[20px] text-diary-on-surface-variant font-body">
          검사 결과와 지금까지의 훈련 기록을 바탕으로 나의 대응 방식을 정리했어요.
        </p>
      </header>

      {/* 1. 종합 진단 (최상단) */}
      <DiagnosisCard
        headline={headline}
        resultTypeLabel={resultTypeLabel}
        resultTypeDescription={resultTypeDescription}
      />

      {/* 2. 도움 체감도 — 진단 바로 아래 (2026-08-26 UAT 1-8).
          훈련이 실제로 도움이 됐는지가 이 보고서의 결론인데 네 번째
          카드에 묻혀 있었다. */}
      <HelpfulnessCard stats={stats} />

      {/* 3. 축 A 블록 — 기본 ON, 데이터 없으면 스스로 숨는다 */}
      <AxisAProfileCard
        adhdScore={adhdScore}
        counts={stressResult?.counts ?? null}
        resultTypeLabel={resultTypeLabel}
        scoreNote={buildAdhdScoreNote(adhdResult)}
      />

      {/* 4. 축 B 요정 빈도 */}
      <StrategyFrequencyCard stats={stats} />

      {/* 5. 도움이 된 이유 — 기록이 있을 때만 */}
      {stats.helpfulReasonsTop3.length > 0 && (
        <ReasonTopCard
          title="도움이 된 이유"
          icon="sentiment_satisfied"
          reasons={stats.helpfulReasonsTop3}
          variant="helpful"
        />
      )}

      {/* 6. 강점 / 연습 방향 */}
      <StrengthPracticeCard
        strength={narrative.strength}
        practiceDirection={narrative.practiceDirection}
      />

      {/* 7. 훈련 가이드 */}
      <TrainingGuideCard />

      <Button variant="primary" onClick={onClose} className="w-full py-3.5 font-bold rounded-control">
        {closeLabel}
      </Button>
    </div>
  );
}
