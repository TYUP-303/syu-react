import type { ThemeCategory, EpisodeData } from '../../api/scenarioMockData';
import type { ScenarioProgressMap } from '../../store/useScenarioStore';
import Button from '../ui/Button';
import ProgressBar from '../ui/ProgressBar';
import { useEffect, useRef, useState } from 'react';
import { usePersonalizedText } from './usePersonalizedText';
import { summarizeThemeProgress } from '../../utils/strategyStats';
import { isEpisodeUnlockedAt } from '../../utils/episodeUnlock';
import { buildEpisodeSummary } from '../../utils/episodeSummary';
import { themeColorsFor, type ThemeColorClasses } from '../../constants/themeColors';
import { COPY } from '../../constants/copy';

interface EpisodeListViewProps {
  themes: ThemeCategory[];
  themeId: string;
  progress: ScenarioProgressMap;
  onBack: () => void;
  onPlayEpisode: (episodeId: string) => void;
  /** 에필로그를 열 때. 없으면 카드가 서지 않는다(에필로그를 쓰지 않는 호출부 배려). */
  onPlayEpilogue?: () => void;
  /** 이 영역의 에필로그를 이미 봤는가 — 카드에 '봤어요' 배지를 붙일지만 정한다. */
  epilogueSeen?: boolean;
}

/**
 * 목록에서 에필로그가 선택됐음을 나타내는 표식.
 *
 * 에피소드 id와 같은 칸(selectedEpisodeId)을 쓰되 절대 겹치지 않는 값이어야
 * 한다 — 실제 id는 `${themeId}-ep${n}` 꼴이라 이 문자열과 부딪히지 않는다.
 * 선택 상태를 하나만 두는 이유는 "카드 하나를 고르고 아래 버튼으로 실행"이
 * 이 화면의 유일한 조작 문법이기 때문이다. 에필로그만 탭 즉시 실행으로
 * 두면 같은 목록 안에서 조작이 두 갈래가 된다.
 */
const EPILOGUE_SELECTION = '__epilogue__';

/**
 * 카드 펼침 애니메이션 길이(ms). CSS(duration-200)와 **같은 값이어야** 한다 —
 * 펼쳐진 카드를 보이는 자리로 옮기는 스크롤이 이 시간을 기다렸다 돈다.
 */
const EXPAND_MS = 200;

/**
 * 카드 한 장의 껍데기 클래스. 에피소드 카드와 에필로그 카드가 공유한다 —
 * 두 벌로 두면 한쪽만 손보게 되고, 그 순간 같은 목록 안에서 카드 두 종류가
 * 다른 두께·다른 배경으로 선다.
 *
 * `emphasized`는 해금된 에필로그 카드 하나만 쓴다. 목록 맨 위로 올라온 카드가
 * 아래 열 장과 같은 표면이면 "왜 여기 있는지"가 보이지 않아서, 완주 체크·완주율
 * 막대가 이미 쓰고 있는 **secondary 계열**로 한 톤만 올린다. 선택됐을 때는
 * 선택 표시(primary)가 이겨야 한다 — 강조는 자리 설명이고 선택은 조작 상태라,
 * 둘이 겹치면 지금 무엇을 고른 건지가 사라진다.
 */
function cardClassName(
  unlocked: boolean,
  selected: boolean,
  colors: ThemeColorClasses,
  emphasized = false
): string {
  return `
    w-full text-left p-4 rounded-pane border flex items-center justify-between transition-all duration-200
    scroll-mb-28
    ${!unlocked
      ? 'opacity-40 border-outline-variant/10 bg-surface-container-lowest/30 cursor-not-allowed'
      : selected
        // 선택 표시는 **영역 고유색**이다 (2026-08-27 R2-10) — 목록 안에서
        // "지금 어느 영역에 있는가"를 가장 오래 보는 자리가 이 테두리다.
        ? `${colors.selected} shadow-[0_0_15px_var(--color-primary-glow-15)]`
        : emphasized
          ? 'border-secondary/30 bg-secondary/10 hover:border-secondary/60 hover:bg-secondary/15 cursor-pointer'
          : 'border-outline-variant/20 bg-surface-container-lowest hover:border-outline-variant/60 hover:bg-surface-container-low cursor-pointer'
    }
  `;
}

export default function EpisodeListView({
  themes,
  themeId,
  progress,
  onBack,
  onPlayEpisode,
  onPlayEpilogue,
  epilogueSeen = false,
}: EpisodeListViewProps) {
  const theme = themes.find((t) => t.id === themeId);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  // 훅은 조기 반환(!theme)보다 위에 있어야 호출 순서가 흔들리지 않는다.
  const personalize = usePersonalizedText();

  // ── 펼쳐진 카드를 보이는 자리로 (R2-09) ──
  //
  // 목록 하단에는 '시나리오 플레이' 버튼이 sticky로 떠 있다. 아래쪽 카드를
  // 펼치면 늘어난 만큼이 그 버튼 뒤로 숨으므로, 펼침이 끝난 **뒤에** 스크롤을
  // 최소한으로 밀어 카드 전체가 보이게 한다(block: 'nearest' — 이미 보이면
  // 아무것도 하지 않는다). 애니메이션이 끝나기 전에 부르면 늘어나기 전 높이로
  // 계산해 여전히 가려진다.
  //
  // 카드에 걸린 `scroll-mb-28`이 짝이다. sticky 버튼은 스크롤포트 **안에**
  // 떠 있으므로 브라우저가 보기에는 카드가 이미 '보이는' 상태이고, 여백이
  // 없으면 nearest가 아무것도 하지 않는다(실측 — 마지막 줄이 버튼에 가린 채
  // 남았다). 버튼 블록 높이(≈100px)만큼 카드의 보이는 상자를 아래로 늘린다.
  const selectedCardRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const card = selectedCardRef.current;
    // jsdom에는 scrollIntoView가 없다 — 테스트에서 터지지 않게 있는지 본다.
    if (!card || typeof card.scrollIntoView !== 'function') return;
    const timer = window.setTimeout(
      () => card.scrollIntoView({ block: 'nearest' }),
      EXPAND_MS + 20
    );
    return () => window.clearTimeout(timer);
  }, [selectedEpisodeId]);

  if (!theme) return null;

  // 영역 고유색 (2026-08-27 R2-10)
  const colors = themeColorsFor(theme.id);

  // 영역 완주율 — 판정식은 utils/strategyStats 하나다. 앨범 진행도
  // (computeAlbumProgress)가 같은 summarizeThemeProgress를 쓰므로, 여기서
  // 자체 계산을 하면 "목록은 9/10인데 앨범은 완주"처럼 화면끼리 어긋난다.
  const themeProgress = summarizeThemeProgress(theme, progress);

  // 에피소드 해금 판정 — 식은 utils/episodeUnlock 하나다.
  // 딥링크(#scenario/<themeId>/<n>)가 이 목록을 거치지 않고 플레이어를 열 수
  // 있게 되면서 판정 자리가 둘이 됐다(2026-08-27 R2-06). 여기에 자체 계산을
  // 되살리면 "목록에서는 잠겨 있는데 주소로는 열리는" 어긋남이 생긴다.
  const isEpisodeUnlocked = (index: number) => isEpisodeUnlockedAt(theme, index, progress);

  /**
   * 카드 탭 — 고르거나, 이미 고른 카드면 **접는다** (2026-08-27 R2-09).
   *
   * 선택이 곧 펼침이라 토글이 없으면 한 번 펼친 카드를 접을 방법이 없다.
   * 잠긴 카드는 애초에 선택되지 않으므로 펼쳐지지도 않는다.
   */
  const handleEpisodeClick = (episode: EpisodeData, index: number) => {
    if (!isEpisodeUnlocked(index)) return;
    setSelectedEpisodeId((current) => (current === episode.id ? null : episode.id));
  };

  // 에필로그는 **그 영역 10편을 모두 완주해야** 열린다(영역별 해금). 판정은
  // 위 완주율과 같은 집계를 쓴다 — 화면 두 곳이 서로 다른 기준으로 "완주"를
  // 말하면 "10/10인데 잠겨 있다"가 나온다.
  const epilogue = theme.epilogue;
  const epilogueUnlocked = themeProgress.isComplete;
  const isEpilogueSelected = selectedEpisodeId === EPILOGUE_SELECTION;

  const handleEpilogueClick = () => {
    if (!epilogueUnlocked) return;
    // 에피소드 카드와 같은 조작 문법 — 다시 누르면 선택이 풀린다.
    setSelectedEpisodeId((current) =>
      current === EPILOGUE_SELECTION ? null : EPILOGUE_SELECTION
    );
  };

  const handlePlay = () => {
    if (!selectedEpisodeId) return;
    if (selectedEpisodeId === EPILOGUE_SELECTION) {
      // 잠금 판정을 실행 직전에 한 번 더 본다. 카드가 disabled라 여기까지
      // 오기 어렵지만, 선택을 남긴 채 진행도가 바뀌는 경로(디버그 토글·다른
      // 기기의 초기화)에서 잠긴 에필로그가 열리는 것을 막는다.
      if (!epilogueUnlocked) return;
      onPlayEpilogue?.();
      return;
    }
    onPlayEpisode(selectedEpisodeId);
  };

  // ── 에필로그 카드 (2026-08-26) ──────────────────────────────────
  //
  // 에피소드 카드와 같은 껍데기(cardClassName)를 쓰되 왼쪽 배지가 회차 숫자가
  // 아니라 아이콘이다 — 회차 번호가 없는 편이고, 숫자 '11'을 찍으면 열한 번째
  // 훈련처럼 읽힌다.
  //
  // 잠금 상태에서는 원고 제목을 감춘다. 아직 보지 않은 마무리 장면의 제목이
  // 목록에 미리 떠 있으면 그 자체가 스포일러다.
  //
  // **자리가 상태에 따라 바뀐다.** 잠겨 있는 동안은 맨 아래다 — 아직 열 수
  // 없는 카드가 첫 줄을 차지하면 지금 해야 할 1화가 아래로 밀린다. 열리고
  // 나면 맨 위로 올라온다: 열 편을 다 지난 사람에게 이 목록의 용건은 "다음 편
  // 고르기"가 아니라 "아직 안 본 마무리 보기"인데, 열한 번째 줄에 있으면 매번
  // 끝까지 스크롤해야 닿는다.
  //
  // 두 자리에 카드를 각각 적어 두지 않고 **하나를 만들어 옮긴다.** 두 벌이면
  // 한쪽만 손보게 되고, 무엇보다 조건을 잘못 쓴 날 같은 목록에 두 장이 선다.
  const epilogueCard = epilogue ? (
    <button
      onClick={handleEpilogueClick}
      disabled={!epilogueUnlocked}
      aria-label={epilogueUnlocked ? COPY.epilogue.cardOpenLabel : COPY.epilogue.cardLockedLabel}
      className={cardClassName(epilogueUnlocked, isEpilogueSelected, colors, epilogueUnlocked)}
    >
      <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-3">
        <div className={`
          w-8 h-8 rounded-full flex items-center justify-center shrink-0
          ${epilogueUnlocked
            ? 'bg-secondary/20 text-secondary border border-secondary/30'
            : 'bg-outline-variant/20 text-outline border border-outline-variant/20'
          }
        `}>
          <span className="material-symbols-outlined text-[18px]">
            {epilogueUnlocked ? 'auto_stories' : 'lock'}
          </span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[14px] font-bold truncate ${isEpilogueSelected ? 'text-primary' : 'text-on-surface'}`}>
              {epilogueUnlocked ? personalize(epilogue.title) : COPY.epilogue.lockedTitle}
            </span>
            <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-secondary/15 text-secondary text-[10px] font-bold">
              {COPY.epilogue.cardLabel}
            </span>
            {/* 본 표시는 에피소드 10편의 완료 아이콘과 같은 모양으로 — 목록 안에서
                상태 문법이 둘이면 사용자가 다른 뜻으로 읽는다(2026-08-26 검수). */}
            {epilogueUnlocked && epilogueSeen && (
              <span
                role="img"
                aria-label={COPY.epilogue.seenBadge}
                className="material-symbols-outlined text-secondary text-[16px] shrink-0"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                check_circle
              </span>
            )}
          </div>
          <p className="text-[11px] text-outline truncate mt-0.5">
            {epilogueUnlocked ? COPY.epilogue.topSubtitle : COPY.epilogue.lockedHint}
          </p>
        </div>
      </div>

      <div className="shrink-0">
        {!epilogueUnlocked ? (
          <span className="material-symbols-outlined text-outline-variant text-[20px]">
            lock
          </span>
        ) : (
          <span className={`
            material-symbols-outlined text-[20px] transition-transform duration-200
            ${isEpilogueSelected ? 'text-primary transform translate-x-0.5' : 'text-outline-variant'}
          `}>
            chevron_right
          </span>
        )}
      </div>
    </button>
  ) : null;

  return (
    <div className="w-full grow flex flex-col py-2 animate-fadeIn">
      {/* ── 상단 헤더 & 뒤로가기 버튼 — 스크롤러 최상단에 플러시로 sticky.
          -mx-6: 부모 main의 px-6을 상쇄해 프레임 폭까지 확장.
          -mt-8: 위쪽 여백(HomePage 래퍼 py-6 = 24px + 이 뷰의 py-2 = 8px)을
                 정확히 상쇄해 정적 위치를 스크롤포트 상단(0)에 맞춘다.
                 딱 맞게 상쇄해야 sticky 보정이 0이 되어, 스크롤 0에서
                 아래 콘텐츠와 겹치지도 위에 틈이 남지도 않는다. ── */}
      <div className="sticky top-0 -mx-6 -mt-8 px-6 py-4 bg-surface z-20 flex flex-col gap-2.5">
        {/* 페이드 엣지 — 헤더 아래로 목록이 지나갈 때 서서히 사라지게 하는
            스크롤 어포던스 (하단 CTA의 그라디언트와 대칭) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-full h-4 bg-gradient-to-b from-surface to-transparent"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="
              w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high
              flex items-center justify-center border border-outline-variant/30 text-outline
              hover:text-on-surface transition-colors cursor-pointer shrink-0
            "
            aria-label="뒤로가기"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          </button>
          {/* 영역 아이콘 — 2뎁스에서 "어느 영역인가"를 색으로 잡아 준다
              (2026-08-27 R2-10). 영역 목록 카드의 아이콘 칸과 같은 조합이라
              1뎁스에서 고른 색이 그대로 따라 들어온 것처럼 읽힌다. */}
          <div
            aria-hidden
            className={`w-8 h-8 rounded-control shrink-0 flex items-center justify-center border border-outline-variant/30 ${colors.container} ${colors.accent}`}
          >
            <span className="material-symbols-outlined text-[18px]">{theme.icon}</span>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-bold text-on-surface truncate font-headline">{theme.title}</h2>
            {/* 부제 자리에는 **이 영역의 설명**이 선다 (2026-08-27 UAT).
                1뎁스 카드에서 잘려 보이던 문장을 여기서 온전히 읽게 하려는
                것이고, 영역을 막 고른 참이라 "무엇을 훈련하는 영역인가"가
                조작 안내보다 알고 싶은 것이다. 설명이 비어 있을 때만 예전
                안내문으로 되돌아간다. line-clamp-2 — 설명이 길어져도
                말끝이 잘리지 않게 두 줄까지 허용한다. */}
            <p className="text-[11px] leading-[15px] text-outline line-clamp-2 font-body">
              {theme.description || COPY.episodeList.headerSubtitleFallback}
            </p>
          </div>
        </div>

        {/* ── 영역 완주율 (UAT 요청: "10개의 시나리오 수행하는 빈도 퍼센트, 위치는 상단") ──
            헤더가 sticky라 목록을 아무리 내려도 이 줄은 남는다. 색을 secondary로
            두는 것은 아래 목록의 '완주' 체크(bg-secondary/20 text-secondary)와
            같은 뜻을 같은 색으로 말하기 위한 것이다. */}
        <div className="flex items-center gap-2.5">
          <div className="flex-1 rounded-full overflow-hidden">
            <ProgressBar
              percent={themeProgress.percent}
              fillClassName={colors.accentFill}
              ariaLabel={COPY.episodeList.progressAriaLabel(themeProgress.percent)}
            />
          </div>
          <span className={`shrink-0 text-[11px] font-bold ${colors.accent} tabular-nums font-body`}>
            {COPY.episodeList.progressLabel(themeProgress.cleared, themeProgress.total)}
          </span>
        </div>
      </div>

      {/* ── 에피소드 리스트 (부모 main 스크롤 사용) ── */}
      <div className="flex flex-col gap-3 pt-1 pb-4">
        {/* 해금된 에필로그는 목록 맨 위에 선다 (위 epilogueCard 주석 참조). */}
        {epilogueUnlocked && epilogueCard}

        {theme.episodes.map((ep, idx) => {
          const unlocked = isEpisodeUnlocked(idx);
          const cleared = !!progress[ep.id]?.cleared;
          const isSelected = selectedEpisodeId === ep.id;
          // 줄거리 두 벌. 닉네임 치환을 **먼저** 하고 자른다 — 이름 길이가
          // 사람마다 달라 치환 뒤에 잘라야 잘리는 자리가 맞는다.
          const summary = buildEpisodeSummary(personalize(ep.summary));
          const isExpanded = isSelected && unlocked && !!summary.full;

          return (
            <button
              key={ep.id}
              ref={isSelected ? selectedCardRef : undefined}
              onClick={() => handleEpisodeClick(ep, idx)}
              disabled={!unlocked}
              // 잠긴 카드는 펼쳐지지 않으므로 펼침 상태 자체가 없다.
              aria-expanded={unlocked && summary.full ? isExpanded : undefined}
              className={cardClassName(unlocked, isSelected, colors)}
            >
              {/* 왼쪽 넘버링 및 텍스트 정보 */}
              <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-3">
                <div className={`
                  w-8 h-8 rounded-full flex items-center justify-center font-headline text-[13px] font-bold shrink-0
                  ${unlocked
                    ? `${colors.container} ${colors.accent} border border-outline-variant/30`
                    : 'bg-outline-variant/20 text-outline border border-outline-variant/20'
                  }
                `}>
                  {ep.episodeNumber}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[14px] font-bold truncate ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                      {personalize(ep.title)}
                    </span>
                    {cleared && (
                      <span className={`material-symbols-outlined ${colors.check} text-[16px] shrink-0`} style={{ fontVariationSettings: "'FILL' 1" }}>
                        check_circle
                      </span>
                    )}
                  </div>
                  {/* ── 줄거리 (2026-08-27 R2-08 · R2-09) ──
                      접혀 있을 때는 **첫 문장 한 줄**이다. 예전에는 스토어가
                      40자로 자르며 붙인 ' ...'를 CSS truncate가 다시 잘라
                      한 문장이 두 번 잘렸다. 자르는 자리를 문장 경계로 옮겨
                      온전한 문장만 보여주고, 온전하니 말줄임도 붙이지 않는다.

                      카드를 고르면 그 자리에서 첫 장면 내레이션 **전문**이
                      펼쳐진다. 상한도 말줄임도 없다(사용자 확정) — 목록에서
                      "이게 무슨 이야기인지"를 열어 보지 않고 가늠하려는
                      것이 이 화면의 용건이기 때문이다. */}
                  {!isExpanded && summary.preview && (
                    <p className="text-[11px] leading-[15px] text-outline truncate mt-0.5">
                      {summary.preview}
                    </p>
                  )}
                  {/* 펼침은 max-height로 애니메이션한다. 접힘/펼침 양쪽에서
                      같은 속도로 움직이고, motion-reduce에서는 즉시 바뀐다.
                      전문 노드는 접혀 있을 때도 DOM에 남겨 둔다 — 마운트와
                      동시에 높이를 바꾸면 전환이 걸리지 않는다. */}
                  <div
                    aria-hidden={!isExpanded}
                    className={`
                      overflow-hidden transition-[max-height] duration-200 ease-out
                      motion-reduce:transition-none
                      ${isExpanded ? 'max-h-[520px] mt-0.5' : 'max-h-0'}
                    `}
                  >
                    <p className="text-[11px] leading-[15px] text-outline whitespace-pre-line text-left">
                      {summary.full}
                    </p>
                  </div>
                </div>
              </div>

              {/* 오른쪽 잠금/상태 표시 */}
              <div className="shrink-0">
                {!unlocked ? (
                  <span className="material-symbols-outlined text-outline-variant text-[20px]">
                    lock
                  </span>
                ) : (
                  <span className={`
                    material-symbols-outlined text-[20px] transition-transform duration-200
                    ${isSelected ? 'text-primary transform translate-x-0.5' : 'text-outline-variant'}
                  `}>
                    chevron_right
                  </span>
                )}
              </div>
            </button>
          );
        })}


        {/* 잠겨 있는 동안에는 지금까지처럼 맨 아래다 (위 epilogueCard 주석 참조). */}
        {!epilogueUnlocked && epilogueCard}
      </div>

      {/* ── 플레이 버튼 — 스크롤러 최하단에 플러시로 sticky (NRQ-0058).
          -mb-8: 아래쪽 여백(이 뷰의 py-2 = 8px + HomePage 래퍼 py-6 = 24px)을
                 상쇄한다. 이 여백이 남아 있으면 스크롤 끝에서 버튼이
                 고정 위치를 벗어나 그만큼 위로 튀어(흔들려) 보인다. ── */}
      <div className="sticky bottom-0 -mx-6 -mb-8 px-6 z-20 pt-8 pb-4 bg-gradient-to-t from-surface via-surface/95 to-transparent pointer-events-none">
        <div className="pointer-events-auto w-full">
          <div className="border-t border-outline-variant/10 mb-2" />
          <Button
            variant="primary"
            onClick={handlePlay}
            disabled={!selectedEpisodeId}
            className="w-full py-3.5 font-bold rounded-control"
          >
            {isEpilogueSelected
              ? COPY.epilogue.listCta
              : selectedEpisodeId
                ? '시나리오 플레이'
                : '플레이할 에피소드를 선택해 주세요'}
          </Button>
        </div>
      </div>
    </div>
  );
}
