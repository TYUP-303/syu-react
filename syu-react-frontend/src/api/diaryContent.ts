// src/api/diaryContent.ts
// 회복 일기 · 보고서의 콘텐츠 접근 계층.
//
// 두 종류의 문구가 있고 사는 곳이 다르다:
//   1) 영역 고유 문구 (제목·도입·인용·맺음말) — 사람이 쓴 고정 텍스트.
//      src/assets/data/diary_contents.json 에 있다.
//   2) 케이스별 생성 문구 (요약·실천 제안·강점/연습 방향) — 사용자의
//      집계 결과에 따라 달라진다. 아래 "문구 주입 슬롯"이 담당한다.
//
// ⚠️ R2 이전에는 영역마다 5페이지짜리 정적 격려문을 페이지 넘김 뷰어로
// 보여줬다. 그 뷰어는 폐기됐고(스크롤 보고서형으로 대체), JSON도 pages
// 배열 대신 화면이 실제로 쓰는 네 필드만 남겼다. 사라진 격려문 원문이
// 필요하면 git 히스토리(R2 이전 diary_contents.json)를 볼 것.

import rawDiaryContents from '../assets/data/diary_contents.json';
import adhdCsv from '../assets/data/adhd_questions.csv?raw';
import { COPY } from '../constants/copy';
import { STRATEGY_KEYS, STRATEGY_META, type StrategyKey } from '../constants/strategy';
import { parseQuestionsCsv } from '../utils/csvParser';
import { objectParticle } from '../utils/koreanParticle';
import { canShowPercent, type StrategyStats } from '../utils/strategyStats';
import { describeAdhdFrequency } from '../utils/testScoring';
import type { TestResultData } from '../store/useTestStore';

/** 영역(테마) 하나의 고정 문구. */
export interface DiaryContent {
  themeId: string;
  /** 보고서 제목 — "직장 회복일기" */
  title: string;
  subtitle: string;
  /** Material Symbols 아이콘명 */
  coverIcon: string;
  /** 상세 헤더의 도입 문장 */
  intro: string;
  /** 영역 카드에 붙는 ADHD 경향 한 줄 (여명이 제안) */
  areaHint: string;
  /** 인사이트 노트 인용문 */
  quote: string;
  /** 보고서 맺음말 */
  closing: string;
}

export const diaryContents: DiaryContent[] = rawDiaryContents as DiaryContent[];

export const getDiaryByThemeId = (themeId: string): DiaryContent | undefined =>
  diaryContents.find((d) => d.themeId === themeId);

// ────────────────────────────────────────────────────────────────
// 문구 주입 슬롯
//
// 화면은 아래 build* 함수만 호출하고, 문구 자체는 이 파일 안의 데이터
// 테이블에 모아 둔다. 팀 검수로 문장이 바뀌면 테이블만 갈아끼우면 되고
// 컴포넌트는 건드릴 일이 없다.
//
// 톤 규칙 (하드 제약):
//   · 점수·빈도만 서술한다. 상담·의료기관 방문 **권고 금지** (7차 확정).
//   · "진단"·"증상"·"치료" 같은 임상 어휘를 쓰지 않는다.
//   · 전략은 요정명을 앞세운다 — "포코(재평가)" (교정 5번).
// ────────────────────────────────────────────────────────────────

/**
 * "포코(재평가)" 형태의 표기. 요정명 우선 — 영문 병기는 쓰지 않는다.
 *
 * nameOverride는 에피소드 데이터가 자기 요정 이름을 들고 있는 플레이어용
 * 주입구다. 표기 **형식**의 단일 출처를 여기 하나로 두기 위한 것이며,
 * 생략하면 STRATEGY_META의 확정 이름을 쓴다.
 */
export function strategyDisplayName(key: StrategyKey, nameOverride?: string): string {
  return `${fairyDisplayName(key, nameOverride)}(${STRATEGY_META[key].shortLabel})`;
}

/**
 * 요정 이름만 — "아코". 괄호 표기(strategyDisplayName)가 이름과 전략을 함께
 * 말하는 자리용이라면 이쪽은 **전략명이 같은 화면의 다른 자리에 이미 있는**
 * 경우를 위한 것이다 (2026-08-27 R2-03: 플레이어의 요정 칩).
 *
 * 이름의 출처는 두 곳이다 — CSV 원고(`episode.angels[key].name`)가 우선이고,
 * 비어 있으면 STRATEGY_META의 확정 이름으로 떨어진다. 그 우선순위를 호출부마다
 * 다시 쓰지 않도록 여기 한 곳에 둔다.
 */
export function fairyDisplayName(key: StrategyKey, nameOverride?: string): string {
  return nameOverride?.trim() || STRATEGY_META[key].fairyName;
}

/** 집계에서 가장 적게 쓴 전략. 전부 0이면 null. */
export function findLeastUsedStrategy(stats: StrategyStats): StrategyKey | null {
  if (stats.totalCleared === 0) return null;
  return STRATEGY_KEYS.reduce((least, key) =>
    stats.byStrategy[key].count < stats.byStrategy[least].count ? key : least,
  STRATEGY_KEYS[0]);
}

/**
 * "아코(수용)를" 형태 — 표기 + 조사.
 * 조사는 괄호가 아니라 소리 내어 읽는 요정명("아코")이 결정한다.
 */
function withObject(key: StrategyKey): string {
  const name = STRATEGY_META[key].fairyName;
  return `${strategyDisplayName(key)}${objectParticle(name)}`;
}

// ⚠️ 팀 검수 대기 — 아래 문구 테이블은 R2-7이 작성한 초안이다.
// 확정 스펙에 원문이 없는 슬롯이라 undetermined 안내문과 같은 컨벤션으로
// 표시해 둔다. 검수 시 다음 세 가지를 함께 봐 주기 바란다:
//   1) 강점 문장이 특정 전략을 "더 좋은 것"으로 읽히게 하지 않는가
//   2) 연습 방향이 지시가 아니라 제안으로 들리는가
//   3) 임상 어휘("증상"·"완화"·"치료")가 섞이지 않았는가

/** 최다 선택 전략별 강점 문장. */
const STRENGTH_BY_STRATEGY: Record<StrategyKey, string> = {
  accept:
    '힘든 감정을 밀어내지 않고 그대로 바라보는 편이에요. 마음이 흔들릴 때 자신을 몰아붙이지 않고 한 박자 쉬어 가는 힘이 있어요.',
  reappraisal:
    '같은 상황도 여러 각도에서 다시 보려는 편이에요. 처음 떠오른 해석에 머무르지 않고 다른 가능성을 찾아보는 유연함이 있어요.',
  refocus:
    '감정에 오래 머무르기보다 지금 할 수 있는 일로 주의를 옮기는 편이에요. 막막한 상황에서도 작은 행동을 찾아내는 실행력이 있어요.',
};

/** 가장 적게 쓴 전략별 연습 방향 문장 (지시가 아니라 제안 톤). */
const PRACTICE_DIRECTION_BY_STRATEGY: Record<StrategyKey, string> = {
  accept:
    '상황을 정리하거나 움직이기 전에, 지금 어떤 기분인지 이름을 붙여 보는 연습도 도움이 될 수 있어요. 감정을 바꾸지 않고 알아차리기만 해도 괜찮아요.',
  reappraisal:
    '“다르게 볼 수도 있을까?”라고 한 번 물어보는 연습도 도움이 될 수 있어요. 억지로 긍정적으로 볼 필요는 없고, 다른 설명이 있는지만 살펴봐도 충분해요.',
  refocus:
    '생각이 제자리를 맴돌 때, 지금 할 수 있는 아주 작은 일 하나로 주의를 옮겨 보는 연습도 도움이 될 수 있어요. 물 한 잔이나 짧은 산책이면 충분해요.',
};

/** 가장 적게 쓴 전략별 "작은 실천 제안". */
const PRACTICE_SUGGESTION_BY_STRATEGY: Record<StrategyKey, string> = {
  accept:
    '아코(수용)는 아직 기록이 적어요. 다음에는 감정을 바꾸려 하기 전에 “지금 나는 ○○하구나”라고 한 문장으로 적어 보는 것부터 시작해 보세요.',
  reappraisal:
    '포코(재평가)는 아직 기록이 적어요. 다음에는 그 상황을 친구가 겪었다면 뭐라고 말해 줬을지 떠올려 보세요. 나에게 하는 말보다 훨씬 너그러울 때가 많아요.',
  refocus:
    '리프(재초점)는 아직 기록이 적어요. 다음에는 해결할 수 있는 아주 작은 행동 하나를 찾아보세요. 산책을 하거나 좋아하는 노래를 듣는 것만으로도 도움이 될 수 있어요.',
};

/**
 * ADHD 문항 CSV의 5점 척도 선택지 라벨.
 *
 * 보고서는 검사 진행 중이 아니라 useTestStore.questions가 항상 비어 있다.
 * 그래서 번들된 확정 CSV에서 라벨을 읽는다 — 어드민이 questions/adhd를
 * 갈아 넣어도 선택지 라벨은 확정 스펙 §1 값이라 달라지지 않는다.
 */
const ADHD_OPTION_LABELS: string[] = parseQuestionsCsv(adhdCsv)[0]?.options ?? [];

/**
 * 보고서에 들어가는 ADHD 점수 설명문.
 *
 * ⚠️ 문구는 검사 결과 화면(AdhdResultCard)과 **같은 검수 템플릿**이다 —
 * describeAdhdFrequency로 빈도 구간을 만들고 확정 스펙 §1 템플릿
 * (COPY.test.resultAdhdPersonalDesc)에 끼운다. 윤문·요약 금지.
 *
 * 근거: 시트·스펙에 점수대 해설이 없어 자작 밴드 폐기, 검수된 빈도 템플릿
 * 재사용 (2026-08-08). 폐기된 것은 경계 24/49/74의 4단 밴드 문구로,
 * "드물게 / 가끔 / 비교적 자주 / 자주"라는 빈도 어휘와 그 경계값이 모두
 * 근거 없는 앱 자작이었다. 같은 점수를 두 화면이 다른 말로 설명하던
 * 문제도 함께 사라진다.
 *
 * 평균 응답 배점은 rawScore/문항 수로 구한다(결과 화면과 동일). rawScore가
 * 없는 레거시 기록은 환산점수에서 되돌린다 — score/100 = rawScore/최대치이므로
 * average = (score/100) × 최대 배점이며, 두 경로의 값이 일치한다.
 */
export function buildAdhdScoreNote(result: TestResultData | null | undefined): string {
  if (!result || typeof result.score !== 'number') return '';
  if (ADHD_OPTION_LABELS.length === 0) return '';

  const maxOptionIndex = ADHD_OPTION_LABELS.length - 1;
  const questionCount = Object.keys(result.answers ?? {}).length;
  const average =
    typeof result.rawScore === 'number' && questionCount > 0
      ? result.rawScore / questionCount
      : (result.score / 100) * maxOptionIndex;

  const frequencyPhrase = describeAdhdFrequency(average, ADHD_OPTION_LABELS);
  if (!frequencyPhrase) return '';
  return COPY.test.resultAdhdPersonalDesc(result.score, frequencyPhrase);
}

/** 영역 상세 보고서에 주입되는 문구 묶음. */
export interface DomainNarrative {
  /** 영역 요약 — 최다 전략과 도움 경험을 한 문단으로 */
  summary: string;
  /** 작은 실천 제안 */
  practice: string;
}

/**
 * 영역 상세 보고서 문구를 집계에서 만든다.
 *
 * 요약은 세 조각을 조건부로 잇는다: 최다 전략 → 도움 체감 → 상위 이유.
 * 도움 기록이 없으면 그 조각을 통째로 빼고, 억지로 "도움이 되었어요"라고
 * 말하지 않는다.
 */
export function buildDomainNarrative(themeTitle: string, stats: StrategyStats): DomainNarrative {
  if (!stats.dominant) {
    return {
      summary: `${themeTitle} 영역은 아직 완료한 에피소드가 없어요. 하나만 마쳐도 이 자리에 나의 선택 기록이 채워져요.`,
      practice: '',
    };
  }

  const dominantStat = stats.byStrategy[stats.dominant];
  const parts: string[] = [
    `${themeTitle} 상황에서는 ${withObject(stats.dominant)} 가장 자주 선택했어요(${dominantStat.count}회).`,
  ];

  // 표본이 3회 미만이면 비율을 붙이지 않는다 (canShowPercent) — 같은 화면의
  // 체감률 카드가 %를 접고 있는데 요약문만 "(100%)"라고 말하면 어긋난다.
  if (dominantStat.helpfulRate !== null && dominantStat.helpfulCount > 0) {
    const rate = canShowPercent(dominantStat.count) ? `(${dominantStat.helpfulRate}%)` : '';
    parts.push(`그중 ${dominantStat.helpfulCount}번은 실제로 도움이 되었다고 답했어요${rate}.`);
  }

  const topReason = stats.helpfulReasonsTop3[0];
  if (topReason) {
    parts.push(`특히 “${topReason.reason}”라고 느낀 경우가 가장 많았어요.`);
  }

  const least = findLeastUsedStrategy(stats);
  // 최다와 최소가 같으면(전부 한 전략만 썼거나 완전 동률) 제안을 비운다.
  const showSuggestion = least !== null && least !== stats.dominant;

  return {
    summary: parts.join(' '),
    practice: showSuggestion ? PRACTICE_SUGGESTION_BY_STRATEGY[least] : '',
  };
}

/**
 * 최초 보고서(정서 대응 프로필)에 주입되는 문구 묶음.
 *
 * ADHD 점수 설명문은 여기 있지 않다 — 검사 결과 화면과 같은 검수 템플릿을
 * 쓰는 별도 함수(buildAdhdScoreNote)의 소관이다. 축 B 집계에서 나오는
 * 문구(강점·연습 방향)와 축 A 검사 결과 문구를 한 묶음에 섞지 않는다.
 */
export interface ProfileNarrative {
  /** 강점 */
  strength: string;
  /** 연습 방향 */
  practiceDirection: string;
}

/** 최초 보고서 문구를 축 B 집계에서 만든다. */
export function buildProfileNarrative(stats: StrategyStats): ProfileNarrative {
  const least = findLeastUsedStrategy(stats);
  const showDirection = least !== null && least !== stats.dominant;

  return {
    strength: stats.dominant
      ? STRENGTH_BY_STRATEGY[stats.dominant]
      : '아직 훈련 기록이 적어 강점을 정리하기 어려워요. 에피소드를 몇 번 더 진행하면 나의 선택 경향이 보이기 시작해요.',
    practiceDirection: showDirection
      ? PRACTICE_DIRECTION_BY_STRATEGY[least]
      : '세 전략을 고르게 써 보면 어떤 상황에 무엇이 맞는지 더 또렷해져요.',
  };
}

/** 보고서 최상단 종합 진단 카드의 한 줄 요약. */
export function buildReportHeadline(scopeLabel: string, stats: StrategyStats): string {
  if (!stats.dominant) {
    return `${scopeLabel} 훈련 기록이 아직 없어요. 에피소드를 완료하면 나의 선택 경향이 정리돼요.`;
  }

  const dominantStat = stats.byStrategy[stats.dominant];
  const base = `${scopeLabel} 훈련에서는 ${withObject(stats.dominant)} 가장 자주 선택했어요`;

  if (dominantStat.helpfulRate === null || dominantStat.helpfulCount === 0) {
    return `${base}.`;
  }
  // 소표본에서는 %가 아니라 횟수로 말한다 (canShowPercent).
  if (!canShowPercent(dominantStat.count)) {
    return `${base}. 그리고 그중 ${dominantStat.helpfulCount}회는 도움이 되었다고 느꼈어요.`;
  }
  return `${base}. 그리고 그중 ${dominantStat.helpfulRate}%는 도움이 되었다고 느꼈어요.`;
}

/**
 * 영역 간 비교 인사이트 — v0.2.0의 AX 템플릿을 뼈대로 한다.
 * "[이전 영역]에서는 [요정]을 자주 선택했고, [이번 영역]에서는 …"
 *
 * 비교할 다른 영역의 기록이 없으면 null을 돌려주고, 호출부가 슬롯을
 * 통째로 생략한다 — 한쪽만 있는 비교는 비교가 아니다.
 */
export function buildComparisonInsight(
  currentTitle: string,
  currentStats: StrategyStats,
  otherTitle: string,
  otherStats: StrategyStats,
): string | null {
  if (!currentStats.dominant || !otherStats.dominant) return null;

  if (currentStats.dominant === otherStats.dominant) {
    return `${otherTitle}에서도 ${withObject(otherStats.dominant)} 자주 선택했어요. 상황이 달라져도 손이 가는 전략은 비슷한 편이네요.`;
  }
  return `${otherTitle}에서는 ${withObject(otherStats.dominant)} 자주 선택했는데, ${currentTitle}에서는 ${withObject(currentStats.dominant)} 골랐어요. 상황에 따라 다른 방식을 꺼내 쓰고 있어요.`;
}
