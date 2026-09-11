// src/App.tsx
// SYU-REACT 메인 앱 엔트리
// 라우팅: 랜딩 → 로그인 → 회원가입 → 홈 (Firebase Auth 상태 기반)

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from './store/useAuthStore';
import { useCharacterStore } from './store/useCharacterStore';
import { useConsentStore } from './store/useConsentStore';
import { useScenarioStore } from './store/useScenarioStore';
import { useSettingsStore } from './store/useSettingsStore';
import { useTestStore } from './store/useTestStore';
import { computeAlbumProgress } from './utils/strategyStats';
import {
  formatScenarioPath,
  parseScenarioRoute,
  splitHashSegments,
} from './utils/scenarioRoute';
import MobileWrapper from './components/MobileWrapper';
import ConsentGate from './components/common/ConsentGate';
import NoticeBanner from './components/common/NoticeBanner';
import Toast from './components/ui/Toast';
import { COPY } from './constants/copy';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import HomePage, { type HomeTabId } from './pages/HomePage';
import CharacterCreationPage from './pages/CharacterCreationPage';
import TestUnifiedPage from './pages/TestUnifiedPage';

// ─── 주소(해시) 체계 ────────────────────────────────────
//
// 화면 하나에 주소 하나가 원칙이다(2026-08-18 사용자 지시 — "모든 페이지에
// 다 달아 줘"). 홈 셸(헤더 + 하단 탭바) 안에서만 살던 탭·오버레이 넷도
// 여기서 주소를 받는다:
//
//   #scenario  시나리오 탭      #diary   회복일기 탭
//   #mypage    마이페이지       #ending  최종 엔딩
//
// 그래서 HomePage는 탭·오버레이 상태를 스스로 갖지 않고 **여기서 내려받는다**
// (controlled component). 상태를 두 곳에 두면 주소와 화면이 갈라지기 때문이다.
//
// ─── 시나리오 탭만 주소가 한 겹 더 깊다 (2026-08-27, R2-06 1단계) ───
//
//   #scenario/<themeId>            영역의 에피소드 목록
//   #scenario/<themeId>/<n>        n번째 에피소드 플레이어 (처음부터)
//   #scenario/<themeId>/epilogue   에필로그 플레이어
//
// 시나리오는 앞 화면에서 고른 값이 **영역 id와 회차 번호뿐**이라 주소만으로
// 온전히 복원된다. 그래서 예외를 여기 하나 열었다. 하위 경로의 문법과 판정은
// utils/scenarioRoute(순수 함수)가 갖고, 이 파일은 그 문자열을 주소에 붙였다
// 떼는 일만 한다. 해금되지 않은 회차·없는 영역은 ScenarioTab이 진행도를 보고
// 영역 목록으로 되돌린다 — 여기서는 진행도를 모른다.
//
// 반대로 **나머지 탭 안쪽의 뷰 상태 머신은 여전히 주소로 쪼개지 않는다** —
// 시나리오 플레이어의 단계(상황/요정/전략/평가)와 완주 보고서, 회복일기의
// 목록/상세, 검사의 준비/진행/결과가 그것이다. 이들은 진행 중인 선택(고른
// 전략·답안)에 의존해서 주소만으로는 복원할 수 없고, 복원되지 않는 주소는
// "열리는 척하다 깨지는" 화면을 만든다. 직접 진입하면 각 탭·페이지의 첫
// 화면으로 수렴한다.
// (검사는 TestUnifiedPage가 마운트 시 step을 'prep'으로 되돌리므로 자동이다.)
type Page =
  | 'landing'
  | 'login'
  | 'signup'
  | 'home'
  | 'scenario'
  | 'diary'
  | 'mypage'
  | 'ending'
  | 'character-creation'
  | 'test-adhd'
  | 'test-stress';

const validPages: Page[] = [
  'landing',
  'login',
  'signup',
  'home',
  'scenario',
  'diary',
  'mypage',
  'ending',
  'character-creation',
  'test-adhd',
  'test-stress',
];

/** 로그인 없이도 볼 수 있는 주소. 나머지는 전부 세션이 필요하다. */
const publicPages: Page[] = ['landing', 'login', 'signup'];
const requiresAuth = (page: Page) => !publicPages.includes(page);

/** 홈 셸(HomePage) 안에서 도는 주소들 */
const homeShellPages = ['home', 'scenario', 'diary', 'mypage', 'ending'] as const;
type HomeShellPage = (typeof homeShellPages)[number];
const isHomeShellPage = (page: Page): page is HomeShellPage =>
  (homeShellPages as readonly string[]).includes(page);

/** 하단 탭바가 직접 가리키는 세 주소 — 오버레이가 닫힐 때 돌아갈 바닥이다. */
const homeTabPages = ['home', 'scenario', 'diary'] as const;
type HomeTabPage = (typeof homeTabPages)[number];
const isHomeTabPage = (page: Page): page is HomeTabPage =>
  (homeTabPages as readonly string[]).includes(page);

const TAB_BY_PAGE: Record<HomeTabPage, HomeTabId> = {
  home: 'home',
  scenario: 'scenario',
  diary: 'analysis',
};
const PAGE_BY_TAB: Record<HomeTabId, HomeTabPage> = {
  home: 'home',
  scenario: 'scenario',
  analysis: 'diary',
};

/**
 * 현재 주소의 세그먼트들. '#scenario/workplace/1' → ['scenario','workplace','1'].
 *
 * **첫 조각만 페이지다.** 나머지는 그 페이지의 하위 경로로 넘긴다 — 예전처럼
 * 해시 전체를 페이지 이름과 대조하면 `#scenario/workplace`가 "모르는 주소"가
 * 되어 튕긴다.
 */
const hashSegments = (): string[] => splitHashSegments(window.location.hash);

/** 현재 주소에서 페이지를 읽는다. 모르는 해시면 null. */
const parseHash = (): Page | null => {
  const [first] = hashSegments();
  return validPages.includes(first as Page) ? (first as Page) : null;
};

/** 현재 주소에서 시나리오 하위 경로를 읽는다 ('' | '/workplace' | '/workplace/1'). */
const parseScenarioPathFromHash = (): string =>
  formatScenarioPath(parseScenarioRoute(hashSegments().slice(1)));

const getInitialPage = (): Page => parseHash() ?? 'landing';

/** 첫 진입의 하위 경로. #scenario로 들어온 게 아니면 빈 문자열이다. */
const getInitialScenarioPath = (): string =>
  parseHash() === 'scenario' ? parseScenarioPathFromHash() : '';

/**
 * 첫 진입 주소를 **정규화하며 고쳐 써야 하는가.**
 *
 * 해시가 없거나(`/`) 모르는 주소인 경우가 하나이고, `#scenario/a/b/c`처럼
 * 페이지는 맞는데 하위 경로의 모양이 어긋난 경우가 다른 하나다. 어느 쪽이든
 * 사용자의 이동이 아니라 **정리**이므로 히스토리에 쌓으면 안 된다 — 쌓으면
 * 뒤로가기 한 번이 같은 화면에 낭비되어 앱을 빠져나가지 못한다.
 */
const needsInitialHashRewrite = (): boolean => {
  const page = parseHash();
  if (page === null) return true;
  const body = page === 'scenario' ? `scenario${parseScenarioPathFromHash()}` : page;
  return hashSegments().join('/') !== body;
};

/**
 * 이 주소에서 ScenarioTab이 화면에 남아 있는가.
 *
 * 마이페이지·엔딩은 시나리오 탭 **위에 덮이는** 오버레이라 탭이 언마운트되지
 * 않는다. 그래서 오버레이를 닫으면 보고 있던 에피소드 목록으로 돌아와야 하고,
 * 그러려면 하위 경로를 그동안 들고 있어야 한다. 반대로 다른 탭·페이지로 옮기면
 * ScenarioTab이 언마운트되어 뷰 상태가 초기화되므로, 하위 경로만 남으면 주소와
 * 화면이 갈라진다 — 그때는 버린다.
 */
const keepsScenarioSubPath = (page: Page): boolean =>
  page === 'scenario' || page === 'mypage' || page === 'ending';

// ─── 복귀 재조회 (다중 기기 동기화 완화, N-5) ───────────────
//
// 저장소 전체에 onSnapshot이 **한 건도 없다.** 모든 Firestore 읽기가 getDoc
// 일회성이라 기기 사이에 아무것도 전파되지 않는다. 기기 B에서 계정을
// 초기화해도 기기 A는 옛 상태를 그대로 들고 있고, 그 상태로 에피소드를 하나
// 마치면 clearEpisode가 `{...옛 progress, [id]: 새 값}`을 통째로 써서
// **지운 진행도를 되살린다**
// (docs/qa/2026-08-12-uat-remaining-issues.md §2 N-5).
//
// 실시간 구독은 비용·구독 해제·오프라인 동작을 전부 다시 봐야 하는 큰 공사라,
// 합의된 저비용 처방인 "창으로 돌아왔을 때 한 번 더 읽기"만 넣는다. 완전한
// 동기화가 아니라 **발산이 오래 남지 않게 하는 완화책**이다.

/**
 * 복귀 재조회의 최소 간격(ms).
 *
 * 스로틀은 선택이 아니라 **필수**다. 재조회 한 번은 users/{uid} 한 문서를
 * 세 액션(캐릭터·검사 결과·진행도)이 각자 getDoc하므로 **문서 읽기 3회**로
 * 과금된다. 게다가 탭으로 돌아오면 visibilitychange와 focus가 **둘 다**
 * 발생하므로, 막지 않으면 복귀 한 번에 6회가 나간다.
 *
 * 30초로 잡은 이유: 다른 기기를 만지고 돌아오는 실제 왕복은 아무리 빨라도
 * 수십 초라 이 창에 걸리지 않는 반면, 앱과 참고 자료를 왔다 갔다 하는
 * 반사적인 탭 전환(분당 수십 회)은 한 번으로 접힌다. 상한이 분당 2회 =
 * 읽기 6회/분이라 사용자당 시간당 360회를 넘지 않는다 — 스로틀이 없으면
 * 같은 사용자가 10분 만에 그만큼을 쓴다.
 */
export const RESYNC_THROTTLE_MS = 30_000;

/** getState/setState만 빌려 쓰는 최소 스토어 계약 (zustand 스토어가 그대로 만족한다). */
type LoadingStoreApi = {
  getState: () => { isLoading: boolean };
  setState: (partial: { isLoading: boolean }) => void;
};

/**
 * 스토어의 **기존** fetch 액션을 로딩 표시 없이 부른다.
 *
 * 세 fetch 액션은 모두 첫 줄에서 `set({ isLoading: true })`를 한다. 그대로
 * 부르면 복귀할 때마다 홈 여정 카드(HomeTab)와 시나리오·회복일기 목록이
 * 스피너로 덮였다 돌아온다 — 이미 화면에 있는 데이터를 새로 고치는 일이라
 * 그 깜빡임은 정보가 아니라 잡음이다.
 *
 * 액션 본문은 첫 await까지 **동기로** 도는 async 함수라, 호출이 반환된
 * 시점에는 isLoading이 이미 true다. 같은 이벤트 틱 안에서 곧바로 되돌리면
 * React가 두 변경을 한 번에 반영해 스피너가 그려질 프레임 자체가 생기지
 * 않는다. 되돌리는 값은 false가 아니라 **호출 직전 값**이다 — 마침 진짜
 * 로딩이 걸려 있었다면 그 스피너까지 꺼 버리면 안 된다.
 */
function fetchQuietly(store: LoadingStoreApi, run: () => Promise<unknown>): void {
  const wasLoading = store.getState().isLoading;
  void run();
  store.setState({ isLoading: wasLoading });
}

export default function App() {
  const { user, isLoading, initAuthListener, clearError } = useAuthStore();
  const { resetCharacter } = useCharacterStore();
  const { status: consentStatus, fetchConsent, resetConsent } = useConsentStore();
  const fetchSettings = useSettingsStore((state) => state.fetchSettings);
  const [currentPage, setCurrentPage] = useState<Page>(getInitialPage());

  // #scenario 뒤에 붙는 하위 경로 ('' | '/workplace' | '/workplace/1' | …).
  // 문자열로 들고 있는 것은 의도적이다 — 파싱한 객체를 상태로 두면 렌더마다
  // 신원이 바뀌어 아래 동기화 이펙트가 스스로를 다시 깨운다.
  const [scenarioPath, setScenarioPath] = useState<string>(getInitialScenarioPath());

  // 오버레이(#mypage·#ending) 아래에 깔려 있어야 할 탭. 오버레이를 닫으면
  // 여기로 돌아간다 — 시나리오 탭에서 마이페이지를 열었다 닫았는데 홈 탭이
  // 나오는 어긋남을 막는다. 오버레이 주소로 바로 들어온 경우엔 홈이 바닥이다.
  const [lastHomeTabPage, setLastHomeTabPage] = useState<HomeTabPage>('home');
  const homeBasePage: HomeTabPage = isHomeTabPage(currentPage) ? currentPage : lastHomeTabPage;

  // 다음 주소 변경을 pushState가 아니라 replaceState로 처리하라는 표시.
  //
  // 가드가 되돌려 보낸 이동에만 쓴다. push로 남기면 사용자가 뒤로가기를
  // 누르는 순간 막힌 주소로 되돌아가고 → 가드가 다시 밀어내는 무한 왕복이
  // 되어 뒤로가기 자체가 죽는다. 되돌림은 히스토리에 흔적을 남기지 않는다.
  //
  // 첫 렌더도 같은 취급이다 — 해시 없이 들어온 주소('/')를 '#landing'으로
  // 정규화하는 것은 사용자의 이동이 아니므로, push로 남기면 뒤로가기 한 번이
  // 같은 화면에 낭비되어 사용자가 앱을 빠져나가지 못한다.
  const replaceHashRef = useRef(needsInitialHashRewrite());
  // hashchange 리스너는 마운트 때 한 번만 걸므로 최신 페이지를 ref로 읽는다.
  const currentPageRef = useRef(currentPage);
  // 같은 이유로 하위 경로도 ref로 따라 둔다 — 모르는 해시를 되돌릴 때
  // `#scenario`가 아니라 보고 있던 `#scenario/workplace`로 되돌려야 한다.
  const scenarioPathRef = useRef(scenarioPath);

  /** 지금 화면이 있어야 할 해시의 본문 ('scenario/workplace/1' — '#' 없음). */
  const hashBodyFor = useCallback(
    (page: Page, path: string) => (page === 'scenario' ? `scenario${path}` : page),
    []
  );

  /** 사용자의 이동 — 히스토리에 한 칸 쌓인다 (뒤로가기로 되돌아온다) */
  const navigate = useCallback((page: Page) => setCurrentPage(page), []);

  /** 가드의 되돌림 — 히스토리를 덮어쓴다 (뒤로가기 왕복 방지) */
  const redirect = useCallback((page: Page) => {
    replaceHashRef.current = true;
    setCurrentPage(page);
  }, []);

  /**
   * 시나리오 하위 경로 이동. ScenarioTab이 화면을 옮길 때마다 부른다.
   *
   * replace는 **가드의 되돌림 전용**이다 — 잠긴 회차를 주소로 열어 목록으로
   * 떨어뜨린 자리를 히스토리에 남기면, 뒤로가기가 그 주소로 되돌아가고 가드가
   * 다시 밀어내는 왕복에 갇힌다(페이지 가드와 같은 이유).
   */
  const navigateScenario = useCallback((path: string, options?: { replace?: boolean }) => {
    if (options?.replace) replaceHashRef.current = true;
    setScenarioPath(path);
  }, []);

  /**
   * 하단 탭 누르기. **같은 탭을 다시 누르면 그 탭의 1뎁스로 빠져나온다**
   * (2026-08-27 3차 UAT R3-06).
   *
   * 시나리오 탭에만 하위 경로가 있으므로 그 탭에서만 할 일이 있다. 페이지는
   * 이미 'scenario'라 navigate만으로는 아무것도 바뀌지 않는다 — 하위 경로를
   * 비우면 ScenarioTab의 주소→화면 동기화가 영역 목록을 띄운다.
   *
   * 조건이 `currentPage`인 것이 중요하다. 마이페이지·엔딩이 덮고 있을 때는
   * 탭바가 아무 탭도 활성으로 칠하지 않으므로, 누르는 뜻이 "1뎁스로"가 아니라
   * "그 탭으로 돌아가기"다. 그때 하위 경로까지 지우면 오버레이 한 번에 보고
   * 있던 자리를 잃는다(keepsScenarioSubPath 주석과 같은 이유).
   *
   * 빠져나오는 이동이라 히스토리에는 쌓지 않는다(플레이어 닫기와 같은 규칙).
   * 이미 1뎁스면 아무것도 하지 않는다 — 값이 그대로면 동기화 이펙트가 돌지
   * 않아 replaceHashRef가 켜진 채 남고, 그다음 진짜 이동이 push를 잃는다.
   */
  const changeTab = useCallback(
    (tab: HomeTabId) => {
      const page = PAGE_BY_TAB[tab];
      if (page === 'scenario' && currentPage === 'scenario' && scenarioPath !== '') {
        navigateScenario('', { replace: true });
      }
      navigate(page);
    },
    [currentPage, scenarioPath, navigate, navigateScenario]
  );

  useEffect(() => {
    currentPageRef.current = currentPage;
    if (isHomeTabPage(currentPage)) setLastHomeTabPage(currentPage);
  }, [currentPage]);

  useEffect(() => {
    scenarioPathRef.current = scenarioPath;
  }, [scenarioPath]);

  // 시나리오 탭을 떠나면 하위 경로를 버린다 (keepsScenarioSubPath 주석 참조).
  useEffect(() => {
    if (!keepsScenarioSubPath(currentPage)) setScenarioPath('');
  }, [currentPage]);

  // URL Hash ↔ State 동기화 로직
  useEffect(() => {
    // 비교는 **정규화한 본문끼리** 한다. 해시를 통째로 비교하면 뒤에 붙은
    // 쿼리스트링(#home?foo)이 매번 "다르다"로 잡혀 지워진다.
    const currentBody = hashSegments().join('/');
    const desiredBody = hashBodyFor(currentPage, scenarioPath);
    if (currentBody === desiredBody) {
      replaceHashRef.current = false;
      return;
    }
    if (replaceHashRef.current) {
      replaceHashRef.current = false;
      // replaceState는 hashchange를 발생시키지 않지만, 상태는 이미 목적지라 문제없다.
      window.history.replaceState(null, '', `#${desiredBody}`);
    } else {
      window.location.hash = desiredBody;
    }
  }, [currentPage, scenarioPath, hashBodyFor]);

  // 뒤로가기·앞으로가기·주소창 직접 입력. 해시 이동은 popstate가 아니라
  // hashchange로 오므로 이 하나로 세 경우가 모두 처리된다.
  useEffect(() => {
    const handleHashChange = () => {
      const segments = hashSegments();
      const next = validPages.includes(segments[0] as Page) ? (segments[0] as Page) : null;
      if (!next) {
        // 모르는 해시로 들어오면 화면을 흔들지 않고 주소만 지금 자리로 되돌린다.
        const body = hashBodyFor(currentPageRef.current, scenarioPathRef.current);
        window.history.replaceState(null, '', `#${body}`);
        return;
      }
      if (next === 'scenario') {
        const path = formatScenarioPath(parseScenarioRoute(segments.slice(1)));
        // 모양이 어긋난 하위 경로(#scenario/a/b/c)는 여기서 바로 정리한다.
        // setState에 기대면 값이 그대로일 때 이펙트가 돌지 않아 주소만 남는다.
        if (segments.join('/') !== `scenario${path}`) {
          window.history.replaceState(null, '', `#scenario${path}`);
        }
        setScenarioPath(path);
      }
      setCurrentPage(next);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [hashBodyFor]);

  // Firebase Auth 세션 복원 (앱 최초 마운트 시 1회)
  useEffect(() => {
    const unsubscribe = initAuthListener();
    return () => unsubscribe();
  }, [initAuthListener]);

  // 약관·운영 정보·공지 조회 (settings 컬렉션, 최초 마운트 시 1회).
  //
  // 로그인 여부와 무관하게 부른다 — 공지와 약관은 랜딩·로그인 화면에서도
  // 보여야 하고, firestore.rules에서 읽기가 공개돼 있어 인증이 필요 없다.
  // 실패해도 코드 상수로 폴백하므로 여기서 에러를 다루지 않는다.
  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  // ── 로그인 뒤 돌아갈 자리 (2026-08-27) ──
  //
  // 아래 세션 가드가 되돌려 보낸 주소를 한 칸 기억해 두었다가, 로그인이
  // 끝나면 홈이 아니라 그 자리로 보낸다. 딥링크(#scenario/workplace/3)를
  // 로그아웃 상태에서 열면 랜딩으로 튕기고, 로그인해도 홈에 떨어져 링크가
  // 사실상 죽는 것을 막는다.
  //
  // **ref를 소비하며 비우지 않는다.** 로그인 한 번에 이 함수가 두 번 불리기
  // 때문이다 — LoginPage의 [user] 이펙트(onLoginSuccess)와 아래 Auth 이펙트가
  // 같은 커밋에서 차례로 부르고, 자식 이펙트가 먼저 돈다. 첫 호출이 ref를
  // 비우면 뒤이은 호출이 목적지를 잃고 홈으로 덮어쓴다. 값은 다음 로그아웃
  // 때 가드가 다시 채우므로 남아 있어도 낡지 않는다.
  const afterLoginRef = useRef<{ page: Page; scenarioPath: string } | null>(null);

  const resumeAfterLogin = useCallback(() => {
    const pending = afterLoginRef.current;
    if (!pending) {
      setCurrentPage('home');
      return;
    }
    setScenarioPath(pending.page === 'scenario' ? pending.scenarioPath : '');
    setCurrentPage(pending.page);
  }, []);

  // 이 탭에서 로그인 세션이 있었던 적이 있는가. 아래 세션 가드가 "비로그인으로
  // 직접 들어온 것"(안내할 일)과 "쓰다가 로그아웃한 것"(본인이 한 일)을 가르는
  // 근거다 — 둘 다 user=null로 보호 주소에 서 있는 모양이라 그것만으로는 못 가른다.
  const hadSessionRef = useRef(false);
  const [loginRequiredNotice, setLoginRequiredNotice] = useState<string | null>(null);
  const closeLoginRequiredNotice = useCallback(() => setLoginRequiredNotice(null), []);

  // Auth 상태 모니터링: 로그인 직후 자동 라우팅과 로그아웃 시 캐릭터 초기화.
  //
  // 로그아웃했을 때의 **이동**은 여기서 하지 않는다 — 아래 세션 가드가
  // 맡는다. 뒤로가기로 보호 페이지에 되돌아오는 경우는 user가 바뀌지 않아
  // 이 이펙트가 다시 돌지 않기 때문이다.
  useEffect(() => {
    if (user) {
      hadSessionRef.current = true;
      // 로그인된 경우 홈으로 자동 이동
      // (signup 뷰에 있을 때는 이메일 인증 등 후속 스텝 진행을 위해 자동 이동하지 않음)
      if (currentPage === 'landing' || currentPage === 'login') {
        resumeAfterLogin();
      }
    } else {
      resetCharacter();
    }
    // 의존성은 [user]만 — currentPage를 추가하면 로그인 상태의 랜딩 체류
    // (홈 로고 클릭 복귀)가 즉시 home으로 되돌려져 기능이 조용히 죽는다.
  }, [user]);

  // ── 가드 1: 세션 (로그인 필요 페이지) ──
  //
  // isLoading이 끝나기 전에는 판정하지 않는 것이 핵심이다. 예전에는 위
  // 이펙트가 마운트 시 user=null만 보고 무조건 랜딩으로 보냈던 탓에,
  // #home을 제외한 모든 주소가 새로고침에서 살아남지 못했다(#home만 살아
  // 남은 것도 랜딩→홈 자동 이동에 얹혀 간 것뿐이다). Firebase 세션 복원이
  // 끝난 뒤에 판정하면 주소 그대로 복원된다.
  //
  // 가입(#signup)은 보호 대상이 아니다 — 미인증 계정은 일부러 user를 비워
  // 두므로(useAuthStore), 보호하면 인증 대기 단계에서 튕겨 나간다.
  useEffect(() => {
    if (isLoading || user) return;
    if (!requiresAuth(currentPage)) return;
    // 되돌리기 전에 어디로 가려 했는지 남긴다 (resumeAfterLogin 주석 참조).
    afterLoginRef.current = { page: currentPage, scenarioPath };
    // 세션 없이 직접 들어온 경우에만 튕긴 이유를 한 줄 알린다. 예전에는 말없이
    // 랜딩만 떠서 "링크가 깨졌나" 싶었다(2026-09-11 캡처 검수에서 확인).
    if (!hadSessionRef.current) setLoginRequiredNotice(COPY.errors.loginRequiredToast);
    redirect('landing');
  }, [currentPage, scenarioPath, user, isLoading, redirect]);

  // 약관 동의 여부 조회 (NRQ-0006 / NRQ-0023).
  //
  // 로그인 세션이 생길 때마다 users/{uid}.termsConsent를 확인한다. 결과가
  // 확정되기 전에는 status가 'unknown'이라 게이트가 뜨지 않으므로, 이미
  // 동의한 사용자에게 동의 화면이 한 프레임 번쩍이지 않는다.
  //
  // 의존성을 user 객체가 아니라 uid로 잡는다 — Firebase가 토큰 갱신 때마다
  // 새 User 객체를 물려주므로, 객체로 잡으면 같은 사용자에게 조회가 반복된다.
  useEffect(() => {
    if (user?.uid) {
      void fetchConsent(user.uid);
    } else {
      resetConsent();
    }
  }, [user?.uid, fetchConsent, resetConsent]);

  // ── 복귀 재조회 (N-5) ──
  //
  // 위 동의 조회와 같은 계열이다: 세션이 있을 때 users/{uid}를 다시 읽는다.
  // 다만 계기가 로그인이 아니라 **창으로 돌아오는 순간**이다. 자세한 배경과
  // 스로틀 근거는 파일 상단의 RESYNC_THROTTLE_MS 주석에 있다.
  //
  // 부르는 것은 각 스토어의 **기존** fetch 액션 셋뿐이다. 스토어에 새 액션도
  // 새 필드도 만들지 않는다.
  //
  // ⚠️ fetchThemes는 **일부러 빼 놓았다.** themes는 유저 상태가 아니라
  // 콘텐츠(scenarios 컬렉션 CSV)이고, 무엇보다 재배치가 EpisodeData 객체를
  // 통째로 갈아 치운다 — useEpisodePlayer의 `useEffect(..., [episode])`가
  // 그것을 "다른 에피소드"로 읽어 **플레이 중인 진행을 SITUATION으로
  // 되감는다.** 배치를 갱신해야 하는 화면(ScenarioTab·AnalysisTab)은 이미
  // stressResult.resultType을 effect 의존성으로 구독하고 있으므로, 여기서
  // 검사 결과만 새로 읽어 주면 그 화면들이 스스로 fetchThemes를 부른다.
  // (그 스토어의 cycleKey 스킵 가드는 배치가 그대로일 때 읽기 3회를 아끼는
  // 올바른 캐시라 손대지 않았다 — 우리 재조회를 막는 가드가 아니다.)
  const lastResyncAtRef = useRef(0);
  const resyncUid = user?.uid;

  useEffect(() => {
    if (!resyncUid) return;

    // 방금 세션이 생긴 참이라 각 화면의 마운트 이펙트가 이미 읽었다.
    // 여기서 시계를 시작해 두지 않으면 로그인 직후의 첫 포커스가 곧바로
    // 같은 문서를 세 번 더 읽는다.
    lastResyncAtRef.current = Date.now();

    const resync = () => {
      // visibilitychange는 **숨겨질 때도** 온다. 돌아온 순간만 취한다.
      if (document.visibilityState === 'hidden') return;

      // ── 진행 중이면 건드리지 않는다 ──
      //
      // 에피소드 플레이어는 #app-modal-root로 포털 렌더링되는 풀스크린
      // 레이어다(ScenarioTab). 그 루트에 자식이 있으면 플레이어든 모달이든
      // 사용자가 무언가 진행 중이라는 뜻이므로 재조회를 미룬다. 루트는
      // MobileWrapper — 즉 이 컴포넌트가 소유한 것이라 여기서 봐도 된다.
      if ((document.getElementById('app-modal-root')?.childElementCount ?? 0) > 0) return;

      // 검사 문항·결과 화면도 진행 중이다. fetchTestResults가 지금 읽고 있는
      // 결과를 화면 아래에서 바꿔치기하면 사용자가 보던 점수가 흔들린다.
      const page = currentPageRef.current;
      if (page === 'test-adhd' || page === 'test-stress') return;

      const now = Date.now();
      if (now - lastResyncAtRef.current < RESYNC_THROTTLE_MS) return;
      lastResyncAtRef.current = now;

      fetchQuietly(useCharacterStore, () =>
        useCharacterStore.getState().fetchCharacter(resyncUid)
      );
      fetchQuietly(useTestStore, () => useTestStore.getState().fetchTestResults(resyncUid));
      fetchQuietly(useScenarioStore, () => useScenarioStore.getState().fetchProgress(resyncUid));
    };

    document.addEventListener('visibilitychange', resync);
    window.addEventListener('focus', resync);
    return () => {
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('focus', resync);
    };
  }, [resyncUid]);

  // ── 가드 2: 캐릭터 덮어쓰기 (2026-08-08) ──
  //
  // 캐릭터는 users/{uid}.character 한 칸뿐이라 다시 만들면 기존 캐릭터가
  // 통째로 덮인다. 홈은 캐릭터가 없을 때만 생성 CTA를 보여주지만, 주소창에
  // #character-creation을 직접 치면 그 가드를 지나쳐 버린다.
  //
  // 판정은 **페이지 진입 시점 한 번**만 한다. 의존성에 character를 넣으면
  // 생성 성공 직후(캐릭터가 방금 생긴 순간) 완료 모달을 못 보고 홈으로
  // 튕기므로, 스토어는 getState()로 그때의 값만 읽는다.
  // 콜드 로드로 바로 들어온 경우엔 아직 캐릭터를 읽지 않았을 수 있어
  // 한 번 조회한 뒤 다시 판정한다(사용자가 닉네임을 입력하기 전에 끝난다).
  useEffect(() => {
    if (currentPage !== 'character-creation' || !user?.uid) return;

    let cancelled = false;
    const guard = async () => {
      const store = useCharacterStore.getState();
      if (store.character) {
        redirect('home');
        return;
      }
      await store.fetchCharacter(user.uid);
      if (!cancelled && useCharacterStore.getState().character) {
        redirect('home');
      }
    };
    void guard();

    return () => {
      cancelled = true;
    };
  }, [currentPage, user, redirect]);

  // ── 가드 3: 검사는 캐릭터가 있어야 시작한다 ──
  //
  // 홈 여정 카드가 2단계(ADHD)를 캐릭터 뒤에 잠그는 것과 같은 사슬이다
  // ("검사는 캐릭터에 딸린 기록이라 화자 없이 시작할 수 없다" — HomeTab).
  // 주소로 직접 들어오면 그 잠금을 지나치므로 여기서 한 번 더 본다.
  // 되돌리는 곳은 홈이다 — 캐릭터 생성 CTA가 첫 화면에 서 있다.
  //
  // ADHD 결과 없이 #test-stress로 들어오는 것은 **막지 않는다.** 두 검사는
  // 서로의 입력이 아니고, 결과가 한쪽만 있는 상태를 홈·시나리오가 이미
  // 정상 상태로 다루기 때문이다(HomeTab의 '스트레스만 있는 계정' 주석).
  useEffect(() => {
    if ((currentPage !== 'test-adhd' && currentPage !== 'test-stress') || !user?.uid) return;

    let cancelled = false;
    const guard = async () => {
      const store = useCharacterStore.getState();
      if (store.character) return;
      await store.fetchCharacter(user.uid);
      if (!cancelled && !useCharacterStore.getState().character) {
        redirect('home');
      }
    };
    void guard();

    return () => {
      cancelled = true;
    };
  }, [currentPage, user, redirect]);

  // ── 가드 4: 미해금 엔딩 ──
  //
  // #ending에 주소를 달면서 함께 정한 것(2026-08-18). 그전까지 엔딩은 주소가
  // 없어 마이페이지·종합 인사이트 버튼으로만 열렸고, 그 버튼들이 해금 판정을
  // 대신하고 있었다. 주소가 생기면 그 판정을 건너뛸 수 있으므로 여기로 옮긴다.
  //
  // 해금 기준은 마이페이지와 **같은 식**을 쓴다(computeAlbumProgress의
  // isAllComplete = 4영역 완주). 두 곳이 다른 식을 쓰면 버튼은 잠겨 있는데
  // 주소로는 열리는(혹은 그 반대) 어긋남이 생긴다. 개발자 계정 우회도 같다.
  // 아직 못 연 사용자는 결말을 미리 보지 않고 홈으로 안내된다.
  useEffect(() => {
    if (currentPage !== 'ending' || !user?.uid) return;

    const devEmail = import.meta.env.VITE_DEV_LOGIN_EMAIL;
    if (devEmail && user.email === devEmail) return;

    let cancelled = false;
    const isUnlocked = () => {
      const { themes, progress } = useScenarioStore.getState();
      return computeAlbumProgress(themes, progress).isAllComplete;
    };

    const guard = async () => {
      if (isUnlocked()) return;
      // 콜드 로드로 바로 들어오면 진행도를 아직 읽지 않았다. 한 번 읽고 다시 본다.
      const store = useScenarioStore.getState();
      await Promise.all([store.fetchThemes(), store.fetchProgress(user.uid)]);
      if (!cancelled && !isUnlocked()) {
        redirect('home');
      }
    };
    void guard();

    return () => {
      cancelled = true;
    };
  }, [currentPage, user, redirect]);

  // 페이지 이동 시 Auth 에러 상태 초기화
  useEffect(() => {
    clearError();
  }, [currentPage, clearError]);

  // Auth 로딩 중 스켈레톤.
  //
  // 보호 페이지로 직접 들어온 경우에도 띄운다 — 세션 복원이 끝나기 전에는
  // user가 없어 화면이 빈 프레임으로 그려지기 때문이다(가드 1이 판정을
  // 미루는 동안의 공백).
  const showAuthSkeleton =
    isLoading && (currentPage === 'landing' || (!user && requiresAuth(currentPage)));

  if (showAuthSkeleton) {
    return (
      <MobileWrapper>
        <div className="h-full flex flex-col items-center justify-center gap-4 bg-surface">
          <div className="w-12 h-12 rounded-full border-2 border-primary-container border-t-transparent animate-spin" />
          <p className="text-[14px] text-outline font-body">잠시만 기다려 주세요...</p>
        </div>
      </MobileWrapper>
    );
  }

  return (
    <MobileWrapper banner={<NoticeBanner />}>
      {/* ─── 랜딩 페이지 ─── */}
      {currentPage === 'landing' && (
        <LandingPage
          onStart={() => navigate(user ? 'home' : 'login')}
          onProfileClick={() => navigate(user ? 'mypage' : 'login')}
        />
      )}
      {currentPage === 'landing' && (
        <Toast
          message={loginRequiredNotice}
          label={COPY.errors.loginRequiredToastLabel}
          onClose={closeLoginRequiredNotice}
        />
      )}

      {/* ─── 로그인 페이지 ─── */}
      {currentPage === 'login' && (
        <LoginPage
          onLoginSuccess={resumeAfterLogin}
          onBack={() => navigate('landing')}
          onSignup={() => navigate('signup')}
        />
      )}

      {/* ─── 회원가입 페이지 ─── */}
      {currentPage === 'signup' && (
        <SignupPage
          onBack={() => navigate('login')}
          onComplete={() => navigate('home')}
        />
      )}

      {/* ─── 홈 셸 (#home · #scenario · #diary · #mypage · #ending) ───
          탭과 오버레이의 상태는 주소가 정한다. HomePage는 그 값을 받아
          그리기만 하므로, 어느 화면이든 새로고침·링크 공유로 되돌아온다. */}
      {isHomeShellPage(currentPage) && user && (
        <HomePage
          onStartCreation={() => navigate('character-creation')}
          onStartTest={(type) => navigate(type === 'adhd' ? 'test-adhd' : 'test-stress')}
          onGoLanding={() => navigate('landing')}
          activeTab={TAB_BY_PAGE[homeBasePage]}
          onChangeTab={changeTab}
          // 시나리오 탭의 하위 주소 (#scenario/<themeId>/<n>).
          scenarioPath={scenarioPath}
          onScenarioPathChange={navigateScenario}
          isMyPageOpen={currentPage === 'mypage'}
          onOpenMyPage={() => navigate('mypage')}
          onCloseMyPage={() => navigate(homeBasePage)}
          isEndingOpen={currentPage === 'ending'}
          onOpenEnding={() => navigate('ending')}
          // 엔딩은 어느 입구로 들어왔든 홈으로 나온다 (기존 두 경로의 동작 그대로).
          onCloseEnding={() => navigate('home')}
        />
      )}

      {/* ─── 캐릭터 생성 페이지 ─── */}
      {currentPage === 'character-creation' && user && (
        <CharacterCreationPage
          onCancel={() => navigate('home')}
          onComplete={(goToTest) => navigate(goToTest ? 'test-adhd' : 'home')}
        />
      )}

      {/* ─── ADHD 경향성 검사 페이지 ─── */}
      {currentPage === 'test-adhd' && user && (
        <TestUnifiedPage
          testType="adhd"
          onGoHome={() => navigate('home')}
          onGoToStressTest={() => navigate('test-stress')}
        />
      )}

      {/* ─── 스트레스 대처기제 검사 페이지 ─── */}
      {currentPage === 'test-stress' && user && (
        <TestUnifiedPage
          testType="stress"
          onGoHome={() => navigate('home')}
        />
      )}

      {/* ─── 약관 동의 게이트 (모든 화면 위를 덮는다) ───
          동의 기록이 없는 로그인 세션은 여기서 멈춘다. 구글 로그인이 동의
          절차 없이 홈까지 들어가던 경로를 막는 것이 목적이라(NRQ-0006 →
          NRQ-0023 → NRQ-0024), 이메일로 가입한 기존 사용자도 동의 기록이
          없으면 다음 로그인에서 한 번 이 화면을 만난다 — 의도된 동작이다.

          가입 화면만 예외로 둔다. 이메일 가입은 Step 1에서 이미 동의를 받아
          Step 2에서 기록하므로, 그 사이 몇 초 동안 같은 내용을 다시 묻는
          화면이 겹치는 것을 막는다. 가입을 마치면 홈으로 나오므로 기록이
          실패했더라도 그 다음 화면에서 게이트가 받아 낸다. */}
      {user && consentStatus === 'missing' && currentPage !== 'signup' && <ConsentGate />}
    </MobileWrapper>
  );
}
