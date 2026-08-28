// src/pages/LandingPage.tsx
// Stitch 시안 1 (조세현 · projects/3525472384167707146 '시안1' 스크린) 기반
// 디자인 시스템: Serene Azure — 색상은 index.css 토큰만 사용
// 스펙: docs/superpowers/specs/2026-08-06-landing-sian1-design.md

import { useEffect, type SyntheticEvent } from 'react';

import BrandHeader from '../components/common/BrandHeader';
import Button from '../components/ui/Button';
import PageLayout from '../components/ui/PageLayout';
import { useAuthStore } from '../store/useAuthStore';
import { useCharacterStore } from '../store/useCharacterStore';

interface LandingPageProps {
  onStart: () => void; // CTA → 로그인(비로그인) 또는 홈(로그인)으로 이동
  onProfileClick: () => void; // 헤더 프로필 → 로그인(비로그인) 또는 마이페이지(로그인)
}

// 도메인 4종 — 순서는 앱 내부 순서와 통일(2026-08-08 사용자 확정).
// 시나리오 콘텐츠 CSV(scenario_visual.csv)가 직장 → 취업준비 → 연인 → 일상
// 순으로 배열되어 있어 시나리오 탭도 그 순서로 보인다. 랜딩만 다른 순서를
// 쓰면 "본 것과 다른 순서"가 되므로 아래 두 배열도 같은 순서를 지킨다.
// 네 번째 영역 명칭은 시나리오 확정본과 동일한 "일상"이다 (2026-08-07 통일).
const DOMAINS = [
  { name: '직장', icon: 'work', copy: '업무 실수와 집중력 저하' },
  { name: '취업준비', icon: 'work_history', copy: '미래에 대한 불안감' },
  { name: '연인', icon: 'favorite', copy: '감정 기복과 소통의 벽' },
  { name: '일상', icon: 'calendar_today', copy: '미루기와 시간 관리의 어려움' },
];

const SCENARIO_CARDS = [
  // 랜딩 전용 최적화 사본(public/landing/, 860px WebP) — 시나리오 플레이 화면은
  // 풀해상도 원본(public/scenario/)을 그대로 쓰므로 여기서만 이 경로를 참조한다.
  { domain: '직장', title: '실수했을 때 대처법', bg: '/landing/office.webp' },
  { domain: '취업준비', title: '불안감 다스리기', bg: '/landing/interview_room.webp' },
  { domain: '연인', title: '갈등 상황 중재하기', bg: '/landing/restaurant.webp' },
  { domain: '일상', title: '미루던 할 일 시작하기', bg: '/landing/cafe.webp' },
];

// 요정 매핑 — 중간보고서 PDF 확정: 아코=수용, 포코=재평가, 리프=재초점
const FAIRIES = [
  {
    name: '아코',
    strategy: 'Acceptance',
    slogan: '"있는 그대로 받아들이기"',
    desc: '감정을 판단하거나 억누르지 않고, 지금 느끼는 것을 있는 그대로 알아차리고 받아들이도록 도와줍니다.',
    img: '/landing/ako.webp',
  },
  {
    name: '포코',
    strategy: 'Reappraisal',
    slogan: '"새로운 관점으로 바라보기"',
    desc: '상황을 다른 관점에서 해석하고, 감정을 유발한 생각을 균형 있게 바라보도록 돕습니다.',
    img: '/landing/poko.webp',
  },
  {
    name: '리프',
    strategy: 'Refocusing',
    slogan: '"지금 할 수 있는 일에 집중하기"',
    desc: '부정적인 감정에 머무르기보다, 지금 해결할 수 있는 문제와 행동으로 주의를 전환하도록 안내합니다.',
    img: '/landing/leaf.webp',
  },
];

// 용어는 팀 피드백 반영: "간략한 리포트"(심층 X), "회복일기"(영어 병기 X), "스트레스 반응"(감정 반응 X)
const RECORDS = [
  {
    icon: 'analytics',
    title: '간략한 리포트',
    copy: '10회의 시나리오 체험 후, 선호 전략과 스트레스 반응 패턴을 정리해 보여 드립니다.',
  },
  {
    icon: 'history_edu',
    title: '회복일기',
    copy: '훈련 속에서 선택한 전략과 도움 체감이 자동으로 기록되어, 회복 탄력성이 자라나는 과정을 일기처럼 돌아볼 수 있습니다.',
  },
];

const EFFECTS = [
  { icon: 'self_improvement', title: '반응 패턴 이해', copy: '막연했던 나의 정서 반응을\n객관적으로 이해하게 됩니다.' },
  { icon: 'handyman', title: '적응적 대처 연습', copy: '다양한 상황에 맞는 구체적인\n조절 기술을 손에 익힙니다.' },
  { icon: 'shield_with_heart', title: '정서적 회복탄력성', copy: '어려운 상황에서도 빠르게\n평온을 찾는 힘을 기릅니다.' },
];

const hideBrokenImage = (e: SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.display = 'none';
};

export default function LandingPage({ onStart, onProfileClick }: LandingPageProps) {
  const { user } = useAuthStore();
  const { avatarId, fetchCharacter } = useCharacterStore();

  // 로그인 상태로 랜딩에 바로 들어오면(새로고침·로고 클릭) 스토어가 비어
  // 있어 헤더 아바타가 프리셋을 반영하지 못한다. users/{uid} 한 번 읽기로
  // 홈·마이페이지와 같은 그림을 보장한다.
  useEffect(() => {
    if (user?.uid) fetchCharacter(user.uid);
  }, [user?.uid, fetchCharacter]);

  const topBar = (
    <BrandHeader
      onProfileClick={onProfileClick}
      avatar={{ avatarId, photoURL: user?.photoURL }}
      profileLabel={user ? '마이페이지' : '로그인'}
    />
  );

  const bottomCta = (
    <div className="w-full px-6 py-4 glass-overlay">
      <Button
        id="btn-landing-start"
        onClick={onStart}
        variant="primary"
        icon="arrow_right_alt"
        className="h-14"
      >
        시작하기
      </Button>
    </div>
  );

  return (
    <PageLayout header={topBar} footer={bottomCta}>
      {/* PageLayout이 시맨틱 <main>을 렌더링하므로 여기는 div여야 한다 (main 중첩 금지) */}
      <div className="pt-8 px-6 pb-8 flex flex-col gap-12">

        {/* Section 1 — Hero: 요정 3종 플로팅 + 타이틀 + CTA */}
        <section className="flex flex-col items-center text-center gap-6">
          <div className="flex items-end justify-center gap-4">
            {FAIRIES.map((fairy, i) => (
              <img
                key={fairy.name}
                src={fairy.img}
                alt={fairy.name}
                className="w-24 h-24 object-contain animate-float drop-shadow-lg"
                style={{ animationDelay: `${i * -0.4}s` }}
                onError={hideBrokenImage}
              />
            ))}
          </div>

          <div className="space-y-3">
            <h2 className="text-[32px] font-bold leading-[40px] tracking-tight text-on-surface font-headline">
              나를 더 잘 이해하고,<br />조절하는 힘: REACT
            </h2>
            <p className="text-[16px] leading-[24px] text-on-surface-variant font-body">
              ADHD 경향 대학생의 건강한 정서와 일상을 위한<br />정서 기반 자기조절 지원 서비스
            </p>
          </div>

          <Button onClick={onStart} variant="primary" icon="arrow_right_alt" className="h-12">
            지금 시작하기
          </Button>
        </section>

        {/* Section 2 — 문제 공감 (2×2 도메인 카드) */}
        <section className="flex flex-col gap-4">
          <h3 className="text-[28px] font-bold leading-[36px] text-on-surface font-headline">
            대학 생활의 스트레스,<br />혼자 고민하지 마세요
          </h3>
          <p className="text-[15px] leading-[23px] text-on-surface-variant font-body">
            ADHD의 주요 특성인 주의력 결핍과 충동성은 학업뿐 아니라 대인관계, 취업 준비 등
            대학 생활 전반의 정서적 어려움으로 이어질 수 있습니다.
          </p>
          <p className="text-[15px] leading-[23px] text-on-surface-variant font-body -mt-2">
            REACT는 자신의 정서 반응 패턴을 이해하고, 상황에 맞는 조절 전략을 체득할 수
            있도록 돕습니다.
          </p>

          {/* 팀 피드백(황현): 아이콘과 영역 이름을 크게 */}
          <div className="grid grid-cols-2 gap-4">
            {DOMAINS.map((domain) => (
              <div key={domain.name} className="bento-card p-4 flex flex-col gap-2">
                <span className="material-symbols-outlined text-primary text-[32px]">
                  {domain.icon}
                </span>
                <h4 className="text-[18px] font-bold text-on-surface font-headline">
                  {domain.name}
                </h4>
                <p className="text-[13px] leading-[19px] text-on-surface-variant font-body">
                  {domain.copy}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3 — 체험형 시나리오 (사진 배경 카드) */}
        <section className="flex flex-col gap-4">
          <h3 className="text-[28px] font-bold leading-[36px] text-on-surface font-headline">
            체험형 시나리오로 익히는<br />정서 조절
          </h3>
          <p className="text-[15px] leading-[23px] text-on-surface-variant font-body -mt-1">
            대학생이 실제로 마주하는 다양한 상황을 직접 선택하고 경험하며 건강한 대처법을
            연습하세요.
          </p>

          <div className="flex flex-col gap-4">
            {SCENARIO_CARDS.map((card) => (
              <div key={card.domain} className="bento-card h-[150px] w-full">
                <img
                  src={card.bg}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                  onError={hideBrokenImage}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-scrim-black via-scrim-bg-50 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 flex flex-col items-start gap-1.5">
                  <span className="px-3 py-1 bg-inverse-surface/40 backdrop-blur-xs rounded-full text-[13px] font-bold text-inverse-on-surface font-body">
                    {card.domain}
                  </span>
                  <h4 className="text-[20px] font-bold text-inverse-on-surface font-headline">
                    {card.title}
                  </h4>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 4 — 요정 소개 */}
        <section className="flex flex-col gap-4">
          <h3 className="text-[28px] font-bold leading-[36px] text-on-surface font-headline">
            정서 조절을 돕는 요정 친구들
          </h3>
          <p className="text-[15px] leading-[23px] text-on-surface-variant font-body -mt-1">
            각기 다른 조절 전략을 가진 세 요정이 여러분의 여정을 함께합니다.
          </p>

          <div className="flex flex-col gap-4">
            {FAIRIES.map((fairy) => (
              <div key={fairy.name} className="bento-card p-5 flex items-center gap-4">
                <div className="w-20 h-20 shrink-0 rounded-pane bg-surface-container-low border border-outline-variant flex items-center justify-center overflow-hidden">
                  <img
                    src={fairy.img}
                    alt={fairy.name}
                    className="w-16 h-16 object-contain"
                    loading="lazy"
                    decoding="async"
                    onError={hideBrokenImage}
                  />
                </div>
                <div className="min-w-0">
                  <h4 className="text-[18px] font-bold text-on-surface font-headline">
                    {fairy.name}{' '}
                    <span className="text-[13px] font-semibold text-primary">{fairy.strategy}</span>
                  </h4>
                  <p className="text-[14px] font-semibold text-on-surface-variant font-body italic">
                    {fairy.slogan}
                  </p>
                  <p className="text-[13px] leading-[19px] text-outline font-body mt-1">
                    {fairy.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 5 — 리포트/회복일기 밴드 (팀 피드백: 파스텔 톤) */}
        <section className="rounded-pane bg-secondary-container p-6 flex flex-col gap-6">
          <h3 className="text-[24px] font-bold leading-[32px] text-on-secondary-container font-headline">
            나를 기록하고,<br />변화를 확인하세요
          </h3>
          {RECORDS.map((record) => (
            <div key={record.title} className="flex gap-4">
              <div className="w-12 h-12 shrink-0 rounded-full bg-surface-container-lowest border border-outline-variant flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-[24px]">
                  {record.icon}
                </span>
              </div>
              <div>
                <h4 className="text-[17px] font-bold text-on-secondary-container font-headline">
                  {record.title}
                </h4>
                <p className="text-[14px] leading-[21px] text-on-secondary-container font-body mt-1">
                  {record.copy}
                </p>
              </div>
            </div>
          ))}
        </section>

        {/* Section 6 — 기대효과 */}
        <section className="flex flex-col gap-8">
          {EFFECTS.map((effect) => (
            <div key={effect.title} className="flex flex-col items-center text-center gap-3">
              <div className="p-4 rounded-full bg-surface-container-high">
                <span className="material-symbols-outlined text-primary text-[32px]">
                  {effect.icon}
                </span>
              </div>
              <h4 className="text-[18px] font-bold text-on-surface font-headline">
                {effect.title}
              </h4>
              <p className="text-[14px] leading-[21px] text-on-surface-variant font-body whitespace-pre-line">
                {effect.copy}
              </p>
            </div>
          ))}
        </section>

        {/* Section 7 — 푸터 문구 */}
        <section className="border-t border-outline-variant pt-6 flex flex-col gap-2">
          {/* 이름과 그 풀네임은 한 덩어리로 묶는다 (2026-08-27 UAT) — 섹션의
              gap-2(8px)를 그대로 받으면 풀네임이 아래 소개 문장 쪽에 붙어
              보여서, 머리글자를 푼 줄이 아니라 또 하나의 설명문이 된다. */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[18px] font-bold text-brand font-headline">REACT</span>
            {/* 서비스명의 영문 풀네임이라 번역하지 않는다 */}
            <span className="text-[11px] tracking-[0.02em] text-outline font-body">
              Recognize–Express–Adapt Coping Tool
            </span>
          </div>
          <p className="text-[13px] leading-[19px] text-on-surface-variant font-body">
            ADHD 경향 대학생의 정서 기반 자기조절 지원 서비스
          </p>
          <p className="text-[12px] text-outline font-body">© 2026 REACT Team. All rights reserved.</p>
        </section>
      </div>
    </PageLayout>
  );
}
