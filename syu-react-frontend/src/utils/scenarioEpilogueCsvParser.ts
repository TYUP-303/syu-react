// src/utils/scenarioEpilogueCsvParser.ts
// 영역별 **에필로그**(11번째 에피소드)를 담는 네 번째 시나리오 CSV의 파서.
//
// ── 왜 또 별도 파일인가 ──────────────────────────────────────────
// 에필로그는 그 영역 10편을 다 지나온 뒤 한 번 보는 마무리 장면이다. 기존 두
// CSV와 축이 하나씩 다르다:
//   · 반응 기제(인지·정서·행동) 버전이 **없다** — 열 편을 지나온 결과이지
//     특정 반응 기제의 변주가 아니다.
//   · 회차 번호가 없다 — 영역당 한 편뿐이라 DOMAIN이 곧 키다('직장').
//   · 요정·전략·평가가 없다 — 읽고 끝나는 짧은 장면들이다.
// 그래서 visual/dialogue에 열을 붙이면 REACTION_TYPE 축을 따라 같은 원고를
// 3벌 복사해야 하고, 복사본이 어긋나면 "검사 결과에 따라 에필로그가 달라지는"
// 조용한 버그가 된다. 요정 조언 CSV를 따로 뗀 것과 같은 이유다.
//
// ── 스키마 ───────────────────────────────────────────────────────
//   DOMAIN,SCENE_NUM,TITLE,BG,CHAR_1,CHAR_2,CHAR_3,KIND,TEXT
// 씬 하나가 한 행이다. visual이 한 행에 4씬을 옆으로 늘어놓는 것과 다른데,
// 에필로그는 열 수가 고정될 이유가 없고 씬당 서술 텍스트가 길어 가로로
// 눕히면 시트에서 사람이 읽을 수 없다.
//
// **씬 수는 영역마다 다를 수 있다(4~8).** 처음에는 4씬 고정이었는데, 네
// 씬이 성숙한 대처를 보여 준 자리에서 그대로 끝나 "뚝 끊긴다"는 검수를
// 받았다(2026-08-26). 시간이 조금 흐른 뒤의 매듭 장면을 붙이려면 영역마다
// 필요한 씬 수가 달라져서, 고정 대신 범위로 열었다. 위쪽 한계는 무한정
// 늘어나는 원고를 막기 위한 것이고, 아래쪽 4는 기존 원고의 최소 구성이다.
//
// ── KIND — 극 안인가 극 밖인가 (2026-08-26) ───────────────────────
// 마지막에 **극 밖 화자**가 한 번 말하는 씬이 붙었다. 앞의 씬들이 3인칭
// 현재형으로 장면을 보여 주는 동안, 이 씬만은 다 본 사람에게 무엇이
// 달라졌는지를 해설하고 응원 한 줄로 닫는다.
//
// 같은 CSV·같은 플레이어를 쓰되 **그리는 방식이 달라야** 한다 — 같은 서체·
// 같은 정렬로 이어 붙이면 사용자가 그것도 장면의 일부로 읽고, 갑자기 화자가
// 바뀐 문장이 어색하게 튄다. 그래서 열을 하나 두고 화면이 그 값을 본다.
//
// 값은 `scene`(기본)과 `narration` 둘뿐이다. **빈칸·없는 열·모르는 값은 전부
// scene**이다 — 원고 25행 중 4행만 narration이라 나머지를 빈칸으로 두는 것이
// 시트에서 훨씬 편하고, 오타가 났을 때 "장면으로 보인다"가 "해설로 보인다"보다
// 덜 나쁘다(해설 서식은 인물이 서 있는 장면에 걸리면 눈에 띄게 어긋난다).
//
// DOMAIN은 영역 이름만 쓴다('직장'·'취업준비'·'연인'·'일상'). 다른 CSV의
// '직장1'처럼 회차 번호를 붙이지 않는다 — 영역당 한 편이라 붙일 번호가 없고,
// useScenarioStore의 영역 prefix와 표기가 같아 그대로 조인된다.
//
// ── 파서 성격 ────────────────────────────────────────────────────
// scenarioAngelsCsvParser와 같다. **열 위치가 아니라 헤더 이름으로** 읽고,
// 여러 줄이 든 셀(구글 시트의 Alt+Enter)을 한 행으로 붙이며, 어떤 입력에도
// 예외를 던지지 않는다. 원고를 채우는 사람이 열 순서를 바꾸거나 뒤쪽 열을
// 비워 둬도 행이 통째로 사라지지 않아야 한다.
//
// 딱 한 가지는 관대하지 않다: **씬이 4~6개로 1부터 이어지지 않는 영역은
// 통째로 버린다.** 플레이어가 씬을 1번부터 순서대로 넘기는 구조라, 3씬만 온
// 영역이나 2번이 빠진 영역을 살려 두면 카드가 해금된 채 중간에서 끝나는
// 에필로그가 나온다. 여기서 버리면 화면은 "아직 에필로그가 없는 영역"으로
// 조용히 떨어지고, 그게 덜 나쁜 실패다.

import { parseCsvLine } from './scenarioCsvParser';
import { splitCsvRecords } from './scenarioAngelsCsvParser';

/**
 * 에필로그 한 편에 허용하는 씬 수의 범위. 파서·어드민 검증·원고가 함께 보는 값이다.
 * (어드민 쪽 같은 값은 syu-react-admin/csv_validation.py의 EPILOGUE_SCENE_MIN/MAX)
 */
export const EPILOGUE_SCENE_MIN = 4;
export const EPILOGUE_SCENE_MAX = 8;

/** 화면에 세울 배역 슬롯 수 (CHAR_1 ~ CHAR_3). visual CSV와 같은 3칸이다. */
const CHAR_COLUMN_COUNT = 3;

/**
 * 씬의 종류. `scene`은 극 안의 장면이고 `narration`은 극 밖 화자의 마무리다.
 * CSV의 KIND 열이 정하며, 화면은 이 값으로 서식을 가른다(머리말의 KIND 절 참조).
 */
export type EpilogueSceneKind = 'scene' | 'narration';

/** 에필로그의 씬 하나. SceneData(api/scenarioMockData)로 그대로 옮겨 담을 수 있다. */
export interface EpilogueScene {
  /** 1부터 그 영역의 씬 수까지. 정렬 결과이므로 배열 인덱스 + 1과 같다. */
  sceneNumber: number;
  /** 배경 파일명 — public/scenario/backgrounds 기준 (예: 'office.png') */
  bg: string;
  /** 채워진 배역만 순서대로. 빈 슬롯은 담지 않는다. */
  chars: string[];
  /** 3인칭 현재형 서술. 화면에 닿기 전 '백설' → 닉네임 치환을 거친다. */
  text: string;
  /** 극 안(scene)인가 극 밖 해설(narration)인가. 빈칸·모르는 값은 scene이다. */
  kind: EpilogueSceneKind;
}

/** 한 영역의 에필로그. */
export interface EpilogueEpisode {
  /** 조인 키이자 의상·상대역 해석에 쓰는 영역 이름('직장'). */
  domain: string;
  /** 목록 카드에 찍히는 제목. 비어 있어도 파싱은 성공한다. */
  title: string;
  /** SCENE_NUM 오름차순 4~8개. 1부터 결번 없이 이어지지 않으면 이 영역은 맵에 담기지 않는다. */
  scenes: EpilogueScene[];
}

export type ScenarioEpilogueMap = Map<string, EpilogueEpisode>;

/** BOM·공백·대소문자 차이를 흡수해 헤더 이름을 정규화한다(요정 파서와 같은 규칙). */
function normalizeHeader(raw: string): string {
  return raw
    .replace(/^﻿/, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

/**
 * KIND 셀을 씬 종류로 읽는다. 대소문자·앞뒤 공백은 흡수하고, 아는 값이 아니면
 * 'scene'으로 떨어뜨린다(머리말의 KIND 절 참조 — 오타가 해설 서식을 켜는 것보다
 * 장면으로 보이는 쪽이 덜 나쁘다).
 */
function parseKind(raw: string): EpilogueSceneKind {
  return raw.trim().toLowerCase() === 'narration' ? 'narration' : 'scene';
}

/**
 * 에필로그 CSV를 DOMAIN → 에필로그 맵으로 파싱한다.
 *
 * 방어 동작(전부 조용한 폴백이며 예외를 던지지 않는다):
 * - 빈 입력·헤더만 있는 입력 → 빈 맵
 * - DOMAIN 열이 없는 입력 → 빈 맵
 * - DOMAIN이 빈 행 → 건너뜀
 * - SCENE_NUM이 1~EPILOGUE_SCENE_MAX의 정수가 아닌 행 → 건너뜀
 * - 같은 (DOMAIN, SCENE_NUM)이 두 번 나오면 **뒤 행이 이긴다** (visual 파서와 같은 규칙)
 * - 씬이 4~8개가 아니거나 1부터 이어지지 않는(결번이 있는) 영역 → 그 영역만
 *   통째로 제외 (위 머리말 참조)
 * - KIND 열이 없거나 빈칸이거나 모르는 값 → 'scene'
 * - 헤더보다 짧은 행 → 없는 열만 빈 값으로 보고 행은 살린다
 */
export function parseScenarioEpilogueCsv(csvText: string): ScenarioEpilogueMap {
  const map: ScenarioEpilogueMap = new Map();
  if (!csvText || !csvText.trim()) return map;

  const records = splitCsvRecords(csvText).filter((record) => record.trim() !== '');
  if (records.length < 2) return map;

  const headerIndex = new Map<string, number>();
  parseCsvLine(records[0]).forEach((name, idx) => {
    const key = normalizeHeader(name);
    // 같은 이름이 두 번 나오면 앞선 열을 쓴다(시트에서 열을 복사해 둔 경우 방어).
    if (key && !headerIndex.has(key)) headerIndex.set(key, idx);
  });

  const domainIdx = headerIndex.get('DOMAIN');
  if (domainIdx === undefined) return map;

  const cell = (fields: string[], column: string): string => {
    const idx = headerIndex.get(column);
    if (idx === undefined) return '';
    return (fields[idx] ?? '').trim();
  };

  // 영역별로 씬을 번호 → 씬 맵에 모은다. 배열이 아니라 맵인 이유는 결번과
  // 중복을 같은 자료구조로 다루기 위해서다 — 뒤 행이 앞 행을 덮고, 끝에
  // 크기를 세면 결번이 그대로 드러난다.
  const collected = new Map<string, { title: string; scenes: Map<number, EpilogueScene> }>();

  for (let i = 1; i < records.length; i++) {
    const fields = parseCsvLine(records[i]);
    const domain = (fields[domainIdx] ?? '').trim();
    if (!domain) continue;

    const rawSceneNum = cell(fields, 'SCENE_NUM');
    if (!/^\d+$/.test(rawSceneNum)) continue;
    const sceneNumber = Number(rawSceneNum);
    if (sceneNumber < 1 || sceneNumber > EPILOGUE_SCENE_MAX) continue;

    const chars: string[] = [];
    for (let slot = 1; slot <= CHAR_COLUMN_COUNT; slot++) {
      const value = cell(fields, `CHAR_${slot}`);
      if (value) chars.push(value);
    }

    const entry = collected.get(domain) ?? { title: '', scenes: new Map<number, EpilogueScene>() };
    // 제목은 영역당 하나다. 씬마다 같은 값을 적어 두는 스키마라, 처음 만난
    // 비지 않은 값을 쓴다 — 한 칸이 비어도 제목이 사라지지 않는다.
    if (!entry.title) entry.title = cell(fields, 'TITLE');
    entry.scenes.set(sceneNumber, {
      sceneNumber,
      bg: cell(fields, 'BG'),
      chars,
      text: cell(fields, 'TEXT'),
      kind: parseKind(cell(fields, 'KIND')),
    });
    collected.set(domain, entry);
  }

  collected.forEach((entry, domain) => {
    const sceneCount = entry.scenes.size;
    if (sceneCount < EPILOGUE_SCENE_MIN || sceneCount > EPILOGUE_SCENE_MAX) return;
    // 개수가 맞아도 결번이면 버린다. 1,2,3,5처럼 들어오면 세그먼트 표시와
    // 실제 순서가 어긋난 채로 재생되기 때문이다.
    for (let n = 1; n <= sceneCount; n++) {
      if (!entry.scenes.has(n)) return;
    }
    const scenes = [...entry.scenes.values()].sort((a, b) => a.sceneNumber - b.sceneNumber);
    map.set(domain, { domain, title: entry.title, scenes });
  });

  return map;
}
