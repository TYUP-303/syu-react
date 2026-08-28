// src/utils/scenarioRoute.ts
// 시나리오 탭의 **하위 주소**(#scenario 뒤에 붙는 경로)를 읽고 쓰는 순수 함수.
//
// ─── 주소 체계 (2026-08-27, R2-06 1단계) ────────────────────
//
//   #scenario                       영역 목록
//   #scenario/<themeId>             그 영역의 에피소드 목록
//   #scenario/<themeId>/<n>         n번째 에피소드 플레이어 (n은 1부터)
//   #scenario/<themeId>/epilogue    그 영역의 에필로그 플레이어
//
// 그전까지 시나리오 탭은 주소가 `#scenario` 하나뿐이라, 에피소드를 열어 둔
// 채 새로고침하면 영역 목록으로 되돌아갔다(2026-08-27 2차 UAT R2-06).
//
// **플레이어 안쪽 단계(상황→요정→전략→평가)는 여기서 다루지 않는다.** 그것은
// 2단계 과제이고, 단계까지 주소로 쪼개면 "진행 중이던 선택"을 주소만으로
// 복원할 수 없어 열리는 척하다 깨지는 화면이 된다. n번 에피소드 주소는 항상
// **처음부터** 여는 것으로 고정한다.
//
// 이 파일이 아는 것은 **주소의 모양**뿐이다. 그 themeId가 실제로 있는지,
// 그 회차가 해금됐는지는 진행도를 아는 곳(ScenarioTab)이 판정한다 — 여기서
// 영역 목록을 하드코딩하면 스토어의 domains와 두 벌이 되어 언젠가 갈린다.

/** 시나리오 탭이 주소로 표현할 수 있는 화면. 보고서 뷰(TYPE_REPORT)는 없다 —
 *  완주 직후에만 스쳐 가는 화면이라 주소로 되돌아올 자리가 아니다. */
export type ScenarioRoute =
  | { view: 'THEME_LIST' }
  | { view: 'EPISODE_LIST'; themeId: string }
  | { view: 'PLAYER'; themeId: string; episodeNumber: number }
  | { view: 'EPILOGUE'; themeId: string };

/** 어떤 주소도 아닐 때 수렴하는 자리. */
export const THEME_LIST_ROUTE: ScenarioRoute = { view: 'THEME_LIST' };

/** 에필로그를 가리키는 세 번째 세그먼트. 회차 번호와 같은 칸을 쓰되 숫자가 아니다. */
const EPILOGUE_SEGMENT = 'epilogue';

/**
 * 해시(또는 하위 경로) 문자열을 세그먼트 배열로 쪼갠다.
 *
 * '#scenario/workplace/1' → ['scenario', 'workplace', 1]
 * '/workplace/1'          → ['workplace', '1']
 *
 * 앞의 '#', 쿼리스트링(?…), 빈 조각은 버린다. 퍼센트 인코딩은 풀어 주되
 * 깨진 입력(`%zz`)이 예외로 터지지 않게 원문을 그대로 남긴다 — 주소창은
 * 사용자가 직접 치는 곳이라 어떤 문자열도 들어올 수 있다.
 */
export function splitHashSegments(hash: string): string[] {
  return hash
    .replace(/^#/, '')
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
}

/**
 * `#scenario` **뒤쪽** 세그먼트들을 화면으로 옮긴다.
 *
 * 모양이 어긋나면(회차가 숫자가 아니거나, 세그먼트가 더 붙어 있거나) 영역
 * 목록으로 떨어뜨린다. 어중간하게 살려 두면 없는 화면이 열린 것처럼 보인다.
 */
export function parseScenarioRoute(segments: string[]): ScenarioRoute {
  const [themeId, third, ...rest] = segments;
  if (!themeId || rest.length > 0) return THEME_LIST_ROUTE;
  if (third === undefined) return { view: 'EPISODE_LIST', themeId };
  if (third === EPILOGUE_SEGMENT) return { view: 'EPILOGUE', themeId };
  // 회차는 1부터다. '0'·'01'·'-1'·'1.5'는 전부 모르는 주소로 본다.
  if (/^[1-9]\d*$/.test(third)) {
    return { view: 'PLAYER', themeId, episodeNumber: Number(third) };
  }
  return THEME_LIST_ROUTE;
}

/** '/workplace/1' 같은 하위 경로 문자열을 그대로 읽는다. */
export function parseScenarioPath(path: string): ScenarioRoute {
  return parseScenarioRoute(splitHashSegments(path));
}

/**
 * 화면을 하위 경로 문자열로 되돌린다. 영역 목록은 빈 문자열이다 —
 * `#scenario`에 아무것도 붙지 않아야 기존 주소와 같은 모양이 된다.
 */
export function formatScenarioPath(route: ScenarioRoute): string {
  switch (route.view) {
    case 'THEME_LIST':
      return '';
    case 'EPISODE_LIST':
      return `/${route.themeId}`;
    case 'EPILOGUE':
      return `/${route.themeId}/${EPILOGUE_SEGMENT}`;
    case 'PLAYER':
      return `/${route.themeId}/${route.episodeNumber}`;
  }
}

/** 두 주소가 같은 화면을 가리키는가. 객체 신원이 아니라 값으로 본다. */
export function scenarioRouteEquals(a: ScenarioRoute, b: ScenarioRoute): boolean {
  return formatScenarioPath(a) === formatScenarioPath(b);
}
