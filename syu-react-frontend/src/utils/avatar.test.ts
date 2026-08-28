// src/utils/avatar.test.ts
// 아바타 표시 우선순위 4단을 고정한다.
//
// 이 순서가 흔들리면 화면마다 다른 그림이 나온다. 특히 3단(구글 사진)이
// 2단(프리셋)을 이기면 구글 사용자는 프리셋을 골라도 바뀌지 않는다.
// 1단(업로드)은 아직 어디서도 채워지지 않지만, Storage 업로드가 붙는 2차
// 작업이 이 계약을 그대로 이어받도록 지금 함께 고정해 둔다.

import { describe, it, expect } from 'vitest';
import { resolveAvatar } from './avatar';
import { AVATAR_PRESETS } from '../constants/avatarPresets';

const PRESET = AVATAR_PRESETS[0];
const CROPPED = AVATAR_PRESETS.find((p) => p.crop)!;
const PHOTO = 'https://lh3.googleusercontent.com/a/photo.jpg';
const UPLOAD = 'https://firebasestorage.example/avatars/u-1.png';

describe('resolveAvatar 우선순위', () => {
  it('1순위 — avatarUrl(업로드)이 있으면 나머지를 모두 이긴다', () => {
    const r = resolveAvatar({ avatarUrl: UPLOAD, avatarId: PRESET.id, photoURL: PHOTO });
    expect(r).toMatchObject({ src: UPLOAD, kind: 'upload' });
  });

  it('2순위 — 업로드가 없으면 프리셋이 구글 사진을 이긴다', () => {
    const r = resolveAvatar({ avatarId: PRESET.id, photoURL: PHOTO });
    expect(r).toMatchObject({ src: PRESET.src, kind: 'preset' });
  });

  it('3순위 — 프리셋이 없으면 구글 photoURL을 쓴다', () => {
    const r = resolveAvatar({ photoURL: PHOTO });
    expect(r).toMatchObject({ src: PHOTO, kind: 'photo' });
  });

  it('4순위 — 아무것도 없으면 src는 null (기본 아이콘)', () => {
    const r = resolveAvatar({});
    expect(r).toMatchObject({ src: null, kind: 'default' });
  });

  it('avatarId를 null로 지우면 곧바로 구글 사진으로 돌아간다', () => {
    const r = resolveAvatar({ avatarId: null, photoURL: PHOTO });
    expect(r).toMatchObject({ src: PHOTO, kind: 'photo' });
  });
});

describe('resolveAvatar 방어', () => {
  it('알 수 없는 프리셋 id는 무시하고 다음 순위로 넘어간다', () => {
    // 목록에서 빠진 프리셋을 저장해 둔 사용자가 빈 화면을 보면 안 된다.
    const r = resolveAvatar({ avatarId: 'preset-없음', photoURL: PHOTO });
    expect(r).toMatchObject({ src: PHOTO, kind: 'photo' });
  });

  it('빈 문자열·공백뿐인 URL은 없는 값으로 취급한다', () => {
    expect(resolveAvatar({ photoURL: '   ' }).kind).toBe('default');
    expect(resolveAvatar({ avatarUrl: '', photoURL: PHOTO }).kind).toBe('photo');
  });
});

describe('렌더링 힌트', () => {
  it('프리셋은 얼굴 크롭 값을 함께 돌려준다', () => {
    const r = resolveAvatar({ avatarId: CROPPED.id });
    expect(r.crop).toEqual(CROPPED.crop);
  });

  it('프리셋이 아닌 출처(구글 사진·업로드)에는 크롭이 붙지 않는다', () => {
    expect(resolveAvatar({ photoURL: PHOTO }).crop).toBeNull();
    expect(resolveAvatar({ avatarUrl: UPLOAD }).crop).toBeNull();
  });

  it('구글 사진은 원을 꽉 채운다 (cover)', () => {
    expect(resolveAvatar({ photoURL: PHOTO }).fit).toBe('cover');
  });
});

// 32~56px 동그라미 안에서 7종이 "얼굴+상체"로 비슷하게 보여야 한다.
// 원본 해상도도 등신 비율도 제각각이라 zoom 하나로는 맞출 수 없고,
// avatarPresets.ts의 faceCrop()이 프리셋마다 계산한다. 여기서는 그
// 계산 결과가 지켜야 할 성질을 고정한다 — 값 자체를 베껴 적지 않는다.
describe('프리셋 얼굴 크롭', () => {
  it('7종 전부 크롭을 갖는다 (전신이 통째로 들어가는 프리셋이 없다)', () => {
    // 회귀 방지: 요정 3종은 예전에 크롭이 없어 작은 원 안에 전신이
    // 들어갔고, 얼굴이 몇 픽셀 되지 않아 서로 구분되지 않았다.
    for (const preset of AVATAR_PRESETS) {
      expect(preset.crop, preset.id).toBeDefined();
      expect(preset.crop!.zoom, preset.id).toBeGreaterThan(1);
    }
  });

  it('가로는 어느 프리셋도 빈 구석을 남기지 않는다', () => {
    // 컨테이너 한 변을 1로 두면 이미지는 x/100 에서 시작해 폭 zoom 만큼
    // 뻗는다. 시작점이 0보다 오른쪽이거나 끝점이 1에 못 미치면 원 좌우에
    // 배경색 띠가 생긴다.
    for (const preset of AVATAR_PRESETS) {
      const { zoom, x } = preset.crop!;
      expect(x / 100, preset.id).toBeLessThanOrEqual(0);
      expect(x / 100 + zoom, preset.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('세로는 원본이 원 위아래를 모두 덮는다', () => {
    // 원본 캔버스가 원 밖으로 넘쳐야 원 가장자리에 배경색 띠가 생기지 않는다.
    // (캔버스 안의 투명 여백은 별개 문제다 — 요정은 콘텐츠가 아래 정렬이라
    // 머리 위쪽에 투명 여백이 조금 들어오는데, 인물 사진의 헤드룸처럼 읽힌다.)
    //
    // 이미지 높이는 zoom이 아니라 zoom×종횡비다. 7종 원본이 모두 세로로 긴
    // 컷이고 그중 가장 납작한 것이 요정(720/597 = 1.21)이므로, 그 값으로
    // 계산한 하한이 어느 프리셋에나 안전한 보수적 검사가 된다.
    const MIN_ASPECT = 720 / 597;

    for (const preset of AVATAR_PRESETS) {
      const { zoom, y } = preset.crop!;
      expect(y / 100, preset.id).toBeLessThanOrEqual(0.05);
      expect(y / 100 + zoom * MIN_ASPECT, preset.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('백설이 4종은 크롭 한 벌을 공유한다', () => {
    // 4종은 같은 캔버스·같은 구도로 그려진 같은 인물이다. 한 종만 따로
    // 손대면 선택 모달 안에서 같은 캐릭터가 서로 다른 구도로 뜬다.
    const mates = AVATAR_PRESETS.filter((p) => p.id.startsWith('mate-'));
    expect(mates).toHaveLength(4);
    for (const mate of mates) {
      expect(mate.crop, mate.id).toBe(mates[0].crop);
    }
  });

  it('백설이 크롭은 치비 원본의 머리를 통째로 담는다', () => {
    // 2026-08-18 치비 교체 전 값(zoom 2.8 = 창 320px)은 창이 머리보다 작아
    // **머리카락 꼭대기만** 보였다. 값을 베껴 고정하는 대신, PIL로 잰 원본
    // 좌표가 창 안에서 어디에 놓이는지를 검사한다 — 에셋을 다시 갈면
    // 아래 실측값과 함께 갱신하면 된다.
    const CANVAS_WIDTH = 896;
    const HAIR_TOP = 52; // 머리카락 꼭대기 y (남녀 동일)
    const CHIN_FEMALE = 483;
    const CHIN_MALE = 537; // 남자 머리가 더 길다 — 바닥 여유는 이쪽이 기준

    const { zoom, x, y } = AVATAR_PRESETS.find((p) => p.id === 'mate-female')!.crop!;

    // 원에 담기는 원본 정사각형: 한 변 window, 좌상단 (left, top).
    const window = CANVAS_WIDTH / zoom;
    const top = (-y / 100) * window;
    const left = (-x / 100) * window;

    // 가로 중심은 캔버스 중앙(448)이어야 머리 덩어리가 한쪽으로 안 쏠린다.
    expect(left + window / 2).toBeCloseTo(CANVAS_WIDTH / 2, 0);

    // 머리 위 여백 — 0이면 정수리가 원에 눌리고, 너무 크면 얼굴이 작아진다.
    const headroom = (HAIR_TOP - top) / window;
    expect(headroom).toBeGreaterThan(0.04);
    expect(headroom).toBeLessThan(0.15);

    // 남자 턱까지 원 안에 들어와야 한다 (여자보다 54px 아래에 있다).
    expect((CHIN_MALE - top) / window).toBeLessThan(0.97);

    // 머리(머리카락~턱)가 원의 3분의 2는 차지해야 32px 헤더에서 읽힌다.
    expect((CHIN_FEMALE - HAIR_TOP) / window).toBeGreaterThan(0.65);
  });

  it('요정 3종은 얼굴이 원을 채우는 같은 크기의 창을 본다', () => {
    // 원 안에 보이는 원본 영역은 한 변이 (원본 폭 / zoom) px인 정사각형이다.
    // ver1 신규본(2026-08-18)은 셋 다 597×720으로 정규화돼 있어 창도 같다.
    // 창이 이보다 커지면 전신 구도가 되어 얼굴이 56px 원에서 뭉개지고,
    // 작아지면 부엉이 정수리·여우 귀·토끼 귀가 잘린다.
    const FAIRY_CANVAS_WIDTH = 597;
    const fairies = AVATAR_PRESETS.filter((p) => p.id.startsWith('fairy-'));
    expect(fairies).toHaveLength(3);

    for (const fairy of fairies) {
      const size = FAIRY_CANVAS_WIDTH / fairy.crop!.zoom;
      expect(size, fairy.id).toBeGreaterThan(410);
      expect(size, fairy.id).toBeLessThan(470);
    }
  });

  it('요정 3종의 창은 콘텐츠(y 228~700)를 비껴가지 않는다', () => {
    // ver1 신규본은 콘텐츠가 캔버스 아래쪽에 정렬돼 있다(위쪽 228px이 빈
    // 공간). 교체 전 값은 그 빈 공간을 원 중앙에 놓아 타일이 투명하게 떴다.
    // 창의 중심이 콘텐츠 세로 범위 안에 있는지로 그 사고를 막는다.
    const FAIRY_CANVAS_WIDTH = 597;
    const CONTENT_TOP = 228;
    const CONTENT_BOTTOM = 700;

    for (const fairy of AVATAR_PRESETS.filter((p) => p.id.startsWith('fairy-'))) {
      const { zoom, y } = fairy.crop!;
      const window = FAIRY_CANVAS_WIDTH / zoom;
      const centerY = (-y / 100) * window + window / 2;
      expect(centerY, fairy.id).toBeGreaterThan(CONTENT_TOP);
      expect(centerY, fairy.id).toBeLessThan(CONTENT_BOTTOM);
    }
  });
});

describe('프리셋 목록', () => {
  it('6~8종이며 id가 중복되지 않는다', () => {
    expect(AVATAR_PRESETS.length).toBeGreaterThanOrEqual(6);
    expect(AVATAR_PRESETS.length).toBeLessThanOrEqual(8);
    expect(new Set(AVATAR_PRESETS.map((p) => p.id)).size).toBe(AVATAR_PRESETS.length);
  });

  it('모든 프리셋이 public/ 기준 절대 경로를 가리킨다', () => {
    for (const preset of AVATAR_PRESETS) {
      expect(preset.src.startsWith('/')).toBe(true);
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });
});
