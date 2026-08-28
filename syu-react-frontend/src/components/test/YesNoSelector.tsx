// src/components/test/YesNoSelector.tsx
// 좌우 배치형 예/아니요 선택 컴포넌트
//
// 색 규칙: **선택된 칸만 검사 액센트, 미선택은 중립**이다.
// 예전에는 예=primary(파랑) / 아니요=secondary(회청)로 답변별 색을 나눴는데,
// 두 가지 문제가 있었다. (1) 스트레스 검사는 12문항 전부 yes-no인데 상단
// 진행 바·배지는 앰버(tertiary)로 켜지고 선택지만 파랑으로 켜져 화면의 색 축이
// 갈라졌다. (2) 답변에 색을 배정하면 "예"가 긍정·권장처럼 읽혀 자가 보고를
// 편향시킨다. 지금은 두 칸이 같은 액센트를 쓰고, 예/아니요 구분은 아이콘
// (check / close)과 라벨이 맡는다.
//
// 그림자·글로우는 두지 않는다 (Serene Azure 원칙).

import { TEST_THEME, type TestType } from '../../constants/testTheme';

interface YesNoSelectorProps {
  options: string[]; // 기본적으로 ['예', '아니요'] 등 2개 옵션 기대
  /** 검사별 색 축. 원색 토큰(bg-primary 등)을 직접 쓰지 말 것 — constants/testTheme.ts 참고 */
  testType: TestType;
  selectedIndex?: number;
  onSelect: (index: number) => void;
}

export default function YesNoSelector({
  options,
  testType,
  selectedIndex,
  onSelect,
}: YesNoSelectorProps) {
  const theme = TEST_THEME[testType];

  return (
    <div className="w-full grid grid-cols-2 gap-4 py-6">
      {options.map((opt, idx) => {
        const isSelected = selectedIndex === idx;
        const isYes = idx === 0 || opt === '예';

        return (
          <button
            key={idx}
            type="button"
            onClick={() => onSelect(idx)}
            className={`
              relative p-6 rounded-pane flex flex-col items-center justify-center gap-3
              transition-all duration-300 focus:outline-none h-[150px]
              group overflow-hidden
              ${
                isSelected
                  ? `${theme.containerGlow} border-2 ${theme.accentBorder} text-on-surface scale-[1.02]`
                  : 'bg-surface-container border border-card-border text-on-surface hover:border-outline-variant hover:bg-surface-container-high'
              }
            `}
          >
            {/* 아이콘 — 확대(group-hover:scale-110)는 걷어냈다. 모션은 입장
                keyframe 하나로 모으고, hover는 색만 바꾼다. */}
            <div
              className={`
                w-14 h-14 rounded-full flex items-center justify-center transition-colors duration-200
                relative z-10
                ${
                  isSelected
                    ? `${theme.accentBg} ${theme.onAccentText}`
                    : 'bg-surface-container-high text-on-surface-variant group-hover:text-on-surface'
                }
              `}
            >
              <span className="material-symbols-outlined text-[32px]">
                {isYes ? 'check' : 'close'}
              </span>
            </div>

            {/* 옵션 텍스트 */}
            <span className="text-[18px] font-bold font-headline relative z-10">
              {opt}
            </span>

            {/* 우상단 선택 마크는 뺐다(2026-08-26 검수) — 색·테두리·아이콘 원이 이미 선택을
                말하고, 같은 뜻의 표시가 둘이면 시선이 갈린다. */}
          </button>
        );
      })}
    </div>
  );
}
