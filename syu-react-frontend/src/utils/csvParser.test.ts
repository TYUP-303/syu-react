// src/utils/csvParser.test.ts
// 검사 문항 CSV 파서의 "현재 동작"을 고정하는 특성화 테스트(characterization test).
//
// 목적은 올바른 사양을 정의하는 것이 아니라, 어드민에서 CSV를 교체하거나
// 파서를 수정할 때 무엇이 달라졌는지 즉시 드러나게 하는 기준선을 만드는 것입니다.
// [위험] 표시가 붙은 케이스는 "에러 없이 잘못된 데이터가 만들어지는" 경로이므로,
// 파서를 개선할 때 우선적으로 손봐야 할 지점입니다.

import { describe, it, expect } from 'vitest';
import { parseQuestionsCsv } from './csvParser';

const HEADER = 'id,part,question,type,options';

describe('parseQuestionsCsv', () => {
  it('헤더만 있는 CSV는 빈 배열을 반환한다', () => {
    expect(parseQuestionsCsv(HEADER)).toEqual([]);
  });

  it('빈 문자열은 빈 배열을 반환한다', () => {
    expect(parseQuestionsCsv('')).toEqual([]);
    expect(parseQuestionsCsv('   \n  ')).toEqual([]);
  });

  it('기본 행을 QuestionItem으로 파싱한다', () => {
    const csv = [
      HEADER,
      '1,주의력,자주 산만해지나요?,scale,"전혀 아니다,가끔,자주,항상"',
    ].join('\n');

    expect(parseQuestionsCsv(csv)).toEqual([
      {
        id: 1,
        part: '주의력',
        question: '자주 산만해지나요?',
        type: 'scale',
        options: ['전혀 아니다', '가끔', '자주', '항상'],
      },
    ]);
  });

  it('따옴표로 감싼 필드 내부의 콤마는 필드 구분자로 취급하지 않는다', () => {
    const csv = [
      HEADER,
      '2,충동성,"줄을 설 때, 기다리기 어렵나요?",yes-no,"예,아니오"',
    ].join('\n');

    const [item] = parseQuestionsCsv(csv);
    expect(item.question).toBe('줄을 설 때, 기다리기 어렵나요?');
    expect(item.options).toEqual(['예', '아니오']);
  });

  it('세 가지 응답 타입을 그대로 보존한다 (셀렉터 컴포넌트 매핑용)', () => {
    const csv = [
      HEADER,
      '1,A,질문1,scale,"1,2,3"',
      '2,A,질문2,yes-no,"예,아니오"',
      '3,A,질문3,multiple-choice,"가,나,다"',
    ].join('\n');

    expect(parseQuestionsCsv(csv).map((q) => q.type)).toEqual([
      'scale',
      'yes-no',
      'multiple-choice',
    ]);
  });

  it('CRLF 줄바꿈과 빈 줄을 처리한다', () => {
    const csv = `${HEADER}\r\n1,A,질문1,scale,"1,2"\r\n\r\n2,A,질문2,scale,"1,2"\r\n`;
    expect(parseQuestionsCsv(csv)).toHaveLength(2);
  });

  it('빈 옵션 항목은 제거한다', () => {
    const csv = [HEADER, '1,A,질문1,scale,"예,,아니오,"'].join('\n');
    expect(parseQuestionsCsv(csv)[0].options).toEqual(['예', '아니오']);
  });

  it('필드가 5개 미만인 행은 조용히 건너뛴다', () => {
    const csv = [
      HEADER,
      '1,A,질문1,scale', // options 누락 → 스킵
      '2,A,질문2,scale,"1,2"',
    ].join('\n');

    const result = parseQuestionsCsv(csv);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it('[위험] 옵션을 따옴표로 감싸지 않으면 첫 번째 옵션만 남고 나머지는 조용히 사라진다', () => {
    // 필드가 5개를 초과해도 파서는 fields[4]만 옵션으로 사용한다.
    const csv = [HEADER, '1,A,질문1,scale,예,아니오,모름'].join('\n');

    const [item] = parseQuestionsCsv(csv);
    expect(item.options).toEqual(['예']); // '아니오', '모름' 유실
  });

  it('[위험] id가 숫자가 아니면 NaN이 되어 답안 키가 서로 덮어써진다', () => {
    const csv = [
      HEADER,
      'Q1,A,질문1,scale,"1,2"',
      'Q2,A,질문2,scale,"1,2"',
    ].join('\n');

    const result = parseQuestionsCsv(csv);
    expect(result[0].id).toBeNaN();
    expect(result[1].id).toBeNaN();
    // useTestStore.answers는 questionId를 키로 쓰므로 두 문항이 한 칸을 공유하게 된다.
  });
});
