// How a photo is framed in its circle. Every photo is shown at one size, as a circle, centered on the face
// (Christina's direction of November 16, 2026). Only the display changes: the stored photo is never altered.
//
// A page may carry no inline styles, so the framing is written as class names from a fixed set, in steps of 5
// for the positions and 10 for the enlargement. FRAME_CSS is the rule behind each class name.

export type Frame = { pos_x: number; pos_y: number; origin_x: number; origin_y: number; zoom: number };

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const stepped = (v: unknown, step: number, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v / step) * step, min, max) : null;

// The class names for a framing the API supplied, or none when there is no framing or it is not in the expected form.
export function frameClasses(frame: unknown): string {
  if (!frame || typeof frame !== 'object') return '';
  const f = frame as Record<string, unknown>;
  const px = stepped(f.pos_x, 5, 0, 100);
  const py = stepped(f.pos_y, 5, 0, 100);
  const ox = stepped(f.origin_x, 5, 0, 100);
  const oy = stepped(f.origin_y, 5, 0, 100);
  const z = stepped(f.zoom, 10, 100, 300);
  if (px === null || py === null || ox === null || oy === null || z === null) return '';
  return `px-${px} py-${py} ox-${ox} oy-${oy} z-${z}`;
}

// The framing that puts a face at the center of the circle. width and height are the photo's size in pixels,
// faceX and faceY say where the middle of the face is (0 to 1 across and down the photo), and zoom is how much
// to enlarge (1 is not at all). Along the side that overflows the circle, the photo slides until the face is in
// the middle or the photo's edge reaches the circle's edge. Enlarging then pulls the face the rest of the way,
// again only as far as the photo still fills the circle.
export function frameFor(width: number, height: number, faceX: number, faceY: number, zoom: number): Frame {
  const short = Math.min(width, height);
  const z = clamp(zoom, 1, 3);
  const along = (length: number, face: number): [number, number] => {
    const ratio = length / short;
    let position = 0.5;
    let at = clamp(face, 0, 1);
    if (ratio > 1.0001) {
      position = clamp((0.5 - at * ratio) / (1 - ratio), 0, 1);
      at = position * (1 - ratio) + at * ratio;
    }
    const origin = z > 1.0001 ? clamp((at * z - 0.5) / (z - 1), 0, 1) : 0.5;
    return [position, origin];
  };
  const [px, ox] = along(width, faceX);
  const [py, oy] = along(height, faceY);
  return {
    pos_x: stepped(px * 100, 5, 0, 100) as number,
    pos_y: stepped(py * 100, 5, 0, 100) as number,
    origin_x: stepped(ox * 100, 5, 0, 100) as number,
    origin_y: stepped(oy * 100, 5, 0, 100) as number,
    zoom: stepped(z * 100, 10, 100, 300) as number,
  };
}

const rules: string[] = [];
for (let v = 0; v <= 100; v += 5) rules.push(`.px-${v}{--px:${v}%}.py-${v}{--py:${v}%}.ox-${v}{--ox:${v}%}.oy-${v}{--oy:${v}%}`);
for (let v = 100; v <= 300; v += 10) rules.push(`.z-${v}{--z:${v / 100}}`);
export const FRAME_CSS = rules.join('\n');
