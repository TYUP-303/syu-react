// src/components/report/ReasonTopCard.tsx
// 축 B — 요인 Top3 (시안 02·06 "도움이 되었던 이유 / 어려웠던 이유",
// 08 "TOP 3").
//
// 노출 제목은 "도움이 된 이유" / "잘 모르겠던 이유"로 통일했다 (2026-08-08).
// 평가 화면의 선택지가 '도움이 되었어요' / '잘 모르겠어요'이므로, 집계
// 화면도 사용자가 실제로 누른 말을 그대로 되돌려 준다.
//
// `EpisodeProgress.selectedReason`의 첫 소비처다.
// 데이터가 없으면 카드를 억지로 채우지 않고 안내 한 줄만 남긴다
// (2026-06-25 확정: Top3는 데이터 부족 시 공란 처리).
//
// ⚠️ "잘 모르겠던 이유"에 error 색을 쓰지 않는다. 시안 08은 빨강 계열로
// 그렸지만 사용자가 고른 응답을 오류처럼 보이게 만들면 안 된다 —
// 중립 서피스에 담고 아이콘만 구분한다.

import type { ReasonStat } from '../../utils/strategyStats';
import ReportCard from './ReportCard';

interface ReasonTopCardProps {
  title: string;
  icon: string;
  reasons: ReasonStat[];
  /** 도움된 이유는 강조 톤, 잘 모르겠던 이유는 중립 톤 */
  variant: 'helpful' | 'difficult';
  /** 기록이 없을 때 보여줄 안내 */
  emptyText?: string;
}

export default function ReasonTopCard({
  title,
  icon,
  reasons,
  variant,
  emptyText = '아직 기록이 충분하지 않아요.',
}: ReasonTopCardProps) {
  const isHelpful = variant === 'helpful';

  return (
    <ReportCard title={title} icon={icon} tone={isHelpful ? 'default' : 'muted'}>
      {reasons.length === 0 ? (
        <p className="text-[12px] text-diary-outline font-body">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {reasons.map((item, idx) => {
            // 2026-08-27 UAT R2-13 — "도움이 된 이유를 파랑 계열로 좀 더 강조".
            // 세 항목이 모두 같은 중립 서피스(surface-low)라 순위가 배지
            // 숫자에만 담겨 있었다. 도움 톤에서는 항목 면을 primary 틴트로
            // 올리고, 1위만 틴트 한 단계 + 보더 + 굵기로 더 세운다.
            // 강조는 면과 테두리로만 준다 — 본문 글자색은 on-surface
            // 그대로라 가독성(11.7:1)이 떨어지지 않는다.
            // ⚠️ 'difficult'(잘 모르겠던 이유)는 손대지 않는다. 사용자가 고른
            // 응답을 강조·경고처럼 그리지 않는다는 이 파일 머리의 규칙이다.
            const isTop = isHelpful && idx === 0;
            const rowClass = !isHelpful
              ? 'bg-diary-surface-low border border-transparent'
              : isTop
                ? 'bg-diary-primary/20 border border-diary-primary/40'
                : 'bg-diary-primary/10 border border-diary-primary/15';
            return (
              <li
                key={item.reason}
                className={`flex items-start gap-2.5 rounded-control px-3 py-2 ${rowClass}`}
              >
                <span
                  className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isHelpful
                      ? 'bg-diary-primary text-diary-on-primary'
                      : 'bg-diary-outline-variant text-diary-on-surface'
                  }`}
                >
                  {idx + 1}
                </span>
                <span
                  className={`flex-1 text-[12px] leading-[19px] text-diary-on-surface font-body ${
                    isTop ? 'font-bold' : ''
                  }`}
                >
                  {item.reason}
                </span>
                <span
                  className={`text-[11px] font-bold font-body shrink-0 ${
                    isHelpful ? 'text-diary-primary' : 'text-diary-outline'
                  }`}
                >
                  {item.count}회
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </ReportCard>
  );
}
