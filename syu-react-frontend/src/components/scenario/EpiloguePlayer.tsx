// src/components/scenario/EpiloguePlayer.tsx
// 에필로그 플레이어 — 읽기만 하는 짧은 판(영역당 4~8씬).
//
// ── VisualNovelPlayer와 무엇이 다른가 ────────────────────────────────
//
// 무대(PlayerStage)·시트(PlayerSheet)·상단 바(PlayerTopBar)·서술 본문
// (DialogueContent)을 **그대로 빌려 쓴다**. 배경 위 스크림, 배역이 서는
// 지면선, 마주봄 반전, 시트가 인물 하반신을 가리는 장르 관습까지 저쪽에서
// 이미 정해진 것을 여기서 다시 정하지 않는다.
//
// 빠지는 것은 결정 단계 전부다 — 요정도 전략도 평가도 없다. 그래서 상태
// 기계가 useEpisodePlayer만큼 클 이유가 없고(단계가 둘뿐이다), 그 훅을
// 끌어다 쓰면 쓰지 않는 여섯 단계와 저장 계약이 함께 딸려 온다. 여기서는
// 씬 인덱스 하나와 완료 여부만 든다.
//
//   z-0   PlayerStage   배경 · 스크림 · 배역
//   z-20  PlayerSheet   서술 본문 또는 완료 시트
//   z-30  PlayerTopBar  씬 세그먼트 · Epilogue · ✕
//
// ── 진행 문법 ────────────────────────────────────────────────────────
//
// 읽는 화면이므로 **화면 아무 데나 탭**하면 넘어간다(타이핑 중이면 스킵).
// 되돌리기 존은 두지 않았다 — 몇 씬뿐이고 다시 보기가 언제든 가능해서, 저쪽
// 플레이어의 좌측 30% 존이 여기서는 "닫으려다 잘못 눌리는 자리"에 가깝다.
//
// ⚠️ 탭 핸들러는 이 루트에만 있다. 시트나 무대에 따로 달면 버블링으로 두 번
// 진행된다. 반대로 상단 바의 ✕는 stopPropagation이 필요하다.
//
// ── 끝 ───────────────────────────────────────────────────────────────
//
// 마지막 씬을 넘기면 **화면은 그대로 두고** onComplete만 올린다(2026-08-27
// UAT R2-28). 예전에는 여기서 "에필로그를 봤어요 … 목록으로 돌아가기" 시트를
// 띄웠는데, 다 읽은 자리에서 필요한 말은 "여기까지"가 아니라 다음에 무엇이
// 열렸는가였다. 그 안내(회복일기 모달)는 진행도를 아는 시나리오 탭이 이 화면
// 위(z-50)에 얹는다 — 마지막 장면이 배경으로 남은 채 다음 매듭이 뜬다.
//
// 그래서 완료는 상태를 **잠그기만** 한다: 더 넘어가지 않고, 힌트도 감추고,
// 저장은 한 번만 나간다. 시트는 언마운트하지 않는다(아래 key 주석 참조).
//
// ── 이탈 ─────────────────────────────────────────────────────────────
//
// ✕는 되묻지 않고 곧바로 닫는다. 에피소드 플레이어가 되묻는 이유는 마지막
// 평가를 마쳐야 저장이 나가서 중간 이탈이 진행을 통째로 날리기 때문인데,
// 에필로그는 잃을 진행이 없다(다시 열면 처음부터 읽으면 그만이다).
// 다 읽기 전에 ✕로 나가면 완료가 아니므로 onComplete도 나가지 않는다.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SceneData } from '../../api/scenarioMockData';
import type { EpilogueEpisode } from '../../utils/scenarioEpilogueCsvParser';
import {
  collectEpilogueImageUrls,
  preloadImages,
  type CharacterGender,
} from './player/assetUrls';
import { usePersonalizedText } from './usePersonalizedText';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { useScenarioStore } from '../../store/useScenarioStore';
import { COPY } from '../../constants/copy';
import ConfirmDialog from '../ui/ConfirmDialog';
import ProgressBar from '../ui/ProgressBar';
import PlayerStage from './player/PlayerStage';
import PlayerTopBar from './player/PlayerTopBar';
import PlayerSheet from './player/PlayerSheet';
import DialogueContent from './player/DialogueContent';

/** 시트 상한 — VisualNovelPlayer와 같은 값이다(프레임 기준 %). */
const SHEET_MAX_HEIGHT = 'max-h-[58%]';

/**
 * 에필로그의 씬을 무대가 아는 모양(SceneData)으로 옮긴다.
 *
 * type을 빈 문자열로 두는 것은 의도다 — CSV의 SCENE_TYPE("공통 시나리오 -
 * Scene 1")은 콘텐츠 작성용 구분자일 뿐이라 화면에 노출하지 않기로 했고
 * (2026-08-11 UAT), 에필로그 CSV에는 그 열 자체가 없다.
 */
function toSceneData(scene: EpilogueEpisode['scenes'][number]): SceneData {
  return { type: '', text: scene.text, bg: scene.bg, chars: [...scene.chars] };
}

interface EpiloguePlayerProps {
  uid: string;
  /** 열람 기록의 저장 키 (users/{uid}.epilogues의 키와 같다). */
  themeId: string;
  epilogue: EpilogueEpisode;
  characterGender: CharacterGender;
  onExit: () => void;
  /**
   * 마지막 씬까지 다 읽었다. 화면을 닫는 것은 **호출부의 몫**이다 — 이 훅은
   * "끝났다"만 알리고, 다음에 무엇을 여는지(회복일기 안내·유형 보고서)는
   * 진행도를 아는 시나리오 탭이 정한다.
   *
   * 다시 볼 때도 매번 나간다. 저장(markEpilogueSeen)만 한 번뿐이다.
   */
  onComplete?: () => void;
}

export default function EpiloguePlayer({
  uid,
  themeId,
  epilogue,
  characterGender,
  onExit,
  onComplete,
}: EpiloguePlayerProps) {
  const personalize = usePersonalizedText();
  const reducedMotion = usePrefersReducedMotion();
  const markEpilogueSeen = useScenarioStore((state) => state.markEpilogueSeen);

  const [sceneIndex, setSceneIndex] = useState(0);
  const [isDone, setIsDone] = useState(false);
  // 타이핑이 끝났는가 / 이번 씬을 스킵으로 띄웠는가. 저쪽 플레이어의
  // isTextComplete·isTextSkipped와 같은 역할이며, 한 탭이 "스킵"인지
  // "다음 씬"인지를 이 둘이 가른다.
  const [isTextComplete, setIsTextComplete] = useState(false);
  const [isTextSkipped, setIsTextSkipped] = useState(false);

  const scene = epilogue.scenes[sceneIndex];
  const isLastScene = sceneIndex >= epilogue.scenes.length - 1;

  // ── 저장 ──
  //
  // 마지막 씬을 다 읽는 순간 한 번만 나간다. 화면 흐름은 결과를 기다리지
  // 않는다 — 저장이 실패해도 잃는 것은 '봤어요' 배지 하나이고, 그것 때문에
  // 다 읽은 사용자를 붙잡아 둘 이유가 없다(스토어도 false만 돌려준다).
  const hasSavedRef = useRef(false);
  const finish = useCallback(() => {
    setIsDone(true);
    // 안내를 올리는 것은 저장 성공 여부와 무관하다 — '봤어요' 배지 하나 때문에
    // 다음 매듭을 막지 않는다(위 저장 주석과 같은 판단).
    onComplete?.();
    if (hasSavedRef.current) return;
    hasSavedRef.current = true;
    void markEpilogueSeen(uid, themeId);
  }, [markEpilogueSeen, uid, themeId, onComplete]);

  // ── 에셋 프리로드 게이트 ──
  //
  // 에피소드 플레이어와 같은 구조다: **다 받아야** 열리고, 멈춘 요청은
  // preloadImages 안의 장당 타임아웃이 실패로 집계해 아래 안내로 합류시킨다.
  // 요정 3종을 받지 않으므로 한 편의 프리로드 용량은 저쪽보다 작다.
  const [assetsReady, setAssetsReady] = useState(false);
  const [showAssetError, setShowAssetError] = useState(false);
  const [assetProgress, setAssetProgress] = useState({ settled: 0, total: 0 });
  const [assetRetryCount, setAssetRetryCount] = useState(0);
  const assetErrorDismissed = useRef(false);

  useEffect(() => {
    let alive = true;
    setAssetsReady(false);
    setShowAssetError(false);
    setAssetProgress({ settled: 0, total: 0 });
    assetErrorDismissed.current = false;
    preloadImages(collectEpilogueImageUrls(epilogue, characterGender), {
      onProgress: (settled, total) => {
        if (alive) setAssetProgress({ settled, total });
      },
    }).then((result) => {
      if (!alive) return;
      setAssetsReady(true);
      if (result.failed.length > 0) {
        console.warn('Epilogue assets failed to load:', result.failed);
        setShowAssetError(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [epilogue, characterGender, assetRetryCount]);

  const handleAssetError = useCallback(() => {
    if (assetErrorDismissed.current) return;
    setShowAssetError(true);
  }, []);

  // ── 진행 ──
  const canAdvance = !isDone && assetsReady && !showAssetError;

  const handleStageTap = () => {
    if (!canAdvance) return;
    // 타이핑 중이면 먼저 전문을 띄운다. "읽는 중 한 번, 넘길 때 한 번"이
    // 이 장르의 관습이고 저쪽 플레이어도 같다.
    if (!isTextComplete) {
      setIsTextSkipped(true);
      return;
    }
    if (isLastScene) {
      finish();
      return;
    }
    setSceneIndex((prev) => prev + 1);
    setIsTextComplete(false);
    setIsTextSkipped(false);
  };

  // 오른쪽 방향키도 같은 진행이다(데스크톱 조작). 왼쪽은 되돌리기 존을 두지
  // 않았으므로 받지 않는다. 핸들러를 ref에 담아 리스너는 한 번만 건다 —
  // 렌더마다 다시 걸면 어느 상태를 빠뜨렸을 때 조용히 낡은 값을 붙잡는다.
  const advanceRef = useRef(handleStageTap);
  advanceRef.current = handleStageTap;
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowRight') return;
      event.preventDefault();
      advanceRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      className="absolute inset-0 z-40 bg-surface flex flex-col font-body animate-fadeIn overflow-hidden"
      onClick={handleStageTap}
    >
      {/* 무대는 통째로 재사용한다. 요정 관련 프롭은 "아무도 없다"로 넘기며,
          step이 SITUATION이라 요정 층과 동행 층은 애초에 렌더되지 않는다. */}
      <PlayerStage
        step="SITUATION"
        scene={toSceneData(scene)}
        characterGender={characterGender}
        // 의상(직장·취업준비는 정장, 연인은 데이트 차림)과 연인 영역의 상대역
        // 치환이 이 값 하나로 정해진다 — CSV의 DOMAIN을 그대로 넘긴다.
        domain={epilogue.domain}
        // ⚠️ 예전 이름은 activeAngelKey였다. 5059b56(fix/player-meeting9)이
        // pressedAngelKey로 갈랐는데 이 호출부는 feat/epilogue 쪽에 있어서
        // 두 브랜치가 텍스트로는 깨끗이 머지되고 **타입 체크에서만** 깨졌다.
        pressedAngelKey={null}
        selectedAngelKey={null}
        readAngels={EMPTY_READ_ANGELS}
        onAngelSelect={noop}
        onAssetError={handleAssetError}
        castHidden={!assetsReady}
      />

      <PlayerTopBar
        label={COPY.epilogue.topBarLabel}
        title={personalize(epilogue.title)}
        sceneTotal={epilogue.scenes.length}
        sceneCurrent={sceneIndex}
        scenesDone={isDone}
        onExit={onExit}
      />

      {/* 에셋 로딩 표시 — 에피소드 플레이어와 같은 그림·같은 문구다. */}
      {!assetsReady && (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-0 z-20 flex items-center justify-center"
        >
          <div className="rounded-pane px-7 py-6 bg-surface-container-low/90 backdrop-blur-md border border-outline-variant/30 flex flex-col items-center gap-3">
            <div className="w-9 h-9 rounded-full border-2 border-primary-container border-t-transparent animate-spin" />
            <p className="text-[13px] text-outline font-body">{COPY.player.preparing}</p>
            {assetProgress.total > 0 && (
              <div className="w-40 flex flex-col items-center gap-1.5">
                <div className="w-full rounded-full overflow-hidden">
                  <ProgressBar
                    percent={(assetProgress.settled / assetProgress.total) * 100}
                    ariaLabel={COPY.player.preparing}
                  />
                </div>
                <p className="text-[11px] text-outline-variant font-body tabular-nums">
                  {COPY.player.preparingProgress(assetProgress.settled, assetProgress.total)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 무대가 보이는 여백. pointer-events-none은 장식이 아니다 —
          이 칸이 무대와 같은 z-index인데 DOM에서 뒤에 와서, 그대로 두면
          히트 테스트가 여기서 멈춘다(VisualNovelPlayer의 같은 자리 주석 참조). */}
      <div className="relative z-0 flex-1 min-h-0 pointer-events-none" />

      <div
        className={`relative z-20 shrink-0 flex flex-col px-4 pb-5 ${SHEET_MAX_HEIGHT} ${
          assetsReady ? '' : 'hidden'
        }`}
      >
        <PlayerSheet
          // 씬이 바뀔 때만 등장 모션을 다시 재생한다.
          //
          // ⚠️ 완료를 key에 섞지 말 것. 예전에는 `isDone ? 'done' : …`이었는데,
          // 그때는 완료가 **다른 내용**(완료 시트)으로 갈아 끼우는 순간이라
          // 다시 마운트되는 것이 맞았다. 지금은 같은 마지막 씬이 그대로 남으므로
          // key가 바뀌면 시트가 재마운트되고 TypingText가 다 읽은 문장을
          // 처음부터 되감는다 — 그 위에 모달이 뜨는 동안 배경에서.
          key={`scene-${sceneIndex}`}
          tappable={!isDone}
          reducedMotion={reducedMotion}
          hint={
            isDone ? undefined : isTextComplete ? COPY.player.tapNext : COPY.player.tapSkip
          }
          hintIcon={isDone ? undefined : isTextComplete ? 'play_arrow' : 'double_arrow'}
        >
          <DialogueContent
            scene={toSceneData(scene)}
            // 마지막 씬은 극 밖 화자의 마무리다(CSV의 KIND). 시트가 서식을
            // 가르고 무대는 손대지 않는다 — 무대에 무엇이 서는지는 언제나
            // CSV의 CHAR 열이 정한다.
            //
            // 2026-08-27(R2-27)에 그 열이 채워졌다. 그전까지 마무리 장면은
            // 인물이 비어 배경만 남았는데, 앞 씬까지 서 있던 주인공이 마지막
            // 한 장에서만 사라져 "갑자기 없어져 허전하다"는 지적을 받았다.
            // 지금은 네 영역 모두 환호하는 주인공(baeksul_*_cheer)이 선다.
            kind={scene.kind}
            // 모션을 줄이는 환경에서는 타이핑 연출 없이 전문을 바로 띄운다.
            isTextSkipped={isTextSkipped || reducedMotion}
            onTextComplete={() => setIsTextComplete(true)}
          />
        </PlayerSheet>
      </div>

      {/* 이미지 로드 실패 안내 — 진행은 막지 않고 재시도만 권한다.
          에피소드 플레이어와 같은 문구를 쓴다(같은 사고, 같은 안내). */}
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
    </div>
  );
}

/**
 * 무대에 넘기는 "요정 없음" 상수. 렌더마다 새 Set·새 함수를 만들면 무대가
 * 매번 다른 참조를 받는다 — 지금은 무해하지만, 무대가 메모이제이션을 붙이는
 * 날 조용히 헛돌기 시작한다.
 */
const EMPTY_READ_ANGELS: ReadonlySet<string> = new Set<string>();
const noop = () => {};
