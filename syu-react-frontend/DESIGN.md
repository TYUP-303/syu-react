---
name: Serene Azure
# v2.1 (2026-08-14 시안 2차 · 2026-08-15 채택). 토큰 **이름 체계는 v1 그대로**이고
# 값만 재조율했다 — 20여 파일의 참조가 자동으로 따라오게 하려는 것이다.
# 정본은 src/index.css의 @theme 블록이며, 이 파일은 그 값을 서술한다.
colors:
  surface: '#e9edf3'
  surface-dim: '#cfd7e4'
  surface-bright: '#f7f9fc'
  surface-container-lowest: '#fcfcfa'
  surface-container-low: '#f3f6fa'
  surface-container: '#dfe6ef'
  surface-container-high: '#d7dee9'
  surface-container-highest: '#cbd4e2'
  on-surface: '#16202c'
  on-surface-variant: '#3e4a59'
  inverse-surface: '#26303c'
  inverse-on-surface: '#eef2f8'
  outline: '#5a6675'
  outline-variant: '#c6cfdc'
  surface-tint: '#0a56ae'
  primary: '#0a56ae'
  on-primary: '#ffffff'
  primary-container: '#0c68ce'
  on-primary-container: '#ffffff'
  inverse-primary: '#a9c7f5'
  secondary: '#4e5c6b'
  on-secondary: '#ffffff'
  secondary-container: '#d3dfec'
  on-secondary-container: '#33414f'
  tertiary: '#8a5300'
  on-tertiary: '#ffffff'
  tertiary-container: '#a96700'
  on-tertiary-container: '#ffffff'
  error: '#b3261e'
  on-error: '#ffffff'
  error-container: '#f9dedc'
  on-error-container: '#8c1d18'
  primary-fixed: '#d6e3f8'
  primary-fixed-dim: '#a9c7f5'
  on-primary-fixed: '#04203f'
  secondary-fixed: '#d8e3ee'
  secondary-fixed-dim: '#b7c5d4'
  on-secondary-fixed: '#131e28'
  tertiary-fixed: '#f8e4c4'
  tertiary-fixed-dim: '#efc98b'
  on-tertiary-fixed: '#2e1a00'
  background: '#e9edf3'
  # ── 아래 4개는 v1 Stitch 산출물에 있었으나 index.css @theme에 대응 토큰이
  #    없다. 값을 새로 짓지 않고 미바인딩 상태로 남겨 둔다 — 필요해지면
  #    index.css에 먼저 정의하고 여기에 옮겨 적을 것.
  #  on-primary-fixed-variant / on-secondary-fixed-variant /
  #  on-tertiary-fixed-variant / on-background / surface-variant
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 42px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-lg:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
# 라운드는 두 단계뿐이다 (v2.1). 예전의 sm/DEFAULT/md/lg/xl 5단계는 폐기했다.
rounded:
  pane: 14px
  control: 10px
  full: 9999px
# 입장 모션은 이징·지속을 하나로 묶는다 (v2.1).
motion:
  ease-entrance: 'cubic-bezier(0.2, 0.7, 0.3, 1)'
  duration-entrance: 180ms
  duration-float: 3.4s
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 48px
  xl: 80px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style
The design system is defined by a sense of crystalline clarity and professional reliability. It targets users seeking an environment that feels organized, open, and mentally refreshing. The emotional response should be one of "quiet confidence"—a UI that stays out of the way while providing high-utility tools.

The design style is **Corporate Modern with a Minimalist lean**. It prioritizes heavy whitespace and a restricted, high-quality color palette to reduce cognitive load. Depth comes from tonal layering rather than skeuomorphic ornament. The interface feels "breathable," utilizing a fresh saturation level that avoids the dullness of standard enterprise software.

## Colors
> 본문 프로즈의 모든 색 언급은 **위 frontmatter 팔레트가 유일한 진실**이다. (과거 초안에 있던 #F8FAFC, #E2E8F0, "Soft Sky Blue", "Accent Indigo"는 이 팔레트에 존재하지 않는 색이었고, 2026-08-05 정합화에서 제거했다.)
>
> **v2.1 (2026-08-14 조율 · 2026-08-15 채택)**: 토큰 이름은 그대로 두고 값만 재조율했다. 이 문서의 hex는 그때 v1 값에서 갱신된 것이며, 어긋남이 보이면 `src/index.css`의 `@theme` 블록이 정본이다.

v2.1의 핵심은 **위계를 그림자가 아니라 색온도가 만든다**는 것이다. 캔버스는 서늘한 그늘(`surface` #e9edf3)이고 카드는 볕이 닿은 면(`surface-container-lowest` #fcfcfa, 미세하게 난색)이다. v1의 캔버스는 98% 흰색이라 카드가 보이려면 테두리에만 의존했다. 명도 순서는 M3 관례를 따르되(lowest가 가장 밝다), **캔버스를 lowest가 아니라 `low`와 `container` 사이에 둔 것**이 이 조율의 핵심이다 — 방은 그늘지고 종이만 볕을 받는다.

The palette is anchored by **Afternoon Azure** (`primary` #0a56ae), used strategically for primary actions and brand presence — v1의 #0058bc에서 채도를 낮추고 명도를 내려, 클릭을 재촉하는 기업 파랑에서 오후 4시 창밖 하늘 쪽으로 반보 물러난 값이다. 흰 글자 대비 7.1:1. The **Soft Slate Container** (`secondary-container` #d3dfec) serves as the high-utility secondary tone for subtle backgrounds, hover states, and active indicators.

To maintain the "그늘과 볕" aesthetic:
- Use `surface` (#e9edf3, 서늘한 그늘) for the main canvas.
- Use `surface-container-lowest` (#fcfcfa, 볕 든 면) for cards and containers — 색온도 차만으로 떠오르므로 그림자를 얹지 않는다.
- `surface-container-high` (#d7dee9)는 **먼 그늘** — 잠김 상태와 게이지 트랙의 자리다.
- `tertiary` (#8a5300, 볕금)는 azure primary와 갈라져야 하는 데이터 시각화·강조에 쓴다. v1의 #9e3d00은 붉은 흙빛(테라코타)이었고, hue를 올려 붉은 기를 뺐다 — 이제 이 색은 흙이 아니라 **빛**이다. 스트레스 검사 축과 요정 '포코(재평가)'를 겸한다.
- Text uses `on-surface` (#16202c) rather than pure black — 검정이 아니라 **먹남색**이라, 글자도 파랑 가족에 속해 화면 전체가 한 색온도로 묶인다.
- **주의**: 이 팔레트의 `primary-container`(#0c68ce)는 M3 관례와 달리 **진한 강조 블루**다(hover 채움). 연한 틴트가 필요하면 `primary-fixed`(#d6e3f8)를 쓸 것.
- **⚠️ `outline`(#5a6675)은 선 색이면서 동시에 보조 텍스트 색**(`text-outline`)이다. 서늘해진 캔버스 위에서 AA를 넘기려고 v2.1 시안의 #6b7889에서 명도를 내린 값이며, 캔버스 4.98:1 / 카드 5.69:1 / `surface-container` 4.65:1로 본문 AA(4.5:1)를 통과한다. **이 값을 다시 밝히지 말 것** — 선으로만 쓰이는 자리는 `outline-variant`가 따로 있다. 다만 `surface-container-high`(#d7dee9) 위에서는 4.32:1로 여전히 미달이므로, 그 배경 위의 글자는 `on-surface-variant`(6.66:1)를 쓴다.
- **금지**: 그라데이션 배경, 네온 글로우, `mix-blend-screen`, 그리고 **위계를 만들기 위한 그림자**. 깊이 표현은 톤 레이어(색온도)뿐이다.

### v2에서 더해진 토큰 (M3 슬롯 밖)
frontmatter는 Stitch M3 슬롯만 담는다. 아래는 `index.css`에만 있는 확장이며, 값의 정본도 그쪽이다.
- `primary-hover` / `primary-pressed` — 면적이 큰 primary 판(홈 "지금 할 일" 카드)의 눌림 표현. `primary-container`는 primary보다 **밝아서** 큰 판에서는 흰 글자 대비가 내려가므로, 이 둘은 자기 짝 잉크를 섞어 **어두운 쪽으로** 내린 변주다. 새 hex가 아니라 `color-mix`로 파생시켜 팔레트 재조율을 자동으로 따라오게 했다.
- `success` (#2a6b3e, 잎그늘) — 요정 '리프(재초점)' 축.
- 별칭군: 회복일기·보고서(`diary-*`), 검사 2종 구분(`test-adhd-*` / `test-stress-*`), 캐릭터 그래픽(`char-*`), 스크림·글로우. 모두 위 M3 슬롯을 `var()`로 참조하는 간접층이라 고유 색이 없다.

## Typography
This design system utilizes **Hanken Grotesk** across all roles to ensure a sharp, contemporary look. In this light-themed iteration, font weights are slightly increased for headlines to ensure they command attention against the bright backgrounds.

- **Headlines:** Use SemiBold (600) or Bold (700) to anchor the page.
- **Body Text:** Use Regular (400) for optimal legibility in long-form content.
- **Labels:** Use Medium (500) or SemiBold (600) at smaller scales to maintain crispness.
- **Tracking:** Tighten tracking slightly on display sizes to create a more premium, "designed" feel.

> ⚠️ 서체는 v2.1 회차에서 건드리지 않았다. 한글은 지금도 시스템 폴백으로 그려지며, 셀프호스트 가변 폰트 도입은 별건으로 남아 있다.

## Layout & Spacing
The layout follows a **Fluid Grid** philosophy with a 12-column structure for desktop and a 4-column structure for mobile.

The spacing rhythm is based on an **8px linear scale**, ensuring mathematical harmony across all components.
- **Desktop:** 32px side margins with 24px gutters.
- **Mobile:** 16px side margins with 16px gutters.
- **Vertical Rhythm:** Use larger gaps (48px+) between distinct content sections to reinforce the sense of "Sanctuary" and openness.

## Elevation & Depth
Depth is conveyed through **Tonal Layers** — 색온도 차이만으로 층을 만든다. v1의 "very soft, ambient shadows"는 v2.1에서 폐기했다.

- **Level 0 (Background):** The base canvas — `surface` (#e9edf3, 서늘한 그늘).
- **Level 1 (Surface):** Cards — `surface-container-lowest` (#fcfcfa, 볕 든 면) with a subtle 1px border (`outline-variant` #c6cfdc) and **no shadow**. 캔버스와의 색온도 차로 떠오른다.
- **Level 2 (Interactive/Floating):** 같은 면 위에 **테두리와 얇은 링**으로만 구분한다. `--color-primary-glow-15` ~ `-30`은 이름에 "glow"가 남아 있지만 실제로는 포커스 링과 프레임 테두리 같은 얇은 선에 쓰인다 — 그림자로 위계를 만드는 자리는 남기지 않는다.
- **Transitions:** Use soft blurs on overlays (Glassmorphism) only when content needs to be temporarily isolated, such as in modal backdrops (`--color-glass-bg` + backdrop-blur).

## Shapes
라운드는 **두 단계뿐**이다. v1에는 6·8·12·16px가 섞여 있었고(rounded-lg 17곳, xl 56곳, 2xl 12곳, 3xl 1곳, bento 12px, input 6px), 그 동물원을 v2.1에서 두 값으로 정리했다.

- **`--radius-pane` (14px) — 면:** 카드 · 시트 · 모달 · 패널 · 목록 행 · 전폭 선택지 행.
- **`--radius-control` (10px) — 컨트롤:** 버튼 · 입력 · 아이콘 타일 · 인라인 알림/정보 박스.
- **`rounded-full` — 상태 배지와 원형 마커 전용:** 배지 · 점 · 게이지 끝단 · 척도 눈금 · 원형 아이콘 버튼 · 스위치 트랙. **금지 대상은 알약(pill) 모양의 인터랙티브 요소** — 버튼이 알약이면 상태와 행동이 같은 형태를 쓰게 된다.

문서화된 예외는 하나다: 시나리오 플레이어 시트의 상단 모서리(`rounded-t-2xl`, 16px). 이 모서리는 카드의 모서리가 아니라 **시트가 무대 위로 올라오는 입구**라서, 다른 면과 같은 값으로 맞추면 얹혀 있다는 인상이 사라진다. 사유는 `PlayerSheet.tsx` 주석에 있다.

## Motion
입장 모션은 **하나의 조율된 순간**으로 묶는다. 산발적인 효과 조합 자체가 템플릿 티라, 이징과 지속을 한 값으로 통일했다.

- `animate-fadeIn` / `animate-scaleIn` / `animate-slideUp`은 클래스 이름을 그대로 두고 **정의만** 조율했다 — 셋 다 `--ease-entrance`(cubic-bezier(0.2, 0.7, 0.3, 1))와 180ms를 쓴다. (v1: 0.3s/0.25s/0.3s ease-out + 이동량 16px)
- **hover는 색만 바꾼다.** `hover:scale-*`와 `hover:shadow-*`는 걷어냈다 — 카드가 커지면 옆 카드와의 간격이 흔들려 목록 전체가 술렁인다. 눌림을 알리는 `active:scale-[0.99]`는 남긴다.
- 랜딩 히어로 요정의 플로팅(3.4s)만 상시 애니메이션으로 남기되 진폭을 10px → 6px로 줄여 앰비언트로 물러나게 했다.
- **`prefers-reduced-motion: reduce`에서 전부 정지시킨다.** 예외는 `animate-spin` 하나 — 회전 표시는 장식이 아니라 "진행 중"이라는 **정보**이고, 라벨을 스피너로 대체하는 버튼에서는 정지가 오히려 정보 손실이다. 순수 장식인 `animate-ping`은 그대로 멈춘다.

## Components
- **Buttons:** Primary buttons use a **solid** `primary` (#0a56ae) fill with `on-primary` white text — no gradients, no glow. 큰 판은 `primary-hover` / `primary-pressed`로 **어두워지며** 눌린다. Secondary buttons use `secondary-container` (#d3dfec) fill with `secondary` text. Ghost buttons use `primary` text with no background until hover. 라운드는 `Button`이 base에서 `--radius-control`로 정하므로 호출부가 덮어쓰지 않는다.
- **Input Fields:** Use a 1px `outline-variant` (#c6cfdc) border with `--radius-control`. On focus, the border transitions to `primary` with a subtle 2px outer ring (`--color-primary-glow-20`).
- **Cards:** `surface-container-lowest` (#fcfcfa) backgrounds with `--radius-pane` (14px). Use a light border instead of a shadow for a cleaner, flatter appearance (`.bento-card`).
- **Chips/Tags:** Use `secondary-container` (#d3dfec) backgrounds with Medium-weight `secondary` text for high legibility at small sizes.
- **Progress Indicators:** Use solid `primary` for active progress and a `surface-container-high` (#d7dee9) track for the remainder — 진행 바에 그라데이션을 쓰지 않는다. 트랙과 채움 모두 `rounded-full`(게이지 끝단)이다.
- **Navigation:** Top navigation stays **outside the scroll container** (app-shell fixed row) with a slight backdrop-blur (10px) to maintain the "Aetheric" feeling of depth.
