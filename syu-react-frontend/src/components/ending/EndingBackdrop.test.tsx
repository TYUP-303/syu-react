// src/components/ending/EndingBackdrop.test.tsx
// @vitest-environment jsdom
//
// 이 컴포넌트가 책임지는 것은 **URL 조립을 자기가 하지 않는다**는 점이다.
// 원고(endingScript)는 배경 파일명만 들고 있고, WebP 업스케일본 선택과 캐시
// 버스터는 시나리오 플레이와 공유하는 backgroundUrl이 붙인다. 2026-08-18
// 이전에는 원고가 `/scenario/backgrounds/*.png`를 직접 조립해 엔딩만 그 둘을
// 통째로 건너뛰고 있었다 — 화면상 구분이 안 되는 종류의 회귀라 테스트로 막는다.
//
// 페이드·스크림 같은 연출 값은 여기서 보지 않는다. 눈으로 조정하는 값이라
// 고정하면 조정할 때마다 깨지기만 한다.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import EndingBackdrop from './EndingBackdrop';
import { backgroundUrl } from '../scenario/player/assetUrls';
import type { EndingBackground } from '../../constants/endingScript';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ROOM: EndingBackground = { file: 'my_room.png', focusX: 18, note: '스탠드 켜진 책상' };
const CAFE: EndingBackground = { file: 'cafe.png', focusX: 75, note: '카운터와 진열대' };

/** `new Image()`에 들어간 src를 모으는 대역. 프리로드는 DOM에 흔적이 없다. */
function stubImage(): string[] {
  const requested: string[] = [];
  vi.stubGlobal(
    'Image',
    class {
      set src(value: string) {
        requested.push(value);
      }
    },
  );
  return requested;
}

describe('EndingBackdrop', () => {
  it('배경을 backgroundUrl이 만든 URL로 그린다 (WebP + 캐시 버스터)', () => {
    render(<EndingBackdrop background={ROOM} visible fadeMs={600} />);

    const layer = screen.getByRole('img', { name: ROOM.note });
    const expected = backgroundUrl(ROOM.file);

    expect(expected).toContain('my_room.webp');
    expect(expected).toContain('?v=');
    expect(layer.style.backgroundImage).toContain(expected);
    // 파일명을 그대로 쓰던 경로(확장자 변환 누락)로 돌아가면 여기서 걸린다.
    expect(layer.style.backgroundImage).not.toContain('my_room.png');
  });

  it('다음 배경을 렌더와 같은 URL로 미리 받는다', () => {
    const requested = stubImage();

    render(<EndingBackdrop background={ROOM} nextBackground={CAFE} visible fadeMs={600} />);

    // 문자열이 한 글자만 달라도 브라우저에게는 다른 파일이라 프리로드가 헛돈다.
    expect(requested).toEqual([backgroundUrl(CAFE.file)]);
  });

  it('마지막 챕터에서는 미리 받을 것이 없다', () => {
    const requested = stubImage();

    render(<EndingBackdrop background={ROOM} visible fadeMs={600} />);

    expect(requested).toEqual([]);
  });

  // 2026-08-26 — '내 방'에 남성용 변형이 생겼다. 엔딩의 첫·마지막 챕터가 그
  // 방이므로, 시나리오 플레이에서 남성용 방을 보던 유저가 엔딩에서만 여성용
  // 방을 보면 "같은 방으로 닫는다"는 원고의 의도가 깨진다.
  it('남성 유저에게는 성별 변형 배경을 그린다', () => {
    render(<EndingBackdrop background={ROOM} gender="male" visible fadeMs={600} />);

    const layer = screen.getByRole('img', { name: ROOM.note });
    expect(layer.style.backgroundImage).toContain(backgroundUrl(ROOM.file, 'male'));
    expect(layer.style.backgroundImage).toContain('my_room_m.webp');
  });

  it('성별을 모르면 지금까지 쓰던 원본 그대로다', () => {
    render(<EndingBackdrop background={ROOM} visible fadeMs={600} />);

    const layer = screen.getByRole('img', { name: ROOM.note });
    expect(layer.style.backgroundImage).toContain('my_room.webp');
    expect(layer.style.backgroundImage).not.toContain('my_room_m.webp');
  });

  it('미리 받는 배경도 같은 성별 변형을 쓴다', () => {
    const requested = stubImage();

    render(
      <EndingBackdrop background={CAFE} nextBackground={ROOM} gender="male" visible fadeMs={600} />,
    );

    expect(requested).toEqual([backgroundUrl(ROOM.file, 'male')]);
  });
});
