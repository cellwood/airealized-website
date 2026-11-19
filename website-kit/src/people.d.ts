// The parts of people.js that hold no page, for the tests. The script itself is plain JavaScript, served as it is.
export const PICTURE_SECONDS: number;
export const LISTENING: string;
export function step(index: number, count: number, direction: number): number;
export function playerAddress(video: string, origin: string): string | null;
export function command(func: string): string;
export function readPlayer(data: unknown): { ended: boolean; time: number | null; duration: number | null } | null;
export function tap(x: number, width: number): -1 | 1;
export function swipe(dx: number, dy: number): 'next' | 'previous' | 'close' | null;
