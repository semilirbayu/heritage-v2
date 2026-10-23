import { CARD_H, CARD_W } from '../../layout/constants';

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 2;
export const SCALE_STEP = 0.05;
export const DEFAULT_SCALE = 0.7;
export const PAN_STEP = 30;
export const PANEL_WIDTH = 370;
export const FIT_PADDING = 48;

export interface Camera {
  scale: number;
  tx: number;
  ty: number;
}

export interface ViewSize {
  width: number;
  height: number;
}

export function clampScale(scale: number): number {
  const stepped = Math.round(scale * 100) / 100;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, stepped));
}

/** Place a card's centre in the visible area. An open panel shifts that area right by 370px. */
export function centerCard(
  card: { x: number; y: number },
  view: ViewSize,
  scale: number,
  panelOpen: boolean,
): Pick<Camera, 'tx' | 'ty'> {
  const panel = panelOpen ? PANEL_WIDTH : 0;
  const cx = panel + (view.width - panel) / 2;
  const cy = view.height / 2;
  return {
    tx: cx - (card.x + CARD_W / 2) * scale,
    ty: cy - (card.y + CARD_H / 2) * scale,
  };
}

/** Zoom while keeping the tree point under `anchor` (stage-local pixels) fixed. */
export function zoomAt(camera: Camera, anchorX: number, anchorY: number, nextScale: number): Camera {
  const scale = clampScale(nextScale);
  const worldX = (anchorX - camera.tx) / camera.scale;
  const worldY = (anchorY - camera.ty) / camera.scale;
  return {
    scale,
    tx: anchorX - worldX * scale,
    ty: anchorY - worldY * scale,
  };
}

/**
 * Move the view by tree units. Positive `viewDx` reveals content to the right
 * (the same sign as a viewBox origin increase).
 */
export function shiftView(camera: Camera, viewDx: number, viewDy: number): Camera {
  return {
    ...camera,
    tx: camera.tx - viewDx * camera.scale,
    ty: camera.ty - viewDy * camera.scale,
  };
}

export function fitBounds(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  view: ViewSize,
  panelOpen: boolean,
): Camera {
  const panel = panelOpen ? PANEL_WIDTH : 0;
  const viewW = Math.max(1, view.width - panel - FIT_PADDING * 2);
  const viewH = Math.max(1, view.height - FIT_PADDING * 2);
  const treeW = Math.max(1, bounds.maxX - bounds.minX);
  const treeH = Math.max(1, bounds.maxY - bounds.minY);
  const scale = clampScale(Math.min(viewW / treeW, viewH / treeH));
  const cx = panel + (view.width - panel) / 2;
  const cy = view.height / 2;
  const midX = (bounds.minX + bounds.maxX) / 2;
  const midY = (bounds.minY + bounds.maxY) / 2;
  return { scale, tx: cx - midX * scale, ty: cy - midY * scale };
}

export function isCardInView(
  card: { x: number; y: number },
  camera: Camera,
  view: ViewSize,
  margin: number,
): boolean {
  if (view.width === 0 || view.height === 0) return true;
  const left = camera.tx + card.x * camera.scale;
  const top = camera.ty + card.y * camera.scale;
  const right = left + CARD_W * camera.scale;
  const bottom = top + CARD_H * camera.scale;
  return (
    right >= -margin &&
    bottom >= -margin &&
    left <= view.width + margin &&
    top <= view.height + margin
  );
}
