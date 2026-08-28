// src/utils/scenarioRoute.test.ts
// 시나리오 하위 주소의 문법 계약 (2026-08-27 UAT R2-06 1단계).
//
// 여기서 고정하는 것은 **모양**뿐이다 — 그 영역이 실제로 있는지, 그 회차가
// 해금됐는지는 진행도를 아는 ScenarioTab이 판정한다.

import { describe, it, expect } from 'vitest';
import {
  formatScenarioPath,
  parseScenarioPath,
  parseScenarioRoute,
  scenarioRouteEquals,
  splitHashSegments,
  THEME_LIST_ROUTE,
  type ScenarioRoute,
} from './scenarioRoute';

describe('splitHashSegments', () => {
  it('앞의 #과 빈 조각을 걷어내고 세그먼트만 남긴다', () => {
    expect(splitHashSegments('#scenario/workplace/1')).toEqual(['scenario', 'workplace', '1']);
    expect(splitHashSegments('/workplace/')).toEqual(['workplace']);
    expect(splitHashSegments('')).toEqual([]);
    expect(splitHashSegments('#')).toEqual([]);
  });

  it('쿼리스트링은 주소가 아니므로 버린다', () => {
    expect(splitHashSegments('#scenario/workplace?utm=x')).toEqual(['scenario', 'workplace']);
  });

  it('퍼센트 인코딩을 풀되 깨진 입력에서 터지지 않는다', () => {
    // 주소창은 사용자가 직접 치는 곳이라 어떤 문자열도 들어온다.
    expect(splitHashSegments('#scenario/%EC%A7%81%EC%9E%A5')).toEqual(['scenario', '직장']);
    expect(splitHashSegments('#scenario/%zz')).toEqual(['scenario', '%zz']);
  });
});

describe('parseScenarioRoute', () => {
  it('빈 경로는 영역 목록이다', () => {
    expect(parseScenarioRoute([])).toEqual(THEME_LIST_ROUTE);
  });

  it('영역 하나면 그 영역의 에피소드 목록이다', () => {
    expect(parseScenarioRoute(['workplace'])).toEqual({
      view: 'EPISODE_LIST',
      themeId: 'workplace',
    });
  });

  it('숫자가 붙으면 그 회차의 플레이어다', () => {
    expect(parseScenarioRoute(['job-prep', '10'])).toEqual({
      view: 'PLAYER',
      themeId: 'job-prep',
      episodeNumber: 10,
    });
  });

  it("'epilogue'가 붙으면 에필로그 플레이어다", () => {
    expect(parseScenarioRoute(['daily', 'epilogue'])).toEqual({
      view: 'EPILOGUE',
      themeId: 'daily',
    });
  });

  it.each([
    ['회차가 숫자가 아니면', ['workplace', 'strategy']],
    ['0회차는 없으므로', ['workplace', '0']],
    ['앞에 0이 붙은 표기는', ['workplace', '01']],
    ['음수는', ['workplace', '-1']],
    ['소수는', ['workplace', '1.5']],
    ['세그먼트가 더 붙으면', ['workplace', '1', 'strategy']],
  ])('%s 영역 목록으로 떨어진다', (_label, segments) => {
    // 어중간하게 살려 두면 없는 화면이 열린 것처럼 보인다.
    expect(parseScenarioRoute(segments)).toEqual(THEME_LIST_ROUTE);
  });

  it('모르는 영역 id도 모양만 맞으면 그대로 통과시킨다 (존재 판정은 화면의 몫)', () => {
    expect(parseScenarioRoute(['nope'])).toEqual({ view: 'EPISODE_LIST', themeId: 'nope' });
  });
});

describe('formatScenarioPath', () => {
  it.each<[ScenarioRoute, string]>([
    [THEME_LIST_ROUTE, ''],
    [{ view: 'EPISODE_LIST', themeId: 'workplace' }, '/workplace'],
    [{ view: 'PLAYER', themeId: 'workplace', episodeNumber: 3 }, '/workplace/3'],
    [{ view: 'EPILOGUE', themeId: 'relationship' }, '/relationship/epilogue'],
  ])('%o → %s', (route, expected) => {
    expect(formatScenarioPath(route)).toBe(expected);
  });

  it('영역 목록은 빈 문자열이라 #scenario에 아무것도 붙지 않는다', () => {
    // 기존 주소(#scenario)와 같은 모양이어야 예전 링크가 그대로 산다.
    expect(`#scenario${formatScenarioPath(THEME_LIST_ROUTE)}`).toBe('#scenario');
  });
});

describe('왕복', () => {
  it.each(['', '/workplace', '/workplace/7', '/daily/epilogue'])(
    '%s는 읽었다 쓰면 그대로다',
    (path) => {
      expect(formatScenarioPath(parseScenarioPath(path))).toBe(path);
    }
  );

  it('어긋난 경로는 왕복하면 영역 목록으로 정규화된다', () => {
    expect(formatScenarioPath(parseScenarioPath('/workplace/1/2/3'))).toBe('');
  });
});

describe('scenarioRouteEquals', () => {
  it('신원이 아니라 값으로 본다', () => {
    expect(
      scenarioRouteEquals(
        { view: 'PLAYER', themeId: 'workplace', episodeNumber: 2 },
        { view: 'PLAYER', themeId: 'workplace', episodeNumber: 2 }
      )
    ).toBe(true);
    expect(
      scenarioRouteEquals(
        { view: 'EPISODE_LIST', themeId: 'workplace' },
        { view: 'EPILOGUE', themeId: 'workplace' }
      )
    ).toBe(false);
  });
});
