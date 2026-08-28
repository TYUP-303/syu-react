// src/components/ui/LastLoginBadge.tsx
// "최근 사용" 부착형 칩 (2026-08-07 사용자 확정).
//
// 말풍선(꼬리 달린 플로팅)이 아니라, 앵커 버튼의 **우상단 모서리에 겹쳐
// 붙는 리본**이다 — 구글·카카오 로그인 화면의 "최근 사용" 컨벤션.
// 부모(버튼을 감싼 래퍼)에 relative가 필요하다. absolute라 레이아웃
// 공간을 차지하지 않으므로 주변 간격 보정이 필요 없다.
//
// 이메일·구글 두 버튼이 같은 칩을 공유한다. 보이는 문구는 같고 **어느
// 버튼에 붙어 있는지**가 곧 수단 표시이므로, 화면을 볼 수 없는 사용자를
// 위해 aria-label에 수단을 명시한다.
//
// 애니메이션은 쓰지 않는다 — 주의를 끄는 것이 아니라 읽히는 것이 목적
// (breathing이 시인성을 해친다는 검수 확정, 2026-08-07).

import { COPY } from '../../constants/copy';
import type { LastLoginMethod } from '../../utils/lastLoginMethod';

interface LastLoginBadgeProps {
  /** 이 칩이 붙은 버튼의 로그인 수단 */
  method: LastLoginMethod;
}

export default function LastLoginBadge({ method }: LastLoginBadgeProps) {
  return (
    <span
      role="status"
      aria-label={COPY.login.lastLoginBadgeLabel(method)}
      className="
        absolute -top-2 right-3 z-30
        rounded-full px-2 py-0.5
        bg-surface-container-high border border-outline-variant/60
        text-[10px] font-bold text-on-surface-variant whitespace-nowrap font-body
      "
    >
      {COPY.login.lastLoginBadge}
    </span>
  );
}
