// src/constants/reasonPalette.ts
// 도움·비도움 요인 팔레트 16개와 **전략별 적합성 태그**의 단일 출처.
//
// 문구의 정본은 여전히 CSV다(scenario_angels.csv의 HELPFUL_1~3 · UNHELPFUL_1~3,
// 프로덕션은 Firestore `scenarios/angels`). 여기 있는 16개는 그 CSV에 실제로
// 등장하는 문자열을 **글자 그대로** 옮긴 사본이며, 설계 근거는
// docs/qa/2026-08-26-reason-palette.md다. 이 파일이 새로 더하는 것은 문구가
// 아니라 "이 요인이 어느 전략을 고른 사람에게 말이 되는가"라는 태그뿐이다.
//
// ── 왜 태그가 필요한가 (2026-08-27 2차 UAT R2-22) ──
//
// 편별 3+3은 "어떤 요정을 골랐든 자기 경험에 맞는 칸이 하나는 있게" 감정·관점·
// 행동 계열에서 하나씩 뽑아 배정한 것이라, 뒤집으면 **고른 요정과 무관한 칸이
// 둘은 남는다**. 취업준비6에서 아코(수용 — 지금 감정을 알아차리기)를 고르고
// "잘 모르겠어요"를 누르면 '상대에겐 통하지 않음'이 떴는데, 수용 조언은 상대에게
// 하는 것이 아무것도 없어 무엇을 답해도 거짓이 된다.
//
// 그래서 화면에 내놓기 직전 `reasonsForStrategy`가 걸러 내고, 빈 자리는 같은
// 종류(도움/비도움)의 전역 팔레트에서 그 전략에 맞는 문구로 채운다.
//
// ⚠️ CSV·Firestore는 건드리지 않는다. 편별 배정은 그대로 두고 **표시만** 거른다.
// 저장·집계에 쓰이는 값은 여기 문구 그대로이므로(utils/strategyStats의
// topReasons가 문자열 빈도를 센다), 보충으로 들어온 전역 문구도 편별 문구와
// 똑같이 집계된다 — 집계 쪽은 손댈 것이 없다.
//
// ⚠️ 문구를 고칠 일이 생기면 CSV와 이 파일을 **함께** 고쳐야 한다. 한쪽만 고치면
// 그 문구는 태그를 잃고 아래 "미등록 문구" 규칙에 따라 무조건 통과한다 —
// 조용히 필터가 꺼지는 것이지 화면이 깨지지는 않는다.

import type { StrategyKey } from './strategy';

export type ReasonKind = 'helpful' | 'unhelpful';

export interface ReasonEntry {
  /** CSV에 등장하는 문구 그대로. 매칭 키이자 저장·집계되는 값이다. */
  text: string;
  /** 이 요인이 말이 되는 전략들. 비어 있을 수 없다. */
  strategies: readonly StrategyKey[];
}

/** 한 화면에 세우는 선택지 수. 편별 배정도, 보충 후 결과도 이 값이다. */
export const REASONS_PER_EPISODE = 3;

const ALL_STRATEGIES: readonly StrategyKey[] = ['accept', 'reappraisal', 'refocus'] as const;

/**
 * 도움이 되었어요 — 8개.
 *
 * 태그 판단의 축은 "그 전략의 조언이 실제로 만들어 낼 수 있는 변화인가"다.
 * 애매하면 셋 다 붙였다 — 맞는 것을 잘못 걸러 내는 쪽이 안 맞는 것을 남기는
 * 쪽보다 나쁘기 때문이다(보충할 문구가 모자라면 3개를 못 채운다).
 */
export const HELPFUL_REASON_PALETTE: readonly ReasonEntry[] = [
  // 각성 완화는 세 전략의 공통 목적지다 — 받아들여서, 달리 봐서, 주의를 옮겨서.
  { text: '감정을 편안하게 해줌', strategies: ALL_STRATEGIES },
  // 수용의 정의 그 자체. 재평가·재초점은 감정에 이름을 붙이라고 하지 않는다.
  { text: '지금 감정을 알아차림', strategies: ['accept'] },
  // 수용(내 상태를 그대로 둬도 된다) · 재평가(자책적 해석에 다른 설명이 붙는다)
  // 양쪽이 낸다. 재초점은 주의를 옮길 뿐 자기 평가를 다루지 않는다.
  { text: '나를 덜 탓하게 됨', strategies: ['accept', 'reappraisal'] },
  // 재평가의 정의 그 자체.
  { text: '상황을 달리 보게 됨', strategies: ['reappraisal'] },
  // 부담의 '크기'는 주관값이라 세 전략 모두 줄일 수 있다(받아들여서 / 달리 봐서 /
  // 할 일을 한 개로 좁혀서). 애매해서 셋 다 둔 자리다.
  { text: '부담이 작게 느껴짐', strategies: ALL_STRATEGIES },
  // 재해석의 대상이 사람인 경우 = 재평가. 수용도 재초점도 상대를 다루지 않는다.
  { text: '상대 입장이 이해됨', strategies: ['reappraisal'] },
  // 첫 행동을 정하는 것은 재초점의 몫이다.
  { text: '무엇부터 할지 분명해짐', strategies: ['refocus'] },
  { text: '시작해 볼 마음이 생김', strategies: ['refocus'] },
];

/**
 * 잘 모르겠어요 — 8개.
 *
 * 비도움 쪽은 "어긋난 지점의 종류"라 대부분 세 전략 모두에 성립한다. 조언이
 * 무엇이든 상황에 안 맞을 수 있고, 공감을 건너뛸 수 있고, 이미 아는 말일 수
 * 있다. 전략을 가리는 것은 **상대를 전제하는 불만** 하나뿐이다.
 */
export const UNHELPFUL_REASON_PALETTE: readonly ReasonEntry[] = [
  { text: '상황에 맞지 않음', strategies: ALL_STRATEGIES },
  { text: '공감되지 않음', strategies: ALL_STRATEGIES },
  { text: '마음이 편해지지 않음', strategies: ALL_STRATEGIES },
  { text: '너무 이상적임', strategies: ALL_STRATEGIES },
  { text: '이미 알던 이야기임', strategies: ALL_STRATEGIES },
  // 수용에도 "알아차리라는데 어떻게 하라는 건지 모르겠다"가 성립한다 — 애매해서
  // 셋 다 둔 자리다.
  { text: '어떻게 할지 막막함', strategies: ALL_STRATEGIES },
  { text: '문제는 그대로 남음', strategies: ALL_STRATEGIES },
  // 수용 조언에는 상대에게 하는 것이 없다. R2-22가 잡힌 자리가 정확히 여기다.
  { text: '상대에겐 통하지 않음', strategies: ['reappraisal', 'refocus'] },
];

export const REASON_PALETTE: Record<ReasonKind, readonly ReasonEntry[]> = {
  helpful: HELPFUL_REASON_PALETTE,
  unhelpful: UNHELPFUL_REASON_PALETTE,
};

/** 문구 → 태그. 팔레트가 상수라 모듈 로드 시 한 번만 만든다. */
const TAG_INDEX: Record<ReasonKind, Map<string, readonly StrategyKey[]>> = {
  helpful: new Map(HELPFUL_REASON_PALETTE.map((entry) => [entry.text, entry.strategies])),
  unhelpful: new Map(UNHELPFUL_REASON_PALETTE.map((entry) => [entry.text, entry.strategies])),
};

/**
 * 이 요인을 이 전략에 내놔도 되는가.
 *
 * **팔레트에 없는 문구는 무조건 통과한다.** 팀이 시트에 새 문구를 적거나 예전
 * 기본값(`DEFAULT_REASONS`의 '새로운 관점을 제시함' 등)이 살아날 때, 태그가
 * 없다는 이유로 선택지가 사라지면 화면이 비어 버린다. 태그는 걸러 낼 근거이지
 * 허용 목록이 아니다.
 */
export function isReasonForStrategy(
  reason: string,
  kind: ReasonKind,
  strategyKey: StrategyKey,
): boolean {
  const strategies = TAG_INDEX[kind].get(reason);
  return !strategies || strategies.includes(strategyKey);
}

/**
 * 편별 요인 목록을 고른 전략에 맞게 거르고, 빈 자리를 전역 팔레트로 채운다.
 *
 * - 태그가 맞는 편별 문구는 **순서 그대로** 앞에 남는다(첫 칸이 그 편에 가장
 *   맞는 요인이라는 배정 원칙을 깨지 않기 위해서다).
 * - 걸러진 만큼은 같은 kind의 전역 팔레트에서 **팔레트 순서대로**, 아직 쓰이지
 *   않은 것만 골라 뒤에 붙인다.
 * - 결과는 항상 3개다. 편이 3개보다 많이 주면(파서는 _5까지 읽는다) 그 개수를
 *   유지한다 — 필터가 목록을 줄이는 일은 없다.
 * - 전역에도 채울 것이 모자라면 있는 만큼만 돌려준다.
 * - `strategyKey`가 없으면(아직 안 골랐거나 전략이 없는 화면) 원본 그대로다.
 */
export function reasonsForStrategy(
  episodeReasons: readonly string[],
  kind: ReasonKind,
  strategyKey: StrategyKey | null | undefined,
): string[] {
  const source = episodeReasons.filter((reason) => reason.trim() !== '');
  if (!strategyKey) return [...source];

  const target = Math.max(REASONS_PER_EPISODE, source.length);
  const used = new Set<string>();
  const kept: string[] = [];

  source.forEach((reason) => {
    // 중복은 여기서도 막는다. 파서가 이미 한 행 안의 중복을 걷어내지만, 이 값은
    // React key이자 Firestore에 저장되는 값이라 방어를 한 겹 더 둔다.
    if (used.has(reason)) return;
    if (!isReasonForStrategy(reason, kind, strategyKey)) return;
    used.add(reason);
    kept.push(reason);
  });

  for (const entry of REASON_PALETTE[kind]) {
    if (kept.length >= target) break;
    if (used.has(entry.text)) continue;
    if (!entry.strategies.includes(strategyKey)) continue;
    used.add(entry.text);
    kept.push(entry.text);
  }

  return kept.slice(0, target);
}
