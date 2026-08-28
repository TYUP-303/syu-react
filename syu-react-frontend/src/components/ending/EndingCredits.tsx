// src/components/ending/EndingCredits.tsx
// 마지막 챕터의 크레딧 조판.
//
// 라벨 + 여러 줄 구조라 일반 문단과 위계가 다르다. 라벨은 작고 흐리게,
// 내용은 그보다 진하게 두어 스캔이 되도록 했다.
// 마무리 인사("오늘도 정말 수고하셨습니다")는 챕터 제목이 맡는다 — 크레딧보다
// 앞에 두자는 황현 선생님 검토 의견을 그대로 반영한 순서다.

import {
  ENDING_CREDIT_SECTIONS,
  ENDING_FAREWELL,
  ENDING_THANKS,
} from '../../constants/endingScript';

export default function EndingCredits() {
  return (
    <div className="flex flex-col items-center gap-7 mt-2">
      {ENDING_CREDIT_SECTIONS.map((section) => (
        <div key={section.label} className="flex flex-col items-center gap-1.5">
          <p className="text-[12px] font-bold tracking-[0.18em] text-inverse-on-surface/55 font-label">
            {section.label}
          </p>
          {section.lines.map((line) => (
            <p key={line} className="text-[14px] text-inverse-on-surface/85 font-body leading-relaxed">
              {line}
            </p>
          ))}
        </div>
      ))}

      <div className="w-12 h-px bg-inverse-on-surface/30" />

      <p className="text-[14px] font-bold text-inverse-on-surface font-body leading-[1.9] whitespace-pre-line">
        {ENDING_THANKS}
      </p>

      <p className="text-[16.5px] font-semibold text-inverse-on-surface font-headline leading-[1.9] whitespace-pre-line">
        {ENDING_FAREWELL}
      </p>
    </div>
  );
}
