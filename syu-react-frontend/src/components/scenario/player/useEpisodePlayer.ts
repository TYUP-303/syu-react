// src/components/scenario/player/useEpisodePlayer.ts
// 에피소드 플레이 상태 머신.
// 단계: SITUATION(상황 대사) → ANGELS(요정 선택) ⇄ ANGEL_DETAIL(조언 상세)
//       → APPLY_STRATEGY(전략 적용) → EVALUATE_HELPFUL ⇄ EVALUATE_REASON
//       → EPISODE_COMPLETE
// UI 컴포넌트는 이 훅이 주는 상태와 핸들러만 사용한다.
//
// ⚠️ ANGELS ⇄ ANGEL_DETAIL은 **화면 전환이 아니다**(2026-08-14 재설계). 두 단계는
// 같은 무대와 같은 시트 프레임을 쓰고 시트 내용만 달라지므로, 사용자 눈에는
// "조언이 펼쳐졌다"로 보인다. step을 없애 ANGELS의 내부 상태로 흡수할 수도
// 있었지만, 상태 머신을 건드리지 않는 편이 저장 계약(clearEpisode)과 이탈
// 게이트 판정을 그대로 두는 가장 싼 길이라 남겼다.

import { useEffect, useRef, useState } from 'react';
import type { EpisodeData } from '../../../api/scenarioMockData';
import { useScenarioStore } from '../../../store/useScenarioStore';
import type { StrategyKey } from '../../../constants/strategy';
import { COPY } from '../../../constants/copy';

export type PlayStep =
  | 'SITUATION'
  | 'ANGELS'
  | 'ANGEL_DETAIL'
  | 'APPLY_STRATEGY'
  | 'EVALUATE_HELPFUL'
  | 'EVALUATE_REASON'
  | 'EPISODE_COMPLETE';

// ── 전략 적용 이후 단계의 무대 (2026-08-11 UAT) ──
//
// situationIndex는 마지막 씬(3)에서 더 늘지 않는다. 그래서 요정 선택 이후
// **모든 단계**가 씬 4의 배경을 그대로 이어받고 있었다. 씬 4의 배경은
// CSV 120행 중 89행(74%)이 `my_room.png`라, 어느 시나리오를 골라도 전략
// 적용·평가·훈련 완료 화면이 똑같은 방으로 보였다 ("시나리오랑 상관없이
// 모두 이 기본 방 배경", "훈련 완료도 다 방이 일률적으로").
//
// 콘텐츠(CSV 120행)를 다시 쓰는 것은 별도 트랙이므로, 코드에서 이 단계의
// 무대를 **상황이 벌어진 장소(씬 1)**로 되돌린다 — 배운 대처법을 그 자리에서
// 다시 써 본다는 서사와도 맞고, 요정 선택(ANGELS)까지는 직전 씬의 배경을
// 그대로 이어받아 장면 전환도 튀지 않는다.
const STEPS_AFTER_STRATEGY: readonly PlayStep[] = [
  'APPLY_STRATEGY',
  'EVALUATE_HELPFUL',
  'EVALUATE_REASON',
  'EPISODE_COMPLETE',
];

export function useEpisodePlayer(uid: string, episode: EpisodeData) {
  const { clearEpisode } = useScenarioStore();

  const [step, setStep] = useState<PlayStep>('SITUATION');
  const [situationIndex, setSituationIndex] = useState(0);
  const [isTextSkipped, setIsTextSkipped] = useState(false);
  const [isTextComplete, setIsTextComplete] = useState(false);

  const [selectedAngelKey, setSelectedAngelKey] = useState<StrategyKey | null>(null);
  const [activeDetailAngelKey, setActiveDetailAngelKey] = useState<StrategyKey | null>(null);
  // 사용자가 **실제로 누른** 요정. activeDetailAngelKey와 갈라 두는 이유는
  // 요정 단계에 들어설 때 첫 조언이 자동으로 펼쳐지기 때문이다(아래 참조).
  // 무대의 강조(또렷함/흐림)가 activeDetailAngelKey를 그대로 따라가면, 아무것도
  // 고르지 않았는데 한 요정만 또렷해져 "선택하지 않았는데 선택된 것처럼 보인다"
  // (2026-08-11 UAT)로 되돌아간다. 시트는 펼쳐진 조언을, 무대는 누른 요정을 본다.
  const [pressedAngelKey, setPressedAngelKey] = useState<StrategyKey | null>(null);
  const [readAngels, setReadAngels] = useState<Set<string>>(new Set());

  const [wasHelpful, setWasHelpful] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 새로운 에피소드로 **바뀔 때** 상태 전면 초기화.
  //
  // ⚠️ 첫 마운트는 건너뛴다. 모든 상태가 이미 초기값이라 할 일이 없기도 하지만,
  // 무엇보다 이 effect가 **자식보다 늦게** 돈다는 점이 문제였다. React는 자식
  // effect를 먼저 실행하므로, 대사가 즉시 완결되는 경우(모션 축소 환경에서
  // TypingText가 첫 렌더에 onComplete를 부른다) 자식이 올려 둔
  // isTextComplete=true를 이 초기화가 곧바로 false로 되돌려, 첫 탭이 "스킵"으로
  // 소모되고 진행 힌트도 '건너뛰기'에 멈춰 있었다.
  const isFirstEpisodeRef = useRef(true);
  useEffect(() => {
    if (isFirstEpisodeRef.current) {
      isFirstEpisodeRef.current = false;
      return;
    }
    setStep('SITUATION');
    setSituationIndex(0);
    setIsTextSkipped(false);
    setIsTextComplete(false);
    setSelectedAngelKey(null);
    setActiveDetailAngelKey(null);
    setPressedAngelKey(null);
    setReadAngels(new Set());
    setWasHelpful(null);
    setSubmitError(null);
  }, [episode]);

  // 대사창 클릭: 타이핑 중이면 스킵, 완료면 다음 문장 또는 요정 등장
  const handleDialogClick = () => {
    if (step !== 'SITUATION') return;
    if (!isTextComplete) {
      setIsTextSkipped(true);
      return;
    }
    if (situationIndex < episode.scenario.scenes.length - 1) {
      setSituationIndex((prev) => prev + 1);
      setIsTextSkipped(false);
      setIsTextComplete(false);
    } else {
      // ⚠️ 요정을 **자동으로 펼치지 않는다** (2026-08-26 사양 정정).
      //
      // e99ab71은 회의의 "요정 선택 첫 스텝을 없애 달라"를 여기서
      // `setActiveDetailAngelKey(STRATEGY_KEYS[0])`으로 풀었다. 없애야 했던
      // 것은 **누르기 전에는 아무것도 없는 시트**였는데, 그 해법은 고르지도
      // 않은 조언을 미리 열어 두는 쪽이라 "무엇을 고르라는 화면인지"가
      // 오히려 흐려졌다. 지금은 시트가 처음부터 상세 레이아웃으로 서고
      // (AngelBrowseContent) 조언 자리에는 안내문이 들어간다 — 빈 단계는
      // 사라지되 첫 선택은 사용자의 것으로 남는다.
      setStep('ANGELS');
    }
  };

  // 직전 문장으로 되돌리기 (2026-08-14 플레이어 재설계).
  //
  // 화면 좌측 30% 탭과 ←키가 들어오는 자리이며, 엔딩 플레이어의 진행 문법을
  // 이식한 것이다. **SITUATION 안에서만** 동작한다 — 단계를 되돌리면 요정
  // 읽음 기록·전략 선택 같은 이미 확정된 결정을 무르게 되고, 그 되돌림이
  // 저장 계약(마지막 평가에서 일괄 저장)과 어긋난다. 여기서 움직이는 것은
  // situationIndex 하나뿐이라 안전하다.
  //
  // 되돌아간 문장은 이미 읽은 문장이므로 타이핑을 다시 재생하지 않는다.
  const handleSituationBack = () => {
    if (step !== 'SITUATION' || situationIndex === 0) return;
    setSituationIndex((prev) => prev - 1);
    setIsTextSkipped(true);
    setIsTextComplete(true);
  };

  // ── 저장 이전 단계는 모두 되돌릴 수 있다 (2026-08-27 2차 UAT R2-05) ──
  //
  // "전략 선택 단계로 들어가면 시나리오로 돌아갈 수가 없다"는 지적을 받았다.
  // 예전에는 되돌리기가 SITUATION 안(문장 단위)과 평가 한 걸음, 둘뿐이었다.
  //
  // 열어도 되는 이유는 **이 에피소드가 쓰기를 딱 한 번 하기 때문**이다 —
  // handleReasonSelect의 clearEpisode가 유일한 쓰기이고, 그 앞의 선택은 전부
  // 화면 상태다. 그래서 전략을 바꿔 다시 골라도 기록이 둘로 늘어나지 않는다
  // (마지막 selectedAngelKey 하나가 그대로 저장된다). 반대로 EPISODE_COMPLETE
  // 에서는 되돌리지 않는다 — 저장이 끝난 뒤라 DB와 화면이 갈린다.
  //
  // 돌아간 뒤 **읽음·선택 상태는 그대로 둔다.** 되돌리기의 목적은 고쳐 보는
  // 것이지 지우는 것이 아니고, 셋을 다시 읽게 만들면 되돌리기가 벌이 된다.

  // 요정 브라우즈 → 마지막 대사 장면. 앞으로 넘기면 자연히 다시 요정 단계다
  // (handleDialogClick이 마지막 씬에서 ANGELS로 보낸다).
  const handleAngelBackToScene = () => {
    if (step !== 'ANGELS' && step !== 'ANGEL_DETAIL') return;
    setStep('SITUATION');
    setSituationIndex(episode.scenario.scenes.length - 1);
    // 이미 읽은 문장이므로 타이핑을 다시 재생하지 않는다(handleSituationBack과 같다).
    setIsTextSkipped(true);
    setIsTextComplete(true);
  };

  // 전략 적용 → 요정 브라우즈. 펼쳐 두었던 조언이 있으면 그 상태로 되돌아간다.
  const handleApplyBack = () => {
    if (step !== 'APPLY_STRATEGY') return;
    setStep(activeDetailAngelKey ? 'ANGEL_DETAIL' : 'ANGELS');
  };

  // 도움 평가 → 전략 적용. 평가의 두 단계 사이(핵심 요인 → 도움 평가)는
  // handleEvaluateBack이 이미 맡고 있으므로, 여기서는 그 앞 계단만 잇는다.
  const handleHelpfulBack = () => {
    if (isSubmitting || step !== 'EVALUATE_HELPFUL') return;
    setStep('APPLY_STRATEGY');
  };

  // 요정 클릭 → 상세 보기 진입 (읽음 기록)
  const handleAngelClick = (key: StrategyKey) => {
    setActiveDetailAngelKey(key);
    setPressedAngelKey(key);
    setReadAngels((prev) => new Set(prev).add(key));
    setStep('ANGEL_DETAIL');
  };

  const handleCloseDetail = () => {
    setStep('ANGELS');
    setActiveDetailAngelKey(null);
    setPressedAngelKey(null);
  };

  // 요정 최종 선택 → 전략 적용 연출
  const handleSelectStrategy = (key: StrategyKey) => {
    setSelectedAngelKey(key);
    setStep('APPLY_STRATEGY');
    setIsTextSkipped(false);
    setIsTextComplete(false);
  };

  // 전략 적용 연출 확인 → 도움 평가로 진행
  const handleApplyNext = () => {
    setStep('EVALUATE_HELPFUL');
  };

  const handleHelpfulSelect = (val: boolean) => {
    setWasHelpful(val);
    setStep('EVALUATE_REASON');
  };

  // 핵심 요인 → 도움 평가로 한 걸음 되돌리기 (2026-08-18 회의).
  //
  // 도움 여부를 고르면 곧바로 다음 화면으로 넘어가고 되돌아올 경로가 없었다.
  // 잘못 누른 답이 그대로 저장되는 자리라 한 걸음만 열어 둔다.
  //
  // 되돌리기가 닿지 않는 곳이 둘이다.
  //   · 저장이 도는 동안(isSubmitting) — 이미 쓰고 있는 답과 화면이 어긋난다.
  //   · EVALUATE_REASON 밖 — 특히 EPISODE_COMPLETE는 저장이 끝난 뒤라
  //     되돌리면 DB의 결과와 화면이 갈린다(저장 계약).
  //
  // wasHelpful은 **지우지 않는다**. 되돌리기의 목적은 고쳐 쓰는 것이지 지우는
  // 것이 아니라, 무엇을 골랐었는지가 화면에 남아야 다시 고를 수 있다.
  // 반대로 submitError는 비운다 — 지나간 시도의 실패 안내가 다음 화면까지
  // 따라가면 방금 무언가 잘못된 것처럼 읽힌다.
  const handleEvaluateBack = () => {
    if (isSubmitting || step !== 'EVALUATE_REASON') return;
    setSubmitError(null);
    setStep('EVALUATE_HELPFUL');
  };

  // 세부 요인 선택 → Firestore/localStorage에 결과 저장
  const handleReasonSelect = async (reason: string) => {
    if (isSubmitting || selectedAngelKey === null || wasHelpful === null) return;
    setIsSubmitting(true);
    setSubmitError(null);

    const success = await clearEpisode(uid, episode.id, {
      selectedAngel: selectedAngelKey,
      wasHelpful,
      selectedReason: reason,
    });

    setIsSubmitting(false);
    if (success) {
      setStep('EPISODE_COMPLETE');
      return;
    }

    // 실패 사유는 스토어가 한국어 문구로 정리해 둔다 (오프라인 상한 초과 →
    // "네트워크 연결을 확인…"). 훅이 구독하는 값이 아니라 getState()로 읽는
    // 이유는, 위 await 이전에 잡힌 렌더의 값은 이 실패를 아직 모르기 때문이다.
    setSubmitError(useScenarioStore.getState().error ?? COPY.player.submitError);
  };

  const scenes = episode.scenario.scenes;
  const dialogueScene = scenes[situationIndex] || scenes[0];
  // 전략 적용 이후에는 씬 1(상황이 시작된 장소)로 무대를 되돌린다.
  const currentScene = STEPS_AFTER_STRATEGY.includes(step)
    ? scenes[0] || dialogueScene
    : dialogueScene;

  return {
    step,
    situationIndex,
    currentScene,
    isTextSkipped,
    isTextComplete,
    setIsTextComplete,
    selectedAngelKey,
    activeDetailAngelKey,
    pressedAngelKey,
    readAngels,
    wasHelpful,
    isSubmitting,
    submitError,
    handleDialogClick,
    handleSituationBack,
    handleAngelBackToScene,
    handleApplyBack,
    handleHelpfulBack,
    handleAngelClick,
    // 조언이 별도 화면이 아니게 되면서(2026-08-14) 이 핸들러를 부르는 UI는
    // 사라졌다. 훅의 계약을 좁히지 않으려고 남겨 둔다 — ANGEL_DETAIL을
    // ANGELS로 되돌리는 유일한 경로이고, 조언 시트를 접는 화면이 다시
    // 필요해지면 여기로 돌아온다.
    handleCloseDetail,
    handleSelectStrategy,
    handleApplyNext,
    handleHelpfulSelect,
    handleEvaluateBack,
    handleReasonSelect,
  };
}
