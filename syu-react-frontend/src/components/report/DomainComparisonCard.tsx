// src/components/report/DomainComparisonCard.tsx
// 영역별 전략 선택 경향 비교 (시안 08 Section 4).
//
// 종합 인사이트에만 등장한다 — 영역 하나를 볼 때는 비교 대상이 없다.
// 기록이 없는 영역은 줄만 남기고 "기록 없음"으로 표시한다. 빼 버리면
// 4영역 중 무엇을 아직 안 했는지가 보이지 않는다.
//
// 영역 표본이 3회 미만이면 비중 %를 접고 "N회 기록"으로 적는다
// (canShowPercent). 1회만 한 영역은 무엇을 골랐어도 "100%"가 되어, 아직
// 경향이라 부를 수 없는 것을 경향처럼 단정한다.
//
// 아이콘과 비중 막대는 영역 고유색(2026-08-27 UAT R2-10b)이다. 막대는 예전에
// '위주 전략'의 색(요정 3색)이었는데, 전략 이름은 옆 문구가 이미 말하므로
// 막대는 "어느 영역의 줄인가"를 색으로 맡는다. 카드의 나머지는 보고서 팔레트.

import type { ThemeCategory } from '../../api/scenarioMockData';
import type { ScenarioProgressMap } from '../../store/useScenarioStore';
import { strategyDisplayName } from '../../api/diaryContent';
import { canShowPercent, computeThemeStats } from '../../utils/strategyStats';
import { themeColorsFor } from '../../constants/themeColors';
import ReportCard from './ReportCard';

interface DomainComparisonCardProps {
  themes: ThemeCategory[];
  progress: ScenarioProgressMap;
}

export default function DomainComparisonCard({ themes, progress }: DomainComparisonCardProps) {
  return (
    <ReportCard
      title="영역별 전략 선택 경향"
      icon="donut_small"
      description="같은 나라도 상황이 바뀌면 손이 가는 전략이 달라져요."
    >
      <div className="space-y-3.5 pt-1">
        {themes.map((theme) => {
          const stats = computeThemeStats(themes, theme.id, progress);
          const dominant = stats.dominant;
          const ratio = dominant ? stats.byStrategy[dominant].ratio : 0;
          const colors = themeColorsFor(theme.id);

          return (
            <div key={theme.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`material-symbols-outlined text-[16px] ${colors.accent} shrink-0`}>
                    {theme.icon}
                  </span>
                  <span className="text-[12px] font-bold text-diary-on-surface font-body truncate">
                    {theme.title}
                  </span>
                </div>
                <span className="text-[11px] text-diary-on-surface-variant font-body shrink-0">
                  {!dominant
                    ? '기록 없음'
                    : canShowPercent(stats.totalCleared)
                      ? `${strategyDisplayName(dominant)} 위주 · ${ratio}%`
                      : `${strategyDisplayName(dominant)} 위주 · ${stats.totalCleared}회 기록`}
                </span>
              </div>
              <div className="diary-gauge-track h-2">
                {dominant && (
                  <div className={`diary-gauge-fill ${colors.accentFill}`} style={{ width: `${ratio}%` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ReportCard>
  );
}
