type Listener = () => void;

let foreground = '#000000';
let background = '#ffffff';
const listeners: Listener[] = [];

const HEX = /^#[0-9a-f]{6}$/;

function normalize(hex: string): string | null {
  const value = hex.trim().toLowerCase();
  return HEX.test(value) ? value : null;
}

function emit(): void {
  listeners.forEach((fn) => fn());
}

export function getForeground(): string { return foreground; }
export function getBackground(): string { return background; }

export function setForeground(hex: string): void {
  const value = normalize(hex);
  if (!value) return;
  foreground = value;
  emit();
}

export function setBackground(hex: string): void {
  const value = normalize(hex);
  if (!value) return;
  background = value;
  emit();
}

export function swapColors(): void {
  [foreground, background] = [background, foreground];
  emit();
}

export function resetColors(): void {
  foreground = '#000000';
  background = '#ffffff';
  emit();
}

export function subscribeColors(fn: Listener): void {
  listeners.push(fn);
}
