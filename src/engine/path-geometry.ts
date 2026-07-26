import type { Anchor, SubPath } from './path-model';
import type { PathCommand } from './shape-geometry';

function segmentCommand(from: Anchor, to: Anchor): PathCommand {
  const straight = from.outDx === 0 && from.outDy === 0 && to.inDx === 0 && to.inDy === 0;
  if (straight) return { op: 'lineTo', x: to.x, y: to.y };
  return {
    op: 'bezierCurveTo',
    c1x: from.x + from.outDx, c1y: from.y + from.outDy,
    c2x: to.x + to.inDx, c2y: to.y + to.inDy,
    x: to.x, y: to.y
  };
}

/** Drawing commands for a path, in DOCUMENT space. */
export function pathToCommands(subpaths: SubPath[]): PathCommand[] {
  const commands: PathCommand[] = [];
  for (const sub of subpaths) {
    if (sub.anchors.length < 2) continue;
    commands.push({ op: 'moveTo', x: sub.anchors[0].x, y: sub.anchors[0].y });
    for (let i = 1; i < sub.anchors.length; i++) {
      commands.push(segmentCommand(sub.anchors[i - 1], sub.anchors[i]));
    }
    if (sub.closed) {
      commands.push(segmentCommand(sub.anchors[sub.anchors.length - 1], sub.anchors[0]));
      commands.push({ op: 'close' });
    }
  }
  return commands;
}
