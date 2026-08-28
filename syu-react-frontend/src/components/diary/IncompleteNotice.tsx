// src/components/diary/IncompleteNotice.tsx
// 미완주 열람 안내 (시안 05의 Info Notice 자리).
//
// 2026-08-07 PM 확정 "진행 중 열람 완화"의 필수 짝이다. 완주 전에도
// 기록을 열 수 있게 한 대신, **완주 전 데이터가 유형 산출에 반영되지
// 않는다**는 v0.2.0 원칙을 화면에서 명시한다. 이 문구 없이 열람만
// 열어 주면 사용자는 중간 집계를 확정 결과로 오해한다.

import { COPY } from '../../constants/copy';

interface IncompleteNoticeProps {
  cleared: number;
  total: number;
}

export default function IncompleteNotice({ cleared, total }: IncompleteNoticeProps) {
  return (
    <section className="rounded-pane p-4 bg-diary-surface-container border border-diary-outline-variant/60 flex gap-3">
      <span className="material-symbols-outlined text-[20px] text-diary-primary shrink-0">
        info
      </span>
      <div className="space-y-1 min-w-0">
        <h4 className="text-[12px] font-bold text-diary-on-surface font-headline">
          {COPY.diary.incompleteNoticeTitle}
        </h4>
        <p className="text-[11px] leading-[18px] text-diary-on-surface-variant font-body whitespace-pre-line">
          {COPY.diary.incompleteNoticeBody(cleared, total)}
        </p>
      </div>
    </section>
  );
}
