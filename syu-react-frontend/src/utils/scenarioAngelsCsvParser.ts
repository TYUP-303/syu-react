// src/utils/scenarioAngelsCsvParser.ts
// 에피소드별 "요정 조언 3종 + 도움/비도움 요인 선택지"를 담는 세 번째 시나리오 CSV의 파서.
//
// ── 왜 별도 파일인가 ─────────────────────────────────────────────
// scenario_visual / scenario_dialogues는 **반응 기제(인지·정서·행동) 버전마다
// 행이 따로** 있다(에피소드 40편 × 3버전 = 120행, 대사는 ×4씬 = 480행).
// 그런데 요정 조언은 버전이 아니라 **에피소드 단위**로 하나면 된다(40세트).
// 두 CSV 중 하나에 열을 붙이면 같은 원고를 3벌(대사 CSV라면 12벌) 복사해야 하고,
// 복사본이 서로 어긋나면 "검사 결과에 따라 조언이 달라지는" 조용한 버그가 된다.
// 그래서 에피소드 1편 = 1행인 파일을 새로 둔다. 팀 4명이 영역 하나씩(10행씩)
// 맡아 스프레드시트에서 채우는 분담 구조와도 그대로 맞는다.
//
// ── 조인 키 ──────────────────────────────────────────────────────
// DOMAIN 열('일상1') 하나다. 다른 두 CSV의 키는 "{no}_{domain}_{reactionType}"
// 이지만 DOMAIN만으로 이미 에피소드가 유일하게 정해지고, NO까지 키에 넣으면
// 번호 하나만 어긋나도 조인이 조용히 실패한다. NO 열은 사람이 읽기 위한
// 참고 열이며 파서는 쓰지 않는다.
//
// ── 파서 성격 ────────────────────────────────────────────────────
// visual/dialogue 파서와 달리 **열 위치가 아니라 헤더 이름으로** 읽는다.
// 원고를 코드 사정을 모르는 4명이 시트에서 채우므로, 열 순서가 바뀌거나
// 뒤쪽 열이 통째로 비어도 행이 사라지지 않아야 한다. 값이 없는 칸은
// undefined로 돌려주고, 기본값 폴백은 소비처(useScenarioStore)가 맡는다.

import { parseCsvLine } from './scenarioCsvParser';

/** 요정 한 종의 에피소드별 문구 덮어쓰기. 채워진 필드만 기본값을 이긴다. */
export interface AngelTextOverride {
  /** AngelStrategy.strategy — 요정 이름 아래 한 줄 요약 */
  line?: string;
  /** AngelStrategy.detail — 조언 상세(카드 본문) */
  detail?: string;
  /** AngelStrategy.feedback — 전략 실행 후 주인공의 반응 대사 */
  feedback?: string;
}

/** CSV 한 행 = 에피소드 한 편. */
export interface EpisodeAngelText {
  /** 조인 키. scenario_visual의 DOMAIN과 같은 값('일상1') */
  domain: string;
  accept: AngelTextOverride;
  reappraisal: AngelTextOverride;
  refocus: AngelTextOverride;
  /** 비어 있으면(길이 0) 소비처가 기본 선택지로 폴백한다 */
  helpful: string[];
  unhelpful: string[];
}

export type ScenarioAngelTextMap = Map<string, EpisodeAngelText>;

/** 요정 키 → 열 이름. 시트 헤더를 바꾸려면 여기와 CSV를 함께 고친다. */
const ANGEL_COLUMNS = {
  accept: { line: 'ACCEPT_TITLE', detail: 'ACCEPT_DETAIL', feedback: 'ACCEPT_AFTER' },
  reappraisal: {
    line: 'REAPPRAISAL_TITLE',
    detail: 'REAPPRAISAL_DETAIL',
    feedback: 'REAPPRAISAL_AFTER',
  },
  refocus: { line: 'REFOCUS_TITLE', detail: 'REFOCUS_DETAIL', feedback: 'REFOCUS_AFTER' },
} as const;

/**
 * 읽어 들이는 선택지 열의 최대 개수(HELPFUL_1 ~ HELPFUL_5).
 * 템플릿은 3개지만, 시트에서 열을 더 붙여도 파서를 고치지 않아도 되게 여유를 둔다.
 */
const MAX_REASON_COLUMNS = 5;

/**
 * CSV 원문을 "레코드" 단위로 자른다.
 *
 * 단순 `split('\n')`과 다른 점은 **따옴표 안의 개행을 줄바꿈으로 보지 않는다**는
 * 것이다. 구글 시트에서 셀 안에 줄바꿈(Alt+Enter)을 넣고 내보내면 따옴표로
 * 감싼 여러 줄짜리 필드가 나오는데, 줄 단위로 자르면 그 행 전체가 깨진다.
 */
export function splitCsvRecords(text: string): string[] {
  const records: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"') {
      // 이스케이프된 따옴표("")는 상태를 바꾸지 않고 그대로 흘려보낸다.
      // 실제 해제는 parseCsvLine이 필드 단위로 다시 한다.
      if (inQuotes && text[i + 1] === '"') {
        current += '""';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      current += char;
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      records.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  records.push(current);
  return records;
}

/** BOM·공백·대소문자 차이를 흡수해 헤더 이름을 정규화한다. */
function normalizeHeader(raw: string): string {
  return raw
    .replace(/^﻿/, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

/**
 * 요정 조언 CSV를 DOMAIN → 문구 맵으로 파싱한다.
 *
 * 방어 동작(전부 "조용히 폴백"이며 예외를 던지지 않는다):
 * - 빈 문자열·헤더만 있는 입력 → 빈 맵
 * - DOMAIN 열이 없는 입력 → 빈 맵 (엉뚱한 CSV가 올라와도 기본값으로 산다)
 * - DOMAIN이 빈 행 → 건너뜀
 * - 헤더보다 짧은 행 → 없는 열만 비어 있는 것으로 보고 행은 살린다
 * - 같은 DOMAIN이 여러 번 나오면 **마지막 행이 이긴다** (visual 파서와 같은 규칙)
 * - 같은 선택지 문구가 한 행에 중복되면 하나만 남긴다
 *   (선택지 문구가 화면의 React key이자 Firestore에 저장되는 값이라 중복이 위험하다)
 */
export function parseScenarioAngelsCsv(csvText: string): ScenarioAngelTextMap {
  const map: ScenarioAngelTextMap = new Map();
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

  const cell = (fields: string[], column: string): string | undefined => {
    const idx = headerIndex.get(column);
    if (idx === undefined) return undefined;
    const value = fields[idx];
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  };

  const readOverride = (
    fields: string[],
    columns: { line: string; detail: string; feedback: string }
  ): AngelTextOverride => ({
    line: cell(fields, columns.line),
    detail: cell(fields, columns.detail),
    feedback: cell(fields, columns.feedback),
  });

  const readReasons = (fields: string[], prefix: string): string[] => {
    const reasons: string[] = [];
    for (let i = 1; i <= MAX_REASON_COLUMNS; i++) {
      const value = cell(fields, `${prefix}_${i}`);
      if (value && !reasons.includes(value)) reasons.push(value);
    }
    return reasons;
  };

  for (let i = 1; i < records.length; i++) {
    const fields = parseCsvLine(records[i]);
    const domain = (fields[domainIdx] ?? '').trim();
    if (!domain) continue;

    map.set(domain, {
      domain,
      accept: readOverride(fields, ANGEL_COLUMNS.accept),
      reappraisal: readOverride(fields, ANGEL_COLUMNS.reappraisal),
      refocus: readOverride(fields, ANGEL_COLUMNS.refocus),
      helpful: readReasons(fields, 'HELPFUL'),
      unhelpful: readReasons(fields, 'UNHELPFUL'),
    });
  }

  return map;
}
