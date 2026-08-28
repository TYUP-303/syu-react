// src/components/ui/EmphasizedText.tsx
// 원문을 고치지 않고 일부 구절만 굵게 보여주는 텍스트 렌더러.
//
// 검수를 거친 콘텐츠(스트레스 유형 설명문 등)는 한 글자도 바꿀 수 없으므로,
// 원문에 마크업을 심는 대신 "원문에 그대로 등장하는 부분 문자열" 목록을 받아
// 그 구간만 <strong>으로 감싼다. 구간 계산은 utils/emphasizeText가 한다.
//
// 실패 방향이 중요하다: 구절이 원문에 없거나 원문이 개정되어 어긋나면
// **그 구절만 조용히 평문**으로 그려진다. 던지지 않고, 원문을 잘라먹지도
// 않는다 — 강조를 잃을지언정 문장은 항상 온전히 보인다.

import { splitByPhrases } from '../../utils/emphasizeText';

interface EmphasizedTextProps {
  /** 원문. 절대 가공하지 않는다 */
  text: string;
  /** 원문에 그대로 등장해야 하는 강조 구절 목록 */
  phrases: readonly string[];
  /** 강조 구간에 덧붙일 클래스 (기본은 굵기와 글자색만 올린다) */
  emphasisClassName?: string;
}

export default function EmphasizedText({
  text,
  phrases,
  emphasisClassName = 'font-bold text-on-surface',
}: EmphasizedTextProps) {
  const segments = splitByPhrases(text, phrases);

  return (
    <>
      {segments.map((segment, idx) =>
        segment.emphasized ? (
          <strong key={idx} className={emphasisClassName}>
            {segment.text}
          </strong>
        ) : (
          <span key={idx}>{segment.text}</span>
        ),
      )}
    </>
  );
}
