import { styleAt, type StyleSpan, type TextAlign, type TextStyle } from './text-model';

export type MeasureChar = (char: string, style: TextStyle) => number;

export interface LaidOutPiece {
  text: string;
  style: TextStyle;
  x: number;        // relative to the block's left edge, after alignment
  width: number;
  start: number;    // index into the source string (D3b maps carets through this)
}

export interface LaidOutLine {
  pieces: LaidOutPiece[];
  top: number;
  baseline: number;
  height: number;
  width: number;
}

export interface TextLayout { lines: LaidOutLine[]; width: number; height: number }

/** Ascent as a fraction of font size — the standard approximation without font metrics. */
export const ASCENT_RATIO = 0.8;

interface RawLine { pieces: LaidOutPiece[]; width: number; height: number; maxFontSize: number }

function buildLine(
  text: string, spans: StyleSpan[], from: number, to: number, measure: MeasureChar
): RawLine {
  const pieces: LaidOutPiece[] = [];
  let x = 0;
  let height = 0;
  let maxFontSize = 0;
  let current: LaidOutPiece | null = null;
  let currentStyle: TextStyle | null = null;

  for (let i = from; i < to; i++) {
    const style = styleAt(spans, i);
    const advance = measure(text[i], style) + style.tracking;
    if (style.leading > height) height = style.leading;
    if (style.fontSize > maxFontSize) maxFontSize = style.fontSize;

    if (!current || currentStyle !== style) {
      current = { text: text[i], style, x, width: advance, start: i };
      currentStyle = style;
      pieces.push(current);
    } else {
      current.text += text[i];
      current.width += advance;
    }
    x += advance;
  }
  return { pieces, width: x, height, maxFontSize };
}

/** Lay out point type: lines break only on '\n'. */
export function layoutText(
  text: string, spans: StyleSpan[], align: TextAlign, measure: MeasureChar
): TextLayout {
  if (text.length === 0) return { lines: [], width: 0, height: 0 };

  const raw: RawLine[] = [];
  let lineStart = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === '\n') {
      const line = buildLine(text, spans, lineStart, i, measure);
      if (line.pieces.length === 0) {
        // A blank line still occupies a line box, styled by the character at its position.
        const style = styleAt(spans, Math.min(lineStart, text.length - 1));
        line.height = style.leading;
        line.maxFontSize = style.fontSize;
      }
      raw.push(line);
      lineStart = i + 1;
    }
  }

  const width = raw.reduce((max, line) => Math.max(max, line.width), 0);
  const lines: LaidOutLine[] = [];
  let top = 0;
  for (const line of raw) {
    const offset = align === 'center' ? (width - line.width) / 2
      : align === 'right' ? width - line.width
      : 0;
    lines.push({
      pieces: line.pieces.map((p) => ({ ...p, x: p.x + offset })),
      top,
      baseline: top + ASCENT_RATIO * line.maxFontSize,
      height: line.height,
      width: line.width
    });
    top += line.height;
  }
  return { lines, width, height: top };
}
