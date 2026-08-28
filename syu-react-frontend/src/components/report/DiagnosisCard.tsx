// src/components/report/DiagnosisCard.tsx
// 종합 요약 카드 — 보고서 최상단 (김도영 확정, 시안 08의 최상단 카드).
//
// ⚠️ 화면에 노출되는 배지는 '종합 요약'이다. 파일·타입 이름은 시안 명칭을
// 따라 Diagnosis로 남겨 두지만, 사용자에게 "진단"이라는 임상 어휘를 쓰지
// 않는 것이 하드 제약이다 (diaryContent.ts 톤 규칙, 7차 확정).
//
// 두 가지를 한 카드에 담는다:
//   1) 스트레스 검사 8유형의 라벨과 설명문 — **심리학부 검수 문장**이다.
//      STRESS_RESULT_TYPE_DESCRIPTION을 그대로 출력하며 요약·윤문하지
//      않는다. 문장을 바꿔야 하면 검사 콘텐츠 스펙 문서를 먼저 고칠 것.
//   2) 훈련 기록에서 나온 한 줄 요약 (headline) — 생성 문구다.
//
// ⚠️ 하드 제약: 여기에 상담·의료기관 방문 권고를 넣지 않는다(7차 확정).
// "임상 진단이 아니다"라는 안내만 유지한다.

import ReportCard from './ReportCard';

interface DiagnosisCardProps {
  /** 훈련 기록에서 만든 한 줄 요약 */
  headline: string;
  /** 8유형 라벨 — "인지·정서형". 레거시(resultType 없음)면 null */
  resultTypeLabel: string | null;
  /** 8유형 설명문 (검수문 원문). 레거시면 null */
  resultTypeDescription: string | null;
}

export default function DiagnosisCard({
  headline,
  resultTypeLabel,
  resultTypeDescription,
}: DiagnosisCardProps) {
  return (
    <ReportCard className="border-diary-primary/30 bg-diary-surface-low">
      <div className="flex items-center gap-2">
        <span
          className="material-symbols-outlined text-[18px] text-diary-primary"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          auto_awesome
        </span>
        <span className="text-[11px] font-bold tracking-wider text-diary-primary font-headline">
          종합 요약
        </span>
        {resultTypeLabel && (
          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-diary-primary text-diary-on-primary">
            {resultTypeLabel}
          </span>
        )}
      </div>

      <h2 className="text-[16px] font-extrabold leading-[25px] text-diary-on-surface font-headline">
        {headline}
      </h2>

      {resultTypeDescription && (
        <>
          <div className="h-px w-full bg-diary-outline-variant/60" />
          {/* 검수 문장 원문 — 임의 윤문 금지 */}
          <p className="text-[12px] leading-[21px] text-diary-on-surface-variant font-body">
            {resultTypeDescription}
          </p>
        </>
      )}

      {/* 면책 문구 — 2026-08-27 UAT R2-11 "좀 더 연한 글씨".
          이 줄은 위 검수 설명문과 같은 크기로 읽혀 카드의 결론처럼
          보였다. outline 그대로는 #fcfcfa 카드 위에서 5.69:1이라 본문과
          위계가 갈리지 않아, 같은 토큰에 알파만 얹어 3.70:1로 낮춘다.
          ⚠️ 3:1(AA 비텍스트/큰글씨)은 지키되 4.5:1은 넘지 못한다 —
          11px 보조 문구를 눈에 띄게 연하게 만들면서 4.5를 유지할 수 있는
          구간이 없다(α 0.9에서도 4.38이고 그건 육안으로 거의 안 바뀐다).
          보조 안내라 이 절충을 택했고, 문구 자체는 바꾸지 않았다. */}
      <p className="text-[11px] leading-[18px] text-diary-outline/80 font-body pt-1">
        이 결과는 임상 진단이 아니라, 앞으로의 연습 방향을 찾기 위한 참고 자료예요.
      </p>
    </ReportCard>
  );
}
