// src/components/report/ComprehensiveInsightReport.tsx
// "나의 종합 인사이트" — 4영역 완주 보상 (시안 01·08).
//
// R2 이전에는 훈련 기록과 무관한 정적 격려문 5페이지였다. 2축 통합
// 보고서로 갈아 끼운다: 종합 진단 최상단 → 축 A 프로필 → 전 영역 축 B
// (빈도·체감률·영역 비교·요인) → 전체 여정 요약.
// 2026-08-26 UAT 1-8로 체감률만 진단 바로 아래(2번)로 올렸다.
//
// 엔딩(NRQ-0073) 연결은 그대로 유지한다.

import { useScenarioStore, type ScenarioProgressMap } from '../../store/useScenarioStore';
import { useTestStore } from '../../store/useTestStore';
import {
  STRESS_RESULT_TYPE_DESCRIPTION,
  STRESS_RESULT_TYPE_LABEL,
} from '../../constants/reactionType';
import {
  buildAdhdScoreNote,
  buildProfileNarrative,
  buildReportHeadline,
  getDiaryByThemeId,
} from '../../api/diaryContent';
import { computeAlbumProgress, computeOverallStats } from '../../utils/strategyStats';
import Button from '../ui/Button';
import DiaryStickyHeader from '../diary/DiaryStickyHeader';
import AxisAProfileCard from './AxisAProfileCard';
import DiagnosisCard from './DiagnosisCard';
import DomainComparisonCard from './DomainComparisonCard';
import HelpfulnessCard from './HelpfulnessCard';
import ReasonTopCard from './ReasonTopCard';
import ReportCard from './ReportCard';
import StrategyFrequencyCard from './StrategyFrequencyCard';
import StrengthPracticeCard from './StrengthPracticeCard';

interface ComprehensiveInsightReportProps {
  onBack: () => void;
  /** 최종 엔딩 크레딧으로 (NRQ-0073) */
  onGoEnding: () => void;
  /**
   * 표시용 진행도 주입구. 생략하면 스토어의 실 진행도를 읽는다.
   * 개발자 디버그 해금이 합성 진행도를 흘려보낼 때만 채워진다 —
   * 이 값은 어떤 경우에도 저장되지 않는다(읽기 전용 계약 유지).
   */
  progress?: ScenarioProgressMap;
}

export default function ComprehensiveInsightReport({
  onBack,
  onGoEnding,
  progress: progressOverride,
}: ComprehensiveInsightReportProps) {
  const themes = useScenarioStore((s) => s.themes);
  const storeProgress = useScenarioStore((s) => s.progress);
  const progress = progressOverride ?? storeProgress;
  const adhdResult = useTestStore((s) => s.adhdResult);
  const stressResult = useTestStore((s) => s.stressResult);

  const stats = computeOverallStats(themes, progress);
  const album = computeAlbumProgress(themes, progress);
  const diary = getDiaryByThemeId('comprehensive');

  // 레거시 폴백 — resultType이 없으면 유형 라벨·설명문을 숨긴다.
  const resultType = stressResult?.resultType ?? null;
  const resultTypeLabel = resultType ? STRESS_RESULT_TYPE_LABEL[resultType] : null;
  const resultTypeDescription = resultType ? STRESS_RESULT_TYPE_DESCRIPTION[resultType] : null;

  const adhdScore = typeof adhdResult?.score === 'number' ? adhdResult.score : null;
  const narrative = buildProfileNarrative(stats);
  const headline = buildReportHeadline('전체', stats);

  return (
    <div className="diary-scope w-full flex flex-col gap-4 p-4 rounded-pane animate-fadeIn">
      {/* ── 헤더 — 스크롤러 상단에 고정 ──
          sticky 플러시·페이드 엣지 패턴과 제목 x좌표(1뎁스와 동일)는
          DiaryStickyHeader가 소유한다. */}
      <DiaryStickyHeader
        title="나의 종합 인사이트"
        description="지금까지의 선택과 도움 경험을 바탕으로 나만의 정서 조절 패턴을 정리했어요."
        onBack={onBack}
      />

      {/* ── 1. 종합 진단 (최상단) ── */}
      <DiagnosisCard
        headline={headline}
        resultTypeLabel={resultTypeLabel}
        resultTypeDescription={resultTypeDescription}
      />

      {/* ── 2. 전체 도움 체감도 ──
          2026-08-26 UAT 1-8 — 다섯 번째 카드에 묻혀 있던 것을 진단 바로
          아래로 올렸다. 정서 대응 프로필과 같은 자리다. */}
      <HelpfulnessCard stats={stats} />

      {/* ── 3. 플레이 여정 요약 ── */}
      <ReportCard title="플레이 여정 요약" icon="route">
        <div className="flex gap-3">
          <div className="flex-1 rounded-control bg-diary-surface-low py-3 text-center">
            <p className="text-[18px] font-extrabold text-diary-primary font-headline">
              {album.completedThemes} / {album.totalThemes}
            </p>
            <p className="text-[11px] text-diary-on-surface-variant font-body">완료 영역</p>
          </div>
          <div className="flex-1 rounded-control bg-diary-surface-low py-3 text-center">
            <p className="text-[18px] font-extrabold text-diary-primary font-headline">
              {album.clearedEpisodes} / {album.totalEpisodes}
            </p>
            <p className="text-[11px] text-diary-on-surface-variant font-body">플레이 에피소드</p>
          </div>
        </div>
        <div className="diary-gauge-track h-3">
          <div className="diary-gauge-fill bg-diary-primary" style={{ width: `${album.percent}%` }} />
        </div>
      </ReportCard>

      {/* ── 4. 축 A 프로필 ── */}
      <AxisAProfileCard
        adhdScore={adhdScore}
        counts={stressResult?.counts ?? null}
        resultTypeLabel={resultTypeLabel}
        scoreNote={buildAdhdScoreNote(adhdResult)}
      />

      {/* ── 5. 축 B — 전체 전략 사용 비중 (제목은 카드 기본값) ── */}
      <StrategyFrequencyCard stats={stats} />

      {/* ── 6. 영역별 비교 ── */}
      <DomainComparisonCard themes={themes} progress={progress} />

      {/* ── 7. 요인 Top3 ── */}
      <ReasonTopCard
        title="도움이 된 이유"
        icon="recommend"
        reasons={stats.helpfulReasonsTop3}
        variant="helpful"
      />
      <ReasonTopCard
        title="잘 모르겠던 이유"
        icon="info"
        reasons={stats.unhelpfulReasonsTop3}
        variant="difficult"
      />

      {/* ── 8. 강점 / 연습 방향 ── */}
      <StrengthPracticeCard
        strength={narrative.strength}
        practiceDirection={narrative.practiceDirection}
      />

      {/* ── 맺음말 ── */}
      {diary && (
        <ReportCard tone="muted">
          <p className="text-[12px] leading-[21px] text-diary-on-surface-variant font-body">
            {diary.closing}
          </p>
          <p className="text-[12px] leading-[20px] text-diary-primary font-body font-bold italic pt-2 border-t border-diary-outline-variant/40">
            “{diary.quote}”
          </p>
        </ReportCard>
      )}

      {/* ── 하단 액션 ── */}
      <div className="flex flex-col gap-2.5 pt-1">
        {/* NRQ-0073 — 종합 인사이트 끝에서 엔딩으로 */}
        <Button
          variant="primary"
          onClick={onGoEnding}
          icon="celebration"
          className="w-full py-3.5 font-bold rounded-control"
        >
          최종 엔딩 보러가기
        </Button>
        <Button
          variant="outline"
          onClick={onBack}
          icon="list"
          className="w-full py-3.5 font-bold rounded-control"
        >
          회복일기 목록으로
        </Button>
      </div>
    </div>
  );
}
