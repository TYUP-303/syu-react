// src/components/scenario/player/assetUrls.ts
// 에피소드 플레이에 필요한 이미지 URL 해석 + 프리로드.
//
// CSV의 캐릭터 파일명은 **콘텐츠 작성자가 쓴 이름**이고, 화면에 그릴
// 실제 파일명은 **플레이어의 성별·영역(의상)**까지 반영해야 나온다. 그 변환을
// 이 파일 하나에 모아 둔다 (PlayerStage는 결과 URL만 쓴다).
//
// 프리로드가 필요한 이유: 네트워크가 느릴 때 배경/캐릭터가 한 박자 늦게
// 뜨고 인물 수가 1명 → 2명으로 바뀌며 레이아웃이 밀린다. 플레이어 진입
// 시 모든 씬의 에셋을 미리 내려받고, 실패한 목록을 호출부에 돌려준다.
//
// ⚠️ 이 파일이 내는 /scenario/** URL은 **전부 versionedAsset을 통과한다**.
//    그 디렉터리는 firebase.json에서 max-age 7일로 서빙되는데 파일명이 CSV와
//    묶여 있어 내용만 바뀌어도 URL이 그대로다 — 캐시 버스터가 없으면 에셋을
//    갈아 끼운 날 팀 브라우저에 옛 그림이 최대 일주일 남는다(2026-08-18 실측).
//    프리로드 URL과 렌더 URL은 **같은 문자열**이어야 하므로, 버전은 개별
//    호출부가 아니라 여기(경로를 만드는 자리)에서 붙인다.

import type { EpisodeData } from '../../../api/scenarioMockData';
import { STRATEGY_META } from '../../../constants/strategy';
import { versionedAsset } from '../../../utils/assetVersion';

export type CharacterGender = 'male' | 'female';

const CHARACTER_DIR = '/scenario/characters';

/** 파일명에서 성별 토큰으로 쓰는 한 글자. */
function genderToken(gender: CharacterGender): 'm' | 'f' {
  return gender === 'male' ? 'm' : 'f';
}

// ── 주인공(백설) ───────────────────────────────────────────
//
// CSV는 주인공을 항상 여성형(`baeksul_f_*`)으로 적어 두고, 실제 성별은
// 코드가 갈아 끼운다. 예전 구현은 `baeksul_[mf]?_?`를 한 번 치환하는
// 방식이라, 콘텐츠 쪽이 표기를 조금만 달리 써도(대문자 `_F_`,
// 성별 토큰 생략, 에셋이 없는 표정) 조용히 없는 파일을 가리켰다.
// 프로덕션 CSV는 Firestore에서 오므로 로컬 파일만 보고는 알 수 없는
// 표기가 섞일 수 있다 — 그래서 "분해 → 알려진 값으로 고정 → 재조립"
// 순서로 바꿔 어떤 표기가 와도 존재하는 파일로 떨어지게 한다.
const PROTAGONIST_BASE = 'baeksul';
/**
 * 콘텐츠가 쓸 수 있는 주인공 표정 **어휘**. 여기 없는 값은 기본 표정으로 클램프된다.
 *
 * ⚠️ 이 목록은 "에셋이 있다"는 뜻이 아니다. 표정은 그림보다 먼저 등록될 수 있고
 *    (2026-08-26 `worried`), 실제 존재 판정은 아래 BASE_OUTFIT_FILES ·
 *    OUTFIT_FILES가 한다. 그림이 도착하면 그 두 목록에 파일명을 더하는 것만으로
 *    자동으로 켜진다 — 이 어휘를 다시 손댈 일은 없다.
 */
export const PROTAGONIST_EXPRESSIONS = ['default', 'happy', 'sad', 'worried', 'cheer'] as const;
const PROTAGONIST_FALLBACK_EXPRESSION = 'default';

// 2026-08-27 낮~밤 사이에는 여기 `BASE_ONLY_EXPRESSIONS = {'cheer'}` 예외가 있었다 —
// 환호가 기본복 2장뿐이던 동안 의상 규칙을 건너뛰어 "환호하라고 넣은 자리에 무표정
// 정장"이 서지 않게 한 장치다. 그날 밤(UAT R3-04) 정장·데이트 환호 4장이 들어오며
// 예외 대상이 없어져 장치째 걷어냈다. 다시 "기본복에만 있는 표정"이 생기면 그때
// 같은 이름으로 되살리면 된다(checkAssetRefs.mjs도 같은 상수를 읽는다).

// ── 의상 (2026-08-18 채택) ─────────────────────────────────
//
// 백설이는 영역마다 옷을 갈아입는다. "면접 보러 가는 회차와 데이트 회차에
// 같은 티셔츠"라는 지적을 그림으로 푸는 장치이며, CSV는 손대지 않는다
// (프로덕션 CSV는 Firestore에서 오므로 렌더 레벨이 유일하게 안전한 자리다).
//
// 파일명 규칙은 `baeksul_{성별}_{의상}_{표정}.png`이고, **기본복만 의상
// 토큰이 없다**(`baeksul_{성별}_{표정}.png`) — 기존 6장을 개명하지 않기 위한
// 선택이다. 개명은 avatarPresets·CharacterGraphic 등 플레이어 밖 사용처까지
// 번지므로 이번 범위에서 감당할 수 없다.
export type Outfit = 'base' | 'suit' | 'date';

/**
 * 영역 → 의상. 판정은 `isLoverDomain`과 같은 **접두사 기반**이라 CSV의
 * DOMAIN('직장3')과 테마 id('workplace')를 함께 받는다. 영문 쪽은 표기가
 * 흔들려도 걸리도록 짧게 끊는다 — 'job'은 job-prep·jobprep·job_prep을,
 * 'work'는 workplace·work를 모두 덮는다.
 *
 * 목록에 없는 영역(일상·daily 등)은 기본복이다. 새 영역이 생겨도 그림이
 * 깨지지 않고 기본복으로 떨어지는 쪽이 안전하다.
 */
const SUIT_DOMAIN_PREFIXES = ['직장', 'workplace', 'work'] as const;
// 취업준비는 영역만으로 정장을 입히지 않는다 (2026-08-27 UAT R2-18). 120칸 중
// 면접장은 12칸뿐이고 나머지 108칸(내 방·도서관·거실)에서 정장이 어색했다.
// 정장은 **배경이 면접장·회사일 때만** — outfitForScene 참조.
const JOB_PREP_DOMAIN_PREFIXES = ['취업준비', 'job'] as const;
const SUIT_BACKGROUNDS = new Set(['interview_room', 'office', 'meeting_room', 'corridor']);

// ── 연인 ───────────────────────────────────────────────────
//
// 연인은 주인공의 **반대 성별**로 등장하는 것이 콘텐츠 의도다
// (4영역 중 '연인' 시나리오 전용). 그런데 전용 스프라이트에는 성별 축이 없어
// (파일명이 `lover_{표정}`뿐) 주인공 성별을 반영할 수가 없었고, 그래서
// 여성 주인공에게도 여성 연인이 나왔다 (2026-08-12 UAT 지적).
//
// 2026-08-18에 아래 '백설이 재사용'이 그 자리를 가져갔고, 남아 있던 두 장
// (lover_default.png · lover_tired.png, 합계 1.65MB)은 **어느 도메인에서도
// 화면에 닿지 않는 상태**가 되어 2026-08-26에 삭제했다. 그래서 지금
// `lover_*`는 CSV 표기일 뿐이고, 실제로 그려지는 그림은 언제나 백설이다.
//
// 성별이 구분된 연인 스프라이트 네 장 한 벌(`lover_{m,f}_{default,tired}.png`)이
// 도착하면 resolvePartnerFile을 그 이름으로 되돌리면 된다. 그때는 표정 목록도
// 연인 쪽 값(default·tired)으로 다시 나뉜다.
const PARTNER_BASE = 'lover';

// ── 연인 영역의 상대역 = 반대 성별 백설이 (2026-08-18) ─────
//
// 성별이 구분된 연인 에셋을 기다리는 대신, 주인공과 **같은 계열의 백설이**를 성별만
// 반대로 세운다. 근거는 셋이다.
//   ① 에셋 발주 없이 오늘 고칠 수 있다 (baeksul_m_* / baeksul_f_* 6종은 이미 있다).
//   ② 그림체가 주인공과 같아 한 씬 안에서 두 화풍이 섞이지 않는다.
//   ③ "연인 = 주인공의 반대 성별"이라는 콘텐츠 의도가 그림에서 곧바로 읽힌다.
// 같은 에셋을 둘 세우는 셈이라 **한쪽만 좌우 반전**해 서로 마주 보게 한다
// (어느 쪽을 뒤집는지는 아래 '마주봄' 절이 자리로 정한다).
//
// 범위는 **`lover_*` 배역 전체**다 (2026-08-26에 넓혔다). 원래는 연인 영역
// 한정이었고 그 밖에서는 CSV 파일명을 그대로 썼는데, 전용 에셋 두 장을 지운
// 지금 그 길은 404다. 로컬 CSV 480씬 실측에서 `lover_*`는 연인 영역 밖에 한
// 번도 나오지 않지만 프로덕션 CSV는 Firestore에서 오므로, 도메인을 보지 않고
// 같은 치환을 걸어 어디서 들어오든 그림이 뜨게 한다.
//
// 의상을 도메인이 아니라 **데이트 차림으로 고정**하는 것도 같은 이유다. 영역이
// 정하는 의상은 주인공의 것이고(그 씬의 '상황'을 그린다), 상대역의 옷은 그
// 배역이 무엇인지를 그린다 — '연인'이 회사 회의실에 정장으로 서 있으면 동료와
// 구분되지 않는다.
//
// 도메인 표기는 CSV의 DOMAIN 열('연인1' ~ '연인10')이 1차 기준이고, 영문
// 테마 id(relationship)나 배역 이름(lover)으로 넘어오는 호출부도 함께 받는다.
const LOVER_DOMAIN_PREFIXES = ['연인', 'lover', 'relationship'] as const;

/**
 * public/scenario/characters에 실제로 있는 **기본복 6장** (2026-08-26 실측).
 *
 * OUTFIT_FILES와 짝을 이루는 목록이며, 역할은 "표정 어휘 ↔ 실제 그림"의 시차를
 * 흡수하는 것이다. 기본복은 모든 폴백이 마지막에 떨어지는 자리라 여기 없는
 * 파일을 가리키면 그물이 없다 — 그래서 의상과 달리 대체할 곳이 아니라
 * **표정 자체를 기본으로 되돌리는** 판정에 쓴다.
 *
 * 2026-08-26 오후에 기본복 8장(표정 4종 × 성별 2)을 제로베이스로 다시 그려
 * 넣으면서 `worried` 두 줄이 여기 들어왔다. 정장(suit)도 조율 세션이 시트로 판정해
 * 같은 날 합류했다(선명도 지표가 업스케일 아티팩트를 높게 치는 눈금이라 참고값으로 강등).
 */
const BASE_OUTFIT_FILES = new Set([
  'baeksul_f_default.png',
  'baeksul_f_happy.png',
  'baeksul_f_sad.png',
  'baeksul_f_worried.png',
  'baeksul_m_default.png',
  'baeksul_m_happy.png',
  'baeksul_m_sad.png',
  'baeksul_m_worried.png',
  // 환호(2026-08-27 R2-27) — 에필로그 마무리 장면 전용. 기본복 2장뿐이고
  // 의상 변형이 없다(BASE_ONLY_EXPRESSIONS 주석 참조).
  'baeksul_f_cheer.png',
  'baeksul_m_cheer.png',
]);

/**
 * public/scenario/characters에 실제로 있는 **의상 변형 12장** (2026-08-18 실측).
 *
 * 배경의 WebP 목록(WEBP_BACKGROUNDS)과 같은 방식이다 — 조립한 이름이 이 목록에
 * 없으면 기본복으로 떨어뜨린다. 프로덕션 CSV는 Firestore에서 오므로 코드가
 * 모르는 표정('angry' 등)이 언제든 들어올 수 있고, 그때 없는 의상 파일을
 * 가리키면 404 → alt 텍스트만 남는다. "표정은 기본으로 떨어지되 의상은
 * 살린다"가 아니라 **의상까지 통째로 기본복으로** 떨어뜨리는 이유는,
 * 표정 폴백이 이미 default를 만들어 내므로 두 폴백이 겹쳐 봐야 얻는 것이
 * 없고 목록만 두 배로 커지기 때문이다.
 */
const OUTFIT_FILES = new Set([
  'baeksul_f_suit_default.png',
  'baeksul_f_suit_happy.png',
  'baeksul_f_suit_sad.png',
  'baeksul_f_date_default.png',
  'baeksul_f_date_happy.png',
  'baeksul_f_date_sad.png',
  'baeksul_f_date_worried.png',
  'baeksul_f_suit_worried.png',
  'baeksul_m_suit_default.png',
  'baeksul_m_suit_happy.png',
  'baeksul_m_suit_sad.png',
  'baeksul_m_date_default.png',
  'baeksul_m_date_happy.png',
  'baeksul_m_date_sad.png',
  'baeksul_m_date_worried.png',
  // 환호 의상판 (2026-08-27 R3-04) — 에필로그 마무리 장면에서 직장은 정장,
  // 연인은 데이트 차림으로 뛴다(앞 씬과 옷이 같아야 마지막 장면이 튀지 않는다).
  'baeksul_f_suit_cheer.png',
  'baeksul_m_suit_cheer.png',
  'baeksul_f_date_cheer.png',
  'baeksul_m_date_cheer.png',
  'baeksul_m_suit_worried.png',
]);

/** 파일명에서 의상 토큰으로 쓰는 값. 기본복은 토큰이 없다. */
const OUTFIT_TOKENS = ['suit', 'date'] as const;

function startsWithAny(value: string, prefixes: readonly string[]): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && prefixes.some((prefix) => normalized.startsWith(prefix));
}

/** 이 씬이 연인 영역인가. CSV의 DOMAIN('연인3')·테마 id(relationship) 둘 다 받는다. */
export function isLoverDomain(domain?: string): boolean {
  return domain ? startsWithAny(domain, LOVER_DOMAIN_PREFIXES) : false;
}

/** 영역이 정하는 백설이 의상. 목록에 없는 영역은 기본복. 취업준비는 배경을 봐야 하므로 outfitForScene을 쓴다. */
export function outfitForDomain(domain?: string): Outfit {
  if (!domain) return 'base';
  if (isLoverDomain(domain)) return 'date';
  if (startsWithAny(domain, SUIT_DOMAIN_PREFIXES)) return 'suit';
  return 'base';
}

/** `interview_room.png` → `interview_room`. 배경 파일명에서 확장자·공백·대소문자를 걷어낸 키. */
function backgroundKey(background?: string): string {
  return (background ?? '').trim().toLowerCase().replace(/\.(png|jpg|jpeg|webp)$/i, '');
}

/**
 * 씬이 정하는 백설이 의상 — 영역 규칙 위에 **배경** 규칙을 얹는다 (2026-08-27 R2-18).
 * 연인은 데이트 차림, 직장은 정장, 취업준비는 배경이 면접장·회사(SUIT_BACKGROUNDS)일 때만
 * 정장이고 그 밖(내 방·도서관·거실)은 기본복. 나머지 영역은 기본복.
 */
export function outfitForScene(domain?: string, background?: string): Outfit {
  if (domain && startsWithAny(domain, JOB_PREP_DOMAIN_PREFIXES)) {
    return SUIT_BACKGROUNDS.has(backgroundKey(background)) ? 'suit' : 'base';
  }
  return outfitForDomain(domain);
}

/** `baeksul_f_date_sad.png` → `sad`. 확장자·성별·의상 토큰을 걷어낸 표정 이름. */
function expressionOf(fileName: string, base: string): string {
  const withoutExt = fileName.trim().replace(/\.(png|jpg|jpeg|webp)$/i, '');
  const rest = withoutExt.slice(base.length).replace(/^_/, '');
  // 성별 토큰(m/f)이 붙어 있으면 떼어 낸다 — 어느 성별로 적혀 있든
  // 여기서는 표정만 남기고, 성별은 호출부가 넘긴 값으로 다시 붙인다.
  const withoutGender = rest.replace(/^[mf](_|$)/i, '');
  // 의상 토큰도 같은 이유로 떼어 낸다. 콘텐츠가 언젠가 의상까지 적어 오면
  // (`baeksul_f_suit_sad`) 그 표정이 통째로 죽어 default로 떨어지기 때문이다.
  // 의상은 CSV가 아니라 **영역**이 정하므로 여기서는 버리는 것이 맞다.
  return withoutGender.replace(new RegExp(`^(${OUTFIT_TOKENS.join('|')})(_|$)`, 'i'), '');
}

/** 알려진 표정 목록 안으로 고정한다. 목록에 없으면 기본 표정. */
function clampExpression(expression: string, known: readonly string[], fallback: string): string {
  const lower = expression.toLowerCase();
  return known.includes(lower) ? lower : fallback;
}

function isProtagonist(fileName: string): boolean {
  return fileName.trim().toLowerCase().startsWith(PROTAGONIST_BASE);
}

function isPartner(fileName: string): boolean {
  return fileName.trim().toLowerCase().startsWith(PARTNER_BASE);
}

/**
 * 백설이 **파일명** 조립 — 경로도 캐시 버전도 붙이지 않은 이름만 낸다.
 * 기본복만 의상 토큰이 없다는 규칙이 여기 한 곳에 있다.
 *
 * **결과는 언제나 실재하는 파일이다.** 두 겹의 폴백이 그것을 보장한다.
 *   ① 모르는 표정 → 기본 표정 (콘텐츠가 'angry'를 보내와도 404가 아니다)
 *   ② 어휘에는 있으나 **그림이 아직 없는** 표정 → 기본 표정
 *   ③ 그 표정의 의상 변형이 없으면 → **같은 의상의 기본 표정**, 그것도 없으면 기본복
 * ②가 2026-08-26에 생겼다. `worried`를 어휘에 먼저 등록하고 스프라이트 8장은
 * 뒤따라 들어오는 중이라, 등록과 도착 사이의 구간을 이 그물이 덮는다. 그림이
 * 도착하면 BASE_OUTFIT_FILES · OUTFIT_FILES에 파일명을 더하는 것만으로 켜진다.
 */
export function protagonistSpriteFile(
  gender: CharacterGender,
  outfit: Outfit,
  expression: string
): string {
  const token = genderToken(gender);
  const clamped = clampExpression(
    expression,
    PROTAGONIST_EXPRESSIONS,
    PROTAGONIST_FALLBACK_EXPRESSION
  );
  // 어휘에는 등록됐지만 그림이 아직 오지 않은 표정(2026-08-26 `worried`)이 여기서
  // 걸린다. 기본복은 모든 폴백의 **최후 착지점**이라 반드시 실재해야 하므로,
  // 표정을 확정하기 전에 기본복 목록으로 존재를 한 번 더 확인한다.
  const safe = BASE_OUTFIT_FILES.has(`${PROTAGONIST_BASE}_${token}_${clamped}.png`)
    ? clamped
    : PROTAGONIST_FALLBACK_EXPRESSION;
  const base = `${PROTAGONIST_BASE}_${token}_${safe}.png`;
  if (outfit === 'base') return base;
  const dressed = `${PROTAGONIST_BASE}_${token}_${outfit}_${safe}.png`;
  if (OUTFIT_FILES.has(dressed)) return dressed;
  // 의상이 그 표정을 아직 못 그렸을 때는 **의상을 지키고 표정을 양보한다**
  // (2026-08-26). 재생성 배치가 기본복·데이트만 통과시켜 정장에 worried가 없는데,
  // 여기서 기본복으로 곧장 떨어지면 면접 씬의 주인공이 흰 티셔츠로 서 버린다.
  // 의상 시스템이 애초에 그 어긋남('면접 회차에 같은 티셔츠')을 없애려고 생긴
  // 장치이므로, 표정 하나보다 옷이 맞는 쪽을 택한다.
  const dressedFallback =
    `${PROTAGONIST_BASE}_${token}_${outfit}_${PROTAGONIST_FALLBACK_EXPRESSION}.png`;
  if (OUTFIT_FILES.has(dressedFallback)) return dressedFallback;
  return base;
}

/**
 * 주인공 스프라이트 경로. **표기가 어떻든 결과는 항상 유저가 고른 성별**이다
 * — 씬마다 성별이 뒤집히던 UAT 버그(2026-08-12)의 방지선. 의상은 영역이 정한다.
 *
 * `expressionOverride`는 CSV의 표정을 **호출부가 갈아 끼우는** 자리다
 * (2026-08-26 회의). 전략 적용 이후 단계에서 무대가 'default'를 넘겨 주인공을
 * 회복 표정으로 세운다 — CSV의 씬 표정은 '상황'의 것이라 대개 sad인데, 그
 * 장면은 "대처법을 써서 나아졌다"를 그리는 자리이기 때문이다. CSV를 고치는
 * 길은 없다: 프로덕션 원문은 Firestore에서 오므로 렌더 레벨이 유일하게 안전한
 * 자리이고, 이는 의상 치환이 여기 있는 것과 같은 이유다.
 *
 * 넘긴 값도 알려진 표정 목록으로 한 번 더 조인다 — 이 인자 때문에 없는 파일이
 * 생기지는 않는다.
 */
export function resolveProtagonistFile(
  charName: string,
  gender: CharacterGender,
  domain?: string,
  expressionOverride?: string,
  background?: string
): string {
  const expression = clampExpression(
    expressionOverride ?? expressionOf(charName, PROTAGONIST_BASE),
    PROTAGONIST_EXPRESSIONS,
    PROTAGONIST_FALLBACK_EXPRESSION
  );
  return versionedAsset(
    `${CHARACTER_DIR}/${protagonistSpriteFile(gender, outfitForScene(domain, background), expression)}`
  );
}

/** 연인은 주인공의 반대 성별로 등장한다 (콘텐츠 의도). */
export function partnerGenderOf(protagonistGender: CharacterGender): CharacterGender {
  return protagonistGender === 'male' ? 'female' : 'male';
}

/**
 * 연인 스프라이트 경로 — **주인공의 반대 성별 백설이**를 데이트 차림으로
 * 재사용한다. 표정은 원문(`lover_tired`)의 것을 그대로 살리되, 백설이에게 없는
 * 표정이면 기본 표정으로 떨어진다 (`tired`는 백설이 에셋에 없으므로 default).
 * 의상이 주인공과 같은 데이트 차림인 이유는 위 절에 적어 두었다 — 한 씬에 둘만
 * 서는데 한쪽만 사복이면 "같은 자리에 있는 두 사람"으로 읽히지 않는다.
 *
 * 도메인을 받지 않는다. 전용 lover 에셋을 지운 뒤로 `lover_*`가 갈 수 있는
 * 길이 이 하나뿐이라, 인자로 받아 봐야 분기가 생기지 않는다.
 */
export function resolvePartnerFile(charName: string, protagonistGender: CharacterGender): string {
  const expression = clampExpression(
    expressionOf(charName, PARTNER_BASE),
    PROTAGONIST_EXPRESSIONS,
    PROTAGONIST_FALLBACK_EXPRESSION
  );
  return versionedAsset(
    `${CHARACTER_DIR}/${protagonistSpriteFile(partnerGenderOf(protagonistGender), 'date', expression)}`
  );
}

// ── 마주봄(facing) ──────────────────────────────────────────
//
// "정면이긴 한데, 그래도 몸이랑 다리가 향한 방향이 있잖아. 이게 서로 마주보게
// 처리되어야 해" (2026-08-18 사용자 지시).
//
// 그래서 먼저 **에셋이 원래 어느 쪽을 향해 서 있는지**를 재고, 그 다음에
// 자리(왼쪽/오른쪽)를 보고 뒤집을지 정한다. 순서가 반대면 안 된다 — 오른쪽을
// 보고 있는 그림을 오른쪽 자리에 두고 뒤집으면 마주보지만, 정면을 보고 있는
// 그림은 뒤집어도 여전히 정면이라 뒤집는 의미가 전혀 다르다.
export type Facing = 'front' | 'left' | 'right';

/**
 * **정면이 아닌** 에셋만 적는 표. 지금 비어 있는 것 자체가 실측 결과다.
 *
 * 2026-08-18 실측 (PIL 알파 분석 + 발 영역 크롭 육안 판정):
 * 백설이 18장(기본복 6 · suit 6 · date 6)과 조연 11장 모두 **완전 정면**이다.
 *   · 발끝이 모두 화면 앞을 향하고 좌우로 살짝 벌어진 V자다 — 어느 쪽으로도
 *     걸어 나가는 자세가 아니다.
 *   · bbox 중심선 기준 좌/우 알파 질량 차이가 여성 −0.01~+0.01, 남성
 *     +0.03~+0.10으로 작고, 남성 쪽 편차도 머리카락이 왼쪽으로 흐르며
 *     bbox를 넓힌 결과지 몸의 방향이 아니다(발 중심 − 몸통 중심 = +0.008~+0.04로
 *     성별·의상을 가리지 않고 같은 부호).
 *   · 어깨선·눈 위치가 좌우 대칭이다.
 *
 * 즉 **뒤집어도 향하는 방향이 바뀌지 않는다.** 지시("몸이랑 다리가 향한 방향이
 * 서로 마주보게")를 그림대로 지키려면 결국 3/4 측면 에셋이 필요하고, 그때
 * 여기에 `파일명 → 'left' | 'right'`만 적으면 아래 shouldMirror가 자리에 맞춰
 * 자동으로 뒤집는다. 그 전까지 렌더가 할 수 있는 최선은 아래 ③이다.
 */
const NON_FRONTAL_ASSETS: Readonly<Record<string, Facing>> = {};

/** 파일명(쿼리·경로 제외)만 꺼낸다. 버전 쿼리가 붙은 URL도 받는다. */
function fileNameOf(url: string): string {
  return url.split('?')[0].split('/').pop() ?? '';
}

/** 배역 계열 — `baeksul_m_date_sad.png` → `baeksul`. 같은 그림인지 판정에 쓴다. */
function assetFamilyOf(url: string): string {
  return fileNameOf(url).split('_')[0].replace(/\.(png|jpg|jpeg|webp)$/i, '');
}

/** 이 에셋이 원래 향한 방향. 표에 없으면 정면이다. */
export function facingOf(url: string): Facing {
  return NON_FRONTAL_ASSETS[fileNameOf(url)] ?? 'front';
}

/** 한 배역을 무대에 세우는 데 필요한 것 — 어떤 그림을, 원래 어느 쪽을 보게. */
export interface SpriteAppearance {
  src: string;
  /** 에셋이 **원래** 향한 방향. 반전 여부는 자리를 봐야 정해지므로 여기 없다. */
  facing: Facing;
}

/**
 * CSV의 캐릭터 파일명을 유저 성별·영역에 맞게 해석한다.
 *
 * - 주인공(백설)은 표기가 어떻든 유저가 고른 성별로 고정하고, 의상은 영역이 정한다.
 * - **상대역(`lover_*`)**은 도메인과 무관하게 반대 성별 백설이를 데이트 차림으로
 *   재사용한다 (전용 에셋 삭제, 2026-08-26).
 * - 그 밖의 조연(상사·동료·면접관 등)은 성별이 배역에 붙어 있으므로 이름 그대로.
 *
 * `expressionOverride`는 **주인공에게만** 걸린다 (2026-08-26 회의). 조연까지
 * 번지면 동료·상사의 표정이 통째로 눌려 씬이 무표정해지고, 연인 영역의 상대역도
 * 주인공이 회복했다는 이유로 표정이 바뀔 까닭이 없다. 넘기지 않으면 지금까지의
 * 동작 그대로이므로 기존 호출부(resolveSceneCast·프리로드)는 손대지 않는다.
 */
export function resolveSprite(
  charName: string,
  gender: CharacterGender,
  domain?: string,
  expressionOverride?: string,
  background?: string
): SpriteAppearance {
  const trimmed = charName.trim();
  const withFacing = (src: string): SpriteAppearance => ({ src, facing: facingOf(src) });

  if (isProtagonist(trimmed)) {
    return withFacing(resolveProtagonistFile(trimmed, gender, domain, expressionOverride, background));
  }
  if (isPartner(trimmed)) {
    return withFacing(resolvePartnerFile(trimmed, gender));
  }

  const withExt = /\.(png|jpg|jpeg|webp)$/i.test(trimmed) ? trimmed : `${trimmed}.png`;
  return withFacing(versionedAsset(`${CHARACTER_DIR}/${withExt}`));
}

/** 경로만 필요한 호출부(프리로드 등)를 위한 얇은 껍데기. */
export function resolveCharacterFile(
  charName: string,
  gender: CharacterGender,
  domain?: string
): string {
  return resolveSprite(charName, gender, domain).src;
}

/** 무대에 실제로 선 배역 하나 — 슬롯·그림·반전까지 확정된 상태. */
export interface StagedSprite extends SpriteAppearance {
  /** CSV의 CHAR{n}_1~3 슬롯 번호. 빈 슬롯은 목록에 없다. */
  slot: number;
  /** CSV 원문의 배역 이름. 디버깅용. */
  charName: string;
  /** 좌우 반전(-scale-x-100)해서 세우는가. */
  mirrored: boolean;
  /**
   * 이 배역이 **누구인가** — 표정·의상·성별 변형을 걷어낸 인물 식별자이며
   * 무대의 React key다 (2026-08-27 R2-04).
   *
   * 예전 key는 `${slot}-${charName}`이었다. 그 값은 표정이 바뀌기만 해도
   * 달라지므로 같은 인물이 이어지는 씬 전환에서 <img>가 통째로 언마운트 →
   * 마운트됐다. scenario_visual.csv 480씬 실측으로, 같은 인물이 이어지는
   * 377건 중 **258건(68.4%)이 그렇게 리마운트**되고 그중 **172건은 화면상
   * 자리까지 그대로**다 — 즉 "가만히 서 있어야 할 인물"이 화면에서 지워졌다
   * 다시 그려진다. 새로 만들어진 <img>는 커밋 시점에 그림이 하나도 붙어 있지
   * 않은 상태(naturalWidth 0)라, 그 순간 그림이 메모리 캐시에 없으면 그
   * 프레임이 빈다. 이것이 "클릭하는 순간 캐릭터가 사라졌다 나타난다"의 정체다.
   *
   * 인물 단위로 key를 잡으면 표정·의상·슬롯이 바뀌어도 같은 DOM 노드가
   * 살아남고, 그때는 src만 갈린다. <img>는 새 그림이 완전히 준비될 때까지
   * **옛 그림을 계속 그리도록** 명세가 정해 두었으므로(current request /
   * pending request), 공백 프레임이 구조적으로 생길 수 없다.
   *
   * 값은 파일명의 첫 마디다 — `baeksul_f_worried.png` → `baeksul`,
   * `lover_tired.png` → `lover`. 지금 CSV의 15개 파일명이 7명으로 접히고,
   * 한 씬 안에서 겹치는 경우는 0건이다(실측). 그럼에도 겹치면 아래에서
   * 슬롯 번호를 붙여 갈라 놓는다 — key 중복은 React가 조용히 한쪽을 버린다.
   */
  identity: string;
}

/**
 * 파일명에서 인물 식별자를 뽑는다. 확장자와 첫 밑줄 뒤(성별·의상·표정 토큰)를
 * 버린 나머지다. **CSV 원문 이름**을 받는 것이 중요하다 — 해석된 파일명은
 * 플레이어의 성별·영역에 따라 `baeksul_m_suit_sad.png`처럼 달라지므로,
 * 같은 인물인데 상황에 따라 식별자가 갈릴 수 있다.
 */
export function castIdentityOf(charName: string): string {
  return charName.trim().toLowerCase().replace(/\.[a-z0-9]+$/i, '').split('_')[0];
}

/**
 * 이 자리에 선 인물이 **향해야 하는** 방향. 왼쪽 인물은 오른쪽을, 오른쪽
 * 인물은 왼쪽을 본다. 가운데(1인 씬, 또는 3인 씬의 가운데)는 정면이다.
 */
function facingTarget(index: number, count: number): Facing {
  const center = (count - 1) / 2;
  if (index < center) return 'right';
  if (index > center) return 'left';
  return 'front';
}

/**
 * 이 배역을 뒤집는가. **에셋의 고유 방향**과 **자리**를 함께 본다.
 *
 * ① 1인 씬은 뒤집지 않는다. 마주 볼 상대가 없다.
 * ② 방향이 있는 에셋은 자리의 목표 방향과 어긋날 때만 뒤집는다.
 *    (지금 표에 등록된 에셋은 없다 — NON_FRONTAL_ASSETS 주석의 실측 참조.)
 * ③ 정면 에셋은 뒤집어도 향하는 방향이 그대로다. 그래서 "방향 교정"으로는
 *    뒤집지 않고, **같은 계열(백설이) 그림이 둘 이상 설 때만** 오른쪽 인물을
 *    뒤집는다. 연인 영역이 정확히 이 경우다.
 *
 *    솔직히 적어 두면, 이 반전이 만드는 것은 마주봄 자체가 아니라 **좌우
 *    비대칭**이다. 같은 화풍·같은 캐릭터 계열이 둘 서면 머리카락 흐름과 손
 *    위치가 같은 방향으로 흘러 "따로 찍은 사진 두 장"처럼 보이는데, 한쪽을
 *    뒤집으면 그 흐름이 갈라지며 한 쌍으로 읽힌다. 정면 에셋으로 렌더가 할 수
 *    있는 것은 여기까지이고, 진짜 마주봄은 측면 에셋이 와야 한다
 *    (NON_FRONTAL_ASSETS 주석).
 *
 *    조연(상사·동료·면접관·점원)에는 걸지 않는다. 주인공과 화풍 계열이 달라
 *    나란히 서도 "따로 찍은 두 장"으로 보이지 않고, 뒤집으면 방향은 그대로인
 *    채 가르마·소품 위치만 낯설어져 잃기만 한다. 보수적으로 둔다.
 */
function shouldMirror(
  sprite: SpriteAppearance,
  index: number,
  cast: readonly SpriteAppearance[]
): boolean {
  if (cast.length < 2) return false;

  const target = facingTarget(index, cast.length);
  if (target === 'front') return false;

  if (sprite.facing !== 'front') return sprite.facing !== target;

  if (target !== 'left') return false;
  const family = assetFamilyOf(sprite.src);
  return cast.some((other, i) => i !== index && assetFamilyOf(other.src) === family);
}

/**
 * 한 씬에 선 배역들의 반전 여부를 한꺼번에 정한다 — **자리가 정하므로 배역
 * 하나만 보고는 알 수 없다**는 것이 이 함수가 배열을 받는 이유다.
 * 순서는 화면 왼쪽 → 오른쪽(그려지는 순서)이다.
 */
export function mirrorPlan(cast: readonly SpriteAppearance[]): boolean[] {
  return cast.map((sprite, index) => shouldMirror(sprite, index, cast));
}

/**
 * 한 씬의 배역을 **한꺼번에** 해석한다. 마주봄은 옆에 누가 서 있는지를 알아야
 * 정할 수 있으므로, 배역을 한 명씩 따로 푸는 API로는 표현할 수 없다.
 *
 * 빈 슬롯은 결과에서 빠지되 원래 슬롯 번호는 남는다 — 화면상의 좌우는 결국
 * "그려진 순서"가 정하지만(빈 슬롯은 DOM에 없다), 디버깅에는 원본 슬롯이
 * 필요하다. 무대의 React key는 슬롯이 아니라 `identity`다(그 필드의 주석).
 */
export function resolveSceneCast(
  chars: readonly (string | undefined)[],
  gender: CharacterGender,
  domain?: string,
  background?: string
): StagedSprite[] {
  const staged = chars
    .map((charName, slot) => ({ charName: (charName ?? '').trim(), slot }))
    .filter((entry) => entry.charName !== '')
    .map((entry) => ({ ...entry, ...resolveSprite(entry.charName, gender, domain, undefined, background) }));

  const mirrored = mirrorPlan(staged);
  // 한 씬 안에서 식별자가 겹치면 슬롯 번호를 붙여 갈라 놓는다. 지금 콘텐츠에는
  // 없지만(실측 0건), 겹친 key는 React가 경고 없이 한쪽을 버려 배역 한 명이
  // 통째로 사라지는 종류의 사고라 값싼 방어를 둔다.
  const seen = new Set<string>();
  return staged.map((entry, index) => {
    const base = castIdentityOf(entry.charName);
    const identity = seen.has(base) ? `${base}#${entry.slot}` : base;
    seen.add(base);
    return { ...entry, mirrored: mirrored[index], identity };
  });
}

// ×2 업스케일 WebP가 준비된 배경 목록. CSV의 bg 값은 .png 그대로 두고
// 렌더 시점에만 바꿔치기한다 — Firestore CSV·시트를 건드리지 않기 위해서다.
// 목록에 없는 새 배경은 PNG 그대로 서빙된다.
const WEBP_BACKGROUNDS = new Set([
  'cafe.png',
  'classroom.png',
  'corridor.png',
  'hair_salon.png',
  'interview_room.png',
  'library.png',
  'living_room.png',
  'meeting_room.png',
  'my_room.png',
  'my_room_m.png',
  'office.png',
  'pub.png',
  'restaurant.png',
  'street_day.png',
  'street_night.png',
]);

// ── 성별 분기 배경 (2026-08-26 채택) ────────────────────────
//
// '내 방'은 480씬 중 293씬 + 엔딩 2챕터에 쓰이는 가장 많이 보이는 그림인데,
// 아이돌 포스터·파스텔 이불·인형이라 남성 주인공에게는 남의 방으로 읽힌다는
// 지적이 있었다. 구도·조명은 그대로 두고 소품만 바꾼 남성용 한 장을 만들어
// **렌더 시점에** 갈아 끼운다 — CSV는 Firestore에서 오므로 콘텐츠 쪽을
// 고치는 길은 안전하지 않다(의상 분기와 같은 이유, 위 Outfit 절 참고).
//
// 이름 규칙은 `{배경}_{성별토큰}.png`이고 **화이트리스트로만 켠다**. 변형을
// 실제로 만든 파일명만 이 목록에 적으므로, 규칙에 맞는 이름을 조립해도
// 목록에 없으면 원본으로 떨어진다 — 변형이 없는 배경에서 조용히 404가 나는
// 길을 아예 막는 쪽이다. 여성·미지정은 언제나 원본이라 기존 화면은 불변이다.
const GENDERED_BACKGROUNDS = new Set(['my_room_m.png']);

/**
 * CSV bg 값 → 성별 변형 파일명. 변형이 없으면 받은 값을 그대로 돌려준다.
 *
 * `gender`가 없을 때도 원본이다. 엔딩처럼 캐릭터가 아직 로드되지 않은 화면이
 * 있어서, "모르면 여성용"이 아니라 "모르면 지금까지 쓰던 그림"이어야 한다.
 */
export function genderedBackgroundFile(bg: string, gender?: CharacterGender): string {
  if (!gender) return bg;
  const variant = bg.replace(/\.png$/, `_${genderToken(gender)}.png`);
  return GENDERED_BACKGROUNDS.has(variant) ? variant : bg;
}

/**
 * CSV bg 값 → 실제 서빙 경로. 성별 변형을 먼저 고르고, 그 파일의 업스케일
 * WebP가 있으면 확장자를 바꾼다.
 *
 * 순서가 중요하다 — WebP를 먼저 붙이면 이름이 `my_room.webp`가 되어 성별
 * 치환의 `.png` 접미사 규칙에 걸리지 않고, 결국 남성 유저도 원본을 본다.
 */
export function backgroundUrl(bg: string, gender?: CharacterGender): string {
  const gendered = genderedBackgroundFile(bg, gender);
  const file = WEBP_BACKGROUNDS.has(gendered) ? gendered.replace(/\.png$/, '.webp') : gendered;
  return versionedAsset(`/scenario/backgrounds/${file}`);
}

/**
 * 요정 그림 경로. STRATEGY_META의 값에 캐시 버스터만 입힌다.
 *
 * 무대(PlayerStage)와 프리로드가 **같은 문자열**을 써야 하므로, 양쪽이 각자
 * `versionedAsset(meta.image)`를 부르는 대신 이 껍데기 하나를 공유한다.
 */
export function fairyUrl(image: string): string {
  return versionedAsset(image);
}

/**
 * 에피소드의 모든 씬 배경·캐릭터 + 요정 3종의 이미지 URL 목록.
 * 도메인까지 넘겨 **화면에 그리는 것과 같은 그림**을 미리 받는다 — 영역이 정하는
 * 의상까지 같아야 프리로드가 헛돌지 않는다.
 * 같은 이유로 캐시 버전도 렌더와 같아야 한다(버전이 다르면 브라우저에게는
 * 다른 URL이라 프리로드가 통째로 헛돈다).
 */
export function collectEpisodeImageUrls(episode: EpisodeData, gender: CharacterGender): string[] {
  const urls = new Set<string>();
  const domain = episode.scenario.domain;
  for (const scene of episode.scenario.scenes) {
    if (scene.bg) urls.add(backgroundUrl(scene.bg, gender));
    for (const staged of resolveSceneCast(scene.chars, gender, domain, scene.bg)) {
      urls.add(staged.src);
    }
  }
  // 전략 적용 이후 주인공은 CSV 표정과 무관하게 회복 표정(default)으로 선다
  // (PlayerStage, 2026-08-26). 대개는 씬 1이 default라 위 루프가 이미 담지만,
  // 네 씬이 전부 sad인 회차에서는 이 한 장만 프리로드 게이트 뒤에 늦게 뜬다.
  // 이미 있으면 Set이 흡수하므로 중복 다운로드는 생기지 않는다.
  urls.add(resolveProtagonistFile(PROTAGONIST_BASE, gender, domain, PROTAGONIST_FALLBACK_EXPRESSION));

  for (const meta of Object.values(STRATEGY_META)) {
    urls.add(fairyUrl(meta.image));
  }
  return [...urls];
}

/**
 * 에필로그 4씬의 배경·배역 이미지 URL 목록.
 *
 * collectEpisodeImageUrls와 나눈 이유는 **요정 3종을 받지 않기 때문**이다.
 * 에필로그에는 요정도 전략도 없는데 저쪽을 그대로 쓰면 쓰지 않을 그림
 * 0.88MB를 매번 더 받는다(요정 에셋 실측). 씬을 도는 방식은 같으므로
 * 도메인·성별 해석은 같은 resolveSceneCast를 통과한다 — 프리로드 URL과
 * 렌더 URL이 **같은 문자열**이어야 한다는 규칙이 여기서도 그대로다.
 */
export function collectEpilogueImageUrls(
  epilogue: { domain: string; scenes: readonly { bg: string; chars: readonly string[] }[] },
  gender: CharacterGender
): string[] {
  const urls = new Set<string>();
  for (const scene of epilogue.scenes) {
    if (scene.bg) urls.add(backgroundUrl(scene.bg));
    for (const staged of resolveSceneCast(scene.chars, gender, epilogue.domain, scene.bg)) {
      urls.add(staged.src);
    }
  }
  return [...urls];
}

/** 프리로드 결과 — 실패한 URL 목록을 남긴다(오프라인 안내의 근거). */
export interface PreloadResult {
  failed: string[];
}

/**
 * 프리로드 안전망. 이 시간 안에 load도 error도 오지 않은 URL은 **실패로 본다**.
 *
 * 왜 필요한가: `new Image()`는 연결이 끊기는 게 아니라 **멈추면** 아무 이벤트도
 * 내지 않는다. 호출부가 프리로드 완료를 기다려 화면을 여는 구조에서는(=지금
 * 구조다) 그 한 장이 플레이어를 영원히 붙잡는다.
 *
 * 왜 20초인가: 한 에피소드의 프리로드 용량 실측이 **중앙값 3.9MB · 최대 7.1MB
 * (URL 5~11개)**다(배경 WebP ≈ 0.7MB, 인물 ≈ 0.7MB, 요정 3종 0.88MB —
 * 2026-08-18 측정). 20초는 중앙값 회차를 1.6Mbps에서도 받아 내는 시간이며,
 * 그보다 느리면 "다시 불러오기 / 그대로 진행하기" 안내로 넘긴다. 예전의 3초는
 * 15Mbps가 나와야 겨우 맞는 값이라 사실상 늘 먼저 끝났고, 그래서 게이트가
 * 열린 뒤에 그림이 도착하는 상태가 기본이 돼 있었다(2026-08-18 실플레이 지적).
 */
export const PRELOAD_TIMEOUT_MS = 20_000;

export interface PreloadOptions {
  /** 안전망 시간(ms). 테스트에서만 줄여 쓴다. */
  timeoutMs?: number;
  /** 한 장이 끝날 때마다 (끝난 장수, 전체 장수). 로딩 표시가 이 값으로 움직인다. */
  onProgress?: (settled: number, total: number) => void;
}

/**
 * 이미지들을 병렬 프리로드한다. 실패해도 reject하지 않고 실패 목록을 담아
 * resolve한다 — 진행을 막지 않으면서 "왜 그림이 비어 있는지"를 호출부가
 * 안내할 수 있어야 하기 때문이다 (오프라인 무경고 진행, 2026-08-12 UAT).
 *
 * 성공·실패·시간초과 **어느 쪽으로 끝나든 한 장은 한 번만** 집계한다. 호출부의
 * 로딩 표시가 이 집계를 그대로 그리므로, 두 번 세면 진행률이 100%를 넘는다.
 */
export function preloadImages(urls: string[], options: PreloadOptions = {}): Promise<PreloadResult> {
  const { timeoutMs = PRELOAD_TIMEOUT_MS, onProgress } = options;
  const total = urls.length;
  let settled = 0;

  // 0장이어도 로딩 표시가 총량을 알아야 한다 — 안 그러면 "0/0"에서 멈춘 것처럼 보인다.
  onProgress?.(0, total);

  return Promise.all(
    urls.map(
      (url) =>
        new Promise<string | null>((resolve) => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          let done = false;
          const finish = (failedUrl: string | null) => {
            if (done) return;
            done = true;
            if (timer !== undefined) clearTimeout(timer);
            settled += 1;
            onProgress?.(settled, total);
            resolve(failedUrl);
          };

          const img = new Image();
          img.onload = () => finish(null);
          img.onerror = () => finish(url);
          timer = setTimeout(() => finish(url), timeoutMs);
          img.src = url;
        })
    )
  ).then((results) => ({ failed: results.filter((url): url is string => url !== null) }));
}
