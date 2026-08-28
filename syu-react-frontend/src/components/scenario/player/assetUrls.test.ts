// src/components/scenario/player/assetUrls.test.ts
// 시나리오 스프라이트 경로 해석 계약.
//
// ── ① 성별 일관성 (2026-08-12 UAT 버그 4) ────────────────────────────
// UAT 지적은 두 갈래였다.
//   · 여성 주인공인데 연인도 여성으로 나온다
//   · 남성 주인공으로 해도 "중간에 갑자기 여자가 튀어나온다"
// 뒤쪽의 원인은 CSV가 아니다 — 콘텐츠는 주인공을 항상 `baeksul_f_*`로 적어 두고
// 코드가 성별을 갈아 끼우는 구조이며, 씬마다 표기가 흔들리지도 않는다.
// 다만 예전 치환은 정규식 한 번이라 표기가 조금만 달라지면 조용히 없는
// 파일을 가리켰고, 프로덕션 CSV는 Firestore에서 오므로 그 표기를 보장할 수 없다.
// 그래서 "어떤 표기가 와도 유저 성별로 **존재하는** 파일이 나온다"를 못 박는다.
//
// ── ② 의상 (2026-08-18 채택) ─────────────────────────────────────────
// 백설이가 영역마다 옷을 갈아입는다. CSV는 손대지 않고 **영역 → 의상** 매핑을
// 렌더 레벨에서 건다. 파일이 없는 조합은 기본복으로 떨어져야 한다(404 방지).
//
// ── ③ 마주봄 (2026-08-18 사용자 지시) ────────────────────────────────
// "몸이랑 다리가 향한 방향이 서로 마주보게 처리되어야 해."
// 반전 여부는 **에셋의 고유 방향 + 자리**로 정해지므로 배역 하나만 보고는
// 알 수 없다 — 그래서 씬 단위 API(resolveSceneCast)가 그 판단을 소유한다.
//
// ── ④ 캐시 버전 ─────────────────────────────────────────────────────
// /scenario/**는 max-age 7일로 서빙되므로 URL에 버전 쿼리가 붙어야 하고,
// **프리로드와 렌더가 같은 문자열**이어야 프리로드가 헛돌지 않는다.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  PROTAGONIST_EXPRESSIONS,
  backgroundUrl,
  collectEpisodeImageUrls,
  facingOf,
  fairyUrl,
  genderedBackgroundFile,
  isLoverDomain,
  mirrorPlan,
  outfitForDomain,
  outfitForScene,
  partnerGenderOf,
  preloadImages,
  protagonistSpriteFile,
  resolveCharacterFile,
  resolvePartnerFile,
  resolveProtagonistFile,
  resolveSceneCast,
  resolveSprite,
} from './assetUrls';
import { parseAndMergeScenarioCsv } from '../../../utils/scenarioCsvParser';
import { STRATEGY_META } from '../../../constants/strategy';
import { versionedAsset } from '../../../utils/assetVersion';
import type { EpisodeData } from '../../../api/scenarioMockData';
import visualCsv from '../../../assets/data/scenario_visual.csv?raw';
import dialogueCsv from '../../../assets/data/scenario_dialogues.csv?raw';

/** 기대 URL을 만드는 자리. 버전 문자열 자체는 utils/assetVersion이 소유한다. */
const char = (file: string) => versionedAsset(`/scenario/characters/${file}`);
const bg = (file: string) => versionedAsset(`/scenario/backgrounds/${file}`);
/** URL에서 파일명만. 버전 쿼리를 떼고 본다. */
const fileNameOf = (url: string) => url.split('?')[0].split('/').pop()!;

/**
 * public/scenario/characters에 실제로 있는 파일 목록 (2026-08-27 실측 40장).
 * (직전 주석의 "27장"은 8/26 의상 변형이 늘어난 뒤로 이미 어긋난 수치였다.)
 * lover 전용 2장은 렌더 경로에 닿지 않아 2026-08-26에 삭제했다.
 *
 * 이 목록은 디렉터리의 **거울**이다. 그림을 새로 넣으면 여기도 함께 늘려야 하고,
 * 그러지 않으면 CSV가 가리키는 새 파일이 "없는 파일"로 잡혀 전수 검사가 깨진다.
 * 반대로 여기에만 있고 디렉터리에 없는 이름을 적으면 이 검사가 404를 못 막는다.
 */
const EXISTING_CHARACTER_FILES = new Set([
  'baeksul_f_default.png',
  'baeksul_f_happy.png',
  'baeksul_f_sad.png',
  'baeksul_f_worried.png',
  'baeksul_m_default.png',
  'baeksul_m_happy.png',
  'baeksul_m_sad.png',
  'baeksul_m_worried.png',
  // 의상 변형 (2026-08-18 추가 · 2026-08-26 date에 worried 2장 추가)
  // 정장(suit)에 worried가 없는 것은 누락이 아니다 — 2026-08-26 재생성 배치에서
  // 정장 8장이 선명도 게이트를 넘지 못해 옛 그림(표정 3종) 그대로 남았다.
  'baeksul_f_suit_default.png',
  'baeksul_f_suit_happy.png',
  'baeksul_f_suit_sad.png',
  'baeksul_f_date_default.png',
  'baeksul_f_date_happy.png',
  'baeksul_f_date_sad.png',
  'baeksul_f_date_worried.png',
  'baeksul_m_suit_default.png',
  'baeksul_m_suit_happy.png',
  'baeksul_m_suit_sad.png',
  'baeksul_m_date_default.png',
  'baeksul_m_date_happy.png',
  'baeksul_m_date_sad.png',
  'baeksul_m_date_worried.png',
  'boss_default.png',
  'boss_stern.png',
  'cashier_default.png',
  'colleague_default.png',
  'colleague_troubled.png',
  'family_worried.png',
  'friend_default.png',
  'friend_happy.png',
  'interviewer_stern.png',
  'baeksul_f_suit_worried.png',
  'baeksul_m_suit_worried.png',
  // 조연 추천 1~4번 (2026-08-27) — 표정 변형 5장 + 신규 배역 미용사 2장.
  // 표정 5장은 기존 배역의 머리를 통째로 다시 그려 목 이음새에서 합성했고,
  // 알파를 앵커로 고정해 실루엣·규격이 원본과 같습니다.
  'boss_happy.png',
  'colleague_happy.png',
  'family_default.png',
  'interviewer_default.png',
  'interviewer_nodding.png',
  'hairdresser_default.png',
  'hairdresser_talking.png',
  // 환호(2026-08-27 R2-27) — 에필로그 마무리 장면 전용. 기본복 2장뿐이라
  // 정장·데이트 변형이 없고, 그 예외를 아래 'cheer' 블록이 고정한다.
  'baeksul_f_cheer.png',
  'baeksul_m_cheer.png',
  // 환호 의상판 (2026-08-27 R3-04) — 정장·데이트 × 남녀
  'baeksul_f_suit_cheer.png',
  'baeksul_m_suit_cheer.png',
  'baeksul_f_date_cheer.png',
  'baeksul_m_date_cheer.png',
]);

describe('주인공(백설) 스프라이트 — 성별 일관성', () => {
  it('CSV의 여성 표기를 유저 성별로 갈아 끼운다', () => {
    expect(resolveCharacterFile('baeksul_f_default.png', 'male')).toBe(char('baeksul_m_default.png'));
    expect(resolveCharacterFile('baeksul_f_default.png', 'female')).toBe(
      char('baeksul_f_default.png')
    );
  });

  it('표정은 그대로 두고 성별만 바꾼다', () => {
    expect(resolveCharacterFile('baeksul_f_sad.png', 'male')).toBe(char('baeksul_m_sad.png'));
    expect(resolveCharacterFile('baeksul_f_happy.png', 'male')).toBe(char('baeksul_m_happy.png'));
  });

  // 원문에 어떤 성별로 적혀 있든 결과는 유저가 고른 성별이어야 한다.
  // 여기가 뚫리면 "중간에 갑자기 반대 성별이 튀어나오는" 증상이 된다.
  it('이미 남성으로 적힌 표기도 여성 유저에게는 여성으로 나온다', () => {
    expect(resolveCharacterFile('baeksul_m_sad.png', 'female')).toBe(char('baeksul_f_sad.png'));
  });

  it('성별 토큰이 빠진 표기도 유저 성별로 해석한다', () => {
    expect(resolveCharacterFile('baeksul_happy.png', 'male')).toBe(char('baeksul_m_happy.png'));
    expect(resolveCharacterFile('baeksul.png', 'female')).toBe(char('baeksul_f_default.png'));
  });

  it('대문자·확장자 누락·공백 같은 표기 흔들림을 흡수한다', () => {
    expect(resolveCharacterFile('  baeksul_F_SAD  ', 'male')).toBe(char('baeksul_m_sad.png'));
  });

  // 없는 표정을 그대로 조립하면 404가 나고 화면에는 alt 텍스트만 남는다.
  it('에셋이 없는 표정은 기본 표정으로 떨어진다 (깨진 이미지 대신)', () => {
    expect(resolveProtagonistFile('baeksul_f_angry.png', 'male')).toBe(char('baeksul_m_default.png'));
  });
});

// ── 표정 덮어쓰기 (2026-08-26 회의) ────────────────────────────────────
//
// 무대는 전략 적용 이후 단계에서 주인공을 회복 표정(default)으로 세운다. CSV의
// 씬 표정은 **상황**의 것이라 대개 sad인데, 그 장면은 "대처법을 써서 나아졌다"를
// 그리는 자리이기 때문이다. CSV는 손대지 않으므로 치환은 해석 단계에서 일어난다.
//
// 이 절이 고정하는 것은 **범위**다. 덮어쓰기가 조연에까지 번지면 동료·상사의
// 표정이 통째로 default로 눌려 씬이 무표정해진다.
describe('표정 덮어쓰기 — 주인공에게만 걸린다', () => {
  it('주인공은 CSV 표정을 무시하고 넘겨받은 표정으로 선다', () => {
    expect(resolveSprite('baeksul_f_sad.png', 'female', undefined, 'default').src).toBe(
      char('baeksul_f_default.png')
    );
    // 성별·의상 규칙은 그대로 통과한다 — 바뀌는 것은 표정 토큰 하나뿐이다.
    expect(resolveSprite('baeksul_f_sad.png', 'male', '연인1', 'default').src).toBe(
      char('baeksul_m_date_default.png')
    );
  });

  it('조연 표정은 덮어쓰지 않는다', () => {
    expect(resolveSprite('colleague_sad.png', 'female', '직장1', 'default').src).toBe(
      char('colleague_sad.png')
    );
    // 연인 영역 밖의 lover_*도 상대역이라 덮어쓰기를 타지 않는다 — 표정은
    // 백설이 목록으로 클램프될 뿐(tired → default) 인자 때문에 바뀌지 않는다.
    expect(resolveSprite('lover_tired.png', 'female', '일상1', 'happy').src).toBe(
      resolveSprite('lover_tired.png', 'female', '일상1').src
    );
  });

  // 연인 영역의 상대역은 반대 성별 백설이로 재사용되지만, 그것은 **조연**이다.
  // 주인공이 회복했다고 상대역까지 표정이 바뀔 이유는 없다.
  it('연인 영역의 상대역도 덮어쓰지 않는다', () => {
    expect(resolveSprite('lover_default.png', 'female', '연인3', 'default').src).toBe(
      resolveSprite('lover_default.png', 'female', '연인3').src
    );
  });

  it('넘기지 않으면 지금까지의 동작 그대로다', () => {
    expect(resolveSprite('baeksul_f_sad.png', 'female').src).toBe(char('baeksul_f_sad.png'));
  });
});

// ── 의상: 영역이 옷을 정한다 (2026-08-18) ─────────────────────────────
describe('백설이 의상 — 영역 매핑', () => {
  it('직장은 정장, 연인은 데이트 차림, 그 외는 기본복이다 — 취업준비는 영역만으로는 기본복(R2-18)', () => {
    expect(outfitForDomain('직장1')).toBe('suit');
    expect(outfitForDomain('직장10')).toBe('suit');
    expect(outfitForDomain('취업준비3')).toBe('base');
    expect(outfitForDomain('연인5')).toBe('date');
    expect(outfitForDomain('일상2')).toBe('base');
    expect(outfitForDomain(undefined)).toBe('base');
    expect(outfitForDomain('')).toBe('base');
  });

  // 도메인은 CSV의 DOMAIN 열로도, 테마 id로도 들어온다 (isLoverDomain과 같은 관례).
  it('영문 테마 id 표기 흔들림도 같이 받는다', () => {
    expect(outfitForDomain('workplace')).toBe('suit');
    expect(outfitForDomain('job-prep')).toBe('base');
    expect(outfitForDomain('jobprep')).toBe('base');
    expect(outfitForDomain('relationship')).toBe('date');
    expect(outfitForDomain('daily')).toBe('base');
  });

  it('영역에 맞는 의상 파일로 떨어진다', () => {
    expect(resolveCharacterFile('baeksul_f_sad.png', 'female', '직장1')).toBe(
      char('baeksul_f_suit_sad.png')
    );
    // 취업준비는 배경 없이 영역만 알면 기본복이다 (R2-18) — 정장은 면접장 배경에서만.
    expect(resolveCharacterFile('baeksul_f_default.png', 'male', '취업준비2')).toBe(
      char('baeksul_m_default.png')
    );
    expect(resolveCharacterFile('baeksul_f_happy.png', 'female', '연인3')).toBe(
      char('baeksul_f_date_happy.png')
    );
    expect(resolveCharacterFile('baeksul_f_sad.png', 'male', '일상4')).toBe(
      char('baeksul_m_sad.png')
    );
  });

  // 조립기의 계약은 "무엇이 들어와도 **실재하는** 파일이 나온다"이다.
  // 모르는 표정은 기본 표정으로, 어휘에는 있으나 그림이 아직 없는 표정도 기본
  // 표정으로, 그 표정의 의상 변형이 없으면 기본복으로 떨어진다.
  //
  // 목록에 'worried'가 섞여 있는 것이 요점이다 — 2026-08-26에 어휘로 **먼저**
  // 등록하고 스프라이트 8장은 뒤따라 들어오는 중이라, 등록과 도착 사이 구간에서
  // 이 계약이 깨지지 않는지를 그 값으로 지킨다.
  it('어떤 표정이 와도 조립 결과가 실재 파일이다 (404 방지)', () => {
    ['default', 'happy', 'sad', 'worried', 'cheer', 'angry', '', 'suit', '기쁨'].forEach((expression) =>
      (['base', 'suit', 'date'] as const).forEach((outfit) =>
        (['male', 'female'] as const).forEach((gender) => {
          const file = protagonistSpriteFile(gender, outfit, expression);
          expect(EXISTING_CHARACTER_FILES.has(file), `${gender}/${outfit}/${expression} → ${file}`).toBe(
            true
          );
        })
      )
    );
  });

  it('모르는 표정은 기본 표정으로 떨어지되 의상은 유지한다', () => {
    expect(protagonistSpriteFile('female', 'suit', 'angry')).toBe('baeksul_f_suit_default.png');
    expect(protagonistSpriteFile('male', 'date', 'angry')).toBe('baeksul_m_date_default.png');
  });

  // ── worried: 의상마다 도착 시점이 다르다 (2026-08-26) ──────────────
  //
  // 표정 어휘는 그림보다 먼저 등록됐고(같은 날 오전), 오후 재생성 배치에서
  // 기본복·데이트 8장이 도착했다. 정장 8장은 선명도 게이트를 넘지 못해 옛
  // 그림 3종 그대로다. 그래서 같은 'worried' 요청이 **의상에 따라 다른 자리에
  // 착지**하며, 아래 두 테스트가 고정하는 것이 정확히 그 갈림이다.
  // 정장 그림이 도착하면 마지막 두 기대값이 깨지는데, 그게 정상이다.
  it('worried는 표정 어휘에 등록돼 있다 (클램프 대상이 아니다)', () => {
    // 어휘 밖 값('angry')과 달리, worried는 **알 수 없는 표기**로 취급되지 않는다.
    expect(PROTAGONIST_EXPRESSIONS).toContain('worried');
  });

  it('worried는 세 의상 전부에 그림이 있다 (2026-08-26 정장 합류)', () => {
    // 그림이 도착한 자리 — 기본복·데이트
    expect(protagonistSpriteFile('female', 'base', 'worried')).toBe('baeksul_f_worried.png');
    expect(protagonistSpriteFile('male', 'base', 'worried')).toBe('baeksul_m_worried.png');
    expect(protagonistSpriteFile('female', 'date', 'worried')).toBe('baeksul_f_date_worried.png');
    expect(resolveCharacterFile('baeksul_f_worried.png', 'female', '일상1')).toBe(
      char('baeksul_f_worried.png')
    );
    // 정장도 같은 날 합류 — 의상을 지키고 표정도 지킨다.
    expect(protagonistSpriteFile('male', 'suit', 'worried')).toBe('baeksul_m_suit_worried.png');
    expect(resolveProtagonistFile('baeksul', 'male', '직장2', 'worried')).toBe(
      char('baeksul_m_suit_worried.png')
    );
  });

  // ── cheer: 기본복에만 있는 표정 (2026-08-27 R2-27) ─────────────────
  //
  // 에필로그 마무리 장면(각 영역 마지막 씬, KIND=narration)에 세우는 "야호!"
  // 한 장이다. 그림이 기본복 2장뿐이라 **의상 규칙을 건너뛴다** — worried가
  // 정장을 못 그렸을 때 택한 방향("의상을 지키고 표정을 양보")과 정반대이며,
  // 두 테스트가 고정하는 것이 정확히 그 갈림이다. 표정이 그 장면의 존재 이유일
  // 때는 옷보다 얼굴이 먼저다.
  it('cheer는 표정 어휘에 등록돼 있다', () => {
    expect(PROTAGONIST_EXPRESSIONS).toContain('cheer');
  });

  it('cheer도 의상 규칙을 따른다 — 직장은 정장, 연인은 데이트, 그 외는 기본복 (R3-04)', () => {
    // 2026-08-27 밤(UAT R3-04): 정장·데이트 환호 4장이 들어와 BASE_ONLY 예외가
    // 풀렸다. 에필로그 마무리 장면에서 앞 씬까지 정장이던 백설이가 마지막 한
    // 장에서만 기본복으로 바뀌던 의상 튐이 이걸로 사라진다.
    (['male', 'female'] as const).forEach((gender) => {
      const token = gender === 'male' ? 'm' : 'f';
      expect(protagonistSpriteFile(gender, 'base', 'cheer')).toBe(`baeksul_${token}_cheer.png`);
      expect(protagonistSpriteFile(gender, 'suit', 'cheer')).toBe(
        `baeksul_${token}_suit_cheer.png`
      );
      expect(protagonistSpriteFile(gender, 'date', 'cheer')).toBe(
        `baeksul_${token}_date_cheer.png`
      );
    });
    expect(resolveProtagonistFile('baeksul_f_cheer.png', 'female', '직장1')).toBe(
      char('baeksul_f_suit_cheer.png')
    );
    expect(resolveProtagonistFile('baeksul_f_cheer.png', 'male', '연인7')).toBe(
      char('baeksul_m_date_cheer.png')
    );
    expect(resolveProtagonistFile('baeksul_f_cheer.png', 'female', '일상6')).toBe(
      char('baeksul_f_cheer.png')
    );
    // 취업준비 마무리 장면(내 방)은 배경 규칙대로 기본복
    expect(
      resolveProtagonistFile('baeksul_f_cheer.png', 'female', '취업준비6', undefined, 'my_room.png')
    ).toBe(
      char('baeksul_f_cheer.png')
    );
  });

  it('기본복만 의상 토큰이 없다 (기존 6장을 개명하지 않기 위한 규칙)', () => {
    expect(protagonistSpriteFile('female', 'base', 'sad')).toBe('baeksul_f_sad.png');
    expect(protagonistSpriteFile('female', 'suit', 'sad')).toBe('baeksul_f_suit_sad.png');
  });

  it('12장 전부가 실재 파일 목록 안에 있다 (조립 규칙 ↔ 에셋 대조)', () => {
    (['female', 'male'] as const).forEach((gender) =>
      (['suit', 'date'] as const).forEach((outfit) =>
        ['default', 'happy', 'sad'].forEach((expression) => {
          const file = protagonistSpriteFile(gender, outfit, expression);
          expect(file).toContain(`_${outfit}_`);
          expect(EXISTING_CHARACTER_FILES.has(file), `${file} 누락`).toBe(true);
        })
      )
    );
  });

  // 콘텐츠가 언젠가 의상까지 파일명에 적어 오더라도 표정이 죽으면 안 된다.
  // 의상은 CSV가 아니라 영역이 정하므로, 적혀 온 의상 토큰은 버리고 영역을 따른다.
  it('CSV가 의상까지 적어 와도 표정을 살리고 의상은 영역을 따른다', () => {
    expect(resolveCharacterFile('baeksul_f_suit_sad.png', 'female', '연인1')).toBe(
      char('baeksul_f_date_sad.png')
    );
    expect(resolveCharacterFile('baeksul_f_date_happy.png', 'male', '일상1')).toBe(
      char('baeksul_m_happy.png')
    );
  });
});

describe('연인 스프라이트 — 반대 성별 규칙', () => {
  it('연인의 성별은 주인공의 반대다 (콘텐츠 의도)', () => {
    expect(partnerGenderOf('male')).toBe('female');
    expect(partnerGenderOf('female')).toBe('male');
  });

  // 전용 lover 에셋 2장은 2026-08-26에 삭제했다 — 연인 영역은 아래 '백설이
  // 재사용'이 먼저 잡고, 그 밖의 영역에는 로컬 CSV 실측상 한 건도 없어서
  // 렌더 경로에 닿지 않는 파일이었다. 그래서 `lover_*`의 결과는 언제나
  // 반대 성별 백설이의 데이트 차림이다.
  it('연인은 주인공의 반대 성별 백설이로 그려진다', () => {
    expect(resolvePartnerFile('lover_default.png', 'female')).toBe(
      char('baeksul_m_date_default.png')
    );
    expect(resolvePartnerFile('lover_default.png', 'male')).toBe(
      char('baeksul_f_date_default.png')
    );
  });

  it('주인공 성별이 바뀌면 상대역도 함께 뒤집힌다', () => {
    expect(resolveCharacterFile('lover_tired.png', 'male')).toBe(char('baeksul_f_date_default.png'));
    expect(resolveCharacterFile('lover_tired.png', 'female')).toBe(
      char('baeksul_m_date_default.png')
    );
  });
});

// ── 연인 영역 상대역 = 반대 성별 백설이 (2026-08-18) ─────────────────
//
// 성별이 구분된 연인 에셋을 기다리는 대신 주인공과 같은 백설이 에셋을 성별만 반대로
// 재사용한다. 범위는 연인 영역 한정 — 다른 영역의 같은 배역 값에 번지면 안 된다.
describe('연인 영역 상대역 — 반대 성별 백설이 재사용', () => {
  it('연인 영역 판정은 CSV DOMAIN(연인N)과 테마 id 둘 다 받는다', () => {
    expect(isLoverDomain('연인1')).toBe(true);
    expect(isLoverDomain('연인10')).toBe(true);
    expect(isLoverDomain('relationship')).toBe(true);
    expect(isLoverDomain('lover')).toBe(true);
    expect(isLoverDomain('직장3')).toBe(false);
    expect(isLoverDomain('일상1')).toBe(false);
    expect(isLoverDomain('취업준비2')).toBe(false);
    expect(isLoverDomain(undefined)).toBe(false);
    expect(isLoverDomain('')).toBe(false);
  });

  it('여성 주인공의 상대역은 남성 백설이이고, 둘 다 데이트 차림이다', () => {
    expect(resolveSprite('lover_default.png', 'female', '연인1').src).toBe(
      char('baeksul_m_date_default.png')
    );
    expect(resolveSprite('baeksul_f_default.png', 'female', '연인1').src).toBe(
      char('baeksul_f_date_default.png')
    );
  });

  it('남성 주인공의 상대역은 여성 백설이다', () => {
    expect(resolveSprite('lover_default.png', 'male', '연인4').src).toBe(
      char('baeksul_f_date_default.png')
    );
  });

  // lover_tired는 백설이에게 없는 표정이다. 그대로 조립하면 404가 나고
  // 화면에는 alt 텍스트만 남으므로 기본 표정으로 떨어져야 한다.
  it('백설이에게 없는 표정(tired)은 default로 폴백한다', () => {
    expect(resolvePartnerFile('lover_tired.png', 'female')).toBe(
      char('baeksul_m_date_default.png')
    );
    expect(resolvePartnerFile('lover_tired.png', 'male')).toBe(
      char('baeksul_f_date_default.png')
    );
  });

  // 반대로 백설이에게 있는 표정이면 그대로 살린다 — 콘텐츠가 lover_sad를
  // 써 오면(프로덕션 CSV는 Firestore에서 온다) 표정이 죽지 않아야 한다.
  it('백설이에게 있는 표정은 그대로 살린다', () => {
    expect(resolvePartnerFile('lover_sad.png', 'female')).toBe(char('baeksul_m_date_sad.png'));
    expect(resolvePartnerFile('lover_happy', 'male')).toBe(char('baeksul_f_date_happy.png'));
  });

  // 프로덕션 CSV는 Firestore에서 오므로 연인 영역 밖의 `lover_*`가 언제든
  // 들어올 수 있다(로컬 CSV에는 0건). 전용 에셋을 지운 뒤로는 그때도 같은
  // 치환이 걸려야 한다 — CSV 파일명을 그대로 쓰던 예전 길은 이제 404다.
  it('다른 영역의 lover_*도 같은 치환을 탄다', () => {
    expect(resolveSprite('lover_default.png', 'female', '직장1').src).toBe(
      char('baeksul_m_date_default.png')
    );
    expect(resolveSprite('lover_tired.png', 'female', '일상7').src).toBe(
      char('baeksul_m_date_default.png')
    );
  });

  it('도메인을 넘기지 않아도 상대역은 백설이다', () => {
    expect(resolveSprite('lover_default.png', 'female').src).toBe(
      char('baeksul_m_date_default.png')
    );
  });

  it('연인 영역의 조연은 손대지 않는다', () => {
    expect(resolveSprite('friend_happy.png', 'female', '연인5').src).toBe(char('friend_happy.png'));
  });
});

// ── 마주봄 (2026-08-18) ──────────────────────────────────────────────
//
// "몸이랑 다리가 향한 방향이 서로 마주보게 처리되어야 해"라는 지시를
// **에셋 실측 → 자리 판정** 두 단계로 푼다. 실측 결과 지금 배역은 전부 정면이라
// 뒤집어도 향하는 방향이 바뀌지 않는다 — 반전이 만드는 것은 좌우 비대칭뿐이고,
// 진짜 마주봄은 측면 에셋이 와야 한다. 그래서 반전은 같은 계열(백설이) 둘이
// 설 때만 걸고 조연에는 걸지 않으며, 측면 에셋이 도착하면 NON_FRONTAL_ASSETS에
// 방향만 등록해 같은 규칙이 자리대로 뒤집게 한다.
describe('마주봄 — 에셋 방향 실측의 기록', () => {
  it('지금 쓰는 배역 에셋은 전부 정면이다', () => {
    [
      'baeksul_f_default.png',
      'baeksul_m_default.png',
      'baeksul_f_suit_sad.png',
      'baeksul_m_suit_sad.png',
      'baeksul_f_date_happy.png',
      'baeksul_m_date_happy.png',
      'boss_stern.png',
      'colleague_default.png',
      'lover_default.png',
    ].forEach((file) => expect(facingOf(char(file))).toBe('front'));
  });

  it('버전 쿼리가 붙은 URL도 같은 판정을 낸다', () => {
    expect(facingOf(char('baeksul_f_date_default.png'))).toBe(
      facingOf('/scenario/characters/baeksul_f_date_default.png')
    );
  });
});

describe('마주봄 — 자리로 반전을 정한다', () => {
  const cast = (chars: (string | undefined)[], gender: 'male' | 'female', domain?: string) =>
    resolveSceneCast(chars, gender, domain);

  it('1인 씬은 반전하지 않는다 (마주 볼 상대가 없다)', () => {
    const solo = cast(['', 'baeksul_f_default.png', ''], 'female', '연인1');
    expect(solo).toHaveLength(1);
    expect(solo[0].mirrored).toBe(false);
    // 빈 슬롯은 빠지되 원래 슬롯 번호는 남는다
    expect(solo[0].slot).toBe(1);
  });

  it('연인 2인 씬은 오른쪽 인물만 반전한다', () => {
    const duo = cast(['baeksul_f_default.png', '', 'lover_default.png'], 'female', '연인2');
    expect(duo.map((s) => s.slot)).toEqual([0, 2]);
    expect(duo[0]).toMatchObject({ src: char('baeksul_f_date_default.png'), mirrored: false });
    expect(duo[1]).toMatchObject({ src: char('baeksul_m_date_default.png'), mirrored: true });
  });

  // 반전 대상은 **배역**이 아니라 **자리**가 정한다. 콘텐츠가 상대역을 왼쪽에
  // 세우면(프로덕션 CSV는 Firestore에서 온다) 반전도 따라 넘어가야 마주본다.
  it('상대역이 왼쪽에 서면 반전 대상도 따라 바뀐다', () => {
    const duo = cast(['lover_default.png', '', 'baeksul_f_default.png'], 'female', '연인2');
    expect(duo[0]).toMatchObject({ src: char('baeksul_m_date_default.png'), mirrored: false });
    expect(duo[1]).toMatchObject({ src: char('baeksul_f_date_default.png'), mirrored: true });
  });

  // 조연은 주인공과 다른 그림이라 뒤집어 봐야 방향이 바뀌지 않고
  // 소품·가르마만 낯설어진다. 보수적으로 건드리지 않는다.
  it('조연이 상대일 때는 아무도 반전하지 않는다', () => {
    cast(['baeksul_f_default.png', '', 'colleague_default.png'], 'female', '직장1').forEach((s) =>
      expect(s.mirrored).toBe(false)
    );
    cast(['baeksul_f_default.png', '', 'boss_stern.png'], 'male', '직장5').forEach((s) =>
      expect(s.mirrored).toBe(false)
    );
  });

  // 3인 씬은 CSV에 0건이지만 파서·렌더 경로는 살아 있다. 가운데는 마주볼 쪽이
  // 없으므로 정면 그대로 두고, 양옆만 규칙을 따른다.
  it('3인 씬은 가운데를 정면으로 두고 오른쪽만 반전한다', () => {
    const trio = cast(
      ['baeksul_f_default.png', 'baeksul_f_sad.png', 'lover_default.png'],
      'female',
      '연인3'
    );
    expect(trio.map((s) => s.mirrored)).toEqual([false, false, true]);
  });

  it('빈 슬롯은 배역 목록에서 빠진다', () => {
    expect(cast(['', '', ''], 'female', '연인1')).toHaveLength(0);
    expect(cast([undefined, 'baeksul_f_default.png', undefined], 'male')).toHaveLength(1);
  });
});

// 측면 에셋이 도착하면 NON_FRONTAL_ASSETS에 방향만 등록하면 된다. 그 갈래가
// 실제로 동작하는지는 지금 에셋으로는 확인할 수 없으므로, 방향을 직접 넣어
// 규칙만 따로 고정해 둔다 — 등록하는 날 이 규칙이 이미 검증돼 있어야 한다.
describe('마주봄 — 측면 에셋이 오면 자리에 맞춰 뒤집는다', () => {
  const sprite = (file: string, facing: 'front' | 'left' | 'right') => ({
    src: char(file),
    facing,
  });

  it('오른쪽을 보는 에셋은 왼쪽 자리에서 그대로, 오른쪽 자리에서 뒤집힌다', () => {
    expect(
      mirrorPlan([sprite('hero_right.png', 'right'), sprite('other_right.png', 'right')])
    ).toEqual([false, true]);
  });

  it('왼쪽을 보는 에셋은 반대다', () => {
    expect(
      mirrorPlan([sprite('hero_left.png', 'left'), sprite('other_left.png', 'left')])
    ).toEqual([true, false]);
  });

  // 방향이 있는 에셋은 계열이 달라도(조연이어도) 교정한다 — 그때는 뒤집는 것이
  // 실제로 마주봄을 만들기 때문이다. 정면 에셋에만 걸었던 보수적 제한이 여기까지
  // 따라오면 측면 에셋을 넣는 의미가 없어진다.
  it('계열이 달라도 방향이 있으면 교정한다', () => {
    expect(mirrorPlan([sprite('baeksul_x.png', 'right'), sprite('boss_y.png', 'right')])).toEqual([
      false,
      true,
    ]);
  });

  it('혼자면 방향이 있어도 뒤집지 않는다', () => {
    expect(mirrorPlan([sprite('hero_left.png', 'left')])).toEqual([false]);
  });
});

// ── 캐시 버전: 프리로드와 렌더가 같은 문자열이어야 한다 ────────────────
describe('캐시 버스터', () => {
  it('캐릭터·배경·요정 URL에 모두 버전이 붙는다', () => {
    expect(resolveCharacterFile('baeksul_f_default.png', 'female')).toBe(
      versionedAsset('/scenario/characters/baeksul_f_default.png')
    );
    expect(backgroundUrl('my_room.png')).toBe(versionedAsset('/scenario/backgrounds/my_room.webp'));
    expect(fairyUrl(STRATEGY_META.accept.image)).toBe(versionedAsset(STRATEGY_META.accept.image));
  });

  it('조연·연인 폴백 경로에도 빠짐없이 붙는다', () => {
    [
      resolveCharacterFile('colleague_default.png', 'female'),
      resolveCharacterFile('friend_default', 'male'),
      resolvePartnerFile('lover_tired.png', 'female'),
      backgroundUrl('new_place.png'),
    ].forEach((url) => expect(url).toContain('?v='));
  });
});

describe('collectEpisodeImageUrls', () => {
  const episode = {
    id: 'relationship-ep1',
    episodeNumber: 1,
    title: '연락이 없는 연인',
    summary: '요약',
    scenario: {
      no: '21',
      domain: '연인1',
      reactionType: '인지',
      title: '연락이 없는 연인',
      scenes: [
        {
          type: '상황',
          text: 't1',
          bg: 'my_room.png',
          chars: ['baeksul_f_default.png', '', 'lover_default.png'],
        },
        { type: '상황', text: 't2', bg: 'my_room.png', chars: ['', 'baeksul_f_default.png', ''] },
      ],
    },
    angels: {} as EpisodeData['angels'],
    reasons: { helpful: [], unhelpful: [] },
  } as EpisodeData;

  it('프리로드 목록도 화면과 같은 성별로 해석한다 (미리 받은 그림과 그리는 그림이 어긋나지 않는다)', () => {
    expect(collectEpisodeImageUrls(episode, 'male')).toContain(char('baeksul_m_date_default.png'));
  });

  // 연인 영역에서는 상대역까지 백설이라, 프리로드가 도메인을 모르면 lover_*.png를
  // 받아 두고 정작 화면에는 받지 않은 백설이가 뜬다 (프리로드 게이트가 헛돈다).
  it('연인 영역의 상대역은 반대 성별 백설이로 미리 받는다', () => {
    const male = collectEpisodeImageUrls(episode, 'male');
    expect(male).toContain(char('baeksul_f_date_default.png'));
    expect(male).not.toContain(char('lover_default.png'));

    const female = collectEpisodeImageUrls(episode, 'female');
    expect(female).toContain(char('baeksul_m_date_default.png'));
    expect(female).not.toContain(char('lover_default.png'));
  });

  it('중복 없이 배경·캐릭터·요정 3종을 모은다', () => {
    const urls = collectEpisodeImageUrls(episode, 'female');
    expect(urls.filter((u) => u === bg('my_room.webp'))).toHaveLength(1);
    Object.values(STRATEGY_META).forEach((meta) => expect(urls).toContain(fairyUrl(meta.image)));
  });

  // 버전이 한쪽에만 붙으면 브라우저에게는 다른 URL이라 프리로드가 통째로 헛돈다.
  it('무대가 그릴 URL이 프리로드 목록에 그대로 들어 있다', () => {
    (['male', 'female'] as const).forEach((gender) => {
      const urls = new Set(collectEpisodeImageUrls(episode, gender));
      episode.scenario.scenes.forEach((scene) => {
        // 배경도 성별을 탄다(내 방). 무대가 넘기는 값을 그대로 넘겨야 한다.
        expect(urls).toContain(backgroundUrl(scene.bg, gender));
        resolveSceneCast(scene.chars, gender, episode.scenario.domain).forEach((staged) =>
          expect(urls).toContain(staged.src)
        );
      });
      Object.values(STRATEGY_META).forEach((meta) => expect(urls).toContain(fairyUrl(meta.image)));
    });
  });
});

// 여기가 "중간에 갑자기 성별이 바뀐다"의 실질적 방지선이다. 로컬 CSV 전체를
// 실제로 파싱해, 어느 영역·어느 회차·어느 씬을 골라도 주인공이 한 성별로만
// 해석되고 그 파일이 실제로 존재하는지 확인한다.
describe('실 CSV 전수 검사', () => {
  const scenarios = parseAndMergeScenarioCsv(visualCsv, dialogueCsv);
  const allChars = scenarios
    .flatMap((s) => s.scenes.flatMap((scene) => scene.chars))
    .filter(Boolean);

  it('CSV에 씬이 실제로 들어 있다 (전수 검사가 빈 배열을 통과하지 않게)', () => {
    expect(allChars.length).toBeGreaterThan(100);
  });

  it.each(['male', 'female'] as const)('%s 유저에게는 주인공이 그 성별로만 나온다', (gender) => {
    const token = gender === 'male' ? 'm' : 'f';
    const opposite = gender === 'male' ? 'f' : 'm';

    // 결과 URL이 아니라 **CSV 표기**로 거른다. lover_*도 이제 백설이로
    // 치환되므로(반대 성별) 결과로 거르면 상대역까지 휩쓸려 들어온다.
    const protagonistUrls = allChars
      .filter((char_) => char_.trim().toLowerCase().startsWith('baeksul'))
      .map((char_) => resolveCharacterFile(char_, gender));

    expect(protagonistUrls.length).toBeGreaterThan(0);
    protagonistUrls.forEach((url) => {
      expect(url).toContain(`baeksul_${token}_`);
      expect(url).not.toContain(`baeksul_${opposite}_`);
    });
  });

  it.each(['male', 'female'] as const)('%s 유저의 모든 스프라이트가 실재하는 파일이다', (gender) => {
    allChars.forEach((char_) => {
      expect(EXISTING_CHARACTER_FILES.has(fileNameOf(resolveCharacterFile(char_, gender)))).toBe(
        true
      );
    });
  });

  // 도메인을 함께 넘긴 실제 렌더 경로. 연인 영역에서 상대역이 백설이로 바뀌고
  // 영역마다 의상이 갈려도 조립된 파일명이 전부 실재해야 한다
  // (없는 조합으로 떨어지면 404 → alt 텍스트).
  it.each(['male', 'female'] as const)(
    '%s 유저의 스프라이트는 도메인을 넣어 해석해도 전부 실재한다',
    (gender) => {
      scenarios.forEach((s) => {
        s.scenes.forEach((scene) => {
          resolveSceneCast(scene.chars, gender, s.domain).forEach((staged) => {
            expect(
              EXISTING_CHARACTER_FILES.has(fileNameOf(staged.src)),
              `${staged.charName} @ ${s.domain} → ${staged.src}`
            ).toBe(true);
          });
        });
      });
    }
  );

  // 영역별 의상이 실제 콘텐츠에 걸리는지 — 매핑을 넣어 놓고 도메인 표기가
  // 어긋나 아무 데도 안 걸리는 상황을 잡는다.
  it.each([
    ['직장', 'suit'],
    ['연인', 'date'],
    ['일상', 'base'],
  ] as const)('%s 영역의 백설이는 %s 차림으로만 나온다', (prefix, outfit) => {
    const inDomain = scenarios.filter((s) => s.domain.startsWith(prefix));
    expect(inDomain.length).toBeGreaterThan(0);

    const files = inDomain.flatMap((s) =>
      s.scenes.flatMap((scene) =>
        resolveSceneCast(scene.chars, 'female', s.domain, scene.bg)
          .map((staged) => fileNameOf(staged.src))
          .filter((file) => file.startsWith('baeksul_'))
      )
    );
    expect(files.length).toBeGreaterThan(0);
    files.forEach((file) => {
      if (outfit === 'base') {
        expect(file).toMatch(/^baeksul_[mf]_(default|happy|sad|worried)\.png$/);
      } else {
        expect(file).toContain(`_${outfit}_`);
      }
    });
  });

  it.each(['male', 'female'] as const)(
    '%s 유저의 연인 영역에는 반대 성별 백설이가 반전된 채로만 등장한다',
    (gender) => {
      const token = gender === 'male' ? 'm' : 'f';
      const opposite = gender === 'male' ? 'f' : 'm';

      const loverScenes = scenarios.filter((s) => isLoverDomain(s.domain));
      expect(loverScenes.length).toBeGreaterThan(0);

      const sprites = loverScenes.flatMap((s) =>
        s.scenes.flatMap((scene) => resolveSceneCast(scene.chars, gender, s.domain))
      );

      // 연인 영역에는 백설이 외의 배역이 없다 (실측: baeksul_* · lover_*뿐).
      sprites.forEach(({ src }) => expect(src).toContain('baeksul_'));

      const mirrored = sprites.filter((s) => s.mirrored);
      expect(mirrored.length).toBeGreaterThan(0);
      mirrored.forEach(({ src }) => expect(src).toContain(`baeksul_${opposite}_date_`));
      sprites
        .filter((s) => !s.mirrored)
        .forEach(({ src }) => expect(src).toContain(`baeksul_${token}_date_`));
    }
  );

  // 연인 밖에서는 아무도 뒤집히지 않아야 한다 — 조연을 건드리지 않기로 한 결정.
  it('연인 영역 밖에서는 반전이 한 번도 일어나지 않는다', () => {
    const others = scenarios.filter((s) => !isLoverDomain(s.domain));
    expect(others.length).toBeGreaterThan(0);
    others.forEach((s) =>
      s.scenes.forEach((scene) =>
        resolveSceneCast(scene.chars, 'female', s.domain).forEach((staged) =>
          expect(staged.mirrored, `${staged.charName} @ ${s.domain}`).toBe(false)
        )
      )
    );
  });
});

describe('배경 URL — 업스케일 WebP 매핑', () => {
  it('업스케일본이 있는 배경은 .webp 경로로 바꾼다', () => {
    expect(backgroundUrl('my_room.png')).toBe(bg('my_room.webp'));
    expect(backgroundUrl('meeting_room.png')).toBe(bg('meeting_room.webp'));
  });

  it('목록에 없는 배경은 원명 그대로 서빙한다 (미래에 추가될 PNG 안전망)', () => {
    expect(backgroundUrl('new_place.png')).toBe(bg('new_place.png'));
  });

  it('실 CSV의 모든 bg 값이 WebP 목록에 들어 있다 (목록 누락 회귀 방지)', () => {
    const scenarios = parseAndMergeScenarioCsv(visualCsv, dialogueCsv);
    const bgs = new Set(scenarios.flatMap((s) => s.scenes.map((scene) => scene.bg)).filter(Boolean));
    expect(bgs.size).toBeGreaterThan(0);
    for (const value of bgs) {
      expect(fileNameOf(backgroundUrl(value)), `${value}의 업스케일본 누락`).toMatch(/\.webp$/);
    }
  });

  it('프리로드 목록도 같은 매핑을 쓴다', () => {
    const scenarios = parseAndMergeScenarioCsv(visualCsv, dialogueCsv);
    const episode: EpisodeData = {
      scenario: scenarios[0],
      dialogues: [],
    } as unknown as EpisodeData;
    const urls = collectEpisodeImageUrls(episode, 'female');
    const bgUrls = urls.filter((u) => u.includes('/backgrounds/'));
    expect(bgUrls.length).toBeGreaterThan(0);
    bgUrls.forEach((u) => expect(fileNameOf(u)).toMatch(/\.webp$/));
  });
});

// ── ⑥ 성별 분기 배경 (2026-08-26 채택) ────────────────────────────────
//
// '내 방'이 아이돌 포스터·파스텔 이불이라 남성 주인공에게 남의 방으로
// 읽힌다는 지적에, 구도·조명은 그대로 두고 소품만 바꾼 남성용 한 장을
// 붙였다. 고정할 계약은 세 가지다.
//   · 남성만 변형을 본다 — 여성·미지정 화면은 한 글자도 달라지지 않는다
//   · 변형을 만들지 않은 배경은 성별과 무관하게 원본이다 (404 금지)
//   · 성별 치환이 WebP 치환보다 **먼저** 일어난다. 순서가 뒤집히면 이름이
//     `my_room.webp`가 되어 `.png` 접미사 규칙에 걸리지 않고 조용히 원본이 나간다
describe('배경 URL — 성별 분기', () => {
  it('남성 유저의 내 방은 남성용 변형으로 바뀐다', () => {
    expect(backgroundUrl('my_room.png', 'male')).toBe(bg('my_room_m.webp'));
  });

  it('여성 유저와 성별 미지정은 원본 그대로다 (기존 화면 불변)', () => {
    expect(backgroundUrl('my_room.png', 'female')).toBe(bg('my_room.webp'));
    expect(backgroundUrl('my_room.png')).toBe(bg('my_room.webp'));
  });

  it('변형을 만들지 않은 배경은 성별과 무관하게 원본이다', () => {
    for (const gender of ['male', 'female'] as const) {
      expect(backgroundUrl('cafe.png', gender)).toBe(bg('cafe.webp'));
      expect(backgroundUrl('new_place.png', gender)).toBe(bg('new_place.png'));
    }
  });

  it('파일명 치환은 화이트리스트에 있는 것만 켠다', () => {
    expect(genderedBackgroundFile('my_room.png', 'male')).toBe('my_room_m.png');
    expect(genderedBackgroundFile('my_room.png', 'female')).toBe('my_room.png');
    expect(genderedBackgroundFile('my_room.png')).toBe('my_room.png');
    // 규칙에 맞는 이름을 조립할 수 있어도 목록에 없으면 원본이다.
    expect(genderedBackgroundFile('cafe.png', 'male')).toBe('cafe.png');
  });

  it('성별 변형에도 업스케일 WebP가 이어진다', () => {
    expect(fileNameOf(backgroundUrl('my_room.png', 'male'))).toBe('my_room_m.webp');
  });

  it('프리로드와 렌더가 같은 문자열이다 (성별 포함)', () => {
    const scenarios = parseAndMergeScenarioCsv(visualCsv, dialogueCsv);
    const target = scenarios.find((s) => s.scenes.some((scene) => scene.bg === 'my_room.png'));
    expect(target, '내 방을 쓰는 에피소드가 있어야 이 계약을 검증할 수 있다').toBeDefined();

    const episode: EpisodeData = { scenario: target!, dialogues: [] } as unknown as EpisodeData;
    const preloaded = collectEpisodeImageUrls(episode, 'male');
    const rendered = target!.scenes
      .filter((scene) => scene.bg)
      .map((scene) => backgroundUrl(scene.bg, 'male'));

    expect(rendered).toContain(bg('my_room_m.webp'));
    rendered.forEach((url) => expect(preloaded).toContain(url));
    // 여성용을 미리 받아 두고 남성용을 그리면 프리로드가 통째로 헛돈다.
    expect(preloaded).not.toContain(bg('my_room.webp'));
  });
});

// ── ⑤ 프리로드 게이트 (2026-08-18 실플레이 지적) ──────────────────────
//
// "옛날엔 미리 다운받아 로딩 지연이 없었는데, 지금은 인터넷이 느리면 대사만
// 먼저 나오고 그림이 늦게 뜬다." 원인은 호출부(VisualNovelPlayer)에 있던 3초
// 폴백이었고 그쪽 테스트가 게이트 계약을 고정한다. 여기서 고정하는 것은 그
// 게이트가 딛고 서는 **preloadImages의 종료 보장**이다.
//
//   · 멈춘 요청(load도 error도 오지 않음)이 있어도 반드시 resolve한다.
//     이게 깨지면 플레이어가 로딩 화면에서 영원히 멈춘다 — 3초 폴백을 걷어낸
//     지금은 여기가 유일한 탈출구다.
//   · 어떻게 끝나든 한 장은 한 번만 집계한다. 로딩 표시가 이 값을 그리므로
//     두 번 세면 진행률이 100%를 넘는다.
describe('preloadImages — 게이트가 딛고 서는 종료 보장', () => {
  /**
   * jsdom이 아닌 node 환경이라 `Image`가 없고, 있더라도 실제 네트워크를 타지
   * 않으므로 어차피 이벤트가 오지 않는다. 그래서 테스트가 load/error 시점을
   * 직접 잡을 수 있는 가짜를 세운다.
   */
  class FakeImage {
    static created: FakeImage[] = [];
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    src = '';
    constructor() {
      FakeImage.created.push(this);
    }
  }

  const stubImage = () => {
    FakeImage.created = [];
    vi.stubGlobal('Image', FakeImage);
    return FakeImage;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('모두 로드되면 실패 목록이 비고, 진행 집계가 0에서 전체까지 오른다', async () => {
    const Fake = stubImage();
    const progress: [number, number][] = [];

    const pending = preloadImages(['/a.png', '/b.png'], {
      onProgress: (settled, total) => progress.push([settled, total]),
    });
    // 총량은 한 장도 끝나기 전에 알려 줘야 한다 — 안 그러면 로딩 표시가
    // "0/0"에서 시작해 멈춘 것처럼 보인다.
    expect(progress[0]).toEqual([0, 2]);

    Fake.created.forEach((img) => img.onload?.());
    await expect(pending).resolves.toEqual({ failed: [] });
    expect(progress).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
  });

  it('깨진 URL만 실패 목록에 남는다', async () => {
    const Fake = stubImage();
    const pending = preloadImages(['/ok.png', '/broken.png']);

    Fake.created[0].onload?.();
    Fake.created[1].onerror?.();

    await expect(pending).resolves.toEqual({ failed: ['/broken.png'] });
  });

  it('응답이 없는 URL은 타임아웃이 실패로 끝내고, 약속은 반드시 resolve된다', async () => {
    vi.useFakeTimers();
    const Fake = stubImage();
    const pending = preloadImages(['/ok.png', '/stalled.png'], { timeoutMs: 1000 });

    Fake.created[0].onload?.();
    // 한 장이 멈춰 있는 동안에는 끝나지 않는다 — 게이트가 열리면 안 되는 구간.
    await vi.advanceTimersByTimeAsync(999);
    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ failed: ['/stalled.png'] });
  });

  it('먼저 끝난 장은 타임아웃이 지나도 다시 세지 않는다', async () => {
    vi.useFakeTimers();
    const Fake = stubImage();
    const progress: [number, number][] = [];
    const pending = preloadImages(['/a.png'], {
      timeoutMs: 1000,
      onProgress: (settled, total) => progress.push([settled, total]),
    });

    Fake.created[0].onload?.();
    await expect(pending).resolves.toEqual({ failed: [] });

    // 타이머가 남아 있었다면 여기서 2/1이 찍힌다.
    await vi.advanceTimersByTimeAsync(5000);
    expect(progress).toEqual([
      [0, 1],
      [1, 1],
    ]);
  });

  it('받을 것이 없어도 곧바로 끝난다 (게이트가 헛돌지 않게)', async () => {
    stubImage();
    await expect(preloadImages([])).resolves.toEqual({ failed: [] });
  });
});

// ── 의상: 취업준비는 배경이 정한다 (2026-08-27 UAT R2-18) ──────────────────
// 취업준비 120칸 중 면접장은 12칸뿐인데 영역 규칙만으로 전부 정장을 입혀
// 내 방·도서관에서도 정장이 나왔다. 정장은 면접장·회사 배경에서만.
describe('백설이 의상 — 씬 배경 규칙 (R2-18)', () => {
  it('취업준비는 면접장·회사 배경에서만 정장이고 그 밖은 기본복이다', () => {
    expect(outfitForScene('취업준비1', 'interview_room.png')).toBe('suit');
    expect(outfitForScene('취업준비1', 'office.png')).toBe('suit');
    expect(outfitForScene('취업준비3', 'library.png')).toBe('base');
    expect(outfitForScene('취업준비4', 'my_room.png')).toBe('base');
    expect(outfitForScene('취업준비5', 'living_room.png')).toBe('base');
    expect(outfitForScene('job-prep', 'INTERVIEW_ROOM.PNG')).toBe('suit');
    expect(outfitForScene('취업준비2', undefined)).toBe('base');
  });

  it('직장·연인·일상은 배경과 무관하게 영역 규칙을 따른다', () => {
    expect(outfitForScene('직장2', 'my_room.png')).toBe('suit');
    expect(outfitForScene('연인1', 'interview_room.png')).toBe('date');
    expect(outfitForScene('일상2', 'interview_room.png')).toBe('base');
  });

  it('스프라이트 해석에 배경을 넘기면 취업준비 내 방 씬은 기본복 파일이 된다', () => {
    expect(resolveSprite('baeksul_f_sad.png', 'female', '취업준비2', undefined, 'my_room.png').src)
      .toContain('baeksul_f_sad.png');
    expect(resolveSprite('baeksul_f_sad.png', 'female', '취업준비1', undefined, 'interview_room.png').src)
      .toContain('baeksul_f_suit_sad.png');
  });
});

// 취업준비는 씬 배경이 의상을 정한다 (R2-18) — 실 CSV 전수로 고정한다.
describe('실 CSV 전수 검사 — 취업준비 의상은 배경을 따른다 (R2-18)', () => {
  it('면접장·회사 배경에서만 정장이고 그 밖은 기본복이다', () => {
    const scenarios = parseAndMergeScenarioCsv(visualCsv, dialogueCsv);
    const inDomain = scenarios.filter((s) => s.domain.startsWith('취업준비'));
    expect(inDomain.length).toBeGreaterThan(0);
    let suits = 0;
    let bases = 0;
    inDomain.forEach((s) =>
      s.scenes.forEach((scene) => {
        const bg = (scene.bg ?? '').replace(/\.png$/i, '');
        const interview = ['interview_room', 'office', 'meeting_room', 'corridor'].includes(bg);
        resolveSceneCast(scene.chars, 'female', s.domain, scene.bg)
          .map((staged) => fileNameOf(staged.src))
          .filter((file) => file.startsWith('baeksul_'))
          .forEach((file) => {
            if (interview) {
              expect(file).toContain('_suit_');
              suits += 1;
            } else {
              expect(file).toMatch(/^baeksul_[mf]_(default|happy|sad|worried)\.png$/);
              bases += 1;
            }
          });
      })
    );
    // 8/27 실측: 면접장 12칸 · 그 밖 108칸. 배선이 끊기면 한쪽이 0이 된다.
    expect(suits).toBeGreaterThan(0);
    expect(bases).toBeGreaterThan(suits);
  });
});
