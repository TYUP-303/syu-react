// src/components/diary/DomainProgressCard.tsx
// 영역 보고서 상단의 에피소드 진행률 (시안 02·06 Section 1).
//
// 분모는 실제 에피소드 수(10)를 쓴다 — 시안의 16/19·3/18은 더미다 (교정 4번).

import type { ThemeProgressSummary } from '../../utils/strategyStats';

interface DomainProgressCardProps {
  summary: ThemeProgressSummary;
}

export default function DomainProgressCard({ summary }: DomainProgressCardProps) {
  const { cleared, total, percent } = summary;

  return (
    <section className="diary-card p-4 space-y-2.5">
      <div className="flex justify-between items-center gap-2">
        <span className="text-[12px] font-bold text-diary-on-surface-variant font-body">
          에피소드 진행률
        </span>
        <span className="text-[13px] font-extrabold text-diary-primary font-headline">
          {percent}%
        </span>
      </div>

      <div className="diary-gauge-track h-3">
        <div
          className="diary-gauge-fill bg-diary-primary-container"
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="text-[12px] text-diary-on-surface font-body text-center">
        <span className="font-bold text-diary-primary">
          {total}개 중 {cleared}개
        </span>
        의 에피소드를 완료했어요.
      </p>
    </section>
  );
}
