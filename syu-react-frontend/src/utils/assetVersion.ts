// public/scenario 에셋의 캐시 버스터.
//
// 이 디렉터리는 firebase.json에서 max-age 7일로 서빙되는데, 파일명은 CSV와
// 묶여 있어 내용이 바뀌어도 URL이 그대로다 — 2026-08-18 치비 전환 때 팀
// 브라우저마다 옛 그림이 최대 일주일 남는 문제가 실측됐다. 그래서 캐시는
// 길게 유지하되, 에셋을 일괄 교체할 때 이 버전 문자열을 올려 URL을 바꾼다.
// 2026-08-26: 백설이 6장 + friend 의 happy 스프라이트를 얼굴 이식 합성본으로 교체
// (그전까지 백설이 happy 6장은 default 와 바이트 단위로 같은 파일이라 '기쁨' 씬에서
//  무표정이 나갔고, friend_happy 는 default 와 다른 인물이었다). 이 문자열을 올리지
//  않으면 이미 방문한 유저는 7일 캐시 때문에 옛 그림을 계속 본다.
// 2026-08-27 밤 r14: colleague_happy·hairdresser_talking 2장을 같은 이름으로 교체
// (얼굴 배율 재합성, UAT R3-07). 새로 추가된 환호 의상판 4장은 새 URL이라 이 값과
// 무관하지만, 교체된 2장 때문에 올린다.
// r15: boss_happy를 같은 이름으로 교체(가로 정렬 +11px·배율 재합성, UAT R3-07 추가 지적).
// 2026-09-11 r16: street_day png·webp를 같은 이름으로 교체 — 8/26에 깨진 한글 간판을
// 블러로 가린 판을 버리고, street_night와 같은 골목의 낮 장면을 새로 생성한 판으로.
export const SCENARIO_ASSET_VERSION = '20260911-r16';

/** /scenario/** 이미지 URL에 캐시 버스터를 붙인다. */
export function versionedAsset(url: string): string {
  return `${url}?v=${SCENARIO_ASSET_VERSION}`;
}
