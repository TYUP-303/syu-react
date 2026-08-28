// src/components/ending/EndingChapterView.tsx
// 엔딩 챕터 한 장의 조판. 삽화 슬롯 · 소제목 · 문단으로 이루어진다.
//
// 페이드 전환은 상위(EndingPage)가 담당하고, 이 컴포넌트는 "한 화면에 무엇이
// 어떻게 놓이는가"만 책임진다. 크레딧처럼 조판이 다른 내용은 children으로 받는다.
//
// 텍스트는 어두운 배경 장면 위에 얹히므로 inverse-on-surface 계열을 쓴다.
// 배경 없이 이 컴포넌트만 띄우면 흰 글씨가 흰 바탕에 묻히므로,
// 반드시 EndingBackdrop과 함께 렌더할 것.

import type { ReactNode } from 'react';
import type { EndingChapter } from '../../constants/endingScript';

/**
 * 문단 크기. 본문 15px을 기준으로 large는 1.1배, headline은 챕터 제목과 같다.
 * max-w-[364px]가 15px 본문에 맞춰진 값이므로, 큰 문단은 줄이 접히지 않는지
 * 실기기에서 확인하고 쓸 것.
 */
const BLOCK_SCALE_CLASS = {
  body: 'text-[15px]',
  large: 'text-[16.5px]',
  headline: 'text-[24px]',
} as const;

interface EndingChapterViewProps {
  chapter: EndingChapter;
  /** 크레딧 등 문단 아래에 덧붙일 특수 조판 */
  children?: ReactNode;
}

export default function EndingChapterView({ chapter, children }: EndingChapterViewProps) {
  const { title, blocks, images } = chapter;
  const hasImages = images !== undefined && images.length > 0;

  // 아래 여백(pb-28)을 위(pt-10)보다 두 줄쯤 크게 두어 글이 화면 가운데보다
  // 살짝 위에 앉게 한다. 세로 정중앙에 맞추면 시각적으로는 처져 보인다.
  //
  // px-6 / max-w-[364px]는 원고의 줄바꿈을 지키기 위한 값이다. 이보다 좁히면
  // 가장 긴 줄("누군가의 말에 스스로를 탓했던 순간도 있었을지 모릅니다.")이
  // 접혀 저자가 의도한 호흡이 깨진다.
  // ⚠️ 본문 글자 크기를 올릴 때는 max-w도 같은 비율로 올릴 것. 430px 화면에서
  // px-6을 빼면 382px가 한계이므로, 여기가 폭을 늘릴 수 있는 사실상 상한이다.
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 pt-10 pb-28">
      {/* 삽화 슬롯 — 원고에 이미지가 배정되기 전까지는 렌더되지 않는다 */}
      {hasImages && (
        <div className="flex items-end justify-center gap-4 mb-8">
          {images.map((image) => (
            <img
              key={image.src}
              src={image.src}
              alt={image.alt}
              className={`object-contain ${images.length > 1 ? 'w-20 h-20' : 'w-40 h-40'}`}
            />
          ))}
        </div>
      )}

      {title && (
        <h2 className="text-[24px] font-extrabold text-inverse-on-surface font-headline mb-8 leading-snug">
          {title}
        </h2>
      )}

      {blocks.map((block, blockIndex) => {
        // 굵게 확대한 결론 문단은 앞 문단과 한 줄 더 띄워 따로 세운다.
        // 문단이 하나뿐인 장은 띄울 앞 문단이 없으므로 제외한다.
        const isClosing =
          blockIndex === blocks.length - 1 &&
          blocks.length > 1 &&
          block.emphasis === true &&
          block.scale !== undefined;

        return (
          <p
            key={block.text}
            className={`
              font-body leading-[2] mb-6 last:mb-0 whitespace-pre-line max-w-[364px]
              ${isClosing ? 'mt-6' : ''}
              ${BLOCK_SCALE_CLASS[block.scale ?? 'body']}
              ${block.emphasis ? 'font-bold text-inverse-on-surface' : 'text-inverse-on-surface/85'}
            `}
          >
            {block.lead && (
              <>
                <span className="font-normal text-inverse-on-surface/85">{block.lead}</span>
                {'\n'}
              </>
            )}
            {block.text}
          </p>
        );
      })}

      {children}
    </div>
  );
}
