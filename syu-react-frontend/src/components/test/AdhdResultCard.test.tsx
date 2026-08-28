// src/components/test/AdhdResultCard.test.tsx
// @vitest-environment jsdom
//
// ADHD 결과 카드의 점수 표기 계약 (2026-08-26 UAT 1-2 확정).
//
// UAT에서 "62 /100"이 점수인지 진행률인지 읽히지 않는다는 지적이 나왔다.
// 표기를 '점' 단위로 통일하되, 만점을 잃지 않도록 보조 캡션으로 남긴다.
// 심리학부 확정 문안의 **단어는 그대로**이고 숫자 표기만 바뀐다.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AdhdResultCard from './AdhdResultCard';
import { COPY } from '../../constants/copy';
import type { TestResultData } from '../../store/useTestStore';

afterEach(cleanup);

// 실제 adhd_questions.csv의 scale 옵션 5종 (개인 설명문 생성에 필요하다).
const OPTION_LABELS = [
  '전혀 없음',
  '거의 없음(한 달에 한 번 이하)',
  '때때로(한 달에 몇 번)',
  '자주(일주일에 몇 번)',
  '매우 자주(거의 매일)',
];

function makeResult(score: number, rawScore: number): TestResultData {
  return {
    testType: 'adhd',
    answers: {},
    score,
    rawScore,
    completedAt: '2026-08-01T00:00:00.000Z',
  } as unknown as TestResultData;
}

describe('AdhdResultCard — 점수 표기 단위', () => {
  it("큰 숫자 옆 단위는 '점'이고 만점은 보조 캡션으로 남는다", () => {
    render(
      <AdhdResultCard result={makeResult(62, 15)} optionLabels={OPTION_LABELS} questionCount={6} />,
    );

    expect(screen.getByText('62')).toBeInTheDocument();
    expect(screen.getByText(COPY.test.resultAdhdScoreUnit)).toBeInTheDocument();
    expect(screen.getByText(COPY.test.resultAdhdScoreMax)).toBeInTheDocument();
    expect(COPY.test.resultAdhdScoreUnit).toBe('점');
    expect(COPY.test.resultAdhdScoreMax).toBe('100점 만점');
  });

  // ── 2026-08-27 UAT R1-09 ──
  // "58 점 100점 만점"으로 세 덩어리가 같은 간격으로 늘어서 어디까지가 내
  // 점수인지 갈리지 않는다는 지적. 슬래시를 사이에 넣어 끊는다.
  it("점수와 만점 사이를 슬래시로 끊는다 ('62점 / 100점 만점')", () => {
    render(
      <AdhdResultCard result={makeResult(62, 15)} optionLabels={OPTION_LABELS} questionCount={6} />,
    );

    expect(COPY.test.resultAdhdScoreDivider).toBe('/');

    const divider = screen.getByText(COPY.test.resultAdhdScoreDivider);
    // 순서 계약 — 슬래시는 '점' 뒤, '100점 만점' 앞에 온다.
    expect(divider.previousElementSibling).toHaveTextContent(COPY.test.resultAdhdScoreUnit);
    expect(divider.nextElementSibling).toHaveTextContent(COPY.test.resultAdhdScoreMax);
    // 화면에서만 끊어 주는 장식이므로 낭독에서는 빠진다
    // (게이지 대체 텍스트가 "62점 (100점 만점)"으로 이미 또렷하게 읽어 준다).
    expect(divider).toHaveAttribute('aria-hidden', 'true');
  });

  it('게이지 대체 텍스트는 점수와 만점을 함께 읽어 준다', () => {
    render(
      <AdhdResultCard result={makeResult(62, 15)} optionLabels={OPTION_LABELS} questionCount={6} />,
    );

    expect(screen.getByRole('img', { name: '62점 (100점 만점)' })).toBeInTheDocument();
  });

  // ── 계약 ── 게이지와 해설문이 같은 단위를 쓴다.
  // 두 표기가 갈라지면 사용자는 같은 숫자를 두 번 다르게 읽게 된다.
  it('게이지와 해설문이 같은 단위를 쓴다 (한 화면에 /100이 남지 않는다)', () => {
    const { container } = render(
      <AdhdResultCard result={makeResult(50, 12)} optionLabels={OPTION_LABELS} questionCount={6} />,
    );

    // 해설문 — 확정 템플릿의 단어는 그대로, 숫자 표기만 '점' 단위
    expect(screen.getByText(/현재 ADHD 관련 경험 지표는 50점\(100점 만점\)입니다/)).toBeInTheDocument();
    // 게이지 — 같은 단위
    expect(screen.getByRole('img', { name: '50점 (100점 만점)' })).toBeInTheDocument();
    // 옛 표기가 어느 한쪽에라도 남아 있으면 계약 위반이다.
    //
    // 2026-08-27 UAT R1-09으로 구분자 슬래시가 들어오면서 단순
    // not.toContain('/100')은 쓸 수 없게 됐다 — 새 표기의 textContent가
    // "62점/100점 만점"으로 이어져 붙기 때문이다(화면에서는 슬래시 좌우
    // padding으로 떨어져 보인다). 옛 표기 "62 /100"은 만점 쪽에 '점 만점'이
    // 없다는 점으로 갈리므로, 그 형태만 콕 집어 계속 막는다.
    expect(container.textContent).not.toMatch(/\/\s*100(?!점 만점)/);
  });
});
