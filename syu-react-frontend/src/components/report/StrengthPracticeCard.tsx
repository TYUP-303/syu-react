// src/components/report/StrengthPracticeCard.tsx
// "나의 강점과 연습 방향" 슬롯 (시안 09·11 Section 3).
//
// 문구는 api/diaryContent의 buildProfileNarrative가 만든다 — 이 컴포넌트는
// 배치만 책임진다. 문장을 고치려면 diaryContent의 문구 테이블을 볼 것.
//
// 색은 tone="accent"(= --color-diary-accent) 하나로 온다. 2026-08-27 UAT
// R2-14로 그 토큰이 tertiary(갈색)에서 primary-container(파랑)로 옮겨져,
// 이 파일은 고치지 않아도 함께 파랑이 된다 — 여기에 색을 다시 적지 말 것.

import ReportCard from './ReportCard';

interface StrengthPracticeCardProps {
  strength: string;
  practiceDirection: string;
}

export default function StrengthPracticeCard({
  strength,
  practiceDirection,
}: StrengthPracticeCardProps) {
  return (
    <ReportCard title="나의 강점과 연습 방향" icon="lightbulb" tone="accent">
      <div className="space-y-3 text-[12px] leading-[21px] text-diary-on-surface-variant font-body">
        <p>
          <strong className="text-diary-on-surface font-bold">강점: </strong>
          {strength}
        </p>
        <div className="h-px w-full bg-diary-accent/40" />
        <p>
          <strong className="text-diary-on-surface font-bold">연습 방향: </strong>
          {practiceDirection}
        </p>
      </div>
    </ReportCard>
  );
}
