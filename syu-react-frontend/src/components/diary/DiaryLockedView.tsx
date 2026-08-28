// src/components/diary/DiaryLockedView.tsx
// 회복일기 잠금 화면 (시안 07·10) — 완주한 에피소드가 하나도 없을 때.
//
// 진행 중 열람이 완화되면서 "한 영역 10회 완주"는 더 이상 열람 조건이
// 아니다. 그래서 시안의 "10회를 완료하면 볼 수 있어요" 문구 대신
// **첫 에피소드 완료**를 기준으로 옮겼다 — 기록이 0건일 때만 보여 줄
// 것이 없기 때문이다.
//
// 안내문에 영역 이름을 넣지 않는다. 예전에는 "가장 많이 진행한 영역"을
// 받아 문구에 끼워 넣었는데, 이 화면은 **완주 기록이 0건일 때만** 뜨므로
// 진행 중인 영역이 있을 수 없었다. 결국 호출부의 폴백(첫 영역)이 늘 이겨
// 누구에게나 "직장 영역의…"라고 말하고 있었다 — 빈 값을 그럴듯한 기본값으로
// 채우면 화면이 사실이 아닌 말을 한다.
//
// ── CTA 상태 분기 (2026-08-08 확정) ──
// 기록이 0건인 이유는 셋 중 하나다: 캐릭터가 없거나, 검사를 안 마쳤거나,
// 준비는 끝났는데 아직 안 한 것. 어느 경우든 "시나리오 시작하기"만 보여
// 주면 앞의 두 상태에서는 버튼을 눌러도 시나리오 탭의 게이트에 다시
// 막힌다(막다른 길). 막힌 이유를 말하고, 그 이유를 푸는 곳으로 보낸다.
//
// ── UI 통일 (UAT 2026-08-18) ──
// 이 컴포넌트는 이제 화면을 직접 그리지 않고 `common/GateNoticeCard`에
// 위임한다. 같은 상태("아직 캐릭터가 없어요")가 시나리오 탭에서는
// bento-card + person_add로, 여기서는 원형 판 + lock으로 떠서 탭을 옮길
// 때마다 다른 앱처럼 읽혔기 때문이다. 이 파일이 남아서 하는 일은
// **게이트 → 문구·아이콘·목적지 매핑** 하나다.
//
// 문구는 시나리오 게이트(COPY.scenario.gate*)와 한 벌로 관리하되 **본문은
// 탭별로 갈린다** — 예전에는 검사 미완 화면이 gateLockedBody(시나리오 훈련
// 설명)를 그대로 빌려 써서, 회복일기를 열려던 사용자가 남의 화면 설명을
// 읽고 있었다.

import GateNoticeCard from '../common/GateNoticeCard';
import { COPY } from '../../constants/copy';

/** 회복일기가 잠긴 이유. 상위 게이트부터 순서대로 판정한다. */
export type DiaryLockedGate = 'no-character' | 'test-incomplete' | 'ready';

interface DiaryLockedViewProps {
  /** 기본값은 'ready' — 게이트를 모르는 호출부는 기존 동작을 그대로 얻는다 */
  gate?: DiaryLockedGate;
  /** 시나리오 탭으로 (준비가 끝난 경우) */
  onGoScenario: () => void;
  /** 캐릭터 생성 페이지로 */
  onGoCreateCharacter?: () => void;
  /** 홈 탭으로 (검사 동선의 출발점) */
  onGoHome?: () => void;
}

export default function DiaryLockedView({
  gate = 'ready',
  onGoScenario,
  onGoCreateCharacter,
  onGoHome,
}: DiaryLockedViewProps) {
  // 라우팅 콜백이 없는 호출부(테스트·구버전)에서는 기존 동선으로 떨어진다 —
  // 상태를 말해 주지 못할 뿐 버튼이 죽지는 않게 한다.
  const view =
    gate === 'no-character' && onGoCreateCharacter
      ? {
          title: COPY.scenario.gateNoCharTitle,
          body: COPY.scenario.gateNoCharBodyDiary,
          cta: COPY.scenario.gateNoCharCta,
          icon: 'person_add',
          onClick: onGoCreateCharacter,
        }
      : gate === 'test-incomplete' && onGoHome
        ? {
            title: COPY.scenario.gateTestTitle,
            body: COPY.scenario.gateTestBody,
            cta: COPY.scenario.gateTestCta,
            icon: 'psychology',
            onClick: onGoHome,
          }
        : {
            title: COPY.scenario.gateNoRecordTitle,
            body: COPY.scenario.gateNoRecordBody,
            cta: COPY.scenario.gateNoRecordCta,
            icon: 'auto_stories',
            onClick: onGoScenario,
          };

  return (
    <GateNoticeCard
      icon={view.icon}
      title={view.title}
      body={view.body}
      ctaLabel={view.cta}
      onCtaClick={view.onClick}
    />
  );
}
