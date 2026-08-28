// src/components/scenario/player/AngelBrowseContent.tsx
// ANGELS · ANGEL_DETAIL 단계의 시트 내용 — 요정 3인의 조언을 **한 화면에서** 훑는다.
//
// ── 전환 대신 탐색 (제안서 §1 P5 · §2-C) ─────────────────────────────
//
// 예전에는 [목록 → 상세 → 목록 → 상세 …]로 셋을 비교하려면 화면을 여섯 번
// 갈아야 했다. 게다가 무대의 요정 그림과 하단의 요정 이름 버튼이 같은 정보를
// 두 곳에 그렸다. 이제 하단 이름 버튼은 **칩**으로 흡수되고, 칩을 좌우로 오가면
// 시트 내용만 바뀐다 — 무대는 그대로 남아 어느 요정을 보고 있는지, 어디까지
// 읽었는지를 계속 보여 준다.
//
// 상태 머신(useEpisodePlayer)은 손대지 않았다. ANGEL_DETAIL step은 그대로
// 남아 있고, 다만 ANGELS와 **같은 무대·같은 시트 프레임**을 그리므로 사용자
// 눈에는 화면 전환이 아니라 시트 확장으로 보인다.
//
// "3인을 모두 읽어야 최종 선택"이라는 기존 규칙은 그대로다. 달라진 것은 그
// 규칙을 지키는 비용이다(전환 6번 → 칩 탭 2번).
//
// ── 들어서면 상세 레이아웃이 통째로 선다 (2026-08-26 사양 정정) ───────
//
// 그 뒤로도 **첫 한 걸음**이 남아 있었다. 요정 단계에 들어서면 요정 셋과 칩,
// 안내문만 뜨고 전략 제목·본문·최종 선택 버튼은 activeAngelKey가 채워질 때까지
// 아예 렌더되지 않았다 — 고르는 화면에 닿기 전에 "아무나 한 번 눌러 여는"
// 단계가 하나 더 있었던 셈이다.
//
// e99ab71은 그것을 **훅이 첫 요정을 자동으로 펼치는 것**으로 없앴는데, 고르지도
// 않은 조언이 미리 열려 있으니 이번엔 "무엇을 고르라는 화면인가"가 흐려졌다.
// 정정된 사양은 그 사이를 지난다: **레이아웃은 처음부터 전부 서 있고, 내용만
// 비어 있다.** 칩 셋 · 조언 자리 · 잠금 안내 · 잠긴 최종 선택 버튼이 진입 즉시
// 자리를 잡고, 조언 자리에는 안내문("각 요정을 눌러 …")이 들어간다.
//
// 그래서 안내문과 조언은 **같은 자리를 나눠 쓴다** — 둘 중 하나만 서고, 같은
// min-h를 공유한다. 머리글로 따로 빼지 않는 이유는 그러면 안내문과 잠금 안내가
// 같은 화면에서 두 번 말을 걸기 때문이다.

import Button from '../../ui/Button';
import SheetBackButton from './SheetBackButton';
import type { EpisodeData } from '../../../api/scenarioMockData';
import { fairyDisplayName } from '../../../api/diaryContent';
import { STRATEGY_KEYS, STRATEGY_META, type StrategyKey } from '../../../constants/strategy';
import { COPY } from '../../../constants/copy';
import { usePersonalizedText } from '../usePersonalizedText';

interface AngelBrowseContentProps {
  episode: EpisodeData;
  /**
   * 조언을 펼친 요정. **요정 단계는 null로 시작한다** — 그동안 조언 자리에는
   * 안내문이 서고 최종 선택 버튼은 잠긴 채다. 레이아웃 자체는 null이든 아니든
   * 똑같이 서므로 이 값이 바꾸는 것은 그 한 자리의 내용뿐이다.
   */
  activeAngelKey: StrategyKey | null;
  readAngels: Set<string>;
  onAngelClick: (key: StrategyKey) => void;
  onSelectStrategy: (key: StrategyKey) => void;
  /** 마지막 대사 장면으로 되돌아가기 (2026-08-27 R2-05). */
  onBackToScene: () => void;
}

export default function AngelBrowseContent({
  episode,
  activeAngelKey,
  readAngels,
  onAngelClick,
  onSelectStrategy,
  onBackToScene,
}: AngelBrowseContentProps) {
  // 조언 본문과 한 줄 요약은 scenario_angels.csv에서 온다(bf2e5b5 이후).
  // 원고가 주인공을 '백설'로 적으므로 화면에 닿기 직전 닉네임으로 갈아 끼운다.
  const personalize = usePersonalizedText();
  const allRead = readAngels.size === STRATEGY_KEYS.length;

  const activeAngel = activeAngelKey ? episode.angels[activeAngelKey] : null;
  const activeMeta = activeAngelKey ? STRATEGY_META[activeAngelKey] : null;

  // 한 줄 요약을 늘 띄우면 원고가 없는 회차에서 "수용 요정 / 수용의 전략 / 수용"
  // 처럼 같은 말이 세 번 겹친다. 기본값은 전략 축약 라벨과 **같은 문자열**이므로
  // (useScenarioStore.defaultAngels가 STRATEGY_META.shortLabel을 그대로 쓴다.
  // 둘이 어긋나면 constants/strategy.test.ts가 잡는다) 그 값과 다를 때만,
  // 즉 CSV의 *_TITLE로 원고가 채워진 회차에서만 이 줄을 띄운다.
  const strategyLine = activeAngel?.strategy.trim() ?? '';
  const hasCustomStrategyLine =
    activeMeta !== null && strategyLine !== '' && strategyLine !== activeMeta.shortLabel;

  return (
    <div className="w-full flex flex-col gap-3">
      {/* ── 장면으로 되돌아가기 (2026-08-27 R2-05) ──
          칩 위 **자기 행**에 선다. 평가 단계처럼 머리글에 겹쳐 세울 수도 있지만
          이 화면의 첫 행은 머리글이 아니라 칩 셋이라, 겹치면 375px에서 첫 칩과
          부딪힌다. 대신 아래 간격을 줄여(-mb-1) 한 행이 통째로 붙는 만큼
          시트가 자라는 것을 덜어 낸다. */}
      <SheetBackButton
        label={COPY.player.backToScene}
        ariaLabel={COPY.player.backToSceneAria}
        onClick={onBackToScene}
        className="self-start -mb-1"
      />

      {/* ── 요정 칩 ── 좌우 탐색 + 읽음 체크. 무대의 요정 그림과 같은 입구다. */}
      <div className="flex items-stretch gap-1.5">
        {STRATEGY_KEYS.map((key) => {
          const meta = STRATEGY_META[key];
          const isActive = key === activeAngelKey;
          const isRead = readAngels.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onAngelClick(key)}
              aria-pressed={isActive}
              // 보이는 글자는 이름 하나뿐이라 낭독으로는 무슨 전략인지 알 수
              // 없다 — 접근성 이름에만 전략명을 남긴다 (2026-08-27 R2-03).
              aria-label={COPY.player.angelChipSelect(
                fairyDisplayName(key, episode.angels[key].name),
                meta.shortLabel
              )}
              className={`
                flex-1 min-w-0 py-2 px-1 rounded-control border text-[12px] font-bold
                flex items-center justify-center gap-0.5 transition-all duration-200 cursor-pointer
                ${isActive
                  ? `${meta.bg} ${meta.border} ${meta.text}`
                  : 'bg-surface-container border-outline-variant/40 text-on-surface-variant hover:border-outline'
                }
              `}
            >
              {/* ── 칩은 이름만 든다 (2026-08-27 2차 UAT R2-03) ──
                  예전에는 보고서·회복일기와 같은 "아코(수용)" 표기였다. 그 두
                  화면에서는 전략명이 그 자리에만 있어서 괄호가 필요하지만, 이
                  화면에는 바로 아래 제목이 이미 전략 분류명("수용 전략")을
                  말하고 있어 같은 낱말이 한 화면에서 두 번 나왔다. 게다가 360px
                  폭에서는 세 칩이 "포코(재평…"으로 잘려 이름조차 온전히 보이지
                  않았다. 전략명은 제목에 맡기고 여기서는 이름만 세운다. */}
              <span className="truncate">{fairyDisplayName(key, episode.angels[key].name)}</span>
              {isRead && (
                <span
                  role="img"
                  aria-label={COPY.player.angelReadMark}
                  className="material-symbols-outlined text-[14px] shrink-0"
                >
                  check_small
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── 조언 자리 ── 안내문과 조언이 **번갈아** 드는 한 자리다.
          min-h 예약은 칩을 오갈 때 시트가 위아래로 뛰지 않게 하려는 것이고,
          같은 이유로 안내문 쪽도 같은 값을 든다. scenario_angels.csv의 *_DETAIL은
          최대 135자(약 6줄)이고 중앙값 회차는 원고가 비어 기본 문구로
          떨어지므로, 4줄(88px)을 바닥으로 잡았다.

          아래 블록은 activeAngelKey가 비어 있어도 **통째로 선다** — 잠금 안내와
          최종 선택 버튼까지 진입 즉시 자리를 잡는 것이 정정된 사양이다
          (2026-08-26). 예전에는 이 전체가 조건부라 누르기 전에는 칩만 있었다. */}
      <div className="flex flex-col gap-3">
        {activeAngel && activeAngelKey && activeMeta ? (
          <>
            <div className="space-y-1">
              <h4 className="text-[17px] font-bold text-on-surface">
                {/* 제목은 **전략 분류명**이다 — 이름은 칩이 말한다 (R2-03).
                    인자가 요정 이름에서 전략 축약 라벨로 바뀐 자리이므로,
                    CSV의 name이 아니라 STRATEGY_META를 본다. */}
                {COPY.player.strategyTitle(activeMeta.shortLabel)}
              </h4>
              {hasCustomStrategyLine && (
                <p className={`text-[13px] font-bold ${activeMeta.text}`}>
                  {personalize(strategyLine)}
                </p>
              )}
            </div>

            <p className="text-[14px] text-on-surface leading-relaxed font-medium min-h-[88px]">
              {personalize(activeAngel.detail)}
            </p>
          </>
        ) : (
          <div className="min-h-[88px] flex items-center justify-center">
            {/* 세로 중앙 정렬은 이 상자가 맡는다. <p> 자체를 flex로 만들면
                안의 텍스트 조각·<br>·<strong>이 각각 flex 아이템이 되어 가로로
                늘어선다(2026-08-26 프리뷰 실측 — "각 요정을 눌러"가 옆 칸에 섰다). */}
            <p className="text-center text-[13px] text-on-surface leading-relaxed">
              {COPY.player.angelSelectNotice}
            </p>
          </div>
        )}

        {/* 최종 선택이 잠긴 이유는 버튼 밖 안내로 뺀다. 버튼 라벨로 넣으면
            좁은 화면에서 두 줄로 접힌다(2026-08-13). 라벨은 동작명 하나로
            고정되므로 잠금 여부가 버튼 크기를 흔들지도 않는다.

            ⚠️ 이 줄은 조건부로 **지우지 않는다** (2026-08-18 검수). 셋째 요정을
            읽는 순간 안내가 사라지면 그만큼(한 줄 + gap-3) 시트가 줄어들며
            박스가 들썩였다. 자리는 늘 예약하고 내용만 비운다 — 빈 문자열은
            줄 상자를 만들지 못하므로 같은 글꼴의 nbsp 한 칸을 세워
            높이를 정확히 맞춘다. */}
        <p
          aria-hidden={allRead || undefined}
          className={`text-center text-[12px] font-medium ${
            allRead ? 'invisible' : 'text-outline'
          }`}
        >
          {allRead ? '\u00A0' : COPY.player.readAllFirst}
        </p>
        {/* 아직 아무도 누르지 않았으면 고를 대상 자체가 없다 — 잠금 규칙(3인
            열람)과 같은 이유로 잠기고, 눌러도 넘길 키가 없으므로 핸들러도
            비운다. 실플레이에서는 3인을 다 읽으면 activeAngelKey가 반드시
            차 있으므로 이 조건이 단독으로 걸리는 순간은 없다. */}
        <Button
          variant="primary"
          disabled={!allRead || !activeAngelKey}
          onClick={() => activeAngelKey && onSelectStrategy(activeAngelKey)}
          className="w-full py-3 text-[15px] font-semibold"
        >
          {COPY.player.selectFinal}
        </Button>
      </div>
    </div>
  );
}
