// src/components/test/MultipleChoiceSelector.tsx
// 세로 배치형 N지선다 선택 컴포넌트
//
// 강조색은 검사 종류를 따른다(TEST_THEME) — 상단 진행 바·배지와 색 축이
// 갈라지지 않게 한다.

import { TEST_THEME, type TestType } from '../../constants/testTheme';

interface MultipleChoiceSelectorProps {
  options: string[];
  /** 검사별 색 축. 원색 토큰(bg-primary 등)을 직접 쓰지 말 것 — constants/testTheme.ts 참고 */
  testType: TestType;
  selectedIndex?: number;
  onSelect: (index: number) => void;
}

// 선택 강조는 테두리를 굵히는 대신 inset ring을 얹는다 — border 두께를 바꾸면
// 항목 높이가 2px 늘어나 아래 항목들이 한 칸씩 밀린다(ScaleSelector와 같은 규칙).
export default function MultipleChoiceSelector({
  options,
  testType,
  selectedIndex,
  onSelect,
}: MultipleChoiceSelectorProps) {
  const theme = TEST_THEME[testType];

  return (
    <div className="w-full flex flex-col gap-3 py-4">
      {options.map((opt, idx) => {
        const isSelected = selectedIndex === idx;

        return (
          <button
            key={idx}
            type="button"
            onClick={() => onSelect(idx)}
            className={`
              w-full p-5 rounded-pane flex items-center justify-between
              transition-all duration-200 text-left font-body
              group focus:outline-none
              border
              ${
                isSelected
                  ? `${theme.containerGlow} ${theme.accentBorder} ring-1 ring-inset ${theme.accentRing} text-on-surface font-bold translate-x-1`
                  : 'bg-surface-container border-card-border text-on-surface hover:border-outline-variant hover:bg-surface-container-high'
              }
            `}
          >
            <div className="flex items-center gap-4">
              {/* 알파벳 또는 숫자 인덱스 칩 */}
              <div
                className={`
                  w-8 h-8 rounded-control flex items-center justify-center text-[13px] font-bold font-headline
                  transition-colors duration-200
                  ${
                    isSelected
                      ? `${theme.accentBg} ${theme.onAccentText}`
                      : 'bg-surface-container-high text-on-surface-variant group-hover:text-on-surface'
                  }
                `}
              >
                {String.fromCharCode(65 + idx)} {/* A, B, C... */}
              </div>

              <span className="text-[15px] leading-relaxed">{opt}</span>
            </div>

            {/* 라디오 체크박스 마크 */}
            <div
              className={`
                w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all
                ${
                  isSelected
                    ? `${theme.accentBorder} ${theme.accentBg} ${theme.onAccentText}`
                    : 'border-outline-variant bg-transparent group-hover:border-outline'
                }
              `}
            >
              {isSelected && (
                <span className="material-symbols-outlined text-[16px]">check</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
