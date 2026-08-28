// src/constants/endingScript.test.ts
// 엔딩 원고 데이터와 체류 시간 계산에 대한 회귀 테스트.
//
// 원고는 검토 회차마다 손을 대는 파일이라, 수정 중에 조용히 깨지기 쉬운
// 두 가지를 잡아 둔다: (1) 챕터 구조가 연출 코드의 가정을 벗어나는 것,
// (2) 확정 전 요정 호칭이 되살아나는 것.

import { describe, expect, it } from 'vitest';
import scenarioVisualCsv from '../assets/data/scenario_visual.csv?raw';
import { backgroundUrl } from '../components/scenario/player/assetUrls';
import {
  CREDITS_CHAPTER_INDEX,
  ENDING_CHAPTERS,
  ENDING_CHAPTER_DURATIONS,
  getChapterDurationMs,
  type EndingChapter,
} from './endingScript';

/** 챕터에서 화면에 나오는 모든 글자 — 제목 · lead · 본문. */
const chapterText = (chapter?: EndingChapter): string =>
  chapter
    ? [chapter.title ?? '', ...chapter.blocks.flatMap((block) => [block.lead ?? '', block.text])].join(
        '\n',
      )
    : '';

describe('ENDING_CHAPTERS', () => {
  it('챕터 id가 서로 겹치지 않는다 (React key이자 인디케이터 식별자)', () => {
    const ids = ENDING_CHAPTERS.map((chapter) => chapter.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('크레딧이 마지막 챕터다 — 자동 진행이 여기서 멈춘다', () => {
    expect(CREDITS_CHAPTER_INDEX).toBe(ENDING_CHAPTERS.length - 1);
    expect(ENDING_CHAPTERS[CREDITS_CHAPTER_INDEX].id).toBe('credits');
  });

  it('크레딧을 제외한 모든 챕터에 본문이 있다', () => {
    ENDING_CHAPTERS.slice(0, CREDITS_CHAPTER_INDEX).forEach((chapter) => {
      expect(chapter.blocks.length).toBeGreaterThan(0);
    });
  });

  it('요정을 확정 이름(아코 · 포코 · 리프)으로 부른다', () => {
    const fairies = ENDING_CHAPTERS.find((chapter) => chapter.id === 'fairies');
    const text = chapterText(fairies);

    expect(text).toContain('수용의 아코');
    expect(text).toContain('재평가의 포코');
    expect(text).toContain('재초점의 리프');
  });

  it('확정 전 호칭(수용요정 · 평가요정 · 초점요정)이 남아 있지 않다', () => {
    const wholeScript = ENDING_CHAPTERS.map(chapterText).join('\n');

    expect(wholeScript).not.toContain('수용요정');
    expect(wholeScript).not.toContain('평가요정');
    expect(wholeScript).not.toContain('초점요정');
  });

  it('전문적 지원을 권유하는 문단이 유지된다 (여명이 선생님 검토 반영분)', () => {
    const support = ENDING_CHAPTERS.find((chapter) => chapter.id === 'support');

    expect(chapterText(support)).toContain('전문적인 지원');
  });

  it('세 전략을 소개하는 구절이 lead로 분리되어 강조된다', () => {
    const fairies = ENDING_CHAPTERS.find((chapter) => chapter.id === 'fairies');
    const leads = fairies?.blocks.map((block) => block.lead).filter(Boolean) ?? [];

    expect(leads).toEqual(['수용의 아코와 함께', '재평가의 포코와 함께', '재초점의 리프와 함께']);
  });
});

/**
 * 시나리오 CSV가 실제로 배정한 배경 파일명.
 * 헤더는 NO,DOMAIN,REACTION_TYPE,TITLE 다음 4씬이 (BG,CHAR,CHAR,CHAR)로
 * 반복되므로 배경은 4·8·12·16번 컬럼이다. 캐릭터 컬럼이 섞이지 않도록
 * 인덱스로 집는다.
 */
const BG_COLUMN_INDEXES = [4, 8, 12, 16];
const BACKGROUNDS_USED_IN_SCENARIOS = new Set(
  scenarioVisualCsv
    .split(/\r?\n/)
    .slice(1)
    .flatMap((row) => {
      const cells = row.split(',');
      return BG_COLUMN_INDEXES.map((i) => cells[i]?.trim() ?? '');
    })
    .filter(Boolean),
);

describe('챕터 배경', () => {
  // public/scenario/backgrounds/에는 시나리오가 한 번도 쓰지 않는 배경도 섞여
  // 있다(classroom, restaurant). 엔딩은 "지나온 장면"을 회고하는 자리이므로,
  // 사용자가 플레이 중 본 적 없는 장소를 깔면 회고가 성립하지 않는다.
  // 파일이 존재하는지보다 이 조건이 중요하다.
  it('배경이 전부 시나리오에서 실제로 쓰이는 장소다', () => {
    ENDING_CHAPTERS.forEach((chapter) => {
      const { file } = chapter.background;
      expect(
        BACKGROUNDS_USED_IN_SCENARIOS.has(file),
        `${chapter.id}: ${file}은 시나리오에 등장하지 않는 배경이다`,
      ).toBe(true);
    });
  });

  // 원고가 경로를 직접 조립하던 시절 엔딩만 WebP·캐시 버스터를 못 타고 원본
  // PNG를 받고 있었다(2026-08-18). 파일명만 들도록 고쳤으므로 여기서 형식을
  // 못 박는다 — 다시 경로가 섞여 들어오면 이 테스트가 먼저 깨진다.
  it('배경 값이 경로도 캐시 버전도 없는 파일명이다', () => {
    ENDING_CHAPTERS.forEach((chapter) => {
      expect(chapter.background.file, `${chapter.id}의 배경 값에 경로가 섞였다`).toMatch(
        /^[a-z0-9_]+\.png$/,
      );
    });
  });

  // 엔딩 배경 6종(my_room · office · meeting_room · street_night · cafe ·
  // library)은 모두 ×2 업스케일 WebP가 준비된 목록 안에 있다. 새 배경을
  // 고를 때 업스케일본이 없는 장소(예: 아직 변환하지 않은 신규 배경)를
  // 집으면 엔딩만 저해상도 PNG로 돌아가므로 여기서 막는다.
  it('배경이 전부 WebP 업스케일본을 타고, 캐시 버스터가 붙는다', () => {
    ENDING_CHAPTERS.forEach((chapter) => {
      const url = backgroundUrl(chapter.background.file);
      expect(url, `${chapter.id}: ${chapter.background.file}의 업스케일본 누락`).toMatch(
        /^\/scenario\/backgrounds\/[a-z0-9_]+\.webp\?v=/,
      );
    });
  });

  it('focusX가 0~100 범위 안에 있다', () => {
    ENDING_CHAPTERS.forEach((chapter) => {
      expect(chapter.background.focusX).toBeGreaterThanOrEqual(0);
      expect(chapter.background.focusX).toBeLessThanOrEqual(100);
    });
  });

  it('모든 배경에 무엇이 보이는지 적어 둔 note가 있다', () => {
    ENDING_CHAPTERS.forEach((chapter) => {
      expect(chapter.background.note.length).toBeGreaterThan(0);
    });
  });

  it('첫 챕터와 마지막 챕터가 같은 방을 다른 각도로 쓴다 (수미상관)', () => {
    const first = ENDING_CHAPTERS[0].background;
    const last = ENDING_CHAPTERS[CREDITS_CHAPTER_INDEX].background;

    expect(last.file).toBe(first.file);
    expect(last.focusX).not.toBe(first.focusX);
  });
});

describe('getChapterDurationMs', () => {
  it('본문이 길수록 오래 머문다', () => {
    const short = getChapterDurationMs({ blocks: [{ text: '짧은 문장.' }] });
    const long = getChapterDurationMs({
      blocks: [{ text: '짧은 문장.' }, { text: '뒤에 덧붙는 두 번째 문장.' }],
    });

    expect(long).toBeGreaterThan(short);
  });

  it('아무리 짧아도 페이드 인을 감상할 시간은 준다', () => {
    expect(getChapterDurationMs({ blocks: [{ text: '' }] })).toBeGreaterThanOrEqual(3_000);
  });

  it('아무리 길어도 12초를 넘기지 않는다 (탭으로 넘길 수 있으므로)', () => {
    const veryLong = getChapterDurationMs({ blocks: [{ text: '가'.repeat(500) }] });
    expect(veryLong).toBe(12_000);
  });

  it('공백과 줄바꿈은 체류 시간에 포함하지 않는다', () => {
    const spaced = getChapterDurationMs({ blocks: [{ text: '가 나\n다' }] });
    const packed = getChapterDurationMs({ blocks: [{ text: '가나다' }] });

    expect(spaced).toBe(packed);
  });

  it('실제 챕터 전부가 3.5초 이상 12초 이하에 들어온다', () => {
    ENDING_CHAPTER_DURATIONS.forEach((duration) => {
      expect(duration).toBeGreaterThanOrEqual(3_500);
      expect(duration).toBeLessThanOrEqual(12_000);
    });
  });
});
