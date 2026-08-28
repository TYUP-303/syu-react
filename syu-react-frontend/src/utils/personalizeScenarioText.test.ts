// src/utils/personalizeScenarioText.test.ts
//
// 시나리오 원문의 주인공 '백설'을 닉네임으로 바꾸는 규칙을 고정한다.
// 케이스는 실제 CSV에서 뽑았다 — scenario_dialogues.csv 기준 등장 형태는
// '백설은'(288) · '백설에게'(5) · '백설의'(4) · '백설이 '(1) · '백설이다'(1),
// scenario_visual.csv의 TITLE에 단독 '백설'(3)이다.

import { describe, expect, it } from 'vitest';

import { personalizeScenarioText } from './personalizeScenarioText';

/** 받침 있는 닉네임 / 받침 없는 닉네임 */
const WITH_BATCHIM = '민준';
const WITHOUT_BATCHIM = '지수';

describe('personalizeScenarioText — 교정 대상 조사 4쌍', () => {
  it('은/는 — 받침 유무에 따라 갈린다', () => {
    const text = '백설은 팀 프로젝트 회의에서 발표하고 있다.';
    expect(personalizeScenarioText(text, WITH_BATCHIM)).toBe('민준은 팀 프로젝트 회의에서 발표하고 있다.');
    expect(personalizeScenarioText(text, WITHOUT_BATCHIM)).toBe('지수는 팀 프로젝트 회의에서 발표하고 있다.');
  });

  // '백설'은 ㄹ 받침이라 원문은 늘 '백설이'로 적힌다. 닉네임이 모음으로
  // 끝나면 주격 조사가 '가'로 바뀌어야 한다.
  it('이/가 — 원문의 받침형 주격 조사를 다시 고른다', () => {
    const text = '그러나 백설이 작성한 회의록은 큰 항목만 적혀 있다.';
    expect(personalizeScenarioText(text, WITH_BATCHIM)).toBe('그러나 민준이 작성한 회의록은 큰 항목만 적혀 있다.');
    expect(personalizeScenarioText(text, WITHOUT_BATCHIM)).toBe('그러나 지수가 작성한 회의록은 큰 항목만 적혀 있다.');
  });

  it('을/를 — 목적격도 교정한다', () => {
    const text = '팀장이 백설을 불렀다.';
    expect(personalizeScenarioText(text, WITH_BATCHIM)).toBe('팀장이 민준을 불렀다.');
    expect(personalizeScenarioText(text, WITHOUT_BATCHIM)).toBe('팀장이 지수를 불렀다.');
  });

  it('과/와 — 접속 조사도 교정한다', () => {
    const text = '동료는 백설과 함께 자료를 다시 확인했다.';
    expect(personalizeScenarioText(text, WITH_BATCHIM)).toBe('동료는 민준과 함께 자료를 다시 확인했다.');
    expect(personalizeScenarioText(text, WITHOUT_BATCHIM)).toBe('동료는 지수와 함께 자료를 다시 확인했다.');
  });

  // 시트에서 조사가 잘못 적혀 들어와도 화면에는 올바른 형태가 나가야 한다.
  it('원문이 비받침형 조사를 써 두었어도 닉네임 기준으로 다시 고른다', () => {
    expect(personalizeScenarioText('백설는 걸었다.', WITH_BATCHIM)).toBe('민준은 걸었다.');
    expect(personalizeScenarioText('백설가 걸었다.', WITHOUT_BATCHIM)).toBe('지수가 걸었다.');
  });
});

describe('personalizeScenarioText — 불변 조사와 단독 등장', () => {
  it('의·에게·도·만·처럼·보다·께·한테는 이름만 바꾼다', () => {
    const cases = [
      ['백설의 마음이 무겁다.', '지수의 마음이 무겁다.'],
      ['팀장이 백설에게 다시 확인해 달라고 말한다.', '팀장이 지수에게 다시 확인해 달라고 말한다.'],
      ['백설도 같은 생각이었다.', '지수도 같은 생각이었다.'],
      ['백설만 남았다.', '지수만 남았다.'],
      ['백설처럼 조용했다.', '지수처럼 조용했다.'],
      ['백설보다 늦었다.', '지수보다 늦었다.'],
      ['백설께 전해 달라고 했다.', '지수께 전해 달라고 했다.'],
      ['백설한테 물어봤다.', '지수한테 물어봤다.'],
    ] as const;

    for (const [input, expected] of cases) {
      expect(personalizeScenarioText(input, WITHOUT_BATCHIM)).toBe(expected);
    }
  });

  // scenario_visual.csv의 TITLE "자격증 공부가 늘지 않는 백설"이 이 형태다.
  it('문장 끝 단독 등장은 이름만 바꾼다', () => {
    expect(personalizeScenarioText('자격증 공부가 늘지 않는 백설', WITHOUT_BATCHIM)).toBe(
      '자격증 공부가 늘지 않는 지수'
    );
    expect(personalizeScenarioText('백설, 그리고 동료', WITHOUT_BATCHIM)).toBe('지수, 그리고 동료');
  });

  // 여기서 '이'는 주격 조사가 아니라 서술격 조사 '이다'의 일부다.
  // 조사로 오인하면 "지수가다."가 나온다.
  it("'백설이다'의 '이'는 조사로 보지 않는다", () => {
    expect(personalizeScenarioText('있는 그대로 보고 싶은 백설이다.', WITHOUT_BATCHIM)).toBe(
      '있는 그대로 보고 싶은 지수이다.'
    );
    expect(personalizeScenarioText('있는 그대로 보고 싶은 백설이다.', WITH_BATCHIM)).toBe(
      '있는 그대로 보고 싶은 민준이다.'
    );
  });

  // 호격 아/야 — 현재 CSV에는 0건이지만 시트가 대사를 고치면 바로 등장한다.
  // 받침 있는 원문('백설아')을 그대로 두면 "지수아"라고 부르게 된다.
  it('호격 조사 아/야를 닉네임 받침에 맞춘다', () => {
    expect(personalizeScenarioText('백설아, 잠깐 이야기할까?', WITHOUT_BATCHIM)).toBe(
      '지수야, 잠깐 이야기할까?'
    );
    expect(personalizeScenarioText('백설아, 잠깐 이야기할까?', WITH_BATCHIM)).toBe(
      '민준아, 잠깐 이야기할까?'
    );
    // 시트에 잘못 적힌 '백설야'도 올바른 형태로 나간다 (양방향 교정)
    expect(personalizeScenarioText('백설야!', WITH_BATCHIM)).toBe('민준아!');
  });

  // 조사 뒤에 한글이 이어지면 조사로 보지 않는 기존 규칙이 아/야에도 적용된다.
  it("'백설아이…'처럼 한글이 이어지면 조사로 보지 않는다", () => {
    expect(personalizeScenarioText('백설아이스크림', WITHOUT_BATCHIM)).toBe('지수아이스크림');
  });

  it('한 문장에 여러 번 등장해도 모두 바꾼다', () => {
    expect(
      personalizeScenarioText('백설은 회의록을 확인한다. 그러나 백설이 적은 항목은 부족하다.', WITHOUT_BATCHIM)
    ).toBe('지수는 회의록을 확인한다. 그러나 지수가 적은 항목은 부족하다.');
  });
});

describe('personalizeScenarioText — 방어', () => {
  it('닉네임이 없거나 공백뿐이면 원문을 그대로 둔다', () => {
    const text = '백설은 팀 회의에서 발표하고 있다.';
    expect(personalizeScenarioText(text, undefined)).toBe(text);
    expect(personalizeScenarioText(text, null)).toBe(text);
    expect(personalizeScenarioText(text, '')).toBe(text);
    expect(personalizeScenarioText(text, '   ')).toBe(text);
  });

  it('빈 문자열은 그대로 돌려준다', () => {
    expect(personalizeScenarioText('', WITHOUT_BATCHIM)).toBe('');
  });

  it("'백설'이 없는 문장은 손대지 않는다", () => {
    const text = '회의는 계속 진행되지만, 마음에 남는 일이 있다.';
    expect(personalizeScenarioText(text, WITHOUT_BATCHIM)).toBe(text);
  });

  // 한글이 없는 닉네임은 koreanParticle 규약대로 받침 없음(기본형)으로 본다.
  it('영문 닉네임은 받침 없음으로 보고 기본형 조사를 붙인다', () => {
    expect(personalizeScenarioText('백설은 걸었다.', 'Ray')).toBe('Ray는 걸었다.');
  });
});
