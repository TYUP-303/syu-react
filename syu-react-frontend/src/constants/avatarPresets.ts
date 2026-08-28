import { versionedAsset } from '../utils/assetVersion';

// src/constants/avatarPresets.ts
// 프로필 아바타 프리셋 목록 — users/{uid}.avatarId에 저장되는 id의 단일 출처.
//
// 구글 로그인 사용자는 구글 프로필 사진이 자동으로 붙지만 이메일 가입
// 사용자는 기본 아이콘 말고는 선택지가 없었다. 새 이미지를 만들지 않고
// public/ 아래 기존 자산만 재사용해 고른 목록이다.
//
// ⚠️ id는 Firestore에 그대로 들어간다. 값을 바꾸면 이미 저장된 사용자의
//    아바타가 "알 수 없는 프리셋"이 되어 조용히 기본 이미지로 떨어진다
//    (utils/avatar.ts의 폴백). 목록에서 빼는 것은 안전하지만 rename은 금지.
//
// ── 7종 모두 crop을 갖는 이유 ──
// 원화는 전부 **전신** 컷이다. 아바타 자리는 32~56px짜리 동그라미라
// 전신을 통째로(contain) 넣으면 얼굴이 몇 픽셀 되지 않아 누가 누구인지
// 구분되지 않는다. 요정 3종은 배경이 투명해 그나마 나았지만, 작은 원
// 안에 전신이 들어가 "잘 안 보인다"는 검수 피드백을 받았다.
// 그래서 7종 전부 얼굴을 원 중앙에 두고 얼굴+상체만 보이도록 잘라 쓴다.
//
// 크롭 값은 손으로 맞춘 숫자가 아니라 아래 frameCrop()이 계산한다. 각
// 프리셋이 선언하는 것은 **원본 픽셀 기준의 실측값**뿐이다:
//   1. width/height — 원본 캔버스 크기
//   2. centerX/centerY — 원 정중앙에 올 지점
//   3. window — 원 안에 담을 정사각형 한 변 (원본 px)
// 셋 다 PNG를 열어 자로 잴 수 있는 값이라, **에셋이 교체되면 다시 재서
// 이 숫자만 갈아 끼우면 된다** — 컴포넌트 쪽 튜닝은 없다.
//
// ⚠️ 2026-08-18 에셋 교체(백설이 치비화 + 요정 ver1)로 **7종 전부 다시
//    쟀다.** 옛 값이 깨진 방식이 서로 달랐다:
//      백설이 — 옛 원화는 등신이 높아 머리가 190px 남짓이었는데 치비는
//               431~485px이다. 옛 창(zoom 2.8 = 320px)이 머리보다 작아
//               **머리카락 꼭대기만** 보였다.
//      요정   — 콘텐츠가 캔버스 아래쪽(y=228~700)으로 정렬되면서, 옛 창이
//               가리키던 y≈190 언저리는 이제 **빈 공간**이다. 그대로 두면
//               타일이 투명하게 뜬다.
//    에셋을 갈 때는 반드시 여기부터 다시 잰다. 아래 각 프리셋 주석에 무엇을
//    어떻게 쟀는지(알파 bbox·눈 좌표)를 남겨 두었다.

export interface AvatarCrop {
  /** 컨테이너 폭 대비 이미지 폭 배율 (1 = 딱 맞음) */
  zoom: number;
  /** 컨테이너 크기 대비 좌·상단 오프셋 (%) */
  x: number;
  y: number;
}

export interface AvatarPreset {
  /** Firestore에 저장되는 값 */
  id: string;
  /** 선택 UI의 접근성 라벨 */
  label: string;
  /** public/ 기준 절대 경로 */
  src: string;
  /** 생략하면 원본을 통째로(contain) 보여 준다 */
  crop?: AvatarCrop;
}

/** frameCrop 입력 — 전부 **원본 이미지의 픽셀 좌표**다. */
interface FrameSpec {
  /** 원본 이미지 폭 (px). 창 크기를 zoom으로 옮길 때 쓴다. */
  width: number;
  /**
   * 원본 이미지 높이 (px). 계산에는 쓰이지 않지만 — 가로·세로 배율이 같아
   * width만으로 풀린다 — 어느 해상도를 재서 얻은 값인지 남기려고 받는다.
   * 에셋이 바뀌었는데 여기 숫자가 그대로면 다시 재야 한다는 신호가 된다.
   */
  height: number;
  /** 원 정중앙에 오게 할 지점 (원본 px) */
  centerX: number;
  centerY: number;
  /** 원 안에 담을 정사각형 한 변 (원본 px). 작을수록 가깝게 잘린다. */
  window: number;
}

/**
 * "원본의 (centerX, centerY)를 중심으로 window px 정사각형만 보여 준다"를
 * UserAvatar가 쓰는 zoom/x/y로 옮긴다.
 *
 * ── 렌더링 모델 (components/common/UserAvatar.tsx) ──
 * 컨테이너는 **정사각형**이고(w-8 h-8, w-14 h-14 …), 이미지는
 * `width: zoom*100%` + `left: x%` + `top: y%`로 절대 배치된다. CSS에서
 * left/top의 %는 컨테이너 폭/높이 기준이므로, 컨테이너 한 변을 1로 두면:
 *
 *   이미지 폭   = zoom
 *   이미지 높이 = zoom × (height / width)      ← 원본 종횡비
 *   원본 1px    = zoom / width                 ← 가로·세로 같은 배율
 *
 * 즉 원 안에 보이는 영역은 한 변이 `width / zoom` px인 **정사각형**이고,
 * 그것이 곧 window다. 남은 일은 그 창의 중심을 (centerX, centerY)에
 * 맞추는 평행이동뿐이라 아래 x/y 두 식이 나온다.
 *
 * ── window를 고르는 기준 ──
 * 7종의 프레이밍을 맞추는 잣대는 **머리(머리카락 꼭대기~턱)가 창에서
 * 차지하는 비율**이다. 원본 해상도도 등신 비율도 제각각이라 zoom을 그냥
 * 통일하면 오히려 어긋난다. 실측값과 채택 근거는 각 프리셋 주석에 있다.
 */
function frameCrop({ width, centerX, centerY, window }: FrameSpec): AvatarCrop {
  // zoom을 먼저 반올림해 확정한 뒤 x/y를 그 값으로 계산한다. 반올림 전
  // zoom으로 중심을 잡으면 실제 배치와 어긋나 창이 미세하게 밀린다.
  const zoom = Math.round((width / window) * 1000) / 1000;
  // `+ 0`은 -0을 0으로 되돌린다 (JS에서 Math.round(-0.1)은 -0이라 그대로
  // 두면 style 문자열과 테스트 비교에 "-0"이 새어 나온다).
  const round = (value: number) => Math.round(value * 10) / 10 + 0;

  return {
    zoom,
    x: round((0.5 - (centerX / width) * zoom) * 100),
    y: round((0.5 - (centerY / width) * zoom) * 100),
  };
}

/**
 * 백설이 전신 스프라이트 4종 공용 얼굴 크롭. (2026-08-18 치비 에셋 실측)
 *
 * 4종 모두 같은 구도·같은 캔버스로 그려져 값 한 벌을 공유한다. PIL로 잰
 * 알파 bbox와 얼굴 좌표는 아래와 같다 (896×1200 캔버스, 단위 px):
 *
 *              알파 bbox              머리 top   턱    머리 실루엣 중심 x
 *   여(f)   (170, 52, 725, 1181)        52      483          443
 *   남(m)   (180, 52, 716, 1181)        52      537          452
 *
 * - 머리카락 꼭대기 y=52는 남녀가 **정확히 같다**. 그래서 창 하나를
 *   공유해도 머리 위 여백이 갈리지 않는다.
 * - 머리 실루엣 폭도 남녀 모두 526px로 같아 가로 중심은 캔버스 중앙
 *   448(= 896/2)에 둔다. 안면 중심(여 416 · 남 448)에 맞추면 여자 쪽
 *   머리 덩어리가 오른쪽으로 쏠린다.
 * - centerY 295 = window/2라 창 위쪽이 캔버스 상단(y=0)에 딱 붙는다.
 *   머리 위 여백은 52/590 = 8.8 %.
 *
 * window 590의 근거 — 후보를 실제로 잘라 놓고 비교해 골랐다:
 *   470: 안면(이마~턱)이 원의 65 %가 되는 인물 사진 관례 값. 그런데 치비는
 *        머리의 절반이 머리카락이라 남자 머리가 창의 103 %가 되어 **들어가지도
 *        않고**, 여자도 머리카락 좌우가 잘려 나간다.
 *   520: 남자 머리 93 % — 정수리가 원에 닿아 눌려 보인다.
 *   590: 여자 머리 73 % · 남자 머리 82 %, 턱 아래로 목·옷깃까지 들어온다. ← 채택
 *   640: 머리 67~76 %. 32px 헤더에서 얼굴이 작아진다.
 * 그래서 "안면 60~75 %"라는 인물 사진 관례 대신 **머리 73~82 %**로 맞췄다.
 * 실제 안면 비율은 여 52 % · 남 33 %(앞머리가 이마를 덮어 낮다)다.
 *
 * components/CharacterGraphic.tsx의 crop='face'도 같은 그림을 같은 크기
 * 원에 넣으므로 이 값을 그대로 가져다 쓴다 (그래서 export한다).
 */
export const BAEKSUL_FACE: AvatarCrop = frameCrop({
  width: 896,
  height: 1200,
  centerX: 448,
  centerY: 295,
  window: 590,
});

export const AVATAR_PRESETS: readonly AvatarPreset[] = [
  // ── 요정 3종 — 전략 3종과 같은 자산(constants/strategy.ts의 STRATEGY_META)
  //
  // 2026-08-18 ver1 신규본(동물 마스코트)으로 교체되면서 **전부 다시 쟀다.**
  // 세 장이 같은 규격으로 정규화돼 있다 — 597×720 캔버스, 콘텐츠는 아래
  // 정렬(알파 bbox가 셋 다 y=228~700, 높이 472px, 하단 여백 20px):
  //
  //          알파 bbox                콘텐츠     눈 중심(좌·우)      얼굴 중심
  //   파랑이 (10, 228, 586, 700)     576×472   (212,356)(331,363)   (272, 375)
  //   노랑이 (79, 228, 518, 700)     439×472   (312,419) + 돋보기    (350, 430)
  //   초록이 (73, 228, 523, 700)     450×472   (228,417)(345,418)   (287, 417)
  //   (눈 위치는 어두운 덩어리 연결성분으로 잡은 값이다. 노랑이는 오른눈이
  //    돋보기에 가려 한쪽만 잡히므로 코·주둥이까지 보고 중심을 정했다.)
  //
  // **창은 셋 다 440px**로 통일했다. 캔버스가 같아졌으니 zoom도 1.357로 같다.
  //   360: 부엉이 정수리·여우 귀·토끼 귀가 원에 잘린다.
  //   440: 머리 전체 + 어깨/앞발까지 들어오고 지팡이·돋보기 같은 소품이
  //        가장자리에 걸린다. 56px에서 눈·표정이 읽힌다. ← 채택
  //   520: 전신에 가까워지며 얼굴이 작아진다.
  //
  // **전신 프레이밍은 채택하지 않았다.** 콘텐츠(472px)를 통째로 담으려면
  // 창이 500px 안팎이어야 하는데, 그러면 같은 그리드에 나란히 서는 백설이
  // 타일(머리가 원의 73~82%)보다 확연히 멀어 보여 7칸의 크기가 들쭉날쭉해진다.
  // 얼굴을 키운 지금 값이 백설이 쪽 스케일과 맞는다.
  {
    id: 'fairy-ako',
    label: '아코 (수용 요정)',
    src: versionedAsset('/scenario/fairies/파랑이.png'),
    // 부엉이. 얼굴 중심은 두 눈 사이(272) — 콘텐츠 중심(298)보다 왼쪽이다.
    // 왼쪽 별 지팡이와 오른쪽 날개가 창 밖으로 조금씩 밀려난다.
    crop: frameCrop({ width: 597, height: 720, centerX: 272, centerY: 375, window: 440 }),
  },
  {
    id: 'fairy-poko',
    label: '포코 (재평가 요정)',
    src: versionedAsset('/scenario/fairies/노랑이.png'),
    // 여우. 얼굴(눈 312)과 오른쪽 돋보기(452)가 함께 무게를 이뤄 중심을
    // 그 사이 350에 둔다. 얼굴에만 맞추면 돋보기가 잘려 나간다.
    crop: frameCrop({ width: 597, height: 720, centerX: 350, centerY: 430, window: 440 }),
  },
  {
    id: 'fairy-leaf',
    label: '리프 (재초점 요정)',
    src: versionedAsset('/scenario/fairies/초록이.png'),
    // 토끼. centerY 417은 머리 꼭대기 새싹(y=228)이 원 위쪽에 걸치고
    // 늘어진 귀 끝이 아래로 빠지지 않는 지점이다.
    crop: frameCrop({ width: 597, height: 720, centerX: 287, centerY: 417, window: 440 }),
  },

  // 내 캐릭터(백설이) — 시나리오에서 유저 성별에 맞춰 등장하는 그 캐릭터.
  // id의 mate- 접두사는 Firestore에 이미 저장된 값이라 그대로 둔다 (위 rename 금지).
  //
  // ⚠️ 2026-08-18 현재 `_happy`는 `_default`와 **바이트까지 같은 파일**이다
  //    (md5 여 3dc2b9359675 / 남 cee8c9606eba가 default·happy 공통). 표정
  //    시트가 아직 안 와서 자리만 채워 둔 상태라, 선택 모달에 똑같은 그림이
  //    두 번 뜬다. 표정 에셋이 오면 파일만 갈면 되고 크롭은 그대로 쓴다
  //    (같은 캔버스·같은 구도로 그려지는 시트라서).
  {
    id: 'mate-female',
    label: '여자 캐릭터',
    src: versionedAsset('/scenario/characters/baeksul_f_default.png'),
    crop: BAEKSUL_FACE,
  },
  {
    id: 'mate-female-smile',
    label: '여자 캐릭터 (미소)',
    src: versionedAsset('/scenario/characters/baeksul_f_happy.png'),
    crop: BAEKSUL_FACE,
  },
  {
    id: 'mate-male',
    label: '남자 캐릭터',
    src: versionedAsset('/scenario/characters/baeksul_m_default.png'),
    crop: BAEKSUL_FACE,
  },
  {
    id: 'mate-male-smile',
    label: '남자 캐릭터 (미소)',
    src: versionedAsset('/scenario/characters/baeksul_m_happy.png'),
    crop: BAEKSUL_FACE,
  },
];

/** 알 수 없는 id(목록에서 빠진 프리셋 등)는 null — 호출부가 다음 순위로 넘어간다. */
export function getAvatarPreset(id: string | null | undefined): AvatarPreset | null {
  if (!id) return null;
  return AVATAR_PRESETS.find((preset) => preset.id === id) ?? null;
}
