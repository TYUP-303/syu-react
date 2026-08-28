// src/components/diary/RecentSessionView.tsx
// "이번 훈련 기록" (시안 05) — 가장 최근에 훈련한 영역의 중간 요약.
//
// 시안에서는 플레이 직후 바로 뜨는 화면이지만, 플레이어 직후 플로우는
// S 패키지 소유(CompletePanel 등)라 불가침이다. 그래서 회복일기 탭 안의
// **최근 세션 기록 뷰**로 옮겼다 — 사용자는 일기 홈에서 언제든 다시
// 열어 볼 수 있고, 플레이어 쪽은 한 줄도 건드리지 않는다.

import type { ThemeCategory } from '../../api/scenarioMockData';
import type { ScenarioProgressMap } from '../../store/useScenarioStore';
import { computeThemeStats, summarizeThemeProgress } from '../../utils/strategyStats';
import Button from '../ui/Button';
import HelpfulnessCard from '../report/HelpfulnessCard';
import StrategyFrequencyCard from '../report/StrategyFrequencyCard';
import DiaryStickyHeader from './DiaryStickyHeader';
import DomainProgressCard from './DomainProgressCard';
import IncompleteNotice from './IncompleteNotice';

interface RecentSessionViewProps {
  themes: ThemeCategory[];
  progress: ScenarioProgressMap;
  /** 가장 최근에 훈련한 영역 id */
  themeId: string;
  onBack: () => void;
  onGoScenario: () => void;
}

export default function RecentSessionView({
  themes,
  progress,
  themeId,
  onBack,
  onGoScenario,
}: RecentSessionViewProps) {
  const theme = themes.find((t) => t.id === themeId);

  if (!theme) {
    return (
      <div className="w-full flex flex-col items-center justify-center gap-4 py-16 text-center">
        <span className="material-symbols-outlined text-[48px] text-outline">history</span>
        <p className="text-[14px] text-outline font-body">아직 훈련 기록이 없어요.</p>
        <Button variant="outline" onClick={onBack}>목록으로</Button>
      </div>
    );
  }

  const summary = summarizeThemeProgress(theme, progress);
  const stats = computeThemeStats(themes, themeId, progress);
  const remaining = Math.max(summary.total - summary.cleared, 0);

  return (
    <div className="diary-scope w-full flex flex-col gap-4 p-4 rounded-pane animate-fadeIn">
      {/* ── 헤더 — 스크롤러 상단에 고정 ──
          sticky 플러시·페이드 엣지 패턴과 제목 x좌표(1뎁스와 동일)는
          DiaryStickyHeader가 소유한다. */}
      <DiaryStickyHeader
        title="이번 훈련 기록"
        description={`가장 최근에 훈련한 ${theme.title} 영역의 중간 요약이에요.`}
        onBack={onBack}
      />

      <DomainProgressCard summary={summary} />

      {!summary.isComplete && (
        <IncompleteNotice cleared={summary.cleared} total={summary.total} />
      )}

      <StrategyFrequencyCard stats={stats} />
      <HelpfulnessCard stats={stats} />

      <div className="flex flex-col gap-2.5 pt-1">
        <Button
          variant="primary"
          onClick={onGoScenario}
          icon="arrow_forward"
          className="w-full py-3.5 font-bold rounded-control"
        >
          {remaining > 0 ? '이어서 훈련하기' : '시나리오 목록으로'}
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
