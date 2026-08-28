// src/utils/optionLabel.ts
// 검사 선택지 라벨의 "표시용" 정규화 유틸.
//
// 라벨 원문은 CSV의 options 컬럼에서 오고, 그 CSV는 Firestore의
// questions/{adhd|stress}.csvText가 로컬 파일보다 우선한다. 그래서 표기 문제는
// CSV를 고쳐서 풀지 않고 렌더링 시점에 변환한다 — 그래야 DB에 이미 올라간
// 콘텐츠에도 같은 규칙이 적용된다.
//
// 채점·저장은 선택지 "인덱스"만 쓰므로(useTestStore.selectAnswer는
// optionIndex: number를 받는다) 여기서 문자열을 바꿔도 점수에 영향이 없다.

/**
 * 여는 괄호 앞에 공백 한 칸을 보장한다.
 *   "거의 없음(한 달에 한 번 이하)" → "거의 없음 (한 달에 한 번 이하)"
 *
 * 이미 공백이 있으면 늘리지 않고 한 칸으로 정규화한다. 앞에 글자가 없는
 * 괄호(문자열 맨 앞, 또는 공백 뒤 첫 글자가 괄호)는 건드리지 않는다 —
 * 선행 공백이 생기면 가운데 정렬·truncate가 어긋난다.
 */
export function spaceBeforeParen(label: string): string {
  return label.replace(/(\S)[ \t]*\(/g, '$1 (');
}

/**
 * 첫 여는 괄호를 기준으로 라벨을 두 줄로 쪼갠다.
 *   "매우 자주(거의 매일)" → ["매우 자주", "(거의 매일)"]
 *   "전혀 없음"            → ["전혀 없음"]
 *
 * 폭이 좁은 자리(점수 바 양끝 미니 라벨, max-w-[70px])에서 괄호가 아무 데서나
 * 꺾이는 것을 막는 용도다. 괄호가 없거나 라벨이 괄호로 시작하면 쪼개지 않고
 * 원문 한 줄을 그대로 돌려준다.
 */
export function splitLabelAtParen(label: string): string[] {
  const idx = label.indexOf('(');
  if (idx <= 0) return [label];

  const head = label.slice(0, idx).trimEnd();
  if (!head) return [label];

  return [head, label.slice(idx)];
}
