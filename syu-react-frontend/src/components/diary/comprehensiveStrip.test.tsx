// src/components/diary/comprehensiveStrip.test.tsx
// @vitest-environment jsdom
//
// 2026-08-27 UAT R2-17 — 회복일기 목록에서 종합 인사이트가 서는 **자리와
// 형태**를 고정한다.
//
// 고정하는 것은 픽셀이 아니라 규칙 세 줄이다:
//   완료 0개 → 맨 아래, 큰 잠금 카드 (예전 그대로)
//   완료 1~3개 → 맨 위, 얇은 진행 스트립 + 세그먼트 게이지
//   완료 4개(전부) → 맨 위, 해금 카드
// 자리 판정은 클래스가 아니라 DOM 순서(compareDocumentPosition)로 한다 —
// 스타일이 바뀌어도 "위/아래"라는 결론은 그대로 검증돼야 하기 때문이다.
//
// ⚠️ 마스킹 규칙은 여기서도 유효하다: 잠긴 동안 실명("종합 인사이트")이
// 새면 안 된다. 스트립은 aria-label로만 진행을 말한다.

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
import { themeColorsFor } from '../../constants/themeColors';

const THEME_DEFS: Array<[string, string]> = [
  ['workplace', '직장'],
  ['job-prep', '취업준비'],
  ['relationship', '연인'],
  ['daily', '일상'],
];

function makeTheme(id: string, title: string, count = 10): ThemeCategory {
  return {
    id,
    title,
    description: `${title} 설명`,
    icon: 'work',
    episodes: Array.from({ length: count }, (_, i) => ({
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

/** 앞의 n개 영역을 완주 처리하고, 그 외 한 편만 진행한 상태를 만든다. */
function progressWithCompleted(completedCount: number): Record<string, EpisodeProgress> {
  const progress: Record<string, EpisodeProgress> = {};
  THEMES.forEach((theme, idx) => {
    if (idx < completedCount) {
      theme.episodes.forEach((ep) => {
        progress[ep.id] = cleared();
      });
    }
  });
  // 완료 0개 케이스도 잠금 화면(기록 0건)으로 새지 않아야 하므로 한 편은 남긴다.
  if (completedCount === 0) progress['workplace-ep1'] = cleared();
  return progress;
}

const noop = () => {};

function renderList(completedCount: number) {
  const progress = progressWithCompleted(completedCount);
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

/** 목록의 첫 영역 카드 — 종합 인사이트의 위/아래를 재는 기준선. */
function firstAreaCard(): HTMLElement {
  const el = screen.getByText('직장').closest('button');
  if (!el) throw new Error('영역 카드를 찾지 못했다');
  return el;
}

function isBefore(a: Element, b: Element): boolean {
  // eslint-disable-next-line no-bitwise
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

beforeEach(() => {
  useCharacterStore.setState({ character: null });
});
afterEach(cleanup);

describe('R2-17 — 종합 인사이트의 자리와 형태', () => {
  it('완료 0개: 큰 잠금 카드가 영역 카드 **뒤**에 온다 (기존 동작)', () => {
    renderList(0);

    const masked = screen.getByText('●● ●●●●').closest('button')!;
    expect(isBefore(firstAreaCard(), masked)).toBe(true);

    // 스트립 신호가 없어야 한다 — 세그먼트 게이지도, 진행 aria-label도.
    expect(document.querySelectorAll('[data-theme-id]')).toHaveLength(0);
    expect(screen.queryByLabelText(/개 완료$/)).not.toBeInTheDocument();
    // 마스킹은 어느 형태에서도 유지된다
    expect(screen.queryByText('종합 인사이트')).not.toBeInTheDocument();
  });

  it('완료 1개: 얇은 스트립이 영역 카드 **앞**에 오고, 세그먼트가 1칸 채워진다', () => {
    renderList(1);

    const strip = screen.getByLabelText('잠긴 콘텐츠 · 4개 영역 중 1개 완료');
    expect(isBefore(strip, firstAreaCard())).toBe(true);

    // 세그먼트는 영역 수만큼. 채워진 칸은 그 영역의 고유색(R2-10b).
    const segments = Array.from(strip.querySelectorAll('[data-theme-id]'));
    expect(segments).toHaveLength(THEMES.length);
    expect(segments.map((s) => s.getAttribute('data-theme-id'))).toEqual(
      THEMES.map((t) => t.id),
    );
    const filled = segments.filter((s) => !s.className.includes('bg-diary-outline-variant'));
    expect(filled).toHaveLength(1);
    expect(filled[0].getAttribute('data-theme-id')).toBe('workplace');
    expect(filled[0].className).toContain(themeColorsFor('workplace').accentFill);

    // 안내 문구는 copy.tsx의 같은 문장을 재사용한다
    expect(screen.getByText('4개 영역을 모두 완료하면 열려요 (1/4)')).toBeInTheDocument();
    // 잠긴 동안 실명은 여전히 새지 않는다
    expect(screen.queryByText('종합 인사이트')).not.toBeInTheDocument();
    expect(screen.getByText('●● ●●●●')).toBeInTheDocument();
  });

  it('완료 4개: 해금 카드가 맨 위에 온다', () => {
    renderList(4);

    const unlocked = screen.getByText('종합 인사이트').closest('button')!;
    expect(isBefore(unlocked, firstAreaCard())).toBe(true);

    // 해금되면 마스킹도 잠금 스트립도 남지 않는다
    expect(screen.queryByText('●● ●●●●')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-theme-id]')).toHaveLength(0);
  });
});
