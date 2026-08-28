// src/components/common/DebugUnlockToggle.tsx
// 개발자 전용 디버그 해금 토글 — 시나리오 탭과 회복일기 탭이 공유한다.
//
// 검수 문제였던 "누르면 버튼이 사라진다"를 구조로 막는다: 이 버튼은
// 모드 값과 무관하게 항상 렌더되고, 라벨에 **현재 모드와 다음 모드**를
// 함께 적어 지금 어떤 상태인지 화면만 보고 알 수 있게 한다.

import {
  DEBUG_UNLOCK_MODE_LABEL,
  nextDebugUnlockMode,
  type DebugUnlockMode,
} from '../../utils/debugProgress';

interface DebugUnlockToggleProps {
  mode: DebugUnlockMode;
  onCycle: () => void;
  /**
   * 색 토큰 계열. 회복일기 탭은 diary-scope 팔레트를 쓰므로 분리한다
   * (색은 index.css의 시맨틱 토큰만 참조한다).
   */
  tone?: 'app' | 'diary';
  className?: string;
}

export default function DebugUnlockToggle({
  mode,
  onCycle,
  tone = 'app',
  className = '',
}: DebugUnlockToggleProps) {
  const colors =
    tone === 'diary'
      ? 'text-diary-outline hover:text-diary-on-surface'
      : 'text-outline hover:text-on-surface';

  return (
    <button
      type="button"
      onClick={onCycle}
      aria-label={`디버그 해금 모드: ${DEBUG_UNLOCK_MODE_LABEL[mode]}`}
      className={`text-[10px] font-body transition-colors cursor-pointer ${colors} ${className}`}
    >
      [디버그: {DEBUG_UNLOCK_MODE_LABEL[mode]} → {DEBUG_UNLOCK_MODE_LABEL[nextDebugUnlockMode(mode)]}]
    </button>
  );
}
