// src/components/report/helpfulnessEmphasis.test.tsx
// @vitest-environment jsdom
//
// "도움 체감도"의 위계 계약 (2026-08-26 UAT 접수 1-8 — "결과 페이지에서
// 도움 체감도를 좀 더 크게").
//
// 전체 체감률은 카드 제목 오른쪽 13px 보조 표시였다. 이 화면에서 가장
// 먼저 읽혀야 할 수치가 제목보다 작았고, 카드 자체도 보고서 4~5번째에
// 묻혀 있었다. 두 가지를 계약으로 고정한다:
//   1) 전체 체감률은 stat tile의 큰 숫자다 (라벨 위 · 보조 문구 아래).
//   2) 그 카드는 보고서에서 전략 사용 비중보다 위에 온다.
//
// 소표본(3회 미만)에서 %를 접는 기존 규칙은 그대로다 — 크게 보여주는
// 것과 없는 정밀도를 지어내는 것은 다른 일이다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../../api/firebase', () => ({ db: {} }));

import type { EpisodeData, ThemeCategory } from '../../api/scenarioMockData';
import type { EpisodeProgress } from '../../store/useScenarioStore';
import { useScenarioStore } from '../../store/useScenarioStore';
import { useTestStore } from '../../store/useTestStore';
import HelpfulnessCard from './HelpfulnessCard';
import EmotionProfileReport from './EmotionProfileReport';
import ComprehensiveInsightReport from './ComprehensiveInsightReport';
import { computeStrategyStats } from '../../utils/strategyStats';

/** 30px 이상이면 "큰 숫자"로 본다 — 결과 카드의 40px 숫자와 같은 문법이다. */
const BIG_NUMBER_CLASS = /text-\[(3\d|4\d)px\]/;

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

const THEMES = [makeTheme('workplace', '직장'), makeTheme('daily', '일상')];

function prog(
  selectedAngel: EpisodeProgress['selectedAngel'],
  wasHelpful: boolean,
): EpisodeProgress {
  return {
    cleared: true,
    selectedAngel,
    wasHelpful,
    selectedReason: '상황을 객관적으로 볼 수 있었어요',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

/** 직장 영역에 3회 기록 (2회 도움됨 → 67%) */
const THREE_RECORDS = {
  'workplace-ep1': prog('accept', true),
  'workplace-ep2': prog('accept', true),
  'workplace-ep3': prog('accept', false),
};

beforeEach(() => {
  useScenarioStore.setState({ themes: THEMES, progress: {} });
  useTestStore.setState({ adhdResult: null, stressResult: null });
});
afterEach(cleanup);

describe('HelpfulnessCard — 전체 체감률 stat tile', () => {
  it('전체 체감률을 큰 숫자로 보여주고 라벨과 보조 문구를 함께 붙인다', () => {
    render(
      <HelpfulnessCard
        stats={computeStrategyStats([
          prog('accept', true),
          prog('accept', true),
          prog('accept', false),
        ])}
      />,
    );

    const value = screen.getByText('67%');
    expect(value.className).toMatch(BIG_NUMBER_CLASS);
    // 라벨은 값 위, 보조 문구는 값 아래
    expect(screen.getByText('전체 도움 체감도')).toBeInTheDocument();
    expect(screen.getByText('3회 중 2회 도움됨')).toBeInTheDocument();
  });

  it('소표본에서는 %를 지어내지 않고 횟수를 큰 숫자로 올린다', () => {
    render(
      <HelpfulnessCard
        stats={computeStrategyStats([prog('accept', true), prog('refocus', false)])}
      />,
    );

    const value = screen.getByText('2회 중 1회');
    expect(value.className).toMatch(BIG_NUMBER_CLASS);
    expect(screen.queryByText('50%')).not.toBeInTheDocument();
  });

  it('완주 기록이 없으면 카드 자체를 그리지 않는다 (0%로 지어내지 않는다)', () => {
    const { container } = render(<HelpfulnessCard stats={computeStrategyStats([])} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('보고서 카드 순서 — 도움 체감도가 위로 온다', () => {
  function headings(): string[] {
    return screen
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent ?? '');
  }

  it('정서 대응 프로필에서 전략 사용 비중보다 앞선다', () => {
    useScenarioStore.setState({ themes: THEMES, progress: THREE_RECORDS });
    render(<EmotionProfileReport themeId="workplace" onClose={() => {}} />);

    const order = headings();
    const helpful = order.indexOf('전략별 도움 체감도');
    const frequency = order.indexOf('전략 사용 비중');

    expect(helpful).toBeGreaterThanOrEqual(0);
    expect(frequency).toBeGreaterThanOrEqual(0);
    expect(helpful).toBeLessThan(frequency);
    // "상단" — 종합 진단 바로 다음 자리다
    expect(helpful).toBeLessThanOrEqual(1);
  });

  it('종합 인사이트에서도 전략 사용 비중보다 앞선다', () => {
    useScenarioStore.setState({ themes: THEMES, progress: THREE_RECORDS });
    render(<ComprehensiveInsightReport onBack={() => {}} onGoEnding={() => {}} />);

    const order = headings();
    const helpful = order.indexOf('전략별 도움 체감도');
    const frequency = order.indexOf('전략 사용 비중');

    expect(helpful).toBeGreaterThanOrEqual(0);
    expect(frequency).toBeGreaterThanOrEqual(0);
    expect(helpful).toBeLessThan(frequency);
    expect(helpful).toBeLessThanOrEqual(1);
  });
});
