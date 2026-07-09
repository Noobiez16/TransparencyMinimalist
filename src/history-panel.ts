import * as history from './engine/history';
import { $ } from './dom';

export function initHistoryPanel(): void {
  const list = $('history-list');
  const tabs = $('right-tabs');
  tabs.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
      $('tab-properties').hidden = btn.dataset.tab !== 'properties';
      $('tab-history').hidden = btn.dataset.tab !== 'history';
    });
  });
  const render = () => {
    list.innerHTML = '';
    const cur = history.cursor();
    history.entries().forEach((entry, i) => {
      const row = document.createElement('button');
      row.className = 'history-row' + (i === cur ? ' current' : '') + (i > cur ? ' undone' : '');
      row.textContent = entry.label;
      row.addEventListener('click', () => history.jump(i));
      list.prepend(row);            // newest first
    });
    if (!history.entries().length) {
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = 'No actions yet.';
      list.appendChild(empty);
    }
  };
  history.onChange(render);
  render();
}
