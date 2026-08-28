// src/components/scenario/VisualNovelPlayer.tsx
// 비주얼 노벨 플레이어 — 풀스크린 조합 루트.
//
// ── 레이아웃 모델: "무대는 항상 전체, UI는 시트" (2026-08-14 재설계) ──────
//
// 예전에는 [상단 바 · 스테이지 · 하단 패널]이 화면 높이를 나눠 가졌고, 하단
// 패널이 픽셀 고정이라 스테이지만 압축됐다(요정 잘림 · 선택 후 과소 · 대사 박스
// 협소 · 단계마다 덜컹임이 모두 그 하나의 구조에서 나왔다). 지금은 무대가 늘
// 프레임 전체를 쓰고, 모든 단계의 UI가 **하나의 하단 시트** 안에서 내용만
// 바뀐다. 진단과 설계 근거는 docs/qa/2026-08-13-player-redesign-proposal.md.
//
//   z-0   PlayerStage   배경 · 스크림 · 배역 (프레임 기준 크기)
//   z-10  되돌리기 존   화면 좌측 30% (SITUATION에서만)
//   z-20  PlayerSheet   단계별 시트
//   z-30  PlayerTopBar  씬 세그먼트 · 회차 · ✕
//
// ── 진행 문법 ────────────────────────────────────────────────────────
//
// 엔딩 플레이어(EndingPage)에서 이식했다. 읽는 단계(SITUATION)는 **화면 아무
// 데나 탭**하면 넘어가고(타이핑 중이면 스킵), 좌측 30% 탭과 ←키로 직전 문장에
// 돌아간다. 고르는 단계(요정·평가)는 탭 진행을 끄고 시트의 버튼만 받는다 —
// "읽기는 탭, 결정은 버튼".
//
// ⚠️ 탭 핸들러는 이 루트에만 있다. 시트나 무대에 따로 달면 버블링으로 두 번
// 진행된다. 반대로 시트 안의 버튼·상단 바는 stopPropagation이 필요하다.
// 모달(ConfirmDialog·완료 모달)은 Portal이지만 React 트리상 이 루트의 자식이라
// 클릭이 여기까지 올라온다 — 그래서 모달이 열려 있으면 탭 진행을 잠근다.
//
// ScenarioTab이 Portal로 프레임 직속에 띄우므로 홈 헤더·탭바의 패딩이나
// z-index에 영향받지 않는다.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EpisodeData } from '../../api/scenarioMockData';
import { collectEpisodeImageUrls, preloadImages, type CharacterGender } from './player/assetUrls';
import { useEpisodePlayer } from './player/useEpisodePlayer';
import { usePersonalizedText } from './usePersonalizedText';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { COPY } from '../../constants/copy';
import ConfirmDialog from '../ui/ConfirmDialog';
import ProgressBar from '../ui/ProgressBar';
import PlayerStage from './player/PlayerStage';
import PlayerTopBar from './player/PlayerTopBar';
import PlayerSheet from './player/PlayerSheet';
import DialogueContent from './player/DialogueContent';
import AngelBrowseContent from './player/AngelBrowseContent';
import ApplyContent from './player/ApplyContent';
import EvaluateContent from './player/EvaluateContent';
import CompleteContent from './player/CompleteContent';

/** 화면 왼쪽 이 비율만큼이 "이전 문장" 영역이다. 스토리 UI의 통상 관례를 따른다. */
const PREV_ZONE_WIDTH = '30%';

/**
 * 시트가 차지할 수 있는 최대 높이(프레임 기준). 제안서의 "55% 안팎"을 58%로
 * 잡은 이유는, 평가 단계에서 선택지 3개 + 머리글 + 오류 안내가 한꺼번에 설 때
 * 430×720 프레임에서 실측 높이가 55%를 살짝 넘겨 곧바로 스크롤이 걸리기
 * 때문이다. vh가 아니라 %인 것은 프레임(h-[100dvh])이 기준이기 때문이다.
 */
const SHEET_MAX_HEIGHT = 'max-h-[58%]';

/**
 * 시트가 **자기 높이를 무대에 알려 주는** CSS 변수 (2026-08-27 2차 UAT R2-02).
 *
 * 무대의 요정은 프레임 기준 %로 서는데, 시트는 내용 높이(px)로 선다. 이 둘은
 * 프레임이 짧아질수록 어긋나서, 375×667에서는 요정 셋의 하반신이 통째로 시트
 * 뒤로 들어갔다. 그래서 시트 쪽이 자기 높이를 알리고 요정이 그 위로 비켜선다 —
 * 값을 **쓰는** 쪽(PlayerStage.ANGEL_ROW_FLOOR)에 근거와 계산이 함께 있다.
 *
 * 변수는 프레임 루트에 걸린다. 무대가 그 자손이라 그냥 상속된다.
 */
const SHEET_HEIGHT_VAR = '--player-sheet-h';

interface VisualNovelPlayerProps {
  uid: string;
  episode: EpisodeData;
  characterGender: CharacterGender;
  /** 이 영역의 마지막(10)회차인가 — 완료 모달의 문구·버튼을 가른다. */
  isLastEpisode: boolean;
  /**
   * 플레이어를 빠져나갈 때. `didComplete`는 **에피소드를 끝낸 뒤** 나가는지를
   * 알린다 — 마지막 회차에서 이 값이 true면 호출부가 그냥 목록으로 보내지 않고
   * 마무리 분기(보고서/회복일기 해금)로 합류시킨다. 중간에 X로 나가는 경우와
   * 구분하려고 인자를 둔다.
   */
  onExit: (didComplete?: boolean) => void;
  onNext: (wasHelpful: boolean) => void;
}

export default function VisualNovelPlayer({
  uid,
  episode,
  characterGender,
  isLastEpisode,
  onExit,
  onNext,
}: VisualNovelPlayerProps) {
  const player = useEpisodePlayer(uid, episode);
  // 타이틀에도 주인공 이름이 들어간다 ("자격증 공부가 늘지 않는 백설").
  const personalize = usePersonalizedText();
  const reducedMotion = usePrefersReducedMotion();

  // ── 이탈 확인 게이트 ──
  //
  // 에피소드 결과는 마지막 평가(handleReasonSelect)에서 한 번에 저장된다.
  // 그래서 EPISODE_COMPLETE 이전에 ✕를 누르면 요정 조언 열람·전략 선택·평가가
  // 통째로 사라지는데, 예전에는 아무 경고 없이 곧바로 닫혔다.
  //
  // 기준을 `step !== 'SITUATION'`이 아니라 첫 대사 진행까지 포함시킨 것은,
  // SITUATION 단계 안에서도 대사를 넘긴 만큼은 되돌아가지 않기 때문이다.
  // 반대로 **막 열어 첫 대사에 머무는 상태**(잘못 눌러 들어온 경우)는 잃을 것이
  // 없으므로 되묻지 않는다 — 확인 모달이 습관적으로 무시되지 않게 하려면
  // 실제로 잃을 게 있을 때만 떠야 한다.
  const isEpisodeSaved = player.step === 'EPISODE_COMPLETE';
  const hasUnsavedProgress =
    !isEpisodeSaved && (player.step !== 'SITUATION' || player.situationIndex > 0);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const handleExitClick = () => {
    if (hasUnsavedProgress) {
      setShowExitConfirm(true);
      return;
    }
    onExit(isEpisodeSaved);
  };

  // ── 에피소드 에셋(배경·캐릭터·요정) 프리로드 게이트 ──
  //
  // 게이트의 목적은 하나다: **에피소드가 시작되기 전에 그 회차의 그림을 다
  // 받아 둔다.** 준비 전에 씬을 그리면 대사만 먼저 나오고 그림이 뒤늦게
  // 뜨며, 인물 수가 0 → 1 → 2로 바뀌면서 무대가 밀린다.
  //
  // ⚠️ 2026-08-18 실플레이 지적("옛날엔 미리 받아서 지연이 없었는데 지금은
  // 대사만 먼저 나온다")의 원인은 여기 있던 **3초 폴백**이었다. 프리로드
  // 성공 여부와 무관하게 3초 뒤 게이트를 열어 버려서, 한 회차 3.9MB(최대
  // 7.1MB) 실측 용량을 3초에 받아 낼 수 없는 회선에서는 사실상 게이트가
  // 늘 헛돌았다. 지금은 **프리로드가 끝나야만** 열린다. 멈춘 요청이 플레이어를
  // 영영 붙잡는 것은 폴백이 아니라 preloadImages 안의 장당 타임아웃
  // (PRELOAD_TIMEOUT_MS)이 막는다 — 시간을 넘긴 URL은 실패로 집계되므로
  // 아래 실패 안내 경로로 그대로 합류한다.
  //
  // ── 오프라인 무경고 진행 (2026-08-12 UAT) ──
  // 예전에는 프리로드가 실패를 삼켜서, 오프라인이면 alt 텍스트("배경",
  // "등장 캐릭터")만 뜬 채 아무 안내 없이 끝까지 진행됐다. 이제 실패한
  // URL이 하나라도 있으면 안내를 띄운다. **진행을 막지는 않는다** —
  // 대사는 이미 받아 둔 CSV라 그림 없이도 읽을 수 있고, 여기서 막으면
  // 저장 전 진행이 통째로 날아간다.
  const [assetsReady, setAssetsReady] = useState(false);
  const [showAssetError, setShowAssetError] = useState(false);
  // 기다리는 동안 무엇이 얼마나 남았는지 보여 주기 위한 집계. 게이트가
  // 실제로 다 받을 때까지 닫혀 있게 되면서 대기가 3초보다 길어질 수 있고,
  // 그때 도는 스피너만으로는 "멈춘 것"과 구분이 되지 않는다.
  const [assetProgress, setAssetProgress] = useState({ settled: 0, total: 0 });
  // 재시도 시 프리로드 effect를 다시 돌리기 위한 카운터.
  const [assetRetryCount, setAssetRetryCount] = useState(0);
  // "그대로 진행하기"를 고른 뒤에는 다시 묻지 않는다 — 씬을 넘길 때마다
  // 깨진 <img>가 onError를 다시 쏘므로, 이 빗장이 없으면 같은 안내가
  // 장면마다 튀어나온다. 재시도·에피소드 전환에서만 풀린다.
  const assetErrorDismissed = useRef(false);

  useEffect(() => {
    let alive = true;
    setAssetsReady(false);
    setShowAssetError(false);
    setAssetProgress({ settled: 0, total: 0 });
    assetErrorDismissed.current = false;
    preloadImages(collectEpisodeImageUrls(episode, characterGender), {
      onProgress: (settled, total) => {
        if (alive) setAssetProgress({ settled, total });
      },
    }).then((result) => {
      if (!alive) return;
      setAssetsReady(true);
      if (result.failed.length > 0) {
        console.warn('Scenario assets failed to load:', result.failed);
        setShowAssetError(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [episode, characterGender, assetRetryCount]);

  // 프리로드를 통과한 뒤 오프라인으로 전환된 경우 — 씬의 <img>가 깨질 때
  // 같은 안내로 합류시킨다.
  const handleAssetError = useCallback(() => {
    if (assetErrorDismissed.current) return;
    setShowAssetError(true);
  }, []);

  // ── 진행 문법 ──
  //
  // 읽는 단계에서만 열린다. 모달이 떠 있으면 잠근다 — 확인 모달은 Portal이지만
  // React 트리상 이 컴포넌트의 자식이라, 모달 안의 클릭도 루트까지 버블링된다.
  const isReading = player.step === 'SITUATION';
  const canAdvance = isReading && assetsReady && !showExitConfirm && !showAssetError;
  const canGoBack = canAdvance && player.situationIndex > 0;

  const handleStageTap = () => {
    if (!canAdvance) return;
    player.handleDialogClick();
  };

  // 좌우 방향키로도 넘긴다. 화면 좌우 탭이 모바일 조작이라면 이쪽은 데스크톱
  // 조작이며, 어디에 포커스가 있든 동작해야 하므로 window에 건다.
  // preventDefault는 방향키가 시트를 가로로 스크롤시키는 것을 막기 위한 것이다.
  //
  // 핸들러를 ref에 담아 두고 리스너는 한 번만 건다. 훅이 렌더마다 새 함수를
  // 돌려주므로 의존성 배열에 그대로 넣으면 대사 한 줄마다 리스너를 떼었다
  // 다시 다는데, 그러면서 어느 상태를 빠뜨리면 조용히 낡은 값을 붙잡는다.
  const keyActionsRef = useRef({
    canAdvance,
    canGoBack,
    advance: () => {},
    back: () => {},
  });
  keyActionsRef.current = {
    canAdvance,
    canGoBack,
    advance: player.handleDialogClick,
    back: player.handleSituationBack,
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const actions = keyActionsRef.current;
      if (event.key === 'ArrowRight' && actions.canAdvance) {
        event.preventDefault();
        actions.advance();
      } else if (event.key === 'ArrowLeft' && actions.canGoBack) {
        event.preventDefault();
        actions.back();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isAngelStep = player.step === 'ANGELS' || player.step === 'ANGEL_DETAIL';

  // ── 화자 이름표는 이 플레이어의 어느 단계도 세우지 않는다 ───────────
  //
  // 2026-08-27 2차 UAT(R2-03)에서 두 자리를 잇달아 걷어냈다.
  //   · 요정 조언 — 무대의 요정 그림(강조된 한 마리) · 칩(이름) · 제목(전략
  //     분류명)이 이미 "누구의 무슨 조언인가"를 세 겹으로 말하고 있었다.
  //   · 실행 소감 — 무대에 주인공 혼자 서 있고 시트에 "선택된 전략"까지 적혀
  //     있어, 닉네임 이름표는 화면에 이미 있는 사실을 한 번 더 말할 뿐이었다.
  //
  // 남기는 기준은 하나다: **누가 말하는지가 그림에 없는 자리**에만 세운다.
  // 상황 대사는 내레이션이라 원래부터 이름표가 없었고, 평가·완료 단계는 화자가
  // 없는 시스템 문구다. 그래서 지금은 어느 단계도 speaker를 넘기지 않는다.
  //
  // ⚠️ PlayerSheet의 이름표 기능 자체는 남겨 둔다 — 원고가 대사에 화자를 싣게
  // 되면(CSV에 화자 열이 생기면) 그 자리가 이 기능이 돌아올 유일한 자리다.

  // ── 시트 높이를 무대에 알린다 (2026-08-27 2차 UAT R2-02) ──
  //
  // 재는 대상은 **시트를 감싼 칸**이다. 화자 이름표(시트 위로 삐져나온 탭)와
  // 아래 여백(pb-5)까지 그 칸의 높이에 들어 있어서, 이 값 하나면 "화면에서
  // 시트가 차지하는 세로"가 정확히 나온다.
  //
  // ⚠️ 넣는 값은 순간 높이가 아니라 **단계 묶음 안에서의 최고치**다. 시트는
  // 요정을 바꿀 때마다 조언 길이만큼 자랐다 줄었다 하는데, 그대로 흘리면 요정
  // 행이 그때마다 오르내린다 — 2026-08-18에 "눌러야 요정이 올라온다"는 지적으로
  // 한 번 없앤 움직임이 방향만 바뀌어 되돌아오는 셈이다. 최고치만 흘리면 행은
  // 내려오지 않고, 움직임은 단계 묶음당 많아야 한 번이다.
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetBoxRef = useRef<HTMLDivElement>(null);
  const sheetPeakRef = useRef(0);

  const publishSheetHeight = useCallback(() => {
    const root = rootRef.current;
    const box = sheetBoxRef.current;
    if (!root || !box) return;
    const height = box.getBoundingClientRect().height;
    // 레이아웃이 없는 환경(jsdom)에서는 0이 나온다. 0은 흘리지 않는다 —
    // 변수가 없는 상태가 곧 "예전 고정값"이라 그쪽이 안전한 폴백이다.
    if (height <= sheetPeakRef.current) return;
    sheetPeakRef.current = height;
    root.style.setProperty(SHEET_HEIGHT_VAR, `${Math.round(height)}px`);
  }, []);

  // 요정 단계를 드나들면 최고치를 버린다. 요정 시트(≈340px)가 남긴 값이 그
  // 뒤 단계까지 따라가면 동행 요정이 이유 없이 높이 뜬다.
  useLayoutEffect(() => {
    sheetPeakRef.current = 0;
    rootRef.current?.style.removeProperty(SHEET_HEIGHT_VAR);
    publishSheetHeight();
  }, [isAngelStep, episode, publishSheetHeight]);

  useLayoutEffect(() => {
    const box = sheetBoxRef.current;
    // jsdom에는 ResizeObserver가 없다. 관측이 없으면 변수도 없고, 그러면 무대는
    // 예전 고정값으로 선다 — 테스트가 죽는 대신 조용히 예전 배치가 된다.
    if (!box || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(publishSheetHeight);
    observer.observe(box);
    return () => observer.disconnect();
  }, [publishSheetHeight]);

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-40 bg-surface flex flex-col font-body animate-fadeIn overflow-hidden"
      onClick={handleStageTap}
    >
      <PlayerStage
        step={player.step}
        scene={player.currentScene}
        characterGender={characterGender}
        // 연인 영역의 상대역만 반대 성별 백설이로 바뀐다 — 그 판정 근거는
        // 에피소드가 온 CSV의 DOMAIN 값이다 ('연인3' 등).
        domain={episode.scenario.domain}
        // 무대의 강조는 시트에 펼쳐진 조언이 아니라 **누른 요정**을 따른다.
        // 자동 펼침이 사라진 지금은 두 값이 실질적으로 같이 움직이지만, 갈라
        // 둔 채로 남긴다 — 무대가 "선택된 것처럼" 보이는지는 사용자의 누름만이
        // 정해야 한다(2026-08-11 UAT)는 것이 이 prop의 존재 이유다.
        pressedAngelKey={player.pressedAngelKey}
        selectedAngelKey={player.selectedAngelKey}
        // 읽음 기록도 시트의 칩과 같은 값을 본다 — 칩에는 '읽음' 체크로,
        // 무대에는 아직 듣지 않은 요정 위의 말풍선으로 나타난다.
        readAngels={player.readAngels}
        // 요정 그림과 시트의 요정 칩은 같은 입구다 — 핸들러도 하나를 공유한다
        onAngelSelect={player.handleAngelClick}
        onAssetError={handleAssetError}
        castHidden={!assetsReady}
      />

      {/* 이전 문장 영역 — 무대 위에만 깔린다. 시트(z-20)와 상단 바(z-30)는
          자기 몫의 조작이 있으므로 이 존이 덮지 않는다. */}
      {canGoBack && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            player.handleSituationBack();
          }}
          className="absolute inset-y-0 left-0 z-10"
          style={{ width: PREV_ZONE_WIDTH }}
          aria-label={COPY.player.prevSceneLabel}
        />
      )}

      <PlayerTopBar
        episodeNumber={episode.episodeNumber}
        title={personalize(episode.title)}
        sceneTotal={episode.scenario.scenes.length}
        sceneCurrent={player.situationIndex}
        scenesDone={!isReading}
        onExit={handleExitClick}
      />

      {/* ── 에셋 로딩 중 표시 ──
          배경 이미지가 그대로 비치는 자리라, 안내 문구는 시트와 같은 표면 위에
          얹어 대비를 확보한다. 세로 배치를 흔들지 않도록 오버레이로 띄운다.

          진행 막대는 게이트가 "다 받을 때까지" 닫혀 있게 되면서 붙였다. 대기가
          길어질 수 있는데 도는 스피너만으로는 멈춘 것과 구분되지 않는다.

          ── 낭독 범위는 바뀌는 한 줄뿐이다 (2026-08-18 회의) ──
          예전에는 카드 **전체**가 aria-live였다. 그래서 한 장 받을 때마다
          안내문과 진행 막대까지 통째로 다시 읽혔고(장수만큼 반복), 그 안에
          role="progressbar"가 중첩되면서 같은 정보가 이름·값·문구 세 번으로
          나왔다. 지금은 진행 문구 한 줄만 live region이고, 진행 막대는 그 줄을
          그림으로 되풀이할 뿐이라 낭독에서 뺀다. */}
      {!assetsReady && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="rounded-pane px-7 py-6 bg-surface-container-low/90 backdrop-blur-md border border-outline-variant/30 flex flex-col items-center gap-3">
            <div className="w-9 h-9 rounded-full border-2 border-primary-container border-t-transparent animate-spin" />
            <p className="text-[13px] text-outline font-body">{COPY.player.preparing}</p>
            {assetProgress.total > 0 && (
              <div className="w-40 flex flex-col items-center gap-1.5">
                <div aria-hidden="true" className="w-full rounded-full overflow-hidden">
                  <ProgressBar percent={(assetProgress.settled / assetProgress.total) * 100} />
                </div>
                <p
                  role="status"
                  aria-live="polite"
                  className="text-[11px] text-outline-variant font-body tabular-nums"
                >
                  {COPY.player.preparingProgress(assetProgress.settled, assetProgress.total)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 무대가 보이는 여백 — 시트를 아래로 밀어 두는 역할만 한다.
          ⚠️ pointer-events-none은 장식이 아니다. 이 칸은 무대(PlayerStage,
          absolute z-0)와 **같은 z-index**인데 DOM에서 뒤에 오므로 무대 위에
          그려지고, 그대로 두면 히트 테스트가 여기서 멈춰 무대의 요정 버튼이
          눌리지 않는다. 2026-08-14 재설계로 이 칸이 생기면서 8/12에 고쳐 둔
          "요정 그림 클릭"이 조용히 죽어 있었다 — jsdom에는 레이아웃이 없어
          테스트는 계속 통과했다(2026-08-18 검수에서 재발견).
          클릭이 통과하면 아래의 무대가 받고, 무대의 클릭은 루트까지
          버블링되므로 "화면 아무 데나 탭 = 다음"도 그대로 산다. */}
      <div className="relative z-0 flex-1 min-h-0 pointer-events-none" />

      {/* ── 하단 시트 ──
          key={step}로 단계가 바뀔 때만 등장 모션을 다시 재생한다. 대사를 넘길
          때마다 다시 재생되면 읽는 흐름이 끊긴다.

          프리로드 게이트는 DOM에서 지우지 않고 감춘다 — 시트를 언마운트하면
          대사 타이핑이 처음부터 다시 시작되고, 그림만 늦게 오는 상황에서
          이미 읽던 문장이 되감긴다. */}
      <div
        ref={sheetBoxRef}
        className={`relative z-20 shrink-0 flex flex-col px-4 pb-5 ${SHEET_MAX_HEIGHT} ${
          assetsReady ? '' : 'hidden'
        }`}
      >
        <PlayerSheet
          key={player.step}
          tappable={isReading}
          reducedMotion={reducedMotion}
          hint={
            isReading
              ? player.isTextComplete
                ? COPY.player.tapNext
                : COPY.player.tapSkip
              : undefined
          }
          hintIcon={isReading ? (player.isTextComplete ? 'play_arrow' : 'double_arrow') : undefined}
        >
          {player.step === 'SITUATION' && (
            <DialogueContent
              scene={player.currentScene}
              // 모션을 줄이는 환경에서는 타이핑 연출 없이 전문을 바로 띄운다.
              isTextSkipped={player.isTextSkipped || reducedMotion}
              onTextComplete={() => player.setIsTextComplete(true)}
            />
          )}

          {(player.step === 'ANGELS' || player.step === 'ANGEL_DETAIL') && (
            <AngelBrowseContent
              episode={episode}
              activeAngelKey={player.activeDetailAngelKey}
              readAngels={player.readAngels}
              onAngelClick={player.handleAngelClick}
              onSelectStrategy={player.handleSelectStrategy}
              onBackToScene={player.handleAngelBackToScene}
            />
          )}

          {player.step === 'APPLY_STRATEGY' && player.selectedAngelKey && (
            <ApplyContent
              angelKey={player.selectedAngelKey}
              angel={episode.angels[player.selectedAngelKey]}
              onNext={player.handleApplyNext}
              onBack={player.handleApplyBack}
            />
          )}

          {(player.step === 'EVALUATE_HELPFUL' || player.step === 'EVALUATE_REASON') && (
            <EvaluateContent
              mode={player.step === 'EVALUATE_HELPFUL' ? 'helpful' : 'reason'}
              episode={episode}
              strategyKey={player.selectedAngelKey}
              wasHelpful={player.wasHelpful}
              isSubmitting={player.isSubmitting}
              submitError={player.submitError}
              onHelpfulSelect={player.handleHelpfulSelect}
              onBack={player.handleEvaluateBack}
              onBackToApply={player.handleHelpfulBack}
              onReasonSelect={player.handleReasonSelect}
            />
          )}

          {player.step === 'EPISODE_COMPLETE' && (
            <CompleteContent
              wasHelpful={player.wasHelpful}
              isLastEpisode={isLastEpisode}
              onExit={() => onExit(true)}
              onNext={() => onNext(player.wasHelpful ?? true)}
            />
          )}
        </PlayerSheet>
      </div>

      {/* 이미지 로드 실패 안내 — 진행은 막지 않고 재시도만 권한다.
          tone은 default(파괴적 동작이 아니다)이고, 권장 버튼이 '다시
          불러오기'가 되도록 확인 쪽에 재시도를 둔다. */}
      <ConfirmDialog
        open={showAssetError}
        icon="wifi_off"
        title={COPY.errors.scenarioAssetLoadTitle}
        message={COPY.errors.scenarioAssetLoadBody}
        cancelLabel={COPY.errors.scenarioAssetContinue}
        confirmLabel={COPY.errors.scenarioAssetRetry}
        onCancel={() => {
          assetErrorDismissed.current = true;
          setShowAssetError(false);
        }}
        onConfirm={() => {
          setShowAssetError(false);
          setAssetRetryCount((prev) => prev + 1);
        }}
      />

      {/* 이탈 확인 — 저장 전 진행은 되돌아오지 않으므로 되묻는다 */}
      <ConfirmDialog
        open={showExitConfirm}
        tone="destructive"
        icon="logout"
        title={COPY.player.exitConfirmTitle}
        message={COPY.player.exitConfirmBody}
        cancelLabel={COPY.player.exitConfirmCancel}
        confirmLabel={COPY.player.exitConfirmExit}
        onCancel={() => setShowExitConfirm(false)}
        onConfirm={() => {
          setShowExitConfirm(false);
          onExit(false);
        }}
      />
    </div>
  );
}
