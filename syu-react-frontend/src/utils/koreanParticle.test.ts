import { describe, expect, it } from 'vitest';

import {
  conjunctionParticle,
  hasFinalConsonant,
  objectParticle,
  subjectParticle,
  topicParticle,
  vocativeParticle,
} from './koreanParticle';

describe('hasFinalConsonant', () => {
  it('받침이 있으면 true', () => {
    expect(hasFinalConsonant('아콘')).toBe(true);
    expect(hasFinalConsonant('전혀없음')).toBe(true);
  });

  it('받침이 없으면 false', () => {
    expect(hasFinalConsonant('아코')).toBe(false);
    expect(hasFinalConsonant('포코')).toBe(false);
  });

  // 조사는 닫는 괄호가 아니라 그 앞 음절이 결정한다.
  it('괄호로 끝나면 괄호 안 마지막 한글 음절로 판정한다', () => {
    expect(hasFinalConsonant('거의 없음(한 달에 한 번 이하)')).toBe(false); // '하'
    expect(hasFinalConsonant('때때로(한 달에 몇번)')).toBe(true); // '번'
  });

  it('한글이 없으면 받침 없음으로 본다', () => {
    expect(hasFinalConsonant('REACT')).toBe(false);
    expect(hasFinalConsonant('')).toBe(false);
  });
});

describe('조사 선택', () => {
  it('주격 이/가', () => {
    expect(subjectParticle('여명')).toBe('이');
    expect(subjectParticle('아코')).toBe('가');
  });

  it('목적격 을/를', () => {
    expect(objectParticle('여명')).toBe('을');
    expect(objectParticle('아코')).toBe('를');
  });

  it('접속 와/과', () => {
    expect(conjunctionParticle('전혀없음')).toBe('과');
    expect(conjunctionParticle('거의 없음(한 달에 한 번 이하)')).toBe('와');
  });

  // 시나리오 주인공 이름 치환(personalizeScenarioText)이 쓴다 — 원문의
  // "백설은 …"을 닉네임 받침에 맞춰 "민준은 …" / "지수는 …"으로 가른다.
  it('주제 은/는', () => {
    expect(topicParticle('민준')).toBe('은');
    expect(topicParticle('지수')).toBe('는');
  });

  // 호격은 현재 CSV에 0건이지만, 시트가 대사를 고쳐 "백설아"가 들어오면
  // 받침 없는 닉네임에 그대로 붙어 "지수아"가 나간다.
  it('호격 아/야', () => {
    expect(vocativeParticle('민준')).toBe('아');
    expect(vocativeParticle('지수')).toBe('야');
  });
});
