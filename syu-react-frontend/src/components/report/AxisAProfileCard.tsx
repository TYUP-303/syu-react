// src/components/report/AxisAProfileCard.tsx
// 축 A(반응 기제) 프로필 블록 — ADHD 환산 점수 + 반응 경향 3종 비율.
//
// ⚠️ 이 블록의 3종은 축 A(인지·정서·행동 **반응**)다. "대처"는 축 B(요정
// 전략) 쪽 낱말이라 여기 쓰면 두 축이 뒤섞인다 — 2026-08-08에 소제목을
// "스트레스 대처 경향" → "스트레스 반응 경향"으로 바로잡았다.
//
// 분리 컴포넌트로 둔 이유: 2026-08-07 PM 확정에서 "최초 보고서에 축 A
// 포함(기본 ON)"이 결정되면서, 끄고 싶어질 때 이 블록만 빼면 되도록
// 요구됐다. 최초 보고서(R2-3)와 종합 인사이트(R2-5)가 함께 쓴다.
//
// 시안 09·11은 "주의 지속력 / 충동 억제 / 활동성 조절" 3종 게이지를
// 그리지만 그건 시안이 만들어 낸 하위 척도이고, 실제 검사에는 없다
// (ADHD는 환산 점수 하나, 3종은 스트레스 반응 기제다). 그래서
// ADHD는 단일 점수로, 3종 막대는 축 A(인지·정서·행동) 비율로 옮겼다.
// 그래프는 조세현 제안대로 가로 게이지 → **세로형**으로 변주했다.
//
// 색은 constants/reactionType.ts의 REACTION_TYPE_META를 그대로 쓴다.
// 한때 이 파일이 축 A 색을 diary 토큰(티얼/피치/그린)으로 따로 매핑했는데,
// 그건 회복일기 스코프가 앱과 다른 라이트 파스텔 팔레트였기 때문이다.
// 그 스코프를 Serene Azure로 되돌리면서 분기 사유가 사라졌으므로 여기서
// 색을 다시 정하지 않는다.
//
// ⚠️ 2026-08-26에 REACTION_TYPE_META가 요정 색 계열(--color-type-*)로
// 바뀌었다(UAT 1-1). 이 카드와 같은 보고서에 실리는 축 B 블록
// (StrategyFrequencyCard)이 이제 같은 색 가족을 쓰므로, **색은 두 축을
// 가르지 못한다.** 구분은 아래 소제목과 라벨이 진다 — 이 블록에 축 B
// 낱말('수용/재평가/재초점', '대처')을 들이지 말 것.

import { COPY } from '../../constants/copy';
import { REACTION_TYPE_KEYS, REACTION_TYPE_META } from '../../constants/reactionType';
import type { ReactionTypeKey } from '../../constants/reactionType';
import { getStressRatios } from '../../utils/testScoring';
import ReportCard from './ReportCard';

interface AxisAProfileCardProps {
  /** ADHD 환산 점수 0~100. 검사 기록이 없으면 null */
  adhdScore: number | null;
  /** 스트레스 영역별 '예' 수. 없으면(레거시·미검사) 3종 막대를 숨긴다 */
  counts: Record<ReactionTypeKey, number> | null;
  /** 우세 유형 라벨 — "인지·정서형" */
  resultTypeLabel: string | null;
  /** ADHD 점수 설명문 — 검사 결과 화면과 같은 검수 템플릿 (buildAdhdScoreNote) */
  scoreNote?: string;
}

/** 0~100 눈금의 눈금선 위치. 사분점만 둔다 — 더 촘촘하면 축 B 막대를 이긴다. */
const SCORE_TICKS = [0, 25, 50, 75, 100];

export default function AxisAProfileCard({
  adhdScore,
  counts,
  resultTypeLabel,
  scoreNote,
}: AxisAProfileCardProps) {
  const ratios = counts ? getStressRatios(counts) : null;

  // 검사 기록이 통째로 없으면 블록 자체를 그리지 않는다 (레거시 폴백).
  if (adhdScore === null && !ratios) return null;

  const clampedScore = adhdScore === null ? 0 : Math.min(Math.max(adhdScore, 0), 100);

  return (
    <ReportCard
      title="주의 및 반응 경향"
      icon="monitoring"
      trailing={
        adhdScore !== null && (
          <div className="flex flex-col items-end leading-tight">
            {/* 단위 표기는 검사 결과 화면과 같은 출처를 쓴다 (2026-08-26 UAT 1-2).
                만점은 아래 눈금(0·50·100)이 이미 말해 주므로 여기서는 생략한다. */}
            <span className="text-[22px] font-extrabold text-diary-primary font-headline">
              {adhdScore}
              <span className="text-[13px] font-bold">{COPY.test.resultAdhdScoreUnit}</span>
            </span>
            <span className="text-[10px] text-diary-outline font-body">전반적 점수</span>
          </div>
        )
      }
    >
      {/* 점수 눈금 게이지 (시안 09) — 숫자만 있던 자리에 "0~100 중 어디쯤"을
          더한다. 62라는 숫자만으로는 척도의 어디인지 읽히지 않았다.
          위계는 축 B 막대보다 낮게 잡는다: 채움 막대가 아니라 얇은 트랙 +
          마커 하나이고, 색도 굵은 면이 아니라 선으로만 쓴다. */}
      {adhdScore !== null && (
        <div className="pt-1 pb-1">
          <div className="relative h-4">
            {/* 트랙 */}
            <div className="absolute inset-x-0 top-1.5 h-1 rounded-full bg-diary-surface-variant" />
            {/* 눈금선 */}
            {SCORE_TICKS.map((tick) => (
              <div
                key={tick}
                aria-hidden
                className="absolute top-0.5 w-px h-3 bg-diary-outline-variant"
                style={{ left: `${tick}%` }}
              />
            ))}
            {/* 현재 점수 마커 — 양 끝에서 잘리지 않게 -translate-x-1/2로 중심 정렬 */}
            <div
              className="absolute top-0 -translate-x-1/2 w-1 h-4 rounded-full bg-diary-primary"
              style={{ left: `${clampedScore}%` }}
              role="img"
              aria-label={`${adhdScore}${COPY.test.resultAdhdScoreUnit} (${COPY.test.resultAdhdScoreMax})`}
            />
          </div>
          <div className="flex justify-between pt-1">
            <span className="text-[10px] text-diary-outline font-body">0</span>
            <span className="text-[10px] text-diary-outline font-body">50</span>
            <span className="text-[10px] text-diary-outline font-body">100</span>
          </div>
        </div>
      )}

      {scoreNote && (
        <p className="text-[12px] leading-[20px] text-diary-on-surface-variant font-body">
          {scoreNote}
        </p>
      )}

      {ratios && (
        <div className="pt-1 space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-bold text-diary-on-surface font-headline">
              스트레스 반응 경향
            </span>
            {resultTypeLabel && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-diary-primary/10 text-diary-primary border border-diary-primary/20">
                {resultTypeLabel}
              </span>
            )}
          </div>

          {/* 세로형 그래프 (조세현 제안) — 가로 게이지 3줄이던 시안의 변주.
              막대 높이는 비율(%)에 비례하고, 0%도 최소 높이를 남겨
              "막대가 사라진 것"과 "0%"가 구분되게 한다.

              막대 끝단은 rounded-t-full이다. 형태 문법(index.css)에서 pane·
              control은 면과 컨트롤의 값이고, **게이지 끝단**은 rounded-full이
              맡는 자리로 명시돼 있다. 이 막대는 카드도 버튼도 아닌 게이지이며,
              같은 파일의 척도 트랙·눈금(위 rounded-full)과 RatioBar·
              AdhdResultCard의 막대 채움도 모두 같은 값을 쓴다. 여기에만 남아
              있던 rounded-t-lg(8px)가 보고서 안에서 혼자 다른 모양이었다. */}
          <div className="flex items-end justify-around gap-3 h-[132px] pt-2">
            {REACTION_TYPE_KEYS.map((key) => {
              const percent = ratios[key];
              const meta = REACTION_TYPE_META[key];
              return (
                <div key={key} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                  <span className={`text-[12px] font-extrabold font-headline ${meta.text}`}>
                    {percent}%
                  </span>
                  <div
                    className={`w-full max-w-[52px] rounded-t-full transition-all duration-700 ${meta.bar}`}
                    style={{ height: `${Math.max(percent, 3)}%` }}
                  />
                  <span className="text-[11px] font-bold text-diary-on-surface-variant font-body">
                    {REACTION_TYPE_META[key].shortLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ReportCard>
  );
}
