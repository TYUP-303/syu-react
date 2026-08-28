// src/components/report/HelpfulnessCard.tsx
// 축 B — 전략별 도움 체감률 (시안 02·06 "전략별 도움률", 08 "도움 체감도").
//
// `EpisodeProgress.wasHelpful`의 첫 소비처다. 이 값은 플레이어가 매
// 에피소드 끝에 저장해 왔지만 R2 이전에는 어떤 화면도 읽지 않았다.
//
// 표시 규칙:
//   · 쓴 적 없는 전략은 "0%"가 아니라 "기록 없음"이다.
//     strategyStats가 helpfulRate를 null로 구분해 주므로 여기서 분기한다.
//   · 표본이 3회 미만이면 %를 접는다 (canShowPercent). "1회 중 1회 도움됨
//     (100%)"의 100%는 정밀해 보이지만 아무것도 더 말해 주지 않고, 다음
//     훈련 한 번에 50%로 반토막 난다. 게이지는 그대로 둔다 — 줄이 통째로
//     비면 행이 깨진 것처럼 보이고, 사실은 옆의 횟수 표기가 말해 준다.
//
// 2026-08-26 (UAT 접수 1-8 "결과 페이지에서 도움 체감도를 좀 더 크게"):
// 전체 체감률이 제목 오른쪽 13px 보조 표시였다 — 이 카드에서 가장 먼저
// 읽혀야 할 수치가 제목보다 작았다. 라벨 위 · 큰 숫자 · 보조 문구 아래의
// stat tile로 올리고, 제목 오른쪽 표시는 중복이라 걷어냈다.
// 소표본 규칙은 그대로다: 크게 보여주는 것과 없는 정밀도를 지어내는 것은
// 다른 일이라 3회 미만이면 큰 숫자 자리도 "2회 중 1회"가 된다.

import { STRATEGY_KEYS, STRATEGY_META } from '../../constants/strategy';
import { strategyDisplayName } from '../../api/diaryContent';
import { canShowPercent, type StrategyStats } from '../../utils/strategyStats';
import ReportCard from './ReportCard';

interface HelpfulnessCardProps {
  stats: StrategyStats;
  title?: string;
}

export default function HelpfulnessCard({
  stats,
  title = '전략별 도움 체감도',
}: HelpfulnessCardProps) {
  if (stats.totalCleared === 0) return null;

  const showOverallPercent = canShowPercent(stats.totalCleared);

  return (
    <ReportCard
      title={title}
      icon="thumb_up"
      description="사용 횟수 대비 실제로 도움이 되었다고 답한 비율이에요."
    >
      {/* 전체 체감률 stat tile — 이 카드의 결론이다 (UAT 1-8). */}
      {stats.helpfulRate !== null && (
        <div className="rounded-control bg-diary-surface-low px-4 py-4 flex flex-col items-center gap-1.5 text-center">
          <span className="text-[11px] text-diary-on-surface-variant font-body">
            전체 도움 체감도
          </span>
          {showOverallPercent ? (
            <>
              <span className="text-[36px] leading-none font-extrabold text-diary-primary font-headline">
                {`${stats.helpfulRate}%`}
              </span>
              <span className="text-[11px] text-diary-on-surface-variant font-body">
                {`${stats.totalCleared}회 중 ${stats.helpfulCount}회 도움됨`}
              </span>
            </>
          ) : (
            // 소표본 — %를 접고 횟수 자체를 큰 숫자 자리에 둔다.
            <span className="text-[32px] leading-none font-extrabold text-diary-primary font-headline">
              {`${stats.totalCleared}회 중 ${stats.helpfulCount}회`}
            </span>
          )}
        </div>
      )}

      <div className="space-y-3.5 pt-1">
        {STRATEGY_KEYS.map((key) => {
          const meta = STRATEGY_META[key];
          const stat = stats.byStrategy[key];
          const used = stat.count > 0;
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex justify-between items-baseline gap-2">
                <span className={`text-[12px] font-bold ${meta.text}`}>
                  {strategyDisplayName(key)}
                </span>
                <span className="text-[11px] text-diary-on-surface-variant font-body">
                  {!used
                    ? '아직 기록 없음'
                    : canShowPercent(stat.count)
                      ? `${stat.count}회 중 ${stat.helpfulCount}회 도움됨 (${stat.helpfulRate}%)`
                      : `${stat.count}회 중 ${stat.helpfulCount}회 도움됨`}
                </span>
              </div>
              <div className="diary-gauge-track h-3.5">
                {used && (
                  <div
                    className={`diary-gauge-fill ${meta.bar}`}
                    style={{ width: `${stat.helpfulRate}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ReportCard>
  );
}
