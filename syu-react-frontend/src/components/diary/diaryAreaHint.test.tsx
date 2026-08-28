// src/components/diary/diaryAreaHint.test.tsx
// @vitest-environment jsdom
//
// 2026-08-27 UAT R3-10 — 영역 카드의 ADHD 경향 한 줄이 **어디서 끊기는가**를
// 고정한다.
//
// 카드 폭(모바일 430px 프레임 안)에서 이 문장은 자동 줄바꿈으로 두 줄이
// 되는데, 끊기는 자리가 의미 단위와 어긋나 읽기 나빴다(사용자 지적).
// 그래서 문장 자체에 `\n`을 넣어 **끊을 자리를 원고가 정하고**, 카드는
// whitespace-pre-line으로 그 줄바꿈을 그대로 그린다.
//
// 여기서 검증하는 것은 두 가지다: (1) JSON 원고가 개행을 들고 있는가,
// (2) 카드가 그 개행을 접지 않고 렌더하는가. 둘 중 하나만 있으면 화면은
// 예전과 똑같아지므로 붙여서 고정한다.
// (종합 영역은 카드가 아니라 인사이트 슬롯이라 한 줄 그대로 둔다.)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../../api/firebase', () => ({ db: {} }));

import type { EpisodeData, ThemeCategory } from '../../api/scenarioMockData';
import type { EpisodeProgress } from '../../store/useScenarioStore';
import { useCharacterStore } from '../../store/useCharacterStore';
import { useScenarioStore } from '../../store/useScenarioStore';
import { getDiaryByThemeId } from '../../api/diaryContent';
import DiaryListView from '../home/DiaryListView';

const THEME_DEFS: Array<[string, string]> = [
  ['workplace', '직장'],
  ['job-prep', '취업준비'],
  ['relationship', '연인'],
  ['daily', '일상'],
];

function makeTheme(id: string, title: string): ThemeCategory {
  return {
    id,
    title,
    description: `${title} 설명`,
    icon: 'work',
    episodes: Array.from({ length: 10 }, (_, i) => ({
      id: `${id}-ep${i + 1}`,
      episodeNumber: i + 1,
    })) as EpisodeData[],
  };
}

const THEMES = THEME_DEFS.map(([id, title]) => makeTheme(id, title));

function cleared(): EpisodeProgress {
  return {
    cleared: true,
    selectedAngel: 'accept',
    wasHelpful: true,
    selectedReason: '상황을 객관적으로 볼 수 있었어요',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

/** 직장 3/10 — 카드가 렌더될 만큼만 진행시킨다. */
function startedProgress(): Record<string, EpisodeProgress> {
  const progress: Record<string, EpisodeProgress> = {};
  THEMES[0].episodes.slice(0, 3).forEach((ep) => {
    progress[ep.id] = cleared();
  });
  return progress;
}

const noop = () => {};

function renderList() {
  const progress = startedProgress();
  useScenarioStore.setState({ themes: THEMES, progress });
  return render(
    <DiaryListView
      themes={THEMES}
      progress={progress}
      onSelectDiary={noop}
      onGoRecentSession={noop}
      onGoScenario={noop}
    />,
  );
}

/** 영역 카드 안에서 areaHint를 그리는 <p>. */
function hintParagraph(title: string): HTMLElement {
  const card = screen.getByText(title).closest('button');
  if (!card) throw new Error(`${title} 카드를 찾지 못했다`);
  const hint = getDiaryByThemeId(
    THEME_DEFS.find(([, t]) => t === title)![0],
  )?.areaHint;
  const el = Array.from(card.querySelectorAll('p')).find(
    (p) => p.textContent === hint,
  );
  if (!el) throw new Error(`${title} 카드의 areaHint 문단을 찾지 못했다`);
  return el as HTMLElement;
}

beforeEach(() => {
  useCharacterStore.setState({ character: null });
});
afterEach(cleanup);

describe('R3-10 — 영역 카드 한 줄 설명의 줄바꿈', () => {
  it('네 영역의 원고가 지정된 자리에서 두 줄로 끊긴다', () => {
    expect(getDiaryByThemeId('workplace')?.areaHint).toBe(
      '해야 할 일이 한꺼번에 몰릴 때\n주의가 흩어지기 쉬운 영역이에요.',
    );
    expect(getDiaryByThemeId('job-prep')?.areaHint).toBe(
      '결과를 기다리는 시간이 길수록\n집중을 붙잡기 어려운 영역이에요.',
    );
    expect(getDiaryByThemeId('relationship')?.areaHint).toBe(
      '감정이 앞설 때 말이 먼저 나가기\n쉬운 영역이에요.',
    );
    expect(getDiaryByThemeId('daily')?.areaHint).toBe(
      '작은 일이 미뤄지며 하루의 리듬이\n흐트러지기 쉬운 영역이에요.',
    );
  });

  it('종합은 카드가 아니라 한 줄 그대로다', () => {
    expect(getDiaryByThemeId('comprehensive')?.areaHint).not.toContain('\n');
  });

  it('카드가 그 개행을 접지 않고 그린다 (whitespace-pre-line)', () => {
    renderList();
    THEME_DEFS.forEach(([, title]) => {
      const p = hintParagraph(title);
      expect(p.className).toContain('whitespace-pre-line');
      expect(p.textContent).toContain('\n');
    });
  });
});
