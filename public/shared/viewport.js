/*
 * The device-pixel-ratio canvas fit.
 *
 * Ten lines that every game got right, in four slightly different ways. The
 * three parts that matter, and that are easy to get subtly wrong:
 *
 *  1. The backing store is CSS size x DPR, so the canvas has real device pixels
 *     rather than a blurry upscale of CSS ones.
 *  2. The context transform is then set to DPR, so every draw call afterwards is
 *     written in CSS pixels and no game code has to know DPR exists.
 *  3. DPR is capped. A phone reporting 3 or 4 means four times the fill rate for
 *     a difference nobody can see on a canvas game, and it is the single easiest
 *     way to turn a 60fps game into a 20fps one.
 *
 * Setting canvas.width ALSO resets the whole 2D context state — transform,
 * fillStyle, imageSmoothingEnabled, everything. That is why smoothing is
 * reapplied here and not once at startup: a resize would silently undo it, and
 * a pixel-art game would go soft the first time the address bar collapsed.
 */

export const MAX_DPR = 2;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasRenderingContext2D} ctx
 * @param {{maxDpr?:number, minW?:number, minH?:number, smooth?:boolean}} [opts]
 * @returns {{w:number, h:number, dpr:number}} size in CSS pixels
 */
export function fitCanvas(canvas, ctx, opts = {}) {
  const { maxDpr = MAX_DPR, minW = 200, minH = 240, smooth = true } = opts;

  const dpr = clamp(window.devicePixelRatio || 1, 1, maxDpr);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(minW, Math.round(rect.width || window.innerWidth));
  const h = Math.max(minH, Math.round(rect.height || window.innerHeight));

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = smooth;

  return { w, h, dpr };
}

/**
 * Resize handling, debounced. Mobile browsers fire resize continuously while the
 * address bar slides, and reallocating the backing store on every one of those
 * events is how a game stutters for the first second of every scroll.
 */
export function onResize(fn, delay = 80) {
  let timer = null;
  const handler = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, delay);
  };
  window.addEventListener('resize', handler);
  window.addEventListener('orientationchange', handler);
  return () => {
    window.removeEventListener('resize', handler);
    window.removeEventListener('orientationchange', handler);
    if (timer) clearTimeout(timer);
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
