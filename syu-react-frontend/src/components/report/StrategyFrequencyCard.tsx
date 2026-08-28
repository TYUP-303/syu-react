// src/components/report/StrategyFrequencyCard.tsx
// 축 B — 요정(전략) 선택 빈도.
//
// 시안 02·06의 "가장 많이 사용한 전략" 벤토 구성(최다 1장 + 나머지 2장)을
// 옮겼다. 표기는 요정명 우선 — "포코(재평가)" (교정 5번, 영문 병기 제거).
//
// 색은 constants/strategy의 STRATEGY_META만 쓴다. 라이트 파스텔 스코프
// 안이라도 전략 색은 바꾸지 않는다 — 플레이 중 학습한 "전략 = 요정 색"
// 연결이 보고서에서 끊기면 안 되기 때문이다(strategy.ts 주석 참조).

// 전체 표본이 3회 미만이면 비중 %를 접는다 (canShowPercent). 회차 수가
// 곧 비중인 구간이라 "1회 · 100%"는 같은 말을 두 번 하면서 정밀해 보이는
// 인상만 얹는다 — 횟수만 남긴다.

import { STRATEGY_KEYS, STRATEGY_META, type StrategyKey } from '../../constants/strategy';
import { strategyDisplayName } from '../../api/diaryContent';
import { objectParticle } from '../../utils/koreanParticle';
import { canShowPercent, type StrategyStats } from '../../utils/strategyStats';
import ReportCard from './ReportCard';

interface StrategyFrequencyCardProps {
  stats: StrategyStats;
  title?: string;
  /** 최다 요정 문구 (없으면 기본 문장) */
  caption?: string;
}

export default function StrategyFrequencyCard({
  stats,
  // 같은 카드가 화면마다 다른 제목("가장 많이 사용한 전략"·"전략 사용 비중"·
  // "가장 많이 선택한 요정")으로 불려 서로 다른 카드처럼 보였다. 기본값
  // 하나로 통일하고 호출부는 제목을 넘기지 않는다.
  title = '전략 사용 비중',
  caption,
}: StrategyFrequencyCardProps) {
  const { dominant, byStrategy, totalCleared } = stats;

  if (!dominant) {
    return (
      <ReportCard
        title={title}
        icon="insights"
        description="아직 완료한 에피소드가 없어 선택 기록을 보여드릴 수 없어요."
      />
    );
  }

  const others = STRATEGY_KEYS.filter((key): key is StrategyKey => key !== dominant);
  const dominantMeta = STRATEGY_META[dominant];
  const showPercent = canShowPercent(totalCleared);

  return (
    <ReportCard title={title} icon="insights">
      {/* 최다 선택 — 한 장 크게.
          2026-08-27 UAT R2-12: 이 타일의 틀·라벨·숫자는 최빈 요정의 색
          (STRATEGY_META)을 따랐다. 그래서 포코가 최다인 사용자에게는
          보고서에서 가장 큰 면이 갈색(tertiary)으로 칠해졌고 "갈색 카드"
          지적의 진원지가 됐다. 색을 보고서의 강조색(primary)으로 고정한다.

          ⚠️ "전략 = 요정 색" 계약(constants/strategy)은 깨지지 않는다.
          이 타일이 색으로 말하던 것은 요정이 아니라 **틀 자체**였고
          (요정 이름은 원래도 on-surface 중립색이다), 요정 색은 바로 아래
          두 타일의 이름·게이지와 체감도 카드가 그대로 지고 있다. 대신
          최빈 요정이 누구든 이 타일의 생김새가 같아져, 보고서를 서로
          비교할 때 색이 "누가 최다인가"로 오독되지 않는다. */}
      <div
        className="rounded-pane p-4 border border-diary-primary/30 bg-diary-primary/10 flex items-center justify-between gap-3"
      >
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-diary-primary">가장 빈번한 선택</p>
          <p className="text-[17px] font-extrabold text-diary-on-surface font-headline truncate">
            {strategyDisplayName(dominant)}
          </p>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="text-[22px] font-extrabold font-headline text-diary-primary">
            {byStrategy[dominant].count}회
          </span>
          {showPercent && (
            <span className="text-[10px] text-diary-outline font-body">
              {byStrategy[dominant].ratio}%
            </span>
          )}
        </div>
      </div>

      {/* 나머지 두 요정 */}
      <div className="grid grid-cols-2 gap-3">
        {others.map((key) => {
          const meta = STRATEGY_META[key];
          const stat = byStrategy[key];
          return (
            <div
              key={key}
              className="rounded-pane p-3 bg-diary-surface-low border border-diary-outline-variant/40 text-center space-y-1"
            >
              <p className={`text-[11px] font-bold ${meta.text}`}>{strategyDisplayName(key)}</p>
              <p className="text-[17px] font-extrabold text-diary-on-surface font-headline">
                {stat.count}회
              </p>
              <div className="diary-gauge-track h-1.5">
                <div className={`diary-gauge-fill ${meta.bar}`} style={{ width: `${stat.ratio}%` }} />
              </div>
              {showPercent && (
                <span className="text-[10px] text-diary-outline font-body block">
                  {stat.ratio}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[12px] text-diary-on-surface-variant font-body text-center leading-[20px]">
        {caption ?? (
          <>
            총 {totalCleared}회 중{' '}
            <span className="font-bold text-diary-primary">{strategyDisplayName(dominant)}</span>
            {objectParticle(dominantMeta.fairyName)} 가장 자주 선택했어요.
          </>
        )}
      </p>
    </ReportCard>
  );
}
