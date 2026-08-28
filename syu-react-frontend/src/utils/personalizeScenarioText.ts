// src/utils/personalizeScenarioText.ts
// 시나리오 원문의 주인공 이름('백설')을 사용자 닉네임으로 바꾸는 순수 함수.
//
// 이 서비스의 시나리오는 "내가 겪는 일"로 읽혀야 한다(이입 컨셉). 그런데
// 콘텐츠 원문은 주인공을 고정 이름 '백설'로 서술한다. 원문을 고칠 수는 없다 —
// CSV의 단일 출처는 구글시트이고, 프로덕션은 거기서 뜬 Firestore 시드본이다.
// 그래서 **표시 시점에** 이름만 갈아 끼운다.
//
// ⚠️ 파싱 결과에 구워 넣지 말 것. 닉네임은 마이페이지에서 언제든 바뀌므로
// 치환 결과를 스토어/파서 캐시에 저장하면 변경이 화면에 반영되지 않는다.
// 화면 쪽 관문은 components/scenario/usePersonalizedText 훅 하나다.
//
// 조사 교정이 필요한 이유: '백설'은 받침(ㄹ)이 있어서 원문이 늘 받침형
// 조사('백설은', '백설이')를 쓴다. 닉네임이 모음으로 끝나면 그대로 두었을 때
// "지수은 팀 회의에서…"가 되어버린다.

import {
  conjunctionParticle,
  objectParticle,
  subjectParticle,
  topicParticle,
  vocativeParticle,
} from './koreanParticle';

/** 콘텐츠 원문이 쓰는 주인공 이름. */
const PROTAGONIST_NAME = '백설';

/**
 * 이름 뒤에 붙었을 때 받침에 맞춰 다시 골라야 하는 조사.
 *
 * 받침형·비받침형을 모두 키로 둔다. 원문은 '백설'이 받침을 가지므로 사실상
 * 받침형만 등장하지만, 시트에서 '백설는'처럼 잘못 적혀 들어와도 화면에는
 * 올바른 조사가 나가도록 양방향으로 받는다.
 */
const PARTICLE_RESOLVERS: Record<string, (word: string) => string> = {
  은: topicParticle,
  는: topicParticle,
  이: subjectParticle,
  가: subjectParticle,
  을: objectParticle,
  를: objectParticle,
  과: conjunctionParticle,
  와: conjunctionParticle,
  // 호격 — 대사에서 주인공을 부르는 자리. 현재 CSV에는 0건이지만 시트가
  // 대사를 고치면 바로 등장할 수 있고, 그때 "지수아"가 나가면 안 된다.
  아: vocativeParticle,
  야: vocativeParticle,
};

/** '백설' + (교정 대상 조사 1글자)?. 조사가 없으면 이름만 잡는다. */
const PROTAGONIST_PATTERN = new RegExp(`${PROTAGONIST_NAME}([은는이가을를과와아야])?`, 'g');

const HANGUL_SYLLABLE = /[가-힣]/;

/**
 * 시나리오 텍스트의 '백설'을 닉네임으로 치환하고 뒤따르는 조사를 교정한다.
 *
 * 규칙:
 * - 교정 대상은 은/는 · 이/가 · 을/를 · 과/와 · 아/야 다섯 쌍. 나머지 조사(의·에게·도·
 *   만·처럼·보다·께·한테 …)와 단독 등장은 이름만 바꾼다.
 * - **조사 뒤에 한글 음절이 이어지면 조사로 보지 않는다.** 원문의
 *   "…보고 싶은 백설이다."가 그런 경우로, 여기서 '이'는 주격 조사가 아니라
 *   서술격 조사('이다')의 일부다. 이 판정이 없으면 "지수가다"가 나온다.
 * - 닉네임이 없거나 공백뿐이면 원문을 그대로 돌려준다(방어). 캐릭터 생성 전
 *   화면이나 스토어 로딩 중에도 문장이 깨지지 않아야 한다.
 */
export function personalizeScenarioText(
  text: string,
  nickname: string | null | undefined
): string {
  if (!text) return text;

  const name = nickname?.trim();
  if (!name) return text;

  return text.replace(PROTAGONIST_PATTERN, (match, particle: string | undefined, offset: number) => {
    if (!particle) return name;

    const nextChar = text[offset + match.length];
    if (nextChar && HANGUL_SYLLABLE.test(nextChar)) return name + particle;

    return name + PARTICLE_RESOLVERS[particle](name);
  });
}
