// src/components/diary/DiaryAlbumGauge.tsx
// 회복 앨범 진행 게이지 (시안 03·12 상단 카드, 완성 상태는 04).
//
// ⚠️ 분모는 **영역 수**다. 시안은 같은 화면에서 "회복 앨범 1/5"(종합
// 인사이트를 분모에 포함)와 "4/4"를 섞어 쓰는데, 종합 인사이트는 영역이
// 아니라 4영역 완주의 보상이므로 분모에 넣으면 100%에 영원히 닿지 못한다.
// 영역 기준 n/4로 통일하고 종합 인사이트는 별도 카드로 뺐다 (교정 3번).

import type { AlbumProgress } from '../../utils/strategyStats';

interface DiaryAlbumGaugeProps {
  album: AlbumProgress;
  /** 게이지 아래 안내 문장 */
  message: string;
}

export default function DiaryAlbumGauge({ album, message }: DiaryAlbumGaugeProps) {
  const { completedThemes, totalThemes, percent, isAllComplete } = album;

  // 여백을 한 단계 줄여 잡았다 — 이 카드는 회복일기 홈의 상단 고정 블록
  // 안에 들어가므로, 여기서 커지는 만큼 아래 영역 카드 목록이 좁아진다.
  return (
    <section className="diary-card p-3.5 space-y-2">
      <div className="flex justify-between items-center gap-2">
        <h2 className="text-[13px] font-bold text-diary-primary font-headline">
          회복 앨범 {completedThemes}/{totalThemes}
          {isAllComplete && ' · 완성'}
        </h2>
        <span className="text-[13px] font-bold text-diary-on-surface-variant font-body">
          {percent}%
        </span>
      </div>

      <div className="diary-gauge-track h-3">
        <div className="diary-gauge-fill bg-diary-primary" style={{ width: `${percent}%` }} />
      </div>

      <p className="text-[12px] leading-[20px] text-diary-on-surface-variant font-body">
        {message}
      </p>
    </section>
  );
}
