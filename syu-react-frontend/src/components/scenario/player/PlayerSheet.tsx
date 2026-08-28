// src/components/scenario/player/PlayerSheet.tsx
// 모든 단계가 공유하는 하단 시트 프레임.
//
// ── 왜 하나의 프레임인가 (제안서 §1 P3) ──────────────────────────────
//
// 예전에는 6종 패널(대사·요정 선택·상세·적용·평가·완료)이 각자 다른 마크업과
// 높이를 갖고 step마다 통째로 갈아끼워졌다. 단계가 바뀔 때마다 화면이 덜컹였고,
// 같은 요소(요정·대사·버튼)의 시각 언어가 단계마다 달라졌다. 이제 표면·라운드·
// 패딩·등장 모션·화자 이름표는 이 파일 하나가 정하고, 단계는 **내용만** 바꾼다.
//
// ── 높이 규칙 ────────────────────────────────────────────────────────
//
// 시트는 내용 높이만큼 자란다. 상한(max-h)은 호출부가 프레임 기준 %로 건다 —
// 여기서 vh를 쓰면 프레임(max-w 430px · h-[100dvh]) 밖 화면 크기를 따라가
// STAGE_SIZING과 같은 어긋남이 다시 생긴다.
//
// 내용이 상한을 넘으면 시트 **안에서** 스크롤한다. 무대와 상단 바는 스크롤러
// 밖에 있으므로 오버스크롤 바운스에 딸려 움직이지 않는다(루트 CLAUDE.md의
// PageLayout 규칙과 같은 구조).
//
// ── 화자 이름표 ──────────────────────────────────────────────────────
//
// 시트 위쪽에 살짝 걸치는 탭 모양 라벨이다. 카드 안이 아니라 **밖**에 두는
// 이유는 카드가 overflow를 자르기 때문이고, 겹침은 음수 마진으로 만든다.
// 이름표가 없으면(상황 프로즈) 내레이션이라는 뜻이다 — 빈 라벨을 그리지 않는다.
//
// ⚠️ 이름표의 표면은 **불투명**이어야 한다 (2026-08-18 검수). 예전에는 카드와
// 똑같이 `surface-container-low/90 + backdrop-blur`였는데, -mb-2로 겹친 8px
// 구간에서 반투명 표면이 두 겹으로 합성되고 blur까지 두 번 걸려 그 자리에만
// 진한 띠가 생겼다 (카드의 상단 테두리 1px이 그 띠를 가로지르며 더 도드라졌다).
// 알파를 걷어내면 겹침 구간이 이름표 하나의 색으로 균일해지고, 카드의 상단
// 테두리도 탭 아래로 자연스럽게 끊긴다 — 폴더 탭의 통상적인 연결 모양이다.
// 불투명한 만큼 blur는 뒤를 비추지 않으므로 함께 뺀다.

import type { ReactNode } from 'react';

interface PlayerSheetProps {
  /** 화자 이름. 없으면 내레이션이라 이름표를 그리지 않는다. */
  speaker?: string;
  /** 화자 이름 색 토큰 (STRATEGY_META.text 등). 미지정 시 본문색. */
  speakerToneClass?: string;
  /** 하단 진행 힌트 — 읽기 단계에서만 준다. */
  hint?: string;
  /** 힌트 옆 material symbol 이름. */
  hintIcon?: string;
  /** 탭으로 진행하는 단계인가 — 커서 모양만 바꾼다(핸들러는 루트가 갖는다). */
  tappable?: boolean;
  reducedMotion?: boolean;
  children: ReactNode;
}

export default function PlayerSheet({
  speaker,
  speakerToneClass = 'text-on-surface',
  hint,
  hintIcon,
  tappable = false,
  reducedMotion = false,
  children,
}: PlayerSheetProps) {
  return (
    <div className={`w-full flex flex-col min-h-0 ${reducedMotion ? '' : 'animate-slideUp'}`}>
      {speaker && (
        <span
          className={`
            relative z-10 self-start -mb-2 ml-3 px-3 pt-1.5 pb-3 rounded-t-pane
            bg-surface-container-low border border-b-0 border-outline-variant/30
            text-[13px] font-bold ${speakerToneClass}
          `}
        >
          {speaker}
        </span>
      )}

      {/* 상단만 형태 문법(--radius-pane 14px)에서 벗어난 rounded-t-2xl(16px)을
          유지한다. 이 모서리는 카드의 모서리가 아니라 **시트가 무대 위로 올라오는
          입구**라서, 다른 면과 같은 값으로 맞추면 얹혀 있다는 인상이 사라진다.
          바닥과 화자 이름표는 문법대로 pane을 쓴다. */}
      <div
        className={`
          w-full min-h-0 flex flex-col rounded-t-2xl rounded-b-pane px-5 pt-4 pb-3.5
          bg-surface-container-low/90 backdrop-blur-md border border-outline-variant/30
          ${tappable ? 'cursor-pointer' : ''}
        `}
      >
        <div className="min-h-0 overflow-y-auto overscroll-y-none">{children}</div>

        {hint && (
          <div className="shrink-0 flex justify-end items-center text-[10px] text-outline gap-1.5 mt-2">
            <span>{hint}</span>
            {hintIcon && (
              <span className="material-symbols-outlined text-[12px] animate-pulse">{hintIcon}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
