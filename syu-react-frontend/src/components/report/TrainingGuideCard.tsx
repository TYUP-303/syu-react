// src/components/report/TrainingGuideCard.tsx
// "REACT 훈련 가이드" (시안 09·11 Section 4).
//
// 세 전략을 요정 이미지와 함께 소개한다. 시안은 "수용(Accept) /
// 재평가(Reappraise) / 재집중(Refocus)"으로 영문을 병기했지만
// 전면 한글 + 요정명 우선으로 옮겼다 (교정 5번). 시안의 "재집중"도
// 확정 용어인 "재초점"으로 바로잡았다 (교정 1번과 같은 갈래).

import { STRATEGY_KEYS, STRATEGY_META } from '../../constants/strategy';
import ReportCard from './ReportCard';
import { versionedAsset } from '../../utils/assetVersion';

export default function TrainingGuideCard() {
  return (
    <ReportCard
      title="REACT 훈련 가이드"
      icon="school"
      description="여러 상황에서 세 요정의 전략을 직접 써 보며 나에게 맞는 방법을 찾아보세요."
    >
      <div className="grid grid-cols-3 gap-2 pt-1">
        {STRATEGY_KEYS.map((key) => {
          const meta = STRATEGY_META[key];
          return (
            <div key={key} className="flex flex-col items-center text-center gap-1.5">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center border ${meta.bg} ${meta.border}`}
              >
                <img src={versionedAsset(meta.image)} alt="" className="w-8 h-8 object-contain" />
              </div>
              <span className={`text-[12px] font-bold font-headline ${meta.text}`}>
                {meta.fairyName}
              </span>
              <span className="text-[10px] text-diary-on-surface-variant font-body">
                {meta.shortLabel}
              </span>
            </div>
          );
        })}
      </div>
    </ReportCard>
  );
}
