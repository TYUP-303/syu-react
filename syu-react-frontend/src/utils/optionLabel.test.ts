// src/utils/optionLabel.test.ts
import { describe, it, expect } from 'vitest';
import { spaceBeforeParen, splitLabelAtParen } from './optionLabel';

// 실제 CSV(adhd_questions.csv / stress_questions.csv)의 scale 옵션 5종.
const CSV_OPTIONS = [
  '전혀 없음',
  '거의 없음(한 달에 한 번 이하)',
  '때때로(한 달에 몇 번)',
  '자주(일주일에 몇 번)',
  '매우 자주(거의 매일)',
];

describe('spaceBeforeParen', () => {
  it('여는 괄호 앞에 공백 한 칸을 넣는다', () => {
    expect(spaceBeforeParen('거의 없음(한 달에 한 번 이하)')).toBe(
      '거의 없음 (한 달에 한 번 이하)',
    );
  });

  it('이미 공백이 있으면 중복해서 넣지 않는다', () => {
    expect(spaceBeforeParen('거의 없음 (한 달에 한 번 이하)')).toBe(
      '거의 없음 (한 달에 한 번 이하)',
    );
  });

  it('공백이 여러 칸이면 한 칸으로 정규화한다', () => {
    expect(spaceBeforeParen('자주   (일주일에 몇 번)')).toBe('자주 (일주일에 몇 번)');
  });

  it('괄호가 없는 라벨은 그대로 둔다', () => {
    expect(spaceBeforeParen('전혀 없음')).toBe('전혀 없음');
  });

  it('괄호로 시작하는 라벨에는 선행 공백을 만들지 않는다', () => {
    expect(spaceBeforeParen('(거의 매일)')).toBe('(거의 매일)');
  });

  it('괄호가 둘 이상이면 모두 처리한다', () => {
    expect(spaceBeforeParen('가끔(주 1회)(참고)')).toBe('가끔 (주 1회) (참고)');
  });

  it('CSV 옵션 5종을 기대한 표기로 바꾼다', () => {
    expect(CSV_OPTIONS.map(spaceBeforeParen)).toEqual([
      '전혀 없음',
      '거의 없음 (한 달에 한 번 이하)',
      '때때로 (한 달에 몇 번)',
      '자주 (일주일에 몇 번)',
      '매우 자주 (거의 매일)',
    ]);
  });
});

describe('splitLabelAtParen', () => {
  it('첫 여는 괄호를 기준으로 두 줄로 쪼갠다', () => {
    expect(splitLabelAtParen('매우 자주(거의 매일)')).toEqual(['매우 자주', '(거의 매일)']);
  });

  it('괄호 앞 공백은 첫 줄 끝에서 제거한다', () => {
    expect(splitLabelAtParen('매우 자주 (거의 매일)')).toEqual(['매우 자주', '(거의 매일)']);
  });

  it('괄호가 없으면 한 줄 그대로 돌려준다', () => {
    expect(splitLabelAtParen('전혀 없음')).toEqual(['전혀 없음']);
  });

  it('괄호로 시작하면 쪼개지 않는다', () => {
    expect(splitLabelAtParen('(거의 매일)')).toEqual(['(거의 매일)']);
  });

  it('닫는 괄호가 여러 개여도 첫 여는 괄호에서만 쪼갠다', () => {
    expect(splitLabelAtParen('자주(주 3회)(예시)')).toEqual(['자주', '(주 3회)(예시)']);
  });

  it('빈 문자열은 그대로 한 줄이다', () => {
    expect(splitLabelAtParen('')).toEqual(['']);
  });
});
