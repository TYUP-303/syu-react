// src/components/scenario/player/DialogueContent.tsx
// SITUATION 단계의 시트 내용 — 상황 프로즈 한 문단.
//
// 진행(스킵/다음)은 이 컴포넌트가 아니라 **루트의 화면 탭·방향키**가 받는다.
// 예전 DialogueBox는 자기 자신에 onClick을 달고 있어서 대사창 밖을 누르면
// 아무 일도 일어나지 않았다(제안서 §1 P4).
//
// ── 높이 예약 ────────────────────────────────────────────────────────
//
// 시트는 내용 높이만큼 자라므로, 대사 길이가 씬마다 다르면 넘길 때마다 시트가
// 위아래로 흔들린다. 검사 화면(TestExecutionSubPage)이 문항 높이에 쓴 예약
// 패턴을 그대로 가져와 최소 높이를 잡는다.
//
// 실측: scenario_dialogues.csv 480행의 TEXT 길이는 중앙값 78자 · p75 101자 ·
// p90 122자 · 최대 190자다. 430px 프레임에서 시트 안쪽 폭은 약 350px, 15px
// 본문이 줄당 22자 안팎이므로 중앙값이 3.5줄 · p75가 4.6줄이다. 5줄(120px)을
// 예약하면 씬 대부분이 같은 높이로 서고, 넘치는 회차만 시트 안에서 스크롤한다.
// 폭이 좁아지면 같은 글이 더 접히므로 412px 미만에서는 6줄(144px)로 올려 잡는다
// (Tailwind v4의 max-[N]은 width < N으로 컴파일된다).

import type { SceneData } from '../../../api/scenarioMockData';
import TypingText from '../TypingText';
import { usePersonalizedText } from '../usePersonalizedText';

interface DialogueContentProps {
  scene: SceneData | undefined;
  isTextSkipped: boolean;
  onTextComplete: () => void;
  /**
   * 극 안의 장면인가(기본), 극 밖 화자의 마무리인가.
   *
   * 'narration'은 에필로그 마지막 씬에만 온다. 같은 서식으로 이어 붙이면
   * 사용자가 그것도 장면으로 읽어서, 갑자기 화자가 바뀐 문장이 튄다
   * (scenarioEpilogueCsvParser의 KIND 절 참조). 무대는 그대로 두고 — 그 씬은
   * 인물 없이 배경만 서므로 무대가 저절로 조용해진다 — 시트 안에서만 가른다.
   */
  kind?: 'scene' | 'narration';
}

export default function DialogueContent({
  scene,
  isTextSkipped,
  onTextComplete,
  kind = 'scene',
}: DialogueContentProps) {
  // 상황 프로즈의 주인공은 사용자 캐릭터다 — 원문의 '백설'을 닉네임으로 바꿔
  // 타이핑에 넘긴다. TypingText는 받은 문자열을 그대로 찍으므로, 치환은 반드시
  // 여기(타이핑 입력)에서 끝나야 글자 수·스킵 동작이 어긋나지 않는다.
  const personalize = usePersonalizedText();

  const isNarration = kind === 'narration';

  return (
    // scene.type은 CSV의 SCENE_TYPE 열("공통 시나리오 - Scene 1")이다.
    // 콘텐츠 작성용 구분자일 뿐인데 대사 위 소제목으로 찍혀 있었다(2026-08-11 UAT).
    // 열과 파서는 그대로 두고 노출만 걷어냈다.
    <div className="min-h-[120px] max-[412px]:min-h-[144px]">
      {/* 예전에는 여기에 '— 맺음말 —' 표가 붙어 있었다. 2026-08-27 UAT R2-26에서
          걷어냈다 — 가운데·이탤릭 서식만으로 화자가 바뀐 것이 이미 읽히고,
          라벨은 마지막 장면 위에 설명 한 줄을 덧대는 군더더기였다. 서식 분기
          자체(isNarration)는 그대로 남는다. */}
      <div className={isNarration ? 'text-center italic' : undefined}>
        <TypingText
          text={personalize(scene?.text || '')}
          isSkipped={isTextSkipped}
          onComplete={onTextComplete}
        />
      </div>
    </div>
  );
}
