// src/utils/koreanParticle.ts
// 한국어 조사를 앞 단어의 받침에 맞춰 고르는 순수 함수 모음.
//
// 화면에 "닉네임이(가) 준비됐어요", "아코(수용)을(를) 선택했어요"처럼
// 양쪽을 다 적어 두는 회피책이 여러 곳에 퍼져 있었고, ADHD 결과 설명문은
// 아예 '과'를 고정으로 붙여 "…한 번 이하)과"라는 틀린 문장을 만들었다.
// 판정 규칙을 여기 하나로 모은다.
//
// ⚠️ 받침 판정은 **마지막 한글 음절**을 기준으로 한다. 검사 선택지 라벨은
// "거의 없음(한 달에 한 번 이하)"처럼 괄호로 끝나는데, 조사는 괄호가 아니라
// 그 앞 음절('하')이 결정한다. 그래서 뒤에서부터 한글을 찾아 올라간다.
// 한글이 하나도 없으면(영문·숫자 전용) 받침 없음으로 보고 기본형을 쓴다.
//
// 괄호가 장식일 때(요정 표기 "아코(수용)")는 호출부가 소리 내어 읽는 쪽,
// 즉 요정명만 넘긴다 — 화면에는 "아코(수용)를"로 나간다. 무엇을 기준으로
// 판정할지는 문장을 읽는 방식이 정하므로 호출부의 몫이다.

const HANGUL_SYLLABLE_START = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;
/** 한글 음절 하나에 배정된 종성 개수 — (코드 - 시작) % 28 === 0 이면 받침 없음 */
const JONGSUNG_COUNT = 28;

/** 마지막 한글 음절에 받침이 있으면 true. 한글이 없으면 false(기본형). */
export function hasFinalConsonant(word: string): boolean {
  for (let i = word.length - 1; i >= 0; i -= 1) {
    const code = word.charCodeAt(i);
    if (code >= HANGUL_SYLLABLE_START && code <= HANGUL_SYLLABLE_END) {
      return (code - HANGUL_SYLLABLE_START) % JONGSUNG_COUNT !== 0;
    }
  }
  return false;
}

/** 주격 조사 — "여명이", "아코가" */
export function subjectParticle(word: string): string {
  return hasFinalConsonant(word) ? '이' : '가';
}

/** 보조사(주제) — "여명은", "아코는" */
export function topicParticle(word: string): string {
  return hasFinalConsonant(word) ? '은' : '는';
}

/** 목적격 조사 — "아코(수용)를", "재평가를" */
export function objectParticle(word: string): string {
  return hasFinalConsonant(word) ? '을' : '를';
}

/** 접속 조사 — "'전혀없음'과", "'…한 번 이하)'와" */
export function conjunctionParticle(word: string): string {
  return hasFinalConsonant(word) ? '과' : '와';
}

/**
 * 호격 조사 — "백설아", "지수야".
 *
 * 시나리오 대사에서 주인공을 부르는 자리에 쓴다. 현재 CSV에는 '백설아'가
 * 0건이지만, 시트가 대사를 고치면 바로 등장할 수 있는 형태다. 받침 있는
 * 원문('백설아')을 받침 없는 닉네임으로 바꾸면 "지수아"가 되므로 미리 넣는다.
 */
export function vocativeParticle(word: string): string {
  return hasFinalConsonant(word) ? '아' : '야';
}
