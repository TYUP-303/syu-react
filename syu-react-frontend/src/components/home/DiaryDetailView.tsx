// src/components/home/DiaryDetailView.tsx
// 영역 회복일기 상세 — 스크롤 보고서형 (시안 02·06).
//
// R2 이전에는 정적 격려문 5장을 좌우로 넘기는 페이지 뷰어였다. 훈련
// 기록과 무관한 문장이 대부분이라 "내 기록을 보는 화면"으로 읽히지
// 않았고, 통계 카드는 2페이지에만 끼워져 있었다. 스크롤 한 장짜리
// 보고서로 바꾸고 순서를 기록 → 해석 → 제안으로 세웠다.
//
// 종합 인사이트(themeId === 'comprehensive')는 성격이 달라 별도
// 컴포넌트(report/ComprehensiveInsightReport)가 담당한다.

import {
  buildComparisonInsight,
  buildDomainNarrative,
  getDiaryByThemeId,
} from '../../api/diaryContent';
import type { ThemeCategory } from '../../api/scenarioMockData';
import type { ScenarioProgressMap } from '../../store/useScenarioStore';
import { computeThemeStats, summarizeThemeProgress } from '../../utils/strategyStats';
import Button from '../ui/Button';
import DiaryStickyHeader from '../diary/DiaryStickyHeader';
import DomainProgressCard from '../diary/DomainProgressCard';
import IncompleteNotice from '../diary/IncompleteNotice';
import HelpfulnessCard from '../report/HelpfulnessCard';
import ReasonTopCard from '../report/ReasonTopCard';
import ReportCard from '../report/ReportCard';
import StrategyFrequencyCard from '../report/StrategyFrequencyCard';

interface DiaryDetailViewProps {
  themeId: string;
  themes: ThemeCategory[];
  progress: ScenarioProgressMap;
  onBack: () => void;
  /** 시나리오 탭의 해당 영역으로 이동 */
  onGoScenario: () => void;
}

export default function DiaryDetailView({
  themeId,
  themes,
  progress,
  onBack,
  onGoScenario,
}: DiaryDetailViewProps) {
  const diary = getDiaryByThemeId(themeId);
  const theme = themes.find((t) => t.id === themeId);

  if (!diary || !theme) {
    return (
      <div className="w-full flex flex-col items-center justify-center gap-4 py-16 text-center">
        <span className="material-symbols-outlined text-[48px] text-outline">error</span>
        <p className="text-[14px] text-outline font-body">일기를 찾을 수 없어요.</p>
        <Button variant="outline" onClick={onBack}>목록으로</Button>
      </div>
    );
  }

  const summary = summarizeThemeProgress(theme, progress);
  const stats = computeThemeStats(themes, themeId, progress);
  const narrative = buildDomainNarrative(theme.title, stats);

  // 비교 인사이트 — 기록이 있는 다른 영역 하나를 골라 대조한다.
  // 없으면 null이 돌아오고 슬롯을 통째로 생략한다.
  const otherTheme = themes.find(
    (t) => t.id !== themeId && computeThemeStats(themes, t.id, progress).dominant !== null,
  );
  const comparison = otherTheme
    ? buildComparisonInsight(
        theme.title,
        stats,
        otherTheme.title,
        computeThemeStats(themes, otherTheme.id, progress),
      )
    : null;

  return (
    <div className="diary-scope w-full flex flex-col gap-4 p-4 rounded-pane animate-fadeIn">
      {/* ── 헤더 — 스크롤러 상단에 고정 ──
          sticky 플러시·페이드 엣지 패턴과 제목 x좌표(1뎁스와 동일)는
          DiaryStickyHeader가 소유한다. 세 2뎁스 화면이 같은 컴포넌트를 쓰므로
          한 화면만 어긋날 수 없다. */}
      <DiaryStickyHeader title={diary.title} description={diary.intro} onBack={onBack} />

      {/* ── 1. 진행률 ── */}
      <DomainProgressCard summary={summary} />

      {/* ── 미완주 안내 — 완주 전 열람일 때만 ── */}
      {!summary.isComplete && (
        <IncompleteNotice cleared={summary.cleared} total={summary.total} />
      )}

      {/* ── 2·3. 도움 체감도 / 전략 사용 비중 — 제목은 카드 기본값을 쓴다 ──
          체감도가 먼저다 (2026-08-26 UAT 1-8). 세 보고서 화면이 같은
          순서를 쓰지 않으면 사용자는 화면마다 다른 것을 먼저 읽게 된다. */}
      <HelpfulnessCard stats={stats} />
      <StrategyFrequencyCard stats={stats} />

      {/* ── 4·5. 도움이 된 이유 / 잘 모르겠던 이유 ──
          "어려웠던"이 아니라 "잘 모르겠던"인 이유는 평가 화면의 선택지가
          '도움이 되었어요' / '잘 모르겠어요'이기 때문이다. 화면마다 다른
          말로 부르면 사용자는 자기가 무엇에 답했는지 되짚을 수 없다. */}
      <ReasonTopCard
        title="도움이 된 이유"
        icon="sentiment_satisfied"
        reasons={stats.helpfulReasonsTop3}
        variant="helpful"
        emptyText="아직 도움이 되었다고 답한 기록이 없어요."
      />
      <ReasonTopCard
        title="잘 모르겠던 이유"
        icon="sentiment_dissatisfied"
        reasons={stats.unhelpfulReasonsTop3}
        variant="difficult"
        emptyText="아직 잘 모르겠다고 답한 기록이 없어요."
      />

      {/* ── 6. 영역 요약 + 비교 인사이트 (문구 슬롯) ── */}
      <ReportCard className="border-l-4 border-l-diary-primary">
        <p className="text-[12px] leading-[21px] text-diary-on-surface font-body">
          {narrative.summary}
        </p>
        {comparison && (
          <p className="text-[12px] leading-[21px] text-diary-on-surface-variant font-body pt-2 border-t border-diary-outline-variant/40">
            {comparison}
          </p>
        )}
      </ReportCard>

      {/* ── 7. 작은 실천 제안 (문구 슬롯) ── */}
      {narrative.practice && (
        <ReportCard title="작은 실천 제안" icon="lightbulb" tone="accent">
          <p className="text-[12px] leading-[21px] text-diary-on-surface-variant font-body">
            {narrative.practice}
          </p>
        </ReportCard>
      )}

      {/* ── 맺음말 · 인용 ── */}
      <ReportCard tone="muted">
        <p className="text-[12px] leading-[21px] text-diary-on-surface-variant font-body">
          {diary.closing}
        </p>
        <p className="text-[12px] leading-[20px] text-diary-primary font-body font-bold italic pt-2 border-t border-diary-outline-variant/40">
          “{diary.quote}”
        </p>
      </ReportCard>

      {/* ── 하단 액션 ── */}
      <div className="flex flex-col gap-2.5 pt-1">
        {!summary.isComplete && (
          <Button
            variant="primary"
            onClick={onGoScenario}
            icon="arrow_forward"
            className="w-full py-3.5 font-bold rounded-control"
          >
            다음 에피소드로
          </Button>
        )}
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
