// src/components/ui/EmphasizedText.test.tsx
// @vitest-environment jsdom
//
// 구간 계산 규칙은 utils/emphasizeText.test.ts가 담당한다. 여기서는 렌더 결과가
// 원문을 그대로 담고 있는지, 매칭 실패가 크래시가 아니라 평문으로 끝나는지만 본다.

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import EmphasizedText from './EmphasizedText';

afterEach(cleanup);

const TEXT = '스트레스를 받으면 먼저 상황을 정리하고, 원인을 파악하려는 경향이 있습니다.';

describe('EmphasizedText', () => {
  it('일치한 구절만 <strong>으로 감싸고 원문은 그대로 보여준다', () => {
    const { container } = render(
      <p>
        <EmphasizedText text={TEXT} phrases={['원인을 파악하려는 경향']} />
      </p>,
    );

    expect(container.textContent).toBe(TEXT);
    const strongs = container.querySelectorAll('strong');
    expect(strongs).toHaveLength(1);
    expect(strongs[0]).toHaveTextContent('원인을 파악하려는 경향');
  });

  it('매칭에 전부 실패해도 크래시 없이 평문으로 그린다', () => {
    const { container } = render(
      <p>
        <EmphasizedText text={TEXT} phrases={['없는 구절', '또 없는 구절']} />
      </p>,
    );

    expect(container.textContent).toBe(TEXT);
    expect(container.querySelectorAll('strong')).toHaveLength(0);
    expect(screen.getByText(TEXT)).toBeInTheDocument();
  });

  it('emphasisClassName으로 강조 스타일을 바꿀 수 있다', () => {
    const { container } = render(
      <p>
        <EmphasizedText
          text={TEXT}
          phrases={['원인을 파악하려는 경향']}
          emphasisClassName="font-bold text-primary"
        />
      </p>,
    );

    expect(container.querySelector('strong')).toHaveClass('text-primary');
  });
});
