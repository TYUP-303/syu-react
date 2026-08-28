// src/components/test/YesNoSelector.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import YesNoSelector from './YesNoSelector';

afterEach(cleanup);

describe('YesNoSelector', () => {
  it('두 옵션을 모두 렌더링한다', () => {
    render(<YesNoSelector options={['예', '아니오']} testType="adhd" onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /예/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /아니오/ })).toBeInTheDocument();
  });

  it('아니오 클릭 시 onSelect(1)이 호출된다', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<YesNoSelector options={['예', '아니오']} testType="adhd" onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /아니오/ }));

    expect(onSelect).toHaveBeenCalledWith(1);
  });

  // 해제 자체는 useTestStore.selectAnswer가 판단한다. 셀렉터는 이미 선택된
  // 칸도 계속 클릭 가능해야 그 판단이 도달한다.
  it('이미 선택된 옵션을 다시 클릭해도 onSelect가 같은 인덱스로 호출된다 (토글 해제)', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<YesNoSelector options={['예', '아니오']} testType="adhd" selectedIndex={0} onSelect={onSelect} />);

    await user.click(screen.getAllByRole('button')[0]);

    expect(onSelect).toHaveBeenCalledWith(0);
  });

  // 스트레스 검사는 12문항 전부 yes-no다. 예전에는 상단 진행 바·배지가
  // 앰버(tertiary)인데 선택지만 primary 파랑으로 켜져 색 축이 갈라졌다.
  // 색값이 아니라 "검사 액센트에 연결돼 있는가"를 고정한다.
  it('선택 강조가 검사 종류의 액센트를 따른다 (원색 primary 직접 사용 금지)', () => {
    render(<YesNoSelector options={['예', '아니오']} testType="stress" selectedIndex={0} onSelect={() => {}} />);

    const selected = screen.getAllByRole('button')[0];
    expect(selected.className).toContain('test-stress');
    expect(selected.className).not.toMatch(/-primary\b/);
  });

  it('미선택 칸은 중립색이라 답변별로 색이 갈리지 않는다', () => {
    // 예=primary / 아니오=secondary 2색 구조를 폐기한 결과다 — 답변에 색을
    // 배정하면 "예"가 권장처럼 읽혀 자가 보고를 편향시킨다.
    render(<YesNoSelector options={['예', '아니오']} testType="stress" onSelect={() => {}} />);

    for (const button of screen.getAllByRole('button')) {
      expect(button.className).not.toContain('test-stress');
      expect(button.className).not.toMatch(/-secondary\b/);
    }
  });

  it('[위험] 첫 번째 옵션은 텍스트와 무관하게 예 스타일로 취급된다 (idx===0 규칙)', () => {
    // options가 ['아니오', '예'] 순서로 와도 첫 칸에 check 아이콘이 그려지는 현재 동작을 고정
    render(<YesNoSelector options={['아니오', '예']} testType="adhd" onSelect={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0].textContent).toContain('check');
  });
});
