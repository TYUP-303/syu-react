// src/utils/avatar.ts
// 프로필 아바타 표시 우선순위의 **유일한** 결정 지점.
//
// 아바타를 그리는 화면이 늘어날 때마다 우선순위를 각자 if로 쓰면 화면끼리
// 어긋난다(마이페이지는 프리셋, 헤더는 구글 사진처럼). 어디서 그리든 이
// 함수를 통과시키고, 결과 descriptor만 렌더링한다.
//
// 우선순위 4단:
//   1. avatarUrl  — 사용자가 직접 업로드한 사진 (Firebase Storage, **2차 예정**)
//   2. avatarId   — 프리셋 선택 (constants/avatarPresets.ts)
//   3. photoURL   — Firebase Auth 프로필 사진 (구글 로그인 시 자동)
//   4. 없음       — 기본 아이콘
//
// 1단은 지금 어디서도 채워지지 않는다(항상 undefined). Storage 업로드가
// 붙는 2차 작업이 "필드를 읽어 넣는 것"만으로 끝나도록 자리와 분기를 먼저
// 만들어 둔 것이다 — 그때 이 파일은 손대지 않아도 된다.
//
// Auth의 photoURL은 어느 경로에서도 쓰지 않고 **읽기만** 한다. 프리셋을
// 골랐다고 photoURL을 덮어쓰면 구글 재로그인 때마다 값이 되돌아가 사용자
// 선택이 사라진다.

import { getAvatarPreset, type AvatarCrop } from '../constants/avatarPresets';

export interface AvatarSource {
  /** users/{uid}.avatarUrl — 2차 예정. 지금은 항상 비어 있다. */
  avatarUrl?: string | null;
  /** users/{uid}.avatarId — 프리셋 id */
  avatarId?: string | null;
  /** Firebase Auth User.photoURL */
  photoURL?: string | null;
}

export type AvatarKind = 'upload' | 'preset' | 'photo' | 'default';

export interface ResolvedAvatar {
  /** null이면 그릴 이미지가 없다 — 기본 아이콘으로 떨어진다. */
  src: string | null;
  /** 얼굴만 확대해 보여 주는 프리셋의 크롭 값. 프리셋이 아니면 null. */
  crop: AvatarCrop | null;
  /** 원본 비율을 살릴지(contain) 원을 채울지(cover). */
  fit: 'cover' | 'contain';
  /** 어느 단계에서 결정됐는지 — 테스트와 디버깅용 */
  kind: AvatarKind;
}

function usable(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveAvatar(source: AvatarSource): ResolvedAvatar {
  const uploaded = usable(source.avatarUrl);
  if (uploaded) {
    return { src: uploaded, crop: null, fit: 'cover', kind: 'upload' };
  }

  // 알 수 없는 id(목록에서 빠진 프리셋 등)는 여기서 걸러져 다음 순위로 넘어간다.
  const preset = getAvatarPreset(source.avatarId);
  if (preset) {
    return {
      src: preset.src,
      crop: preset.crop ?? null,
      // 지금은 7종 전부 crop을 가지므로 UserAvatar가 fit을 보지 않는다.
      // crop을 생략한 프리셋이 나중에 추가될 때를 위한 값 — 원본을 잘라내지
      // 않고 통째로 넣는 쪽이 안전한 기본값이다.
      fit: 'contain',
      kind: 'preset',
    };
  }

  const photo = usable(source.photoURL);
  if (photo) {
    return { src: photo, crop: null, fit: 'cover', kind: 'photo' };
  }

  return { src: null, crop: null, fit: 'cover', kind: 'default' };
}
