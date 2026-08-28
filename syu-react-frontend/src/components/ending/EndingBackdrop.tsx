// src/components/ending/EndingBackdrop.tsx
// 엔딩 챕터 뒤에 깔리는 장면 레이어.
//
// 세 겹으로 쌓는다:
//   1) 검은 베이스  — 배경이 페이드되는 동안 밝은 앱 배경이 비치는 것을 막는다
//   2) 배경 이미지  — 시나리오 플레이의 배경 에셋. 약하게 흐리고 focusX로 크롭
//   3) 스크림       — 세로 그라데이션. 흰 텍스트의 가독성을 책임진다
//
// 스크림 농도는 가장 밝은 배경(my_room·classroom) 기준으로 잡았다. 배경마다
// 밝기 편차가 커서 어두운 배경(street_night)에 맞추면 밝은 배경에서 글자가
// 묻힌다. 반대 방향의 손해(어두운 배경이 더 어두워짐)가 훨씬 작다.
//
// 배경 URL은 **직접 조립하지 않는다.** 원고(endingScript)는 파일명만 들고 있고,
// 확장자(WebP 업스케일본)와 캐시 버스터는 시나리오 플레이와 같은 backgroundUrl이
// 붙인다 — 엔딩만 따로 조립하던 시절에는 그 둘을 통째로 놓쳐 원본 PNG를 캐시
// 버전 없이 받고 있었다(2026-08-18).

import { useEffect } from 'react';
import { backgroundUrl } from '../scenario/player/assetUrls';
import type { CharacterGender } from '../scenario/player/assetUrls';
import type { EndingBackground } from '../../constants/endingScript';

interface EndingBackdropProps {
  background: EndingBackground;
  /** 다음 챕터 배경 — 미리 받아 두어 전환 때 흰 화면이 뜨지 않게 한다 */
  nextBackground?: EndingBackground;
  /**
   * 유저 성별. 성별 변형이 있는 배경('내 방')을 시나리오 플레이와 같은 그림으로
   * 맞추기 위한 값이며, 없으면 원본이 나온다 — 캐릭터가 아직 로드되지 않았거나
   * 없는 상태에서 엔딩을 열어도 그림이 깨지지 않아야 한다.
   */
  gender?: CharacterGender;
  /** 페이드 상태. 상위 시퀀스의 visible을 그대로 받는다 */
  visible: boolean;
  fadeMs: number;
}

/**
 * 블러가 이미지 가장자리를 투명하게 번지게 하므로 살짝 확대해 가린다.
 * 확대율을 더 키우면 focusX로 고른 구간이 밀려나므로 최소값만 준다.
 */
const BLUR_SCALE = 1.06;
const BLUR_PX = 5;

export default function EndingBackdrop({
  background,
  nextBackground,
  gender,
  visible,
  fadeMs,
}: EndingBackdropProps) {
  const src = backgroundUrl(background.file, gender);
  const nextSrc = nextBackground ? backgroundUrl(nextBackground.file, gender) : undefined;

  // 배경 파일은 장당 450KB~820KB(WebP 실측)다. 8챕터를 한꺼번에 받게 하면
  // 엔딩 진입이 눈에 띄게 느려지므로, 바로 다음에 쓸 한 장만 미리 받는다.
  // 프리로드 URL은 아래 렌더 URL과 **같은 문자열**이어야 한다 — 캐시 버전이나
  // 확장자가 한 글자만 달라도 브라우저에게는 다른 파일이라 프리로드가 헛돈다.
  useEffect(() => {
    if (!nextSrc) return;
    const image = new Image();
    image.src = nextSrc;
  }, [nextSrc]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* 1) 검은 베이스 */}
      <div className="absolute inset-0 bg-scrim-black" />

      {/* 2) 배경 이미지 */}
      <div
        className="absolute inset-0 bg-cover transition-opacity ease-out"
        style={{
          backgroundImage: `url(${src})`,
          backgroundPosition: `${background.focusX}% center`,
          filter: `blur(${BLUR_PX}px)`,
          transform: `scale(${BLUR_SCALE})`,
          opacity: visible ? 1 : 0,
          transitionDuration: `${fadeMs}ms`,
        }}
        role="img"
        aria-label={background.note}
      />

      {/* 3) 스크림 */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(
            to bottom,
            var(--color-scrim-bg-70) 0%,
            var(--color-scrim-bg-50) 28%,
            var(--color-scrim-bg-50) 68%,
            var(--color-scrim-bg-75) 100%
          )`,
        }}
      />
    </div>
  );
}
