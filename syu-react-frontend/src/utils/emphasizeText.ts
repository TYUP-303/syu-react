// src/utils/emphasizeText.ts
// 원문을 고치지 않고 일부 구절만 강조 구간으로 표시하기 위한 순수 함수.
//
// 검수를 거친 콘텐츠(스트레스 유형 설명문 등)는 한 글자도 바꿀 수 없어서
// 마크다운이나 <strong>을 원문에 심을 수 없다. 대신 "원문에 그대로 등장하는
// 부분 문자열" 목록을 따로 두고, 렌더링 시점에 그 구간만 감싼다.
// 화면 쪽 래퍼는 components/ui/EmphasizedText.
//
// testScoring.ts와 같은 이유로 컴포넌트에서 분리했다 — 실패 방향(원문 보존)이
// 이 서비스의 콘텐츠 규칙이라 UI와 무관하게 단위 테스트로 고정해 둔다.

export interface TextSegment {
  text: string;
  emphasized: boolean;
}

/**
 * text를 phrases 기준으로 강조/비강조 구간으로 쪼갠다.
 *
 * 규칙:
 * - 구절마다 **첫 번째 등장**만 강조한다 (같은 표현이 반복되면 앞의 것).
 * - 원문에 없는 구절은 건너뛴다 — 던지지 않는다.
 * - 이미 강조된 구간과 겹치는 구절은 건너뛴다 (구간이 잘려 원문이 깨지는 것을 막는다).
 * - 이어붙인 결과는 언제나 원본 text와 정확히 같다. 이것이 유일한 불변식이다.
 */
export function splitByPhrases(text: string, phrases: readonly string[]): TextSegment[] {
  const ranges: Array<[number, number]> = [];

  for (const phrase of phrases) {
    if (!phrase) continue;
    const start = text.indexOf(phrase);
    if (start === -1) continue;
    const end = start + phrase.length;
    if (ranges.some(([s, e]) => start < e && end > s)) continue;
    ranges.push([start, end]);
  }

  ranges.sort((a, b) => a[0] - b[0]);

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), emphasized: false });
    segments.push({ text: text.slice(start, end), emphasized: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), emphasized: false });

  return segments;
}
