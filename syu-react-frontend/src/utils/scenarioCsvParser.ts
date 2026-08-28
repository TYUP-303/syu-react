// src/utils/scenarioCsvParser.ts

export interface SceneData {
  type: string;
  text: string;
  bg: string;
  chars: string[];
}

export interface ScenarioEntry {
  no: string;
  domain: string;
  reactionType: string;
  title: string;
  scenes: SceneData[];
}

/**
 * CSV 라인 파싱 유틸 (따옴표 이스케이핑 지원)
 *
 * 필드는 항상 trim된 값으로 돌아온다. 줄 단위로 잘라 넘기는 것이 전제이지만,
 * 따옴표 안에 개행이 들어 있는 "레코드" 문자열을 그대로 넘겨도 동작한다
 * (개행이 따옴표 안에서는 평범한 문자로 취급되기 때문) — scenarioAngelsCsvParser가
 * 이 성질을 이용해 여러 줄짜리 셀을 지원한다.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      // 연속된 따옴표 처리 (이스케이프된 따옴표)
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

export function parseAndMergeScenarioCsv(visualCsvText: string, dialogueCsvText: string): ScenarioEntry[] {
  // 1. Visual CSV 파싱
  const visualLines = visualCsvText.trim().split(/\r?\n/);
  const visualMap = new Map<string, any>();
  
  for (let i = 1; i < visualLines.length; i++) {
    const line = visualLines[i].trim();
    if (!line) continue;
    const fields = parseCsvLine(line);
    if (fields.length < 20) continue;

    const no = fields[0];
    const domain = fields[1];
    const reactionType = fields[2];
    const title = fields[3];

    // 키: no + domain + reactionType
    const key = `${no}_${domain}_${reactionType}`;
    
    // BG와 Chars 파싱 (4씬)
    const sceneVisuals = [];
    let fieldIdx = 4;
    for (let s = 0; s < 4; s++) {
      sceneVisuals.push({
        bg: fields[fieldIdx],
        chars: [fields[fieldIdx + 1], fields[fieldIdx + 2], fields[fieldIdx + 3]]
      });
      fieldIdx += 4;
    }

    visualMap.set(key, { title, sceneVisuals });
  }

  // 2. Dialogue CSV 파싱
  const dialogueLines = dialogueCsvText.trim().split(/\r?\n/);
  const dialogueMap = new Map<string, any[]>();
  
  for (let i = 1; i < dialogueLines.length; i++) {
    const line = dialogueLines[i].trim();
    if (!line) continue;
    const fields = parseCsvLine(line);
    if (fields.length < 6) continue;

    const no = fields[0];
    const domain = fields[1];
    const reactionType = fields[2];
    const sceneNum = parseInt(fields[3], 10);
    const sceneType = fields[4];
    const text = fields[5];

    const key = `${no}_${domain}_${reactionType}`;
    if (!dialogueMap.has(key)) {
      dialogueMap.set(key, []);
    }
    dialogueMap.get(key)!.push({ sceneNum, sceneType, text });
  }

  // 3. 병합 (Merge)
  const result: ScenarioEntry[] = [];
  
  for (const [key, visualData] of visualMap.entries()) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [no, domain, reactionType] = key.split('_');
    const dialogues = dialogueMap.get(key) || [];
    
    // SCENE_NUM 기준 정렬
    dialogues.sort((a, b) => a.sceneNum - b.sceneNum);

    const scenes: SceneData[] = [];
    for (let s = 0; s < 4; s++) {
      const v = visualData.sceneVisuals[s];
      const d = dialogues[s] || { sceneType: '', text: '' };
      scenes.push({
        type: d.sceneType,
        text: d.text,
        bg: v.bg,
        chars: v.chars
      });
    }

    result.push({
      no,
      domain,
      reactionType,
      title: visualData.title,
      scenes
    });
  }

  return result;
}
