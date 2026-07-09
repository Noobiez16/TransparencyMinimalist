let container: HTMLDivElement | null = null;

export function toast(message: string, opts?: { actionLabel?: string; onAction?: () => void; duration?: number }): void {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  const text = document.createElement('span');
  text.textContent = message;
  el.appendChild(text);
  if (opts?.actionLabel) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = opts.actionLabel;
    btn.addEventListener('click', () => {
      clearTimeout(timer);
      opts.onAction?.();
      dismiss();
    });
    el.appendChild(btn);
  }
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  function dismiss(): void {
    el.classList.remove('show');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 600);
  }
  const timer = setTimeout(dismiss, opts?.duration ?? 3000);
}
