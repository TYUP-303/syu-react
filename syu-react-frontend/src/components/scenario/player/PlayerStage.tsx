// src/components/scenario/player/PlayerStage.tsx
// 플레이어의 무대 — 배경 · 스크림 · 배역을 **프레임 전체** 기준으로 그린다.
//
// ── 왜 풀블리드인가 (2026-08-13 재설계 제안서 §1 P1·P2) ────────────────
//
// 예전 구조는 [상단 바 h-16 · 스테이지 flex-1 · 하단 패널(내용 고정 높이)]
// 3단 분할이었다. 배경만 프레임 전체였고 인물·요정은 가운데 스테이지 박스
// 안에 갇혀 있었다. 그래서 하단 패널이 커질수록 인물이 작아졌고("전략 선택
// 후 요정이 48px 배지"), 낮은 화면에서는 스테이지만 압축돼 그림이 잘렸다.
// 하나의 고정값이 두 방향의 지적을 동시에 만든 셈이다.
//
// 이 파일은 그 모델을 버린다. 배경·인물·요정 모두 **프레임(430 × 100dvh)**을
// 기준으로 서고, 시트는 그 위에 얹힌다. 시트가 인물의 하반신을 가리는 것은
// 잘림이 아니라 비주얼 노벨의 장르 관습이다.
//
// ── 크기 규칙 (SceneStage의 STAGE_SIZING 교훈 계승) ───────────────────
//
//  1. vh를 쓰지 않는다. 모든 높이는 **부모 상자 기준 %** + px 상한(max-h)이다.
//     뷰포트 단위는 프레임(MobileWrapper, max-w 430px · h-[100dvh]) 안에서
//     의미가 어긋난다.
//  2. 배역은 object-contain + object-bottom + min-w-0이다. 그림 비율이 어떻게
//     확정되든 코드 수정 없이 갈아 끼운다(요정 에셋은 2026-08-18 교체 완료).
//  3. 배역은 프레임 바닥이 아니라 **지면선**(GROUND_INSET) 위에 선다. 바닥에
//     붙이면 2인 씬처럼 그림이 작아지는 경우 시트가 인물을 통째로 덮는다.
//
// ── 실측 근거 (2026-08-18 재측정) ────────────────────────────────────
//
// 인물 원본은 896×1200(가로/세로 0.747)이고, **알파 기준 그림 높이가 1129px로
// 29장 전부 같다** — 캔버스의 94.1%다(위 52px · 아래 19px만 투명). 요정은
// 597×720 캔버스에 그림 높이 472px(캔버스의 65.6%)로 3종이 같다
// (FAIRY_IMG_BASE 주석 참조). 그림 **폭**은 배역마다 다르다 — 캔버스 대비
// 58.7%(baeksul_m_suit_sad)에서 83.6%(colleague_default)까지이고 좌우 중심은
// 캔버스 중앙에서 ±0.5px 안이다.
//
// scenario_visual.csv 480개 씬(120회차 × 4씬, 빈 씬 0)의 등장 인원과 슬롯은
// 아래와 같다. 셋 다 실제로 나타나므로 "1인은 언제나 가운데"가 아니다.
//
//   1인 345 — 슬롯 1(가운데) 316 · 슬롯 0(왼쪽) 29
//   2인 135 — 전부 슬롯 0+2(양옆)
//   3인   0 — 슬롯은 파서에 있고 콘텐츠에는 없다
//
// 슬롯 0에 혼자 선 29씬이 가운데 1인 씬과 똑같이 보이는 것은 빈 슬롯을 그리지
// 않기 때문이다(칸이 flex-1이라 남은 한 명이 행 전체를 차지한다). 즉 **화면상
// 구분되는 배치는 "1인 345 · 2인 135" 두 가지**다.
//
// ── 배역 높이는 인원수와 무관하게 하나다 (2026-08-18) ────────────────
//
// 예전에는 슬롯 1을 h-[66%], 양옆을 h-[58%]로 두고 <img>를 flex 아이템으로
// 그대로 세웠다. 그래서 2인 씬이 1인 씬보다 **두 번** 작아졌다.
//   ① 슬롯 규칙상 2인은 늘 양옆이라 시작부터 66% → 58%.
//   ② 자연 폭 0.747×높이가 둘이면 (430-8)/2를 넘겨 flex-shrink가 걸리는데,
//      object-contain이라 폭이 눌린 만큼 **그려지는 높이까지 따라 줄었다**.
//      실측(프레임 800px): 1인 464px vs 2인 266px — 43% 축소.
//
// 지금은 배역마다 **같은 너비의 칸(flex-1)**을 주고, 그 칸 안에서 스프라이트를
// 높이로만 세운다(w-auto · max-w-none · absolute). 폭 제약이 사라지므로 높이는
// 인원수와 무관하게 늘 CHAR_HEIGHT다. 칸보다 넓어진 만큼은 옆 칸으로 삐져나간다.
// 3인 씬이 콘텐츠에 생기더라도 같은 규칙이 그대로 적용된다(높이 유지, 칸만 좁아짐).
//
// ⚠️ "에셋 좌우가 통째로 투명해서 2인이 55px 떨어져 선다"는 예전 주석은 실사
// 에셋 시절의 값이고 **치비 에셋에는 맞지 않는다**. 그림 폭이 캔버스의 59~84%라
// 2인 씬에서는 넓은 조연(colleague 0.836)과 짝지을 때 그림 경계상자가 겹친다.
// h-[66%] 시절 390×844 프레임에서 83px 겹쳤고, 아래 축소 후에는 27px이다
// (좁은 프레임 320×568~375×667에서는 7~10px 떨어진다). 팔·소품이 스치는 정도라
// 2인 구도로는 오히려 자연스러워서 칸 구조는 그대로 두되, 값을 만질 때는 이
// 겹침이 함께 움직인다는 것을 기억할 것.
//
// ── 치비 전환 후 축소 (2026-08-18 실플레이 지적) ─────────────────────
//
// 치비 에셋은 그림이 캔버스의 94%를 채운다(실사 시절은 그보다 여백이 컸다).
// 거기에 같은 날 지면선 상향 + 인원 무관 높이 통일이 겹치면서 2인 씬이 무대를
// 통째로 메웠다 — h-[66%]에서 그림 높이가 **상단 바와 시트 사이 가시 무대의
// 71~113%**였다(짧은 프레임에서는 아예 넘쳤다). 8/17 에셋 리포트의 "치비 채택
// 시 콘텐츠 높이 75~80% 축소" 권고에 맞춰 **렌더에서만** 0.78배로 줄인다
// (에셋은 그대로다 — 원본을 건드리면 요정·아바타 등 플레이어 밖까지 번진다).
//
//   66% → 52% (0.788배) · max-h 500px → 400px (0.80배)
//
// 축소 후 가시 무대 점유율은 57~89%, 상단 바 여유는 20px→89px(320×568 기준)로
// 늘고, 지면선·시트는 손대지 않았으므로 발밑 관계는 그대로다. 프레임별 수치는
// PlayerStage.test.tsx의 "가시 무대를 다 채우지 않는다" 계약이 계산으로 지킨다.
//
// ── 배역은 시트 위로 올라선다 (2026-08-18 UAT 후속) ───────────────────
//
// 지면선이 12%(800px 프레임에서 96px)일 때 대사 시트 상단은 약 200px이라,
// 인물의 무릎 아래가 통째로 시트에 잠겼다. 하반신이 조금 가려지는 것은 장르
// 관습이지만 "대사 박스 위로 캐릭터가 보여야" 한다는 지적은 그 정도를 넘었다는
// 뜻이다. 그래서 지면선을 **시트 위로 끌어올리되 상한을 건다**.
//
//   지면선 = 12% + min(120px, 15%)
//
// ① 왜 실측(ResizeObserver)이 아니라 고정값인가
//    시트 높이를 재서 그만큼 올리는 방식(ref → ResizeObserver → prop)도 가능하다.
//    쓰지 않은 이유는 셋이다.
//      - 대사 시트는 **이미 높이가 고정돼 있다**. DialogueContent가 5줄(120px)을
//        예약해 두었고, 그 예약의 목적 자체가 "씬마다 시트가 들썩이는" 것을
//        막는 것이었다. 실측으로 배역을 따라 움직이게 하면 한 층 아래에서 없앤
//        들썩임을 배역 쪽으로 되살리는 셈이다.
//      - 실제로 갈라지는 구간(5줄을 넘겨 시트가 자라는 회차, 원고의 약 10%)에서는
//        **어차피 cap이 걸린다**. 즉 실측이 고정값과 달라지는 바로 그 지점에서
//        두 방식의 결과가 같아지므로, 얻는 것 없이 관측 코드와 리렌더만 늘어난다.
//      - 배역의 자리가 시트의 내용에 종속되지 않는다. 무대는 무대 기준으로만 선다.
//
//    ⚠️ 2026-08-27에 **요정만** 이 결론에서 빠져나갔다(ANGEL_ROW_FLOOR 참조).
//    위 세 논거는 전부 "대사 시트는 높이가 고정돼 있다"에 기대고 있는데, 요정
//    단계의 시트는 조언 길이와 프레임 높이에 따라 실제로 자라기 때문이다.
//    배역(CAST_GROUND)은 그대로다 — 인물의 하반신이 잠기는 것은 장르 관습이다.
//
// ② 120px은 어디서 나왔나
//    SITUATION 시트의 실제 높이 ≈ 200px이다 (바깥 pb-5 20 + 테두리 2 + 카드
//    pt-4/pb-3.5 30 + 본문 예약 122 + 진행 힌트 26). 지면선이 이미 12%를 들고
//    있으므로 남는 몫은 200 − 0.12H다 — 800px 프레임에서 104px, 844px에서 99px,
//    932px에서 88px. 120px은 그 구간을 모두 덮고 16~32px의 여유까지 남긴다.
//
// ③ 15% cap은 어디서 나왔나
//    올릴수록 머리끝이 상단 바(PlayerTopBar ≈ 70px)로 다가간다. 배역 머리끝은
//    프레임 바닥에서 `12% + lift + 58.08%`이므로 여유는 `29.92%·H − 70`이고,
//    가장 빡빡한 600px 프레임에서 109px이다. cap 15%는 그 프레임에서 90px만
//    올려 19px을 남긴다. 800px 이상에서는 120px 쪽이 작아 cap이 놀고, 그보다
//    짧은 프레임에서만 작동한다 — "세로로 짧은 화면에서 프레임을 뚫지 않게"가
//    이 값의 전부다. 짧은 프레임에서 발끝이 조금 잠기는 것은 감수한 결과다.
//
// ── 배역은 씬이 넘어가도 같은 노드로 남는다 (2026-08-27 R2-04) ───────────
//
// 2차 UAT 지적: "씬 넘어갈 때 같은 캐릭터가 유지되는 상황임에도 클릭하는 순간
// 캐릭터가 순간적으로 없어졌다가 다시 나타난다."
//
// 원인은 이 파일의 React key였다. 예전 값 `${slot}-${charName}`은 표정 토큰과
// 슬롯 번호를 둘 다 물고 있어서, 같은 인물이 이어져도 둘 중 하나만 달라지면
// key가 바뀌고 <img>가 언마운트 → 마운트됐다. scenario_visual.csv 480씬을
// 실측하면 같은 인물이 이어지는 전환 377건 중 258건(68.4%)이 그렇게
// 리마운트되고, 그중 172건은 화면상 자리까지 그대로다 — 눈에는 "가만히 서
// 있어야 할 사람"이 지워졌다 다시 그려지는 것으로 보인다.
//
// 왜 리마운트가 공백을 만드는가 (2026-08-27 브라우저 실측):
//   · 새로 만든 <img>는 트리에 들어가는 순간 그림이 하나도 붙어 있지 않다
//     (naturalWidth 0). 그 순간 파일이 메모리 캐시에 있으면 같은 프레임에
//     채워지지만, 없으면 그 프레임은 빈 그림이다. 즉 "안 깜빡임"이 캐시 적중에
//     걸려 있는 **레이스**였다.
//   · 노드를 유지한 채 src만 갈면 옛 그림의 naturalWidth(896)가 그대로 남는다.
//     <img>는 새 그림이 완전히 준비되기 전까지 옛 그림을 계속 그리도록 명세가
//     정해 두었기 때문이다(current request / pending request). 공백 프레임이
//     구조적으로 생길 수 없다.
//
// 그래서 key를 **인물 단위**(StagedSprite.identity)로 바꿨다. 표정·의상·슬롯이
// 바뀌어도 같은 노드가 살아남고, 새 인물이 들어올 때만 마운트되며 그때만
// 등장 페이드(SPRITE_ENTRANCE)가 돈다.
//
// 배경은 이 메커니즘이 없다 — CSS background-image는 준비 안 된 URL로 바뀌면
// 그 프레임이 그냥 빈다. 그쪽은 두 장을 겹쳐 크로스페이드한다(BG_FADE_MS 절).
//
// 요정·평가·완료 단계(전략 적용 이후)도 같은 CastLayer를 쓰므로 규칙이 하나다.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SceneData } from '../../../api/scenarioMockData';
import { usePrefersReducedMotion } from '../../../hooks/usePrefersReducedMotion';
import { STRATEGY_KEYS, STRATEGY_META, type StrategyKey } from '../../../constants/strategy';
import {
  backgroundUrl,
  fairyUrl,
  resolveSceneCast,
  resolveSprite,
  type CharacterGender,
} from './assetUrls';
import type { PlayStep } from './useEpisodePlayer';
import { COPY } from '../../../constants/copy';

/**
 * 배역 층의 **높이**. 예전에는 위쪽 `top-0`과 아래쪽 지면선(12%) 한 쌍이 위치와
 * 높이를 동시에 정했다. 그 구조에서는 지면선을 올리는 순간 층이 그만큼 얇아지고,
 * 층을 기준(%)으로 서는 배역(CHAR_HEIGHT)까지 함께 작아진다 — 이 파일이 통째로
 * 없애려던 바로 그 회귀다. 그래서 높이를 따로 못박아 **지면선과 분리**한다.
 * 88%는 예전 조합(100% − 12%)과 같은 값이므로 배역 크기는 그대로다.
 */
const CAST_LAYER_HEIGHT = 'h-[88%]';

/**
 * 배역이 서는 지면선 — 프레임 바닥에서 이만큼 위. `바닥값 + min(lift, cap)`이며
 * 세 숫자의 근거는 파일 머리의 "배역은 시트 위로 올라선다" 절에 있다.
 *
 *   · 12%   바닥값. 시트가 없어도 인물이 프레임 바닥에 박히지 않게 한다.
 *   · 120px 시트를 넘어서기 위해 더 올리는 양(대표 시트 높이 ≈ 200px에서 역산).
 *   · 15%   그 lift의 상한. 짧은 프레임에서 머리가 상단 바를 뚫지 못하게 막는다.
 *
 * ⚠️ Tailwind는 클래스 문자열을 **정적으로** 훑는다. 위 숫자들을 상수로 쪼개
 * 템플릿으로 조립하면 CSS가 아예 생성되지 않으므로 한 줄 리터럴로 둔다.
 * `_`는 Tailwind가 공백으로 되돌린다(calc의 `+`는 양옆 공백이 필수다).
 */
const CAST_GROUND = 'bottom-[calc(12%_+_min(120px,15%))]';

/**
 * 배역 공통 높이. **슬롯·인원수와 무관하게 하나**다 — 값을 나누면 곧바로
 * "2명일 때만 작다"로 돌아온다 (위 실측 근거 참조).
 *
 * 치비 전환 뒤 0.78배로 줄였다(66%·500px → 52%·400px). 근거와 프레임별 수치는
 * 파일 머리의 "치비 전환 후 축소" 절에 있다. 이 값을 만지면 **COMPANION_FAIRY도
 * 같은 비율로** 움직여야 한다 — 둘의 관계는 계약 테스트가 잡는다.
 */
const CHAR_HEIGHT = 'h-[52%] max-h-[400px]';

/**
 * 자기 칸 안에서 높이로만 서는 스프라이트. `w-auto max-w-none`이 폭 제약을 걷어내
 * flex-shrink가 높이를 갉아먹지 못하게 한다. `bottom-0`은 **칸의 바닥**에 붙이는
 * 것이고, 그 바닥이 곧 지면선이다 — 지면선의 실제 위치는 층(CAST_GROUND)이 정한다.
 */
const SPRITE_BASE =
  'absolute bottom-0 left-1/2 -translate-x-1/2 w-auto max-w-none pointer-events-none';

/**
 * 배역의 **등장** 모션 (2026-08-27 R2-04).
 *
 * `animate-fadeIn`은 `animation: … both`라 **마운트될 때 한 번만** 재생되고
 * 그 뒤로는 다시 돌지 않는다. 배역 <img>가 인물 단위 key로 살아남게 된 지금,
 * 이 성질이 곧 "빈 자리에 새로 들어온 인물만 페이드인, 이어지는 인물은 그대로"가
 * 된다 — 별도의 상태 없이 마운트 시점이 조건을 대신한다. 이어지는 인물은
 * 애초에 언마운트되지 않으므로 재생될 계기가 없다.
 *
 * prefers-reduced-motion에서는 index.css가 이 클래스를 전역으로 끈다.
 */
const SPRITE_ENTRANCE = 'animate-fadeIn';

/**
 * 좌우 반전 — 두 인물이 서로 마주 보게 한다. 누구를 뒤집을지는 무대가 아니라
 * assetUrls의 `resolveSceneCast`가 **에셋의 고유 방향 + 자리**로 정한다
 * (실측 결과 지금 배역은 전부 정면이라, 같은 그림이 둘 설 때 오른쪽만 뒤집힌다).
 */
const SPRITE_MIRRORED = '-scale-x-100';

/**
 * 하단 시트가 **자기 높이를 무대에 알려 오는** CSS 변수. 값을 쓰는 쪽은 여기이고
 * 재서 넣는 쪽은 VisualNovelPlayer다 (프레임 루트에 px으로 건다).
 *
 * 폴백이 0px인 것이 중요하다. 무대만 따로 세우는 테스트, 그리고 요정이 아예 없는
 * 에필로그 플레이어에는 이 변수가 없으므로 아래 floor들이 전부 **예전 고정값**
 * 으로 떨어진다 — 즉 변수가 없는 자리에서는 이 수정이 아무것도 바꾸지 않는다.
 */
const SHEET_HEIGHT = 'var(--player-sheet-h, 0px)';

/**
 * 요정 상자 밑변과 시트 윗변 사이에 남기는 틈. 요정 그림은 캔버스 아래쪽 2.8%가
 * 투명하므로(FAIRY_CANVAS 실측) 실제로 보이는 발끝은 여기서 3~4px 더 뜬다.
 */
const FAIRY_SHEET_GAP = '10px';

/**
 * 전략 선택 이후 동행하는 요정. 주인공 옆에 서는 스몰 스탠딩이다.
 *
 * 주인공과 **같은 비율로** 움직인다 — 주인공만 줄이면 요정이 상대적으로 커져
 * "동행하는 작은 요정"이라는 관계가 무너진다. 치비 축소와 같은 0.78배를 걸어
 * 30%·210px → 23%·164px로 낮췄고, 그림 높이 기준 주인공 대비 비율은 31.7% →
 * 30.8%로 거의 그대로다(요정은 캔버스의 65.6%, 인물은 94.1%만 그림이라 클래스
 * 값끼리의 비와 화면상 비가 다르다). max-h가 걸리기 시작하는 프레임 높이도
 * 796px → 810px으로 예전과 같은 자리에 있다.
 */
const COMPANION_FAIRY = 'h-[23%] max-h-[164px]';

/**
 * 동행 요정의 **바닥값** — 배역 칸 바닥(=지면선)에서 이만큼 위로 띄운다. 시트가
 * 이보다 높이 올라오는 프레임에서는 아래 COMPANION_FAIRY_FLOOR가 더 올린다.
 *
 * 예전에는 SPRITE_BASE를 그대로 써서 `bottom-0`, 즉 주인공과 같은 지면선에
 * 발을 붙이고 있었다. 요정은 주인공의 30% 남짓 키라 그 상태로는 정강이 옆에
 * 서고, "함께 있다"가 아니라 "발밑에 뭔가 있다"로 읽힌다 (2026-08-26 회의).
 *
 * 27%는 층(CastLayer) 높이 기준이며 알파 실측에서 역산했다. 층 높이를 1로 두면
 * 프레임 크기가 약분되므로 아래 값은 모든 프레임에서 같은 관계를 만든다.
 *
 *   · 주인공 상자 52% · 그림은 캔버스의 94.1%, 머리 위 여백 4.3%
 *     → 머리끝 0.52 × (1 − 0.043) = 0.4976, 그림 높이 0.52 × 0.941 = 0.4893
 *   · 요정 상자 23% · 그림은 캔버스의 65.6%, **발밑 여백 2.8%**
 *     (요정 그림은 캔버스 아래쪽에 붙어 있다 — 머리 위 여백이 31.7%다)
 *     → 그림 높이 0.23 × 0.656 = 0.1509, 중심 = 27% + 0.0064 + 0.0755 = 0.3508
 *   · 머리끝에서 내려온 정도 = (0.4976 − 0.3508) ÷ 0.4893 = **30.0%**
 *
 * 즉 요정의 세로 중심이 주인공 머리~어깨 옆에 온다. 크기 관계는 그대로다
 * (그림 기준 주인공의 30.8%). 이 계산은 PlayerStage.test.tsx가 클래스에서
 * 값을 꺼내 다시 하므로, 위 상수를 만지면 25~35% 밖으로 나가는 순간 깨진다.
 *
 * ⚠️ SPRITE_BASE와 **함께 쓰지 않는다**. SPRITE_BASE의 `bottom-0`이 붙으면 요정이
 * 주인공과 같은 지면선으로 되돌아간다 — 지금은 자리를 style로 걸어 클래스보다
 * 세지만, 그렇다고 죽은 클래스를 들고 다닐 이유는 없다. 그래서 요정은 아래
 * COMPANION_FAIRY_BASE로 자기 몫의 기본 클래스를 따로 든다.
 */
const COMPANION_FAIRY_LIFT_PCT = 27;

/**
 * 동행 요정의 **바닥선** — 위 27%를 바닥값으로 두되, 시트가 그보다 높이 올라오는
 * 프레임에서는 시트 윗변 위로 비켜선다 (2026-08-27 2차 UAT R2-02).
 *
 * 요정 선택 화면과 같은 문제가 이 단계에도 있다. 평가 시트(선택지 3개 + 머리글)는
 * 이 앱에서 가장 높은 시트라, 375×667처럼 짧은 프레임에서는 27%가 만드는 자리
 * (프레임 바닥에서 약 342px)를 넘어선다. 그러면 "함께 서 있는" 요정의 발밑이
 * 시트에 잠긴다 — 주인공의 하반신이 잠기는 것은 장르 관습이지만 요정은 통째로
 * 작은 그림이라 잠기는 비율이 다르다.
 *
 * ── % 값이 12/15가 아니라 13.636/17.045인 이유 ──────────────────────
 *
 * 이 요정은 **배역 층(CastLayer) 안**에 있으므로 여기서의 %는 프레임이 아니라
 * 층 높이(CAST_LAYER_HEIGHT = 88%)를 기준으로 읽힌다. 시트 높이(px)와 더하고
 * 빼려면 지면선(CAST_GROUND = 12% + min(120px, 15%))도 같은 좌표로 옮겨야 한다.
 *
 *   12% ÷ 0.88 = 13.636%   ·   15% ÷ 0.88 = 17.045%   (120px은 그대로)
 *
 * 즉 `시트 높이 + 틈 − 지면선`이 이 요정을 시트 바로 위에 세우는 양이고, 그
 * 값이 27%보다 작으면 예전 자리가 그대로 이긴다. 두 상수의 이 관계는
 * PlayerStage.test.tsx가 CAST_GROUND에서 다시 계산해 확인한다 — 지면선을
 * 고치면 여기 두 숫자도 함께 움직여야 한다.
 */
const COMPANION_FAIRY_FLOOR =
  `max(${COMPANION_FAIRY_LIFT_PCT}%, calc(${SHEET_HEIGHT} + ${FAIRY_SHEET_GAP} - 13.636% - min(120px, 17.045%)))`;

/** 동행 요정의 기본 클래스 — SPRITE_BASE에서 `bottom-0`만 뺀 것이다. */
const COMPANION_FAIRY_BASE =
  'absolute left-1/2 -translate-x-1/2 w-auto max-w-none pointer-events-none';

/**
 * 요정 선택 행 3인의 부유 지연. 셋이 같은 위상으로 뜨면 한 덩어리로 움직여
 * 개별 선택지로 읽히지 않는다 — 어긋내야 "셋 중 하나를 고르는 중"이 된다
 * (2026-08-26 회의, 조세현 UAT 제안).
 *
 * ⚠️ Tailwind는 클래스 문자열을 정적으로 훑으므로 값을 조립하지 말고
 * 완성된 리터럴로 둘 것. `` `[animation-delay:${i * 0.6}s]` ``로 만들면
 * CSS가 생성되지 않아 셋이 조용히 같은 위상으로 뜬다.
 */
const FAIRY_FLOAT_DELAYS = [
  '[animation-delay:0s]',
  '[animation-delay:0.6s]',
  '[animation-delay:1.2s]',
] as const;

/**
 * 전략 적용 이후 주인공의 표정 (2026-08-26 회의).
 *
 * 무대는 이 단계에서도 **마지막 씬의 chars를 그대로** 쓴다. 그런데 CSV의 씬
 * 표정은 '상황'의 것이라 대개 sad이고, 전략 적용 이후는 "배운 대처법을 써서
 * 나아졌다"를 그리는 자리다. 그래서 그림에서는 주인공이 계속 울상이었다.
 *
 * CSV를 고치는 길은 없다 — 프로덕션 원문은 Firestore에서 온다. 그래서 의상
 * 치환과 같은 자리(렌더 레벨)에서 표정 토큰만 갈아 끼운다. 조연은 그대로다.
 */
const POST_STRATEGY_EXPRESSION = 'default';

/**
 * 요정 3인이 서는 자리.
 *
 * 예전에는 대기(bottom-30%)와 조언 열람(bottom-47%)이 다른 값이었다. 시트가
 * 조언으로 확장되면 무대가 위로 양보한다는 설계였는데, 실플레이에서 그 결과가
 * "요정이 처음엔 화면 하단에 깔려 있다가 눌러야 중앙으로 올라온다"로 읽혔다
 * (2026-08-18 지적). 실제로 대기 상태의 그림 세로 중심은 프레임의 36.7~38.3%,
 * 열람 상태는 53.7~55.3%였다 — 지적 그대로 아래쪽 1/3과 중앙이다.
 *
 * 그래서 **하나로 합치고 열람 쪽 값(47%)을 택했다.** 사용자가 "중앙"이라고 부른
 * 자리가 그쪽이고, 시트가 가장 높이 올라오는 상태(ANGEL_DETAIL, 실측 높이 ≈
 * 340px)를 기준으로 잡힌 값이라 발밑이 시트에 잠기지 않는다 — 390×844에서 61px,
 * 430×932에서 103px 여유다. 대기 상태는 시트가 훨씬 낮으므로(≈145px) 당연히
 * 남는다. 머리 위 말풍선도 상단 바까지 80~223px을 남긴다.
 *
 * 값이 하나가 되면서 행이 움직이는 transition도 사라졌다 — 그것이 이 수정의
 * 목적이다. 요정을 고를 때의 강약(flex-[1.4]/[0.8])은 버튼 쪽에 그대로 남아 있다.
 */
const ANGEL_ROW = 'top-[12%] transition-[bottom] duration-300 ease-entrance';

/** 요정 행의 바닥값 — 아래 ANGEL_ROW_FLOOR가 이 값을 하한으로 쓴다. */
const ANGEL_ROW_FLOOR_PCT = 47;

/**
 * 요정 행의 **바닥선**. 위 47%를 바닥값으로 두고, 시트가 그보다 높이 올라오면
 * 시트 윗변 위로 비켜선다 (2026-08-27 2차 UAT R2-02).
 *
 * ── 왜 고정값 47%로는 부족했나 ───────────────────────────────────────
 *
 * 47%는 "시트가 가장 높이 올라오는 상태(≈340px)"에서 역산한 값인데, 그 340px은
 * **px이고 47%는 비율**이다. 두 값이 만나는 지점은 프레임 높이 723px 언저리라
 * 390×844·430×932에서는 여유가 남지만 **375×667·360×740에서는 시트가 47%를
 * 넘어선다.** 게다가 조언 본문은 회차마다 길이가 달라(최대 135자, 6줄) 같은
 * 프레임에서도 시트가 자란다 — 2차 UAT에서 요정 셋의 하반신이 통째로 시트 뒤로
 * 들어간 것이 이 두 가지가 겹친 결과다.
 *
 * ── 시트를 재서 그 위에 세운다 ───────────────────────────────────────
 *
 * 그래서 시트가 자기 높이를 CSS 변수로 알려 주고(SHEET_HEIGHT), 행은 그 위
 * FAIRY_SHEET_GAP 만큼에 선다. `max()`로 감싼 덕에 **시트가 낮은 프레임에서는
 * 예전 값이 그대로 이긴다** — 430×932에서 행은 1px도 움직이지 않는다.
 *
 * ⚠️ 파일 머리의 "① 왜 실측이 아니라 고정값인가"(2026-08-18)와 어긋나 보이지만
 * 그 절이 말하는 대상은 **대사 시트와 배역**이다. 대사 시트는 5줄을 예약해 높이가
 * 고정돼 있어서 재도 얻을 게 없다는 논거였다. 요정 시트는 반대로 조언 길이와
 * 프레임 높이에 따라 실제로 자라므로 그 논거가 성립하지 않는다. 배역(CAST_GROUND)은
 * 그 절대로 손대지 않았다 — 인물의 하반신이 시트에 잠기는 것은 장르 관습이다.
 *
 * ── 들썩임은 어떻게 막나 ─────────────────────────────────────────────
 *
 * 2026-08-18에 대기(30%)·열람(47%)을 하나로 합친 이유가 "눌러야 요정이 올라온다"
 * 였으므로, 시트를 따라 오르내리면 그 지적이 되돌아온다. 그래서 변수에 넣는 값은
 * 순간 높이가 아니라 **그 단계에서 지금까지 관측한 최고치**다(VisualNovelPlayer).
 * 조언을 짧은 것 → 긴 것 → 짧은 것으로 오가도 행은 내려오지 않고, 움직임은
 * 단계당 많아야 한 번이며 방향은 늘 "시트가 자란 만큼 위로"다.
 */
const ANGEL_ROW_FLOOR =
  `max(${ANGEL_ROW_FLOOR_PCT}%, calc(${SHEET_HEIGHT} + ${FAIRY_SHEET_GAP}))`;

/**
 * 요정 그림 공통 클래스. 강조/흐림은 뒤에 덧붙인다(선택 전에는 셋이 완전히 같다).
 *
 * `w-full`이 아니라 113%인 것은 **콘텐츠 비율 보정**이다. 이 자리의 그림 높이는
 * `칸 너비 × (그림 높이 ÷ 캔버스 폭)`이라 캔버스 대비 그림이 차지하는 몫이 곧
 * 화면상 키가 된다. 3종의 그 몫을 에셋에서 한 값으로 맞추면서(597×720 캔버스에
 * 그림 높이 472px) 셋 다 예전보다 작아졌고, 여기서 칸보다 조금 넓게 세워 되돌린다.
 * 셋에 똑같이 걸리므로 크기 차이는 생기지 않는다 — 113%는 가로로 가장 넓은
 * 부엉이가 옆 요정과 부딪히기 직전까지의 값이다.
 *
 * `max-w-none`이 함께 있어야 한다. Tailwind preflight의 `img { max-width: 100% }`가
 * 113%를 조용히 100%로 되돌린다.
 */
const FAIRY_IMG_BASE =
  'w-[113%] max-w-none max-h-full object-contain object-bottom transition-all duration-300';
const FAIRY_ACTIVE = 'opacity-100';
/**
 * 지금 보고 있지 **않은** 요정. 예전 값은 `opacity-40 scale-90`이었는데, 40%는
 * 배경 위에서 요정이 있는지조차 알기 어려워 "나머지 둘이 사라진 것 같다"는
 * 지적을 받았다(2026-08-18 검수). 흐림의 목적은 지우는 것이 아니라 지금 읽는
 * 쪽을 앞세우는 것이므로 75%까지만 낮춘다. 크기 차이(scale-90)는 그대로 둔다
 * — 투명도만으로 강약을 만들면 그만큼 더 흐려져야 하기 때문이다.
 */
const FAIRY_DIMMED = 'opacity-75 scale-90';

/**
 * 아직 조언을 듣지 않은 요정 머리 위의 말풍선. "각 요정을 눌러 조언을
 * 들어보세요"라는 안내가 어느 요정을 남겨 뒀는지까지는 알려 주지 못해서,
 * 무대가 직접 가리키게 한다(2026-08-18 검수).
 *
 * 흐름(flow) 안에 두고 읽은 뒤에는 `invisible`로만 감춘다 — 조건부로 지우면
 * 그 높이만큼 요정이 아래로 내려앉아, 조언을 들을 때마다 무대가 들썩인다.
 * 움직임은 이 앱이 이미 쓰는 앰비언트 모션 하나(animate-float)로 맞춘다.
 * prefers-reduced-motion에서는 index.css가 전역으로 멈춘다.
 */
const FAIRY_HINT_BUBBLE =
  'shrink-0 mb-1.5 flex items-center gap-[3px] px-2 py-1 rounded-full ' +
  'bg-surface-container-low/90 border border-primary/40 animate-float';
const FAIRY_HINT_DOT = 'w-1 h-1 rounded-full bg-primary';

interface PlayerStageProps {
  step: PlayStep;
  scene: SceneData | undefined;
  characterGender: CharacterGender;
  /**
   * 사용자가 **누른** 요정. null이면 아직 아무도 누르지 않은 상태다.
   *
   * ⚠️ 시트에 펼쳐진 조언(activeDetailAngelKey)과 **같은 값이 아니다**
   * (2026-08-18 회의). 요정 단계는 첫 조언이 펼쳐진 채로 시작하는데, 무대의
   * 강조까지 그 값을 따라가면 아무것도 고르지 않았는데 한 요정만 또렷해져
   * "선택하지 않았는데 선택된 것처럼 보인다"(2026-08-11 UAT)로 되돌아간다.
   * 무대는 사용자가 실제로 누른 뒤에만 강약을 만든다.
   */
  pressedAngelKey: StrategyKey | null;
  /**
   * 이 에피소드가 속한 영역(CSV의 DOMAIN — '연인3' 등). 두 가지를 정한다.
   *   · 백설이 **의상** — 직장·취업준비는 정장, 연인은 데이트 차림, 그 외 기본복.
   *   · 연인 영역의 **상대역** — 반대 성별 백설이로 갈아 끼운다.
   * 둘 다 assetUrls가 판정하므로 무대는 그대로 넘기기만 한다.
   */
  domain?: string;
  /** 최종 선택된 요정. 이후 단계에서 주인공과 동행한다. */
  selectedAngelKey: StrategyKey | null;
  /**
   * 조언을 이미 들은 요정들(StrategyKey 집합). 시트의 요정 칩에 '읽음' 체크를
   * 붙이는 그 값과 **같은 것**이며, 무대에서는 반대로 아직 듣지 않은 요정 위에
   * 말풍선을 띄우는 데 쓴다. 선택 사항으로 두지 않는 이유: 배선을 빠뜨리면
   * "모두 안 읽음"으로 조용히 떨어져 인디케이터가 영영 사라지지 않는다.
   */
  readAngels: ReadonlySet<string>;
  /** 요정 그림을 눌렀을 때. 시트의 요정 칩과 **같은** 핸들러를 받는다. */
  onAngelSelect: (key: StrategyKey) => void;
  /** 이미지 로드 실패 — 프리로드를 통과한 뒤의 오프라인 전환을 잡는다. */
  onAssetError?: () => void;
  /**
   * 프리로드 게이트가 아직 열리지 않았는가. 배경은 그대로 두고 **배역만** 숨긴다
   * — 이미지가 한 박자 늦게 뜨면 인물 수가 1명 → 2명으로 바뀌며 무대가 밀린다.
   * DOM에서 지우지 않고 감추는 이유는 <img>의 onError가 계속 살아 있어야
   * 오프라인 안내가 그 경로로 합류하기 때문이다.
   */
  castHidden?: boolean;
}

/**
 * 배경 크로스페이드 길이. 아래 BG_FADE_CLASS의 `duration-300`과 **같은 수**여야
 * 한다 — 자바스크립트는 이 시간 뒤에 새 장을 바닥으로 내려놓고, CSS는 이 시간
 * 동안 그 장을 띄운다. 어긋나면 페이드가 끝나기 전에 장이 바뀌거나(깜빡임),
 * 다 끝난 장이 한 겹 더 남는다.
 */
const BG_FADE_MS = 300;
const BG_FADE_CLASS = 'transition-opacity duration-300 ease-entrance';

/**
 * 새 배경의 준비를 기다리는 **상한**. 이만큼 지나면 준비 신호가 오지 않아도
 * 페이드를 시작한다.
 *
 * 상한이 필요한 이유는 "안 오는 신호"가 실제로 있기 때문이다. 오프라인 안내를
 * 지나쳐 계속 진행한 경우나 요청이 멈춘 경우 load/error가 영영 오지 않는데,
 * 그때 기다리기만 하면 배경이 **옛 장에 영구히 멈춘다** — 공백보다 나쁘다.
 * 기다림을 포기해도 손해가 크지 않은 것은 층 구조 덕이다: 위층이 아직 그릴
 * 그림이 없어도 **아래층은 그대로 보인다**. 최악이라도 "새 그림이 페이드 도중
 * 늦게 떠오른다"이고, 공백 프레임은 어느 경우에도 생기지 않는다.
 *
 * 300ms인 것은 페이드와 같은 호흡이라서다. 프리로드 게이트를 통과한 회차라면
 * decode가 한 프레임 안에 풀리므로 이 값이 쓰이는 일 자체가 드물다.
 */
const BG_PREPARE_TIMEOUT_MS = 300;

/** 배경 한 겹의 공통 클래스. 두 겹이 완전히 겹쳐 서야 크로스페이드가 성립한다. */
const BG_LAYER_BASE = 'absolute inset-0 bg-cover bg-center';

/**
 * 씬 배경을 **두 겹으로 갈아 끼운다** (2026-08-27 R2-07).
 *
 * ── 왜 <img>처럼 두지 않는가 ──
 * 배역 <img>는 새 그림이 준비될 때까지 옛 그림을 계속 그리도록 명세가 정해 두었다
 * (current request / pending request — 파일 머리의 R2-04 절). CSS `background-image`
 * 에는 그 장치가 **없다**. 준비 안 된 URL로 바꾸면 그 프레임은 그냥 빈다. 그래서
 * 배경만은 코드가 직접 옛 장을 붙들고 있어야 한다.
 *
 * ── 절차 ──
 *  ① 같은 파일이면 아무 것도 하지 않는다. 층도 상태도 건드리지 않으므로 씬이
 *     넘어가도 배경은 한 프레임도 흔들리지 않는다(480씬 중 배경이 그대로인
 *     전환이 다수다 — 회의실에서 대화가 이어지는 씬들).
 *  ② 다르면 `new Image().decode()`로 **먼저 준비**한다. 프리로드 게이트를 이미
 *     통과한 회차라면 메모리 캐시에서 즉시 풀린다.
 *  ③ 준비된 뒤에야 새 장을 opacity 0으로 얹고 다음 프레임에 1로 올린다. 그동안
 *     옛 장은 바닥에 그대로 있다 — 공백 프레임이 생길 자리가 없다.
 *  ④ 페이드가 끝나면 새 장을 바닥으로 내리고 위층을 걷는다(층은 늘 최대 두 겹).
 *
 * ── 빨리 넘길 때 ──
 * 페이드 도중에 다음 씬으로 넘어가면 **마지막 요청이 이긴다**. 진행 중이던 장은
 * 즉시 바닥으로 확정되고(중간 장을 못 보고 지나가는 것은 사용자가 그만큼 빨리
 * 넘겼다는 뜻이다), 그 위에서 새 장이 다시 페이드한다. 큐를 쌓지 않으므로
 * 연타해도 층이 늘거나 순서가 뒤엉키지 않는다.
 *
 * ── 모션 축소 ──
 * `prefers-reduced-motion`이면 페이드를 건너뛰고 즉시 교체한다. 다만 ②의 decode
 * 대기는 그대로 둔다 — 그것은 연출이 아니라 공백을 막는 장치다.
 */
function useCrossfadeBackground(url: string, reducedMotion: boolean) {
  const [base, setBase] = useState(url);
  const [incoming, setIncoming] = useState<string | null>(null);
  const [incomingShown, setIncomingShown] = useState(false);
  const baseRef = useRef(url);
  const incomingRef = useRef<string | null>(null);

  useEffect(() => {
    // 진행 중이던 페이드가 있으면 그 장을 바닥으로 확정하고 시작한다.
    if (incomingRef.current) {
      baseRef.current = incomingRef.current;
      incomingRef.current = null;
      setBase(baseRef.current);
      setIncoming(null);
      setIncomingShown(false);
    }
    if (url === baseRef.current) return;
    if (!url) {
      // 배경이 없는 상태(씬 없음)로 돌아가는 경우 — 얹을 것이 없으니 즉시 비운다.
      baseRef.current = '';
      setBase('');
      return;
    }

    let cancelled = false;
    let started = false;
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    let prepareTimer: ReturnType<typeof setTimeout> | undefined;
    let rafOuter = 0;
    let rafInner = 0;

    const settleTo = (next: string) => {
      baseRef.current = next;
      incomingRef.current = null;
      setBase(next);
      setIncoming(null);
      setIncomingShown(false);
    };

    const begin = () => {
      if (cancelled || started) return;
      started = true;
      if (prepareTimer) clearTimeout(prepareTimer);
      if (reducedMotion) {
        settleTo(url);
        return;
      }
      incomingRef.current = url;
      setIncoming(url);
      setIncomingShown(false);
      // 두 프레임을 기다린다. 한 프레임만 기다리면 브라우저가 opacity 0을 한 번도
      // 그리지 않은 채 1로 올라가는 경우가 있고, 그러면 트랜지션이 통째로 생략된다.
      rafOuter = requestAnimationFrame(() => {
        rafInner = requestAnimationFrame(() => {
          if (!cancelled) setIncomingShown(true);
        });
      });
      fadeTimer = setTimeout(() => {
        if (!cancelled) settleTo(url);
      }, BG_FADE_MS);
    };

    // 준비 신호는 먼저 오는 것을 쓴다 — decode()가 가장 정확하고(디코드까지 끝난
    // 뒤 풀린다), 그것이 없는 환경(jsdom 등)은 load/error로, 어느 것도 오지 않으면
    // 상한(BG_PREPARE_TIMEOUT_MS)으로 떨어진다. begin이 한 번만 도는 것은 started가
    // 지킨다.
    const probe = new Image();
    probe.src = url;
    if (probe.complete) {
      begin();
    } else {
      probe.decode?.().then(begin, begin);
      probe.onload = begin;
      probe.onerror = begin;
      prepareTimer = setTimeout(begin, BG_PREPARE_TIMEOUT_MS);
    }

    return () => {
      cancelled = true;
      if (fadeTimer) clearTimeout(fadeTimer);
      if (prepareTimer) clearTimeout(prepareTimer);
      if (rafOuter) cancelAnimationFrame(rafOuter);
      if (rafInner) cancelAnimationFrame(rafInner);
    };
  }, [url, reducedMotion]);

  return { base, incoming, incomingShown };
}

/**
 * CSV의 캐릭터 파일명이 주인공(백설)인가. 판정 접두사는 assetUrls의 경로 해석과
 * 같지만, 이건 "완료 화면에 누구를 세우는가"라는 **표시 규칙**이라 무대 쪽에 둔다.
 */
function isProtagonistChar(charName: string): boolean {
  return charName.trim().toLowerCase().startsWith('baeksul');
}

/**
 * 배역 한 명이 서는 칸. 인원수가 몇이든 칸은 균등하게 나뉘고(flex-1), 스프라이트는
 * 이 칸을 기준으로 가운데에 선다. 칸보다 넓으면 옆으로 삐져나가되 **높이는 줄지
 * 않는다** — 그것이 이 칸 구조의 존재 이유다.
 */
function CastSlot({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`relative flex-1 min-w-0 ${className}`}>{children}</div>;
}

/**
 * 배역 그림 한 장. **어떤 그림을 어느 쪽으로 세울지는 이미 정해져서 내려온다**
 * — 마주봄은 옆에 누가 서 있는지를 알아야 정해지므로 스프라이트 하나가 스스로
 * 결정할 수 없다(그 판단은 assetUrls.resolveSceneCast에 있다).
 */
function CharacterSprite({
  src,
  mirrored = false,
  onError,
}: {
  src: string;
  mirrored?: boolean;
  onError?: () => void;
}) {
  // ⚠️ 이 <img>는 씬이 넘어가도 **살아남는다** — 호출부가 인물 단위로 key를
  // 잡기 때문이다(assetUrls.StagedSprite.identity). 그래서 여기서는 표정이
  // 바뀔 때 src만 갈리고, 브라우저가 옛 그림을 새 그림이 준비될 때까지 유지한다.
  //
  // transition을 걸지 않는 것이 지금은 **의도**다. 예전 `transition-all
  // duration-300`은 매 전환마다 리마운트되던 시절이라 한 번도 발동한 적이
  // 없는 죽은 선언이었는데, 노드가 살아남게 된 뒤로는 상황이 달라진다 —
  // 마주봄 반전(-scale-x-100)이 씬 사이에 풀리거나 걸릴 때 그 300ms가
  // 실제로 재생되어 인물이 좌우로 **뒤집히는 애니메이션**이 생긴다. 표정
  // 교체는 규격이 같은 그림끼리의 즉시 교체가 자연스럽고(캔버스 896×1200,
  // 알파 높이 1129px로 29장이 동일), 반전은 원래 즉시였다. 둘 다 그대로 둔다.
  return (
    <CastSlot>
      <img
        src={src}
        alt="등장 캐릭터"
        onError={onError}
        className={`${SPRITE_BASE} ${CHAR_HEIGHT} ${SPRITE_ENTRANCE} ${
          mirrored ? SPRITE_MIRRORED : ''
        }`}
      />
    </CastSlot>
  );
}

/**
 * 배역이 서는 층. 배경 위·시트 아래에 깔린다.
 *
 * 위치(CAST_GROUND)와 높이(CAST_LAYER_HEIGHT)를 **따로** 준다. `top`을 함께
 * 주면 세 값이 과잉 구속되어 `bottom`이 무시되므로 `top`은 쓰지 않는다.
 * 이 층 하나를 SITUATION과 전략 적용 이후가 공유하기 때문에, 지면선 규칙도
 * 두 화면에 자동으로 똑같이 걸린다.
 */
function CastLayer({ hidden, children }: { hidden?: boolean; children: ReactNode }) {
  return (
    <div
      className={`absolute inset-x-0 ${CAST_LAYER_HEIGHT} ${CAST_GROUND} z-0 flex items-stretch justify-center px-3 pointer-events-none ${hidden ? 'hidden' : ''}`}
    >
      {children}
    </div>
  );
}

export default function PlayerStage({
  step,
  scene,
  characterGender,
  domain,
  pressedAngelKey,
  selectedAngelKey,
  readAngels,
  onAngelSelect,
  onAssetError,
  castHidden = false,
}: PlayerStageProps) {
  const bgImage = scene?.bg ? backgroundUrl(scene.bg, characterGender) : '';
  const reducedMotion = usePrefersReducedMotion();
  const bgLayers = useCrossfadeBackground(bgImage, reducedMotion);
  const isAngelStep = step === 'ANGELS' || step === 'ANGEL_DETAIL';
  // 동행 요정이 떠 있는 단계(전략 적용~완료)에도 같은 스크림을 깐다 — 8/26 검수:
  // 요정 선택 화면만 어둡고 그 뒤 화면은 밝아 요정이 배경에 묻힌다는 지적.
  const showsCompanion = !isAngelStep && step !== 'SITUATION' && !!scene && !!selectedAngelKey;

  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      {/* ── 배경 + 가독성 스크림 ──
          배경은 원래 밝기로 두고 스크림만 아래로 갈수록 짙어진다(짙기 값은
          index.css의 --color-scenario-scrim-*). 예전에는 이미지를 opacity-40으로
          죽인 뒤 거의 불투명한 그라데이션을 덮어 배경이 보이지 않았다.

          배경이 바뀌는 씬 전환에서는 **두 겹**이 잠깐 함께 선다. 아래가 옛 장,
          위가 준비를 마치고 떠오르는 새 장이다(useCrossfadeBackground 주석).
          같은 파일이면 위층 자체가 생기지 않는다. */}
      {bgLayers.base && (
        <div className={BG_LAYER_BASE} style={{ backgroundImage: `url(${bgLayers.base})` }} />
      )}
      {bgLayers.incoming && (
        <div
          key={bgLayers.incoming}
          className={`${BG_LAYER_BASE} ${BG_FADE_CLASS} ${
            bgLayers.incomingShown ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ backgroundImage: `url(${bgLayers.incoming})` }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-scenario-scrim-top via-scenario-scrim-mid to-scenario-scrim-bottom" />

      {/* ── 요정 단계에만 얹는 한 겹 (2026-08-18 회의) ──
          위 그라데이션은 step과 무관한 한 장이라, 요정 셋이 배경 한가운데 서는
          단계에서도 배경이 그대로 밝다. 공용 그라데이션을 짙게 하면 상황 대사
          화면까지 어두워지므로(8/18에 걷어낸 "배경이 전체적으로 뿌옇다") 단계를
          가려 덮는다. 색 근거와 blur를 뺀 이유는 index.css의 토큰 주석에 있다.

          ⚠️ 자리는 **요정 행보다 앞**이어야 한다. 둘 다 z-0이라 DOM 순서가 곧
          쌓임 순서이고, 뒤로 가면 어둡게 하려던 요정이 스크림에 잠긴다.
          이 단계에는 CastLayer가 렌더되지 않으므로 인물과 부딪히지 않는다. */}
      {(isAngelStep || showsCompanion) && (
        <div className="absolute inset-0 bg-scenario-scrim-angel animate-fadeIn" />
      )}

      {/* ── 1. 요정 등장 · 조언 열람 ──
          같은 화면 안에서 시트만 확장되므로 무대도 그대로 남는다. 고른 요정은
          또렷하게, 나머지 둘은 흐리게 — 어디까지 읽었는지를 무대가 기억한다.
          아직 아무도 고르지 않았으면 셋이 완전히 같은 모습이라야 한다
          ("선택하지 않았는데 선택된 것처럼 보인다", 2026-08-11 UAT). */}
      {isAngelStep && (
        <div
          // 바닥선은 시트 높이(CSS 변수)를 품은 식이라 클래스가 아니라 style로 건다.
          // Tailwind는 클래스 문자열을 정적으로 훑으므로 이 정도 길이의 max()·calc()를
          // 임의값 클래스로 조립하면 CSS가 조용히 생성되지 않는다 — 같은 함정이 이
          // 파일 안에서 이미 두 번(CAST_GROUND · FAIRY_FLOAT_DELAYS) 주석으로 남았다.
          style={{ bottom: ANGEL_ROW_FLOOR }}
          className={`absolute inset-x-0 ${ANGEL_ROW} z-0 flex items-end justify-center gap-1 px-3 ${castHidden ? 'hidden' : ''}`}
        >
          {STRATEGY_KEYS.map((key, index) => {
            const meta = STRATEGY_META[key];
            // 그림 대신 버튼에 이름을 붙이는 이유: <img>의 alt("수용 요정")를
            // 그대로 두면 버튼 이름도 그 값이 되는데, 이 자리에서 필요한 이름은
            // "무엇인가"가 아니라 "누르면 무엇이 되는가"이기 때문이다.
            const emphasis =
              pressedAngelKey === null ? '' : key === pressedAngelKey ? FAIRY_ACTIVE : FAIRY_DIMMED;
            const isRead = readAngels.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onAngelSelect(key);
                }}
                aria-label={COPY.player.angelGraphicSelect(meta.angelLabel)}
                aria-pressed={key === pressedAngelKey}
                className={`h-full flex flex-col items-center justify-end cursor-pointer transition-all duration-300 ${
                  key === pressedAngelKey ? 'flex-[1.4]' : 'flex-[0.8]'
                }`}
              >
                {/* 말풍선은 <img> 바로 위 칸에 선다 — <img>가 자연 비율대로
                    서므로 그 상자의 윗변이 곧 요정의 머리끝이다. 읽은 뒤에도
                    자리는 남기고 보이지만 않게 한다(위 상수의 주석 참조).
                    버튼 이름은 aria-label이 정하므로 이 안의 이름은 버튼
                    이름을 바꾸지 않는다 — 칩의 '읽음' 표시와 짝이 되는
                    상태 표시로만 남는다. */}
                <span
                  role={isRead ? undefined : 'img'}
                  aria-label={isRead ? undefined : COPY.player.angelUnreadMark}
                  aria-hidden={isRead || undefined}
                  className={`${FAIRY_HINT_BUBBLE} ${isRead ? 'invisible' : ''}`}
                >
                  <span className={FAIRY_HINT_DOT} />
                  <span className={FAIRY_HINT_DOT} />
                  <span className={FAIRY_HINT_DOT} />
                </span>
                {/* 유휴 부유는 지연만 셋이 다르다 — 강약(emphasis)은 눌렀을
                    때만 갈리므로, 누르기 전 "셋이 완전히 같은 모습"이라는
                    8/11 UAT의 계약은 지연을 뺀 나머지가 지킨다. */}
                <img
                  src={fairyUrl(meta.image)}
                  alt={meta.angelLabel}
                  onError={onAssetError}
                  className={`${FAIRY_IMG_BASE} ${emphasis} animate-fairy-float ${FAIRY_FLOAT_DELAYS[index]}`}
                />
              </button>
            );
          })}
        </div>
      )}

      {/* ── 2. 상황 대사 ──
          슬롯(0/1/2)은 CSV의 CHAR{n}_1~3과 1:1이다. 빈 슬롯은 그리지 않는다.
          슬롯별 높이 차이는 두지 않는다 — 슬롯 규칙상 그 차이가 곧 "2인 씬만
          작다"가 되기 때문이다(파일 머리의 실측 근거).

          ⚠️ key는 **인물**(identity)이다. 슬롯이나 파일명을 섞으면 표정만 바뀌어도
          <img>가 리마운트되어 씬을 넘길 때마다 인물이 한 프레임 사라진다
          (2026-08-27 R2-04 — 근거는 StagedSprite.identity 주석). */}
      {step === 'SITUATION' && scene && (
        <CastLayer hidden={castHidden}>
          {resolveSceneCast(scene.chars, characterGender, domain, scene.bg).map((staged) => (
            <CharacterSprite
              key={staged.identity}
              src={staged.src}
              mirrored={staged.mirrored}
              onError={onAssetError}
            />
          ))}
        </CastLayer>
      )}

      {/* ── 3. 전략 적용 이후 — 주인공과 요정이 함께 선다 ──
          예전에는 이 단계에서 요정이 48px 배지로 줄어 "전략을 고르고 나니
          요정이 너무 작아진다"는 지적을 받았다(2026-08-11 UAT). 배지 대신
          주인공 옆의 스몰 스탠딩으로 동행시킨다.

          조연(동료·연인)은 세우지 않는다 — 완료 화면에 연인이 함께 남아
          "백설이 혼자가 아니다"라는 지적을 받은 자리이고, 그 뒤 단계는 모두
          "배운 대처법을 내가 다시 써 보는" 장면이라 주인공만 남는 편이 맞다. */}
      {!isAngelStep && step !== 'SITUATION' && scene && (
        <CastLayer hidden={castHidden}>
          {(() => {
            const hero = scene.chars.find(isProtagonistChar) ?? scene.chars.find(Boolean);
            // 혼자 서므로 마주 볼 상대가 없다 — 반전하지 않는다.
            return hero ? (
              <CharacterSprite
                // 표정은 CSV가 아니라 **단계**가 정한다 (2026-08-26 회의).
                // 씬의 표정은 '상황'의 것이라 대개 sad인데, 여기부터는 대처법을
                // 써서 나아지는 장면이라 그대로 두면 주인공이 계속 울상이다.
                // 성별·의상·영역 규칙은 그대로 통과하고 표정 토큰만 갈린다.
                // 조연에는 걸리지 않는다 — 애초에 이 단계에 조연을 세우지 않고,
                // 덮어쓰기 자체가 주인공 해석에만 있다(assetUrls.resolveSprite).
                src={resolveSprite(hero, characterGender, domain, POST_STRATEGY_EXPRESSION, scene.bg).src}
                onError={onAssetError}
              />
            ) : null;
          })()}
          {selectedAngelKey && (
            // 요정도 같은 칸 구조를 쓴다. 예전에는 요정이 flex 아이템으로 서면서
            // 옆의 주인공을 밀어 shrink시켰고, 그만큼 주인공이 SITUATION 단계보다
            // 작아졌다(같은 원인, 다른 화면). 주인공과 칸을 반씩 나누므로 요정은
            // 늘 **주인공 옆 빈 자리**에 선다 — 이 단계에는 조연을 세우지 않아
            // 세 번째 칸이 생기는 경우가 없다.
            //
            // 등장 모션(animate-fadeIn)은 **칸**이 든다. 한 요소에 animate-*를
            // 둘 붙이면 나중에 정의된 쪽이 animation 전체를 덮어써서 하나가
            // 조용히 사라지는데, 그림은 부유(animate-fairy-float)를 들어야 한다.
            <CastSlot className="animate-fadeIn">
              <img
                src={fairyUrl(STRATEGY_META[selectedAngelKey].image)}
                alt={STRATEGY_META[selectedAngelKey].angelLabel}
                onError={onAssetError}
                // 요정 행과 같은 이유로 style이다(위 주석 참조). 배역 층 안이라
                // 여기서의 %는 층 높이 기준이며, 그 환산은 상수 쪽에 적어 두었다.
                style={{ bottom: COMPANION_FAIRY_FLOOR }}
                className={`${COMPANION_FAIRY_BASE} ${COMPANION_FAIRY} transition-[bottom] duration-300 ease-entrance animate-fairy-float`}
              />
            </CastSlot>
          )}
        </CastLayer>
      )}
    </div>
  );
}
