import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { useCharacterStore } from '../../store/useCharacterStore';
import { useScenarioStore } from '../../store/useScenarioStore';
import { useTestStore } from '../../store/useTestStore';
import ThemeListView from '../scenario/ThemeListView';
import EpisodeListView from '../scenario/EpisodeListView';
import VisualNovelPlayer from '../scenario/VisualNovelPlayer';
import EpiloguePlayer from '../scenario/EpiloguePlayer';
import TypeReportView from '../scenario/TypeReportView';
import UnlockNoticeModal from '../common/UnlockNoticeModal';
import DebugUnlockToggle from '../common/DebugUnlockToggle';
import GateNoticeCard from '../common/GateNoticeCard';
import { resolveDisplayProgress, type DebugUnlockMode } from '../../utils/debugProgress';
import { summarizeThemeProgress } from '../../utils/strategyStats';
import { isEpisodeUnlockedAt } from '../../utils/episodeUnlock';
import {
  formatScenarioPath,
  parseScenarioPath,
  splitHashSegments,
  THEME_LIST_ROUTE,
  type ScenarioRoute,
} from '../../utils/scenarioRoute';
import { COPY } from '../../constants/copy';

interface ScenarioTabProps {
  onGoHome: () => void;
  onGoTab?: (tab: 'home' | 'scenario' | 'analysis' | 'mypage') => void;
  /** 개발자 디버그 해금 모드 — HomePage가 회복일기 탭과 공유한다 */
  debugMode?: DebugUnlockMode;
  /** 개발자 계정일 때만 내려온다. 없으면 토글 자체를 그리지 않는다 */
  onCycleDebugMode?: () => void;
  /**
   * `#scenario` 뒤의 하위 경로 ('' | '/workplace' | '/workplace/1' | '/workplace/epilogue').
   *
   * 두 프롭은 **함께 옵셔널**이다. 주소를 쥔 App에서 내려올 때만 동기화가
   * 켜지고, 컴포넌트만 단독으로 마운트하는 테스트에서는 예전처럼 자체 상태로만
   * 돈다 — 그 경우까지 window.location을 만지면 테스트가 서로의 주소를 오염시킨다.
   */
  scenarioPath?: string;
  onScenarioPathChange?: (path: string, options?: { replace?: boolean }) => void;
  /**
   * 유형 보고서(TYPE_REPORT)가 이 탭을 덮고 있는지 알린다 (2026-08-27 R3-05).
   *
   * 이 화면만 **자기 주소가 없다** — 영역을 마친 직후 스쳐 가는 자리라 그
   * 영역의 목록 주소에 얹혀 산다(위 동기화 주석). 그래서 주소를 쥔 쪽에서는
   * 보고서가 떠 있는지 알 방법이 없어, 하단 탭바가 '시나리오'를 활성으로
   * 칠한 채로 남았다. 주소로 알 수 없는 것을 콜백으로 대신 전한다.
   *
   * 언마운트될 때 false를 되쏘므로 받는 쪽이 따로 되돌릴 필요가 없다.
   */
  onReportOpenChange?: (open: boolean) => void;
}

type ScenarioView = 'THEME_LIST' | 'EPISODE_LIST' | 'PLAYER' | 'EPILOGUE' | 'TYPE_REPORT';

export default function ScenarioTab({
  onGoHome,
  onGoTab,
  debugMode = 'locked',
  onCycleDebugMode,
  scenarioPath,
  onScenarioPathChange,
  onReportOpenChange,
}: ScenarioTabProps) {
  const { user } = useAuthStore();
  const { character } = useCharacterStore();
  const {
    progress,
    themes,
    seenReports,
    epiloguesSeen,
    isLoading,
    isThemesLoading,
    fetchProgress,
    fetchThemes,
    markReportSeen,
  } = useScenarioStore();
  const { adhdResult, stressResult } = useTestStore();

  const [activeView, setActiveView] = useState<ScenarioView>('THEME_LIST');
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);

  // ── 완주 흐름의 두 안내 모달 (2026-08-27 UAT R2-25·R2-28·R3-08) ──
  //
  //   10편 완료 → 목록 + [에필로그가 열렸어요]
  //                ├ 보러가기   → 에필로그 → 끝까지 읽음 ┐
  //                └ 나중에 볼게요 ───────────────────────┴→ [회복일기 기록 완성]
  //                                                        → 유형 보고서(최초 1회)
  //                                                          또는 회복일기 탭
  //
  // 예전에는 10편째를 마치는 순간 곧바로 보고서나 회복일기로 튀어서, 방금
  // 열린 에필로그를 사용자가 보지 못한 채 영역을 떠났다(R2-25). 마무리
  // 이야기를 흐름의 **가운데**에 세우고, 다음 목적지 안내는 그 뒤로 미룬다.
  //
  // 미루는 대상은 에필로그뿐이다 — '나중에 볼게요'도 마무리 안내로 이어진다
  // (R3-08 · pendingCompletionThemeRef 주석). 그 갈래가 없던 동안 그 길로
  // 나간 사용자는 회복일기 안내를 영영 보지 못했다.
  const [showEpilogueUnlockModal, setShowEpilogueUnlockModal] = useState(false);
  const [showDiaryUnlockModal, setShowDiaryUnlockModal] = useState(false);

  /**
   * **마무리 안내를 빚진 영역.** 10편째를 마치는 순간 그 영역 id가 들어온다
   * (2026-08-27 3차 UAT R3-08).
   *
   * R2-25로 안내를 에필로그 뒤로 미룬 뒤, '나중에 볼게요'로 나간 사용자는
   * 회복일기가 열렸다는 안내를 **영영** 보지 못했다. 첫 영역이면 유형 보고서
   * 입구까지 함께 잃는다. 미루는 것은 에필로그이지 영역을 마쳤다는 사실이
   * 아니므로, 어느 길로 나가든 안내는 한 번 나간다.
   *
   * 빚이라서 **갚으면 사라진다** — 그러지 않으면 목록 카드로 에필로그를 다시
   * 읽을 때마다 같은 안내가 다시 뜬다. 영역 id로 들고 있는 것은 다른 영역의
   * 에필로그를 읽다가 남의 빚을 갚는 일이 없게 하기 위한 것이다.
   *
   * state가 아니라 ref인 것은 이 값이 화면을 그리지 않기 때문이고, 저장하지
   * 않는 것은 "지금 막 끝냈다"는 순간의 축하라 새로고침 뒤까지 따라다닐
   * 이유가 없기 때문이다.
   */
  const pendingCompletionThemeRef = useRef<string | null>(null);

  // ── 디버그 경계 ──
  //
  // 해제 모드에서는 실 진행도 대신 합성 진행도를 하류로 흘려보낸다. 카드
  // %·에피소드 해금·보고서가 전부 같은 한 벌을 집계하므로 화면끼리 어긋날
  // 수 없다. **저장 경로(useScenarioStore.clearEpisode)는 손대지 않으므로
  // 합성 데이터가 Firestore·localStorage로 새어 나가지 않는다.**
  const displayProgress = resolveDisplayProgress(themes, progress, debugMode);
  const isDebugUnlocked = debugMode !== 'locked';

  // 토글은 로딩·게이트 화면까지 **모든 분기**에서 같은 자리에 남는다.
  // 예전에는 해금 상태에서만 렌더돼 누르는 순간 버튼 자체가 사라졌다
  // (2026-08-07 검수 지적 — 다시 켤 방법이 없었다).
  const shell = (children: ReactNode) => (
    <div className="w-full flex-grow flex flex-col justify-start relative">
      {onCycleDebugMode && (
        <DebugUnlockToggle
          mode={debugMode}
          onCycle={onCycleDebugMode}
          className="absolute -top-4 right-0 z-30"
        />
      )}
      {children}
    </div>
  );

  // 진행도 및 테마 로드
  //
  // deps의 resultType은 재검사 반응용이다 — 우세 유형이 바뀌면 시나리오
  // 배치(반응 기제 순환)도 달라져야 하므로 테마를 다시 로드시킨다.
  // 같은 유형이면 스토어가 스스로 스킵한다.
  const stressResultType = stressResult?.resultType;
  useEffect(() => {
    fetchThemes();
    if (user?.uid) {
      fetchProgress(user.uid);
    }
  }, [user, stressResultType, fetchProgress, fetchThemes]);

  // ── 주소(하위 해시) ↔ 뷰 상태 동기화 (2026-08-27 UAT R2-06 1단계) ──
  //
  // 시나리오 탭은 주소가 `#scenario` 하나뿐이라, 3화를 열어 둔 채 새로고침하면
  // 영역 목록으로 되돌아갔다. 이제 영역·회차가 주소에 실린다:
  //
  //   #scenario  ·  #scenario/<themeId>  ·  #scenario/<themeId>/<n>
  //   #scenario/<themeId>/epilogue
  //
  // 상태의 주인은 여전히 **이 컴포넌트**이고(activeView·selectedThemeId·
  // selectedEpisodeId), 주소는 그 상태를 비추는 거울이다. 뷰를 주소에서
  // 곧바로 파생시키지 않은 이유는 완주 보고서(TYPE_REPORT) 때문이다 — 그
  // 화면은 주소를 갖지 않으므로(마친 직후에만 스쳐 가는 자리다) 주소가
  // 유일한 출처가 되면 열리자마자 목록으로 밀려난다. 대신 보고서는 자기
  // 영역의 목록 주소(`/<themeId>`)에 얹혀 산다.
  //
  // 어느 쪽이 먼저 바뀌었는지는 **마지막으로 맞춘 지점**(syncedPathRef)으로
  // 가른다. 두 이펙트로 나누면 같은 커밋에서 둘 다 깨어나 딥링크가 지워진다
  // (주소→화면이 화면을 옮기기 전에 화면→주소가 옛 화면으로 주소를 덮어쓴다).
  const route = useMemo(() => parseScenarioPath(scenarioPath ?? ''), [scenarioPath]);

  /** 지금 화면을 주소로 옮기면 무엇이 되는가. */
  const stateRoute = useMemo<ScenarioRoute>(() => {
    if (!selectedThemeId || activeView === 'THEME_LIST') return THEME_LIST_ROUTE;
    if (activeView === 'EPILOGUE') return { view: 'EPILOGUE', themeId: selectedThemeId };
    if (activeView === 'PLAYER') {
      const theme = themes.find((t) => t.id === selectedThemeId);
      const index = theme ? theme.episodes.findIndex((e) => e.id === selectedEpisodeId) : -1;
      if (index >= 0) {
        return { view: 'PLAYER', themeId: selectedThemeId, episodeNumber: index + 1 };
      }
    }
    // EPISODE_LIST · TYPE_REPORT · 회차를 찾지 못한 PLAYER는 모두 목록 주소다.
    return { view: 'EPISODE_LIST', themeId: selectedThemeId };
  }, [activeView, selectedThemeId, selectedEpisodeId, themes]);

  const statePath = formatScenarioPath(stateRoute);

  /** 마지막으로 주소와 화면을 맞춘 하위 경로. null이면 아직 한 번도 안 맞췄다. */
  const syncedPathRef = useRef<string | null>(null);

  /**
   * **보고서를 떠나는 한 자리.** 열람 기록(seenReports)을 남긴다.
   *
   * 나가는 길이 둘이라 함수 하나로 묶었다: 보고서의 닫기 버튼(handleCloseReport)과,
   * 주소가 밖에서 바뀌어 화면이 밀려나는 경우(하단 탭 재탭 R3-06 · 뒤로가기)다.
   * 뒤쪽을 빠뜨리면 기록이 남지 않아, 다음에 진짜로 완주했을 때 "최초 보고서"가
   * 한 번 더 뜬다.
   *
   * ref인 것은 **주소 동기화 이펙트가 위에서 이 함수를 불러야 하기 때문**이다.
   * 값으로 넘기면 selectedThemeId·activeView가 그 이펙트의 deps로 딸려 들어와
   * 화면이 바뀔 때마다 동기화가 한 번씩 더 깨어난다.
   *
   * 디버그 해금 모드에서는 남기지 않는다 — 합성 진행도로 띄운 보고서를 본 것으로
   * 처리하면 실제 완주 때 최초 보고서가 사라진다(displayProgress와 같은 경계).
   */
  const leaveReportRef = useRef<() => void>(() => {});
  useEffect(() => {
    leaveReportRef.current = () => {
      if (activeView !== 'TYPE_REPORT') return;
      if (user?.uid && selectedThemeId && !isDebugUnlocked) {
        void markReportSeen(user.uid, selectedThemeId);
      }
    };
  });

  // 콘텐츠(themes)와 진행도가 다 오기 전에는 판정하지 않는다. 먼저 판정하면
  // 아직 비어 있는 진행도 탓에 해금된 회차까지 잠긴 것으로 보여 딥링크가
  // 목록으로 튕긴다. 마운트 이펙트가 위에서 이미 두 fetch를 걸어 두었다.
  const isRouteReady = !!onScenarioPathChange && themes.length > 0 && !isLoading && !isThemesLoading;

  useEffect(() => {
    if (!isRouteReady || !onScenarioPathChange) return;
    const incoming = scenarioPath ?? '';

    const showThemeList = (): ScenarioRoute => {
      setActiveView('THEME_LIST');
      setSelectedThemeId(null);
      setSelectedEpisodeId(null);
      return THEME_LIST_ROUTE;
    };
    const showEpisodeList = (themeId: string): ScenarioRoute => {
      setActiveView('EPISODE_LIST');
      setSelectedThemeId(themeId);
      setSelectedEpisodeId(null);
      return { view: 'EPISODE_LIST', themeId };
    };

    /**
     * 주소를 화면으로 옮기고, **실제로 연 화면**을 돌려준다.
     *
     * 돌려주는 것이 핵심이다. 잠긴 회차를 목록으로 떨어뜨렸을 때 상태만
     * 고치면, 이미 목록에 있던 경우 setState가 아무것도 바꾸지 않아 렌더가
     * 다시 돌지 않는다 — 그러면 주소만 잘못된 채로 남는다.
     *
     * **여기가 딥링크의 잠금 검사 자리다.** 목록 카드를 거치지 않고 들어오는
     * 경로라 카드의 disabled가 막아 주지 못한다. 판정식은 목록과 같은 것을
     * 쓴다(episodeUnlock · summarizeThemeProgress) — 두 벌이면 "목록에서는
     * 잠겨 있는데 주소로는 열리는" 어긋남이 생긴다. 잠겨 있으면 조용히 그
     * 영역의 목록으로 떨어뜨린다: 열려던 회차를 짚어 주는 안내는 그 자체가
     * 아직 안 본 편의 스포일러다.
     */
    const applyRoute = (): ScenarioRoute => {
      // 주소가 화면을 밀어내는 자리다. 보고서가 떠 있었다면 여기서 떠난다 —
      // 닫기 버튼을 거치지 않는 유일한 출구라 기록도 여기서 남긴다(R3-06).
      leaveReportRef.current();

      if (route.view === 'THEME_LIST') return showThemeList();

      const theme = themes.find((t) => t.id === route.themeId);
      if (!theme) return showThemeList(); // 모르는 영역 id → #scenario

      if (route.view === 'EPISODE_LIST') return showEpisodeList(theme.id);

      if (route.view === 'EPILOGUE') {
        const unlocked =
          !!theme.epilogue && summarizeThemeProgress(theme, displayProgress).isComplete;
        if (!unlocked) return showEpisodeList(theme.id);
        setActiveView('EPILOGUE');
        setSelectedThemeId(theme.id);
        setSelectedEpisodeId(null);
        return { view: 'EPILOGUE', themeId: theme.id };
      }

      const index = route.episodeNumber - 1;
      const episode = theme.episodes[index];
      if (!episode || !isEpisodeUnlockedAt(theme, index, displayProgress)) {
        return showEpisodeList(theme.id);
      }
      setActiveView('PLAYER');
      setSelectedThemeId(theme.id);
      setSelectedEpisodeId(episode.id);
      return { view: 'PLAYER', themeId: theme.id, episodeNumber: index + 1 };
    };

    // ① 주소가 밖에서 바뀌었다 — 첫 진입·새로고침·뒤로가기·주소창 입력
    if (incoming !== syncedPathRef.current) {
      const resolvedPath =
        incoming === statePath ? statePath : formatScenarioPath(applyRoute());
      syncedPathRef.current = resolvedPath;
      if (resolvedPath !== incoming) {
        // 가드가 되돌린 주소다 — 히스토리에 남기면 뒤로가기가 막힌 주소로
        // 되돌아가고 가드가 다시 밀어내는 왕복에 갇힌다.
        onScenarioPathChange(resolvedPath, { replace: true });
      }
      return;
    }

    // ② 앱 안에서 화면이 바뀌었다 — 주소를 화면에 맞춘다
    if (statePath !== incoming) {
      syncedPathRef.current = statePath;
      // 깊이 들어갈 때만 히스토리에 쌓는다. 나오는 이동(플레이어 닫기)이나
      // 옆으로 가는 이동(다음 회차)까지 쌓으면, 뒤로가기가 방금 닫은
      // 플레이어를 처음부터 다시 열거나 열 편을 거꾸로 되짚는다.
      const isDeeper = splitHashSegments(statePath).length > splitHashSegments(incoming).length;
      onScenarioPathChange(statePath, { replace: !isDeeper });
    }
  }, [
    isRouteReady,
    onScenarioPathChange,
    scenarioPath,
    statePath,
    route,
    themes,
    displayProgress,
  ]);

  // 보고서 열림 여부를 위로 올린다 (R3-05 — onReportOpenChange 주석).
  // 정리 함수가 false를 되쏘는 것은 **탭이 언마운트될 때**를 위한 것이다:
  // 보고서를 연 채 다른 탭으로 옮기면 이 컴포넌트가 통째로 사라지므로,
  // 스스로 끄지 않으면 받는 쪽에 열린 상태가 그대로 굳는다.
  useEffect(() => {
    const isOpen = activeView === 'TYPE_REPORT';
    onReportOpenChange?.(isOpen);
    return () => {
      if (isOpen) onReportOpenChange?.(false);
    };
  }, [activeView, onReportOpenChange]);

  /**
   * 딥링크가 **아직 화면에 닿기 전**인가.
   *
   * 주소는 `/workplace/3`인데 화면은 아직 영역 목록인 한 프레임이 있다
   * (useEffect는 페인트 뒤에 돈다). 그동안 목록을 그리면 새로고침할 때마다
   * 목록이 번쩍인 뒤 플레이어가 열린다. 그 한 프레임만 로딩 화면으로 덮는다.
   *
   * 한 번이라도 맞춘 뒤에는(syncedPathRef가 채워진 뒤에는) 절대 켜지지
   * 않는다 — 앱 안에서 뒤로 나오는 순간에도 켜지면 그때마다 스피너가
   * 끼어든다.
   */
  const isInitialRoutePending =
    !!onScenarioPathChange && syncedPathRef.current === null && !!scenarioPath;

  if ((isLoading || isThemesLoading || isInitialRoutePending) && activeView === 'THEME_LIST') {
    return shell(
      <div className="w-full bento-card p-6 flex flex-col items-center justify-center gap-4 h-[280px]">
        <div className="w-10 h-10 rounded-full border-2 border-primary-container border-t-transparent animate-spin" />
        <p className="text-[14px] text-outline font-body">{COPY.scenario.loading}</p>
      </div>
    );
  }

  // 1. 캐릭터 생성 여부 검사 (NRQ-0031 연동)
  //
  // 게이트 화면의 껍데기는 회복일기 탭(DiaryLockedView)과 GateNoticeCard로
  // 공유한다 — 같은 상태를 탭마다 다른 그림으로 그리던 문제의 대응
  // (UAT 2026-08-18). 여기서 정하는 것은 문구·아이콘·목적지뿐이다.
  if (!character) {
    return shell(
      <GateNoticeCard
        icon="person_add"
        title={COPY.scenario.gateNoCharTitle}
        body={COPY.scenario.gateNoCharBody}
        ctaLabel={COPY.scenario.gateNoCharCta}
        onCtaClick={onGoHome}
      />
    );
  }

  // 2. 검사 완료 여부 검사 (디버그 해제 모드 또는 실제 검사 완료 시 우회)
  //
  // 개발자 해금은 상단 디버그 토글 하나로 통일했다 — 여기에 따로 "강제 해금"
  // 버튼을 두면 토글과 상태가 두 갈래로 갈린다.
  const isTestCompleted = !!adhdResult && !!stressResult;
  if (!isTestCompleted && !isDebugUnlocked) {
    return shell(
      <GateNoticeCard
        icon="explore"
        title={COPY.scenario.gateLockedTitle}
        body={COPY.scenario.gateLockedBody}
        ctaLabel={COPY.scenario.gateLockedCta}
        // 막힌 것을 푸는 동선이 아니라 물러나는 동선이라 강조를 한 단계 낮춘다.
        ctaVariant="outline"
        onCtaClick={onGoHome}
      />
    );
  }

  // 3. 에피소드 및 테마 정보 색출
  const currentTheme = themes.find((t) => t.id === selectedThemeId);
  const currentEpisode = currentTheme?.episodes.find((e) => e.id === selectedEpisodeId);

  // ── 뷰 핸들러 ──
  
  // 영역 선택 -> 에피소드 목록 이동
  const handleSelectTheme = (themeId: string) => {
    setSelectedThemeId(themeId);
    setActiveView('EPISODE_LIST');
  };

  // 에피소드 선택 -> 플레이어 이동
  const handlePlayEpisode = (episodeId: string) => {
    setSelectedEpisodeId(episodeId);
    setActiveView('PLAYER');
  };

  // 에필로그 진입 — **해금 판정을 여기서 한 번 더 본다.**
  //
  // 목록의 카드가 이미 disabled라 정상 경로로는 잠긴 에필로그가 열리지 않지만,
  // 뷰 전환은 이 함수 하나로 모이므로 잠금을 통과하는 자리도 여기 하나여야 한다.
  // 판정 근거는 목록 헤더의 완주율과 같은 집계(summarizeThemeProgress)이고,
  // 디버그 해금 모드에서는 합성 진행도를 그대로 따른다 — 화면 하나만 다른
  // 기준을 쓰면 "10/10인데 잠겨 있다"가 생긴다.
  const handlePlayEpilogue = () => {
    if (!currentTheme?.epilogue) return;
    if (!summarizeThemeProgress(currentTheme, displayProgress).isComplete) return;
    setActiveView('EPILOGUE');
  };

  // 현재 플레이 중인 에피소드가 이 영역의 마지막(10)회차인가
  const currentEpisodeIdx = currentTheme && currentEpisode
    ? currentTheme.episodes.findIndex((e) => e.id === currentEpisode.id)
    : -1;
  const isLastEpisode =
    !!currentTheme && currentEpisodeIdx >= 0 && currentEpisodeIdx === currentTheme.episodes.length - 1;

  /**
   * 이 영역의 완주가 **처음 보는 보고서**인가.
   *
   * 1순위는 영속 기록(users/{uid}.seenReports)이다. 런타임 판정만으로는 두
   * 가지가 어긋났다: (1) 완주 상태는 남아 있으므로 같은 영역을 다시 마칠 때마다
   * 조건이 뒤집혔고, (2) 디버그 해금 모드의 합성 진행도가 "다른 영역도 완주"로
   * 보여 실사용자의 첫 보고서를 삼켰다. seenReports가 null(구버전 데이터·로드
   * 전)일 때만 런타임 판정으로 떨어진다.
   *
   * **부르는 시점이 중요하다.** 회복일기 모달의 CTA를 누르는 순간 판정한다 —
   * 그때는 아직 markReportSeen이 나가기 전이라 값이 흔들리지 않는다. 보고서를
   * 닫은 뒤에 다시 판정하면 저장이 비동기라 "아직 처음"으로 읽혀 보고서가 두 번
   * 열릴 수 있다.
   */
  const isFirstThemeReport = () => {
    if (seenReports !== null) return seenReports.length === 0;
    // 폴백 — 다른 영역이 이미 클리어되어 있는지 런타임으로 본다.
    return !themes.some((t) => {
      if (t.id === currentTheme?.id) return false;
      const total = t.episodes.length;
      const cleared = t.episodes.filter((ep) => displayProgress[ep.id]?.cleared).length;
      return total > 0 && cleared >= total;
    });
  };

  /**
   * 영역 마무리의 **마지막 매듭** — 회복일기 안내를 띄운다.
   *
   * 원고가 있는 영역에서는 에필로그를 다 읽은 뒤에, 원고가 없는 영역에서는
   * 10편째를 마친 직후에 곧바로 온다. 어느 쪽이든 그다음은 이 모달의 CTA가
   * 가른다(handleConfirmDiaryUnlock) — 분기를 한 자리에 모아 두어야 "보고서
   * 다음에 또 모달" 같은 이중 안내가 생기지 않는다.
   */
  const openThemeCompletionNotice = () => setShowDiaryUnlockModal(true);

  // 영역 마무리 분기 (NRQ-0067) — 마지막 회차의 '마지막 에피소드 마치기'(onNext)와
  // 이탈 경로(onExit didComplete)가 공유한다. 예전에는 '다음' 버튼에만 붙어 있어서,
  // 마지막 회차를 끝내고 그만두면 보고서도 회복일기 연출도 못 본 채 목록으로
  // 돌아갔다.
  //
  // 2026-08-27 UAT R2-25로 목적지가 바뀌었다: 보고서·회복일기로 곧장 가지 않고
  // **에피소드 목록으로 돌아가며** 에필로그 안내를 띄운다. 방금 열린 마무리
  // 이야기를 지나쳐 버리지 않게 하려는 것이고, 목록으로 되돌리는 이유는
  // '나중에 볼게요'를 눌렀을 때 남을 자리가 거기여야 하기 때문이다.
  const finishCurrentTheme = () => {
    if (!currentTheme) return;

    setActiveView('EPISODE_LIST');
    setSelectedEpisodeId(null);

    if (currentTheme.epilogue) {
      // 에필로그를 먼저 세우되, 마무리 안내는 빚으로 남긴다 — 에필로그를 보든
      // 미루든 그 뒤에 반드시 한 번 갚는다(R3-08).
      pendingCompletionThemeRef.current = currentTheme.id;
      setShowEpilogueUnlockModal(true);
    } else {
      // 원고가 아직 없는 영역(2026-08-27 기준 직장 외 3영역)은 중간 매듭을
      // 건너뛰고 예전처럼 곧바로 마무리 안내로 간다. 빚을 세울 것도 없다.
      openThemeCompletionNotice();
    }
  };

  // 에필로그 안내 확인 -> 에필로그 플레이어.
  //
  // 여기서 해금을 다시 검사하지 않는다. 이 모달은 **마지막 회차를 실제로 마친
  // 직후에만** 뜨므로 완주 사실이 이미 증명돼 있고, 반대로 재검사하면 방금 나간
  // 저장이 스토어에 반영되기 전인 한 순간에 걸려 아무 일도 일어나지 않는다
  // (목록 카드로 들어오는 경로는 handlePlayEpilogue가 계속 지킨다).
  const handleConfirmEpilogueUnlock = () => {
    setShowEpilogueUnlockModal(false);
    setActiveView('EPILOGUE');
  };

  // '나중에 볼게요' — **에필로그만** 미룬다 (R3-08).
  //
  // 목록에 그대로 남고 에필로그 카드는 맨 위에 해금된 채로 서 있으므로 언제든
  // 다시 들어올 수 있다. 다만 영역을 마쳤다는 사실은 미룰 것이 아니라, 곧바로
  // 마무리 안내로 이어 빚을 갚는다.
  const handleDismissEpilogueUnlock = () => {
    setShowEpilogueUnlockModal(false);
    pendingCompletionThemeRef.current = null;
    openThemeCompletionNotice();
  };

  // 에필로그를 끝까지 읽었다 (R2-28 · R3-08).
  //
  // 방금 완주해서 온 길이라면(빚이 있다면) 플레이어는 마지막 장면을 띄운 채
  // 남고 그 위에 회복일기 안내가 얹힌다. 반대로 목록 카드로 다시 읽은 것이면
  // 안내 없이 목록으로 되돌린다 — 그러지 않으면 플레이어가 다 읽은 상태로
  // 남아 나갈 길이 ✕ 하나뿐이고, 이미 받은 축하가 읽을 때마다 되풀이된다.
  const handleEpilogueComplete = () => {
    if (pendingCompletionThemeRef.current === selectedThemeId) {
      pendingCompletionThemeRef.current = null;
      openThemeCompletionNotice();
      return;
    }
    setActiveView('EPISODE_LIST');
  };

  // 에피소드 플레이 완료 후 후속 분기 (NRQ-0067)
  const handleNextEpisode = (_wasHelpful: boolean) => {
    if (!currentTheme || !currentEpisode) return;

    if (isLastEpisode) {
      finishCurrentTheme();
    } else {
      // 다음 에피소드 로드
      const nextEp = currentTheme.episodes[currentEpisodeIdx + 1];
      setSelectedEpisodeId(nextEp.id);
      setActiveView('PLAYER');
    }
  };

  // 플레이어 종료 — 마지막 회차를 **끝낸 뒤** 나가는 경우에는 목록으로 보내지
  // 않고 마무리 분기로 합류시킨다 (중간에 X로 나가는 경우는 기존대로 목록 복귀).
  const handleExitPlayer = (didComplete = false) => {
    if (didComplete && isLastEpisode) {
      finishCurrentTheme();
      return;
    }
    setActiveView('EPISODE_LIST');
    setSelectedEpisodeId(null);
  };

  /** 시나리오 탭을 접고 회복일기(분석 탭)로 넘긴다 — 완주 흐름의 종착지. */
  const goToDiaryTab = () => {
    setActiveView('THEME_LIST');
    setSelectedThemeId(null);
    setSelectedEpisodeId(null);

    // 만약 부모 컴포넌트(HomePage)가 탭 체인저를 내려줬다면 분석 보고서 탭으로 전환
    if (onGoTab) {
      onGoTab('analysis');
    }
  };

  // 보고서 닫기 -> 열람 기록을 남기고 회복일기 탭으로.
  //
  // 보고서는 이제 흐름의 **마지막** 화면이다(R2-28로 회복일기 안내가 앞으로
  // 옮겨 갔다). 그래서 닫으면 안내를 한 번 더 띄우지 않고 곧장 목적지로 간다.
  //
  // 기록을 남기는 규칙(디버그 해금 제외)은 leaveReportRef가 갖는다 — 주소로
  // 밀려나는 출구와 같은 함수를 써야 두 길의 동작이 갈리지 않는다(R3-06).
  const handleCloseReport = () => {
    leaveReportRef.current();
    goToDiaryTab();
  };

  // 회복일기 안내 확인 -> 최초 완주 영역이면 유형 보고서를 한 번 거치고,
  // 그 밖에는 곧바로 회복일기 탭으로 넘어간다.
  //
  // 보고서는 흐름을 끊는 화면이 아니라 **회복일기로 가는 길에 한 번 스쳐 가는
  // 자리**라, CTA 라벨('회복일기 보러가기')이 약속한 목적지는 보고서를 닫으면
  // 그대로 지켜진다(handleCloseReport).
  const handleConfirmDiaryUnlock = () => {
    setShowDiaryUnlockModal(false);

    if (isFirstThemeReport()) {
      setActiveView('TYPE_REPORT');
      return;
    }
    goToDiaryTab();
  };

  return shell(
    <>
      {/* ── 뷰 분기 렌더링 ── */}

      {/* 1. 영역 목록 뷰 */}
      {activeView === 'THEME_LIST' && (
        <ThemeListView
          themes={themes}
          progress={displayProgress}
          onSelectTheme={handleSelectTheme}
        />
      )}

      {/* 2. 에피소드 목록 뷰 */}
      {activeView === 'EPISODE_LIST' && selectedThemeId && (
        <EpisodeListView
          themes={themes}
          themeId={selectedThemeId}
          progress={displayProgress}
          onBack={() => {
            setActiveView('THEME_LIST');
            setSelectedThemeId(null);
          }}
          onPlayEpisode={handlePlayEpisode}
          onPlayEpilogue={handlePlayEpilogue}
          // '봤어요' 배지는 **실제 열람 기록**만 본다. 디버그 해금은 진행도를
          // 합성할 뿐 무엇을 봤는지까지 지어내지 않는다.
          epilogueSeen={!!selectedThemeId && !!epiloguesSeen[selectedThemeId]}
        />
      )}

      {/* 3. 비주얼 노벨 플레이어 뷰 — 홈 셸(헤더/탭바) 위를 덮는
          풀스크린 레이어로 Portal 렌더링 */}
      {activeView === 'PLAYER' && user && currentEpisode &&
        document.getElementById('app-modal-root') &&
        createPortal(
          <VisualNovelPlayer
            uid={user.uid}
            episode={currentEpisode}
            characterGender={character.gender}
            isLastEpisode={isLastEpisode}
            onExit={handleExitPlayer}
            onNext={handleNextEpisode}
          />,
          document.getElementById('app-modal-root')!
        )}

      {/* 3-2. 에필로그 플레이어 — 에피소드 플레이어와 같은 자리에 뜨는
          풀스크린 레이어다. 요정·전략·평가가 없어 스스로는 아무 분기도 하지
          않고, 다 읽었다는 사실만 onComplete로 올린다(R2-28). 그 위에 회복일기
          안내 모달(z-50)이 얹히므로 마지막 장면이 배경으로 남는다. */}
      {activeView === 'EPILOGUE' && user && selectedThemeId && currentTheme?.epilogue &&
        document.getElementById('app-modal-root') &&
        createPortal(
          <EpiloguePlayer
            uid={user.uid}
            themeId={selectedThemeId}
            epilogue={currentTheme.epilogue}
            characterGender={character.gender}
            onExit={() => setActiveView('EPISODE_LIST')}
            onComplete={handleEpilogueComplete}
          />,
          document.getElementById('app-modal-root')!
        )}

      {/* 4. 유형 보고서 결과 뷰 */}
      {activeView === 'TYPE_REPORT' && selectedThemeId && (
        <TypeReportView
          themeId={selectedThemeId}
          progress={displayProgress}
          onClose={handleCloseReport}
        />
      )}

      {/* ── 에필로그 해금 안내 모달 (R2-25) ──
          10편째를 마친 직후, 에피소드 목록 위에 뜬다. 여기서 회복일기를
          언급하지 않는 이유는 copy.tsx의 epilogueUnlock* 주석에 있다. */}
      {showEpilogueUnlockModal && (
        <UnlockNoticeModal
          icon="menu_book"
          title={COPY.scenario.epilogueUnlockTitle(currentTheme?.title ?? '')}
          body={COPY.scenario.epilogueUnlockBody}
          ctaLabel={COPY.scenario.epilogueUnlockCta}
          onCta={handleConfirmEpilogueUnlock}
          secondaryLabel={COPY.scenario.epilogueUnlockLater}
          onSecondary={handleDismissEpilogueUnlock}
        />
      )}

      {/* ── 회복일기 안내 모달 (NRQ-0067 → R2-28로 자리 이동) ──
          원고가 있는 영역에서는 에필로그를 다 읽은 뒤, 없는 영역에서는 10편째를
          마친 직후에 뜬다. 되돌아갈 곳이 없는 마지막 매듭이라 보조 버튼이 없다. */}
      {showDiaryUnlockModal && (
        <UnlockNoticeModal
          icon="auto_stories"
          title={COPY.scenario.diaryUnlockTitle(currentTheme?.title ?? '')}
          body={COPY.scenario.diaryUnlockBody}
          ctaLabel={COPY.scenario.diaryUnlockCta}
          onCta={handleConfirmDiaryUnlock}
        />
      )}
    </>
  );
}
