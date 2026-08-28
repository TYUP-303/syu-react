// src/components/home/HomeCtaCard.tsx
// 홈 최상단 "지금 할 일" 카드 — 캐릭터가 말을 걸고, 그 말이 곧 버튼이다.
//
// ── 왜 카드 하나로 합쳤나 (2026-08-14 사용자 피드백) ──
// 예전 히어로는 말풍선 + 캐릭터 원형(96~120px) + 닉네임 + "함께 시작한 날" +
// 큰 CTA 버튼을 세로로 쌓아 실측 438px를 썼다. 문제는 높이만이 아니었다 —
// 말풍선("…ADHD 경향성 검사를 진행해 주세요!")과 그 아래 버튼("첫 번째 검사
// 시작하기 (ADHD)")이 **같은 말을 두 번** 하고 있었다. 화면에서 가장 비싼
// 자리를 중복이 차지한 셈이다.
//
// 그래서 토스 앱이 '할 일'을 최상단 카드 한 장으로 띄우는 패턴을 따른다:
// [얼굴] + [지금 할 일을 말하는 문장], 카드 전체가 버튼.
// (2.1차에는 오른쪽에 chevron도 있었다 — 아래 2.2차 1번에서 걷어냈다.)
// 문장이 곧 행동 설명이므로 버튼 라벨을 따로 둘 이유가 없어지고, 대신 그
// 라벨은 aria-label로 남아 스크린 리더와 셀렉터에 그대로 살아 있다.
//
// "함께 시작한 날"은 마이페이지가 이미 갖고 있어(프로필 헤더의 닉네임 ·
// 함께한 일수) 여기서 빼도 정보가 사라지지 않는다.
//
// ── 2.2차 (2026-08-14 사용자 피드백) ──
// 1. **chevron 제거.** 아래 여정 카드(2·3·4단계)가 이미 '시작'·'입장' 칩으로
//    클릭 동선을 그리고 있어서, 그 위에 화살표까지 서면 같은 화면에 버튼
//    기표가 두 겹이 된다. 다만 **카드의 onClick과 aria-label은 그대로 둔다** —
//    진한 파란 판은 사용자가 눌러 보게 되어 있으므로, 눌러도 아무 일이
//    없는 죽은 판을 만들면 안 된다 (조율 세션 결정).
// 2. **면을 primary로 채운다.** 볕 든 카드색이던 이 판을 진한 파랑으로
//    바꿔 "지금 할 일" 알림으로 읽히게 한다(토스의 컬러 공지 카드 패턴).
//    아래 여정 목록이 전부 밝은 면이라, 상단 한 장만 채워도 시선이 먼저
//    닿는다.
// 3. **닉네임 라벨.** 히어로를 접으면서 사라졌던 닉네임을 말 위 한 줄로
//    되살린다. "캐릭터가 말을 건다"는 이 카드의 전제를 화자 이름이 직접
//    밝히는 셈이다. 캐릭터가 없는 상태(케이스 A)에는 화자 이름이 없으므로
//    라벨도 없다.

import CharacterGraphic from '../CharacterGraphic';

interface HomeCtaCardProps {
  /** 얼굴 원에 세울 그림. 캐릭터가 아직 없으면 'silhouette'. */
  face: 'silhouette' | 'male' | 'female';
  /**
   * 말하는 사람의 이름(캐릭터 닉네임). 말 위에 작은 라벨로 얹는다.
   * 캐릭터 생성 전에는 화자가 없으므로 넘기지 않는다.
   */
  speaker?: string;
  /**
   * 캐릭터가 건네는 말 — `COPY.home.speech*` 중 현재 상태의 것.
   * `\n`은 그대로 줄바꿈된다 (whitespace-pre-line). 두 문장짜리 대사가
   * 430px 폭에서 문장 중간에 접히던 문제의 대응이며(UAT 2026-08-18), 접는
   * 자리를 정하는 주체는 이 컴포넌트가 아니라 문구(COPY)다.
   */
  message: string;
  /**
   * 이 카드를 눌렀을 때 하는 일의 이름 — `COPY.home.cta*`.
   * 카드에는 글자로 그려지지 않고 접근성 이름으로만 쓴다. 화면에서 사라진
   * 버튼 라벨을 여기 옮겨 둔 것이라, `getByRole('button', { name })`로 찾던
   * 기존 셀렉터가 그대로 동작한다.
   */
  actionLabel: string;
  onClick: () => void;
}

export default function HomeCtaCard({
  face,
  speaker,
  message,
  actionLabel,
  onClick,
}: HomeCtaCardProps) {
  return (
    /* .bento-card 대신 유틸리티로 면을 그린다 — .bento-card는 Tailwind 레이어
       **밖**에 있어 background-color가 hover 유틸리티를 이겨 버린다. 눌리는
       면이므로 hover/active 반응이 살아 있어야 한다.

       헤어라인(border)은 두지 않는다. 그 선은 볕 든 카드색(#fcfcfa)을 서늘한
       캔버스(#e9edf3)에서 떼어 내려고 있던 것인데, 면이 진한 파랑으로 채워진
       지금은 색 자체가 그 일을 한다.

       hover/active가 **어두워지는** 쪽인 이유는 index.css의 --color-primary-
       hover / --color-primary-pressed 주석에 있다(밝은 쪽 변주인
       primary-container는 흰 글자 대비를 7.10:1 → 5.40:1로 떨어뜨린다). */
    <button
      type="button"
      onClick={onClick}
      aria-label={actionLabel}
      className="
        w-full flex items-center gap-3 p-3 text-left cursor-pointer
        bg-primary text-on-primary rounded-pane
        transition-colors duration-200
        hover:bg-primary-hover active:bg-primary-pressed
      "
    >
      {/* 얼굴 원 — 말을 거는 주체가 누구인지 보이려면 아이콘이 아니라 이
          캐릭터여야 한다. crop="face"는 전신 스프라이트를 얼굴 중심으로
          확대해 잘라내는 **임시** 조치다(CharacterGraphic의 crop prop 주석
          참조 — 얼굴 전용 에셋이 나오면 교체한다).
          52px 원에서는 부유 애니메이션이 덜컹거려 animated={false}.

          성별 링(--color-char-core-*)은 이 크롭에서 그려지지 않는다 — 이 카드
          위에서는 남 #0c68ce가 카드색 대비 1.32:1, 여 #0a56ae는 카드색과
          **같은 값**이라 보이지 않는 선이었다. 원의 윤곽은 밝은 얼굴 판
          (surface-container, 카드 대비 5.65:1)이 그린다. 2.3차에 링 자체를
          crop='face' 경로에서 걷어냈다 (CharacterGraphic 쪽 주석 참조). */}
      <CharacterGraphic
        type={face}
        size={52}
        animated={false}
        crop="face"
        className="shrink-0"
      />

      <div className="flex-1 min-w-0">
        {/* 화자 이름. 흰색 100%로 두면 말과 같은 무게가 되어 위계가 사라지므로
            낮은 강조(80%)로 한 단계 내린다 — primary 위에서 5.15:1로 AA를
            유지한다. */}
        {speaker && (
          <p className="text-[11px] leading-[15px] font-bold text-on-primary/80 font-headline truncate">
            {speaker}
          </p>
        )}
        <p className="text-[13px] leading-[19px] font-semibold text-on-primary font-body whitespace-pre-line">
          {message}
        </p>
      </div>
    </button>
  );
}
