// src/utils/episodeSummary.test.ts
// 목록 카드 줄거리의 두 벌(접힘 preview · 펼침 full) — 2026-08-27 UAT R2-08·R2-09.
//
// 고정하는 것은 "어디서 자르는가"다. 예전에는 40자에서 자르고 ' ...'를 붙인 뒤
// CSS truncate가 다시 잘라 한 문장이 두 번 잘렸다.

import { describe, it, expect } from 'vitest';
import { buildEpisodeSummary, SUMMARY_FALLBACK_LENGTH } from './episodeSummary';

describe('buildEpisodeSummary', () => {
  it('첫 문장까지만 미리보기로 쓰고, 온전한 문장이라 말줄임을 붙이지 않는다', () => {
    const text =
      '김태엽은 팀 프로젝트 회의에서 자신이 정리한 자료를 발표하고 있다. 발표가 끝나자 아무도 입을 열지 않는다.';
    const { preview, full } = buildEpisodeSummary(text);

    expect(preview).toBe('김태엽은 팀 프로젝트 회의에서 자신이 정리한 자료를 발표하고 있다.');
    expect(preview).not.toContain('...');
    expect(preview).not.toContain('…');
    // 펼치면 전문이 그대로 나온다 — 상한도 말줄임도 없다(사용자 확정).
    expect(full).toBe(text);
  });

  it.each(['요.', '!', '?'])("'%s'로 끝나는 첫 문장도 그 자리에서 끊는다", (ending) => {
    const { preview } = buildEpisodeSummary(`첫 문장이에${ending} 두 번째 문장이다.`);
    expect(preview).toBe(`첫 문장이에${ending}`);
  });

  it('문장이 하나뿐이면 그대로가 미리보기다', () => {
    const text = '짧은 한 문장이다.';
    expect(buildEpisodeSummary(text)).toEqual({ preview: text, full: text });
  });

  it('종결 부호 뒤에 글자가 이어지면 문장 끝으로 보지 않는다', () => {
    // "발표 ..." 같은 말줄임의 첫 점에서 끊기면 미리보기가 통째로 망가진다.
    const text = '백설은 "그만해."라고 말했다. 그리고 방을 나섰다.';
    expect(buildEpisodeSummary(text).preview).toBe('백설은 "그만해."라고 말했다.');
  });

  it('종결 부호가 없으면 길이로 자르고 말줄임은 한 글자(…)만 붙인다', () => {
    const text = '가'.repeat(SUMMARY_FALLBACK_LENGTH + 10);
    const { preview } = buildEpisodeSummary(text);

    expect(preview).toBe(`${'가'.repeat(SUMMARY_FALLBACK_LENGTH)}…`);
    expect(preview).not.toContain('...');
  });

  it('종결 부호가 없어도 짧으면 자르지 않고 말줄임도 붙이지 않는다', () => {
    const text = '부호 없는 짧은 줄';
    expect(buildEpisodeSummary(text)).toEqual({ preview: text, full: text });
  });

  it('빈 원고는 두 값 모두 빈 문자열이다 (호출부가 줄 자체를 그리지 않게)', () => {
    expect(buildEpisodeSummary('')).toEqual({ preview: '', full: '' });
    expect(buildEpisodeSummary(undefined)).toEqual({ preview: '', full: '' });
    expect(buildEpisodeSummary('   ')).toEqual({ preview: '', full: '' });
  });
});
