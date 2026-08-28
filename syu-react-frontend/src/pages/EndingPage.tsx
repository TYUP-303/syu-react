// src/pages/EndingPage.tsx
// 최종 엔딩 메시지 (NRQ-0074).
//
// 원고를 챕터 단위로 나눠 한 화면씩 보여준다. 각 챕터는 시나리오 플레이의 배경
// 에셋을 장면으로 깔고, 그 위에 스크림과 흰 텍스트를 얹는 인스타 스토리 형식이다.
// 자동으로 넘어가되 화면 오른쪽을 탭하면 즉시 다음, 왼쪽 30%를 탭하면 이전이다.
//
// 연혁:
//   ~2026-08-06  55초 무한 스크롤 크레딧. 멈출 수도 되감을 수도 없었다.
//    2026-08-06  챕터 페이드 전환으로 교체 (김도영 학생 검토 의견)
//    2026-08-07  배경 장면 도입. 앱과 같은 회색 바탕이라 "끝났다"는 전환이
//                읽히지 않던 문제를 레이어(장면→스크림→텍스트)로 해결
//
// 원고는 constants/endingScript.ts가, 챕터 전환은 useEndingSequence가,
// 배경과 조판은 components/ending/*가 맡는다. 이 파일은 레이어를 조립한다.

import { useEffect } from 'react';
import EndingBackdrop from '../components/ending/EndingBackdrop';
import EndingChapterView from '../components/ending/EndingChapterView';
import EndingCredits from '../components/ending/EndingCredits';
import EndingStoryProgress from '../components/ending/EndingStoryProgress';
import { useEndingSequence } from '../components/ending/useEndingSequence';
import {
  CREDITS_CHAPTER_INDEX,
  ENDING_CHAPTERS,
  ENDING_CHAPTER_DURATIONS,
} from '../constants/endingScript';
import { useCharacterStore } from '../store/useCharacterStore';

interface EndingPageProps {
  onClose: () => void;
}

/** 화면 왼쪽 이 비율만큼이 "이전" 영역이다. 스토리 UI의 통상 관례를 따른다. */
const PREV_ZONE_WIDTH = '30%';

export default function EndingPage({ onClose }: EndingPageProps) {
  const { index, visible, reducedMotion, fadeInMs, fadeOutMs, goTo, next, prev } =
    useEndingSequence(ENDING_CHAPTER_DURATIONS);

  // 첫·마지막 챕터의 '내 방'은 성별 변형이 있는 배경이라, 시나리오 플레이에서
  // 보던 것과 같은 방이 나와야 한다. 캐릭터가 없으면 undefined가 넘어가고
  // backgroundUrl이 원본으로 떨어뜨린다.
  const gender = useCharacterStore((state) => state.character?.gender);

  const chapter = ENDING_CHAPTERS[index];
  const nextChapter = ENDING_CHAPTERS[index + 1];
  const isCredits = index === CREDITS_CHAPTER_INDEX;
  const fadeMs = visible ? fadeInMs : fadeOutMs;

  // 좌우 방향키로도 넘긴다. 화면 좌우 탭이 모바일 조작이라면 이쪽은 데스크톱
  // 조작이며, 상단 세그먼트 바에 포커스가 없어도 동작해야 하므로 window에 건다.
  // preventDefault는 방향키가 챕터 영역을 스크롤시키는 것을 막기 위한 것이다.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        next();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        prev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [next, prev]);

  return (
    // 화면 아무 곳이나 탭하면 다음 챕터. 왼쪽 영역만 아래에서 가로챈다.
    <div className="absolute inset-0 flex flex-col overflow-hidden" onClick={next}>
      <EndingBackdrop
        background={chapter.background}
        nextBackground={nextChapter?.background}
        gender={gender}
        visible={visible}
        fadeMs={fadeMs}
      />

      {/* 이전 영역 — 텍스트가 pointer-events-none이라 글자 위에서도 눌린다 */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          prev();
        }}
        className="absolute inset-y-0 left-0 z-10"
        style={{ width: PREV_ZONE_WIDTH }}
        aria-label="이전 장면"
      />

      {/* 상단 크롬 */}
      <div className="relative z-30 shrink-0">
        <EndingStoryProgress
          total={ENDING_CHAPTERS.length}
          current={index}
          durationMs={ENDING_CHAPTER_DURATIONS[index]}
          reducedMotion={reducedMotion}
          onSelect={goTo}
        />

        <div className="flex items-center justify-between px-4 pt-2">
          <div className="w-10 h-10" aria-hidden="true" />
          <p className="text-[13px] font-bold tracking-[0.25em] text-inverse-on-surface/60 font-headline">
            R E A C T
          </p>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            className="
              w-10 h-10 rounded-full
              bg-scrim-bg-30 hover:bg-scrim-bg-50
              flex items-center justify-center
              text-inverse-on-surface/80 hover:text-inverse-on-surface
              transition-colors duration-200
            "
            aria-label="닫기"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
      </div>

      {/* 챕터 — 탭을 가로막지 않도록 이벤트를 통과시킨다 */}
      <div className="relative z-20 flex-1 flex flex-col overflow-y-auto pointer-events-none">
        {/*
          이동은 등장에만 붙인다. visible 하나로 "퇴장 중"과 "등장 직전"을 함께
          표현하는 구조라, 두 상태에 같은 transform을 걸면 나가는 챕터와 들어오는
          챕터가 언제나 반대 방향으로 움직여 왕복처럼 보인다. 그래서 transition은
          opacity만 맡고, 떠오르는 움직임은 등장 시 keyframes로 한 번만 재생한다.
          (key가 챕터마다 바뀌어 노드가 새로 생기므로 매번 다시 재생된다.)
        */}
        <div
          key={chapter.id}
          className={`
            min-h-full flex flex-col transition-opacity ease-out
            ${visible ? 'opacity-100' : 'opacity-0'}
          `}
          style={{
            transitionDuration: `${fadeMs}ms`,
            animation:
              visible && !reducedMotion ? `endingChapterRise ${fadeInMs}ms ease-out` : undefined,
          }}
        >
          <EndingChapterView chapter={chapter}>
            {isCredits && <EndingCredits />}
          </EndingChapterView>
        </div>
      </div>

      {/* 하단 크롬 — 크레딧에서만 */}
      {isCredits && (
        <div className="relative z-30 shrink-0 px-8 pb-6">
          {/*
            공용 ui/Button 대신 이 화면 전용 버튼을 쓴다. 솔리드 파란 버튼은
            장면 위에 얹히면 배경과 단절되어 UI 조각처럼 튄다. 배경이 비쳐
            보이는 유리 질감이라야 마지막 장면의 여운을 끊지 않는다.
            엔딩에서만 쓰는 표현이므로 공용 컴포넌트에 variant를 늘리지 않았다.
          */}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            className="
              w-full py-3 rounded-control
              bg-inverse-on-surface/15 hover:bg-inverse-on-surface/25
              border border-inverse-on-surface/30
              backdrop-blur-md
              text-inverse-on-surface text-[18px] font-semibold font-headline
              transition-all duration-200 active:scale-95
            "
          >
            돌아가기
          </button>
        </div>
      )}

      <style>{`
        @keyframes endingChapterRise {
          from { transform: translateY(8px); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
