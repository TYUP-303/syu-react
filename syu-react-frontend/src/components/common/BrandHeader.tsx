// src/components/common/BrandHeader.tsx
// 브랜드 로고 + 프로필 버튼 상단 앱 바 (HomePage·LandingPage 공용).
// PageLayout의 header 슬롯에 넣어 사용한다.

import UserAvatar from './UserAvatar';
import type { AvatarSource } from '../../utils/avatar';

interface BrandHeaderProps {
  /** 로고 클릭 (미지정 시 정적 로고) */
  onLogoClick?: () => void;
  /** 우측 프로필 버튼 클릭 */
  onProfileClick: () => void;
  /**
   * 프로필 이미지 출처. 우선순위 판정은 UserAvatar(→ utils/avatar)가 한다 —
   * 예전에는 photoURL 하나만 받아서 프리셋 아바타가 헤더에만 반영되지
   * 않는 식으로 화면끼리 어긋날 수 있었다.
   */
  avatar?: AvatarSource;
  /** 프로필 버튼 접근성 라벨 */
  profileLabel?: string;
}

export default function BrandHeader({
  onLogoClick,
  onProfileClick,
  avatar,
  profileLabel = '마이페이지',
}: BrandHeaderProps) {
  const brand = (
    <>
      {/* 팀 로고 마크(조세현, 2026-08-26). 바로 옆 'REACT' 텍스트가 이미
          이름을 말하므로 마크는 장식이다 — alt는 빈 문자열로 두고 접근
          가능한 이름에 아무것도 더하지 않는다. 마크가 들어오면서 Stitch 시절의
          psychology 아이콘은 뺐다(8/26) — 마크·아이콘·텍스트 셋이 나란히 서면 과하다. 로고를 감싸는 button의
          이름은 aria-label('서비스 소개')이 소유한다. width/height는
          h-6로 그려지기 전 자리를 잡아 두기 위한 원본 비율이다. */}
      <img
        src="/brand/logo-mark.webp"
        alt=""
        aria-hidden
        width={512}
        height={352}
        className="h-6 w-auto"
      />
      <span className="text-[20px] font-bold tracking-tight text-brand font-headline">
        REACT
      </span>
    </>
  );

  return (
    <header className="
      w-full flex justify-between items-center
      px-6 h-16
      bg-surface/80 backdrop-blur-md
      border-b border-outline-variant/30
    ">
      {onLogoClick ? (
        <button
          onClick={onLogoClick}
          className="flex items-center gap-2 text-brand hover:opacity-70 transition-opacity cursor-pointer"
          aria-label="서비스 소개"
        >
          {brand}
        </button>
      ) : (
        <div className="flex items-center gap-2 text-brand">{brand}</div>
      )}

      <button
        onClick={onProfileClick}
        className="text-on-surface-variant hover:text-primary transition-colors flex items-center cursor-pointer"
        aria-label={profileLabel}
      >
        {/* 테두리는 중립 회색(outline-variant)이다. 파란 테두리(primary
            계열)를 두르면 32px 원 안의 얼굴보다 링이 먼저 눈에 들어오고,
            바로 왼쪽 REACT 로고와 같은 파랑이라 헤더에 파란 점이 둘
            찍힌 것처럼 보인다. 마이페이지 프로필 사진과 같은 톤이다. */}
        <UserAvatar
          {...avatar}
          className="w-8 h-8 border border-outline-variant/50"
          iconClassName="text-[24px]"
        />
      </button>
    </header>
  );
}
