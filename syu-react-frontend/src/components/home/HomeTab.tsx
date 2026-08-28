// src/components/home/HomeTab.tsx
// 홈 탭 메인 대시보드 (상단 "지금 할 일" 카드 + 마음 건강 여정 단계)

import { useEffect } from 'react';
import HomeCtaCard from './HomeCtaCard';
import { useAuthStore } from '../../store/useAuthStore';
import { useScenarioStore } from '../../store/useScenarioStore';
import { useTestStore } from '../../store/useTestStore';
import { computeAlbumProgress } from '../../utils/strategyStats';
import { resolveDisplayProgress, type DebugUnlockMode } from '../../utils/debugProgress';
import { COPY } from '../../constants/copy';

// ── 상단 히어로가 첫 화면을 독점하던 문제 (UAT 2026-08-11 → Z Fold 6 2026-08-13
//    → 2026-08-14 디자인 2차) ──
//
// **구조는 이미 고쳤다.** 예전에는 상단(캐릭터 카드 + 타이틀)이 shrink-0으로
// 굳고 여정 목록만 내부 스크롤을 갖는 2단 분할이라, 히어로가 뷰포트와 무관하게
// 자리를 선점했다. 지금은 홈 탭 전체가 하나의 스크롤러로 흐르므로 **어떤
// 화면에서도 카드 전부에 도달할 수 있다**(스크롤 소유는 PageLayout).
//
// 그 위에서 **첫 화면 밀도**를 담당하던 것이 FLUID_METRICS였다 — 일러스트
// 크기·카드 패딩·간격 6종을 dvh에 연동한 clamp 식으로, 700dvh에서 최소,
// 880dvh에서 최대가 되게 짜여 있었다. 그 장치가 필요했던 이유는 히어로가
// 실측 438px, 즉 작은 화면 높이의 절반을 넘게 썼기 때문이다.
//
// **2026-08-14에 히어로를 한 장짜리 CTA 카드(약 80px)로 교체하면서 전부
// 걷어냈다.** 최대와 최소의 차이가 24px(일러스트)·4px(패딩)이었는데, 이제
// 상단 전체가 그 최대치보다도 작다 — 화면 높이에 연동해 아낄 것이 남아
// 있지 않다. dvh 연동은 읽기 어렵고 iOS 주소창 이슈까지 따라오는 장치라,
// 값을 되살릴 실익이 없는 이상 고정값이 옳다.

interface HomeTabProps {
  isLoading: boolean;
  character: any;
  onStartCreation: () => void;
  onStartTest: (type: 'adhd' | 'stress') => void;
  /** 시나리오 탭으로 전환 (검사 완료 후 바로가기 CTA) */
  onGoScenario: () => void;
  /** 회복일기 탭으로 전환 (도전과제 줄의 목적지) */
  onGoDiary: () => void;
  /**
   * 개발자 디버그 해금 모드 — HomePage가 시나리오·회복일기 탭과 공유한다.
   * 도전과제 판정이 그 두 탭과 같은 진행도를 보게 하려면 홈도 받아야 한다.
   */
  debugMode?: DebugUnlockMode;
}

/**
 * 도전과제 한 줄의 상태.
 *
 * - `locked`   앞 단계가 끝나지 않아 아직 셀 수조차 없는 줄
 * - `progress` 열렸지만 아직 달성 전
 * - `done`     달성 (Step 카드의 완료와 같은 체크 표시)
 * - `opened`   달성이 아니라 **해금**만 말할 수 있는 줄 (도전과제 4 전용)
 */
type ChallengeState = 'locked' | 'progress' | 'done' | 'opened';

/**
 * Step 4 이후의 도전과제 한 줄.
 *
 * Step 1~4 카드와 **같은 골격**을 쓴다 — 카드 > 행(아이콘 + 텍스트 묶음) >
 * 제목·설명. 색온도 규칙도 그대로다: 잠김은 먼 그늘(surface-container-low +
 * opacity), 달성은 볕 든 면(surface-container).
 *
 * **행 전체가 목적지(회복일기 탭)로 가는 입구다** (2026-08-18). 예전에는
 * 그 콜백이 HomeTab에 내려오지 않아 표시 전용이었고, 문구가 "회복일기 탭에서
 * 확인할 수 있어요"라고 말해 놓고 정작 갈 방법은 하단 탭바뿐이었다. 지금은
 * HomePage가 onGoDiary를 내려주므로 Step 1~4와 **같은 관례**로 연다 —
 * 별도 링크를 따로 붙이지 않고 행 전체가 클릭 대상이며, role 없는 div라
 * "상단 CTA 카드가 유일한 button"이라는 계약도 그대로다.
 *
 * 단 `onClick`이 없으면 클릭 표시(cursor·hover·press)도 붙지 않는다 —
 * 갈 수 없는 줄을 눌리게 보이게 하면 "눌러도 잠김 화면"이라는 4단계 회귀
 * (UAT 2026-08-11)가 되돌아온다. 칩은 여전히 상태 이름('진행 중'·'열림')이다:
 * 이 줄이 말하는 것은 여전히 달성 여부이고, 이동은 그 위에 얹힌 것이다.
 */
function ChallengeRow({
  icon,
  title,
  desc,
  state,
  onClick,
}: {
  icon: string;
  title: string;
  desc: string;
  state: ChallengeState;
  /** 없으면 표시 전용 줄이 된다 (잠겼거나 회복일기가 아직 열리지 않은 경우) */
  onClick?: () => void;
}) {
  const isLocked = state === 'locked';
  return (
    <div
      onClick={onClick}
      className={`
        flex items-center justify-between p-4 rounded-pane border transition-colors duration-200
        ${isLocked
          ? 'bg-surface-container-low border-card-border opacity-50'
          : state === 'progress'
          ? 'bg-surface-container-low border-card-border'
          : 'bg-surface-container border-card-border'}
        ${onClick ? 'cursor-pointer hover:border-primary active:scale-[0.99]' : ''}
      `}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isLocked ? 'bg-disabled-bg text-outline' : 'bg-primary/20 text-primary'}`}
        >
          <span className="material-symbols-outlined">{icon}</span>
        </div>
        <div>
          <p className="text-[14px] font-bold text-on-surface font-headline">{title}</p>
          <p className="text-[12px] text-on-surface-variant font-body">{desc}</p>
        </div>
      </div>
      {state === 'done' ? (
        <span className="material-symbols-outlined text-primary text-[24px]">check_circle</span>
      ) : isLocked ? (
        <span className="material-symbols-outlined text-outline text-[20px]">lock</span>
      ) : (
        <span className="text-[11px] font-bold px-2.5 py-1.5 rounded-full bg-primary/20 text-primary shrink-0 font-headline">
          {state === 'opened' ? COPY.home.chipOpened : COPY.home.chipInProgress}
        </span>
      )}
    </div>
  );
}

export default function HomeTab({
  isLoading,
  character,
  onStartCreation,
  onStartTest,
  onGoScenario,
  onGoDiary,
  debugMode = 'locked',
}: HomeTabProps) {
  // invalidStressAttempt: 직전 스트레스 제출이 판별 불가였는지.
  // ⚠️ 세션 한정 플래그다 — 스토어에만 있고 Firestore에 저장하지 않으므로,
  // 새로고침·재로그인하면 사라지고 카드는 다시 "진행 대기"로 보인다.
  // 영속화는 users/{uid} 스키마 변경(어드민 계약)이 필요해 별건으로 둔다.
  const { adhdResult, stressResult, invalidStressAttempt, isLoading: isTestLoading } =
    useTestStore();

  // ── 도전과제 판정에 쓰는 시나리오 진행도 ──
  //
  // **홈 탭은 지금까지 이 데이터를 읽은 적이 없다.** 시나리오·회복일기·
  // 마이페이지 탭이 각자 마운트될 때 불러왔으므로, 그 탭들을 한 번도 열지
  // 않은 세션에서는 progress가 비어 있다. 그 상태로 도전과제를 그리면 이미
  // 네 영역을 완주한 사용자에게 "아직 아무것도 못 했다"고 말하게 된다.
  // 그래서 같은 계약(존재하는 액션 두 개)을 홈에서도 그대로 호출한다 —
  // 스토어에 새 필드나 액션을 만들지 않는다.
  //
  // stressResult.resultType(재검사 시 배치가 바뀌는 축)은 deps에 넣지 않는다:
  // 반응 기제 버전이 달라져도 회차 수와 에피소드 id는 그대로라 집계값이
  // 변하지 않는다. 배치 갱신이 필요한 화면(시나리오·회복일기)이 이미 그 축을
  // 구독하고 있다.
  const uid = useAuthStore((s) => s.user?.uid);
  const {
    progress: rawProgress,
    themes,
    isLoading: isScenarioLoading,
    isThemesLoading,
    fetchProgress,
    fetchThemes,
  } = useScenarioStore();

  useEffect(() => {
    fetchThemes();
    if (uid) fetchProgress(uid);
  }, [uid, fetchProgress, fetchThemes]);

  if (isLoading || isTestLoading) {
    return (
      <div className="w-full bento-card p-6 flex flex-col items-center justify-center gap-4 h-[280px]">
        <div className="w-10 h-10 rounded-full border-2 border-primary-container border-t-transparent animate-spin" />
        <p className="text-[14px] text-outline font-body">{COPY.home.loading}</p>
      </div>
    );
  }

  // ── 캐릭터 미생성도 여정의 한 상태다 (UAT 2026-08-18) ──
  //
  // 예전에는 여기서 CTA 카드 한 장만 return하고 끝냈다(early return). 그래서
  // 캐릭터가 없는 첫 화면에는 **여정 지도 자체가 존재하지 않았고**, 캐릭터를
  // 만든 뒤에야 Step 1~4가 처음 나타났다. 앞으로 무엇을 하게 되는지 가장
  // 궁금한 시점에 지도를 감추고 있었던 셈이다.
  //
  // 지금은 캐릭터 유무를 다른 단계와 똑같이 **상태 하나**로 다룬다 —
  // Step 1이 '진행 대기'로 서고, 그 아래 단계들은 잠긴 채로 남는다.
  const isCharacterDone = !!character;
  const isAdhdDone = !!adhdResult;
  const isStressDone = !!stressResult;

  // 4단계(시나리오) 해금 조건. **ScenarioTab의 실제 게이트와 같은 식이어야 한다**
  // (`components/home/ScenarioTab.tsx`의 isTestCompleted = adhdResult && stressResult).
  // 예전에는 여기만 isStressDone 하나였다 — 두 검사가 순서대로 끝나는 정상
  // 경로에서는 같은 값이라 티가 안 났지만, ADHD 결과 없이 스트레스만 있는
  // 상태(다른 기기에서 계정 초기화 후 스트레스만 재검사 등)에서는 카드가
  // 열린 것처럼 보이는데 눌러도 잠김 화면이 나왔다 (UAT 2026-08-11 김도영).
  const isScenarioUnlocked = isAdhdDone && isStressDone;

  // ── Step 4 이후: 도전과제 (2026-08-16 검수 확정 기획) ──
  //
  // 판정 신호는 전부 **기존 진행도에서 파생**한다. 집계는 회복일기가 쓰는
  // 것과 같은 함수(computeAlbumProgress)라 홈과 회복일기가 다른 숫자를 말할
  // 수 없다 — 앨범 게이지·종합 인사이트 해금이 모두 이 한 벌에서 나온다.
  //
  // ⚠️ 진행도를 아직 못 읽은 동안에는 이 줄들을 아예 그리지 않는다.
  // 완주한 사용자에게 "0/4"를 잠깐 보여 주는 것은 로딩이 아니라 오답이고,
  // 회복일기 탭도 같은 이유로 진행도 로딩 중에는 목록 대신 스피너를 띄운다.
  // (홈 전체를 스피너로 덮지는 않는다 — 상단 CTA는 이 데이터와 무관하다.)
  const isChallengeDataReady = themes.length > 0 && !isScenarioLoading && !isThemesLoading;

  // ── 디버그 경계 (시나리오·회복일기 탭과 같은 자리) ──
  //
  // 해제 모드에서는 실 진행도 대신 합성 진행도를 집계한다. 모드를 소유한 곳은
  // HomePage 하나이고 세 탭이 같은 값을 받으므로, 개발자 계정이 해금 토글을 켠
  // 채 홈으로 돌아왔을 때 "시나리오·회복일기는 완주인데 홈 도전과제만 잠김"인
  // 어긋난 화면이 나오지 않는다. 락 모드에서는 실데이터를 그대로 돌려주므로
  // 참조도 바뀌지 않는다. **표시 계층 전용이며 저장 경로는 건드리지 않는다.**
  // (해금 토글 자체는 그것을 이미 그리는 두 탭에 그대로 둔다 — 홈은 값만 받는다.)
  const scenarioProgress = resolveDisplayProgress(themes, rawProgress, debugMode);
  const album = computeAlbumProgress(themes, scenarioProgress);

  // 달성 여부를 잠김보다 **먼저** 본다 (3단계 카드와 같은 순서). 검사 결과가
  // 사라진 계정에서도 이미 쌓인 기록을 '잠김'으로 되돌리지 않기 위해서다.
  const challenge1State: ChallengeState =
    album.clearedEpisodes > 0 ? 'done' : !isScenarioUnlocked ? 'locked' : 'progress';
  const challenge2State: ChallengeState =
    album.completedThemes > 0 ? 'done' : album.clearedEpisodes > 0 ? 'progress' : 'locked';
  const challenge3State: ChallengeState =
    album.isAllComplete ? 'done' : album.completedThemes > 0 ? 'progress' : 'locked';
  // 4번만 '달성'이 아니라 '해금'이다 — 종합 인사이트를 열어 봤는지는 어디에도
  // 기록되지 않으므로, 앱이 아는 사실(열렸다)까지만 말한다.
  const challenge4State: ChallengeState = album.isAllComplete ? 'opened' : 'locked';

  // ── 도전과제 줄의 목적지 게이트 ──
  //
  // **회복일기 탭이 실제로 열리는 상태일 때만** 줄을 눌리게 한다. 그 탭의
  // 잠금 판정(`AnalysisTab`의 lockedGate: 캐릭터 → 두 검사)과 같은 식이어야
  // 하는데, 도전과제는 검사 결과 없이도 '달성'으로 설 수 있기 때문이다
  // (기록만 남고 검사가 사라진 계정 — 바로 아래 판정이 그렇게 짜여 있다).
  // 그 상태에서 줄을 열어 두면 눌렀을 때 회복일기 잠금 화면이 나오는데,
  // 그것이 4단계 카드에서 이미 한 번 겪은 회귀(UAT 2026-08-11)다.
  const canGoDiary = isCharacterDone && isAdhdDone && isStressDone;
  /** 잠긴 줄은 목적지를 주지 않는다 — 클릭 표시도 함께 사라진다. */
  const goDiaryIf = (state: ChallengeState) =>
    state !== 'locked' && canGoDiary ? onGoDiary : undefined;

  // ── 지금 할 일 (기능 요구사항 NRQ-0031의 말풍선 연동을 그대로 옮긴 것) ──
  // 말과 목적지가 **같은 상태 하나**에서 나온다. 예전에는 말풍선 분기와 버튼
  // 분기가 따로 서 있어, 한쪽만 고치면 "스트레스 검사를 하라"고 말하면서
  // 시나리오로 보내는 어긋남이 생길 수 있었다.
  //
  // 아래 네 갈래는 빈틈이 없다 — 홈 화면에서 나올 수 있는 상태를 전부 덮는다.
  // 예전에 있던 COPY.home.speechDefault(기본 인사)는 그래서 한 번도 화면에 닿은
  // 적이 없었고, 2026-08-14에 정의째 지웠다. 여기에 초기값을 두는 형태로
  // 되돌리지 말 것 — 도달 불가 분기가 다시 생긴다.
  const cta = !isCharacterDone
    ? {
        message: COPY.home.speechNoCharacter,
        actionLabel: COPY.home.ctaCreateCharacter,
        onClick: onStartCreation,
      }
    : !isAdhdDone
      ? {
          message: COPY.home.speechNeedAdhd(character.nickname),
          actionLabel: COPY.home.ctaStartAdhd,
          onClick: () => onStartTest('adhd'),
        }
      : !isStressDone
        ? {
            message: COPY.home.speechNeedStress,
            actionLabel: COPY.home.ctaStartStress,
            onClick: () => onStartTest('stress'),
          }
        : {
            message: COPY.home.speechAllDone,
            actionLabel: COPY.home.ctaGoScenario,
            onClick: onGoScenario,
          };

  return (
    <div className="w-full flex flex-col gap-3">
      {/* ── 상단 CTA 카드 — 스크롤러 최상단에 플러시로 sticky (2026-08-18 팀 회의) ──
          "지금 할 일"은 스크롤 위치와 무관하게 늘 손 닿는 곳에 있어야 한다는
          결정이다 (회복일기 탭의 고정 블록과 같은 문법).

          2026-08-14의 "자연 높이로 흘러야 한다"는 주석을 이 결정이 대체한다.
          그때 문제였던 것은 438px 히어로가 **자기 스크롤러를 갖고** 뷰포트를
          선점해 여정 카드에 아예 닿지 못한 것이지 sticky 자체가 아니었다.
          지금 고정되는 것은 CTA 카드 한 장(약 113px)뿐이고 스크롤은 여전히
          PageLayout의 main 하나가 소유한다.

          -mx-6: 부모 main의 px-6을 상쇄해 프레임 폭까지 확장.
          -mt-6: 위쪽 여백(HomePage 콘텐츠 래퍼의 py-6 = 24px)을 정확히 상쇄해
                 정적 위치를 스크롤포트 상단(0)에 맞춘다. 딱 맞게 상쇄해야
                 sticky 보정이 0이 되어, 스크롤 0에서 아래 콘텐츠와 겹치지도
                 위에 틈이 남지도 않는다. **뷰마다 값이 다르다** — 홈은 자체
                 py가 없어 24px뿐이지만 EpisodeListView는 자기 py-2가 더해져
                 -mt-8이다. 복사해 쓰지 말고 그 화면의 누적 여백을 세어 볼 것.
          안쪽 pt-6/px-6이 그 여백을 되돌린다.

          h-full도 shrink-0도 두지 않는다 — 높이는 내용이 정한다. 여정
          타이틀(h3)도 여기 두지 않고 아래 목록의 첫 자식으로 내려보냈다.
          함께 묶으면 고정 높이가 157px이 되어 430px 프레임에서 과했다. */}
      <div className="sticky top-0 z-20 -mt-6 -mx-6 px-6 pt-6 pb-3 bg-surface">
        {/* 페이드 엣지 — 고정 카드 아래로 여정 목록이 지나갈 때 뚝 끊기지 않고
            서서히 사라지게 하는 스크롤 어포던스
            (EpisodeListView·DiaryListView와 같은 관례) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-full h-4 bg-gradient-to-b from-surface to-transparent"
        />

        {/* 캐릭터가 아직 없으면 화자도 없다 — 얼굴은 실루엣이고 speaker(닉네임
            라벨)는 넘기지 않는다. 아직 이름을 가진 화자가 없기 때문이다. */}
        <HomeCtaCard
          face={character ? character.gender : 'silhouette'}
          speaker={character ? character.nickname : undefined}
          message={cta.message}
          actionLabel={cta.actionLabel}
          onClick={cta.onClick}
        />
        {/* 여정 타이틀도 CTA와 함께 고정한다(2026-08-26 검수) — 목록을 넘겨도
            '무엇의 목록인지'가 위에 남는다. */}
        <h3 className="mt-4 text-[16px] font-bold text-on-surface font-headline flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[20px] text-primary">route</span>
          {COPY.home.journeyTitle}
        </h3>
      </div>

      {/* ── 마음 건강 여정 현황 ──
          **스크롤을 소유하지 않는다.** 이 목록은 자기 높이만큼 자라고,
          스크롤은 PageLayout의 콘텐츠 영역(`ui/PageLayout.tsx`의 main)이
          담당한다 — 앱 전체의 규약이다. 하단 여백은 HomePage 콘텐츠 래퍼의
          py-6이 이미 주므로 여기서 pb를 따로 주지 않는다.

          카드의 위계는 **색온도**가 만든다 — 잠김은 먼 그늘
          (surface-container-low + opacity), 완료는 볕 든 면
          (surface-container), 다음에 할 것은 primary 틴트다. 예전에 붙어
          있던 hover:shadow-lg는 걷어냈다(그림자 없음 원칙). */}
      <div className="flex flex-col gap-3">
        {/* 1단계: 캐릭터 생성
            여정의 시작점이라 위에 잠글 것이 없다 — 완료 아니면 '시작'이다. */}
        <div
          onClick={() => !isCharacterDone && onStartCreation()}
          className={`
            flex items-center justify-between p-4 rounded-pane border transition-colors duration-200
            ${isCharacterDone
              ? 'bg-surface-container border-card-border'
              : 'bg-primary-fixed/40 border-primary/40 cursor-pointer hover:border-primary active:scale-[0.99]'}
          `}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isCharacterDone ? 'bg-primary/20 text-primary' : 'bg-primary text-on-primary'}`}>
              <span className="material-symbols-outlined">person</span>
            </div>
            <div>
              <p className="text-[14px] font-bold text-on-surface font-headline">{COPY.home.step1Title}</p>
              <p className="text-[12px] text-on-surface-variant font-body">
                {isCharacterDone ? COPY.home.step1DescDone : COPY.home.step1DescTodo}
              </p>
            </div>
          </div>
          {isCharacterDone ? (
            <span className="material-symbols-outlined text-primary text-[24px]">check_circle</span>
          ) : (
            <span className="text-[11px] font-bold px-2.5 py-1.5 rounded-full bg-primary text-on-primary shrink-0 font-headline">
              {COPY.home.chipStart}
            </span>
          )}
        </div>

        {/* 2단계: ADHD 검사
            캐릭터가 없으면 잠긴다 — 검사는 캐릭터에 딸린 기록이라 화자 없이
            시작할 수 없다. 3단계가 ADHD 미완을 잠그는 것과 같은 사슬이며,
            여기를 열어 두면 누를 수는 있는데 아무 데도 못 가는 카드가 된다. */}
        <div
          onClick={() => isCharacterDone && !isAdhdDone && onStartTest('adhd')}
          className={`
            flex items-center justify-between p-4 rounded-pane border transition-colors duration-200
            ${isAdhdDone
              ? 'bg-surface-container border-card-border'
              : !isCharacterDone
              ? 'bg-surface-container-low border-card-border opacity-50'
              : 'bg-primary-fixed/40 border-primary/40 cursor-pointer hover:border-primary active:scale-[0.99]'}
          `}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isAdhdDone ? 'bg-primary/20 text-primary' : !isCharacterDone ? 'bg-disabled-bg text-outline' : 'bg-primary text-on-primary'}`}>
              <span className="material-symbols-outlined">psychology</span>
            </div>
            <div>
              <p className="text-[14px] font-bold text-on-surface font-headline">{COPY.home.step2Title}</p>
              <p className="text-[12px] text-on-surface-variant font-body">
                {isAdhdDone
                  ? COPY.home.step2DescDone
                  : !isCharacterDone
                  ? COPY.home.step2DescLocked
                  : COPY.home.step2DescTodo}
              </p>
            </div>
          </div>
          {isAdhdDone ? (
            <span className="material-symbols-outlined text-primary text-[24px]">check_circle</span>
          ) : !isCharacterDone ? (
            <span className="material-symbols-outlined text-outline text-[20px]">lock</span>
          ) : (
            <span className="text-[11px] font-bold px-2.5 py-1.5 rounded-full bg-primary text-on-primary shrink-0 font-headline">
              {COPY.home.chipStart}
            </span>
          )}
        </div>

        {/* 3단계: 스트레스 검사
            판별 불가로 끝난 경우도 stressResult가 null이라 이 조건이 그대로
            참이다 — 카드를 눌러 바로 재검사로 들어간다 (별도 분기 불필요).

            완료 여부를 잠김보다 **먼저** 본다. ADHD 결과 없이 스트레스만 있는
            상태(4단계 불일치와 같은 재현 경로)에서 순서를 뒤집으면, 이미 끝낸
            검사가 '잠김'으로 보이는 두 번째 거짓말이 된다. */}
        <div
          onClick={() => isAdhdDone && !isStressDone && onStartTest('stress')}
          className={`
            flex items-center justify-between p-4 rounded-pane border transition-colors duration-200
            ${isStressDone
              ? 'bg-surface-container border-card-border'
              : !isAdhdDone
              ? 'bg-surface-container-low border-card-border opacity-50'
              : 'bg-primary-fixed/40 border-primary/40 cursor-pointer hover:border-primary active:scale-[0.99]'}
          `}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isStressDone ? 'bg-primary/20 text-primary' : !isAdhdDone ? 'bg-disabled-bg text-outline' : 'bg-primary text-on-primary'}`}>
              <span className="material-symbols-outlined">insights</span>
            </div>
            <div>
              <p className="text-[14px] font-bold text-on-surface font-headline">{COPY.home.step3Title}</p>
              <p className="text-[12px] text-on-surface-variant font-body">
                {isStressDone
                  ? COPY.home.step3DescDone
                  : !isAdhdDone
                  ? COPY.home.step3DescLocked
                  : invalidStressAttempt
                  ? COPY.home.step3DescInvalid
                  : COPY.home.step3DescTodo}
              </p>
            </div>
          </div>
          {isStressDone ? (
            <span className="material-symbols-outlined text-primary text-[24px]">check_circle</span>
          ) : !isAdhdDone ? (
            <span className="material-symbols-outlined text-outline text-[20px]">lock</span>
          ) : (
            <span className="text-[11px] font-bold px-2.5 py-1.5 rounded-full bg-primary text-on-primary shrink-0 font-headline">
              {COPY.home.chipStart}
            </span>
          )}
        </div>

        {/* 4단계: 훈련 시나리오 (해금 시 클릭 → 시나리오 탭)
            행동 가능 카드는 연한 primary 배경 + 솔리드 아이콘 + 칩으로
            완료/잠김 카드와 확실히 구분한다 */}
        <div
          onClick={() => isScenarioUnlocked && onGoScenario()}
          className={`flex items-center justify-between p-4 rounded-pane border transition-colors duration-200 ${isScenarioUnlocked ? 'bg-primary-fixed/40 border-primary/40 cursor-pointer hover:border-primary active:scale-[0.99]' : 'bg-surface-container-low border-card-border opacity-50'}`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isScenarioUnlocked ? 'bg-primary text-on-primary' : 'bg-disabled-bg text-outline'}`}>
              <span className="material-symbols-outlined">explore</span>
            </div>
            <div>
              <p className="text-[14px] font-bold text-on-surface font-headline">{COPY.home.step4Title}</p>
              <p className="text-[12px] text-on-surface-variant font-body">
                {isScenarioUnlocked ? COPY.home.step4DescUnlocked : COPY.home.step4DescLocked}
              </p>
            </div>
          </div>
          {isScenarioUnlocked ? (
            <span className="text-[11px] font-bold px-2.5 py-1.5 rounded-full bg-primary text-on-primary shrink-0 font-headline">
              {COPY.home.chipEnter}
            </span>
          ) : (
            <span className="material-symbols-outlined text-outline text-[20px]">lock</span>
          )}
        </div>

        {/* ── 도전과제 1 → 4 (Step 4 아래로 이어진다) ──
            목록이 1단계부터 내려오는 오름차순이므로 도전과제도 쉬운 것이
            위다(2026-08-27 UAT: "마음 건강 여정 단계도 ASC로 정렬"). 각 줄은
            바로 위 줄이 끝나야 열리는 사슬이며(Step 2~4와 같은 관례), 잠긴
            동안에도 앞으로 무엇이 기다리는지 보여 준다. */}
        {isChallengeDataReady && (
          <>
            <ChallengeRow
              icon="auto_stories"
              title={COPY.home.challenge1Title}
              desc={
                challenge1State === 'done'
                  ? COPY.home.challenge1DescDone
                  : challenge1State === 'progress'
                  ? COPY.home.challenge1DescTodo
                  : COPY.home.challenge1DescLocked
              }
              state={challenge1State}
              onClick={goDiaryIf(challenge1State)}
            />

            <ChallengeRow
              icon="flag"
              title={COPY.home.challenge2Title}
              desc={
                challenge2State === 'done'
                  ? COPY.home.challenge2DescDone
                  : challenge2State === 'progress'
                  ? COPY.home.challenge2DescTodo
                  : COPY.home.challenge2DescLocked
              }
              state={challenge2State}
              onClick={goDiaryIf(challenge2State)}
            />

            <ChallengeRow
              icon="emoji_events"
              title={COPY.home.challenge3Title}
              desc={
                challenge3State === 'done'
                  ? COPY.home.challenge3DescDone
                  : challenge3State === 'progress'
                  ? COPY.home.challenge3DescProgress(album.completedThemes, album.totalThemes)
                  : COPY.home.challenge3DescLocked
              }
              state={challenge3State}
              onClick={goDiaryIf(challenge3State)}
            />

            <ChallengeRow
              icon="auto_awesome"
              title={COPY.home.challenge4Title}
              desc={
                challenge4State === 'opened'
                  ? COPY.home.challenge4DescUnlocked
                  : COPY.home.challenge4DescLocked
              }
              state={challenge4State}
              onClick={goDiaryIf(challenge4State)}
            />
          </>
        )}
      </div>
    </div>
  );
}
