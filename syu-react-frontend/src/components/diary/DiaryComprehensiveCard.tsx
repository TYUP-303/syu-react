// src/components/diary/DiaryComprehensiveCard.tsx
// 종합 인사이트 카드 — 잠김(마스킹) / 해금 두 상태 (시안 03·12 → 04).
//
// ⚠️ 잠금 상태에서는 콘텐츠 실명("종합 인사이트")을 노출하지 않는다.
// 목록 카드가 이름을 가려 두는데 어딘가에서 흘리면 마스킹이 무의미해진다
// (7차 자문회의 지적, 2026-07-10). 이 규칙은 모달 문구에도 적용된다 —
// COPY.diary.comprehensiveLockedTitle이 '잠긴 콘텐츠'인 이유다.
//
// 앨범 게이지 분모에서 빠진 대신 여기 별도 카드로 선다 (교정 3번).
//
// ── 2026-08-27 UAT R2-17: 잠금 상태가 둘로 갈린다 ──
// 예전에는 잠겨 있는 동안 목록 맨 아래에 큰 잠금 카드 하나로만 서 있었다.
// 한 영역이라도 완료한 사용자에게는 그게 두 번 손해였다: 자기가 쌓은
// 진행이 목록 끝까지 스크롤해야 보였고, 보이는 것은 진행이 아니라
// "잠김"이라는 사실뿐이었다. 그래서 완료 1개 이상이면 **맨 위의 얇은
// 진행 스트립**으로 바꾼다 — 세그먼트 게이지가 n/4를 즉시 말해 준다.
// 완료 0개는 보여 줄 진행이 없으므로 기존 카드 그대로 맨 아래에 둔다.
//
// 위치(맨 위/맨 아래)는 이 컴포넌트가 아니라 DiaryListView가 정한다.
// 여기서는 형태만 고른다.

import { COPY } from '../../constants/copy';
import { themeColorsFor } from '../../constants/themeColors';

/** 세그먼트 게이지 한 칸 — 영역 하나의 완주 여부. */
export interface ComprehensiveSegment {
  themeId: string;
  isComplete: boolean;
}

interface DiaryComprehensiveCardProps {
  isUnlocked: boolean;
  /** 완료한 영역 수 / 전체 영역 수 — 잠김 상태의 진행 표시 */
  completedThemes: number;
  totalThemes: number;
  /**
   * 영역별 완주 여부. 스트립의 세그먼트 게이지가 이 순서대로 칸을 그린다.
   * 생략하면 게이지 없이 문구만 남는다(호출부가 아직 안 넘기는 경우 방어).
   */
  segments?: ComprehensiveSegment[];
  onClick: () => void;
}

export default function DiaryComprehensiveCard({
  isUnlocked,
  completedThemes,
  totalThemes,
  segments,
  onClick,
}: DiaryComprehensiveCardProps) {
  if (!isUnlocked) {
    // ── 완료 1개 이상 — 얇은 진행 스트립 ──
    if (completedThemes > 0) {
      return (
        <button
          type="button"
          onClick={onClick}
          // 마스킹된 제목은 스크린리더에게 아무 말도 못 한다(●는 읽히지 않는다).
          // 실명을 흘리지 않으면서 "무엇이고 얼마나 왔는가"를 말해 주는 자리다.
          aria-label={`${COPY.diary.comprehensiveLockedTitle} · ${totalThemes}개 영역 중 ${completedThemes}개 완료`}
          className="w-full text-left px-3.5 py-2 rounded-control border border-dashed border-diary-outline-variant
            bg-diary-surface-dim/40 flex flex-col gap-0.5 transition-all active:scale-[0.99]
            hover:border-diary-primary/40"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-diary-outline-variant shrink-0">
              lock
            </span>
            {/* 실명 노출 금지 — 큰 카드와 같은 마스킹 문자를 쓴다 */}
            <h3 className="flex-1 min-w-0 text-[13px] font-bold text-diary-on-surface-variant font-headline truncate">
              ●● ●●●●
            </h3>
            {/* 세그먼트 게이지 — 칸 수는 영역 수를 따른다.
                채워진 칸은 그 영역의 고유색(R2-10b)이라, 어느 영역을 마쳤는지가
                색만으로 읽힌다. 빈 칸은 중립. data-theme-id는 테스트·검수용
                식별자다. */}
            <span aria-hidden className="flex items-center gap-1 shrink-0">
              {(segments ?? []).map((seg) => (
                <span
                  key={seg.themeId}
                  data-theme-id={seg.themeId}
                  className={`h-1.5 w-5 rounded-full ${
                    seg.isComplete
                      ? themeColorsFor(seg.themeId).accentFill
                      : 'bg-diary-outline-variant/60'
                  }`}
                />
              ))}
            </span>
          </div>
          <p className="text-[11px] leading-[15px] text-diary-on-surface-variant font-body">
            {COPY.diary.comprehensiveLockedHint(completedThemes, totalThemes)}
          </p>
        </button>
      );
    }

    // ── 완료 0개 — 기존 잠금 카드(변경 없음) ──
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left p-4 rounded-pane border border-dashed border-diary-outline-variant
          bg-diary-surface-dim/40 flex items-center gap-3.5 transition-all active:scale-[0.99]"
      >
        <div className="w-12 h-12 rounded-control bg-diary-surface-variant/60 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[24px] text-diary-outline-variant">
            lock
          </span>
        </div>
        <div className="flex-1 min-w-0">
          {/* 실명 노출 금지 — 마스킹 유지.
              마스킹 문자는 물음표가 아니라 ●다. '??'는 인코딩이 깨진 것으로
              오인되고(검수 지적), 글자 수도 실명 "종합 인사이트"(2+4자)와
              맞지 않아 마스킹으로도 읽히지 않았다.
              색은 outline이 아니라 on-surface-variant를 쓴다. 잠긴 카드
              배경(surface-container-highest 40%) 위에서 outline은 3.95:1로
              WCAG AA(4.5:1) 미달이었다 — 11px 안내문이라 특히 읽기 힘들다.
              "잠김" 신호는 파선 보더·자물쇠 아이콘·마스킹이 이미 준다. */}
          <h3 className="text-[15px] font-bold text-diary-on-surface-variant font-headline">●● ●●●●</h3>
          <p className="text-[11px] text-diary-on-surface-variant font-body mt-0.5">
            {COPY.diary.comprehensiveLockedHint(completedThemes, totalThemes)}
          </p>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left p-4 rounded-pane bg-diary-primary text-diary-on-primary
        flex items-center gap-3.5 transition-all active:scale-[0.99]"
    >
      <div className="w-12 h-12 rounded-control bg-diary-on-primary/20 flex items-center justify-center shrink-0">
        <span
          className="material-symbols-outlined text-[26px]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          auto_awesome
        </span>
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-bold font-headline">종합 인사이트</h3>
          {/* 앱 안에서 영문 용어를 노출하지 않는 것이 확정 표기다 (교정 5번).
              tracking-wider는 영문 대문자용 자간이라 함께 걷어낸다. */}
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-diary-on-primary/20">
            해금
          </span>
        </div>
        <p className="text-[11px] font-body opacity-90">
          모든 영역의 기록을 모은 나의 정서 조절 패턴
        </p>
      </div>
      <span className="material-symbols-outlined text-[20px] shrink-0">arrow_forward</span>
    </button>
  );
}
