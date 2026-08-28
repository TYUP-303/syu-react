// src/components/home/DiaryListView.tsx
// 회복일기 홈 (시안 03·12, 완성 상태는 04).
//
// 구성: 회복 앨범 게이지 n/4 → 영역 카드 4장 → 종합 인사이트 카드.
// 완주한 기록이 하나도 없으면 잠금 화면(시안 07·10)으로 갈아 끼운다.
//
// 스크롤은 PageLayout이 소유한다 — 여기서 자체 스크롤러를 만들지 않는다.
// (R2 이전에는 이 파일이 overflow-y-auto 컨테이너를 직접 들고 있어
//  탭 안에 스크롤러가 두 겹으로 겹쳤다.)

import { useState } from 'react';
import { useCharacterStore } from '../../store/useCharacterStore';
import type { ThemeCategory } from '../../api/scenarioMockData';
import type { ScenarioProgressMap } from '../../store/useScenarioStore';
import { getDiaryByThemeId } from '../../api/diaryContent';
import {
  computeAlbumProgress,
  findLatestPlayedThemeId,
  summarizeThemeProgress,
} from '../../utils/strategyStats';
import { COPY } from '../../constants/copy';
import Modal from '../ui/Modal';
import DebugUnlockToggle from '../common/DebugUnlockToggle';
import type { DebugUnlockMode } from '../../utils/debugProgress';
import DiaryAlbumGauge from '../diary/DiaryAlbumGauge';
import DiaryAreaCard from '../diary/DiaryAreaCard';
import DiaryComprehensiveCard from '../diary/DiaryComprehensiveCard';
import DiaryLockedView, { type DiaryLockedGate } from '../diary/DiaryLockedView';

interface DiaryListViewProps {
  themes: ThemeCategory[];
  /**
   * 표시용 진행도. 개발자 디버그 해금은 AnalysisTab이 **이 값 자체를**
   * 합성 데이터로 바꿔 넘긴다 — 이 뷰는 실데이터와 구분하지 않고 그대로
   * 집계한다. (예전에는 여기서 summaries·album만 100 %로 덮어써서
   * 카드는 완주인데 상세 통계는 0건인 화면이 나왔다.)
   */
  progress: ScenarioProgressMap;
  onSelectDiary: (themeId: string) => void;
  /** "이번 훈련 기록"(시안 05)으로 이동 */
  onGoRecentSession: () => void;
  /** 시나리오 탭으로 이동 (잠금 화면·미시작 영역 안내에서 사용) */
  onGoScenario: () => void;
  /**
   * 잠금 화면이 안내할 상태. 기록이 0건인 이유가 캐릭터 없음·검사 미완이면
   * 시나리오로 보내 봐야 게이트에 다시 막히므로 CTA 목적지가 달라진다.
   */
  lockedGate?: DiaryLockedGate;
  /** 캐릭터 생성 페이지로 (lockedGate='no-character') */
  onGoCreateCharacter?: () => void;
  /** 홈 탭으로 (lockedGate='test-incomplete' — 검사 동선의 출발점) */
  onGoHome?: () => void;
  /** 개발자 디버그 해금 모드 (표시용 — 토글 라벨에만 쓴다) */
  debugMode?: DebugUnlockMode;
  /** 개발자 계정일 때만 내려온다. 없으면 토글 자체를 그리지 않는다 */
  onCycleDebugMode?: () => void;
}

interface NoticeModalState {
  open: boolean;
  title: string;
  message: string;
}

export default function DiaryListView({
  themes,
  progress,
  onSelectDiary,
  onGoRecentSession,
  onGoScenario,
  lockedGate,
  onGoCreateCharacter,
  onGoHome,
  debugMode = 'locked',
  onCycleDebugMode,
}: DiaryListViewProps) {
  // 값만 구독한다(읽기 전용) — 닉네임은 마이페이지에서 언제든 바뀌므로
  // 렌더 시점에 스토어에서 읽어야 변경이 바로 반영된다.
  const nickname = useCharacterStore((s) => s.character?.nickname);
  const [notice, setNotice] = useState<NoticeModalState>({
    open: false,
    title: '',
    message: '',
  });

  const album = computeAlbumProgress(themes, progress);
  const summaries = themes.map((theme) => summarizeThemeProgress(theme, progress));
  const latestThemeId = findLatestPlayedThemeId(themes, progress);
  const hasAnyRecord = album.clearedEpisodes > 0;
  const isComprehensiveUnlocked = album.isAllComplete;

  // 디버그 토글은 잠금 화면에서도 사라지면 안 된다 — 여기서 끄고 켤 수
  // 없으면 락 모드로 돌아온 개발자가 다시 해제할 방법이 없다.
  const debugToggle = onCycleDebugMode ? (
    <DebugUnlockToggle
      mode={debugMode}
      onCycle={onCycleDebugMode}
      tone="diary"
      className="text-left px-1"
    />
  ) : null;

  // 완주 기록이 0건이면 보여 줄 것이 없다 → 잠금 화면.
  // (디버그 해제 모드에서는 progress 자체가 합성 데이터라 여기까지 오지 않는다.)
  if (!hasAnyRecord) {
    return (
      <div className="diary-scope w-full flex flex-col gap-2">
        <DiaryLockedView
          gate={lockedGate}
          onGoScenario={onGoScenario}
          onGoCreateCharacter={onGoCreateCharacter}
          onGoHome={onGoHome}
        />
        {debugToggle}
      </div>
    );
  }

  const handleAreaClick = (themeId: string, isStarted: boolean, title: string) => {
    // 진행 중 열람 완화(2026-08-07 PM 확정): 완주 전에도 누적 기록을 연다.
    // 기록이 0건인 미시작 영역만 막는다.
    if (isStarted) {
      onSelectDiary(themeId);
      return;
    }
    setNotice({
      open: true,
      title: COPY.diary.areaNotStartedTitle(title),
      message: COPY.diary.areaNotStartedMessage,
    });
  };

  const handleComprehensiveClick = () => {
    if (isComprehensiveUnlocked) {
      onSelectDiary('comprehensive');
      return;
    }
    setNotice({
      open: true,
      title: COPY.diary.comprehensiveLockedTitle,
      message: COPY.diary.comprehensiveLockedMessage(album.completedThemes, album.totalThemes),
    });
  };

  // 완료 영역이 하나라도 있으면 종합 인사이트를 목록 맨 위로 올린다.
  // 형태(큰 잠금 카드 / 얇은 스트립 / 해금 카드)는 카드 컴포넌트가 고른다.
  const comprehensiveOnTop = album.completedThemes > 0;
  const comprehensiveCard = (
    <DiaryComprehensiveCard
      isUnlocked={isComprehensiveUnlocked}
      completedThemes={album.completedThemes}
      totalThemes={album.totalThemes}
      segments={summaries.map((s) => ({ themeId: s.themeId, isComplete: s.isComplete }))}
      onClick={handleComprehensiveClick}
    />
  );

  const albumMessage = album.isAllComplete
    ? COPY.diary.albumComplete
    : album.completedThemes > 0
      ? COPY.diary.albumInProgress(album.completedThemes)
      : COPY.diary.albumStarted;

  return (
    <div className="diary-scope w-full flex flex-col gap-4 p-4 rounded-pane animate-fadeIn">
      {/* ── 상단 고정 블록 (타이틀 · 앨범 게이지) ──
          "지금 내 회복 앨범이 몇 칸인가"만 고정하고 나머지는 아래로 흘린다.
          (2026-08-27 UAT R3-09: 여기 있던 "이번 훈련 기록 보기"는 한 번 누르면
           끝나는 이동 버튼이라 스크롤 내내 자리를 차지할 이유가 없어 밖으로
           내보냈다. 고정 블록에는 화면의 정체성을 말하는 것만 남긴다.)

          -mt-10 / -mx-10: 위·옆 여백(HomePage 래퍼 py-6·px-6 = 24px +
          이 뷰의 p-4 = 16px, 합 40px)을 정확히 상쇄해 정적 위치를
          스크롤포트 모서리에 맞춘다. 딱 맞게 상쇄해야 sticky 보정이 0이
          되어 스크롤 0에서 아래 카드와 겹치지 않는다. px-10으로 안쪽
          여백을 되돌리고, 불투명 bg가 지나가는 카드를 가린다.
          (EpisodeListView와 같은 패턴 — PageLayout이 스크롤을 소유하므로
           자체 스크롤러나 PageLayout 중첩은 만들지 않는다.) */}
      <div className="sticky top-0 z-20 -mt-10 -mx-10 px-10 pt-4 pb-3 bg-diary-surface flex flex-col gap-3">
        {/* 페이드 엣지 — 고정 블록 아래로 카드가 지나갈 때 뚝 끊기지 않고
            서서히 사라지게 해서, 아래가 스크롤 영역임을 알린다 (스크롤 어포던스) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-full h-4 bg-gradient-to-b from-diary-surface to-transparent"
        />
        {/* px-1은 2뎁스(DiaryStickyHeader)의 본문 블록과 같은 값이어야 한다 —
            제목 x좌표를 뎁스와 무관하게 맞추는 계약이다. 한쪽만 고치지 말 것. */}
        <header className="space-y-1 px-1">
          {album.isAllComplete && (
            <p className="text-[11px] font-bold text-diary-primary font-headline">회복 여정 완료</p>
          )}
          <h2 className="text-[20px] font-extrabold text-diary-on-surface font-headline">
            {album.isAllComplete
              ? COPY.diary.listTitleComplete(nickname)
              : COPY.diary.listTitle(nickname)}
          </h2>
          <p className="text-[12px] leading-[20px] text-diary-on-surface-variant font-body">
            {album.isAllComplete
              ? COPY.diary.listIntroComplete
              : COPY.diary.listIntroInProgress}
          </p>
        </header>

        {/* ── 회복 앨범 게이지 ── */}
        <DiaryAlbumGauge album={album} message={albumMessage} />
      </div>

      {/* ── 최근 훈련 기록 바로가기 (시안 05) ──
          고정 블록 **밖**이다. 카드 목록과 함께 스크롤돼 위로 사라진다
          (2026-08-27 UAT R3-09). 고정 블록의 -mt-10/-mx-10 상쇄 계약을
          건드리지 않도록 여기서는 바깥 컨테이너의 gap-4만 쓴다. */}
      {latestThemeId && (
        <button
          type="button"
          onClick={onGoRecentSession}
          className="w-full flex items-center gap-2 px-4 py-3 rounded-control bg-diary-surface-low
            border border-diary-outline-variant/50 text-left transition-all active:scale-[0.99]
            hover:border-diary-primary/40"
        >
          <span className="material-symbols-outlined text-[18px] text-diary-primary shrink-0">
            history
          </span>
          <span className="flex-1 text-[12px] font-bold text-diary-on-surface font-body">
            이번 훈련 기록 보기
          </span>
          <span className="material-symbols-outlined text-[18px] text-diary-outline shrink-0">
            chevron_right
          </span>
        </button>
      )}

      {/* 디버그 토글 — 개발자에게만 보이는 줄이라 고정 블록 밖(스크롤
          영역)에 둔다. 안에 넣으면 고정 높이만 축내고 값어치는 없다. */}
      {debugToggle && <div className="-mt-1">{debugToggle}</div>}

      {/* ── 영역 카드 ── */}
      <div className="flex flex-col gap-3">
        {/* 종합 인사이트의 자리는 진행에 따라 바뀐다 (2026-08-27 UAT R2-17).
            완료 0개면 보여 줄 진행이 없으니 예전처럼 맨 아래 잠금 카드로
            두고, 1개 이상이면(해금 포함) 맨 위로 올린다 — 한 영역이라도
            끝낸 사용자에게는 이게 목록의 결론이고, 목록 끝까지 스크롤해야
            자기 진행이 보이는 것은 순서가 뒤집힌 것이었다. */}
        {comprehensiveOnTop && comprehensiveCard}

        {summaries.map((summary) => (
          <DiaryAreaCard
            key={summary.themeId}
            summary={summary}
            areaHint={getDiaryByThemeId(summary.themeId)?.areaHint}
            onClick={() => handleAreaClick(summary.themeId, summary.isStarted, summary.title)}
          />
        ))}

        {!comprehensiveOnTop && comprehensiveCard}
      </div>

      {/* 안내 모달 — Portal 모달이라 탭바보다 항상 위 */}
      {notice.open && (
        <Modal
          onBackdropClick={() => setNotice({ ...notice, open: false })}
          cardClassName="space-y-4"
        >
          <div className="w-14 h-14 mx-auto rounded-full bg-outline-variant/10 border border-outline-variant/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-[28px] text-outline">lock</span>
          </div>
          <div className="space-y-1">
            <h4 className="text-[17px] font-bold text-on-surface font-headline">{notice.title}</h4>
            <p className="text-[12px] text-outline leading-relaxed font-body whitespace-pre-line">
              {notice.message}
            </p>
          </div>
          <button
            onClick={() => setNotice({ ...notice, open: false })}
            className="w-full py-3 rounded-control bg-surface-container-high border border-outline-variant/30 text-[14px] font-bold text-on-surface hover:bg-surface-container-highest transition-colors"
          >
            {COPY.common.confirm}
          </button>
        </Modal>
      )}
    </div>
  );
}
