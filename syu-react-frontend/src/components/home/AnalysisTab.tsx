// src/components/home/AnalysisTab.tsx
// 회복일기 탭의 뷰 상태 머신.
//
// 탭 내부 화면은 전부 이 스테이트 확장으로 처리한다 — 하위 뷰가 자기
// PageLayout을 중첩해 스크롤러를 두 겹 만들지 않도록 하는 관례다.
// 전체화면이 필요한 엔딩만 예외로, 자기 주소(#ending)를 가진 별도 레이어다 —
// 여는 일은 부모(HomePage)에 올린다. 여기서도 뷰를 하나 더 들고 있으면
// "엔딩이 열렸다"는 사실의 출처가 주소와 이 상태로 갈라진다.

import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useCharacterStore } from '../../store/useCharacterStore';
import { useScenarioStore } from '../../store/useScenarioStore';
import { useTestStore } from '../../store/useTestStore';
import type { DiaryLockedGate } from '../diary/DiaryLockedView';
import { findLatestPlayedThemeId } from '../../utils/strategyStats';
import { resolveDisplayProgress, type DebugUnlockMode } from '../../utils/debugProgress';
import DiaryListView from './DiaryListView';
import DiaryDetailView from './DiaryDetailView';
import RecentSessionView from '../diary/RecentSessionView';
import ComprehensiveInsightReport from '../report/ComprehensiveInsightReport';
import EmotionProfileReport from '../report/EmotionProfileReport';

type AnalysisView =
  | 'DIARY_LIST'
  | 'DIARY_DETAIL'
  | 'COMPREHENSIVE'
  | 'RECENT_SESSION'
  | 'TYPE_REPORT';

/** 다른 화면(마이페이지)에서 특정 뷰로 바로 들어올 때의 요청. */
export type AnalysisEntry = 'report';

interface AnalysisTabProps {
  onGoHome: () => void;
  /** 시나리오 탭으로 이동 */
  onGoScenario: () => void;
  /** 최종 엔딩(#ending)으로 이동 — 종합 인사이트 보고서의 마지막 버튼 */
  onGoEnding: () => void;
  /** 캐릭터 생성 페이지로 이동 (잠금 화면 CTA) */
  onStartCreation?: () => void;
  /** 마이페이지 등에서 들어온 진입 요청 (처리 후 onEntryHandled로 비운다) */
  entryRequest?: AnalysisEntry | null;
  onEntryHandled?: () => void;
  /** 개발자 디버그 해금 모드 — HomePage가 시나리오 탭과 공유한다 */
  debugMode?: DebugUnlockMode;
  /** 개발자 계정일 때만 내려온다. 없으면 토글 자체를 그리지 않는다 */
  onCycleDebugMode?: () => void;
}

export default function AnalysisTab({
  onGoHome,
  onGoScenario,
  onGoEnding,
  onStartCreation,
  entryRequest = null,
  onEntryHandled,
  debugMode = 'locked',
  onCycleDebugMode,
}: AnalysisTabProps) {
  const { user } = useAuthStore();
  const { progress: rawProgress, themes, isLoading, isThemesLoading, fetchProgress, fetchThemes } =
    useScenarioStore();
  // 시나리오 배치는 스트레스 검사의 우세 유형에서 나온다. 재검사로 유형이
  // 바뀌면 회복일기가 보는 테마도 새 배치여야 하므로 값만 구독한다 (읽기 전용).
  const stressResultType = useTestStore((s) => s.stressResult?.resultType);

  // 잠금 화면이 안내할 이유. 시나리오 탭의 게이트 순서(캐릭터 → 검사)를
  // 그대로 따른다 — 두 화면이 다른 순서로 판정하면 "회복일기는 검사를 하라
  // 하고 시나리오는 캐릭터를 만들라 한다"처럼 어긋난 안내가 나온다.
  const hasCharacter = useCharacterStore((s) => !!s.character);
  const isTestDone = useTestStore((s) => !!s.adhdResult && !!s.stressResult);
  const lockedGate: DiaryLockedGate = !hasCharacter
    ? 'no-character'
    : !isTestDone
      ? 'test-incomplete'
      : 'ready';

  const [activeView, setActiveView] = useState<AnalysisView>('DIARY_LIST');
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);

  // ── 디버그 경계 ──
  //
  // 해제 모드에서는 실 진행도 대신 합성 진행도를 아래 뷰 전체에 흘려보낸다.
  // 영역 카드 %·앨범 게이지·종합 인사이트 해금·상세 통계가 모두 같은 한 벌을
  // 집계하므로 화면끼리 어긋날 수 없다. 예전에는 DiaryListView가 summaries와
  // album만 100 %로 덮어써서, 카드는 10/10인데 상세 통계는 0건인 화면이 나왔다.
  // **표시 계층에서만 대체하며 저장 경로는 건드리지 않는다.**
  const progress = resolveDisplayProgress(themes, rawProgress, debugMode);

  // 시나리오 진행도 로드 (AnalysisTab이 활성화될 때)
  useEffect(() => {
    fetchThemes();
    if (user?.uid) {
      fetchProgress(user.uid);
    }
  }, [user, stressResultType, fetchProgress, fetchThemes]);

  const latestThemeId = findLatestPlayedThemeId(themes, progress);

  // 마이페이지 "유형 보고서 다시보기" 진입 (NRQ-0082).
  // 가장 최근에 훈련한 영역의 보고서를 연다.
  useEffect(() => {
    if (entryRequest !== 'report' || themes.length === 0) return;
    if (latestThemeId) {
      setSelectedThemeId(latestThemeId);
      setActiveView('TYPE_REPORT');
    }
    onEntryHandled?.();
  }, [entryRequest, themes.length, latestThemeId, onEntryHandled]);

  const handleSelectDiary = (themeId: string) => {
    if (themeId === 'comprehensive') {
      setActiveView('COMPREHENSIVE');
      return;
    }
    setSelectedThemeId(themeId);
    setActiveView('DIARY_DETAIL');
  };

  const handleBackToList = () => {
    setActiveView('DIARY_LIST');
    setSelectedThemeId(null);
  };

  // 로딩 중
  if ((isLoading || isThemesLoading) && activeView === 'DIARY_LIST') {
    return (
      <div className="w-full h-full bento-card p-6 flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 rounded-full border-2 border-primary-container border-t-transparent animate-spin" />
        <p className="text-[14px] text-outline font-body">데이터를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col">
      {activeView === 'DIARY_LIST' && (
        <DiaryListView
          themes={themes}
          progress={progress}
          onSelectDiary={handleSelectDiary}
          onGoRecentSession={() => setActiveView('RECENT_SESSION')}
          onGoScenario={onGoScenario}
          lockedGate={lockedGate}
          onGoCreateCharacter={onStartCreation}
          onGoHome={onGoHome}
          debugMode={debugMode}
          onCycleDebugMode={onCycleDebugMode}
        />
      )}

      {activeView === 'DIARY_DETAIL' && selectedThemeId && (
        <DiaryDetailView
          themeId={selectedThemeId}
          themes={themes}
          progress={progress}
          onBack={handleBackToList}
          onGoScenario={onGoScenario}
        />
      )}

      {activeView === 'COMPREHENSIVE' && (
        <ComprehensiveInsightReport
          progress={progress}
          onBack={handleBackToList}
          onGoEnding={onGoEnding}
        />
      )}

      {activeView === 'RECENT_SESSION' && latestThemeId && (
        <RecentSessionView
          themes={themes}
          progress={progress}
          themeId={latestThemeId}
          onBack={handleBackToList}
          onGoScenario={onGoScenario}
        />
      )}

      {activeView === 'TYPE_REPORT' && selectedThemeId && (
        <EmotionProfileReport
          themeId={selectedThemeId}
          progress={progress}
          onClose={handleBackToList}
        />
      )}
    </div>
  );
}
