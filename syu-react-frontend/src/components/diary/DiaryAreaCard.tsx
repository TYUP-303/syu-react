// src/components/diary/DiaryAreaCard.tsx
// 회복일기 홈의 영역 카드 (시안 03·12).
//
// 상태 3종:
//   완료   → "10/10 · 기록 보기"  (전체 보고서 열림)
//   진행 중 → "3/10 · 이어하기"   + 진행률 바
//   미시작 → "시작 전"
//
// ⚠️ 2026-08-07 PM 확정 "진행 중 열람 완화": 진행 중 영역도 눌러서
// 지금까지의 누적 기록을 볼 수 있다. 잠긴 것은 완주 전 "유형 산출"이지
// 기록 열람이 아니다. 미시작 영역만 진입을 막는다 — 보여 줄 기록이
// 하나도 없으면 빈 화면이 되기 때문이다.
//
// 에피소드 분모는 실제 값(10)을 쓴다. 시안의 16/19·3/18 같은 더미
// 숫자를 옮기지 않는다 (교정 4번).
//
// ── 영역 고유색 (2026-08-27 UAT R2-10b) ──
// 시나리오 탭의 4영역 색(R2-10)이 여기에도 흐른다. 색을 입는 자리는 시나리오
// 카드와 같은 셋 — 아이콘 칸 틴트 · 아이콘 잉크 · 진행 막대 — 뿐이고, 카드
// 면·본문·상태 문구는 회복일기 팔레트 그대로다. 미시작 영역은 색을 주지
// 않는다: 흐린 중립(opacity-70)이 "아직 아무것도 없다"를 말하는 자리라,
// 거기까지 색을 칠하면 시작한 영역과 구분이 사라진다.

import type { ThemeProgressSummary } from '../../utils/strategyStats';
import { themeColorsFor } from '../../constants/themeColors';

interface DiaryAreaCardProps {
  summary: ThemeProgressSummary;
  /** ADHD 경향 한 줄 (여명이 제안) */
  areaHint?: string;
  onClick: () => void;
}

export default function DiaryAreaCard({ summary, areaHint, onClick }: DiaryAreaCardProps) {
  const { title, icon, cleared, total, percent, isComplete, isStarted } = summary;
  const colors = themeColorsFor(summary.themeId);

  const statusText = isComplete
    ? `${cleared}/${total} · 기록 보기`
    : isStarted
      ? `${cleared}/${total} · 이어하기`
      : '시작 전';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-4 rounded-pane border flex items-center gap-3.5 transition-all duration-300
        active:scale-[0.99]
        ${
          isComplete
            ? 'bg-diary-surface-card border-diary-primary/30 hover:border-diary-primary/60'
            : isStarted
              ? 'bg-diary-surface-container border-diary-outline-variant/50 hover:border-diary-primary/40'
              : 'bg-diary-surface-low border-diary-outline-variant/40 opacity-70'
        }`}
    >
      {/* 영역 픽토그램 */}
      <div
        className={`w-12 h-12 rounded-control flex items-center justify-center shrink-0
          ${
            isComplete || isStarted
              ? colors.container
              : 'bg-diary-surface-variant/60'
          }`}
      >
        <span
          className={`material-symbols-outlined text-[26px] ${
            isComplete || isStarted ? colors.accent : 'text-diary-on-surface-variant'
          }`}
          style={isComplete ? { fontVariationSettings: "'FILL' 1" } : undefined}
        >
          {icon}
        </span>
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[15px] font-bold text-diary-on-surface font-headline truncate">
            {title}
          </h3>
          {isComplete && (
            <span
              className="material-symbols-outlined text-[16px] text-diary-positive shrink-0"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              check_circle
            </span>
          )}
        </div>

        <p
          className={`text-[11px] font-bold font-body ${
            isComplete
              ? 'text-diary-positive'
              : isStarted
                ? 'text-diary-primary'
                : 'text-diary-outline'
          }`}
        >
          {statusText}
        </p>

        {/* 진행 중일 때만 진행률 바 */}
        {isStarted && !isComplete && (
          <div className="diary-gauge-track h-1.5 mt-1.5">
            <div
              className={`diary-gauge-fill ${colors.accentFill}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        )}

        {/* whitespace-pre-line: 원고(diary_contents.json)가 넣어 둔 줄바꿈을
            그대로 그린다. 카드 폭에 맡긴 자동 줄바꿈이 의미 단위와 어긋나
            읽기 나빴던 자리다 (2026-08-27 UAT R3-10). */}
        {areaHint && (
          <p className="text-[10px] leading-[16px] text-diary-outline font-body pt-0.5 whitespace-pre-line">
            {areaHint}
          </p>
        )}
      </div>

      <span
        className={`material-symbols-outlined text-[20px] shrink-0 ${
          isStarted ? 'text-diary-primary' : 'text-diary-outline-variant'
        }`}
      >
        {isStarted ? 'arrow_forward' : 'radio_button_unchecked'}
      </span>
    </button>
  );
}
