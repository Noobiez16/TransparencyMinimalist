import type { PathCommand } from './shape-geometry';

/**
 * The single place a PathCommand list is turned into canvas calls. Every drawing
 * site (compositor, rasterizer, thumbnails, overlay) goes through here, so adding
 * a command variant can never silently no-op in a site that forgot to handle it.
 * Callers own beginPath/fill/stroke.
 */
export function replayPathCommands(ctx: CanvasRenderingContext2D, commands: PathCommand[]): void {
  for (const cmd of commands) {
    switch (cmd.op) {
      case 'moveTo': ctx.moveTo(cmd.x, cmd.y); break;
      case 'lineTo': ctx.lineTo(cmd.x, cmd.y); break;
      case 'arcTo': ctx.arcTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.r); break;
      case 'bezierCurveTo': ctx.bezierCurveTo(cmd.c1x, cmd.c1y, cmd.c2x, cmd.c2y, cmd.x, cmd.y); break;
      case 'ellipse': ctx.ellipse(cmd.cx, cmd.cy, cmd.rx, cmd.ry, 0, 0, Math.PI * 2); break;
      case 'close': ctx.closePath(); break;
    }
  }
}
