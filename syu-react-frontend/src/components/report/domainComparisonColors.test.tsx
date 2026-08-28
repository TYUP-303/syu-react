// src/components/report/domainComparisonColors.test.tsx
// @vitest-environment jsdom
//
// 2026-08-27 UAT R2-10b — 종합 인사이트의 「영역별 전략 선택 경향」 카드에서
// 영역 아이콘과 비중 막대가 **영역 고유색**(R2-10)을 입는지 고정한다.
// 막대는 예전에 '위주 전략'의 색(요정 3색)이었다 — 전략 이름은 옆 문구가 이미
// 말하므로, 막대는 "어느 영역의 줄인가"를 색으로 맡는다. 보고서의 나머지는
// 그대로 파랑(회복일기 팔레트)이다.

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import type { EpisodeData, ThemeCategory } from '../../api/scenarioMockData';
import type { EpisodeProgress } from '../../store/useScenarioStore';
import { themeColorsFor } from '../../constants/themeColors';
import DomainComparisonCard from './DomainComparisonCard';

function makeTheme(id: string, title: string, icon: string): ThemeCategory {
  return {
    id,
    title,
    description: `${title} 설명`,
    icon,
    episodes: Array.from({ length: 10 }, (_, i) => ({
      id: `${id}-ep${i + 1}`,
      episodeNumber: i + 1,
    })) as EpisodeData[],
  };
}

const THEMES = [
  makeTheme('workplace', '직장', 'work'),
  makeTheme('daily', '일상', 'home'),
];

function cleared(angel: EpisodeProgress['selectedAngel']): EpisodeProgress {
  return {
    cleared: true,
    selectedAngel: angel,
    wasHelpful: true,
    selectedReason: '상황을 객관적으로 볼 수 있었어요',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

/** 직장 5편(재평가 4·수용 1) · 일상 기록 없음. */
const PROGRESS: Record<string, EpisodeProgress> = {
  'workplace-ep1': cleared('reappraisal'),
  'workplace-ep2': cleared('reappraisal'),
  'workplace-ep3': cleared('reappraisal'),
  'workplace-ep4': cleared('reappraisal'),
  'workplace-ep5': cleared('accept'),
};

function row(title: string): HTMLElement {
  const el = screen.getByText(title).closest('div.space-y-1\\.5');
  if (!el) throw new Error(`${title} 줄을 찾지 못했다`);
  return el as HTMLElement;
}

afterEach(cleanup);

describe('R2-10b — 영역별 전략 선택 경향 카드의 영역 고유색', () => {
  it('영역 아이콘은 그 영역의 잉크색이다', () => {
    render(<DomainComparisonCard themes={THEMES} progress={PROGRESS} />);
    const icon = row('직장').querySelector('span.material-symbols-outlined') as HTMLElement;
    expect(icon.textContent?.trim()).toBe('work');
    expect(icon.className).toContain(themeColorsFor('workplace').accent);
    expect(icon.className).not.toContain('text-diary-primary');
  });

  it('비중 막대는 위주 전략의 색이 아니라 영역 색으로 채운다', () => {
    render(<DomainComparisonCard themes={THEMES} progress={PROGRESS} />);
    const fill = row('직장').querySelector('.diary-gauge-fill') as HTMLElement | null;
    expect(fill).not.toBeNull();
    expect(fill!.className).toContain(themeColorsFor('workplace').accentFill);
    // 재평가(포코) 위주라는 사실은 문구가 말한다 — 막대는 그 색을 빌리지 않는다
    expect(fill!.className).not.toContain('bg-primary');
    expect(screen.getByText(/위주 · 80%/)).toBeInTheDocument();
  });

  it('기록 없는 영역은 막대를 채우지 않는다 (줄만 남긴다)', () => {
    render(<DomainComparisonCard themes={THEMES} progress={PROGRESS} />);
    const daily = row('일상');
    expect(daily.querySelector('.diary-gauge-fill')).toBeNull();
    expect(screen.getByText('기록 없음')).toBeInTheDocument();
  });
});
