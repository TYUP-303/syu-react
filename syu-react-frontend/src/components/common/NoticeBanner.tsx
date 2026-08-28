// src/components/common/NoticeBanner.tsx
// 서비스 공지 배너 (settings/notice).
//
// 왜 필요한가 —
//   개인정보 처리방침 제11조가 "시행 최소 7일 전에 서비스 내 공지를 통해
//   알린다"고 약속하는데, 정작 서비스 안에 공지를 띄울 수단이 없었다.
//   약속한 통로를 실제로 만드는 컴포넌트다. 본문은 운영팀이 어드민
//   「약관·공지 관리」에서 쓰고, 앱은 읽어서 보여 주기만 한다.
//
// 배치 —
//   MobileWrapper가 프레임 최상단 행에 놓는다. **스크롤러 밖**이라
//   PageLayout이 소유한 콘텐츠 스크롤과 겹치지 않고(오버스크롤 바운스에도
//   흔들리지 않는다), 어느 페이지에 있든 같은 자리에 뜬다. fixed/sticky를
//   쓰지 않는 것은 앱 셸의 레이아웃 규약 그대로다.
//
// 닫기 —
//   닫음 상태는 스토어(세션)에만 남긴다. localStorage에 남기지 않는 것은
//   의도다: 공지는 대개 기간이 짧고, 놓친 사용자가 새로고침으로 다시 볼 수
//   있는 편이 영구히 못 보는 것보다 낫다.

import { useSettingsStore } from '../../store/useSettingsStore';
import { COPY } from '../../constants/copy';

export default function NoticeBanner() {
  const notice = useSettingsStore((state) => state.notice);
  const dismissedNoticeMessage = useSettingsStore((state) => state.dismissedNoticeMessage);
  const dismissNotice = useSettingsStore((state) => state.dismissNotice);

  // 본문 검사를 여기서 한 번 더 한다. resolveNotice가 이미 걸러 내지만,
  // 스토어를 직접 세팅하는 경로(테스트·향후 호출부)로 빈 배너가 뜨면
  // 사용자는 닫을 수 없는 빈 줄을 보게 된다 — 값싼 방어다.
  //
  // 닫힘 판정을 본문으로 한다 — 운영팀이 새 공지를 올리면 다시 떠야 한다.
  if (!notice.active || !notice.message || dismissedNoticeMessage === notice.message) return null;

  return (
    <div
      // role="status": 화면을 덮는 알림이 아니라 곁들이는 안내다. alert로 두면
      // 스크린리더가 사용자의 현재 작업을 끊고 읽는다.
      role="status"
      className="
        shrink-0 z-30
        flex items-start gap-2
        px-4 py-2.5
        bg-secondary-container text-on-secondary-container
        border-b border-outline-variant
      "
    >
      <span className="material-symbols-outlined text-[18px] leading-5 shrink-0" aria-hidden="true">
        campaign
      </span>

      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-bold tracking-wider uppercase opacity-70 font-body">
          {COPY.notice.label}
        </span>
        {/* 긴 공지가 화면을 통째로 먹지 않도록 높이를 제한하고 안에서 스크롤한다.
            whitespace-pre-line: 어드민에서 넣은 줄바꿈을 그대로 살린다. */}
        <p className="text-[12px] leading-relaxed font-body whitespace-pre-line break-words max-h-24 overflow-y-auto overscroll-y-none">
          {notice.message}
        </p>
      </div>

      <button
        type="button"
        onClick={dismissNotice}
        aria-label={COPY.notice.dismiss}
        className="shrink-0 -mr-1 p-1 rounded-control hover:bg-surface-container-high/40 transition-colors cursor-pointer"
      >
        <span className="material-symbols-outlined text-[18px] leading-5" aria-hidden="true">
          close
        </span>
      </button>
    </div>
  );
}
