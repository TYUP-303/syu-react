// src/utils/csvParser.ts
// 검사 문항 CSV 문자열을 파싱하여 QuestionItem 배열로 변환하는 유틸리티

export interface QuestionItem {
  id: number;
  part: string;
  question: string;
  type: 'scale' | 'yes-no' | 'multiple-choice';
  options: string[];
}

/**
 * CSV 문자열을 받아서 질문 목록 배열로 파싱합니다.
 * 따옴표(",")로 감싸진 필드 내의 콤마는 분리되지 않도록 처리합니다.
 */
export function parseQuestionsCsv(csvText: string): QuestionItem[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];

  const result: QuestionItem[] = [];

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        fields.push(currentField.trim());
        currentField = '';
      } else {
        currentField += char;
      }
    }
    fields.push(currentField.trim());
    return fields;
  };

  // 첫 줄은 헤더이므로 인덱스 1부터 시작
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseLine(line);
    if (fields.length >= 5) {
      const id = parseInt(fields[0], 10);
      const part = fields[1];
      const question = fields[2];
      const typeStr = fields[3] as 'scale' | 'yes-no' | 'multiple-choice';
      
      // 옵션은 내부적으로 콤마로 구분된 문자열
      const options = fields[4]
        .split(',')
        .map((opt) => opt.trim())
        .filter((opt) => opt !== '');

      result.push({
        id,
        part,
        question,
        type: typeStr,
        options,
      });
    }
  }

  return result;
}
