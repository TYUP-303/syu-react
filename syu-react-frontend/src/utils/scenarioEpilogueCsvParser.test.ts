// src/utils/scenarioEpilogueCsvParser.test.ts
//
// 에필로그 CSV 파서의 계약. 다른 시나리오 파서들과 마찬가지로 **예외를 던지지
// 않는다** — 잘못된 입력은 조용히 빈 맵/누락으로 떨어지고 화면은 에필로그
// 카드를 그리지 않는 것으로 끝난다. 그래서 "무엇이 조용히 사라지는가"를
// 여기에 값으로 박아 둔다.

import { describe, it, expect } from 'vitest';
import {
  parseScenarioEpilogueCsv,
  EPILOGUE_SCENE_MIN,
  EPILOGUE_SCENE_MAX,
} from './scenarioEpilogueCsvParser';

const HEADER = 'DOMAIN,SCENE_NUM,TITLE,BG,CHAR_1,CHAR_2,CHAR_3,TEXT';

/** 씬 n행이 1번부터 갖춰진 정상 영역 하나. 기본은 최소 구성인 4씬이다. */
function scenes(domain: string, count = EPILOGUE_SCENE_MIN, title = `${domain} 에필로그`): string {
  return Array.from({ length: count }, (_, i) => i + 1)
    .map((n) => `${domain},${n},${title},bg${n}.png,,hero.png,,"${domain} ${n}번째 장면"`)
    .join('\n');
}

/** 씬 4행이 갖춰진 정상 영역 하나. */
function fourScenes(domain: string, title = `${domain} 에필로그`): string {
  return scenes(domain, EPILOGUE_SCENE_MIN, title);
}

describe('parseScenarioEpilogueCsv — 정상 입력', () => {
  it('DOMAIN을 키로 4씬을 SCENE_NUM 순서대로 모은다', () => {
    const map = parseScenarioEpilogueCsv([HEADER, fourScenes('직장')].join('\n'));

    expect([...map.keys()]).toEqual(['직장']);
    const epilogue = map.get('직장')!;
    expect(epilogue.title).toBe('직장 에필로그');
    expect(epilogue.scenes).toHaveLength(EPILOGUE_SCENE_MIN);
    expect(epilogue.scenes.map((s) => s.sceneNumber)).toEqual([1, 2, 3, 4]);
    expect(epilogue.scenes.map((s) => s.text)).toEqual([
      '직장 1번째 장면',
      '직장 2번째 장면',
      '직장 3번째 장면',
      '직장 4번째 장면',
    ]);
  });

  it('행 순서가 뒤섞여 있어도 SCENE_NUM으로 다시 세운다', () => {
    const rows = [4, 2, 1, 3].map(
      (n) => `일상,${n},제목,bg.png,,hero.png,,"장면 ${n}"`
    );
    const map = parseScenarioEpilogueCsv([HEADER, ...rows].join('\n'));

    expect(map.get('일상')!.scenes.map((s) => s.sceneNumber)).toEqual([1, 2, 3, 4]);
    expect(map.get('일상')!.scenes.map((s) => s.text)).toEqual([
      '장면 1',
      '장면 2',
      '장면 3',
      '장면 4',
    ]);
  });

  it('빈 캐릭터 슬롯은 버리고 채워진 슬롯만 순서대로 남긴다', () => {
    const rows = [1, 2, 3, 4].map((n) =>
      n === 1
        ? `연인,${n},제목,restaurant.png,baeksul_f_default.png,,lover_default.png,"둘"`
        : `연인,${n},제목,restaurant.png,,baeksul_f_default.png,,"혼자"`
    );
    const map = parseScenarioEpilogueCsv([HEADER, ...rows].join('\n'));

    expect(map.get('연인')!.scenes[0].chars).toEqual([
      'baeksul_f_default.png',
      'lover_default.png',
    ]);
    expect(map.get('연인')!.scenes[1].chars).toEqual(['baeksul_f_default.png']);
  });

  it('5씬·6씬 영역도 그대로 담는다 (씬 수는 영역마다 다를 수 있다)', () => {
    const map = parseScenarioEpilogueCsv(
      [HEADER, scenes('직장', 5), scenes('연인', 6)].join('\n')
    );

    expect(map.get('직장')!.scenes.map((s) => s.sceneNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(map.get('연인')!.scenes.map((s) => s.sceneNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(map.get('연인')!.scenes[5].text).toBe('연인 6번째 장면');
  });

  it('영역이 여럿이면 각각 따로 담는다', () => {
    const map = parseScenarioEpilogueCsv(
      [HEADER, fourScenes('직장'), fourScenes('취업준비')].join('\n')
    );
    expect([...map.keys()].sort()).toEqual(['직장', '취업준비'].sort());
  });
});

describe('parseScenarioEpilogueCsv — 헤더 해석', () => {
  it('BOM·대소문자·공백이 섞인 헤더도 같은 열로 읽는다', () => {
    const header = '﻿domain, Scene Num ,title,bg,char_1,char_2,char_3, TEXT ';
    const map = parseScenarioEpilogueCsv([header, fourScenes('직장')].join('\n'));

    expect(map.get('직장')?.scenes).toHaveLength(4);
  });

  it('열 순서가 바뀌어도 이름으로 찾는다', () => {
    const header = 'TEXT,CHAR_3,CHAR_2,CHAR_1,BG,TITLE,SCENE_NUM,DOMAIN';
    const rows = [1, 2, 3, 4].map((n) => `"본문 ${n}",,hero.png,,bg.png,제목,${n},일상`);
    const map = parseScenarioEpilogueCsv([header, ...rows].join('\n'));

    expect(map.get('일상')!.scenes.map((s) => s.text)).toEqual([
      '본문 1',
      '본문 2',
      '본문 3',
      '본문 4',
    ]);
  });

  it('DOMAIN 열이 없으면 빈 맵이다 — 엉뚱한 CSV가 올라와도 기본값으로 산다', () => {
    const map = parseScenarioEpilogueCsv('A,B,C\n1,2,3');
    expect(map.size).toBe(0);
  });

  it('여러 줄이 든 셀(시트의 Alt+Enter)을 한 행으로 읽는다', () => {
    const rows = [1, 2, 3, 4].map(
      (n) => `직장,${n},제목,bg.png,,hero.png,,"첫 줄\n둘째 줄 ${n}"`
    );
    const map = parseScenarioEpilogueCsv([HEADER, ...rows].join('\n'));

    expect(map.get('직장')!.scenes).toHaveLength(4);
    expect(map.get('직장')!.scenes[0].text).toBe('첫 줄\n둘째 줄 1');
  });
});

describe('parseScenarioEpilogueCsv — 조용한 폴백', () => {
  it('빈 문자열·헤더만 있는 입력은 빈 맵이다', () => {
    expect(parseScenarioEpilogueCsv('').size).toBe(0);
    expect(parseScenarioEpilogueCsv('   ').size).toBe(0);
    expect(parseScenarioEpilogueCsv(HEADER).size).toBe(0);
  });

  it('씬이 최소 수(4)에 못 미치는 영역은 통째로 버린다', () => {
    const rows = [1, 2, 3].map((n) => `직장,${n},제목,bg.png,,hero.png,,"장면 ${n}"`);
    const map = parseScenarioEpilogueCsv([HEADER, ...rows, fourScenes('일상')].join('\n'));

    // 씬이 빠진 영역만 사라지고 멀쩡한 영역은 남는다.
    expect(map.has('직장')).toBe(false);
    expect(map.has('일상')).toBe(true);
  });

  it('씬이 최대 수를 넘는 영역도 통째로 버린다', () => {
    const rows = Array.from({ length: EPILOGUE_SCENE_MAX + 1 }, (_, i) => i + 1).map(
      (n) => `직장,${n},제목,bg.png,,hero.png,,"장면 ${n}"`
    );
    const map = parseScenarioEpilogueCsv([HEADER, ...rows, fourScenes('일상')].join('\n'));

    // 한 칸 넘어간 마지막 행은 범위 밖이라 먼저 버려지고, 남은 씬은 정상 구성이 된다.
    expect(map.get('직장')!.scenes).toHaveLength(EPILOGUE_SCENE_MAX);
    expect(map.has('일상')).toBe(true);
  });

  it('개수가 맞아도 씬 번호에 결번이 있으면 그 영역을 버린다', () => {
    const rows = [1, 2, 3, 5].map((n) => `직장,${n},제목,bg.png,,hero.png,,"장면 ${n}"`);
    const map = parseScenarioEpilogueCsv([HEADER, ...rows, fourScenes('일상')].join('\n'));

    // 4개가 모였지만 1~4가 아니라 4번이 비었다 → 순서가 어긋난 채 재생되느니 버린다.
    expect(map.has('직장')).toBe(false);
    expect(map.has('일상')).toBe(true);
  });

  it('SCENE_NUM이 범위 밖이거나 숫자가 아니면 그 행을 버린다', () => {
    const rows = [
      `직장,1,제목,bg.png,,hero.png,,"1"`,
      `직장,2,제목,bg.png,,hero.png,,"2"`,
      `직장,3,제목,bg.png,,hero.png,,"3"`,
      `직장,${EPILOGUE_SCENE_MAX + 1},제목,bg.png,,hero.png,,"범위 밖"`,
      `직장,넷,제목,bg.png,,hero.png,,"넷"`,
    ];
    const map = parseScenarioEpilogueCsv([HEADER, ...rows].join('\n'));
    expect(map.has('직장')).toBe(false);
  });

  it('같은 씬 번호가 두 번 나오면 뒤 행이 이긴다 (visual 파서와 같은 규칙)', () => {
    const rows = [
      ...[1, 2, 3, 4].map((n) => `직장,${n},제목,bg.png,,hero.png,,"처음 ${n}"`),
      `직장,2,제목,bg.png,,hero.png,,"나중 2"`,
    ];
    const map = parseScenarioEpilogueCsv([HEADER, ...rows].join('\n'));
    expect(map.get('직장')!.scenes[1].text).toBe('나중 2');
  });

  it('DOMAIN이 빈 행은 건너뛴다', () => {
    const rows = [`  ,1,제목,bg.png,,hero.png,,"버려짐"`, fourScenes('일상')];
    const map = parseScenarioEpilogueCsv([HEADER, ...rows].join('\n'));
    expect([...map.keys()]).toEqual(['일상']);
  });

  it('TITLE이 비어 있어도 행은 살아남고 제목만 빈 문자열이 된다', () => {
    const rows = [1, 2, 3, 4].map((n) => `직장,${n},,bg.png,,hero.png,,"장면 ${n}"`);
    const map = parseScenarioEpilogueCsv([HEADER, ...rows].join('\n'));
    expect(map.get('직장')!.title).toBe('');
    expect(map.get('직장')!.scenes).toHaveLength(4);
  });

  it('헤더보다 짧은 행도 없는 열만 비운 채 살린다', () => {
    const rows = [1, 2, 3, 4].map((n) => `직장,${n},제목,bg.png`);
    const map = parseScenarioEpilogueCsv([HEADER, ...rows].join('\n'));
    expect(map.get('직장')!.scenes[0].chars).toEqual([]);
    expect(map.get('직장')!.scenes[0].text).toBe('');
  });
});

// ── KIND — 극 안인가 극 밖인가 ────────────────────────────────────
//
// 열이 하나 늘었지만 **기본값이 곧 예전 동작**이라는 것이 여기서 지키려는
// 계약이다. 열이 없는 CSV(어드민에 아직 옛 파일이 올라가 있는 상태)도, 빈칸도,
// 오타도 전부 'scene'으로 떨어져야 한다 — 그래야 열을 더한 것만으로 이미
// 배포된 원고의 서식이 바뀌지 않는다.
describe('parseScenarioEpilogueCsv — KIND', () => {
  const KIND_HEADER = 'DOMAIN,SCENE_NUM,TITLE,BG,CHAR_1,CHAR_2,CHAR_3,KIND,TEXT';

  /** KIND 열이 있는 정상 영역. 마지막 씬의 KIND만 인자로 받는다. */
  function withKind(lastKind: string, count = EPILOGUE_SCENE_MIN): string {
    return Array.from({ length: count }, (_, i) => i + 1)
      .map(
        (n) =>
          `직장,${n},제목,bg.png,,hero.png,,${n === count ? lastKind : ''},"장면 ${n}"`
      )
      .join('\n');
  }

  it("KIND 열이 아예 없으면 모든 씬이 'scene'이다 — 옛 CSV가 그대로 산다", () => {
    const map = parseScenarioEpilogueCsv([HEADER, fourScenes('직장')].join('\n'));
    expect(map.get('직장')!.scenes.map((s) => s.kind)).toEqual([
      'scene',
      'scene',
      'scene',
      'scene',
    ]);
  });

  it("빈칸은 'scene'이고 'narration'만 극 밖 해설이 된다", () => {
    const map = parseScenarioEpilogueCsv([KIND_HEADER, withKind('narration')].join('\n'));
    expect(map.get('직장')!.scenes.map((s) => s.kind)).toEqual([
      'scene',
      'scene',
      'scene',
      'narration',
    ]);
  });

  it('대소문자·앞뒤 공백이 섞여도 같은 값으로 읽는다', () => {
    const map = parseScenarioEpilogueCsv([KIND_HEADER, withKind('  NARRATION ')].join('\n'));
    expect(map.get('직장')!.scenes[3].kind).toBe('narration');
  });

  it("모르는 값은 'scene'으로 떨어진다 — 오타가 해설 서식을 켜지 않는다", () => {
    const map = parseScenarioEpilogueCsv([KIND_HEADER, withKind('narratoin')].join('\n'));
    expect(map.get('직장')!.scenes[3].kind).toBe('scene');
  });
});

describe('scenario_epilogue.csv — 배포되는 원고', () => {
  it('4영역이 모두 4~8씬으로 갖춰져 있다', async () => {
    const csv = (await import('../assets/data/scenario_epilogue.csv?raw')).default;
    const map = parseScenarioEpilogueCsv(csv);

    expect([...map.keys()].sort()).toEqual(['연인', '일상', '직장', '취업준비'].sort());
    map.forEach((epilogue) => {
      expect(epilogue.scenes.length).toBeGreaterThanOrEqual(EPILOGUE_SCENE_MIN);
      expect(epilogue.scenes.length).toBeLessThanOrEqual(EPILOGUE_SCENE_MAX);
      expect(epilogue.scenes.map((s) => s.sceneNumber)).toEqual(
        epilogue.scenes.map((_, i) => i + 1)
      );
      expect(epilogue.title.length).toBeGreaterThan(0);
      epilogue.scenes.forEach((scene) => {
        expect(scene.bg).not.toBe('');
        expect(scene.text.length).toBeGreaterThan(0);
        // 어느 씬에도 사람이 선다. 극 밖 해설(마무리 장면)에는 2026-08-27
        // R2-27로 환호하는 주인공 한 명만 세웠다 — 그전에는 배경만 남아
        // "인물이 갑자기 사라져 허전하다"는 지적을 받았다. 해설은 화자가 극
        // 밖으로 나오는 자리라 조연은 두지 않고 주인공 한 명뿐이다.
        expect(scene.chars.length).toBeGreaterThan(0);
        if (scene.kind === 'narration') {
          expect(scene.chars).toEqual(['baeksul_f_cheer.png']);
        }
      });
    });
  });

  it('영역마다 마지막 한 씬이 극 밖 해설이고, 그 앞은 모두 극 안 장면이다', async () => {
    const csv = (await import('../assets/data/scenario_epilogue.csv?raw')).default;
    const map = parseScenarioEpilogueCsv(csv);

    map.forEach((epilogue) => {
      const kinds = epilogue.scenes.map((s) => s.kind);
      expect(kinds.filter((k) => k === 'narration')).toHaveLength(1);
      expect(kinds[kinds.length - 1]).toBe('narration');
    });
  });

  it('해설 씬의 배경은 바로 앞 장면과 같다 — 마지막에 화면이 튀지 않는다', async () => {
    const csv = (await import('../assets/data/scenario_epilogue.csv?raw')).default;
    const map = parseScenarioEpilogueCsv(csv);

    map.forEach((epilogue) => {
      const last = epilogue.scenes[epilogue.scenes.length - 1];
      const beforeLast = epilogue.scenes[epilogue.scenes.length - 2];
      expect(last.bg).toBe(beforeLast.bg);
    });
  });
});
