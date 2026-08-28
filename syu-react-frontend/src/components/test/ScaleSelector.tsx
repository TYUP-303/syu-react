// src/components/test/ScaleSelector.tsx
// 가로 배치형 척도 선택 컴포넌트 (매우 그렇지 않다 ~ 매우 그렇다 등)
//
// 강조색은 검사 종류를 따른다(TEST_THEME) — 상단 진행 바·배지와 색 축이
// 갈라지지 않게 한다. 선택 강조는 채움 + 링으로만 하고 그림자·글로우는
// 두지 않는다 (Serene Azure 원칙).
//
// ⚠️ 2026-08-27 UAT R1-08: 아래에 있던 세로 리스트(1~5 목록 버튼, 327×310)를
// 걷어냈다. 같은 선택지를 두 번 그리느라 375×667에서 세로 공간을 과하게
// 먹었고, 그 탓에 진행 버튼이 접혀 있었다. 선택 수단은 가로 원형 버튼
// 하나로 일원화한다.
//
// 리스트가 하던 접근성 역할(스크린 리더가 각 선택지의 **라벨 전문**을 읽는
// 것)은 원형 버튼의 aria-label이 그대로 이어받는다 — 원형 버튼은 화면에
// 숫자만 보여 주므로 aria-label이 없으면 "1,2,3,4,5"만 읽히게 된다.

import { TEST_THEME, type TestType } from '../../constants/testTheme';
import { spaceBeforeParen, splitLabelAtParen } from '../../utils/optionLabel';

/** 점수 바 양끝의 미니 라벨. 폭이 max-w-[70px]로 좁아 괄호가 아무 데서나
    꺾이므로, 괄호가 있으면 여는 괄호 앞에서 강제로 줄을 나눈다.
    ("매우 자주(거의 매일)" → "매우 자주" / "(거의 매일)") */
function EdgeLabel({ label }: { label: string }) {
  return (
    <span className="text-[12px] text-outline font-body max-w-[70px] leading-tight">
      {splitLabelAtParen(label).map((line, i) => (
        <span key={i} className="block">
          {line}
        </span>
      ))}
    </span>
  );
}

interface ScaleSelectorProps {
  options: string[];
  /** 검사별 색 축. 원색 토큰(bg-primary 등)을 직접 쓰지 말 것 — constants/testTheme.ts 참고 */
  testType: TestType;
  selectedIndex?: number;
  onSelect: (index: number) => void;
}

export default function ScaleSelector({
  options,
  testType,
  selectedIndex,
  onSelect,
}: ScaleSelectorProps) {
  const theme = TEST_THEME[testType];

  return (
    <div className="w-full flex flex-col gap-6 py-4">
      {/* 가로 슬라이더 및 스텝 칩 영역 */}
      <div className="relative flex items-center justify-between px-2">
        {/* 연결 배경 라인 */}
        <div className="absolute left-6 right-6 h-1 bg-surface-container-high -z-0 rounded-full" />
        
        {/* 선택된 위치까지 채워지는 프로그레스 라인 */}
        {selectedIndex !== undefined && (
          <div
            className={`absolute left-6 h-1 -z-0 rounded-full transition-all duration-300 ${theme.accentBg}`}
            style={{
              width: `${(selectedIndex / (options.length - 1)) * (100 - 16)}%`,
            }}
          />
        )}

        {options.map((opt, idx) => {
          const isSelected = selectedIndex === idx;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelect(idx)}
              // 화면에는 숫자만 보이지만 낭독은 라벨 전문까지 읽어야 한다
              // ("3 때때로 (한 달에 몇 번)"). 세로 리스트를 걷어낸 자리를
              // 메우는 것이 이 레이블이다 (2026-08-27 UAT R1-08).
              aria-label={`${idx + 1} ${spaceBeforeParen(opt)}`}
              aria-pressed={isSelected}
              className={`
                relative z-10 w-11 h-11 rounded-full flex items-center justify-center
                font-headline font-bold text-[15px] transition-all duration-200
                focus:outline-none focus:ring-2 ${theme.focusRing}
                ${
                  isSelected
                    ? `${theme.accentBg} ${theme.onAccentText} scale-110 ring-4 ${theme.containerRing}`
                    : 'bg-surface-container border border-outline-variant text-on-surface hover:border-outline'
                }
              `}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>

      {/* 옵션 텍스트 라벨 (선택된 항목 강조 및 전체 리스트)
          가운데 "선택됨 + 라벨" 블록은 선택 여부에 따라 나타났다 사라지므로,
          미선택 상태에서도 정확히 같은 높이를 예약해 둔다. 예약이 조금이라도
          모자라면 선택하는 순간 이 행이 커지면서 아래 리스트 전체가 그만큼
          내려간다(육안 검수 C4의 "살짝 흔들림" = 46px 예약 vs 48px 실측).

          예약 높이 70px의 내역:
            배지 22px  = 본문 16px(leading-[16px]) + py-0.5 4px + border 2px
            + gap-1     4px
            + 라벨 44px = leading-[22px] × 2줄
          min-h가 아니라 h로 고정한다 — 예약보다 커질 여지를 남기면 같은
          버그가 되돌아온다. 가운데 칸을 flex-1 min-w-0으로 둬야 line-clamp가
          계산할 기준 폭이 생긴다.

          ⚠️ 라벨을 truncate(1줄) → line-clamp-2(2줄)로 바꾸면서 예약도 48px
          에서 70px로 올렸다 (2026-08-27 UAT R1-08). 전에는 1줄로 잘려도
          아래 세로 리스트에 같은 문구가 전체로 보였는데, 그 리스트를 걷어낸
          지금은 여기가 선택한 답을 글자로 확인할 수 있는 유일한 자리다.
          375px 프레임의 가운데 칸 폭은 약 171px(327 − 양끝 라벨 140 − px-2
          16)이고, 가장 긴 선택지 "거의 없음 (한 달에 한 번 이하)"가 15px
          기준 약 244px이라 2줄이면 전부 담긴다.

          양끝 EdgeLabel은 괄호 라벨일 때 2줄(12px × leading-tight ≈ 30px)이
          되지만 예약 70px 안에 들어가므로 이 행의 높이를 밀지 않는다. */}
      <div className="flex justify-between items-start px-1 text-center h-[70px]">
        <EdgeLabel label={options[0]} />
        <div className="flex-1 min-w-0 flex flex-col items-center px-2">
          {selectedIndex !== undefined && (
            <div className="w-full flex flex-col items-center gap-1 animate-scaleIn">
              <span
                className={`text-[11px] leading-[16px] px-2.5 py-0.5 rounded-full font-bold border ${theme.containerBg} ${theme.onContainerText} ${theme.accentBorder}`}
              >
                선택됨
              </span>
              <span className="w-full line-clamp-2 text-[15px] leading-[22px] font-bold text-on-surface font-headline">
                {spaceBeforeParen(options[selectedIndex])}
              </span>
            </div>
          )}
        </div>
        <EdgeLabel label={options[options.length - 1]} />
      </div>
    </div>
  );
}
