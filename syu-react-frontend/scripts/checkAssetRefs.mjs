// scripts/checkAssetRefs.mjs
// 시나리오 이미지 에셋 참조 ↔ 실제 파일 양방향 대조.
//
// 사용법:
//   node scripts/checkAssetRefs.mjs            # 결손만 실패로 취급 (배포 전 점검용)
//   node scripts/checkAssetRefs.mjs --strict   # 폴백으로 가려진 갭도 실패로 취급
//
// 종료 코드
//   0 = 결손 없음 / 1 = 참조되는데 파일이 없음(화면에 깨진 이미지)
//   --strict를 주면 "코드가 의도적으로 가린 갭"(표정 클램프, 의상 폴백)도 1로 올린다.
//   기본값에서 이 둘을 실패로 세지 않는 이유는, 화면은 멀쩡히 뜨는데 배포가 막히면
//   점검 스크립트가 CI에서 곧 무시되기 때문이다. 대신 항상 경고로 출력한다.
//
// ⚠️ 전제 — 이 스크립트는 **로컬 CSV**(src/assets/data/scenario_visual.csv)를 기준으로 본다.
//   프로덕션은 Firestore `scenarios/{visual|dialogue}` 문서의 csvText가 우선하므로,
//   두 CSV가 어긋나 있으면 이 감사 결과도 어긋난다. 2026-08-13 `check_csv_sync.py`
//   실행에서 visual·dialogue 모두 로컬과 DB가 일치함을 확인했기 때문에 로컬 기준
//   감사가 유효하다. 어드민에서 CSV를 업로드한 뒤에는 동기화를 다시 확인할 것.
//
// ⚠️ 파일명 해석 규칙은 이 파일이 새로 정하지 않는다. 성별 변형(`_m`/`_f`)·의상
//   치환·표정 클램프·연인 치환·배경 WebP 업스케일은 전부
//   src/components/scenario/player/assetUrls.ts의 규칙이며, 여기서는 그 파일에서
//   상수를 **추출해** 같은 로직을 재현한다. .ts를 직접 import할 수 없어(확장자 없는
//   상대 임포트 체인) 로직만 미러링하지만, 값은 원본에서 읽으므로 assetUrls.ts의
//   목록이 바뀌면(예: WEBP_BACKGROUNDS에 새 배경 추가) 이 스크립트도 따라간다.
//   상수 추출에 실패하면 조용히 틀린 답을 내지 않고 즉시 죽는다.
//
// ⚠️ 캐시 버스터(`?v=`)는 **일부러 붙이지 않는다.** 여기서 보는 것은 "그 파일이
//   디스크에 있는가"지 "브라우저가 어떤 URL로 받는가"가 아니다. 버전 문자열은
//   src/utils/assetVersion.ts가 소유하며 빌드마다 달라진다.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url)); // syu-react-frontend/
const STRICT = process.argv.includes('--strict');

const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

// macOS는 디렉터리 목록을 NFD(자모 분리)로 돌려주는 경우가 있고 소스 문자열은 NFC다.
// 요정 파일명이 한글(파랑이.png)이라 정규화를 맞추지 않으면 멀쩡한 파일이 "없음"으로 잡힌다.
const nfc = (s) => s.normalize('NFC');

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg)$/i;

const ASSET_DIRS = {
  backgrounds: 'public/scenario/backgrounds',
  characters: 'public/scenario/characters',
  fairies: 'public/scenario/fairies',
};

// ── 실제 파일 목록 ─────────────────────────────────────────────

/** '/scenario/characters/boss_stern.png' 형태의 URL 집합. */
const existingUrls = new Set();
/** 카테고리별 파일명 목록 (미참조 목록 출력용). */
const existingByDir = {};

for (const [key, rel] of Object.entries(ASSET_DIRS)) {
  const abs = path.join(ROOT, rel);
  const files = readdirSync(abs)
    .map(nfc)
    .filter((f) => !f.startsWith('.') && IMAGE_EXT.test(f) && statSync(path.join(abs, f)).isFile())
    .sort();
  existingByDir[key] = files;
  for (const f of files) existingUrls.add(`/scenario/${key}/${f}`);
}

// ── assetUrls.ts에서 해석 규칙 상수 추출 ──────────────────────

const ASSET_URLS_REL = 'src/components/scenario/player/assetUrls.ts';
const assetUrlsSrc = read(ASSET_URLS_REL);

function fail(message) {
  console.error(`\n[치명] ${message}`);
  console.error(`       ${ASSET_URLS_REL}의 구조가 바뀌었을 수 있습니다. 규칙을 다시 대조하세요.`);
  process.exit(2);
}

function extractString(name) {
  const m = assetUrlsSrc.match(new RegExp(`const ${name} = '([^']*)'`));
  if (!m) fail(`상수 ${name}을(를) 찾지 못했습니다.`);
  return m[1];
}

function extractStringList(name) {
  const m = assetUrlsSrc.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`));
  if (!m) fail(`상수 ${name}을(를) 찾지 못했습니다.`);
  const items = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
  if (items.length === 0) fail(`상수 ${name}이(가) 비어 있습니다.`);
  return items;
}

/** `const X = new Set([...])` 안의 문자열 리터럴. 여러 줄에 걸쳐 있어도 받는다. */
function extractStringSet(name) {
  const m = assetUrlsSrc.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`));
  if (!m) fail(`상수 ${name}을(를) 찾지 못했습니다.`);
  const items = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
  if (items.length === 0) fail(`상수 ${name}이(가) 비어 있습니다.`);
  return new Set(items);
}

const CHARACTER_DIR = extractString('CHARACTER_DIR');
const PROTAGONIST_BASE = extractString('PROTAGONIST_BASE');
const PROTAGONIST_EXPRESSIONS = extractStringList('PROTAGONIST_EXPRESSIONS');
const PROTAGONIST_FALLBACK_EXPRESSION = extractString('PROTAGONIST_FALLBACK_EXPRESSION');
const PARTNER_BASE = extractString('PARTNER_BASE');
const OUTFIT_TOKENS = extractStringList('OUTFIT_TOKENS');
const BASE_OUTFIT_FILES = extractStringSet('BASE_OUTFIT_FILES');
const OUTFIT_FILES = extractStringSet('OUTFIT_FILES');
const SUIT_DOMAIN_PREFIXES = extractStringList('SUIT_DOMAIN_PREFIXES');
const LOVER_DOMAIN_PREFIXES = extractStringList('LOVER_DOMAIN_PREFIXES');
const WEBP_BACKGROUNDS = extractStringSet('WEBP_BACKGROUNDS');
const GENDERED_BACKGROUNDS = extractStringSet('GENDERED_BACKGROUNDS');

// 배경 경로만은 이름 붙은 상수가 아니라 backgroundUrl의 템플릿 안에 박혀 있다.
// 값을 뽑을 수는 없으므로 "그 자리가 아직 있는지"만 확인하고 여기에 적어 둔다.
const BACKGROUND_DIR = '/scenario/backgrounds';
if (!assetUrlsSrc.includes('`/scenario/backgrounds/${file}`')) {
  fail('backgroundUrl의 경로 템플릿을 찾지 못했습니다.');
}

// 두 파일 목록은 **손으로 유지**된다(에셋이 도착하면 사람이 이름을 더한다).
// 목록에만 있고 디스크에 없는 이름은 조립기가 "존재한다"고 믿는 파일이므로
// 곧바로 404다 — 감사 결과보다 먼저 죽어야 한다.
for (const [name, set] of [
  ['BASE_OUTFIT_FILES', BASE_OUTFIT_FILES],
  ['OUTFIT_FILES', OUTFIT_FILES],
]) {
  const ghosts = [...set].filter((f) => !existingUrls.has(`${CHARACTER_DIR}/${nfc(f)}`));
  if (ghosts.length > 0) {
    fail(`${name}에 적힌 파일이 디스크에 없습니다: ${ghosts.join(', ')}`);
  }
}

const GENDERS = ['male', 'female'];
const genderToken = (gender) => (gender === 'male' ? 'm' : 'f');

// 아래 함수들은 assetUrls.ts의 동명 함수를 그대로 옮긴 것이다.
function startsWithAny(value, prefixes) {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && prefixes.some((prefix) => normalized.startsWith(prefix));
}

const isLoverDomain = (domain) => (domain ? startsWithAny(domain, LOVER_DOMAIN_PREFIXES) : false);

/** 영역이 정하는 백설이 의상. 목록에 없는 영역은 기본복. */
function outfitForDomain(domain) {
  if (!domain) return 'base';
  if (isLoverDomain(domain)) return 'date';
  if (startsWithAny(domain, SUIT_DOMAIN_PREFIXES)) return 'suit';
  return 'base';
}

function expressionOf(fileName, base) {
  const withoutExt = fileName.trim().replace(/\.(png|jpg|jpeg|webp)$/i, '');
  const rest = withoutExt.slice(base.length).replace(/^_/, '');
  const withoutGender = rest.replace(/^[mf](_|$)/i, '');
  return withoutGender.replace(new RegExp(`^(${OUTFIT_TOKENS.join('|')})(_|$)`, 'i'), '');
}

function clampExpression(expression, known, fallback) {
  const lower = expression.toLowerCase();
  return known.includes(lower) ? lower : fallback;
}

const isProtagonist = (f) => f.trim().toLowerCase().startsWith(PROTAGONIST_BASE);
const isPartner = (f) => f.trim().toLowerCase().startsWith(PARTNER_BASE);

/**
 * 표정 클램프 → **기본복 존재 판정** → 의상 조립 → 의상 변형이 없으면 기본복.
 * 세 겹의 폴백이 assetUrls.ts와 그대로 같다 (가운데 겹이 2026-08-26에 생겼다 —
 * 어휘에는 등록됐지만 그림이 아직 없는 표정을 기본 표정으로 되돌린다).
 */
function protagonistSpriteFile(gender, outfit, expression) {
  const token = genderToken(gender);
  const clamped = clampExpression(
    expression,
    PROTAGONIST_EXPRESSIONS,
    PROTAGONIST_FALLBACK_EXPRESSION
  );
  const safe = BASE_OUTFIT_FILES.has(`${PROTAGONIST_BASE}_${token}_${clamped}.png`)
    ? clamped
    : PROTAGONIST_FALLBACK_EXPRESSION;
  const base = `${PROTAGONIST_BASE}_${token}_${safe}.png`;
  if (outfit === 'base') return base;
  const dressed = `${PROTAGONIST_BASE}_${token}_${outfit}_${safe}.png`;
  if (OUTFIT_FILES.has(dressed)) return dressed;
  // 의상을 지키고 표정을 양보한다 (assetUrls.ts와 같은 순서 — 2026-08-26)
  const dressedFallback =
    `${PROTAGONIST_BASE}_${token}_${outfit}_${PROTAGONIST_FALLBACK_EXPRESSION}.png`;
  if (OUTFIT_FILES.has(dressedFallback)) return dressedFallback;
  return base;
}

function resolveProtagonistFile(charName, gender, domain) {
  const file = protagonistSpriteFile(
    gender,
    outfitForDomain(domain),
    expressionOf(charName, PROTAGONIST_BASE)
  );
  return `${CHARACTER_DIR}/${file}`;
}

const partnerGenderOf = (protagonistGender) => (protagonistGender === 'male' ? 'female' : 'male');

/**
 * 연인은 **반대 성별 백설이의 데이트 차림**이다 (2026-08-26). 전용 lover 에셋은
 * 렌더 경로에 닿지 않아 지웠으므로 도메인과 무관하게 이 한 갈래뿐이다.
 */
function resolvePartnerFile(charName, protagonistGender) {
  const file = protagonistSpriteFile(
    partnerGenderOf(protagonistGender),
    'date',
    expressionOf(charName, PARTNER_BASE)
  );
  return `${CHARACTER_DIR}/${file}`;
}

function resolveCharacterFile(charName, gender, domain) {
  const trimmed = charName.trim();
  if (isProtagonist(trimmed)) return resolveProtagonistFile(trimmed, gender, domain);
  if (isPartner(trimmed)) return resolvePartnerFile(trimmed, gender);
  const withExt = /\.(png|jpg|jpeg|webp)$/i.test(trimmed) ? trimmed : `${trimmed}.png`;
  return `${CHARACTER_DIR}/${withExt}`;
}

/** CSV bg 값 → 성별 변형 파일명. 변형이 없으면 받은 값 그대로. */
function genderedBackgroundFile(bg, gender) {
  if (!gender) return bg;
  const variant = bg.replace(/\.png$/, `_${genderToken(gender)}.png`);
  return GENDERED_BACKGROUNDS.has(variant) ? variant : bg;
}

/** CSV bg 값 → 실제 서빙 경로. 성별 변형을 먼저 고르고 그 다음 WebP. */
function backgroundUrl(bg, gender) {
  const gendered = genderedBackgroundFile(bg, gender);
  const file = WEBP_BACKGROUNDS.has(gendered) ? gendered.replace(/\.png$/, '.webp') : gendered;
  return `${BACKGROUND_DIR}/${file}`;
}

// ── 참조 수집 ──────────────────────────────────────────────────

/** url → { sources: Set<string>, kind: string } */
const required = new Map();
/** 코드가 폴백으로 가려 화면에는 안 보이지만 콘텐츠 의도와 어긋나는 갭. */
const masked = [];

function requireUrl(url, kind, source) {
  const entry = required.get(url) ?? { kind, sources: new Set() };
  entry.sources.add(source);
  required.set(url, entry);
}

function addMasked(kind, token, intended, actual, source) {
  const key = `${kind}|${token}|${intended}`;
  const found = masked.find((m) => m.key === key);
  if (found) {
    found.sources.add(source);
    return;
  }
  masked.push({ key, kind, token, intended, actual, sources: new Set([source]) });
}

// ① scenario_visual.csv ─────────────────────────────────────────
// 파싱 규칙은 src/utils/scenarioCsvParser.ts와 동일하다:
//   메타 4열(NO, DOMAIN, REACTION_TYPE, TITLE) + 4씬 × (BG, CHAR1, CHAR2, CHAR3),
//   필드가 20개 미만인 줄은 건너뛴다.

/** src/utils/scenarioCsvParser.ts의 parseCsvLine과 동일. */
function parseCsvLine(line) {
  const fields = [];
  let currentField = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(currentField.trim());
      currentField = '';
    } else {
      currentField += char;
    }
  }
  fields.push(currentField.trim());
  return fields;
}

/** '직장7' → '직장'. 4영역 분류용. */
const AREAS = ['직장', '취업준비', '연인', '일상'];
const areaOf = (domain) => AREAS.find((a) => domain.startsWith(a)) ?? '미분류';

const VISUAL_CSV_REL = 'src/assets/data/scenario_visual.csv';
const visualCsv = read(VISUAL_CSV_REL).replace(/^﻿/, '');
const visualLines = visualCsv.trim().split(/\r?\n/);

/** 표정 토큰 빈도 — token → { count, bases:Set, areas:Set } */
const expressionStats = new Map();
/** 배역별 표정 사용 — base → Set<expression> */
const roleExpressions = new Map();
/** 영역별 배경 사용 — area → Map<bgFile, sceneCount> */
const bgByArea = new Map();
/** 배경 × 조연 조합 — 'bg|base' → { count, episodes:Set } */
const bgRoleCombo = new Map();
let sceneCount = 0;
let episodeRowCount = 0;

for (let i = 1; i < visualLines.length; i++) {
  const line = visualLines[i].trim();
  if (!line) continue;
  const fields = parseCsvLine(line);
  if (fields.length < 20) continue;

  const [, domain, reactionType] = fields;
  const area = areaOf(domain);
  const outfit = outfitForDomain(domain);
  episodeRowCount++;

  let idx = 4;
  for (let s = 0; s < 4; s++) {
    const bg = fields[idx];
    const chars = [fields[idx + 1], fields[idx + 2], fields[idx + 3]];
    idx += 4;
    sceneCount++;
    const source = `${domain}/${reactionType} S${s + 1}`;

    if (bg) {
      // 화면에 실제로 나가는 파일은 성별 변형 → WebP 업스케일을 거친 결과다.
      // 두 성별을 모두 요구한다 — my_room은 남성 유저에게 다른 파일이 나간다.
      for (const g of GENDERS) requireUrl(backgroundUrl(bg, g), '배경', source);
      const areaMap = bgByArea.get(area) ?? new Map();
      areaMap.set(bg, (areaMap.get(bg) ?? 0) + 1);
      bgByArea.set(area, areaMap);
    }

    for (const raw of chars) {
      const token = raw?.trim();
      if (!token) continue;

      // 표정 토큰 집계 — 확장자·성별 토큰을 걷어낸 마지막 조각.
      const stem = token.replace(IMAGE_EXT, '');
      const parts = stem.split('_');
      const expr = parts.length > 1 ? parts[parts.length - 1] : '(없음)';
      const base = parts.slice(0, -1).filter((p) => !/^[mf]$/i.test(p)).join('_') || stem;
      const stat = expressionStats.get(expr) ?? { count: 0, bases: new Set(), areas: new Set() };
      stat.count++;
      stat.bases.add(base);
      stat.areas.add(area);
      expressionStats.set(expr, stat);

      const used = roleExpressions.get(base) ?? new Set();
      used.add(expr);
      roleExpressions.set(base, used);

      // 주인공은 어느 배경에나 나오므로 조합 통계에서 뺀다 — 보고 싶은 것은
      // "조연이 어울리지 않는 배경에 서 있는" 조합(= 배경 에셋 부족의 신호)이다.
      if (bg && base !== PROTAGONIST_BASE) {
        const key = `${bg}|${base}`;
        const combo = bgRoleCombo.get(key) ?? { count: 0, episodes: new Set() };
        combo.count++;
        combo.episodes.add(domain);
        bgRoleCombo.set(key, combo);
      }

      if (isProtagonist(token)) {
        // 표기가 어떻든 결과는 유저 성별 — 남/녀 두 파일이 모두 있어야 한다.
        // 의상은 CSV가 아니라 **영역**이 정하므로 domain을 함께 넘긴다.
        for (const g of GENDERS) {
          requireUrl(resolveProtagonistFile(token, g, domain), '캐릭터', source);
        }
        const rawExpr = expressionOf(token, PROTAGONIST_BASE).toLowerCase();
        if (!PROTAGONIST_EXPRESSIONS.includes(rawExpr)) {
          addMasked(
            '표정 클램프',
            token,
            `${PROTAGONIST_BASE}_{m,f}_${rawExpr}.png`,
            `${PROTAGONIST_FALLBACK_EXPRESSION}으로 대체 렌더`,
            source
          );
        } else {
          for (const g of GENDERS) {
            // 어휘에는 등록됐지만 기본복 그림이 아직 없는 표정(2026-08-26 worried).
            // '표정 클램프'와 나눠 세는 이유는 원인이 다르기 때문이다 — 저쪽은
            // 콘텐츠의 표기 오류이고, 이쪽은 **에셋이 아직 안 온 것**이다.
            const baseFile = `${PROTAGONIST_BASE}_${genderToken(g)}_${rawExpr}.png`;
            if (!BASE_OUTFIT_FILES.has(baseFile)) {
              addMasked(
                '표정 에셋 미도착',
                token,
                baseFile,
                `${PROTAGONIST_FALLBACK_EXPRESSION}으로 대체 렌더`,
                source
              );
            } else if (outfit !== 'base') {
              // 표정은 아는데 그 표정의 의상 변형이 없으면 통째로 기본복으로 떨어진다.
              const dressed = `${PROTAGONIST_BASE}_${genderToken(g)}_${outfit}_${rawExpr}.png`;
              if (!OUTFIT_FILES.has(dressed)) {
                addMasked('의상 폴백', token, dressed, '기본복으로 대체 렌더', source);
              }
            }
          }
        }
        continue;
      }

      if (isPartner(token)) {
        // 연인은 반대 성별 백설이의 데이트 차림으로 치환된다 (도메인 무관).
        for (const g of GENDERS) requireUrl(resolvePartnerFile(token, g), '캐릭터', source);
        const rawExpr = expressionOf(token, PARTNER_BASE).toLowerCase();
        if (!PROTAGONIST_EXPRESSIONS.includes(rawExpr)) {
          // 백설이에게 없는 표정(예: lover_tired의 tired)은 기본 표정으로 떨어진다.
          addMasked(
            '표정 클램프',
            token,
            `${PROTAGONIST_BASE}_{m,f}_date_${rawExpr}.png`,
            `${PROTAGONIST_FALLBACK_EXPRESSION}으로 대체 렌더`,
            source
          );
        }
        continue;
      }

      requireUrl(resolveCharacterFile(token, 'female', domain), '캐릭터', source);
    }
  }

  // 전략 적용 이후 주인공은 CSV 표정과 무관하게 회복 표정(default)으로 선다
  // (PlayerStage / collectEpisodeImageUrls, 2026-08-26). 네 씬이 모두 sad인
  // 회차에서는 이 한 장이 위 루프에 잡히지 않는다.
  for (const g of GENDERS) {
    requireUrl(
      `${CHARACTER_DIR}/${protagonistSpriteFile(g, outfit, PROTAGONIST_FALLBACK_EXPRESSION)}`,
      '캐릭터',
      `${domain}/${reactionType} 전략 적용 후`
    );
  }
}

// ①-2 scenario_epilogue.csv ────────────────────────────────────
// 컬럼: DOMAIN, SCENE_NUM, TITLE, BG, CHAR_1, CHAR_2, CHAR_3, TEXT.
// 에필로그에는 요정도 전략도 없지만 배경·배역 해석은 같은 규칙을 탄다
// (collectEpilogueImageUrls → resolveSceneCast). 여기서 빼면 에필로그에만
// 쓰이는 에셋이 ③ '미참조'로 잡혀 삭제 후보처럼 보인다.
const EPILOGUE_CSV_REL = 'src/assets/data/scenario_epilogue.csv';
const epilogueLines = read(EPILOGUE_CSV_REL)
  .replace(/^\ufeff/, '')
  .trim()
  .split(/\r?\n/);
let epilogueSceneCount = 0;

for (let i = 1; i < epilogueLines.length; i++) {
  const line = epilogueLines[i].trim();
  if (!line) continue;
  const fields = parseCsvLine(line);
  if (fields.length < 7) continue;

  const [domain, sceneNum, , bgFile] = fields;
  const chars = fields.slice(4, 7);
  epilogueSceneCount++;
  const source = `에필로그 ${domain} S${sceneNum}`;

  if (bgFile) {
    for (const g of GENDERS) requireUrl(backgroundUrl(bgFile, g), '배경', source);
  }
  for (const raw of chars) {
    const token = raw?.trim();
    if (!token) continue;
    // 주인공·연인은 유저 성별에 따라 갈리므로 두 갈래를 모두 요구한다.
    if (isProtagonist(token) || isPartner(token)) {
      for (const g of GENDERS) requireUrl(resolveCharacterFile(token, g, domain), '캐릭터', source);
      continue;
    }
    requireUrl(resolveCharacterFile(token, 'female', domain), '캐릭터', source);
  }
}

// ② 요정 이미지 — src/constants/strategy.ts의 STRATEGY_META.image ────
const STRATEGY_REL = 'src/constants/strategy.ts';
const strategySrc = read(STRATEGY_REL);
const fairyRefs = [...strategySrc.matchAll(/image:\s*'(\/scenario\/fairies\/[^']+)'/g)].map((m) =>
  nfc(m[1])
);
if (fairyRefs.length === 0) fail(`${STRATEGY_REL}에서 요정 이미지 경로를 찾지 못했습니다.`);
for (const url of fairyRefs) requireUrl(url, '요정', 'STRATEGY_META (전 에피소드 프리로드)');

// ③ 엔딩 배경 — src/constants/endingScript.ts의 ENDING_CHAPTERS[].background ──
// 이 필드는 **파일명만** 들고 있다 (2026-08-18 이후). URL 조립은 소비처인
// components/ending/EndingBackdrop이 플레이어와 같은 backgroundUrl로 하고
// 성별도 함께 넘기므로, 여기서도 같은 함수에 두 성별을 통과시킨다.
const ENDING_REL = 'src/constants/endingScript.ts';
const endingSrc = read(ENDING_REL);
const endingChapters = [];
for (const m of endingSrc.matchAll(
  /id:\s*'([^']+)',[\s\S]*?background:\s*\{\s*file:\s*'([^']+)'/g
)) {
  endingChapters.push([m[1], m[2]]);
}
if (endingChapters.length === 0) {
  fail(`${ENDING_REL}에서 엔딩 배경(background.file)을 찾지 못했습니다.`);
}
for (const [id, file] of endingChapters) {
  for (const g of GENDERS) requireUrl(backgroundUrl(file, g), '엔딩 배경', `엔딩 챕터 ${id}`);
}

// ④ 그 밖의 코드 정적 참조 ─────────────────────────────────────
// 아바타 프리셋·캐릭터 그래픽처럼 CSV를 거치지 않고 경로를 직접 박은 곳.
// 이것을 빼면 멀쩡히 쓰이는 파일이 "미참조"로 잡힌다. 테스트 파일은 제외한다
// (테스트가 붙잡고 있다는 이유로 죽은 에셋이 살아남으면 안 되므로).
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(abs);
  }
  return out;
}

const SCENARIO_URL_RE = /\/scenario\/(backgrounds|characters|fairies)\/([^'"`)\s]+)/g;
for (const abs of walk(path.join(ROOT, 'src'))) {
  const rel = path.relative(ROOT, abs);
  if (rel === ASSET_URLS_REL || rel === STRATEGY_REL || rel === ENDING_REL) continue;
  const src = readFileSync(abs, 'utf8');
  for (const m of src.matchAll(SCENARIO_URL_RE)) {
    if (!IMAGE_EXT.test(m[2])) continue;
    requireUrl(nfc(`/scenario/${m[1]}/${m[2]}`), '코드 참조', `${rel}`);
  }
}

// ── 대조 ──────────────────────────────────────────────────────

const missing = [...required.entries()]
  .filter(([url]) => !existingUrls.has(nfc(url)))
  .map(([url, meta]) => ({ url, ...meta }))
  .sort((a, b) => a.url.localeCompare(b.url));

const referencedUrls = new Set([...required.keys()].map(nfc));
/** WebP 업스케일본이 참조되는 배경의 원본 PNG — 죽은 파일이 아니라 그 소스다. */
const webpSources = [];
const unreferenced = [];
for (const [key, files] of Object.entries(existingByDir)) {
  for (const f of files) {
    const url = `/scenario/${key}/${f}`;
    if (referencedUrls.has(url)) continue;
    const webpSibling = `${BACKGROUND_DIR}/${f.replace(/\.png$/, '.webp')}`;
    if (key === 'backgrounds' && f.endsWith('.png') && referencedUrls.has(webpSibling)) {
      webpSources.push(f);
      continue;
    }
    unreferenced.push({ dir: key, file: f, url });
  }
}

// ── 출력 ──────────────────────────────────────────────────────

const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;
const width = (s) => [...String(s)].reduce((w, ch) => w + (WIDE.test(ch) ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - width(s)));

function table(headers, rows) {
  if (rows.length === 0) return;
  const widths = headers.map((h, i) => Math.max(width(h), ...rows.map((r) => width(r[i]))));
  const line = (cells) => '  ' + cells.map((c, i) => pad(c, widths[i])).join('  ').trimEnd();
  console.log(line(headers));
  console.log('  ' + widths.map((w) => '─'.repeat(w)).join('  '));
  for (const r of rows) console.log(line(r));
}

/** 참조 출처가 많으면 앞 3개만 보이고 나머지는 개수로. */
function summarizeSources(sources) {
  const list = [...sources].sort();
  if (list.length <= 3) return list.join(', ');
  return `${list.slice(0, 3).join(', ')} 외 ${list.length - 3}건`;
}

function heading(text) {
  console.log(`\n${text}`);
  console.log('─'.repeat(Math.min(78, width(text) + 4)));
}

console.log('시나리오 에셋 참조 감사 — 로컬 CSV 기준');
console.log(
  `  CSV ${episodeRowCount}행 · ${sceneCount}씬 (+ 에필로그 ${epilogueSceneCount}씬) / 실제 파일 ` +
    Object.entries(existingByDir)
      .map(([k, v]) => `${k} ${v.length}`)
      .join(' · ') +
    `\n  필요 에셋 ${required.size}종 · 결손 ${missing.length}종 · 미참조 ${unreferenced.length}종 · 폴백 갭 ${masked.length}건`
);

heading('① 참조되는데 파일이 없음 (화면에 깨진 이미지)');
if (missing.length === 0) {
  console.log('  없음');
} else {
  table(
    ['구분', '필요한 파일', '참조 위치'],
    missing.map((m) => [m.kind, m.url, summarizeSources(m.sources)])
  );
}

heading('② 코드가 폴백으로 가린 갭 (화면은 뜨지만 콘텐츠 의도와 다름)');
if (masked.length === 0) {
  console.log('  없음');
} else {
  table(
    ['구분', 'CSV 표기', '있어야 할 파일', '현재 렌더', '건수'],
    masked.map((m) => [m.kind, m.token, m.intended, m.actual, `${m.sources.size}씬`])
  );
}

heading('③ 존재하지만 어디서도 참조되지 않는 파일');
if (unreferenced.length === 0) {
  console.log('  없음');
} else {
  table(
    ['디렉터리', '파일'],
    unreferenced.map((u) => [u.dir, u.file])
  );
  console.log('  ※ 삭제 후보일 뿐 판단은 팀의 몫입니다 (제작 예정 콘텐츠용일 수 있음).');
}
if (webpSources.length > 0) {
  console.log(
    `  ※ WebP 업스케일본이 대신 서빙되는 원본 PNG ${webpSources.length}장은 위 목록에서 뺐습니다` +
      ` (${webpSources.join(', ')}).`
  );
}

// ── 여기부터는 판정에 영향을 주지 않는 참고 통계 ──────────────
// 결손이 0이어도 "배경 한 장으로 열 에피소드를 버틴다" 같은 부족은 드러나지
// 않는다. 에셋 제작 분담을 논의하려면 그 분포가 필요해서 함께 낸다.

heading('④ CSV 캐릭터 표정 토큰 빈도 [참고]');
table(
  ['표정 토큰', '등장', '쓰는 배역', '영역'],
  [...expressionStats.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([expr, s]) => [
      expr,
      String(s.count),
      [...s.bases].sort().join(', '),
      [...s.areas].sort().join(', '),
    ])
);

heading('⑤ 배역별 표정 — 보유 파일 vs CSV 사용 [참고]');
{
  // public/scenario/characters의 파일명에서 배역·표정을 역산한다.
  const owned = new Map();
  const isVariantToken = (p) => /^[mf]$/i.test(p) || OUTFIT_TOKENS.includes(p.toLowerCase());
  for (const file of existingByDir.characters) {
    const parts = file.replace(IMAGE_EXT, '').split('_');
    const expr = parts.length > 1 ? parts[parts.length - 1] : '(없음)';
    // 성별·의상 토큰을 함께 걷어낸다 — baeksul_f_date_sad는 '백설이'의 sad지
    // 'baeksul_date'라는 별개 배역이 아니다.
    const base = parts.slice(0, -1).filter((p) => !isVariantToken(p)).join('_') || file;
    const set = owned.get(base) ?? new Set();
    set.add(expr);
    owned.set(base, set);
  }
  const bases = [...new Set([...owned.keys(), ...roleExpressions.keys()])].sort();
  table(
    ['배역', '보유 표정', 'CSV 사용', '미사용 보유'],
    bases.map((b) => {
      const own = [...(owned.get(b) ?? [])].sort();
      const used = [...(roleExpressions.get(b) ?? [])].sort();
      const idle = own.filter((e) => !used.includes(e));
      return [b, own.join(', ') || '—', used.join(', ') || '(미사용)', idle.join(', ') || '—'];
    })
  );
}

heading('⑥ 영역별 배경 사용 분포 [참고]');
table(
  ['영역', '배경 종수', '씬 분포'],
  AREAS.filter((a) => bgByArea.has(a)).map((a) => {
    const entries = [...bgByArea.get(a).entries()].sort((x, y) => y[1] - x[1]);
    return [
      a,
      String(entries.length),
      entries.map(([f, c]) => `${f.replace(IMAGE_EXT, '')}(${c})`).join(' '),
    ];
  })
);

heading('⑦ 조연이 서 있는 배경 [참고 — 배경 부족의 신호]');
table(
  ['배경', '배역', '씬', '에피소드'],
  [...bgRoleCombo.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([key, v]) => {
      const [bg, base] = key.split('|');
      const eps = [...v.episodes];
      return [
        bg.replace(IMAGE_EXT, ''),
        base,
        String(v.count),
        eps.length > 4 ? `${eps.slice(0, 4).join(', ')} 외 ${eps.length - 4}개` : eps.join(', '),
      ];
    })
);

if (missing.length > 0) {
  console.log('\n결과: 실패 — 결손 에셋이 있습니다.');
  process.exit(1);
}
if (STRICT && masked.length > 0) {
  console.log('\n결과: 실패(--strict) — 폴백으로 가린 갭이 남아 있습니다.');
  process.exit(1);
}
console.log(
  masked.length > 0
    ? '\n결과: 통과 (결손 없음). 폴백 갭은 경고로만 보고했습니다 — --strict로 실패 처리할 수 있습니다.'
    : '\n결과: 통과.'
);
