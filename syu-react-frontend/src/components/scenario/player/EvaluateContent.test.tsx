// src/components/scenario/player/EvaluateContent.test.tsx
// @vitest-environment jsdom
//
// 평가 화면이 **고른 요정에 맞는 요인만** 내놓는다 (2026-08-27 2차 UAT R2-22).
//
// 거르는 규칙 자체는 constants/reasonPalette가 소유하고 그쪽 테스트가 고정한다.
// 여기서 확인하는 것은 "화면이 그 규칙을 실제로 통과시키는가" — 즉 플레이어가
// 고른 전략이 선택지 목록까지 흘러가는가다. 규칙이 맞아도 프롭 한 줄이 빠지면
// 화면은 예전 그대로이므로, 이 연결은 여기서만 잡힌다.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../../api/env', () => ({ IS_MOCK_MODE: true }));
vi.mock('../../../api/firebase', () => ({ db: {} }));

import EvaluateContent from './EvaluateContent';
import { COPY } from '../../../constants/copy';
import type { EpisodeData } from '../../../api/scenarioMockData';
import type { StrategyKey } from '../../../constants/strategy';

afterEach(cleanup);

const angel = (name: string) => ({
  name,
  strategy: `${name} 한 줄 요약`,
  detail: `${name} 상세`,
  feedback: `${name} 피드백`,
});

/** 실제 CSV의 취업준비6 배정 — R2-22가 잡힌 그 편이다. */
const episode: EpisodeData = {
  id: 'job-prep-ep6',
  episodeNumber: 6,
  title: '친구의 합격 소식',
  summary: '요약',
  scenario: {
    no: '16',
    domain: '취업준비6',
    reactionType: 'cognitive',
    title: '친구의 합격 소식',
    scenes: [],
  },
  angels: {
    accept: angel('수용'),
    reappraisal: angel('재평가'),
    refocus: angel('재초점'),
  },
  reasons: {
    helpful: ['지금 감정을 알아차림', '상대 입장이 이해됨', '시작해 볼 마음이 생김'],
    unhelpful: ['공감되지 않음', '이미 알던 이야기임', '상대에겐 통하지 않음'],
  },
};

const renderHelpful = () =>
  render(
    <EvaluateContent
      mode="helpful"
      episode={episode}
      strategyKey="accept"
      wasHelpful={null}
      isSubmitting={false}
      submitError={null}
      onHelpfulSelect={() => {}}
      onBack={() => {}}
      onBackToApply={() => {}}
      onReasonSelect={() => {}}
    />,
  );

const renderReasons = (strategyKey: StrategyKey | null, wasHelpful: boolean) =>
  render(
    <EvaluateContent
      mode="reason"
      episode={episode}
      strategyKey={strategyKey}
      wasHelpful={wasHelpful}
      isSubmitting={false}
      submitError={null}
      onHelpfulSelect={() => {}}
      onBack={() => {}}
      onBackToApply={() => {}}
      onReasonSelect={() => {}}
    />,
  );

/** 선택지 버튼의 문구만 순서대로. 되돌리기 버튼은 제외한다. */
const reasonLabels = () =>
  screen
    .getAllByRole('button')
    .map((button) => button.textContent?.trim() ?? '')
    .filter((label) => label !== '' && !label.includes('이전'));

describe('EvaluateContent — 전략별 요인 필터', () => {
  it('수용(아코)을 고르면 상대를 전제한 요인이 빠지고 자리는 다시 채워진다', () => {
    renderReasons('accept', false);

    // 수용 조언에는 상대에게 하는 것이 없다 — 이 항목이 R2-22의 지적이다.
    expect(screen.queryByRole('button', { name: '상대에겐 통하지 않음' })).not.toBeInTheDocument();
    // 나머지 둘은 순서 그대로 남고, 빈 자리는 전역 팔레트가 메운다.
    expect(reasonLabels()).toEqual([
      '공감되지 않음',
      '이미 알던 이야기임',
      '상황에 맞지 않음',
    ]);
  });

  it('재평가(포코)를 골랐다면 같은 편·같은 목록이 그대로 선다', () => {
    renderReasons('reappraisal', false);

    expect(reasonLabels()).toEqual(episode.reasons.unhelpful);
  });

  it('도움 쪽도 같은 규칙을 탄다 — 재초점에는 감정 알아차림·상대 이해가 맞지 않는다', () => {
    renderReasons('refocus', true);

    expect(screen.queryByRole('button', { name: '지금 감정을 알아차림' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '상대 입장이 이해됨' })).not.toBeInTheDocument();
    expect(reasonLabels()).toHaveLength(3);
    expect(reasonLabels()[0]).toBe('시작해 볼 마음이 생김');
  });
});

// ─────────────────────────────────────────────────────────
// 되돌리기의 **자리** (2026-08-27 3차 UAT R3-03)
//
// 두 평가 화면의 '이전'은 가운데 정렬 머리글 위에 `absolute left-0 top-0`으로
// 겹쳐 서 있었다. 375px에서 "실제로 이 마음 대처법이 나에게"의 첫 글자와
// 버튼이 부딪혀 글자가 읽히지 않는다는 지적을 받았다.
//
// 고치는 방향은 요정 브라우즈·전략 적용 단계와 **같은 구조**다 — 되돌리기는
// 자기 한 줄(일반 흐름, 왼쪽 정렬)을 쓰고 머리글은 그 아래 줄부터 시작한다.
// 자리가 단계마다 같아야 R2-05가 세운 "같은 동작은 같은 자리"가 유지된다.
//
// 클래스를 직접 보는 것은 jsdom에 레이아웃이 없어서다. 겹침 여부는 화면에서만
// 드러나므로, 겹침을 만드는 **원인**(absolute 배치)이 없다는 것으로 대신 잡는다.
describe('EvaluateContent — 되돌리기는 자기 한 줄에 선다 (R3-03)', () => {
  const assertsOwnRow = (back: HTMLElement, heading: HTMLElement) => {
    // 1) DOM 순서상 머리글보다 앞 — 읽는 순서가 곧 보이는 순서다.
    expect(back.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 2) 겹쳐 세우지 않는다.
    expect(back.className).not.toMatch(/absolute/);
    // 3) 요정·전략 단계와 같은 자리 지정(self-start).
    expect(back.className).toMatch(/self-start/);
  };

  it('도움 평가 — 이전이 머리글 위에 겹치지 않는다', () => {
    renderHelpful();

    assertsOwnRow(
      screen.getByRole('button', { name: COPY.player.backToApplyAria }),
      screen.getByText(COPY.player.evalIntro),
    );
  });

  it('핵심 요인 — 같은 자리에 같은 구조로 선다', () => {
    renderReasons('accept', false);

    assertsOwnRow(
      screen.getByRole('button', { name: COPY.player.evalBack }),
      screen.getByText(COPY.player.reasonIntro),
    );
  });
});
