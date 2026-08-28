import { create } from 'zustand';
import { db } from '../api/firebase';
import { IS_MOCK_MODE } from '../api/env';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { COLLECTIONS, SCENARIO_DOCS, CSV_TEXT_FIELD, USER_FIELDS } from '../api/firestoreKeys';
import type { ThemeCategory, EpisodeData, AngelStrategy } from '../api/scenarioMockData';
import { parseAndMergeScenarioCsv, type ScenarioEntry } from '../utils/scenarioCsvParser';
import {
  parseScenarioAngelsCsv,
  type EpisodeAngelText,
  type ScenarioAngelTextMap,
} from '../utils/scenarioAngelsCsvParser';
import {
  parseScenarioEpilogueCsv,
  type ScenarioEpilogueMap,
} from '../utils/scenarioEpilogueCsvParser';
import visualCsv from '../assets/data/scenario_visual.csv?raw';
import dialogueCsv from '../assets/data/scenario_dialogues.csv?raw';
import angelsCsv from '../assets/data/scenario_angels.csv?raw';
import epilogueCsv from '../assets/data/scenario_epilogue.csv?raw';
import { COPY } from '../constants/copy';
import { STRATEGY_META } from '../constants/strategy';
import {
  getReactionTypeCycle,
  reactionKeyFromCsvLabel,
  type ReactionTypeKey,
} from '../constants/reactionType';
import { useTestStore } from './useTestStore';

export interface EpisodeProgress {
  cleared: boolean;
  selectedAngel: 'accept' | 'reappraisal' | 'refocus';
  wasHelpful: boolean;
  selectedReason: string;
  updatedAt: string;
}

export type ScenarioProgressMap = Record<string, EpisodeProgress>;

/** 에필로그 한 편을 본 기록. 고를 것이 없는 장면이라 남길 것은 시각뿐이다. */
export interface EpilogueSeenRecord {
  /** ISO 문자열. 마지막으로 본 시각이며, 다시 보면 갱신된다. */
  seenAt: string;
}

/** themeId → 열람 기록 (users/{uid}.epilogues). 없는 키는 아직 보지 않은 영역이다. */
export type EpilogueSeenMap = Record<string, EpilogueSeenRecord>;

interface ScenarioState {
  progress: ScenarioProgressMap;
  /**
   * 이미 열어 본 완주 보고서의 themeId 목록 (users/{uid}.seenReports).
   *
   * **null은 "아직 모른다"다** — 진행도를 읽기 전이거나 구버전 데이터라
   * 필드가 없는 경우다. 빈 배열([])과 반드시 구분해야 한다: []는 "확실히
   * 하나도 안 봤다"이고, null이면 소비처가 기존 런타임 판정으로 폴백한다.
   */
  seenReports: string[] | null;
  /**
   * 영역별 에필로그 열람 기록 (users/{uid}.epilogues).
   *
   * seenReports와 달리 **null을 쓰지 않는다.** 저쪽은 "아직 모른다"와 "확실히
   * 0건"이 다른 화면(최초 1회 보고서)을 만들지만, 여기가 정하는 것은 카드에
   * '봤어요' 배지를 붙일지 하나뿐이라 두 상태를 가를 이유가 없다. 모르면
   * 안 붙인다.
   */
  epiloguesSeen: EpilogueSeenMap;
  themes: ThemeCategory[];
  /**
   * 현재 themes를 만들 때 쓴 반응 기제 순환 목록의 지문(예: 'cognitive,emotional').
   * 재검사로 우세 유형이 바뀌면 이 값이 달라져 테마가 새 배치로 다시 로드된다.
   */
  themesCycleKey: string | null;
  isLoading: boolean;
  isThemesLoading: boolean;
  error: string | null;
  fetchProgress: (uid: string) => Promise<void>;
  fetchThemes: (cycleOverride?: ReactionTypeKey[]) => Promise<void>;
  clearEpisode: (
    uid: string,
    episodeId: string,
    choice: Omit<EpisodeProgress, 'cleared' | 'updatedAt'>
  ) => Promise<boolean>;
  /** 완주 보고서를 열어 봤음을 기록한다 (이미 있으면 아무것도 하지 않는다) */
  markReportSeen: (uid: string, themeId: string) => Promise<boolean>;
  /** 에필로그를 봤음을 기록한다. 진행도(scenarios)는 건드리지 않는다. */
  markEpilogueSeen: (uid: string, themeId: string) => Promise<boolean>;
  resetProgress: (uid: string) => Promise<boolean>;
}

/** Mock 모드 전용 키. 실 모드에서는 users/{uid}.seenReports 필드가 대신한다. */
const seenReportsKey = (uid: string) => `react_seen_reports_${uid}`;

/** Mock 모드 전용 키. 실 모드에서는 users/{uid}.epilogues 필드가 대신한다. */
const epiloguesKey = (uid: string) => `react_epilogues_${uid}`;

/**
 * 진행 저장(setDoc)에 거는 상한 시간(ms).
 *
 * Firestore 웹 SDK는 오프라인에서 쓰기를 **로컬에 큐잉하고 연결이 돌아올
 * 때까지 promise를 resolve하지 않는다**. 에러가 아니라 무한 대기라서,
 * 오프라인으로 전략을 제출하면 아무 안내 없이 스피너만 계속 돌았다
 * (2026-08-12 UAT). 상한을 넘기면 대기를 끊고 실패로 처리한다.
 *
 * 8초로 잡은 이유: 느린 모바일 회선의 정상 쓰기(2~3초)를 오판하지 않으면서,
 * "고장 났나?" 하고 화면을 떠나기 전에는 답을 주는 구간이다.
 *
 * ⚠️ 끊는 것은 **대기**뿐이고 쓰기 자체를 취소하지는 못한다. 연결이
 * 돌아오면 큐에 남은 쓰기가 뒤늦게 반영될 수 있다 — 같은 에피소드를 다시
 * 저장해도 문서 경로·필드가 같아 마지막 값으로 수렴하므로 문제되지 않는다.
 */
export const SCENARIO_SAVE_TIMEOUT_MS = 8000;

/** 상한 초과를 다른 실패와 구분하기 위한 표식. */
export class SaveTimeoutError extends Error {
  constructor() {
    super('scenario save timed out');
    this.name = 'SaveTimeoutError';
  }
}

/** promise가 ms 안에 끝나지 않으면 SaveTimeoutError로 reject한다. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SaveTimeoutError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// 요정 고정 매핑 데이터
//
// 호칭은 constants/strategy.ts의 fairyName을 그대로 참조한다 — 이름의
// 단일 출처는 STRATEGY_META 하나이며, 여기에 문자열을 다시 적지 않는다.
// 2026-08-06 이전에는 여기에 색 이름('파랑이')을 직접 적어 두 출처가
// 어긋났고, strategy.ts의 이미지 매핑만 바로잡았을 때 플레이어가 노란
// 요정을 띄워 놓고 "초록이"라 부르는 상태가 잠시 생겼다.
//
// 확정된 캐릭터 이름은 아코(수용) · 포코(재평가) · 리프(재초점)이며
// (소개자료 요정 표 · 랜딩 시안), 2026-08-06 사용자 확정으로 엔딩뿐
// 아니라 플레이어 · 회복일기까지 앱 전역이 이 이름을 쓴다.
//
// strategy 필드의 영문 병기("수용 (Acceptance)")는 2026-08-08에 걷어냈다.
// 앱 안에서 영문 용어를 노출하지 않는 것이 확정 표기이고(교정 5번), 랜딩의
// 영문 병기는 소개용이라 별개다.
//
// strategy(한 줄 요약)의 기본값은 STRATEGY_META의 shortLabel을 그대로 참조한다.
// 문자열을 여기 다시 적으면 안 된다 — AngelDetailPanel이 "이 값이 기본값인가"를
// shortLabel과 비교해 판단하고(기본값이면 같은 말이 세 번 겹쳐서 줄을 숨긴다),
// 두 출처가 어긋나면 원고 없는 회차에도 중복된 줄이 다시 살아난다.
export const defaultAngels = {
  accept: {
    name: STRATEGY_META.accept.fairyName,
    strategy: STRATEGY_META.accept.shortLabel,
    detail: '상황을 판단하거나 통제하려 하지 않고 있는 그대로 바라보며, 현재의 부정적인 감정을 비난 없이 받아들입니다.',
    feedback: '있는 그대로 받아들이니 마음이 한결 편안해졌어.'
  } as AngelStrategy,
  reappraisal: {
    name: STRATEGY_META.reappraisal.fairyName,
    strategy: STRATEGY_META.reappraisal.shortLabel,
    detail: '부정적인 상황의 의미를 긍정적인 방향으로 재해석하여 스트레스를 줄이고 새로운 기회로 바라봅니다.',
    feedback: '생각을 바꾸니 더 긍정적인 면이 보이네!'
  } as AngelStrategy,
  refocus: {
    name: STRATEGY_META.refocus.fairyName,
    strategy: STRATEGY_META.refocus.shortLabel,
    detail: '부정적 감정에 머물지 않고, 문제를 해결하거나 상황을 개선하기 위한 실질적인 계획과 행동에 주의를 돌립니다.',
    feedback: '이제 내가 할 수 있는 일에 집중해야겠어.'
  } as AngelStrategy
};

/**
 * 에피소드별 선택지가 없을 때 쓰는 기본 도움/비도움 요인.
 *
 * 2026-08-11 UAT에서 "조언도 선택지도 120편 내내 똑같다"는 지적을 받아
 * 에피소드별 원고를 받을 수 있게 열었지만(scenario_angels.csv), 원고가
 * 도착하기 전까지는 이 값이 그대로 쓰인다.
 *
 * 2026-08-26 도움 8 · 비도움 8 팔레트를 확정해 40편에 3+3씩 배정했다.
 * **정본은 CSV다** — 여기 6개는 CSV 유실·열 누락 시의 안전망으로만 남긴다
 * (설계 근거: docs/qa/2026-08-26-reason-palette.md).
 */
export const DEFAULT_REASONS: { helpful: readonly string[]; unhelpful: readonly string[] } = {
  helpful: ['감정을 편안하게 해줌', '새로운 관점을 제시함', '실질적인 도움이 됨'],
  unhelpful: ['상황에 맞지 않음', '공감되지 않음', '너무 이상적임'],
};

/**
 * 에피소드별 원고(있으면)를 기본 요정 문구 위에 얹는다.
 *
 * 폴백은 **필드 단위**다 — 시트에서 조언만 채우고 실행 대사를 비워 둬도
 * 그 칸만 기본값으로 살아난다. 요정 이름(name)은 덮어쓰지 않는다:
 * 호칭의 단일 출처는 constants/strategy.ts의 STRATEGY_META이며, CSV가
 * 이름까지 바꿀 수 있게 하면 두 출처가 다시 어긋난다(2026-08-06 사고).
 */
export function buildEpisodeAngels(override?: EpisodeAngelText): EpisodeData['angels'] {
  if (!override) return defaultAngels;

  const merge = (key: keyof typeof defaultAngels): AngelStrategy => {
    const base = defaultAngels[key];
    const text = override[key];
    return {
      name: base.name,
      strategy: text.line ?? base.strategy,
      detail: text.detail ?? base.detail,
      feedback: text.feedback ?? base.feedback,
    };
  };

  return {
    accept: merge('accept'),
    reappraisal: merge('reappraisal'),
    refocus: merge('refocus'),
  };
}

/**
 * 에피소드별 선택지(있으면)로 기본 선택지를 대체한다.
 *
 * 폴백 단위는 **목록 전체**다(요정 문구와 다르다). 도움/비도움 목록은 한
 * 화면에 나란히 놓이는 한 벌이라, 일부만 갈아 끼우면 새 문구와 기본 문구가
 * 섞여 어조가 어긋난다. 배열은 매번 새로 만든다 — 에피소드끼리 같은 배열
 * 인스턴스를 공유하면 소비처의 실수 한 번이 전 회차에 번진다.
 */
export function buildEpisodeReasons(override?: EpisodeAngelText): EpisodeData['reasons'] {
  return {
    helpful: override?.helpful.length ? [...override.helpful] : [...DEFAULT_REASONS.helpful],
    unhelpful: override?.unhelpful.length
      ? [...override.unhelpful]
      : [...DEFAULT_REASONS.unhelpful],
  };
}

export const useScenarioStore = create<ScenarioState>((set, get) => ({
  progress: {},
  seenReports: null,
  epiloguesSeen: {},
  themes: [],
  themesCycleKey: null,
  isLoading: false,
  isThemesLoading: false,
  error: null,

  fetchThemes: async (cycleOverride?: ReactionTypeKey[]) => {
    // 어떤 반응 기제 버전의 시나리오를 보여줄지는 스트레스 검사의 우세 유형이
    // 정한다 (공유 계약 4번). 단일형은 한 유형 10편, 혼합형은 두 유형 교대,
    // 균형형은 세 유형 순환. resultType이 없는 레거시·미검사 데이터는 인지 폴백.
    // cycleOverride는 테스트·디버그용 주입구다.
    const resultType = useTestStore.getState().stressResult?.resultType;
    const cycle: ReactionTypeKey[] =
      cycleOverride ?? (resultType ? getReactionTypeCycle(resultType) : ['cognitive']);
    const cycleKey = cycle.join(',');

    // 같은 배치로 이미 로드했으면 스킵. 재검사로 순환이 바뀌면 다시 배치한다.
    if (get().themes.length > 0 && get().themesCycleKey === cycleKey) return;

    set({ isThemesLoading: true, error: null });

    let rawVisualCsv = visualCsv;
    let rawDialogueCsv = dialogueCsv;
    let rawAngelsCsv = angelsCsv;
    let rawEpilogueCsv = epilogueCsv;

    if (!IS_MOCK_MODE) {
      try {
        const visualRef = doc(db, COLLECTIONS.SCENARIOS, SCENARIO_DOCS.VISUAL);
        const visualSnap = await getDoc(visualRef);
        if (visualSnap.exists() && visualSnap.data()[CSV_TEXT_FIELD]) {
          rawVisualCsv = visualSnap.data()[CSV_TEXT_FIELD];
        }

        const dialogueRef = doc(db, COLLECTIONS.SCENARIOS, SCENARIO_DOCS.DIALOGUE);
        const dialogueSnap = await getDoc(dialogueRef);
        if (dialogueSnap.exists() && dialogueSnap.data()[CSV_TEXT_FIELD]) {
          rawDialogueCsv = dialogueSnap.data()[CSV_TEXT_FIELD];
        }

        // scenarios/angels는 어드민에 아직 업로드 메뉴가 없다(firestoreKeys 주석 참고).
        // 문서가 없으면 exists()가 false여서 번들된 로컬 CSV가 그대로 남는다 —
        // 즉 이 읽기가 실패하거나 비어 있어도 화면은 정상이다.
        const angelsRef = doc(db, COLLECTIONS.SCENARIOS, SCENARIO_DOCS.ANGELS);
        const angelsSnap = await getDoc(angelsRef);
        if (angelsSnap.exists() && angelsSnap.data()[CSV_TEXT_FIELD]) {
          rawAngelsCsv = angelsSnap.data()[CSV_TEXT_FIELD];
        }

        // 에필로그도 같은 계약이다 — 문서가 없으면 번들된 로컬 CSV가 그대로
        // 남는다. 어드민 "시나리오 관리 (CSV)"에 업로드 메뉴가 붙어 있다.
        const epilogueRef = doc(db, COLLECTIONS.SCENARIOS, SCENARIO_DOCS.EPILOGUE);
        const epilogueSnap = await getDoc(epilogueRef);
        if (epilogueSnap.exists() && epilogueSnap.data()[CSV_TEXT_FIELD]) {
          rawEpilogueCsv = epilogueSnap.data()[CSV_TEXT_FIELD];
        }
      } catch (err) {
        console.error('Failed to fetch scenarios from Firestore, falling back to local CSV', err);
      }
    }

    const scenarios = parseAndMergeScenarioCsv(rawVisualCsv, rawDialogueCsv);
    // DOMAIN('일상1') → 에피소드별 요정 문구·선택지. 없는 에피소드는 기본값으로 산다.
    const angelTexts: ScenarioAngelTextMap = parseScenarioAngelsCsv(rawAngelsCsv);
    // DOMAIN('일상') → 영역별 에필로그. 회차 번호가 없는 것이 위와 다른 점이며,
    // 원고가 없는 영역은 undefined로 남아 목록에 카드 자체가 서지 않는다.
    const epilogues: ScenarioEpilogueMap = parseScenarioEpilogueCsv(rawEpilogueCsv);

    // 4영역으로 분류 (직장, 취업준비, 연인, 일상)
    // 각 영역당 10개 에피소드
    //
    // description은 1뎁스 카드(ThemeListView)와 2뎁스 헤더 부제
    // (EpisodeListView)에 **같은 문자열**로 선다. 2026-08-27 3차 UAT(R3-01)에서
    // 네 문구가 확정됐다 — 예전 문구에는 '대처하기·다루기·극복하기' 같은
    // 서술어가 붙어 12px 카드에서 두 줄을 넘겼고, 영역을 고르는 데 필요한
    // 것은 "무엇에 관한 영역인가"뿐이라 명사구로 줄였다.
    const domains = [
      { id: 'workplace', prefix: '직장', title: '직장', description: '직장 생활에서 겪는 어려움', icon: 'work' },
      { id: 'job-prep', prefix: '취업준비', title: '취업준비', description: '취업 준비 과정의 스트레스', icon: 'school' },
      { id: 'relationship', prefix: '연인', title: '연인', description: '연인 간 오해와 갈등', icon: 'favorite' },
      { id: 'daily', prefix: '일상', title: '일상', description: '일상에서 마주하는 도전들', icon: 'home' },
    ];

    const themes: ThemeCategory[] = domains.map(d => {
      // 회차는 배열 순서가 아니라 **도메인 번호**('직장3'의 3)로 고정한다.
      // CSV 행 순서에 기대면 유형별로 행이 빠지거나 순서가 바뀔 때 회차가
      // 통째로 밀려, 재검사 후 진행도가 엉뚱한 에피소드에 매핑된다.
      const versionsByNumber = new Map<number, Map<ReactionTypeKey, ScenarioEntry>>();
      scenarios.forEach((s) => {
        if (!s.domain.startsWith(d.prefix)) return;
        const suffix = s.domain.slice(d.prefix.length);
        if (!/^\d+$/.test(suffix)) return;
        const reactionKey = reactionKeyFromCsvLabel(s.reactionType);
        if (!reactionKey) return;

        const episodeNo = Number(suffix);
        if (!versionsByNumber.has(episodeNo)) versionsByNumber.set(episodeNo, new Map());
        versionsByNumber.get(episodeNo)!.set(reactionKey, s);
      });

      const orderedNumbers = [...versionsByNumber.keys()].sort((a, b) => a - b);

      const episodes: EpisodeData[] = orderedNumbers.map((episodeNo, idx) => {
        const versions = versionsByNumber.get(episodeNo)!;
        // i번째 에피소드는 cycle[i % cycle.length] 유형의 버전. 콘텐츠가 3버전을
        // 모두 갖추고 있어 보통 첫 시도에 잡히지만, 누락된 유형이 있어도 회차 수가
        // 줄지 않도록 순환의 다른 유형 → 남은 아무 버전 순으로 폴백한다.
        const scenario =
          versions.get(cycle[idx % cycle.length]) ??
          cycle.map((key) => versions.get(key)).find((v): v is ScenarioEntry => !!v) ??
          [...versions.values()][0];

        // 요정 문구는 반응 기제 버전과 무관하게 **에피소드 단위**다. 그래서
        // 조인 키는 선택된 버전의 DOMAIN('일상1') 하나이며, 재검사로 다른
        // 버전이 배치돼도 같은 조언이 따라온다.
        const angelText = angelTexts.get(scenario.domain);

        return {
          // 에피소드 id는 유형과 무관하게 유지한다 — 재검사로 배치가 바뀌어도
          // 기존 진행도가 같은 회차에 매핑되는 것이 의도된 동작이다 (공유 계약 4번).
          id: `${d.id}-ep${idx + 1}`,
          episodeNumber: idx + 1,
          title: scenario.title,
          // 첫 장면 내레이션을 **자르지 않고** 그대로 싣는다 (2026-08-27 R2-08).
          // 예전에는 여기서 40자로 잘라 ' ...'를 붙였는데, 카드가 그것을 다시
          // CSS truncate로 잘라 한 문장이 두 번 잘렸다. 어디서 어떻게 줄일지는
          // 화면이 정한다 — 접힌 카드는 첫 문장만, 펼친 카드는 전문이다
          // (utils/episodeSummary).
          summary: scenario.scenes[0]?.text ?? '',
          scenario,
          angels: buildEpisodeAngels(angelText),
          reasons: buildEpisodeReasons(angelText),
        };
      });

      return {
        id: d.id,
        title: d.title,
        description: d.description,
        icon: d.icon,
        episodes,
        // 에필로그의 조인 키는 영역 이름 하나('직장')다. episodes와 나란히
        // 두되 **그 배열 안에 넣지 않는다** — 완주 판정의 분모가 늘어나면
        // 엔딩 해금·앨범 진행도까지 함께 어긋난다(ThemeCategory 주석 참조).
        epilogue: epilogues.get(d.prefix),
      };
    });

    set({ themes, themesCycleKey: cycleKey, isThemesLoading: false });
  },

  // 진행도와 seenReports를 **한 번에** 읽는다 — 둘 다 users/{uid} 한 문서에
  // 있으므로 읽기를 두 번 하지 않는다. seenReports가 없으면 null로 남겨
  // 소비처가 런타임 판정으로 폴백하게 한다(구버전 데이터 호환).
  fetchProgress: async (uid: string) => {
    set({ isLoading: true, error: null });

    if (IS_MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const localData = localStorage.getItem(`react_scenario_${uid}`);
      const seenRaw = localStorage.getItem(seenReportsKey(uid));
      const epiloguesRaw = localStorage.getItem(epiloguesKey(uid));
      set({
        progress: localData ? (JSON.parse(localData) as ScenarioProgressMap) : {},
        seenReports: seenRaw ? (JSON.parse(seenRaw) as string[]) : null,
        epiloguesSeen: epiloguesRaw ? (JSON.parse(epiloguesRaw) as EpilogueSeenMap) : {},
        isLoading: false,
      });
      return;
    }

    try {
      const docRef = doc(db, COLLECTIONS.USERS, uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        const seen = data[USER_FIELDS.SEEN_REPORTS];
        const epiloguesRaw = data[USER_FIELDS.EPILOGUES];
        set({
          progress: (data.scenarios as ScenarioProgressMap | undefined) ?? {},
          seenReports: Array.isArray(seen) ? (seen as string[]) : null,
          // 맵이 아닌 값이 들어와 있어도(레거시·수기 편집) 빈 맵으로 떨어뜨린다.
          // 이 값이 정하는 것은 배지 하나뿐이라, 의심스러우면 안 붙이는 쪽이 맞다.
          epiloguesSeen:
            epiloguesRaw && typeof epiloguesRaw === 'object' && !Array.isArray(epiloguesRaw)
              ? (epiloguesRaw as EpilogueSeenMap)
              : {},
          isLoading: false,
        });
        return;
      }
      set({ progress: {}, seenReports: null, epiloguesSeen: {}, isLoading: false });
    } catch (err) {
      console.error('Error fetching scenario progress:', err);
      set({
        error: err instanceof Error ? err.message : COPY.errors.scenarioLoadFailed,
        isLoading: false,
      });
    }
  },

  clearEpisode: async (
    uid: string,
    episodeId: string,
    choice: Omit<EpisodeProgress, 'cleared' | 'updatedAt'>
  ) => {
    set({ isLoading: true, error: null });
    const currentProgress = get().progress;
    
    const episodeData: EpisodeProgress = {
      ...choice,
      cleared: true,
      updatedAt: new Date().toISOString(),
    };

    const newProgress = {
      ...currentProgress,
      [episodeId]: episodeData,
    };

    if (IS_MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      localStorage.setItem(`react_scenario_${uid}`, JSON.stringify(newProgress));
      set({ progress: newProgress, isLoading: false });
      return true;
    }

    try {
      const docRef = doc(db, COLLECTIONS.USERS, uid);
      // 오프라인에서 영원히 대기하지 않도록 상한을 건다 (위 주석 참조).
      await withTimeout(
        setDoc(docRef, { scenarios: newProgress }, { merge: true }),
        SCENARIO_SAVE_TIMEOUT_MS
      );
      set({ progress: newProgress, isLoading: false });
      return true;
    } catch (err) {
      console.error('Error saving scenario progress:', err);
      // 화면에 그대로 노출되는 값이라 SDK 원문(영문 메시지)을 담지 않는다.
      // 상한 초과는 "네트워크를 확인하라"로, 나머지는 일반 저장 실패로 가른다.
      set({
        error:
          err instanceof SaveTimeoutError
            ? COPY.errors.scenarioSaveTimeout
            : COPY.errors.scenarioSaveFailed,
        isLoading: false,
      });
      return false;
    }
  },

  // 완주 보고서를 열어 봤다는 기록. 진행도와 같은 계약(merge:true / Mock 시
  // localStorage)을 따르고, 이미 담긴 themeId면 쓰기를 생략한다.
  //
  // 실패해도 화면 흐름은 막지 않는다(false만 돌려준다) — 최악의 경우
  // "최초 1회 보고서"가 한 번 더 뜨는 것이고, 그건 데이터를 잃는 일이 아니다.
  markReportSeen: async (uid: string, themeId: string) => {
    const current = get().seenReports ?? [];
    if (current.includes(themeId)) return true;
    const next = [...current, themeId];

    if (IS_MOCK_MODE) {
      localStorage.setItem(seenReportsKey(uid), JSON.stringify(next));
      set({ seenReports: next });
      return true;
    }

    try {
      const docRef = doc(db, COLLECTIONS.USERS, uid);
      await setDoc(docRef, { [USER_FIELDS.SEEN_REPORTS]: next }, { merge: true });
      set({ seenReports: next });
      return true;
    } catch (err) {
      console.error('Error saving seen report:', err);
      return false;
    }
  },

  // 에필로그를 봤다는 기록.
  //
  // ⚠️ **progress(scenarios 맵)를 건드리지 않는다.** 에필로그는 전략을 고르지도
  // 평가하지도 않는 읽기 전용 장면이라 EpisodeProgress에 담을 값이 없고, 담으면
  // 영역 완주 판정의 분모만 늘어 엔딩 해금·회복 앨범·핵심 요인 Top3가 한꺼번에
  // 어긋난다 (USER_FIELDS.EPILOGUES 주석).
  //
  // 이미 본 영역을 다시 봐도 **시각을 갱신한다** — markReportSeen이 "이미 있으면
  // 쓰기를 생략"하는 것과 반대인데, 저쪽은 최초 1회를 판정하는 기록이고 여기는
  // 마지막으로 본 때를 남기는 기록이라 성격이 다르다. 다시 보기가 허용된 화면이니
  // 마지막 열람 시각이 사실과 맞아야 한다.
  //
  // 실패해도 화면 흐름은 막지 않는다(false만 돌려준다). 최악의 경우 '봤어요'
  // 배지가 붙지 않는 것이고, 그건 데이터를 잃는 일이 아니다.
  markEpilogueSeen: async (uid: string, themeId: string) => {
    const record: EpilogueSeenRecord = { seenAt: new Date().toISOString() };
    const next: EpilogueSeenMap = { ...get().epiloguesSeen, [themeId]: record };

    if (IS_MOCK_MODE) {
      localStorage.setItem(epiloguesKey(uid), JSON.stringify(next));
      set({ epiloguesSeen: next });
      return true;
    }

    try {
      const docRef = doc(db, COLLECTIONS.USERS, uid);
      // 중첩 맵을 통째로 다시 쓰지 않고 그 영역 키만 merge한다 — 다른 기기에서
      // 먼저 본 영역의 기록을 이 쓰기가 지우지 않게 하기 위해서다.
      await withTimeout(
        setDoc(docRef, { [USER_FIELDS.EPILOGUES]: { [themeId]: record } }, { merge: true }),
        SCENARIO_SAVE_TIMEOUT_MS
      );
      set({ epiloguesSeen: next });
      return true;
    } catch (err) {
      console.error('Error saving epilogue view:', err);
      return false;
    }
  },

  resetProgress: async (uid: string) => {
    set({ isLoading: true, error: null });

    if (IS_MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      localStorage.removeItem(`react_scenario_${uid}`);
      localStorage.removeItem(seenReportsKey(uid));
      localStorage.removeItem(epiloguesKey(uid));
      set({ progress: {}, seenReports: [], epiloguesSeen: {}, isLoading: false });
      return true;
    }

    try {
      const docRef = doc(db, COLLECTIONS.USERS, uid);
      // 보고서 열람 기록도 함께 비운다 — 진행도를 지웠는데 "이미 봤다"는
      // 기록만 남으면 처음부터 다시 하는 사용자가 최초 보고서를 못 본다.
      // 에필로그 열람 기록도 함께 비운다. 처음부터 다시 하는 사용자에게
      // 잠긴 카드가 '봤어요' 상태로 남아 있으면 앞뒤가 맞지 않는다.
      await setDoc(
        docRef,
        { scenarios: {}, [USER_FIELDS.SEEN_REPORTS]: [], [USER_FIELDS.EPILOGUES]: {} },
        { merge: true }
      );
      set({ progress: {}, seenReports: [], epiloguesSeen: {}, isLoading: false });
      return true;
    } catch (err) {
      console.error('Error resetting scenario progress:', err);
      set({
        error: err instanceof Error ? err.message : COPY.errors.scenarioResetFailed,
        isLoading: false,
      });
      return false;
    }
  },
}));
