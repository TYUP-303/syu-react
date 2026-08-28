// src/constants/endingScript.ts
// 최종 엔딩 메시지 원고의 단일 출처 (NRQ-0074).
//
// 원문은 심리학부 김도영 학생이 작성하고, 여명이·황현 선생님의 검토 의견이
// 반영된 2026-07-29 최종본이다. 검토 회차마다 문구가 바뀔 수 있으므로
// 연출 코드(EndingPage / components/ending/)와 분리해 둔다.
// ⚠️ 문구는 전문가가 단어 단위로 다듬은 결과물이다. 줄바꿈 위치까지 원고를
// 그대로 옮긴 것이므로, 기획팀 합의 없이 임의로 고치거나 줄이지 말 것.
//
// 원고 대비 유일한 변경점은 요정 호칭이다. 원고의 "수용요정 / 평가요정 /
// 초점요정"은 확정된 캐릭터 이름(아코 / 포코 / 리프)이 정해지기 전 표기로,
// 여명이·황현 선생님이 검토에서 "요정 이름 확인해서 변경"을 요청했다.
// "수용의 아코"처럼 전략명을 병기해, 플레이 중 익힌 이름과 분석 탭에서
// 쓰는 전략 용어를 엔딩에서 한 번 이어 준다. 이름의 출처는 strategy.ts.

/** 챕터에 곁들일 삽화. 도영 학생 이미지가 도착하면 이 필드만 채우면 된다. */
export interface EndingImage {
  /** public/ending/ 아래 경로 */
  src: string;
  alt: string;
}

/**
 * 챕터의 배경 장면. 시나리오 플레이에 쓰는 배경 에셋을 그대로 재사용한다.
 *
 * ⚠️ 배경은 전부 16:9 가로 이미지(약 1376×768)인데 엔딩은 세로 화면(430×932)이다.
 * cover로 채우면 이미지 폭이 약 1669px로 확대되어 **가로의 26%만 보인다.**
 * 그래서 focusX는 "배경을 어디에 맞출까"가 아니라 "무엇을 보여줄까"를 정한다.
 * 값을 바꿀 때는 반드시 실기기에서 무엇이 잘려 나가는지 확인할 것.
 */
export interface EndingBackground {
  /**
   * public/scenario/backgrounds/ 아래 **파일명만** — 경로도 확장자 변환도
   * 캐시 버전도 여기 붙이지 않는다. 시나리오 CSV의 bg 값과 같은 형식이며,
   * 실제 URL은 소비처(components/ending/EndingBackdrop)가 플레이어와 같은
   * `backgroundUrl()`로 만든다.
   *
   * 예전에는 이 필드가 `/scenario/backgrounds/*.png` 완성 URL이었다. 그래서
   * 엔딩만 WebP 업스케일본과 캐시 버스터를 못 타고 원본 PNG를 그대로 받고
   * 있었다(2026-08-18 발견). URL 조립을 한 자리에 모아 두면 같은 누락이
   * 다시 생기지 않는다 — 여기에 경로를 적고 싶어지면 그 신호다.
   */
  file: string;
  /** 가로 크롭 중심(%). 0=왼쪽 끝, 50=가운데, 100=오른쪽 끝. */
  focusX: number;
  /** 무엇이 보이는지 — 값의 근거를 남겨 다음 사람이 함부로 못 바꾸게 한다. */
  note: string;
}

/** 한 문단. 내부의 '\n'은 화면에서 그대로 줄바꿈된다. */
export interface EndingBlock {
  /**
   * 문단 첫 줄에 놓이는 도입 구절("수용의 아코와 함께").
   * 뒤따르는 text를 이끄는 역할이라 **본문보다 가볍게** 둔다 — 무게는 뒤에
   * 오는 내용이 가져간다. 문단을 둘로 쪼개면 그 사이에 문단 간격이 생겨 한
   * 호흡이 끊기므로, 같은 문단 안에서 처리한다.
   */
  lead?: string;
  text: string;
  /**
   * 문단 전체를 굵게. 크기는 scale이 따로 정한다.
   * 원고에서 힘이 실리는 대목(반전·결론·당부)에만 쓴다.
   */
  emphasis?: boolean;
  /**
   * 본문(15px)보다 크게 세울 때.
   *   large    — 본문의 1.1배. 챕터의 결론 문단에 쓴다.
   *   headline — 챕터 제목과 같은 크기. 문단 하나가 곧 그 장인 경우에만.
   */
  scale?: 'large' | 'headline';
}

export interface EndingChapter {
  /** 진행 인디케이터 key이자 디버깅용 식별자 */
  id: string;
  /** 원고에 소제목이 있는 챕터만 갖는다. 없는 챕터에 임의로 만들지 말 것. */
  title?: string;
  /** 문단 단위. 줄바꿈 위치는 화면 폭에 맞춰 조정한 것이며 문구는 원고 그대로다. */
  blocks: EndingBlock[];
  /** 비어 있으면 렌더하지 않는다. 여러 장이면 가로로 나란히 놓인다. */
  images?: EndingImage[];
  /** 챕터 뒤에 깔리는 장면. 모든 챕터가 갖는다. */
  background: EndingBackground;
}

export const ENDING_CHAPTERS: readonly EndingChapter[] = [
  {
    id: 'welcome',
    title: '여기까지 온 당신에게',
    blocks: [
      { text: '해야 할 일을 시작하기 어려웠던 순간,\n실수에 마음이 무거워졌던 순간,\n누군가의 말에 스스로를 탓했던\n순간도 있었을지 모릅니다.' },
      { text: '그럼에도 당신은 포기하지 않고,\n이 여정을 끝까지 걸어왔습니다.' },
      { text: '여기까지 함께해주신 당신에게\n먼저 수고했다는 말을 전하고 싶습니다.' },
    ],
    // 마지막 챕터와 같은 방이다. 책상(18)에서 시작해 침대와 창(78)으로 끝나
    // 같은 공간 안에서 시선이 옮겨간 것처럼 읽힌다.
    background: { file: 'my_room.png', focusX: 18, note: '스탠드 켜진 책상과 노트북' },
  },
  {
    id: 'scenes',
    title: '우리가 함께 지나온 장면들',
    blocks: [
      { text: '직장에서 실수하고 마음이 무거워졌던 순간,\n취업을 준비하며 스스로를 의심했던 순간,\n소중한 사람과의 갈등으로 마음이 복잡했던 순간,\n반복되는 일상 속에서 쉽게 지쳤던 순간.' },
      { text: '이번 훈련에서 마주한 장면들은\n특별한 누군가의 이야기가 아니라,\n우리가 살아가며 경험할 수 있는\n평범한 하루였습니다.' },
    ],
    background: { file: 'office.png', focusX: 62, note: '창가 모니터 책상 — 직장 영역' },
  },
  {
    // 원고에 소제목이 없는 챕터. 여명이 선생님 검토에서 기존 소제목
    // "당신은 이미 연습했습니다"가 삭제되었으므로 비워 둔다.
    id: 'fairies',
    blocks: [
      // 요정을 부르는 첫 줄은 도입으로 가볍게 두고, 무게는 전략 설명이 가져간다.
      { lead: '수용의 아코와 함께', text: '지금 느끼는 감정을 있는 그대로 받아들이는 것.', emphasis: true },
      { lead: '재평가의 포코와 함께', text: '생각에서 한 걸음 물러나 다시 바라보는 것.', emphasis: true },
      { lead: '재초점의 리프와 함께', text: '지금 내가 할 수 있는 한 가지에 집중하는 것.', emphasis: true },
      // 세 전략을 받아 맺는 결론.
      {
        text: '완벽하게 해내는 것이 아니라,\n잠시 멈추고 시작하는 방법을\n당신은 이미 여러 번 연습했습니다.',
        emphasis: true,
        scale: 'large',
      },
    ],
    // 요정은 플레이 중 각 씬 배경에 등장할 뿐 지정된 장소가 없다. 요정이
    // 나타났을 법한 스트레스 현장 중 하나를 골랐다. 왼쪽 화이트보드와 중앙
    // 스크린은 흰 면이라 글자가 묻히므로 어두운 유리벽 쪽(78)을 쓴다.
    background: { file: 'meeting_room.png', focusX: 78, note: '유리벽 너머 사무실이 비치는 회의실' },
  },
  {
    id: 'setbacks',
    blocks: [
      { text: '힘든 순간이 찾아오더라도\n계획대로 되지 않는 날이 있을 것입니다.' },
      { text: '실수를 반복하거나 감정에 휩쓸리는\n순간도 있을 것입니다.' },
      // 앞의 두 문단을 뒤집는 반전이라 여기서 힘을 준다.
      {
        text: '하지만 그런 순간이 찾아온다고 해서\n당신이 다시 처음으로 돌아간 것은 아닙니다.',
        emphasis: true,
        scale: 'large',
      },
    ],
    background: { file: 'street_night.png', focusX: 50, note: '소실점으로 빠지는 텅 빈 밤거리' },
  },
  {
    // 여명이 선생님의 "추가 제안 1"로 원고에 통째로 들어온 문단.
    // 반복되는 어려움을 개인의 의지 문제로 돌리지 않고 전문적 지원으로
    // 연결하는 대목이라, 분량을 이유로 잘라내면 안 된다.
    id: 'support',
    blocks: [
      { text: '잠시 멈춘 후 감정을 알아차리고,\n생각을 다시 바라보고,\n지금 할 수 있는 한 가지를 선택해 보세요.' },
      { text: '그럼에도 같은 어려움이 반복된다면\n혼자 해결하려 하기보다\n주변의 도움이나 전문적인 지원을 활용해 보세요.' },
      // 반복되는 어려움을 개인의 의지 탓으로 돌리지 않는다는, 이 챕터에서
      // 가장 중요한 메시지다.
      {
        text: '반복되는 어려움은\n의지가 부족해서가 아니라,\n나에게 맞는 다른 전략과 지원이 필요하다는\n하나의 신호일 수 있습니다.',
        emphasis: true,
        scale: 'large',
      },
    ],
    background: { file: 'cafe.png', focusX: 20, note: '창가 2인 테이블 — 마주 앉는 자리' },
  },
  {
    // 앞 두 챕터의 결론에 해당하는 한 문단. 단독으로 세워 여운을 준다.
    id: 'practice',
    blocks: [
      // 문단 하나가 곧 이 장 전체이므로 제목 크기로 세운다.
      {
        text: '오늘까지의 연습은\n앞으로의 당신을 다시 일으켜줄\n작은 힘이 될 것입니다.',
        emphasis: true,
        scale: 'headline',
      },
    ],
    background: { file: 'library.png', focusX: 45, note: '스탠드 불빛이 늘어선 열람실' },
  },
  {
    id: 'imperfect',
    title: '완벽하지 않아도 괜찮습니다',
    blocks: [
      { text: '회복은 한 번도 무너지지 않는 것이 아니라,\n무너진 뒤에도 다시 돌아오는 과정입니다.' },
      { text: '빠르게 나아가지 않아도 괜찮습니다.\n잠시 쉬어가도 괜찮습니다.' },
      { text: '오늘보다 조금 더 자신을 이해하고,\n다시 한 걸음을 내딛는 것.' },
      { text: '그것만으로도 당신은\n충분히 잘하고 있습니다.', emphasis: true, scale: 'large' },
    ],
    // 5장과 같은 카페를 반대편에서 본다. 5장이 "도움을 청하러 마주 앉는
    // 창가"라면 여기는 그 자리에서 고개를 돌렸을 때 보이는 따뜻한 안쪽이다.
    background: { file: 'cafe.png', focusX: 75, note: '조명이 걸린 카운터와 베이커리 진열대' },
  },
  {
    // 황현 선생님 제안대로 마무리 인사를 크레딧보다 앞(= 챕터 제목)에 둔다.
    // "수고하셨습니다"를 "고생 많으셨습니다"로 바꾼 것은 여명이 선생님 제안이다.
    id: 'credits',
    title: '오늘도 정말 고생 많으셨습니다',
    blocks: [],
    // 첫 챕터와 같은 방. 책상에서 시작해 창밖 야경으로 닫는다.
    background: { file: 'my_room.png', focusX: 78, note: '침대와 야경이 보이는 창문' },
  },
] as const;

/** 크레딧 챕터의 인덱스 — 마지막 챕터이며 자동 진행이 멈추는 지점. */
export const CREDITS_CHAPTER_INDEX = ENDING_CHAPTERS.length - 1;

/** 크레딧 본문. 라벨 + 여러 줄 구조라 일반 문단과 조판이 다르다. */
export const ENDING_CREDIT_SECTIONS: readonly { label: string; lines: string[] }[] = [
  {
    // 2026-08-28: '심리학부 REACT 팀' 한 줄에서 실명으로. 학과명은 팀원 자기소개
    // 기준(상담심리학과), 순서는 공개 저장소 README와 같다. 역할·소속 상세는
    // README 「만든 사람들」이 정본이고 여기는 이름만 싣는다.
    label: '기획 · 콘텐츠 · 디자인',
    lines: ['삼육대학교 상담심리학과 SYU-REACT 연구팀', '여명이 · 황현 · 김영원 · 김도영 · 조세현'],
  },
  {
    label: '개발',
    lines: ['김태엽 (TYUP Studio)'],
  },
  {
    label: '과학적 자문',
    lines: [
      'WHO 성인 ADHD 자가 보고 척도 (ASRS v1.1)',
      '인지적 감정 조절 전략 척도 (CERQ)',
    ],
  },
] as const;

export const ENDING_THANKS = '이 서비스를 사용해 주신\n모든 사용자 여러분께\n진심으로 감사드립니다.';

// 이모지를 붙이지 않는다 (2026-08-08 사용자 확정) — 엔딩 내레이션의
// 차분한 어조와 맞지 않고, 마스코트도 아닌 그림이라 의미가 없었다.
export const ENDING_FAREWELL = '앞으로의 하루도\nREACT가 함께 응원하겠습니다.';

// ── 자동 진행 타이밍 ─────────────────────────────────────────
// 챕터마다 분량이 크게 달라(한 문단 ~ 네 문단) 고정 간격을 쓰면 짧은 챕터가
// 지루하게 머물거나 긴 챕터가 다 읽기 전에 넘어간다. 글자 수에 비례시키되
// 양쪽 끝을 clamp 한다.

/** 챕터 진입 직후의 최소 체류 시간 (페이드 인을 감상할 여유) */
const BASE_MS = 3_500;
/** 공백을 제외한 글자당 추가 시간 — 한글 기준 편안한 묵독 속도 */
const PER_CHAR_MS = 85;
/** 아무리 긴 챕터라도 이 이상 머무르지 않는다 (탭으로 넘길 수 있으므로) */
const MAX_MS = 12_000;

/**
 * 챕터가 화면에 머무는 시간(ms).
 * 제목과 본문의 공백 제외 글자 수를 세어 계산한다.
 */
export function getChapterDurationMs(chapter: Pick<EndingChapter, 'title' | 'blocks'>): number {
  // lead도 화면에 나오는 글자이므로 함께 센다. 빠뜨리면 요정 챕터처럼
  // lead 비중이 큰 장이 실제 읽는 시간보다 짧게 잡힌다.
  const text =
    (chapter.title ?? '') +
    chapter.blocks.map((block) => (block.lead ?? '') + block.text).join('');
  const charCount = text.replace(/\s/g, '').length;
  return Math.min(MAX_MS, BASE_MS + charCount * PER_CHAR_MS);
}

/**
 * 챕터별 체류 시간을 미리 계산한 배열.
 * 렌더마다 새 배열이 생기면 자동 진행 타이머가 리셋되므로 모듈 상수로 고정한다.
 */
export const ENDING_CHAPTER_DURATIONS: readonly number[] =
  ENDING_CHAPTERS.map(getChapterDurationMs);
