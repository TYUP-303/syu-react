// src/components/scenario/player/CompleteContent.tsx
// EPISODE_COMPLETE 단계의 시트 내용 — 완료 카드 + 다음 진행 선택.
//
// 2026-08-16까지는 [시트의 '훈련 종료하기' → 모달 → '그만하기'/'다음'] 두
// 걸음이었다. 모달은 "정말 끝낼 거냐"를 되묻는 물건인데 이 시점의 에피소드는
// 이미 저장까지 끝난 뒤라, 되물을 것이 없는 확인 한 겹만 남아 있었다. 선택지
// 둘을 시트에 바로 두어 한 걸음으로 줄인다.

import Button from '../../ui/Button';
import { COPY } from '../../../constants/copy';

interface CompleteContentProps {
  wasHelpful: boolean | null;
  /**
   * 이 영역의 마지막(10)회차인가. true면 이어서 진행할 에피소드가 없으므로
   * 선택지를 나누지 않고 마무리 버튼 하나만 둔다 — 그 버튼(onNext)이
   * ScenarioTab의 영역 마무리 분기(결과 보고서 · 회복일기 해금)로 이어진다.
   *
   * 완료 카드 문구까지 갈라 두는 이유(2026-08-11 UAT): 화면이 1~9회차와
   * 똑같으면 마지막 회차라는 걸 알 수 없다.
   */
  isLastEpisode: boolean;
  onExit: () => void;
  onNext: () => void;
}

export default function CompleteContent({
  wasHelpful,
  isLastEpisode,
  onExit,
  onNext,
}: CompleteContentProps) {
  return (
    <div className="w-full flex flex-col gap-3">
      <div className="text-center">
        {/* 마지막 회차에서는 "이 영역을 끝냈다"가 도움 여부보다 앞선다 */}
        <h4 className="text-[17px] font-bold text-primary">
          {isLastEpisode
            ? COPY.player.completeTitleLast
            : wasHelpful
              ? COPY.player.completeTitleHelpful
              : COPY.player.completeTitleNeutral}
        </h4>
        <p className="text-[13px] text-outline mt-1 leading-relaxed">
          {isLastEpisode
            ? COPY.player.completeBodyLast
            : wasHelpful
              ? COPY.player.completeBodyHelpful
              : COPY.player.completeBodyNeutral}
        </p>
      </div>

      {/* 라운드는 Button이 base에서 rounded-control로 정한다 — 여기서 덮어쓰지 않는다 */}
      {isLastEpisode ? (
        <Button variant="primary" onClick={onNext} className="w-full py-3 text-[15px]">
          {COPY.player.completeCtaLast}
        </Button>
      ) : (
        <div className="flex gap-3">
          <Button variant="outline" onClick={onExit} className="flex-1 py-3 font-semibold">
            {COPY.player.completeExit}
          </Button>
          <Button variant="primary" onClick={onNext} className="flex-1 py-3 font-semibold">
            {COPY.player.completeNext}
          </Button>
        </div>
      )}
    </div>
  );
}
