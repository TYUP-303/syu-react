// src/utils/mailto.test.ts
//
// mailto 링크 조립 계약. 1:1 문의가 이 링크 하나에 걸려 있어서
// (폼을 받아 줄 서버가 없다) 인코딩이 틀리면 문의가 잘린 채 도착한다.

import { describe, it, expect } from 'vitest';
import { buildMailtoHref } from './mailto';

describe('buildMailtoHref', () => {
  it('제목과 본문을 파라미터로 붙인다', () => {
    const href = buildMailtoHref({ to: 'ops@example.com', subject: 'hello', body: 'world' });

    expect(href).toBe('mailto:ops@example.com?subject=hello&body=world');
  });

  it('수신 주소는 인코딩하지 않는다', () => {
    // @가 %40이 되면 주소로 인식하지 못하는 메일 클라이언트가 있다
    const href = buildMailtoHref({ to: 'ops@example.com', subject: '문의' });

    expect(href.startsWith('mailto:ops@example.com?')).toBe(true);
    expect(href).not.toContain('%40');
  });

  it('한글과 줄바꿈을 인코딩한다', () => {
    const href = buildMailtoHref({ to: 'ops@example.com', body: '첫 줄\n둘째 줄' });

    // 원문이 날것으로 남아 있으면 안 된다
    expect(href).not.toContain('첫 줄');
    expect(href).not.toContain('\n');
    // 디코딩하면 원문이 그대로 복원된다
    expect(decodeURIComponent(href.replace('mailto:ops@example.com?body=', ''))).toBe(
      '첫 줄\n둘째 줄',
    );
  });

  it('본문의 &와 #를 인코딩해 파라미터가 잘리지 않게 한다', () => {
    // 인코딩하지 않으면 &부터 뒤가 별개 파라미터로, #부터 뒤는 프래그먼트로
    // 잘려 나간다 — 사용자에게는 아무 경고 없이 본문 일부가 사라진다.
    const href = buildMailtoHref({ to: 'ops@example.com', body: 'A & B #1' });

    expect(href).toBe('mailto:ops@example.com?body=A%20%26%20B%20%231');
  });

  it('빈 값인 파라미터는 붙이지 않는다', () => {
    expect(buildMailtoHref({ to: 'ops@example.com' })).toBe('mailto:ops@example.com');
    expect(buildMailtoHref({ to: 'ops@example.com', subject: '', body: '' })).toBe(
      'mailto:ops@example.com',
    );
    expect(buildMailtoHref({ to: 'ops@example.com', body: 'only-body' })).toBe(
      'mailto:ops@example.com?body=only-body',
    );
  });
});
