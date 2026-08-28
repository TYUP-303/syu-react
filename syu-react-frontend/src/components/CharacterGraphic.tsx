import { BAEKSUL_FACE } from '../constants/avatarPresets';
import { versionedAsset } from '../utils/assetVersion';

interface CharacterGraphicProps {
  type: 'silhouette' | 'male' | 'female';
  /**
   * 한 변의 길이. 숫자는 px로 해석되고, 문자열은 CSS 길이를 그대로 넘긴다
   * (예: `"var(--home-char)"`, `"clamp(96px,20dvh,150px)"`).
   * 짧은 화면에서 일러스트를 줄여야 하는 화면이 있어 문자열을 받는다 —
   * 인라인 style로 들어가므로 className으로는 덮어쓸 수 없다.
   */
  size?: number | string;
  className?: string;
  /**
   * 둥실 떠오르는 부유(float)와 링 호흡을 켤지. 기본값은 켬(기존 동작).
   *
   * 홈 상단 CTA 카드처럼 **50px 안팎의 작은 얼굴 원**으로 쓰는 자리에서는
   * 꺼야 한다 — 부유 진폭이 8px이라 52px 원에서는 자기 지름의 15%를
   * 오르내리는 셈이라 카드 안에서 덜컹거린다. 큰 일러스트(130~160px)에서는
   * 같은 8px이 5% 안팎이라 '살아 있음'으로 읽힌다.
   */
  animated?: boolean;
  /**
   * 프레이밍(크롭).
   *
   * - `'default'` — 기존 동작. 전신 스프라이트의 위쪽을 넓게 담는다.
   * - `'face'` — 얼굴 중심 확대 크롭. **50px 안팎의 아바타 전용**이다.
   *
   * ⚠️ **임시 조치다.** 지금 쓰는 소스는 `baeksul_*_default.png` 하나뿐인
   * 896×1200 전신 스프라이트라, 얼굴 아바타는 그 이미지를 확대해 잘라내는
   * 수밖에 없다. 확대 크롭이므로 원본 해상도 이상으로 선명해지지 않는다 —
   * **얼굴 전용 에셋이 나오면 이 크롭 대신 그 에셋을 물려야 한다**
   * (`docs/next-steps.md`에 등록된 항목).
   *
   * 크롭을 prop으로 가른 이유: 캐릭터 생성 화면(130px)처럼 전신에 가까운
   * 그림이 필요한 자리가 이미 있고, 그쪽 프레이밍을 건드리면 안 되기
   * 때문이다. 기본값이 기존 동작이므로 호출부는 그대로 둬도 된다.
   *
   * **크롭은 프레이밍만이 아니라 링 유무도 가른다** — `'face'`는 원을 두르는
   * 테두리를 그리지 않는다. 아래 링 렌더 지점의 주석 참조.
   */
  crop?: 'default' | 'face';
}

export default function CharacterGraphic({
  type,
  size = 160,
  className = '',
  animated = true,
  crop = 'default',
}: CharacterGraphicProps) {
  const containerStyle = {
    width: size,
    height: size,
  };

  const floatClass = animated ? 'graphic-float' : '';
  const ringClass = animated ? 'graphic-ring' : 'opacity-50';
  const isFaceCrop = crop === 'face';

  /* ── 링은 `crop='default'`에서만 그린다 (2026-08-14 사용자 지시) ──
     얼굴 크롭은 홈 CTA 카드의 52px 아바타 전용이고, 그 카드는 진한 파랑
     (primary) 면이다. 거기서 성별 코어 색 링은 남 #0c68ce가 카드색 대비
     1.32:1, 여 #0a56ae는 카드색과 **같은 값**이라 사실상 보이지 않는다 —
     보이지도 않는 선이 성별을 구분한다는 전제만 코드에 남아 있던 셈이다.

     원의 윤곽은 링이 아니라 밝은 얼굴 판(surface-container, 카드 대비
     5.65:1)이 이미 그리고 있으므로 링 없이 형태가 읽힌다.

     실루엣의 점선 링도 같이 걷어낸다. 그 선은 "아직 정해지지 않음"을 뜻했지만
     크롭 안의 물음표 도형이 같은 말을 더 분명히 하고 있고, 사진 두 종의 링이
     사라진 뒤 실루엣만 테두리를 두르면 화자가 바뀔 때 원의 무게가 달라진다
     (원래 이 자리에 링을 넣은 이유가 '사진과 같은 형태'였다).

     `crop='default'`(캐릭터 생성 화면 등)의 링과 호흡 애니메이션은 그대로다. */

  /* ── 얼굴 크롭 (crop='face') ──
     **튜닝 값을 여기서 갖지 않는다.** 이 자리에 들어가는 그림
     (`baeksul_[mf]_default.png`)은 아바타 프리셋 `mate-male`/`mate-female`과
     같은 파일이고 담기는 그릇도 같은 정사각 원이라, 크롭이 갈리면 홈 CTA
     카드의 얼굴과 헤더 프로필 사진이 서로 다른 구도로 나온다. 그래서
     constants/avatarPresets.ts가 실측해 둔 BAEKSUL_FACE를 그대로 쓴다 —
     에셋을 갈 때 재는 곳이 한 군데로 남는다.

     배치식은 UserAvatar와 같다: 이미지 폭을 컨테이너의 zoom배로 두고
     left/top(%)으로 민다. 컨테이너가 정사각형이어야 성립하는데 이 컴포넌트는
     size 하나로 width=height를 잡으므로 조건을 만족한다.
     `max-w-none`이 없으면 preflight의 `img{max-width:100%}`가 폭을 100%로
     되돌려 확대가 통째로 사라진다.

     2026-08-18 치비 에셋 교체 전 값은 `top-[-6%] w-[330%]`(창 272px)였는데,
     치비는 머리만 431~485px이라 창보다 커서 **머리카락 꼭대기만** 보였다. */
  const faceImgStyle = {
    width: `${BAEKSUL_FACE.zoom * 100}%`,
    left: `${BAEKSUL_FACE.x}%`,
    top: `${BAEKSUL_FACE.y}%`,
  };

  /* ── 기본 프레이밍 (crop='default') — 캐릭터 생성 완료 모달의 130px 원 ──
     `w-[140%]`는 preflight의 `img{max-width:100%}`에 눌려 실제로는 폭 100%로
     그려지고, 남는 것은 `h-[140%] object-cover object-top` + 15% 내림이다.
     결과적으로 원에 담기는 세로는 소스 y≈0~846(전신의 71%)이다.

     치비 교체 후 다시 재 보니 이 값이 그대로 맞는다 — 머리(52~483·52~537)가
     원의 51~57%를 차지하고 턱 아래로 상의·바지 윗단까지 들어와, 완성 모달이
     노리는 "내 캐릭터를 보여 주는" 반신 구도가 된다. 얼굴 원(52px)과 달리
     여기는 얼굴만 볼 자리가 아니므로 크롭을 공유하지 않는다. */
  const defaultImgClass = 'w-[140%] h-[140%] object-cover object-top translate-y-[15%]';

  /* 실루엣의 '그림 본체'. 프레이밍(전체 / 얼굴 크롭)에 따라 감싸는 SVG의
     viewBox만 달라지고 도형 자체는 같으므로 한 곳에서 정의한다. */
  const silhouetteFigure = (
    <>
      {/* 캐릭터 실루엣 바디 */}
      <path
        d="M50 165 C50 145, 60 130, 80 125 C75 120, 70 110, 70 95 C70 70, 80 60, 100 60 C120 60, 130 70, 130 95 C130 110, 125 120, 120 125 C140 130, 150 145, 150 165"
        fill="var(--color-surface-container-highest)"
        stroke="var(--color-outline-variant)"
        strokeWidth="3"
      />
      {/* 중앙 물음표 아이콘 */}
      <circle cx="100" cy="95" r="22" fill="var(--color-surface-container)" stroke="var(--color-outline)" strokeWidth="1.5" />
      <path
        d="M96 90 C96 85, 104 85, 104 90 C104 94, 100 95, 100 99 M100 104 V105"
        stroke="var(--color-on-surface)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </>
  );

  return (
    <div className={`relative flex items-center justify-center select-none ${className}`} style={containerStyle}>
      {/* ── CSS 애니메이션 주입 ── */}
      <style>{`
        @keyframes floatAnim {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
          100% { transform: translateY(0px); }
        }
        /* 글로우(drop-shadow) 펄스는 빛번짐이 심해 제거 — Serene Azure의
           "그림자·글로우 없음" 원칙에 맞춰, 성별 코어 색 얇은 링이
           잔잔히 호흡(opacity)하는 방식으로 생동감만 남긴다. */
        @keyframes ringBreath {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.7; }
        }
        .graphic-float {
          animation: floatAnim 4s ease-in-out infinite;
        }
        .graphic-ring {
          animation: ringBreath 3s ease-in-out infinite;
        }
      `}</style>

      {/* ── Silhouette (미생성 상태) — 기본 프레이밍 ── */}
      {type === 'silhouette' && !isFaceCrop && (
        <svg
          viewBox="0 0 200 200"
          className={`w-full h-full ${floatClass}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* 외곽 회전 점선 링 */}
          <circle
            cx="100"
            cy="100"
            r="85"
            stroke="var(--color-outline-variant)"
            strokeWidth="2"
            strokeDasharray="6 6"
            className="opacity-60"
          />
          {/* 소프트 은은한 내부 글로우 */}
          <circle
            cx="100"
            cy="100"
            r="70"
            fill="url(#silhouette-bg-grad)"
            className="opacity-20"
          />
          {silhouetteFigure}
          {/* 그라데이션 정의 */}
          <defs>
            <radialGradient id="silhouette-bg-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--color-outline)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>
        </svg>
      )}

      {/* ── Silhouette — 얼굴 크롭 ──
          사진 두 종과 **같은 형태**로 그린다(원 + 링). 카드 안에서 화자만
          바뀌는 자리라, 실루엣일 때만 테두리 없는 그림이 뜨면 정렬이 흐트러진다.

          다만 **확대 폭은 사진과 다르다.** 사진은 전신 스프라이트를 창
          590px으로 당겨야 얼굴이 보이지만, 이 실루엣은 이미 흉상 구도다
          (머리 y=60~125, 어깨까지 y=165). 같은 배율로 당기면 머리 덩어리가
          창을 다 채워 사람으로 읽히지 않는다. 맞출 것은 배율이 아니라
          **비율**이라, 사진 쪽 프레이밍을 두 수치로 옮긴다:

            · 머리가 원 높이의 78 % (사진 실측: 여 73 % · 남 82 %의 중간)
              → viewBox 한 변 = 머리 65 / 0.78 = 83.3
            · 머리 위 여백이 원 높이의 8.8 % (사진: 52/590)
              → viewBox top = 60 − 83.3 × 0.088 = 52.7
            · 가로는 머리 중심 x=100을 창 중앙에 → left = 100 − 83.3/2 = 58.4

          바닥은 52.7+83.3 = 136이라 턱(125) 아래 어깨 윗단까지 들어온다.
          치비 교체 전에는 사진이 훨씬 덜 당겨져 있어 118×118(머리 55 %)이었다.

          바깥 점선 링(r=85)은 이 창 밖이라 그려지지 않는다. 한때 컨테이너에
          점선 테두리를 둘러 "아직 정해지지 않음"을 이어 받게 했지만, 크롭 안에
          남는 물음표 도형이 이미 그 말을 하고 있어 걷어냈다(위 링 주석 참조). */}
      {type === 'silhouette' && isFaceCrop && (
        <div className={`relative w-full h-full ${floatClass}`}>
          <div className="absolute inset-0 rounded-full overflow-hidden bg-surface-container-low">
            <svg
              viewBox="58.4 52.7 83.3 83.3"
              className="w-full h-full"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {silhouetteFigure}
            </svg>
          </div>
        </div>
      )}

      {/* ── Male Character ── */}
      {type === 'male' && (
        <div className={`relative w-full h-full ${floatClass}`}>
          <div className="absolute inset-0 rounded-full overflow-hidden bg-surface-container flex items-center justify-center">
            <img
              src={versionedAsset('/scenario/characters/baeksul_m_default.png')}
              alt="남자 캐릭터"
              className={isFaceCrop ? 'absolute max-w-none' : defaultImgClass}
              style={isFaceCrop ? faceImgStyle : undefined}
            />
          </div>
          {!isFaceCrop && (
            <div
              aria-hidden
              className={`${ringClass} absolute inset-0 rounded-full border-2 pointer-events-none`}
              style={{ borderColor: 'var(--color-char-core-male)' }}
            />
          )}
        </div>
      )}

      {/* ── Female Character ── */}
      {type === 'female' && (
        <div className={`relative w-full h-full ${floatClass}`}>
          <div className="absolute inset-0 rounded-full overflow-hidden bg-surface-container flex items-center justify-center">
            <img
              src={versionedAsset('/scenario/characters/baeksul_f_default.png')}
              alt="여자 캐릭터"
              className={isFaceCrop ? 'absolute max-w-none' : defaultImgClass}
              style={isFaceCrop ? faceImgStyle : undefined}
            />
          </div>
          {!isFaceCrop && (
            <div
              aria-hidden
              className={`${ringClass} absolute inset-0 rounded-full border-2 pointer-events-none`}
              style={{ borderColor: 'var(--color-char-core-female)' }}
            />
          )}
        </div>
      )}
    </div>
  );
}
