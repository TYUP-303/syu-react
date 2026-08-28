// src/components/diary/diaryAreaColors.test.tsx
// @vitest-environment jsdom
//
// 2026-08-27 UAT R2-10b — 시나리오 4영역의 고유색(R2-10)이 **회복일기 홈**에도
// 흐르는지 고정한다. 색을 입는 자리는 세 곳뿐이다:
//   영역 카드의 아이콘 칸(틴트 + 아이콘 잉크) · 진행 중 카드의 진행 막대 ·
//   종합 인사이트 스트립의 채워진 세그먼트.
// 카드 면·본문 글자·상태 문구는 그대로 회복일기 팔레트다 — 여기서는 "어디에
// 색이 들어가고 어디에는 안 들어가는가"를 클래스 이름으로 검증한다. 클래스
// 문자열은 constants/themeColors가 단일 출처이므로 그쪽 값을 그대로 읽어 온다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../../api/firebase', () => ({ db: {} }));

import type { EpisodeData, ThemeCategory } from '../../api/scenarioMockData';
import type { EpisodeProgress } from '../../store/useScenarioStore';
import { useCharacterStore } from '../../store/useCharacterStore';
import { useScenarioStore } from '../../store/useScenarioStore';
import { themeColorsFor } from '../../constants/themeColors';
import DiaryListView from '../home/DiaryListView';

const THEME_DEFS: Array<[string, string, string]> = [
  ['workplace', '직장', 'work'],
  ['job-prep', '취업준비', 'school'],
  ['relationship', '연인', 'favorite'],
  ['daily', '일상', 'home'],
];

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

const THEMES = THEME_DEFS.map(([id, title, icon]) => makeTheme(id, title, icon));

function cleared(): EpisodeProgress {
  return {
    cleared: true,
    selectedAngel: 'accept',
    wasHelpful: true,
    selectedReason: '상황을 객관적으로 볼 수 있었어요',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

/** 직장 완주(10/10) · 취업준비 진행 중(3/10) · 연인·일상 미시작. */
function mixedProgress(): Record<string, EpisodeProgress> {
  const progress: Record<string, EpisodeProgress> = {};
  THEMES[0].episodes.forEach((ep) => {
    progress[ep.id] = cleared();
  });
  THEMES[1].episodes.slice(0, 3).forEach((ep) => {
    progress[ep.id] = cleared();
  });
  return progress;
}

const noop = () => {};

function renderList() {
  const progress = mixedProgress();
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

/** 영역 카드 버튼 — 제목으로 찾는다. */
function areaCard(title: string): HTMLElement {
  const el = screen.getByText(title).closest('button');
  if (!el) throw new Error(`${title} 카드를 찾지 못했다`);
  return el;
}

/** 카드 안의 Material 아이콘 span 중 영역 픽토그램(첫 번째). */
function pictogram(card: HTMLElement, icon: string): HTMLElement {
  const span = Array.from(card.querySelectorAll('span.material-symbols-outlined')).find(
    (s) => s.textContent?.trim() === icon,
  );
  if (!span) throw new Error(`픽토그램 ${icon}을 찾지 못했다`);
  return span as HTMLElement;
}

beforeEach(() => {
  useCharacterStore.setState({ character: null });
});
afterEach(cleanup);

describe('R2-10b — 회복일기 홈의 영역 고유색', () => {
  it('완주한 영역 카드: 아이콘 칸은 영역 틴트, 아이콘은 영역 잉크를 입는다', () => {
    renderList();
    const colors = themeColorsFor('workplace');
    const icon = pictogram(areaCard('직장'), 'work');
    const box = icon.parentElement as HTMLElement;

    expect(box.className).toContain(colors.container);
    expect(icon.className).toContain(colors.accent);
  });

  it('진행 중인 영역 카드: 아이콘 칸·아이콘·진행 막대가 그 영역 색이다', () => {
    renderList();
    const colors = themeColorsFor('job-prep');
    const card = areaCard('취업준비');
    const icon = pictogram(card, 'school');

    expect((icon.parentElement as HTMLElement).className).toContain(colors.container);
    expect(icon.className).toContain(colors.accent);

    const fill = card.querySelector('.diary-gauge-fill') as HTMLElement | null;
    expect(fill).not.toBeNull();
    expect(fill!.className).toContain(colors.accentFill);
    // 예전 단색(회복일기 primary)은 더 이상 쓰지 않는다
    expect(fill!.className).not.toContain('bg-diary-primary-container');
  });

  it('미시작 영역 카드는 색을 입지 않는다 (흐린 중립 그대로)', () => {
    renderList();
    const colors = themeColorsFor('relationship');
    const icon = pictogram(areaCard('연인'), 'favorite');

    expect((icon.parentElement as HTMLElement).className).not.toContain(colors.container);
    expect(icon.className).not.toContain(colors.accent);
  });

  it('종합 인사이트 스트립: 채워진 세그먼트만 그 영역 색, 빈 칸은 중립', () => {
    renderList();
    const strip = screen.getByLabelText('잠긴 콘텐츠 · 4개 영역 중 1개 완료');
    const seg = (id: string) => strip.querySelector(`[data-theme-id="${id}"]`) as HTMLElement;

    expect(seg('workplace').className).toContain(themeColorsFor('workplace').accentFill);
    expect(seg('workplace').className).not.toContain('bg-diary-primary');
    // 취업준비는 3/10이라 아직 빈 칸 — 영역 색이 아니라 중립
    expect(seg('job-prep').className).not.toContain(themeColorsFor('job-prep').accentFill);
    expect(seg('job-prep').className).toContain('bg-diary-outline-variant');
  });
});
