import { clampTextStyle, defaultTextStyle, type TextAlign, type TextStyle } from '../engine/text-model';

let style: TextStyle = defaultTextStyle();
let align: TextAlign = 'center';

export function getTypeStyle(): TextStyle { return { ...style }; }

export function setTypeStyle(patch: Partial<TextStyle>): void {
  style = clampTextStyle({ ...style, ...patch });
}

export function getTypeAlign(): TextAlign { return align; }
export function setTypeAlign(next: TextAlign): void { align = next; }

export function __resetTypeConfigForTest(): void {
  style = defaultTextStyle();
  align = 'center';
}
