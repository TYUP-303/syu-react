// src/components/test/StressUndeterminedCard.tsx
// 스트레스 검사 '판별 불가' 안내 뷰 (2026-08-06 확정).
//
// 전부 '예' 또는 전부 '아니요'는 무성의 일괄 응답으로 보고 검사 미완료로
// 처리한다 — 결과가 저장되지 않았으므로 점수·유형 카드를 그리지 않고,
// 안내문과 재검사만 제시한다. 홈으로 보내는 경로를 여기서 강조하면
// 검사 미완료 상태가 그대로 굳어지므로 재검사가 주 동선이다.
//
// ⚠️ 안내문 원문(STRESS_RESULT_TYPE_DESCRIPTION.undetermined)은 팀 검수 대기 초안.

import EmphasizedText from '../ui/EmphasizedText';
import { COPY } from '../../constants/copy';
import {
  STRESS_RESULT_TYPE_DESCRIPTION,
  STRESS_RESULT_TYPE_EMPHASIS,
} from '../../constants/reactionType';

export default function StressUndeterminedCard() {
  return (
    <div className="w-full bento-card p-5 flex flex-col gap-3 bg-surface-container/50">
      <span className="text-[11px] px-3 py-1 rounded-full bg-surface-container-highest text-on-surface-variant font-bold self-start">
        {COPY.test.resultUndeterminedBadge}
      </span>
      <h3 className="text-[18px] font-bold text-on-surface font-headline">
        {COPY.test.resultUndeterminedHeadline}
      </h3>
      <p className="text-[13px] leading-[22px] text-on-surface-variant font-body">
        <EmphasizedText
          text={STRESS_RESULT_TYPE_DESCRIPTION.undetermined}
          phrases={STRESS_RESULT_TYPE_EMPHASIS.undetermined}
        />
      </p>
    </div>
  );
}
