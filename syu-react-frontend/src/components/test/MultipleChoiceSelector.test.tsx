// src/components/test/MultipleChoiceSelector.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import MultipleChoiceSelector from './MultipleChoiceSelector';

afterEach(cleanup);

const OPTIONS = ['운동을 한다', '음악을 듣는다', '잠을 잔다'];

describe('MultipleChoiceSelector', () => {
  it('모든 옵션을 A, B, C 알파벳 칩과 함께 렌더링한다', () => {
    render(<MultipleChoiceSelector options={OPTIONS} testType="adhd" onSelect={() => {}} />);
    for (const opt of OPTIONS) {
      expect(screen.getByText(opt)).toBeInTheDocument();
    }
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('옵션 클릭 시 onSelect가 해당 인덱스로 호출된다', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<MultipleChoiceSelector options={OPTIONS} testType="adhd" onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /음악을 듣는다/ }));

    expect(onSelect).toHaveBeenCalledWith(1);
  });

  // 해제 자체는 useTestStore.selectAnswer가 판단한다. 셀렉터는 이미 선택된
  // 항목도 계속 클릭 가능해야 그 판단이 도달한다.
  it('이미 선택된 옵션을 다시 클릭해도 onSelect가 같은 인덱스로 호출된다 (토글 해제)', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<MultipleChoiceSelector options={OPTIONS} testType="adhd" selectedIndex={1} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /음악을 듣는다/ }));

    expect(onSelect).toHaveBeenCalledWith(1);
  });

  // 색값이 아니라 "검사 액센트에 연결돼 있는가"를 고정한다.
  it('선택 강조가 검사 종류의 액센트를 따른다 (원색 primary 직접 사용 금지)', () => {
    render(<MultipleChoiceSelector options={OPTIONS} testType="stress" selectedIndex={1} onSelect={() => {}} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons[1].className).toContain('test-stress');
    expect(buttons[1].className).not.toMatch(/-primary\b/);
    expect(buttons[0].className).not.toContain('test-stress');
  });

  it('selectedIndex 옵션에만 체크 마크가 표시된다', () => {
    render(<MultipleChoiceSelector options={OPTIONS} testType="adhd" selectedIndex={2} onSelect={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[2].textContent).toContain('check');
    expect(buttons[0].textContent).not.toContain('check');
  });
});
