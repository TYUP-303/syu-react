// src/components/test/ScaleSelector.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import ScaleSelector from './ScaleSelector';

afterEach(cleanup);

const OPTIONS = ['전혀 아니다', '가끔', '자주', '항상'];

// 실제 CSV(adhd_questions.csv / stress_questions.csv)의 scale 옵션.
// 괄호가 앞말에 붙어 있고, 이 붙어쓰기는 Firestore csvText로도 들어오므로
// CSV가 아니라 렌더링 시점에 교정한다.
const CSV_OPTIONS = [
  '전혀 없음',
  '거의 없음(한 달에 한 번 이하)',
  '때때로(한 달에 몇 번)',
  '자주(일주일에 몇 번)',
  '매우 자주(거의 매일)',
];

// ── 2026-08-27 UAT R1-08로 갱신된 계약 ──
// 세로 리스트(1~5 목록 버튼)를 걷어내고 가로 원형 버튼만 남겼다. 아래
// 테스트들이 "리스트에 라벨 전문이 보인다"를 전제하고 있었으므로, 같은
// 보장을 **원형 버튼의 접근성 이름**으로 옮겨 다시 고정한다. 화면에서
// 사라진 것은 중복 UI이지 정보가 아니라는 것이 이 갱신의 요지다.
describe('ScaleSelector', () => {
  it('옵션 수만큼의 원형 버튼 하나씩만 그린다 (세로 리스트 중복 없음)', () => {
    render(<ScaleSelector options={OPTIONS} testType="adhd" onSelect={() => {}} />);

    // 예전에는 원형 + 리스트로 옵션당 2개였다. 리스트가 되살아나면 여기서 걸린다.
    expect(screen.getAllByRole('button')).toHaveLength(OPTIONS.length);
  });

  it('원형 버튼의 접근성 이름에 번호와 라벨 전문이 함께 담긴다', () => {
    render(<ScaleSelector options={OPTIONS} testType="adhd" onSelect={() => {}} />);

    // 화면에 보이는 글자는 숫자뿐이므로, 라벨 전문은 aria-label이 책임진다.
    OPTIONS.forEach((opt, idx) => {
      expect(screen.getByRole('button', { name: `${idx + 1} ${opt}` })).toBeInTheDocument();
    });
  });

  it('원형 버튼 클릭 시 onSelect가 해당 인덱스로 호출된다', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ScaleSelector options={OPTIONS} testType="adhd" onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /2.*가끔/ }));

    expect(onSelect).toHaveBeenCalledWith(1);
  });

  // 해제 자체는 useTestStore.selectAnswer가 판단한다. 셀렉터는 이미 선택된
  // 항목도 계속 클릭 가능해야 그 판단이 도달한다.
  it('이미 선택된 옵션을 다시 클릭해도 onSelect가 같은 인덱스로 호출된다 (토글 해제)', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ScaleSelector options={OPTIONS} testType="adhd" selectedIndex={1} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /2.*가끔/ }));

    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('selectedIndex가 있으면 선택됨 배지와 선택 라벨을 강조 표시한다', () => {
    render(<ScaleSelector options={OPTIONS} testType="adhd" selectedIndex={2} onSelect={() => {}} />);
    expect(screen.getByText('선택됨')).toBeInTheDocument();
    expect(screen.getByText(OPTIONS[2])).toBeInTheDocument();
  });

  // 선택 상태는 색뿐 아니라 aria-pressed로도 전해진다. 리스트가 사라지면서
  // "체크 아이콘이 붙은 행"이라는 시각 단서가 없어졌기 때문이다 (UAT R1-08).
  it('선택 상태를 aria-pressed로도 알린다', () => {
    render(<ScaleSelector options={OPTIONS} testType="adhd" selectedIndex={2} onSelect={() => {}} />);

    expect(screen.getByRole('button', { name: `3 ${OPTIONS[2]}` })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: `1 ${OPTIONS[0]}` })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  // 색값이 아니라 "검사 액센트에 연결돼 있는가"를 고정한다.
  //
  // 2026-08-27 UAT R1-08 이전에는 리스트형 항목으로 확인했다 — 원형 칩은
  // 포커스 링(focus:ring-test-*-accent/50) 때문에 미선택 상태에도 'test-stress'
  // 문자열이 className에 들어 있어 단순 포함 검사로는 증거가 되지 못했기
  // 때문이다. 리스트를 걷어낸 지금은 채움 클래스 이름을 정확히 집어 갈라낸다.
  it('선택 강조가 검사 종류의 액센트를 따른다 (원색 primary 직접 사용 금지)', () => {
    render(<ScaleSelector options={OPTIONS} testType="stress" selectedIndex={1} onSelect={() => {}} />);

    const chips = screen.getAllByRole('button');
    expect(chips[1].className).toContain('bg-test-stress-accent');
    expect(chips[1].className).not.toMatch(/-primary\b/);
    expect(chips[0].className).not.toContain('bg-test-stress-accent');
  });

  it('selectedIndex가 없으면 선택됨 배지가 없다', () => {
    render(<ScaleSelector options={OPTIONS} testType="adhd" onSelect={() => {}} />);
    expect(screen.queryByText('선택됨')).not.toBeInTheDocument();
  });

  // 표기 교정 — 원본 CSV는 손대지 않고 표시할 때만 바꾼다.
  describe('괄호 라벨 표기', () => {
    // 리스트가 지던 역할을 접근성 이름으로 옮겼다 (2026-08-27 UAT R1-08).
    // 확인 대상만 바뀌었을 뿐 계약("괄호 앞 공백 한 칸")은 그대로다.
    it('원형 버튼의 접근성 이름은 여는 괄호 앞에 공백 한 칸을 넣는다', () => {
      render(<ScaleSelector options={CSV_OPTIONS} testType="adhd" onSelect={() => {}} />);

      expect(
        screen.getByRole('button', { name: '2 거의 없음 (한 달에 한 번 이하)' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '3 때때로 (한 달에 몇 번)' })).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: '2 거의 없음(한 달에 한 번 이하)' }),
      ).not.toBeInTheDocument();
    });

    it('이미 공백이 있는 라벨에는 공백을 덧붙이지 않는다', () => {
      render(
        <ScaleSelector
          options={['전혀 없음', '자주 (일주일에 몇 번)']}
          testType="adhd"
          onSelect={() => {}}
        />,
      );

      expect(screen.getByRole('button', { name: '2 자주 (일주일에 몇 번)' })).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: '2 자주  (일주일에 몇 번)' }),
      ).not.toBeInTheDocument();
    });

    it('점수 바 양끝 미니 라벨은 여는 괄호 앞에서 줄을 나눠 두 줄로 표시한다', () => {
      render(<ScaleSelector options={CSV_OPTIONS} testType="adhd" onSelect={() => {}} />);

      const head = screen.getByText('매우 자주');
      const tail = screen.getByText('(거의 매일)');
      expect(head.parentElement).toBe(tail.parentElement);
    });

    it('괄호가 없는 양끝 라벨은 그대로 한 줄이다', () => {
      render(<ScaleSelector options={CSV_OPTIONS} testType="adhd" onSelect={() => {}} />);

      // 리스트를 걷어낸 뒤로는 원형 바 왼쪽 미니 라벨 한 곳뿐이다
      // (2026-08-27 UAT R1-08 — 전에는 리스트에도 있어 2개였다).
      expect(screen.getAllByText('전혀 없음')).toHaveLength(1);
    });

    // 표기 변환이 선택 값 전달에 끼어들면 채점이 어긋난다.
    it('표기를 바꿔도 onSelect에는 원래 인덱스가 그대로 전달된다', async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();
      render(<ScaleSelector options={CSV_OPTIONS} testType="adhd" onSelect={onSelect} />);

      await user.click(screen.getByRole('button', { name: '5 매우 자주 (거의 매일)' }));

      expect(onSelect).toHaveBeenCalledWith(4);
    });

    // 선택한 답을 글자로 확인할 수 있는 자리가 가운데 라벨 하나뿐이 됐으므로
    // (리스트 삭제, 2026-08-27 UAT R1-08), 1줄 truncate로 되돌리면 긴 선택지가
    // 어디서도 온전히 보이지 않게 된다.
    it('선택된 라벨은 잘라내지 않고 두 줄까지 보여 준다', () => {
      render(
        <ScaleSelector options={CSV_OPTIONS} testType="adhd" selectedIndex={1} onSelect={() => {}} />,
      );

      const label = screen.getByText('거의 없음 (한 달에 한 번 이하)');
      expect(label.className).toContain('line-clamp-2');
      expect(label.className).not.toContain('truncate');
    });
  });
});
