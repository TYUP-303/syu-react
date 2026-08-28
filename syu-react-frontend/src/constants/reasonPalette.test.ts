// src/constants/reasonPalette.test.ts
//
// 고른 전략에 맞게 요인을 거르는 규칙의 계약 (2026-08-27 2차 UAT R2-22).
//
// 편별 3+3은 "어떤 요정을 골랐든 맞는 칸이 하나는 있게" 감정·관점·행동에서
// 하나씩 뽑아 배정한 것이라, 고른 요정과 무관한 칸이 둘은 남는다. 취업준비6에서
// 아코(수용)를 고르고 "잘 모르겠어요"를 누르면 '상대에겐 통하지 않음'이 떴는데
// 수용 조언에는 상대에게 하는 것이 없다.
//
// 여기서 고정하는 것은 네 가지다:
//   ① 걸러진 만큼은 전역 팔레트가 반드시 메운다 (선택지가 줄어들지 않는다)
//   ② 편별 문구의 순서는 보존된다 (첫 칸이 그 편에 가장 맞는 요인이다)
//   ③ 팔레트에 없는 문구는 걸러 내지 않는다 (팀이 시트에 새로 적을 수 있다)
//   ④ 팔레트 문구는 CSV와 **글자 그대로** 같다 — 다르면 필터가 조용히 꺼진다

import { describe, it, expect } from 'vitest';
import angelsCsv from '../assets/data/scenario_angels.csv?raw';
import { parseScenarioAngelsCsv } from '../utils/scenarioAngelsCsvParser';
import { STRATEGY_KEYS, type StrategyKey } from './strategy';
import {
  HELPFUL_REASON_PALETTE,
  UNHELPFUL_REASON_PALETTE,
  REASON_PALETTE,
  REASONS_PER_EPISODE,
  reasonsForStrategy,
  type ReasonKind,
} from './reasonPalette';

// 실제 CSV의 취업준비6 배정. 이 세 개가 R2-22가 잡힌 화면이다.
const JOB6_UNHELPFUL = ['공감되지 않음', '이미 알던 이야기임', '상대에겐 통하지 않음'];

describe('reasonsForStrategy', () => {
  it('편별 3개가 모두 그 전략에 맞으면 순서까지 그대로 돌려준다', () => {
    // 재초점(리프)에게는 셋 다 성립한다 — 셋 다 전 전략 허용 태그다.
    const episode = ['상황에 맞지 않음', '너무 이상적임', '문제는 그대로 남음'];

    expect(reasonsForStrategy(episode, 'unhelpful', 'refocus')).toEqual(episode);
  });

  it('맞지 않는 요인은 빼고 전역 팔레트의 같은 종류에서 보충한다', () => {
    const result = reasonsForStrategy(JOB6_UNHELPFUL, 'unhelpful', 'accept');

    // 문제의 항목만 사라진다.
    expect(result).not.toContain('상대에겐 통하지 않음');
    // 남은 둘은 순서 그대로 앞에 서고, 보충은 뒤에 붙는다.
    expect(result.slice(0, 2)).toEqual(['공감되지 않음', '이미 알던 이야기임']);
    // 보충은 팔레트 순서상 앞선 것부터 — '상황에 맞지 않음'이 첫 미사용 항목이다.
    expect(result[2]).toBe('상황에 맞지 않음');

    // 같은 편·같은 kind라도 재평가를 골랐다면 그대로 남아 있어야 한다.
    expect(reasonsForStrategy(JOB6_UNHELPFUL, 'unhelpful', 'reappraisal')).toEqual(
      JOB6_UNHELPFUL,
    );
  });

  it('팔레트에 없는 문구는 태그가 없어도 걸러 내지 않는다', () => {
    // 팀이 시트에 새로 적은 문구 · 예전 DEFAULT_REASONS가 살아난 경우.
    const episode = ['새로운 관점을 제시함', '실질적인 도움이 됨', '지금 감정을 알아차림'];

    // '지금 감정을 알아차림'은 accept 전용이라 refocus에서는 걸린다.
    const result = reasonsForStrategy(episode, 'helpful', 'refocus');

    expect(result.slice(0, 2)).toEqual(['새로운 관점을 제시함', '실질적인 도움이 됨']);
    expect(result).not.toContain('지금 감정을 알아차림');
    expect(result).toHaveLength(REASONS_PER_EPISODE);
  });

  it('편별 문구와 보충 문구가 겹쳐도 같은 값을 두 번 내놓지 않는다', () => {
    // '감정을 편안하게 해줌'은 팔레트 첫 항목이라 보충 후보 1순위인데,
    // 편별 목록에 이미 있다. 보충이 이것을 다시 집으면 React key가 겹친다.
    const episode = ['감정을 편안하게 해줌', '상대 입장이 이해됨', '상황을 달리 보게 됨'];
    const result = reasonsForStrategy(episode, 'helpful', 'accept');

    expect(new Set(result).size).toBe(result.length);
    expect(result[0]).toBe('감정을 편안하게 해줌');
  });

  it('어느 전략을 골라도 선택지는 3개다 (모든 편 · 모든 kind · 모든 전략)', () => {
    const episodes = parseScenarioAngelsCsv(angelsCsv);
    const kinds: ReasonKind[] = ['helpful', 'unhelpful'];
    let checked = 0;

    episodes.forEach((text, domain) => {
      // '샘플' 행은 팀 작성 예시라 어느 에피소드에도 실리지 않는다.
      if (domain === '샘플') return;
      kinds.forEach((kind) => {
        STRATEGY_KEYS.forEach((strategyKey) => {
          const result = reasonsForStrategy(text[kind], kind, strategyKey);
          expect(result, `${domain} / ${kind} / ${strategyKey}`).toHaveLength(
            REASONS_PER_EPISODE,
          );
          expect(new Set(result).size).toBe(REASONS_PER_EPISODE);
          checked += 1;
        });
      });
    });

    // 40편 × 2종 × 3전략. 파싱이 조용히 비면 위 단언이 한 번도 돌지 않는다.
    expect(checked).toBe(40 * 2 * 3);
  });

  it('전략을 아직 고르지 않았으면 원본 그대로 둔다', () => {
    expect(reasonsForStrategy(JOB6_UNHELPFUL, 'unhelpful', null)).toEqual(JOB6_UNHELPFUL);
  });
});

describe('팔레트 자체의 계약', () => {
  it('문구는 CSV에 등장하는 문자열과 글자 그대로 같다', () => {
    const episodes = parseScenarioAngelsCsv(angelsCsv);
    const fromCsv: Record<ReasonKind, Set<string>> = {
      helpful: new Set(),
      unhelpful: new Set(),
    };

    episodes.forEach((text, domain) => {
      if (domain === '샘플') return;
      text.helpful.forEach((reason) => fromCsv.helpful.add(reason));
      text.unhelpful.forEach((reason) => fromCsv.unhelpful.add(reason));
    });

    // 여분(팔레트에만 있음)도 누락(CSV에만 있음)도 0이어야 한다. 한 글자만
    // 어긋나도 그 문구는 태그를 잃고 필터가 조용히 통과시킨다.
    expect([...fromCsv.helpful].sort()).toEqual(
      HELPFUL_REASON_PALETTE.map((entry) => entry.text).sort(),
    );
    expect([...fromCsv.unhelpful].sort()).toEqual(
      UNHELPFUL_REASON_PALETTE.map((entry) => entry.text).sort(),
    );
  });

  it('모든 전략에 kind별로 3개 이상이 태그돼 있다 (보충이 항상 가능하다)', () => {
    const kinds: ReasonKind[] = ['helpful', 'unhelpful'];
    kinds.forEach((kind) => {
      STRATEGY_KEYS.forEach((strategyKey: StrategyKey) => {
        const usable = REASON_PALETTE[kind].filter((entry) =>
          entry.strategies.includes(strategyKey),
        );
        expect(usable.length, `${kind} / ${strategyKey}`).toBeGreaterThanOrEqual(
          REASONS_PER_EPISODE,
        );
      });
    });
  });
});
