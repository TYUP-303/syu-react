// src/store/useScenarioStore.test.ts
// 시나리오 배치 규칙(축 A 순환)을 고정하는 회귀 테스트.
//
// fetchThemes는 "검사의 우세 유형 → 어떤 반응 기제 버전의 에피소드를 보여줄지"를
// 정하는 지점이다 (공유 계약 4번). 이 규칙은 CSV 콘텐츠·검사 채점·진행도 매핑이
// 얽혀 있어 화면만 보고는 틀렸는지 알기 어렵다 — 배치 결과를 값으로 박아 둔다.
//
// 실 CSV(scenario_visual/dialogues, 영역당 10회차 × 3버전)를 그대로 쓴다.
// 콘텐츠가 늘어 숫자가 달라지면 그건 콘텐츠 변경이지 리팩터링이 아니다.

import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  useScenarioStore,
  defaultAngels,
  DEFAULT_REASONS,
  buildEpisodeAngels,
  buildEpisodeReasons,
} from './useScenarioStore';
import { useTestStore } from './useTestStore';
import type { StressResultType } from '../constants/reactionType';
import type { EpisodeAngelText } from '../utils/scenarioAngelsCsvParser';
import type { EpisodeData } from '../api/scenarioMockData';

// 이 파일은 실 CSV 121행 × 3버전을 매 케이스마다 파싱해 케이스당 1~4초가 걸린다.
// 병렬 에이전트가 vitest를 동시에 돌리던 2026-08-26에 기본 5초 제한에 걸려 9건이
// 거짓 실패했다(단독 실행 26/26). 계약이 아니라 부하 문제라 제한만 넉넉히 둔다.
vi.setConfig({ testTimeout: 30_000 });

const THEME_IDS = ['workplace', 'job-prep', 'relationship', 'daily'] as const;

function setResultType(resultType: StressResultType | undefined) {
  useTestStore.setState({
    stressResult: resultType
      ? { testType: 'stress', answers: {}, score: 0, completedAt: '', resultType }
      : null,
  });
}

/** 이미 로드된 테마를 비워 다음 fetchThemes가 실제로 배치를 다시 하게 만든다. */
function resetThemes() {
  useScenarioStore.setState({ themes: [], themesCycleKey: null });
}

function reactionTypesOf(themeId: string): string[] {
  const theme = useScenarioStore.getState().themes.find((t) => t.id === themeId)!;
  return theme.episodes.map((e) => e.scenario.reactionType);
}

/** 에피소드가 참조하는 원본 도메인의 번호('직장3' → '3'). 회차 정렬 확인용. */
function domainNumbersOf(themeId: string): string[] {
  const theme = useScenarioStore.getState().themes.find((t) => t.id === themeId)!;
  return theme.episodes.map((e) => e.scenario.domain.replace(/\D/g, ''));
}

beforeEach(() => {
  setResultType(undefined);
  resetThemes();
});

describe('fetchThemes — 영역·회차 구조', () => {
  it('4영역 × 10회차를 도메인 번호 순서대로 만든다', async () => {
    await useScenarioStore.getState().fetchThemes();
    const themes = useScenarioStore.getState().themes;

    expect(themes.map((t) => t.id)).toEqual([...THEME_IDS]);
    themes.forEach((theme) => {
      expect(theme.episodes).toHaveLength(10);
      expect(theme.episodes.map((e) => e.id)).toEqual(
        Array.from({ length: 10 }, (_, i) => `${theme.id}-ep${i + 1}`)
      );
      expect(theme.episodes.map((e) => e.episodeNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
  });

  it('회차는 배열 순서가 아니라 도메인 번호를 따른다 (10이 2 앞으로 새치기하지 않는다)', async () => {
    await useScenarioStore.getState().fetchThemes();
    const expected = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    expect(domainNumbersOf('workplace')).toEqual(expected);
    expect(domainNumbersOf('daily')).toEqual(expected);
  });

  // 영역 설명은 1뎁스 카드와 2뎁스 헤더 부제에 **같은 문자열**로 선다.
  // 2026-08-27 3차 UAT(R3-01)에서 문구가 확정됐다 — 예전 문구는 '대처하기·
  // 다루기·극복하기'처럼 서술어가 붙어 카드 두 줄을 넘겼고, 영역을 고르는
  // 데 필요한 것은 "무엇에 관한 영역인가"뿐이라 명사구로 줄였다.
  it('영역 설명은 확정된 네 문구다 (R3-01)', async () => {
    await useScenarioStore.getState().fetchThemes();
    const themes = useScenarioStore.getState().themes;

    expect(themes.map((t) => t.description)).toEqual([
      '직장 생활에서 겪는 어려움',
      '취업 준비 과정의 스트레스',
      '연인 간 오해와 갈등',
      '일상에서 마주하는 도전들',
    ]);
  });
});

describe('fetchThemes — 반응 기제 순환 배치 (공유 계약 4번)', () => {
  it('검사 전(레거시·미검사)에는 인지 버전으로 폴백한다', async () => {
    await useScenarioStore.getState().fetchThemes();
    THEME_IDS.forEach((id) => {
      expect(reactionTypesOf(id)).toEqual(Array(10).fill('인지'));
    });
  });

  it('단일형은 그 유형 10편', async () => {
    setResultType('emotional');
    await useScenarioStore.getState().fetchThemes();
    expect(reactionTypesOf('workplace')).toEqual(Array(10).fill('정서'));
  });

  it('혼합형은 두 유형 교대 (5+5)', async () => {
    setResultType('emotional-behavioral');
    await useScenarioStore.getState().fetchThemes();

    expect(reactionTypesOf('workplace')).toEqual(
      Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? '정서' : '행동'))
    );
    expect(countByType('workplace')).toEqual({ 정서: 5, 행동: 5 });
  });

  it('균형형은 세 유형 순환 (4+3+3)', async () => {
    setResultType('balanced');
    await useScenarioStore.getState().fetchThemes();

    const order = ['인지', '정서', '행동'];
    expect(reactionTypesOf('workplace')).toEqual(
      Array.from({ length: 10 }, (_, i) => order[i % 3])
    );
    expect(countByType('workplace')).toEqual({ 인지: 4, 정서: 3, 행동: 3 });
  });

  it('cycleOverride가 스토어 값을 이긴다 (테스트·디버그 주입구)', async () => {
    setResultType('cognitive');
    await useScenarioStore.getState().fetchThemes(['behavioral']);
    expect(reactionTypesOf('workplace')).toEqual(Array(10).fill('행동'));
  });
});

describe('fetchThemes — 재검사 반응', () => {
  it('같은 순환이면 다시 배치하지 않고, 유형이 바뀌면 새 배치로 갈아 끼운다', async () => {
    await useScenarioStore.getState().fetchThemes();
    expect(useScenarioStore.getState().themesCycleKey).toBe('cognitive');
    const firstLoad = useScenarioStore.getState().themes;

    // 같은 유형으로 다시 호출 — 스킵되어 참조가 그대로다
    await useScenarioStore.getState().fetchThemes();
    expect(useScenarioStore.getState().themes).toBe(firstLoad);

    // 재검사로 우세 유형이 바뀌면 배치가 갱신된다
    setResultType('behavioral');
    await useScenarioStore.getState().fetchThemes();
    expect(useScenarioStore.getState().themesCycleKey).toBe('behavioral');
    expect(reactionTypesOf('workplace')).toEqual(Array(10).fill('행동'));
  });

  it('배치가 바뀌어도 에피소드 id는 그대로다 (진행도가 같은 회차에 매핑된다)', async () => {
    await useScenarioStore.getState().fetchThemes();
    const before = useScenarioStore.getState().themes.map((t) => t.episodes.map((e) => e.id));

    setResultType('balanced');
    await useScenarioStore.getState().fetchThemes();
    const after = useScenarioStore.getState().themes.map((t) => t.episodes.map((e) => e.id));

    expect(after).toEqual(before);
  });
});

// ─────────────────────────────────────────────────────────────────
// 요정 조언·선택지의 에피소드별 주입 (scenario_angels.csv)
//
// 2026-08-11 UAT 최대 지적("요정 조언이 시나리오와 무관하게 늘 똑같다")에
// 대응해 연 자리다.
//
// 2026-08-18: **원고 4인분이 모두 도착해 40편이 채워졌다** (직장·취업준비·
// 연인·일상 각 10편 × 9칸 = 360칸). 여명이 담당 일상 10편이 같은 날 늦게
// 합류하면서, 직전까지 이 자리에 있던 "일상은 기본값으로 폴백한다" 고정이
// 예고대로 뒤집혔다 — 이제 **네 영역 전부 주입**을 고정한다.
//
// 폴백 검증은 위 메모의 예고대로 이 파일 아래쪽 buildEpisodeAngels 단위
// 테스트가 전담한다. CSV에 빈 회차가 더는 없어서 fetchThemes 경로로는
// 폴백을 관측할 수 없기 때문이다 (관측할 수 있다면 그건 원고 유실이다).
//
// 2026-08-26: 마지막까지 비어 있던 HELPFUL_*/UNHELPFUL_* 6칸도 채워졌다.
// 조언과 달리 선택지는 **편마다 새로 쓰지 않는다** — 전역 팔레트(도움 8 ·
// 비도움 8)에서 상황에 맞는 3개씩을 고르는 방식이다. 보고서가 문자열 빈도를
// 세기 때문이고, 그래서 여기서는 "채워졌는가"만이 아니라 **집합 크기와
// 항목별 노출 편수**까지 고정한다.
//
// 주입 경로 자체의 세부 검증(열 파싱·헤더 인식·폴백 19케이스)은
// `scenarioAngelsCsvParser.test.ts`가 맡는다.
// ─────────────────────────────────────────────────────────────────

/** CSV 맨 위 안내용 행(NO 0 · DOMAIN '샘플')의 ACCEPT_DETAIL 첫머리. */
const SAMPLE_ROW_DETAIL_PREFIX = '오늘이 계획대로 흘러가지 않았다는 사실을';

function episodeOf(themeId: string, episodeNumber: number): EpisodeData {
  const theme = useScenarioStore.getState().themes.find((t) => t.id === themeId)!;
  return theme.episodes.find((e) => e.episodeNumber === episodeNumber)!;
}

/** 네 영역을 합친 40편. 선택지 팔레트 검증처럼 전수를 봐야 하는 곳이 쓴다. */
function allEpisodes(): EpisodeData[] {
  return useScenarioStore.getState().themes.flatMap((t) => t.episodes);
}

describe('fetchThemes — 에피소드별 요정 문구·선택지', () => {
  it("DOMAIN이 어느 에피소드와도 안 맞는 행('샘플')은 조용히 무시된다", async () => {
    // scenario_angels.csv 맨 위의 NO 0 · DOMAIN '샘플' 행은 팀에게 작성 예시를
    // 보여주려고 둔 것이다. 매칭되는 에피소드가 없으므로 **어느 편에도** 새어
    // 들어가면 안 된다 — 새면 엉뚱한 회차에 남의 조언이 실린다.
    await useScenarioStore.getState().fetchThemes();

    const everyDetail = useScenarioStore
      .getState()
      .themes.flatMap((t) => t.episodes.map((e) => e.angels.accept.detail));

    expect(everyDetail).not.toHaveLength(0);
    expect(everyDetail.some((d) => d.startsWith(SAMPLE_ROW_DETAIL_PREFIX))).toBe(false);
  });

  it('기본 조언을 그대로 쓰는 회차가 한 편도 없다', async () => {
    // 40편이 모두 채워졌으므로 폴백은 화면에 나가지 않아야 한다. 여기서
    // 기본값이 관측되면 그건 폴백이 아니라 **원고 유실**이다.
    await useScenarioStore.getState().fetchThemes();

    const everyDetail = useScenarioStore
      .getState()
      .themes.flatMap((t) => t.episodes.map((e) => e.angels.accept.detail));

    expect(everyDetail).toHaveLength(40);
    expect(everyDetail).not.toContain(defaultAngels.accept.detail);
  });

  it('원고가 도착한 영역은 회차마다 다른 조언이 실린다', async () => {
    // 2026-08-18 원고 병합 전까지는 "모든 회차가 같은 기본 조언을 쓴다"를
    // 고정하던 자리다(UAT 지적의 원인). 이제는 뒤집혀야 한다.
    await useScenarioStore.getState().fetchThemes();

    for (const themeId of ['workplace', 'job-prep', 'relationship', 'daily'] as const) {
      const theme = useScenarioStore.getState().themes.find((t) => t.id === themeId)!;
      const details = theme.episodes.map((e) => e.angels.accept.detail);

      // 10편이 모두 서로 다르고, 기본 문구를 쓰는 편이 하나도 없어야 한다.
      expect(new Set(details).size).toBe(theme.episodes.length);
      expect(details).not.toContain(defaultAngels.accept.detail);
    }
  });

  it('마지막에 합류한 일상 영역도 전 회차에 원고가 실린다', async () => {
    // 여명이 담당 10편(2026-08-18 합류). 직전까지 이 자리는 "전 회차가
    // 기본 조언을 쓴다"를 고정하고 있었다 — 원고가 들어와 뒤집힌 것이다.
    await useScenarioStore.getState().fetchThemes();
    const theme = useScenarioStore.getState().themes.find((t) => t.id === 'daily')!;

    for (const episode of theme.episodes) {
      expect(episode.angels).not.toEqual(defaultAngels);
    }
  });

  it('원고는 세 요정 칸을 모두 채운다 (한 요정만 실리는 일이 없다)', async () => {
    await useScenarioStore.getState().fetchThemes();

    for (const themeId of ['workplace', 'job-prep', 'relationship', 'daily'] as const) {
      const theme = useScenarioStore.getState().themes.find((t) => t.id === themeId)!;

      for (const episode of theme.episodes) {
        for (const key of ['accept', 'reappraisal', 'refocus'] as const) {
          expect(episode.angels[key].detail).not.toBe(defaultAngels[key].detail);
          expect(episode.angels[key].feedback).not.toBe(defaultAngels[key].feedback);
          // 호칭은 CSV가 아니라 constants/strategy.ts가 정본이라 언제나 그대로다.
          expect(episode.angels[key].name).toBe(defaultAngels[key].name);
        }
      }
    }
  });

  it('선택지도 40편 전부 CSV에서 온다 (기본값을 쓰는 회차가 없다)', async () => {
    // 8/13에는 HELPFUL_*/UNHELPFUL_*를 비워 두기로 하고 이 자리가 "아직 기본값을
    // 쓴다"를 고정했다. 2026-08-26에 팔레트가 확정돼 40편에 3+3이 배정되면서
    // 예고대로 뒤집혔다 (docs/qa/2026-08-26-reason-palette.md).
    await useScenarioStore.getState().fetchThemes();

    const episodes = allEpisodes();
    expect(episodes).toHaveLength(40);

    for (const episode of episodes) {
      expect(episode.reasons.helpful).toHaveLength(3);
      expect(episode.reasons.unhelpful).toHaveLength(3);
      expect(episode.reasons.helpful).not.toEqual([...DEFAULT_REASONS.helpful]);
      expect(episode.reasons.unhelpful).not.toEqual([...DEFAULT_REASONS.unhelpful]);
    }
  });

  it('선택지 문구는 전역 팔레트(도움 8 · 비도움 8)를 벗어나지 않는다', async () => {
    // 보고서(utils/strategyStats의 topReasons)가 selectedReason **문자열 빈도**를
    // 세므로, 편 고유 문구가 하나라도 섞이면 그 항목은 영원히 빈도 1로 남아
    // Top3가 "먼저 플레이한 순서"로 무너진다. 집합 크기를 값으로 박아 둔다.
    await useScenarioStore.getState().fetchThemes();
    const episodes = allEpisodes();

    const helpful = new Set(episodes.flatMap((e) => e.reasons.helpful));
    const unhelpful = new Set(episodes.flatMap((e) => e.reasons.unhelpful));

    expect(helpful.size).toBe(8);
    expect(unhelpful.size).toBe(8);
    // 도움/비도움이 같은 문구를 공유하면 한 항목의 빈도가 두 집계에 섞인다.
    expect([...helpful].filter((r) => unhelpful.has(r))).toEqual([]);
  });

  it('팔레트 항목은 저마다 4편 이상에 노출된다', async () => {
    // 노출 편수가 곧 선택 빈도의 상한이다. 한두 편에만 걸린 항목은 보고서에
    // 올라올 길이 사실상 없어 팔레트에 있을 이유가 없다.
    await useScenarioStore.getState().fetchThemes();
    const episodes = allEpisodes();

    for (const key of ['helpful', 'unhelpful'] as const) {
      const counts = new Map<string, number>();
      episodes.forEach((e) =>
        e.reasons[key].forEach((r) => counts.set(r, (counts.get(r) ?? 0) + 1))
      );
      const scarce = [...counts.entries()].filter(([, n]) => n < 4);
      expect(scarce).toEqual([]);
    }
  });

  it('한 회차 안에서 같은 선택지가 두 번 나오지 않는다', async () => {
    // 선택지 문구가 화면의 React key이자 Firestore에 저장되는 값이라 중복이 위험하다.
    await useScenarioStore.getState().fetchThemes();

    for (const episode of allEpisodes()) {
      expect(new Set(episode.reasons.helpful).size).toBe(3);
      expect(new Set(episode.reasons.unhelpful).size).toBe(3);
    }
  });

  it('선택지 배열은 회차끼리 인스턴스를 공유하지 않는다', async () => {
    await useScenarioStore.getState().fetchThemes();

    expect(episodeOf('daily', 2).reasons.helpful).not.toBe(
      episodeOf('daily', 3).reasons.helpful
    );
    expect(episodeOf('daily', 2).reasons.helpful).not.toBe(DEFAULT_REASONS.helpful);
  });

  it('재검사로 반응 기제 버전이 바뀌어도 같은 회차의 조언은 유지된다', async () => {
    // 조인 키가 DOMAIN('직장1')이라 인지/정서/행동 어느 버전이 배치돼도 같다.
    // 조인이 끊기면 기본값으로 떨어지므로, 먼저 기본값이 아님을 확인한 뒤
    // 재검사 전후를 비교한다 — 그러지 않으면 '기본값 == 기본값'으로 통과한다.
    await useScenarioStore.getState().fetchThemes();
    const before = episodeOf('workplace', 1).angels.accept.detail;
    expect(before).not.toBe(defaultAngels.accept.detail);

    setResultType('behavioral');
    await useScenarioStore.getState().fetchThemes();
    const after = episodeOf('workplace', 1);

    expect(after.scenario.reactionType).toBe('행동');
    expect(after.angels.accept.detail).toBe(before);
  });
});

describe('buildEpisodeAngels / buildEpisodeReasons — 폴백 단위', () => {
  const emptyOverride: EpisodeAngelText = {
    domain: '일상9',
    accept: {},
    reappraisal: {},
    refocus: {},
    helpful: [],
    unhelpful: [],
  };

  it('override가 없으면 기본값 객체를 그대로 쓴다', () => {
    expect(buildEpisodeAngels(undefined)).toBe(defaultAngels);
  });

  it('요정 문구는 필드 단위로 폴백한다 (조언만 채워도 나머지가 산다)', () => {
    const angels = buildEpisodeAngels({
      ...emptyOverride,
      accept: { detail: '이번 회차 전용 조언' },
    });

    expect(angels.accept.detail).toBe('이번 회차 전용 조언');
    expect(angels.accept.strategy).toBe(defaultAngels.accept.strategy);
    expect(angels.accept.feedback).toBe(defaultAngels.accept.feedback);
    expect(angels.reappraisal).toEqual(defaultAngels.reappraisal);
  });

  it('detail과 feedback은 서로 독립적으로 폴백한다', () => {
    // 8차 UAT에서 조세현이 지적한 "일률적인 멘트"는 조언(detail)이 아니라
    // 전략 적용 후 주인공 소감(feedback) 자리다. 원고 가이드가 조언 1종만
    // 요구하고 있어, 두 칸 중 하나만 도착하는 상황이 실제로 예상된다 —
    // 그때 채워진 칸만 반영되고 나머지가 기본값으로 살아야 한다.
    const detailOnly = buildEpisodeAngels({
      ...emptyOverride,
      reappraisal: { detail: '이번 회차 전용 조언' },
    });
    expect(detailOnly.reappraisal.detail).toBe('이번 회차 전용 조언');
    expect(detailOnly.reappraisal.feedback).toBe(defaultAngels.reappraisal.feedback);

    const feedbackOnly = buildEpisodeAngels({
      ...emptyOverride,
      reappraisal: { feedback: '이번 회차 전용 소감' },
    });
    expect(feedbackOnly.reappraisal.feedback).toBe('이번 회차 전용 소감');
    expect(feedbackOnly.reappraisal.detail).toBe(defaultAngels.reappraisal.detail);
  });

  it('한 줄 요약(line)은 AngelStrategy.strategy 자리로 들어간다', () => {
    const angels = buildEpisodeAngels({
      ...emptyOverride,
      refocus: { line: '지금 할 수 있는 하나만' },
    });

    expect(angels.refocus.strategy).toBe('지금 할 수 있는 하나만');
  });

  it('선택지는 목록 단위로 폴백한다 (섞이지 않는다)', () => {
    const reasons = buildEpisodeReasons({ ...emptyOverride, helpful: ['새 선택지 하나'] });

    expect(reasons.helpful).toEqual(['새 선택지 하나']);
    expect(reasons.unhelpful).toEqual([...DEFAULT_REASONS.unhelpful]);
  });

  it('빈 override는 기본값과 완전히 같은 결과를 만든다', () => {
    expect(buildEpisodeAngels(emptyOverride)).toEqual(defaultAngels);
    expect(buildEpisodeReasons(emptyOverride)).toEqual({
      helpful: [...DEFAULT_REASONS.helpful],
      unhelpful: [...DEFAULT_REASONS.unhelpful],
    });
  });
});

function countByType(themeId: string): Record<string, number> {
  return reactionTypesOf(themeId).reduce<Record<string, number>>(
    (acc, type) => ({ ...acc, [type]: (acc[type] ?? 0) + 1 }),
    {}
  );
}
