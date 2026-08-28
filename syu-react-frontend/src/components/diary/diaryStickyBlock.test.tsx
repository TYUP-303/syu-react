// src/components/diary/diaryStickyBlock.test.tsx
// @vitest-environment jsdom
//
// 2026-08-27 UAT R3-09 — 회복일기 홈 상단 고정 블록에 **무엇이 남고 무엇이
// 빠지는가**를 고정한다.
//
// 고정할 것은 화면의 정체성을 말하는 셋뿐이다: 타이틀 · 회복 앨범 게이지.
// "이번 훈련 기록 보기"는 한 번 누르면 끝나는 **이동 버튼**이라 스크롤 내내
// 붙어 있을 이유가 없는데도 고정 블록 안에 있어서, 카드를 훑는 동안 계속
// 화면을 차지했다(사용자 지적). 고정 블록 밖으로 내보내 함께 흐르게 한다.
//
// 자리 판정은 클래스가 아니라 **조상 관계와 DOM 순서**로 한다 — sticky 구현이
// 바뀌어도 "고정되지 않는다 / 게이지와 카드 사이에 있다"는 결론은 그대로
// 검증돼야 하기 때문이다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../../api/firebase', () => ({ db: {} }));

import type { EpisodeData, ThemeCategory } from '../../api/scenarioMockData';
import type { EpisodeProgress } from '../../store/useScenarioStore';
import { useCharacterStore } from '../../store/useCharacterStore';
import { useScenarioStore } from '../../store/useScenarioStore';
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

function cleared(updatedAt: string): EpisodeProgress {
  return {
    cleared: true,
    selectedAngel: 'accept',
    wasHelpful: true,
    selectedReason: '상황을 객관적으로 볼 수 있었어요',
    updatedAt,
  };
}

/** 직장 3/10 — 최근 기록이 있어야 "이번 훈련 기록 보기"가 렌더된다. */
function startedProgress(): Record<string, EpisodeProgress> {
  const progress: Record<string, EpisodeProgress> = {};
  THEMES[0].episodes.slice(0, 3).forEach((ep, i) => {
    progress[ep.id] = cleared(`2026-08-0${i + 1}T00:00:00.000Z`);
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

/** 상단 고정 블록 — sticky 컨테이너. */
function stickyBlock(container: HTMLElement): HTMLElement {
  const el = container.querySelector('.sticky');
  if (!el) throw new Error('상단 고정 블록을 찾지 못했다');
  return el as HTMLElement;
}

function recentButton(): HTMLElement {
  const el = screen.getByText('이번 훈련 기록 보기').closest('button');
  if (!el) throw new Error('"이번 훈련 기록 보기" 버튼을 찾지 못했다');
  return el;
}

beforeEach(() => {
  useCharacterStore.setState({ character: null });
});
afterEach(cleanup);

describe('R3-09 — "이번 훈련 기록 보기"는 고정되지 않는다', () => {
  it('버튼이 상단 고정 블록의 자손이 아니다', () => {
    const { container } = renderList();
    const sticky = stickyBlock(container);

    expect(sticky.contains(recentButton())).toBe(false);
    expect(recentButton().closest('.sticky')).toBeNull();
  });

  it('앨범 게이지는 고정 블록에 그대로 남는다', () => {
    const { container } = renderList();
    const gauge = container.querySelector('.diary-gauge-track');

    expect(gauge).not.toBeNull();
    expect(stickyBlock(container).contains(gauge!)).toBe(true);
  });

  it('버튼은 고정 블록 뒤 · 영역 카드 앞에 온다', () => {
    const { container } = renderList();
    const button = recentButton();
    const firstCard = screen.getByText('직장').closest('button');

    expect(firstCard).not.toBeNull();
    // DOCUMENT_POSITION_FOLLOWING = 4 — 인자가 기준보다 뒤에 있다는 뜻.
    expect(stickyBlock(container).compareDocumentPosition(button) & 4).toBeTruthy();
    expect(button.compareDocumentPosition(firstCard!) & 4).toBeTruthy();
  });
});
