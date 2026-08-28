// src/components/common/GateNoticeCard.tsx
// 진입 게이트 안내 카드 — "여기는 아직 열 수 없다"를 말하고, 그것을 푸는
// 곳으로 보내는 한 장짜리 화면.
//
// ── 왜 공용으로 뽑았나 (UAT 2026-08-18) ──
// 같은 상태("아직 캐릭터가 없어요")가 탭마다 아예 다른 그림으로 떠 있었다:
//   - 시나리오 탭 : bento-card + 64px 아이콘(person_add) + 글로우
//   - 회복일기 탭 : diary-scope 원형 판 + lock 아이콘 + 펄스
// 사용자에게는 같은 하나의 사실인데 화면이 둘이라, 탭을 옮길 때마다 다른
// 시스템에 들어온 것처럼 읽혔다. 껍데기는 여기로 합치고 **문구·아이콘·목적지만**
// 호출부가 정한다.
//
// 기준 스타일은 시나리오 탭 쪽(bento-card)이다. 회복일기 탭의 색 토큰
// (--color-diary-*)은 전부 기본 토큰의 별칭이므로(index.css의 diary 별칭 블록),
// .diary-scope 안에서 이 카드를 그려도 색이 어긋나지 않는다.
//
// 본문(body)의 \n은 그대로 살린다 — 안내문이 접히는 자리를 브라우저 임의가
// 아니라 문구(COPY)가 정하기 위한 규약이다.

import Button from '../ui/Button';

interface GateNoticeCardProps {
  /** 상단 64px 심볼. 막힌 이유를 그림으로 한 번 더 말한다 (예: person_add). */
  icon: string;
  title: string;
  /** 안내문. `\n`은 whitespace-pre-line으로 줄바꿈된다. */
  body: string;
  /** 버튼 라벨 — 동사형(`COPY.scenario.gate*Cta`). */
  ctaLabel: string;
  onCtaClick: () => void;
  /**
   * 버튼 강조도. 막힌 것을 **푸는** 동선이면 primary(캐릭터 만들기, 검사
   * 하러 가기), 그냥 물러나는 동선이면 outline(홈으로 돌아가기).
   */
  ctaVariant?: 'primary' | 'outline';
}

export default function GateNoticeCard({
  icon,
  title,
  body,
  ctaLabel,
  onCtaClick,
  ctaVariant = 'primary',
}: GateNoticeCardProps) {
  return (
    <div className="w-full bento-card p-6 flex flex-col items-center justify-center gap-6 text-center py-16 animate-fadeIn">
      <div className="relative">
        <div className="absolute inset-0 bg-primary-container/10 blur-[30px] rounded-full" />
        <span
          className="material-symbols-outlined text-[64px] text-primary relative z-10 animate-bounce"
          style={{ animationDuration: '3s' }}
        >
          {icon}
        </span>
      </div>

      <div className="space-y-2">
        <h3 className="text-[20px] font-bold text-on-surface font-headline">{title}</h3>
        <p className="text-[14px] text-outline font-body leading-relaxed max-w-[280px] mx-auto whitespace-pre-line">
          {body}
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-[260px] mx-auto">
        <Button variant={ctaVariant} onClick={onCtaClick} className="w-full font-bold">
          {ctaLabel}
        </Button>
      </div>
    </div>
  );
}
