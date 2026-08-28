// src/components/scenario/player/PlayerTopBar.tsx
// 플레이어 상단 크롬 — 씬 세그먼트 바 · 회차 표시 · 회차 제목 · ✕.
//
// 무대 위에 얹히는 반투명 띠다. 배경 이미지가 그대로 비치는 자리라 글자 대비를
// 위해 옅은 표면과 blur를 함께 쓴다(엔딩 상단 크롬과 같은 방식).
//
// ⚠️ 여기의 버튼은 반드시 stopPropagation 한다. 루트가 "화면 아무 데나 탭 =
// 다음"을 받고 있어서, 막지 않으면 ✕를 누르는 순간 대사도 한 칸 넘어간다.
//
// 진행 표기는 "Episode N"을 유지한다. 영역 완주율(n/10) 병기는 자리만 열어 둔
// 상태다 — 표기 형식이 팀 확인 대기라(제안서 §2-B) 여기서 임의로 확정하지 않는다.
//
// 2026-08-26에 label 슬롯을 열었다. 에필로그는 회차 번호가 없는 11번째 카드라
// "Episode 11"이 사실과 다르고, 그렇다고 상단 바를 통째로 한 벌 더 만들면
// 씬 세그먼트·✕·표면 처리가 두 곳으로 갈린다. 기본 동작은 그대로다.

import PlayerSceneProgress from './PlayerSceneProgress';
import { COPY } from '../../../constants/copy';

interface PlayerTopBarProps {
  /** 회차 번호. label을 주면 화면에 쓰이지 않는다. */
  episodeNumber?: number;
  /** 진행 표기를 통째로 대신할 문구 (에필로그처럼 회차 번호가 없는 화면용). */
  label?: string;
  /** 이미 닉네임 치환을 마친 회차 제목 */
  title: string;
  sceneTotal: number;
  sceneCurrent: number;
  /** 대사 단계를 지났는가 — 지났으면 세그먼트가 모두 찬다 */
  scenesDone: boolean;
  onExit: () => void;
}

export default function PlayerTopBar({
  episodeNumber,
  label,
  title,
  sceneTotal,
  sceneCurrent,
  scenesDone,
  onExit,
}: PlayerTopBarProps) {
  return (
    <div className="relative z-30 shrink-0 w-full px-4 pt-3 pb-2.5 bg-surface/70 backdrop-blur-md border-b border-outline-variant/20">
      <PlayerSceneProgress total={sceneTotal} current={sceneCurrent} allFilled={scenesDone} />

      <div className="mt-2 flex justify-between items-center gap-3">
        <div className="min-w-0">
          <span className="text-[10px] font-bold text-primary tracking-wider uppercase font-headline">
            {label ?? `Episode ${episodeNumber}`}
          </span>
          <h3 className="text-[14px] font-bold text-on-surface truncate">{title}</h3>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onExit();
          }}
          className="
            w-8 h-8 rounded-full bg-surface-container/60 hover:bg-surface-container
            flex items-center justify-center border border-outline-variant/30 text-outline
            hover:text-on-surface transition-colors cursor-pointer shrink-0
          "
          aria-label={COPY.player.exitCloseLabel}
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>
    </div>
  );
}
