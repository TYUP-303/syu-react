// src/components/common/UserAvatar.tsx
// 프로필 아바타를 그리는 단 하나의 컴포넌트.
//
// 우선순위 판정은 utils/avatar.ts가, 그리기는 여기가 맡는다. 아바타가
// 보이는 자리(마이페이지 프로필 카드, 상단 BrandHeader, 프리셋 선택
// 그리드)가 전부 이걸 쓰므로 크롭·폴백이 화면마다 달라질 수 없다.

import { resolveAvatar, type AvatarSource } from '../../utils/avatar';

interface UserAvatarProps extends AvatarSource {
  /** 크기·테두리 등 원 자체의 클래스 (예: 'w-8 h-8 border border-outline-variant/50') */
  className?: string;
  /** 이미지가 없을 때 쓰는 폴백 원의 추가 클래스 */
  fallbackClassName?: string;
  /** 폴백 아이콘 크기 */
  iconClassName?: string;
  alt?: string;
}

export default function UserAvatar({
  avatarUrl,
  avatarId,
  photoURL,
  className = '',
  fallbackClassName = '',
  iconClassName = 'text-[24px]',
  alt = '프로필',
}: UserAvatarProps) {
  const { src, crop, fit } = resolveAvatar({ avatarUrl, avatarId, photoURL });

  if (!src) {
    return (
      <span
        className={`rounded-full flex items-center justify-center shrink-0 ${className} ${fallbackClassName}`}
      >
        <span className={`material-symbols-outlined ${iconClassName}`} role="img" aria-label={alt}>
          account_circle
        </span>
      </span>
    );
  }

  return (
    <span
      className={`relative block overflow-hidden rounded-full shrink-0 bg-surface-container-high ${className}`}
    >
      {crop ? (
        // 전신 스프라이트에서 얼굴만 확대해 잘라 쓴다. left/top은 컨테이너
        // 기준 %라 크기가 달라져도(32px 헤더 ↔ 56px 프로필) 같은 구도가 나온다.
        <img
          src={src}
          alt={alt}
          className="absolute max-w-none"
          style={{ width: `${crop.zoom * 100}%`, left: `${crop.x}%`, top: `${crop.y}%` }}
        />
      ) : (
        <img
          src={src}
          alt={alt}
          className={`absolute inset-0 w-full h-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`}
        />
      )}
    </span>
  );
}
