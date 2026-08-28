// P0 인프라 검증용: 파일별 jsdom 프라그마와 Testing Library 스택이 동작하는지 확인
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

describe('jsdom 인프라', () => {
  it('프라그마로 jsdom 환경이 적용되고 렌더링이 동작한다', () => {
    render(<button type="button">확인</button>);
    expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument();
  });
});
