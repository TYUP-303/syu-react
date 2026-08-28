// src/components/scenario/player/EvaluateContent.tsx
// EVALUATE_HELPFUL(도움 여부) + EVALUATE_REASON(핵심 요인) 단계의 시트 내용.
//
// 읽기 단계와 달리 여기서는 화면 탭으로 진행되지 않는다 — "읽기는 탭, 결정은
// 버튼"이 이 플레이어의 진행 문법이다(제안서 §2-B). 루트가 SITUATION에서만
// 탭 진행을 켜므로 이 컴포넌트는 버튼만 그린다.
//
// 질문 머리글은 예전에 배경 이미지 위 카드로 따로 떠 있었다. 시트가 이미
// 표면과 대비를 갖고 있으므로 카드를 한 겹 더 얹지 않는다.

import { useMemo } from 'react';
import type { EpisodeData } from '../../../api/scenarioMockData';
import { COPY } from '../../../constants/copy';
import { reasonsForStrategy } from '../../../constants/reasonPalette';
import type { StrategyKey } from '../../../constants/strategy';
import { usePersonalizedText } from '../usePersonalizedText';
import SheetBackButton from './SheetBackButton';

interface EvaluateContentProps {
  mode: 'helpful' | 'reason';
  episode: EpisodeData;
  /**
   * 이 회차에서 고른 전략. 선택지를 그 전략에 맞게 거르는 데만 쓴다
   * (2026-08-27 2차 UAT R2-22 — 근거는 constants/reasonPalette).
   * null이면 거르지 않는다.
   */
  strategyKey: StrategyKey | null;
  wasHelpful: boolean | null;
  isSubmitting: boolean;
  submitError: string | null;
  onHelpfulSelect: (val: boolean) => void;
  /** 핵심 요인 → 도움 평가로 한 걸음 되돌리기 (2026-08-18 회의). */
  onBack: () => void;
  /**
   * 도움 평가 → 전략 적용으로 한 걸음 더 (2026-08-27 R2-05). 이 계단이 이어져야
   * 저장 이전 단계가 전부 되돌려진다 — 여기까지는 아무것도 쓰지 않았다.
   */
  onBackToApply: () => void;
  onReasonSelect: (reason: string) => void;
}

// 전폭 선택지 행은 형태 문법상 컨트롤이 아니라 **면**이다(index.css의 pane 정의).
// 버튼처럼 눌리지만 화면에서 차지하는 것은 목록 행의 자리이고, 검사 화면의
// 선택지 행들과 같은 모양으로 서야 한 서비스로 읽힌다.
const optionButtonClass = `
  w-full py-3 px-4 text-center bg-surface-container-lowest border border-outline-variant/60 shadow-sm
  text-on-surface text-[13px] rounded-pane cursor-pointer hover:bg-surface-container-high transition-all
`;

/**
 * 되돌리기의 **자리** — 자기 한 줄, 왼쪽 정렬 (2026-08-27 3차 UAT R3-03).
 *
 * 예전에는 `absolute left-0 top-0`으로 머리글 위에 겹쳐 세웠다. 시트가 한 행
 * 만큼 덜 자라는 대신, 375px에서 가운데 정렬된 "실제로 이 마음 대처법이
 * 나에게"의 첫 글자와 버튼이 부딪혀 문장이 읽히지 않았다.
 *
 * 이제 요정 브라우즈·전략 적용 단계와 **같은 구조**다 — 되돌리기가 첫 행,
 * 머리글은 그 아래 줄부터. R2-05가 세운 "단계마다 같은 자리"는 겹침이 아니라
 * 이 구조로 지킨다. 아래 간격을 줄여(-mb-1) 한 행이 붙는 만큼의 높이를 덜어
 * 내는 것도 그 두 단계와 같다. 모양은 SheetBackButton이 갖는다.
 */
const backButtonClass = 'self-start -mb-1';

export default function EvaluateContent({
  mode,
  episode,
  strategyKey,
  wasHelpful,
  isSubmitting,
  submitError,
  onHelpfulSelect,
  onBack,
  onBackToApply,
  onReasonSelect,
}: EvaluateContentProps) {
  // 선택지도 에피소드별 CSV(HELPFUL_n · UNHELPFUL_n)에서 오므로 '백설'이 섞일 수 있다.
  // ⚠️ 치환은 **표시에만** 건다 — onReasonSelect로 넘기는 값과 React key는 원문
  // 그대로여야 한다. 저장되는 문구의 빈도를 세는 곳(utils/strategyStats의
  // topReasons)이 있어서, 닉네임이 섞인 문자열이 저장되면 같은 선택지가
  // 사용자마다 다른 항목으로 집계된다.
  const personalize = usePersonalizedText();

  // 고른 전략과 맞지 않는 선택지를 걸러 내고, 빈 자리는 전역 팔레트의 같은
  // 종류(도움/비도움)에서 그 전략에 맞는 문구로 메운다 (2026-08-27 R2-22).
  // 규칙과 근거는 constants/reasonPalette에 있고 여기서는 부르기만 한다.
  //
  // 훅은 조건 위에 설 수 없으므로 mode 분기보다 **먼저** 계산한다 —
  // 'helpful' 모드에서는 이 값을 쓰지 않는다.
  const reasons = useMemo(() => {
    if (wasHelpful === null) return [];
    const kind = wasHelpful ? 'helpful' : 'unhelpful';
    return reasonsForStrategy(episode.reasons[kind], kind, strategyKey);
  }, [episode.reasons, wasHelpful, strategyKey]);

  if (mode === 'helpful') {
    return (
      <div className="w-full flex flex-col gap-3">
        {/* 핵심 요인 화면의 되돌리기와 **같은 자리**다 — 두 평가 화면이
            나란히 이어지므로 자리가 어긋나면 버튼이 옮겨 다니는 것처럼
            보인다. 저장 중에는 잠그지 않는다(이 단계에서는 저장이 돌지
            않는다). 훅도 같은 조건을 다시 막는다. */}
        <SheetBackButton
          label={COPY.player.backToApply}
          ariaLabel={COPY.player.backToApplyAria}
          onClick={onBackToApply}
          className={backButtonClass}
        />
        <div className="text-center">
          <p className="text-[13px] text-outline">{COPY.player.evalIntro}</p>
          <h4 className="text-[16px] font-bold text-on-surface mt-0.5">
            {COPY.player.evalQuestion}
          </h4>
        </div>
        {/* 되돌아왔을 때 무엇을 골랐었는지가 보여야 다시 고를 수 있다.
            aria-pressed는 그 상태를 화면 낭독기에도 같은 뜻으로 전한다
            — 색과 테두리만으로는 눌림 상태가 전달되지 않는다. */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onHelpfulSelect(true)}
            aria-pressed={wasHelpful === true}
            className={`${optionButtonClass} font-bold ${
              wasHelpful === true ? 'border-primary bg-primary-fixed' : 'hover:border-primary'
            }`}
          >
            {COPY.player.evalYes}
          </button>
          <button
            onClick={() => onHelpfulSelect(false)}
            aria-pressed={wasHelpful === false}
            className={`${optionButtonClass} font-medium ${
              wasHelpful === false
                ? 'border-primary bg-primary-fixed text-on-surface'
                : 'text-on-surface-variant hover:border-outline'
            }`}
          >
            {COPY.player.evalNo}
          </button>
        </div>
      </div>
    );
  }

  if (wasHelpful === null) return null;

  return (
    <div className="w-full flex flex-col gap-3">
      {/* 되돌리기는 머리글 **위 줄**에 따로 선다(R3-03 — backButtonClass 주석).
          모양은 SheetBackButton이 갖는다: 2026-08-27(R2-05)에 되돌리기가 네
          자리로 늘면서 여기 있던 지역 스타일을 그 컴포넌트로 옮겼다.
          저장이 도는 동안에는 잠근다 — 이미 쓰고 있는 답과 화면이 어긋나기
          때문이며, 훅(handleEvaluateBack)도 같은 조건을 다시 막는다. */}
      <SheetBackButton
        label={COPY.player.evalBack}
        onClick={onBack}
        disabled={isSubmitting}
        className={backButtonClass}
      />
      <div className="text-center">
        <p className="text-[12px] text-outline">{COPY.player.reasonIntro}</p>
        <h4 className="text-[15px] font-bold text-on-surface mt-0.5">
          {COPY.player.reasonQuestion}
        </h4>
      </div>

      {/* 인라인 알림 박스는 형태 문법상 컨트롤(rounded-control)이다 */}
      {submitError && (
        <div className="w-full py-2.5 px-4 rounded-control bg-error-container/60 border border-error/30 text-[12px] text-on-error-container font-body text-center">
          {submitError}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {reasons.map((reason) => (
          <button
            key={reason}
            onClick={() => onReasonSelect(reason)}
            disabled={isSubmitting}
            className="
              w-full py-3 px-4 text-left bg-surface-container-lowest border border-outline-variant/60 shadow-sm
              hover:border-primary text-on-surface text-[13px] rounded-pane cursor-pointer
              hover:bg-surface-container-high transition-all flex items-center justify-between gap-2
            "
          >
            <span className="truncate">{personalize(reason)}</span>
            {isSubmitting && (
              <div className="w-3.5 h-3.5 rounded-full border border-primary-container border-t-transparent animate-spin shrink-0" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
