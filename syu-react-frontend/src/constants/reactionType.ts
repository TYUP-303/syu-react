// src/constants/reactionType.ts
// 스트레스 반응 기제 3종(축 A)의 단일 출처 — 검사와 시나리오 분기를 잇는 공유 계약.
//
// 이 서비스에는 3종 세트가 두 벌 있다:
//   축 A (반응 기제): 인지 / 정서 / 행동 — 스트레스 검사 12문항의 part이자
//     시나리오 CSV의 REACTION_TYPE. "스트레스에 어떻게 반응하는가"(문제 축).
//   축 B (대처 전략): 수용 / 재평가 / 재초점 — constants/strategy.ts.
//     시나리오 플레이 중 요정 선택. "어떻게 대처할까"(처방 축).
// 두 축은 합칠 수 없는 별개 개념이다. 검사의 우세 기제(축 A)가 어떤 버전의
// 시나리오를 보여줄지 결정하고, 그 안에서 사용자가 전략(축 B)을 연습한다.
//
// 키는 Firestore `users/{uid}.stressResult.counts`의 키로 저장되는 도메인 값이며,
// 한글 라벨은 문항 CSV의 part 열·시나리오 CSV의 REACTION_TYPE 열과 문자 단위로
// 일치해야 한다. 어드민(syu-react-admin)의 라벨 매핑과도 미러 관계다.
// 계약 전문: docs/superpowers/plans/2026-08-06-axis-master.md
//
// UI 메타(우세형 명칭·색상 토큰·설명문)는 아래 REACTION_TYPE_META /
// STRESS_RESULT_TYPE_DESCRIPTION에 있다 — strategy.ts의 STRATEGY_META 패턴.

export type ReactionTypeKey = 'cognitive' | 'emotional' | 'behavioral';

/** 표시 순서이자 동점 시 우선순위 (앞선 키가 이긴다). */
export const REACTION_TYPE_KEYS: readonly ReactionTypeKey[] = [
  'cognitive',
  'emotional',
  'behavioral',
] as const;

/** CSV(문항 part, 시나리오 REACTION_TYPE)에서 쓰는 한글 라벨. */
export const REACTION_TYPE_CSV_LABEL: Record<ReactionTypeKey, string> = {
  cognitive: '인지',
  emotional: '정서',
  behavioral: '행동',
};

/** '인지' 같은 CSV 라벨을 도메인 키로 변환. 모르는 값이면 null. */
export function reactionKeyFromCsvLabel(label: string): ReactionTypeKey | null {
  const trimmed = label.trim();
  return REACTION_TYPE_KEYS.find((key) => REACTION_TYPE_CSV_LABEL[key] === trimmed) ?? null;
}

// ── UI 메타 (STRATEGY_META 패턴) ──

export interface ReactionTypeMeta {
  /** 차트 축약 라벨 — "인지" (CSV 라벨과 같은 문자열이지만 용도가 다르다) */
  shortLabel: string;
  /** 텍스트 색 */
  text: string;
  /** 비율 막대 등 솔리드 배경 */
  bar: string;
  /** 카드 배경 틴트 */
  bg: string;
  /** 카드 테두리 */
  border: string;
}

/**
 * 축 A(반응 기제) 3종의 표시 색 — 2026-08-26에 요정 색 계열로 교체했다.
 *
 * 이전 배정은 인지=secondary(슬레이트) / 정서=error(레드) / 행동=inverse-surface
 * (차콜)였다. 축 B 요정색(primary/tertiary/success)과 겹치지 않게 하려고 팔레트에
 * "남은 토큰"만 골라 쓴 것인데, 사용자에게는 검사 결과 화면이 회색·빨강으로 보여
 * 앱의 다른 화면과 따로 노는 인상이 됐다 — UAT 1-1 "검사 결과 색을 요정 색으로
 * 통일"(여명이 접수, 8/12 채택, docs/qa/2026-08-12-uat-remaining-issues.md).
 * 그때는 "노랑이(포코)의 tertiary가 실제로는 적갈색이라 노랑 토큰 신설 없이는
 * 불가"로 보류됐고, 이번에 축 A 전용 토큰 3종을 신설해 이행한다
 * (index.css의 --color-type-{cognitive,emotional,behavioral} — 요정 이미지
 * 실측 hue를 유지한 채 명도만 내려 본문 AA 4.5:1을 넘긴 값이고, 대비 실측치는
 * 그 토큰 블록의 주석에 적어 두었다).
 *
 * ⚠️ 반응 기제(축 A)와 전략 요정(축 B)의 **개념적 대응은 존재하지 않는다.**
 * 축 A는 "스트레스에 어떻게 반응하는가"(문제), 축 B는 "어떻게 대처할까"(처방)라
 * 서로 짝지을 수 있는 관계가 아니고, 코드·기획 문서 어디에도 대응표가 없다.
 * 아래 색 짝은 UAT 접수의 의도("보고서 축과 요정 축을 같은 색 언어로")만 따른
 * **2026-08-26 임시 배정**이며 명시 근거가 없다:
 *   인지 ↔ 파랑이(아코) · 정서 ↔ 노랑이(포코) · 행동 ↔ 초록이(리프)
 * 두 축의 표시 순서(인지/정서/행동, 수용/재평가/재초점)를 그대로 겹친 것뿐이다.
 * 기획에서 다른 대응이 확정되면 아래 세 줄의 토큰 이름만 바꿔 끼우면 된다.
 *
 * ⚠️ 그 결과 2축 보고서(report/AxisAProfileCard ↔ StrategyFrequencyCard)에서
 * 두 축이 같은 색 가족으로 그려진다. 색이 축을 가르지 못하므로 **제목과 라벨이
 * 구분을 책임진다** — 축 A 블록에서 '수용/재평가/재초점' 같은 축 B 낱말을,
 * 축 B 블록에서 '인지/정서/행동'을 쓰지 말 것.
 */
export const REACTION_TYPE_META: Record<ReactionTypeKey, ReactionTypeMeta> = {
  cognitive: {
    shortLabel: '인지',
    text: 'text-type-cognitive',
    bar: 'bg-type-cognitive',
    bg: 'bg-type-cognitive/10',
    border: 'border-type-cognitive/30',
  },
  emotional: {
    shortLabel: '정서',
    text: 'text-type-emotional',
    bar: 'bg-type-emotional',
    bg: 'bg-type-emotional/10',
    border: 'border-type-emotional/30',
  },
  behavioral: {
    shortLabel: '행동',
    text: 'text-type-behavioral',
    bar: 'bg-type-behavioral',
    bg: 'bg-type-behavioral/10',
    border: 'border-type-behavioral/30',
  },
};

// ── 스트레스 검사 결과 8유형 (확정 스펙 "우세형 선별 기준") ──

export type StressResultType =
  | ReactionTypeKey
  | 'cognitive-emotional'
  | 'cognitive-behavioral'
  | 'emotional-behavioral'
  | 'balanced'
  | 'undetermined';

export const STRESS_RESULT_TYPE_LABEL: Record<StressResultType, string> = {
  cognitive: '인지형',
  emotional: '정서형',
  behavioral: '행동형',
  'cognitive-emotional': '인지·정서형',
  'cognitive-behavioral': '인지·행동형',
  'emotional-behavioral': '정서·행동형',
  balanced: '균형형',
  undetermined: '판별 불가',
};

/**
 * 유형별 결과 설명문 — 확정 스펙 §2 "유형 설명문(전문)"의 시트 원문이다.
 *
 * typeReport.ts와 같은 성격의 콘텐츠다: 버튼 라벨과 달리 심리학부 검수를 거친
 * 진단 문장이므로 **임의 윤문·요약 금지**. 문구를 바꿔야 하면 스펙 문서
 * (docs/superpowers/specs/2026-08-06-test-content-spec.md)를 먼저 고칠 것.
 *
 * `undetermined`만 스펙에 원문이 없어 초안으로 채워 두었다 — 아래 주석 참고.
 */
export const STRESS_RESULT_TYPE_DESCRIPTION: Record<StressResultType, string> = {
  cognitive:
    '스트레스를 받으면 먼저 상황을 차분히 정리하고, 문제의 원인과 사실관계를 파악하려는 경향이 있습니다. 당시 상황과 자신의 반응을 여러 번 되짚으며, 어떤 일이 있었고 자신이 어떻게 대응했는지를 객관적으로 이해하려는 편입니다. 상황이 충분히 정리되지 않았다고 느끼면 이미 지나간 일도 머릿속에서 반복해서 검토하거나 오래 생각하기도 합니다.',
  emotional:
    '스트레스를 받으면 그 상황에서 느껴지는 감정이 반응의 중심이 되는 경향이 있습니다. 자신의 감정을 알아차리고 직접 표현하기도 하지만, 감정을 참다가 한꺼번에 터뜨리거나 불편한 감정을 마주하지 않기 위해 외면하기도 합니다. 이처럼 감정을 인식하고 표현하는 방식뿐 아니라 억제하거나 회피하는 방식도 상황에 따라 함께 나타날 수 있습니다.',
  behavioral:
    '스트레스를 받으면 생각이나 감정을 살피는 데 머무르기보다 실제 행동을 통해 상황에 대응하려는 경향이 있습니다. 해야 할 일의 우선순위를 정하고 문제해결에 필요한 행동을 실행하기도 하며, 부담이 커지면 그 자리를 떠나거나 상대와의 연락을 피하기도 합니다. 즉, 상황에 직접 접근하거나 상황으로부터 거리를 두는 행동을 통해 스트레스에 반응하는 편입니다.',
  'cognitive-emotional':
    '스트레스를 받으면 상황의 원인과 사실관계를 되짚는 동시에, 그 과정에서 느껴지는 감정에도 주의를 기울이는 경향이 있습니다. 자신에게 어떤 일이 있었고 그 일로 어떤 감정을 느꼈는지를 함께 이해하려 하며, 생각과 감정이 서로 밀접하게 이어지는 편입니다. 상황을 반복해서 생각할수록 당시의 감정이 다시 강해지거나, 감정이 커질수록 그 일을 더욱 오래 곱씹기도 합니다.',
  'cognitive-behavioral':
    '스트레스를 받으면 먼저 상황과 문제의 원인을 정리하고, 그에 따라 필요한 행동을 결정하려는 경향이 있습니다. 사실관계와 자신의 대응을 검토한 뒤 해야 할 일의 우선순위를 정하고 실행하는 등 생각과 행동이 순차적으로 이어지는 편입니다. 상황을 분석한 결과 당장 마주하기 어렵다고 판단하면, 자리를 떠나거나 상대와 잠시 거리를 두는 행동을 선택하기도 합니다.',
  'emotional-behavioral':
    '스트레스를 받으면 감정을 빠르게 알아차리고, 그 감정이 표현이나 행동으로 이어지는 경향이 있습니다. 화나 짜증을 상대에게 드러내거나 문제를 해결하기 위해 바로 움직이기도 하며, 감정이 부담스러울 때는 자리를 떠나거나 연락을 피하면서 상황에서 물러나기도 합니다. 생각으로 충분히 정리하기에 앞서 감정의 흐름에 따라 상황에 접근하거나 거리를 두는 반응이 나타나는 편입니다.',
  balanced:
    '스트레스를 받으면 상황을 생각으로 정리하고, 그 과정에서 느껴지는 감정을 경험하며, 필요에 따라 행동으로 대응하는 여러 반응이 비슷한 수준으로 나타나는 경향이 있습니다. 상황을 분석하거나 감정을 표현하는 모습, 문제를 해결하거나 잠시 거리를 두는 모습이 상황에 따라 다양하게 나타날 수 있습니다. 특정한 한 가지 반응이 일관되게 두드러지기보다 당시 상황과 감정의 강도에 따라 주로 사용하는 방식이 달라지는 편입니다.',
  // ⚠️ 팀 검수 대기 (확정 스펙 §4-4) — 아래는 T 패키지가 작성한 초안이다.
  // 전부 '예'/전부 '아니요'는 무성의 일괄 응답으로 보고 결과를 저장하지 않으므로,
  // 사용자를 탓하지 않으면서 재응답이 필요한 이유만 전달하는 기조로 썼다.
  undetermined:
    '모든 문항에 같은 답을 선택하셔서 어떤 반응 방식이 더 자주 나타나는지 구분할 수 없었습니다. 이 검사는 문항마다 답이 갈릴 때 비로소 나의 경향을 보여줄 수 있어요. 각 문항을 다시 한 번 떠올려 보면서, 실제로 그런 편이면 \'예\', 그렇지 않으면 \'아니요\'를 골라 주세요.',
};

/**
 * 유형 설명문에서 굵게 강조할 구절 목록.
 *
 * ⚠️ 강조 구간 팀 검수 대기 — 아래 구절 선정은 T 패키지의 초안이다.
 *
 * 위 STRESS_RESULT_TYPE_DESCRIPTION은 심리학부 검수문이라 한 글자도 고칠 수
 * 없다. 그래서 원문에 마크업을 심지 않고, **원문에 그대로 등장하는 부분
 * 문자열**만 여기 따로 적어 두고 렌더링 시점에 매칭해 <strong>으로 감싼다
 * (components/ui/EmphasizedText).
 *
 * 그 결과 이 목록은 원문과 어긋날 수 있다. 어긋나면(오타·원문 개정) 매칭이
 * 실패하고 해당 구절은 조용히 평문으로 그려진다 — 화면이 깨지지 않는 대신
 * 강조가 사라지는 쪽으로 실패한다. 원문을 개정하면 여기도 함께 볼 것이며,
 * reactionType.test.ts가 "모든 구절이 원문에 존재하는가"를 지킨다.
 *
 * 선정 기준: 유형당 2~3개, 그 유형의 핵심 경향(무엇을 먼저 하는가 · 어떤
 * 방향으로 흐르는가 · 부담이 커지면 어떻게 되는가)을 드러내는 구절.
 * 문장 전체를 굵게 하면 강조가 아니라 그냥 굵은 문단이 되므로 절을 고른다.
 */
export const STRESS_RESULT_TYPE_EMPHASIS: Record<StressResultType, readonly string[]> = {
  cognitive: [
    '상황을 차분히 정리하고, 문제의 원인과 사실관계를 파악하려는 경향',
    '객관적으로 이해하려는 편',
    '머릿속에서 반복해서 검토하거나 오래 생각하기도 합니다',
  ],
  emotional: [
    '느껴지는 감정이 반응의 중심이 되는 경향',
    '자신의 감정을 알아차리고 직접 표현하기도 하지만',
    '억제하거나 회피하는 방식도 상황에 따라 함께 나타날 수 있습니다',
  ],
  behavioral: [
    '실제 행동을 통해 상황에 대응하려는 경향',
    '해야 할 일의 우선순위를 정하고 문제해결에 필요한 행동을 실행',
    '상황에 직접 접근하거나 상황으로부터 거리를 두는 행동',
  ],
  'cognitive-emotional': [
    '상황의 원인과 사실관계를 되짚는 동시에, 그 과정에서 느껴지는 감정에도 주의를 기울이는 경향',
    '생각과 감정이 서로 밀접하게 이어지는 편',
    '감정이 커질수록 그 일을 더욱 오래 곱씹기도 합니다',
  ],
  'cognitive-behavioral': [
    '상황과 문제의 원인을 정리하고, 그에 따라 필요한 행동을 결정하려는 경향',
    '생각과 행동이 순차적으로 이어지는 편',
    '자리를 떠나거나 상대와 잠시 거리를 두는 행동을 선택하기도 합니다',
  ],
  'emotional-behavioral': [
    '감정을 빠르게 알아차리고, 그 감정이 표현이나 행동으로 이어지는 경향',
    '감정이 부담스러울 때는 자리를 떠나거나 연락을 피하면서 상황에서 물러나기도 합니다',
    '감정의 흐름에 따라 상황에 접근하거나 거리를 두는 반응',
  ],
  balanced: [
    '여러 반응이 비슷한 수준으로 나타나는 경향',
    '특정한 한 가지 반응이 일관되게 두드러지기보다',
    '당시 상황과 감정의 강도에 따라 주로 사용하는 방식이 달라지는 편',
  ],
  // 판별 불가는 진단문이 아니라 재응답 안내문이라, 원인과 행동 지시만 짚는다.
  undetermined: [
    '모든 문항에 같은 답을 선택하셔서',
    '문항마다 답이 갈릴 때 비로소 나의 경향을 보여줄 수 있어요',
  ],
};

/**
 * 확정 스펙의 우세형 선별 기준 그대로 분류한다:
 * 단독 최고 → 단일 우세형 / 2개 동률 최고 → 혼합형 / 3개 동률 → 균형형 /
 * 전부 '예' 또는 전부 '아니요'(변별력 없음) → 판별 불가.
 * 혼합형 키는 REACTION_TYPE_KEYS 순서로 조합되므로 항상
 * cognitive-emotional / cognitive-behavioral / emotional-behavioral 형태다.
 */
export function classifyStressResult(
  counts: Record<ReactionTypeKey, number>,
  maxPerDomain = 4,
): StressResultType {
  const values = REACTION_TYPE_KEYS.map((key) => counts[key]);
  if (values.every((v) => v === 0) || values.every((v) => v === maxPerDomain)) {
    return 'undetermined';
  }
  const max = Math.max(...values);
  const top = REACTION_TYPE_KEYS.filter((key) => counts[key] === max);
  if (top.length === 3) return 'balanced';
  if (top.length === 2) return `${top[0]}-${top[1]}` as StressResultType;
  return top[0];
}

/**
 * 시나리오 에피소드에 배치할 반응 기제 순환 목록 (2026-08-06 사용자 확정).
 * 단일형은 그 유형만, 혼합형은 두 유형을 번갈아, 균형형은 세 유형을 순환 —
 * 에피소드 i의 버전 = cycle[i % cycle.length].
 *
 * 'undetermined'는 검사 미완료로 처리되어 저장되지 않으므로(재검사 유도)
 * 시나리오 분기에 도달하지 않지만, 방어적으로 인지 단일을 돌려준다.
 * 레거시 데이터(resultType 없음)의 폴백도 ['cognitive']를 쓸 것.
 */
export function getReactionTypeCycle(resultType: StressResultType): ReactionTypeKey[] {
  if (resultType === 'balanced') return [...REACTION_TYPE_KEYS];
  if (resultType === 'undetermined') return ['cognitive'];
  if (resultType === 'cognitive' || resultType === 'emotional' || resultType === 'behavioral') {
    return [resultType];
  }
  return resultType.split('-') as ReactionTypeKey[];
}
