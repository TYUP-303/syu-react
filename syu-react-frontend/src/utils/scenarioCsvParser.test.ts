// src/utils/scenarioCsvParser.test.ts
// 시나리오 CSV 병합 파서의 "현재 동작"을 고정하는 특성화 테스트.
//
// 이 파서는 visual/dialogue 두 CSV를 "{no}_{domain}_{reactionType}" 키로 조인하며,
// 에피소드당 4씬이 하드코딩되어 있습니다. 입력이 어긋나도 예외를 던지지 않고
// 조용히 행을 버리거나 빈 씬을 만들기 때문에, [위험] 케이스를 특히 주의해야 합니다.

import { describe, it, expect } from 'vitest';
import { parseAndMergeScenarioCsv } from './scenarioCsvParser';

const VISUAL_HEADER =
  'NO,DOMAIN,REACTION_TYPE,TITLE,' +
  'S1_BG,S1_C1,S1_C2,S1_C3,S2_BG,S2_C1,S2_C2,S2_C3,' +
  'S3_BG,S3_C1,S3_C2,S3_C3,S4_BG,S4_C1,S4_C2,S4_C3';

const DIALOGUE_HEADER = 'NO,DOMAIN,REACTION_TYPE,SCENE_NUM,SCENE_TYPE,TEXT';

/** 필드 20개를 채운 정상 visual 행 */
const visualRow = (no = '1', domain = 'work', reactionType = 'avoid') =>
  [
    no,
    domain,
    reactionType,
    '회의 발표',
    'office',
    'boss_default',
    '',
    '',
    'meeting_room',
    'colleague_default',
    '',
    '',
    'cafe',
    'friend_happy',
    '',
    '',
    'my_room',
    '',
    '',
    '',
  ].join(',');

const dialogueRows = (no = '1', domain = 'work', reactionType = 'avoid') =>
  [
    `${no},${domain},${reactionType},1,narration,회의실에 들어섰다`,
    `${no},${domain},${reactionType},2,dialogue,"오늘 발표, 준비됐나?"`,
    `${no},${domain},${reactionType},3,monologue,심장이 빨라진다`,
    `${no},${domain},${reactionType},4,choice,어떻게 할까?`,
  ];

describe('parseAndMergeScenarioCsv', () => {
  it('visual과 dialogue를 조인해 4씬 에피소드를 만든다', () => {
    const result = parseAndMergeScenarioCsv(
      [VISUAL_HEADER, visualRow()].join('\n'),
      [DIALOGUE_HEADER, ...dialogueRows()].join('\n')
    );

    expect(result).toHaveLength(1);
    const episode = result[0];

    expect(episode.no).toBe('1');
    expect(episode.domain).toBe('work');
    expect(episode.reactionType).toBe('avoid');
    expect(episode.title).toBe('회의 발표');
    expect(episode.scenes).toHaveLength(4);

    expect(episode.scenes[0]).toEqual({
      type: 'narration',
      text: '회의실에 들어섰다',
      bg: 'office',
      chars: ['boss_default', '', ''],
    });
    expect(episode.scenes[3].bg).toBe('my_room');
    expect(episode.scenes[3].chars).toEqual(['', '', '']);
  });

  it('따옴표 안의 콤마를 보존하고 이스케이프된 따옴표("")를 복원한다', () => {
    const dialogue = [
      DIALOGUE_HEADER,
      '1,work,avoid,1,dialogue,"그가 말했다, ""준비됐어?"""',
    ];

    const [episode] = parseAndMergeScenarioCsv(
      [VISUAL_HEADER, visualRow()].join('\n'),
      dialogue.join('\n')
    );

    expect(episode.scenes[0].text).toBe('그가 말했다, "준비됐어?"');
  });

  it('SCENE_NUM이 뒤섞여 있어도 씬 순서대로 정렬한다', () => {
    const [d1, d2, d3, d4] = dialogueRows();
    const shuffled = [DIALOGUE_HEADER, d3, d1, d4, d2];

    const [episode] = parseAndMergeScenarioCsv(
      [VISUAL_HEADER, visualRow()].join('\n'),
      shuffled.join('\n')
    );

    expect(episode.scenes.map((s) => s.text)).toEqual([
      '회의실에 들어섰다',
      '오늘 발표, 준비됐나?',
      '심장이 빨라진다',
      '어떻게 할까?',
    ]);
  });

  it('dialogue가 아예 없어도 예외 없이 빈 텍스트 4씬을 만든다', () => {
    const [episode] = parseAndMergeScenarioCsv(
      [VISUAL_HEADER, visualRow()].join('\n'),
      DIALOGUE_HEADER
    );

    expect(episode.scenes).toHaveLength(4);
    expect(episode.scenes.every((s) => s.text === '' && s.type === '')).toBe(true);
    // 배경/캐릭터는 살아 있으므로 화면은 정상처럼 보이고 대사만 비어 있게 된다.
    expect(episode.scenes[0].bg).toBe('office');
  });

  it('[위험] 필드가 20개 미만인 visual 행은 에피소드 목록에서 조용히 사라진다', () => {
    const truncated = visualRow('2', 'study', 'avoid').split(',').slice(0, 19).join(',');

    const result = parseAndMergeScenarioCsv(
      [VISUAL_HEADER, visualRow(), truncated].join('\n'),
      [DIALOGUE_HEADER, ...dialogueRows(), ...dialogueRows('2', 'study', 'avoid')].join('\n')
    );

    // dialogue는 멀쩡히 존재하지만 visual 한 줄이 밀린 것만으로 에피소드가 없어진다.
    expect(result).toHaveLength(1);
    expect(result.map((e) => e.no)).toEqual(['1']);
  });

  it('[위험] SCENE_NUM에 결번이 있으면 뒤쪽 대사가 앞으로 당겨져 배경과 어긋난다', () => {
    // 씬 3이 누락된 상태. 파서는 정렬된 배열의 "인덱스"로 씬을 매칭한다.
    const dialogue = [
      DIALOGUE_HEADER,
      '1,work,avoid,1,narration,씬1 대사',
      '1,work,avoid,2,dialogue,씬2 대사',
      '1,work,avoid,4,choice,씬4 대사',
    ];

    const [episode] = parseAndMergeScenarioCsv(
      [VISUAL_HEADER, visualRow()].join('\n'),
      dialogue.join('\n')
    );

    // 씬4 대사가 세 번째 칸(배경 cafe)에 들어가고, 마지막 칸은 비어버린다.
    expect(episode.scenes[2].text).toBe('씬4 대사');
    expect(episode.scenes[2].bg).toBe('cafe');
    expect(episode.scenes[3].text).toBe('');
  });

  it('[위험] domain이나 reactionType에 언더스코어가 있으면 메타 필드가 밀려 파싱된다', () => {
    // 조인 키가 "{no}_{domain}_{reactionType}" 문자열이라 key.split('_')가 오작동한다.
    const [episode] = parseAndMergeScenarioCsv(
      [VISUAL_HEADER, visualRow('1', 'work_life', 'avoid')].join('\n'),
      [DIALOGUE_HEADER, ...dialogueRows('1', 'work_life', 'avoid')].join('\n')
    );

    // 조인 자체는 성공하지만(대사가 붙는다) 출력 메타데이터가 어긋난다.
    expect(episode.scenes[0].text).toBe('회의실에 들어섰다');
    expect(episode.domain).toBe('work'); // 'work_life'가 아님
    expect(episode.reactionType).toBe('life'); // 'avoid'가 아님
  });

  it('필드가 6개 미만인 dialogue 행은 무시된다', () => {
    const dialogue = [
      DIALOGUE_HEADER,
      '1,work,avoid,1,narration', // TEXT 누락 → 스킵
      '1,work,avoid,2,dialogue,씬2 대사',
    ];

    const [episode] = parseAndMergeScenarioCsv(
      [VISUAL_HEADER, visualRow()].join('\n'),
      dialogue.join('\n')
    );

    expect(episode.scenes[0].text).toBe('씬2 대사');
    expect(episode.scenes[1].text).toBe('');
  });
});
