import { getActiveTool, onToolChange, type ToolOption } from './engine/tools';
import { subscribe } from './state';
import { subscribeTransformSession } from './engine/transform-session';
import { subscribeCropSession } from './engine/crop-session';
import { $ } from './dom';

interface FocusedDraft { key: string; value: string }

function optionIcon(opt: ToolOption): string {
  return typeof opt.icon === 'function' ? opt.icon() : opt.icon ?? '';
}

function optionShell(opt: ToolOption): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = `opt opt-${opt.kind}${opt.essential ? ' opt-essential' : ''}`;
  wrap.dataset.optionGroup = opt.group ?? 'general';
  wrap.dataset.optionKey = opt.key;
  const label = document.createElement('label');
  label.className = 'opt-label';
  label.htmlFor = `tool-option-${opt.key}`;
  if (opt.icon && opt.kind === 'number') label.innerHTML = `<span class="opt-icon" aria-hidden="true">${optionIcon(opt)}</span><span>${opt.label}</span>`;
  else label.textContent = opt.label;
  wrap.appendChild(label);
  return wrap;
}

function renderOption(opt: ToolOption): HTMLElement {
  const wrap = optionShell(opt);
  const disabled = opt.disabled?.() ?? false;
  if (opt.kind === 'display') {
    const value = document.createElement('span');
    value.className = 'opt-value';
    value.textContent = opt.get();
    wrap.appendChild(value);
  } else if (opt.kind === 'number') {
    const input = document.createElement('input');
    input.id = `tool-option-${opt.key}`;
    input.type = 'number';
    input.dataset.optionKey = opt.key;
    if (opt.min !== undefined) input.min = String(opt.min);
    if (opt.max !== undefined) input.max = String(opt.max);
    input.step = String(opt.step ?? 1);
    input.value = String(Math.round(opt.get() * 100) / 100);
    input.disabled = disabled;
    const commit = () => {
      const parsed = Number(input.value);
      if (!Number.isFinite(parsed)) { input.value = String(opt.get()); return; }
      const clamped = Math.min(opt.max ?? Infinity, Math.max(opt.min ?? -Infinity, parsed));
      input.value = String(clamped);
      opt.set(clamped);
    };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); commit(); input.blur(); }
      if (event.key === 'Escape') { event.preventDefault(); input.value = String(opt.get()); input.blur(); }
    });
    wrap.appendChild(input);
  } else if (opt.kind === 'toggle') {
    const button = document.createElement('button');
    button.id = `tool-option-${opt.key}`;
    button.className = 'opt-toggle';
    button.type = 'button';
    button.setAttribute('aria-pressed', String(opt.get()));
    button.disabled = disabled;
    if (opt.icon) button.innerHTML = optionIcon(opt);
    button.addEventListener('click', () => {
      const value = !opt.get();
      opt.set(value);
      button.setAttribute('aria-pressed', String(value));
      if (opt.icon) button.innerHTML = optionIcon(opt);
    });
    wrap.appendChild(button);
  } else if (opt.kind === 'select') {
    const select = document.createElement('select');
    select.id = `tool-option-${opt.key}`;
    select.disabled = disabled;
    for (const choice of opt.choices) {
      const option = document.createElement('option');
      option.value = choice;
      option.textContent = choice;
      option.selected = choice === opt.get();
      select.appendChild(option);
    }
    select.addEventListener('change', () => opt.set(select.value));
    wrap.appendChild(select);
  } else {
    wrap.classList.add('transform-session-actions');
    const button = document.createElement('button');
    button.id = `tool-option-${opt.key}`;
    button.type = 'button';
    button.className = 'opt-action';
    button.disabled = disabled;
    button.innerHTML = `${optionIcon(opt)}<span>${opt.label}</span>`;
    button.setAttribute('aria-label', opt.label);
    button.addEventListener('click', opt.run);
    wrap.replaceChildren(button);
  }
  return wrap;
}

export function initOptionsBar(): void {
  const host = $('options-host');
  const render = () => {
    const active = document.activeElement;
    const focused = active instanceof HTMLInputElement && active.dataset.optionKey
      ? { key: active.dataset.optionKey, value: active.value } satisfies FocusedDraft
      : null;
    host.replaceChildren();
    const options = getActiveTool().options ?? [];
    if (!options.length) {
      const empty = document.createElement('span');
      empty.className = 'options-empty';
      empty.textContent = `${getActiveTool().label} — no options`;
      host.appendChild(empty);
      return;
    }
    options.forEach((option) => host.appendChild(renderOption(option)));
    if (focused) {
      const replacement = host.querySelector<HTMLInputElement>(`input[data-option-key="${focused.key}"]`);
      if (replacement) {
        replacement.value = focused.value;
        replacement.focus();
      }
    }
  };
  onToolChange(render);
  subscribe((dirty) => {
    if (dirty.has('selection') || dirty.has('layerProps') || dirty.has('structure') || dirty.has('view')) render();
  });
  subscribeTransformSession(render);
  subscribeCropSession(render);
  render();
}
