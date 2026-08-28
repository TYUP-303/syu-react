// src/constants/strategy.ts
// 스트레스 대처 전략 3종의 단일 출처 — 키 · 라벨 · 요정 이미지 · 색상 토큰.
//
// 이 3종은 Firestore `users/{uid}.scenarios[episodeId].selectedAngel`에
// 저장되는 도메인 키이면서, 동시에 세 화면에 공통으로 노출된다:
//   1) 시나리오 플레이어 (요정 등장 · 상세 · 선택 배지)
//   2) 회복일기 상세의 훈련 대처 통계 (StatsCard)
//   3) 테마 완료 유형 분석 보고서 (TypeReportView)
//
// 전략 · 요정 · 색상의 확정 대응은 다음과 같다. 출처는 프로젝트 소개자료의
// 요정 표와 조세현 학생의 랜딩 시안(Stitch)이며, 요정 실물 색과 팔레트
// 토큰을 일치시킨다:
//   accept     = 아코 · 파랑이(구슬) · primary
//   reappraisal = 포코 · 노랑이(별)   · tertiary
//   refocus    = 리프 · 초록이(잎)   · success
//
// ⚠️ 화면마다 다른 색을 쓰면 사용자가 플레이 중 학습한 "전략 = 요정 색"
// 연결이 깨진다. 실제로 2026-08-05 이전에는 통계 화면 두 곳이 수용을
// 빨강(error), 재평가를 파랑으로 그려 플레이어와 어긋나 있었다.
// 전략 색이 필요하면 반드시 이 파일의 토큰만 참조할 것.
//
// ⚠️ 2026-08-06 이전에는 재평가와 재초점이 서로 반대 요정에 붙어 있었다
// (재평가↔초록이, 재초점↔노랑이). 위 확정 대응에 맞춰 바로잡은 것이며,
// Firestore에 저장되는 값은 아래 키뿐이라 기존 사용자 기록에는 영향이 없다.

export type StrategyKey = 'accept' | 'reappraisal' | 'refocus';

export interface StrategyMeta {
  /** 요정 이미지 경로 (public/scenario/fairies/) */
  image: string;
  /**
   * 확정된 캐릭터 이름 — "아코". 현재는 엔딩 메시지에서만 쓴다.
   * 플레이어·통계 화면의 호칭을 전략명에서 캐릭터 이름으로 바꿀지는
   * 기획팀 미결이므로, 결정되면 angelLabel 사용처를 이 필드로 옮기면 된다.
   */
  fairyName: string;
  /** 플레이어 노출 라벨 — "수용 요정" */
  angelLabel: string;
  /** 통계 차트 축약 라벨 — "수용" */
  shortLabel: string;
  /** 보고서 정식 명칭 — "수용 (Acceptance)" */
  /** 텍스트 색 */
  text: string;
  /** 차트 막대 등 솔리드 배경 */
  bar: string;
  /** 카드 배경 틴트 */
  bg: string;
  /** 카드 테두리 */
  border: string;
}

/** 표시 순서이자 동점 시 우선순위 (앞선 키가 이긴다). */
export const STRATEGY_KEYS: readonly StrategyKey[] = ['accept', 'reappraisal', 'refocus'] as const;

export const STRATEGY_META: Record<StrategyKey, StrategyMeta> = {
  accept: {
    image: '/scenario/fairies/파랑이.png',
    fairyName: '아코',
    angelLabel: '수용 요정',
    shortLabel: '수용',
    text: 'text-primary',
    bar: 'bg-primary',
    bg: 'bg-primary/10',
    border: 'border-primary/30',
  },
  reappraisal: {
    image: '/scenario/fairies/노랑이.png',
    fairyName: '포코',
    angelLabel: '재평가 요정',
    shortLabel: '재평가',
    text: 'text-tertiary',
    bar: 'bg-tertiary',
    bg: 'bg-tertiary/10',
    border: 'border-tertiary/30',
  },
  refocus: {
    image: '/scenario/fairies/초록이.png',
    fairyName: '리프',
    angelLabel: '재초점 요정',
    shortLabel: '재초점',
    text: 'text-success',
    bar: 'bg-success',
    bg: 'bg-success/10',
    border: 'border-success/30',
  },
};

/**
 * 전략별 선택 횟수에서 최빈 전략을 구한다.
 * 동점이면 STRATEGY_KEYS 순서상 앞선 키가 이긴다(결정론적).
 * 전부 0이면 첫 키('accept')를 돌려주므로, 표시 여부는 호출부가 판단할 것.
 */
export function getDominantStrategy(counts: Record<StrategyKey, number>): StrategyKey {
  return STRATEGY_KEYS.reduce((best, key) => (counts[key] > counts[best] ? key : best), STRATEGY_KEYS[0]);
}
