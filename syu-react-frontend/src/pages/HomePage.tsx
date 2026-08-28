import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useCharacterStore } from '../store/useCharacterStore';
import { useTestStore } from '../store/useTestStore';
import PageLayout from '../components/ui/PageLayout';
import HomeTab from '../components/home/HomeTab';
import ScenarioTab from '../components/home/ScenarioTab';
import AnalysisTab, { type AnalysisEntry } from '../components/home/AnalysisTab';
import MyPageView from '../components/home/MyPageView';
import BrandHeader from '../components/common/BrandHeader';
import EndingPage from './EndingPage';
import { nextDebugUnlockMode, type DebugUnlockMode } from '../utils/debugProgress';

/** 하단 탭바가 가리키는 세 탭. App의 #home·#scenario·#diary와 1:1이다. */
export type HomeTabId = 'home' | 'scenario' | 'analysis';

// ── 이 화면은 controlled component다 (2026-08-18) ──
//
// 탭과 두 오버레이(마이페이지·엔딩)는 각각 자기 주소를 갖는다. 상태를 여기
// 안에도 두면 주소와 화면이 두 갈래로 갈리므로, **App이 주소에서 읽어 내려
// 주는 값만** 그린다. 이동은 전부 콜백으로 위에 올린다.
interface HomePageProps {
  onStartCreation: () => void; // 캐릭터 생성 페이지로 이동
  onStartTest: (type: 'adhd' | 'stress') => void; // 검사 페이지로 이동
  onGoLanding: () => void; // 브랜드 로고 클릭 → 랜딩(서비스 소개)으로 이동
  activeTab: HomeTabId; // 지금 열린 탭 (#home · #scenario · #diary)
  onChangeTab: (tab: HomeTabId) => void;
  /** #scenario 뒤의 하위 경로 ('' | '/workplace' | '/workplace/1' | '/workplace/epilogue') */
  scenarioPath: string;
  /** 시나리오 탭이 화면을 옮겼을 때. replace는 가드의 되돌림 전용이다. */
  onScenarioPathChange: (path: string, options?: { replace?: boolean }) => void;
  isMyPageOpen: boolean; // #mypage
  onOpenMyPage: () => void;
  onCloseMyPage: () => void;
  isEndingOpen: boolean; // #ending
  onOpenEnding: () => void;
  onCloseEnding: () => void;
}

export default function HomePage({
  onStartCreation,
  onStartTest,
  onGoLanding,
  activeTab,
  onChangeTab,
  scenarioPath,
  onScenarioPathChange,
  isMyPageOpen,
  onOpenMyPage,
  onCloseMyPage,
  isEndingOpen,
  onOpenEnding,
  onCloseEnding,
}: HomePageProps) {
  const { user, logout } = useAuthStore();
  const { character, avatarId, isLoading, fetchCharacter } = useCharacterStore();
  const { fetchTestResults } = useTestStore();
  // 마이페이지 → 회복일기 탭의 특정 뷰로 직행하는 요청 (NRQ-0082).
  // AnalysisTab이 처리한 뒤 onEntryHandled로 비운다.
  const [analysisEntry, setAnalysisEntry] = useState<AnalysisEntry | null>(null);

  // ── 유형 보고서가 시나리오 탭을 덮고 있는가 (2026-08-27 3차 UAT R3-05) ──
  //
  // 마이페이지·엔딩과 달리 이 화면은 **자기 주소가 없다** — 영역을 마친 직후
  // 스쳐 가는 자리라 그 영역의 목록 주소(`#scenario/<themeId>`)에 얹혀 산다.
  // 그래서 주소만 보는 탭바는 '시나리오'를 활성으로 칠한 채였고, 보고 있는
  // 화면과 어긋났다. 주소로 알 수 없으니 **탭이 직접 알려 준다**.
  const [isReportOpen, setIsReportOpen] = useState(false);

  // ── 개발자 디버그 해금 (락 / 부분 / 전체) ──
  //
  // 시나리오 탭과 회복일기 탭이 **같은 모드를 공유해야** 두 화면의 진행도가
  // 어긋나지 않으므로, 두 탭의 공통 부모인 여기서 소유한다. 예전에는 탭마다
  // 따로 useState를 들고 있어 한쪽만 해금된 화면이 나왔다.
  // 개발자 계정이라도 기본값은 락이다 — 실데이터가 먼저다.
  // VITE_DEV_LOGIN_EMAIL이 없으면 디버그 기능은 아무에게도 보이지 않는다.
  // 예전 기본값 'test@example.com'은 누구나 만들 수 있는 주소라, 환경 변수를
  // 설정하지 않은 배포에서 그 계정으로 가입만 하면 해금 토글이 열렸다.
  const devEmail = import.meta.env.VITE_DEV_LOGIN_EMAIL;
  const isDevUser = !!devEmail && user?.email === devEmail;
  const [debugMode, setDebugMode] = useState<DebugUnlockMode>('locked');
  const cycleDebugMode = isDevUser
    ? () => setDebugMode((m) => nextDebugUnlockMode(m))
    : undefined;

  // 컴포넌트 마운트 시 Firestore에서 캐릭터 정보 및 검사 진행 정보 조회
  useEffect(() => {
    if (user?.uid) {
      fetchCharacter(user.uid);
      fetchTestResults(user.uid);
    }
  }, [user, fetchCharacter, fetchTestResults]);

  const appBar = (
    <BrandHeader
      onLogoClick={onGoLanding}
      onProfileClick={onOpenMyPage}
      avatar={{ avatarId, photoURL: user?.photoURL }}
    />
  );

  const bottomNav = (
    <nav className="
      w-full
      flex justify-around items-center
      bg-surface/80 backdrop-blur-lg
      border-t border-outline-variant/20
      text-[14px] font-headline
      py-1.5
    ">
      {([
        { id: 'home', label: '홈', icon: 'home' },
        { id: 'scenario', label: '시나리오', icon: 'explore' },
        { id: 'analysis', label: '회복일기', icon: 'analytics' }
      ] as const).map((tab) => {
        // 탭 위를 덮는 화면(마이페이지·엔딩·유형 보고서)이 하나라도 떠 있으면
        // 활성 탭은 없다 — 지금 보고 있는 것이 세 탭 중 하나가 아니기 때문이다.
        const isActive =
          activeTab === tab.id && !isMyPageOpen && !isEndingOpen && !isReportOpen;
        return (
          <button
            key={tab.id}
            // 활성 표시를 색뿐 아니라 이름으로도 남긴다 — 색만으로는 낭독기가
            // "어느 탭에 있는지"를 전하지 못한다.
            aria-current={isActive ? 'page' : undefined}
            // 탭 이동이 곧 주소 이동이다. 마이페이지가 열려 있었다면
            // 그 주소를 떠나면서 오버레이도 함께 닫힌다.
            onClick={() => onChangeTab(tab.id)}
            className={`
              flex flex-col items-center gap-1 py-2 px-2 w-full
              transition-all duration-200
              ${isActive
                ? 'text-primary font-bold'
                : 'text-outline hover:text-on-surface'
              }
            `}
          >
            <span
              className="material-symbols-outlined text-[22px]"
              style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
            >
              {tab.icon}
            </span>
            <span className="text-[11px] tracking-tight">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* 세로 패딩은 스크롤러(main)가 아니라 **안쪽 래퍼**가 갖는다.
          스크롤 컨테이너에 padding-y가 있으면 그 띠가 sticky 자식의
          고정 위치보다 위에 남아, 스크롤한 콘텐츠가 sticky 헤더 위쪽
          틈으로 비쳐 보인다(시나리오 에피소드 목록에서 관측). 패딩을
          콘텐츠 쪽으로 옮기면 스크롤포트 상·하단이 곧 콘텐츠 경계가 되어
          sticky top-0 / bottom-0이 프레임에 정확히 플러시된다.
          박스 사이징이 border-box라 h-full/min-h-full의 결과 높이는 동일하다. */}
      <PageLayout header={appBar} footer={bottomNav} contentClassName="px-6">
        {/* 홈·시나리오 탭은 콘텐츠 길이만큼 자라며 페이지(main)가 스크롤한다(min-h-full).
            홈이 예전에 h-full이었던 탓에 HomeTab이 프레임 높이에 갇혀 여정 목록만
            따로 스크롤됐고, 좁고 긴 화면에서는 그 안쪽 스크롤러가 카드 한 장도
            못 담았다 (Z Fold 6 제보 2026-08-13). 회복일기 탭만 h-full을 유지한다 —
            잠김·로딩 뷰가 `h-full` 카드로 화면을 채우는 구조를 쓰기 때문이다. */}
        <div className={`flex flex-col gap-6 py-6 ${activeTab === 'analysis' ? 'h-full' : 'min-h-full'}`}>
          {activeTab === 'home' && (
            <HomeTab
              isLoading={isLoading}
              character={character}
              onStartCreation={onStartCreation}
              onStartTest={onStartTest}
              onGoScenario={() => onChangeTab('scenario')}
              // 도전과제 줄의 목적지. 탭 전환은 이 화면이 아니라 App(주소)이
              // 소유하므로, 다른 탭 이동과 똑같이 onChangeTab으로 올린다.
              onGoDiary={() => onChangeTab('analysis')}
              // 홈 도전과제도 시나리오·회복일기 탭과 같은 합성 진행도로
              // 판정되게 한다 (해금 토글은 그 두 탭에만 있다).
              debugMode={debugMode}
            />
          )}

          {activeTab === 'scenario' && (
            <ScenarioTab
              onGoHome={() => onChangeTab('home')}
              onGoTab={(tab) => (tab === 'mypage' ? onOpenMyPage() : onChangeTab(tab))}
              scenarioPath={scenarioPath}
              onScenarioPathChange={onScenarioPathChange}
              debugMode={debugMode}
              onCycleDebugMode={cycleDebugMode}
              // 주소 없는 유형 보고서의 열림 여부 (R3-05). 탭이 언마운트될 때
              // 스스로 false를 되쏘므로 여기서 따로 되돌리지 않는다.
              onReportOpenChange={setIsReportOpen}
            />
          )}

          {activeTab === 'analysis' && (
            <AnalysisTab
              onGoHome={() => onChangeTab('home')}
              onGoScenario={() => onChangeTab('scenario')}
              onGoEnding={onOpenEnding}
              onStartCreation={onStartCreation}
              entryRequest={analysisEntry}
              onEntryHandled={() => setAnalysisEntry(null)}
              debugMode={debugMode}
              onCycleDebugMode={cycleDebugMode}
            />
          )}
        </div>
      </PageLayout>

      {/* ── 마이페이지 오버레이 (프레임 기준 absolute, z-40) ── */}
      {isMyPageOpen && (
        <MyPageView
          user={user}
          logout={logout}
          onClose={onCloseMyPage}
          onGoEnding={onOpenEnding}
          onGoReport={() => {
            // NRQ-0082 — 회복일기 탭(#diary)의 보고서 뷰로 직행.
            // 탭을 옮기는 것만으로 마이페이지 주소를 떠나므로 따로 닫지 않는다.
            onChangeTab('analysis');
            setAnalysisEntry('report');
          }}
        />
      )}

      {/* ── 최종 엔딩 오버레이 (#ending) ──
          마이페이지와 회복일기(종합 인사이트) 두 입구가 같은 이 레이어로
          모인다. 열림 여부의 단일 출처는 주소다. */}
      {isEndingOpen && (
        <div className="absolute inset-0 z-40">
          <EndingPage onClose={onCloseEnding} />
        </div>
      )}
    </>
  );
}
