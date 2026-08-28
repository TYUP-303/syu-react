// src/components/report/ReportCard.tsx
// 회복일기·보고서 화면군의 공통 카드 셸.
//
// 시안(Warm Professionalism)의 soft-card-shadow 카드를 한 곳에서만
// 정의한다. 색은 index.css의 --color-diary-* 토큰(.diary-card)에서 오고,
// 이 컴포넌트는 여백·제목 슬롯만 책임진다.

import type { ReactNode } from 'react';

export type ReportCardTone = 'default' | 'accent' | 'muted';

interface ReportCardProps {
  /** 카드 제목 (없으면 헤더 행을 그리지 않는다) */
  title?: string;
  /** 제목 왼쪽 Material Symbols 아이콘명 */
  icon?: string;
  /** 제목 오른쪽에 붙는 보조 표시 (퍼센트, 배지 등) */
  trailing?: ReactNode;
  /** 제목 아래 설명 한 줄 */
  description?: string;
  tone?: ReportCardTone;
  className?: string;
  children?: ReactNode;
}

const TONE_CLASS: Record<ReportCardTone, string> = {
  default: 'diary-card',
  // 실천 제안·강조 카드 — 파랑 틴트 (2026-08-27 UAT R2-14로 피치/갈색에서 이동).
  // 색값은 index.css의 --color-diary-accent 하나가 정한다.
  accent: 'rounded-pane border border-diary-accent/40 bg-diary-accent/10',
  // 보조 정보 카드 — 그림자 없이 낮은 서피스
  muted: 'rounded-pane border border-diary-outline-variant/40 bg-diary-surface-low',
};

export default function ReportCard({
  title,
  icon,
  trailing,
  description,
  tone = 'default',
  className = '',
  children,
}: ReportCardProps) {
  return (
    <section className={`p-4 space-y-3 ${TONE_CLASS[tone]} ${className}`}>
      {title && (
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {icon && (
              <span className="material-symbols-outlined text-[18px] text-diary-primary shrink-0">
                {icon}
              </span>
            )}
            <h3 className="text-[15px] font-bold text-diary-on-surface font-headline truncate">
              {title}
            </h3>
          </div>
          {trailing && <div className="shrink-0">{trailing}</div>}
        </div>
      )}
      {description && (
        <p className="text-[12px] leading-[20px] text-diary-on-surface-variant font-body">
          {description}
        </p>
      )}
      {children}
    </section>
  );
}
