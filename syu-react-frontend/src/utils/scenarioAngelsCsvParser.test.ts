// src/utils/scenarioAngelsCsvParser.test.ts
// 요정 조언 CSV 파서의 계약을 고정하는 테스트.
//
// visual/dialogue 파서 테스트와 성격이 다르다. 그쪽은 "이미 굳어 버린 동작"을
// 기록한 특성화 테스트지만, 이 파서는 이번에 새로 쓴 것이라 **여기 적힌 것이
// 사양**이다. 특히 "값이 없으면 undefined를 돌려주고 폴백은 소비처가 한다"와
// "행이 짧아도 버리지 않는다"는 원고가 40세트 다 채워지기 전까지 앱이 깨지지
// 않게 하는 핵심 조건이다.

import { describe, it, expect } from 'vitest';
import { parseScenarioAngelsCsv, splitCsvRecords } from './scenarioAngelsCsvParser';

const HEADER =
  'NO,DOMAIN,' +
  'ACCEPT_TITLE,ACCEPT_DETAIL,ACCEPT_AFTER,' +
  'REAPPRAISAL_TITLE,REAPPRAISAL_DETAIL,REAPPRAISAL_AFTER,' +
  'REFOCUS_TITLE,REFOCUS_DETAIL,REFOCUS_AFTER,' +
  'HELPFUL_1,HELPFUL_2,HELPFUL_3,UNHELPFUL_1,UNHELPFUL_2,UNHELPFUL_3';

/** 17칸을 모두 채운 정상 행 */
const fullRow = (domain = '일상1') =>
  [
    '31',
    domain,
    '아코 한 줄',
    '아코 조언',
    '아코 실행 대사',
    '포코 한 줄',
    '포코 조언',
    '포코 실행 대사',
    '리프 한 줄',
    '리프 조언',
    '리프 실행 대사',
    '도움1',
    '도움2',
    '도움3',
    '비도움1',
    '비도움2',
    '비도움3',
  ].join(',');

/** DOMAIN만 채우고 나머지를 비운 행 — 원고 도착 전의 39편이 이 모양이다. */
const emptyRow = (domain: string) => [`31`, domain, ...Array(15).fill('')].join(',');

describe('parseScenarioAngelsCsv — 정상 파싱', () => {
  it('DOMAIN을 키로 요정 3종과 선택지를 읽는다', () => {
    const map = parseScenarioAngelsCsv([HEADER, fullRow()].join('\n'));

    expect(map.size).toBe(1);
    const entry = map.get('일상1')!;
    expect(entry.domain).toBe('일상1');
    expect(entry.accept).toEqual({
      line: '아코 한 줄',
      detail: '아코 조언',
      feedback: '아코 실행 대사',
    });
    expect(entry.reappraisal.detail).toBe('포코 조언');
    expect(entry.refocus.feedback).toBe('리프 실행 대사');
    expect(entry.helpful).toEqual(['도움1', '도움2', '도움3']);
    expect(entry.unhelpful).toEqual(['비도움1', '비도움2', '비도움3']);
  });

  it('열 순서가 바뀌어도 헤더 이름으로 찾는다 (시트에서 열을 옮겨도 안전)', () => {
    const map = parseScenarioAngelsCsv(
      ['ACCEPT_DETAIL,DOMAIN,HELPFUL_1', '아코 조언,연인3,도움1'].join('\n')
    );

    const entry = map.get('연인3')!;
    expect(entry.accept.detail).toBe('아코 조언');
    expect(entry.helpful).toEqual(['도움1']);
    // 없는 열은 undefined — 소비처가 기본값으로 폴백한다.
    expect(entry.accept.line).toBeUndefined();
    expect(entry.refocus.detail).toBeUndefined();
    expect(entry.unhelpful).toEqual([]);
  });

  it('헤더의 BOM·앞뒤 공백·소문자를 흡수한다', () => {
    const map = parseScenarioAngelsCsv(
      ['﻿no, domain , accept_detail', '31,일상1,아코 조언'].join('\n')
    );

    expect(map.get('일상1')!.accept.detail).toBe('아코 조언');
  });

  it('선택지 열은 HELPFUL_5까지 읽고 빈 칸은 건너뛴다', () => {
    const map = parseScenarioAngelsCsv(
      ['DOMAIN,HELPFUL_1,HELPFUL_2,HELPFUL_3,HELPFUL_4,HELPFUL_5', '직장1,가,,다,,마'].join('\n')
    );

    expect(map.get('직장1')!.helpful).toEqual(['가', '다', '마']);
  });

  it('한 행에 같은 선택지 문구가 중복되면 하나만 남긴다', () => {
    // 문구가 화면의 React key이자 Firestore에 저장되는 값이라 중복이 위험하다.
    const map = parseScenarioAngelsCsv(
      ['DOMAIN,HELPFUL_1,HELPFUL_2,HELPFUL_3', '직장1,같은 문구,같은 문구,다른 문구'].join('\n')
    );

    expect(map.get('직장1')!.helpful).toEqual(['같은 문구', '다른 문구']);
  });

  it('따옴표 안의 콤마를 보존하고 이스케이프된 따옴표("")를 복원한다', () => {
    const map = parseScenarioAngelsCsv(
      ['DOMAIN,ACCEPT_DETAIL', '일상1,"괜찮아요, 그리고 ""그대로"" 두세요"'].join('\n')
    );

    expect(map.get('일상1')!.accept.detail).toBe('괜찮아요, 그리고 "그대로" 두세요');
  });

  it('셀 안의 줄바꿈(따옴표로 감싼 여러 줄)을 한 행으로 읽는다', () => {
    // 구글 시트에서 Alt+Enter로 줄을 나눠 적으면 이 모양으로 내보내진다.
    const map = parseScenarioAngelsCsv(
      ['DOMAIN,ACCEPT_DETAIL,HELPFUL_1', '일상1,"첫 줄\n둘째 줄",도움1', '일상2,단일 줄,도움A'].join(
        '\n'
      )
    );

    expect(map.size).toBe(2);
    expect(map.get('일상1')!.accept.detail).toBe('첫 줄\n둘째 줄');
    expect(map.get('일상2')!.accept.detail).toBe('단일 줄');
  });

  it('CRLF 줄바꿈과 마지막 빈 줄을 견딘다', () => {
    const map = parseScenarioAngelsCsv(`DOMAIN,ACCEPT_DETAIL\r\n일상1,아코 조언\r\n`);
    expect(map.size).toBe(1);
    expect(map.get('일상1')!.accept.detail).toBe('아코 조언');
  });
});

describe('parseScenarioAngelsCsv — 폴백 경로 (원고가 없는 상태)', () => {
  it('DOMAIN만 있고 나머지가 빈 행은 "값 없음"으로 읽힌다', () => {
    const map = parseScenarioAngelsCsv([HEADER, emptyRow('직장1')].join('\n'));

    const entry = map.get('직장1')!;
    expect(entry.accept).toEqual({ line: undefined, detail: undefined, feedback: undefined });
    expect(entry.reappraisal.detail).toBeUndefined();
    expect(entry.helpful).toEqual([]);
    expect(entry.unhelpful).toEqual([]);
  });

  it('공백만 든 칸도 "값 없음"이다 (시트에서 스페이스가 남는 흔한 사고)', () => {
    const map = parseScenarioAngelsCsv(
      ['DOMAIN,ACCEPT_DETAIL,HELPFUL_1', '일상1,   ,   '].join('\n')
    );

    expect(map.get('일상1')!.accept.detail).toBeUndefined();
    expect(map.get('일상1')!.helpful).toEqual([]);
  });

  it('조언(detail)과 실행 후 소감(feedback)은 서로 독립적으로 읽힌다', () => {
    // 원고 가이드가 "요정을 눌렀을 때 나오는 조언"만 요구하고 있어, 시트에
    // detail만 차고 feedback이 비는 상황이 실제로 예상된다(그 반대도 마찬가지).
    // 두 칸은 화면상 다른 단계에 나오므로 한 칸만 채워도 그 칸만 반영돼야 한다.
    const detailOnly = parseScenarioAngelsCsv(
      ['DOMAIN,ACCEPT_DETAIL,ACCEPT_AFTER', '일상1,조언만,'].join('\n')
    );
    expect(detailOnly.get('일상1')!.accept).toEqual({
      line: undefined,
      detail: '조언만',
      feedback: undefined,
    });

    const feedbackOnly = parseScenarioAngelsCsv(
      ['DOMAIN,ACCEPT_DETAIL,ACCEPT_AFTER', '일상1,,소감만'].join('\n')
    );
    expect(feedbackOnly.get('일상1')!.accept).toEqual({
      line: undefined,
      detail: undefined,
      feedback: '소감만',
    });
  });

  it('일부 요정만 채워도 나머지는 값 없음으로 남는다 (필드 단위 폴백의 전제)', () => {
    const map = parseScenarioAngelsCsv(
      [HEADER, ['31', '일상2', '', '아코만 채움', ...Array(13).fill('')].join(',')].join('\n')
    );

    const entry = map.get('일상2')!;
    expect(entry.accept.detail).toBe('아코만 채움');
    expect(entry.accept.line).toBeUndefined();
    expect(entry.reappraisal.detail).toBeUndefined();
    expect(entry.refocus.detail).toBeUndefined();
  });
});

describe('parseScenarioAngelsCsv — 잘못된 입력 방어', () => {
  it('빈 문자열·공백·헤더만 있는 입력은 빈 맵이다', () => {
    expect(parseScenarioAngelsCsv('').size).toBe(0);
    expect(parseScenarioAngelsCsv('   \n  ').size).toBe(0);
    expect(parseScenarioAngelsCsv(HEADER).size).toBe(0);
  });

  it('DOMAIN 열이 없는 CSV는 통째로 무시한다 (엉뚱한 파일이 올라와도 기본값으로 산다)', () => {
    const map = parseScenarioAngelsCsv(
      ['NO,TITLE,ACCEPT_DETAIL', '31,할 일이 사라진 날,아코 조언'].join('\n')
    );

    expect(map.size).toBe(0);
  });

  it('DOMAIN이 빈 행은 건너뛴다', () => {
    const map = parseScenarioAngelsCsv(
      ['DOMAIN,ACCEPT_DETAIL', ',버려질 조언', '일상1,살아남을 조언'].join('\n')
    );

    expect(map.size).toBe(1);
    expect(map.get('일상1')!.accept.detail).toBe('살아남을 조언');
  });

  it('헤더보다 짧은 행도 버리지 않는다 (visual 파서와 의도적으로 다르다)', () => {
    // scenario_visual.csv는 필드 20개 미만이면 행을 통째로 버려 에피소드가
    // 조용히 사라진다. 여기서는 뒤쪽 열이 잘려도 앞쪽 원고는 살려야 한다 —
    // 시트에서 빈 열이 잘려 나가는 일이 흔하기 때문이다.
    const map = parseScenarioAngelsCsv([HEADER, '31,일상1,한 줄,조언'].join('\n'));

    const entry = map.get('일상1')!;
    expect(entry.accept.line).toBe('한 줄');
    expect(entry.accept.detail).toBe('조언');
    expect(entry.accept.feedback).toBeUndefined();
    expect(entry.helpful).toEqual([]);
  });

  it('같은 DOMAIN이 두 번 나오면 마지막 행이 이긴다', () => {
    const map = parseScenarioAngelsCsv(
      ['DOMAIN,ACCEPT_DETAIL', '일상1,먼저 쓴 조언', '일상1,나중에 쓴 조언'].join('\n')
    );

    expect(map.size).toBe(1);
    expect(map.get('일상1')!.accept.detail).toBe('나중에 쓴 조언');
  });

  it('DOMAIN에 언더스코어가 있어도 안전하다 (visual 파서의 [위험] 케이스와 대비)', () => {
    // 다른 두 파서는 "{no}_{domain}_{reactionType}" 문자열을 split('_')로 되돌려
    // 언더스코어에 취약하다. 여기 조인 키는 DOMAIN 값 그 자체라 영향이 없다.
    const map = parseScenarioAngelsCsv(
      ['DOMAIN,ACCEPT_DETAIL', 'work_life1,아코 조언'].join('\n')
    );

    expect(map.get('work_life1')!.accept.detail).toBe('아코 조언');
  });
});

describe('splitCsvRecords', () => {
  it('따옴표 밖의 개행에서만 자른다', () => {
    expect(splitCsvRecords('a,b\nc,"d\ne"\nf,g')).toEqual(['a,b', 'c,"d\ne"', 'f,g']);
  });

  it('이스케이프된 따옴표를 지나쳐도 인용 상태가 어긋나지 않는다', () => {
    expect(splitCsvRecords('a,"""따옴표"" 안\n계속"\nb,c')).toEqual([
      'a,"""따옴표"" 안\n계속"',
      'b,c',
    ]);
  });
});
