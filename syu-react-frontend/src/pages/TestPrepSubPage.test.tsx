// src/pages/TestPrepSubPage.test.tsx
// @vitest-environment jsdom
//
// 준비 화면이 "검사 전에 무엇을 알려 주고 무엇을 감추는가"를 고정한다
// (UAT 2026-08-11 조세현, 심리 전문가).
//
//   (a) 답할 기준(ADHD의 '최근 6개월')은 검사 전에 알려 준다 — 단, 그 기준이
//       실제로 있는 검사에서만. 스트레스 검사에는 기간 개념이 없다.
//   (b) 측정 차원('인지'·'정서'·'행동')은 검사 전에도 알려 주지 않는다.
//       무엇을 재는지 알고 답하면 응답 편향이 생긴다. 진행 화면의 문항 라벨만
//       고치면 준비 화면이 미리 알려 주므로 절반만 막는 셈이다.
//
// 차원 이름은 **결과** 화면(StressResultCard·AxisAProfileCard)에서만 쓴다.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import TestPrepSubPage from './TestPrepSubPage';
import { COPY } from '../constants/copy';
import type { TestType } from '../constants/testTheme';

const onStart = vi.fn();
const onBack = vi.fn();

const renderPrep = (testType: TestType) =>
  render(<TestPrepSubPage testType={testType} onStart={onStart} onBack={onBack} />);

afterEach(cleanup);

describe('TestPrepSubPage — ADHD 응답 기준 "최근 6개월"', () => {
  it('ADHD 준비 화면에는 기준 카드가 있다', () => {
    renderPrep('adhd');

    expect(screen.getByText(COPY.test.adhdTimeframeLabel)).toBeInTheDocument();
    expect(screen.getByText(COPY.test.adhdTimeframeNotice)).toBeInTheDocument();
  });

  it('스트레스 준비 화면에는 없다 (ASRS 고유 프레이밍)', () => {
    renderPrep('stress');

    expect(screen.queryByText(COPY.test.adhdTimeframeLabel)).not.toBeInTheDocument();
    expect(screen.queryByText(COPY.test.adhdTimeframeNotice)).not.toBeInTheDocument();
  });
});

describe('TestPrepSubPage — 측정 차원(영역) 비노출', () => {
  it('스트레스 준비 화면 어디에도 인지·정서·행동이 나오지 않는다', () => {
    renderPrep('stress');

    expect(screen.queryByText(/인지|정서|행동/)).not.toBeInTheDocument();
  });

  // 문구 자체를 소스에서도 못 박는다 — 컴포넌트를 거치지 않고 copy만 되돌리는
  // 회귀(예: prepDesc에 괄호를 다시 붙이는 수정)를 잡기 위해서다.
  it('스트레스 검사 소개 문구가 차원 이름을 담지 않는다', () => {
    const t = COPY.test.byType.stress;

    expect(t.prepDesc).not.toMatch(/인지|정서|행동/);
    expect(t.prepStandard).not.toMatch(/인지|정서|행동/);
    // 검사 목적 자체는 남아 있어야 한다 (문구를 통째로 비우는 것이 답이 아니다)
    expect(t.prepDesc).toMatch(/스트레스/);
    expect(t.prepStandard).toMatch(/스트레스/);
  });
});
