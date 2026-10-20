/**
 * Signal field: rows of short dashes laid out like lines of text on a plane that runs
 * to the horizon, drifting slowly toward the viewer. A few dashes burn blue — the
 * advice inside the noise of an inbox. Pure canvas, no dependencies.
 *
 * Under prefers-reduced-motion a single still frame is drawn. The loop pauses while
 * the canvas is off screen or the tab is hidden.
 */

interface Segment {
  x0: number;
  x1: number;
  blue: boolean;
}
interface Row {
  z: number;
  segments: Segment[];
}

const Z_NEAR = 0.9;
const Z_FAR = 34;
const ROWS = 78;
const HALF_WIDTH = 26;
const CAMERA_HEIGHT = 1.35;
const SPEED = 0.55; // world units per second

function rand(min: number, max: number, r: () => number) {
  return min + (max - min) * r();
}

/** Small deterministic PRNG so the still frame is the same on every load. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSegments(r: () => number): Segment[] {
  const segments: Segment[] = [];
  // A "line of text": words of varying length, sometimes ending early like a paragraph.
  let x = -HALF_WIDTH + rand(0, 1.5, r);
  const end = r() < 0.18 ? rand(-6, 14, r) : HALF_WIDTH;
  const blueLine = r() < 0.09;
  let blueRun = 0;
  if (blueLine) blueRun = Math.floor(rand(2, 6, r));
  const blueStart = blueLine ? Math.floor(rand(0, 10, r)) : -1;
  let i = 0;
  while (x < end) {
    const len = rand(0.35, 2.1, r);
    const blue = blueLine && i >= blueStart && i < blueStart + blueRun;
    segments.push({ x0: x, x1: Math.min(x + len, end), blue });
    x += len + rand(0.28, 0.5, r);
    i++;
  }
  return segments;
}

export function startSignalField(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const random = mulberry32(20261009);
  const rows: Row[] = Array.from({ length: ROWS }, (_, i) => ({
    z: Z_NEAR + ((Z_FAR - Z_NEAR) * i) / ROWS,
    segments: makeSegments(random),
  }));
  const stars = Array.from({ length: 140 }, () => ({ x: random(), y: random(), a: rand(0.04, 0.32, random), s: random() < 0.1 ? 1.4 : 0.8 }));

  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let frame = 0;
  let last = 0;
  let visible = true;
  let running = false;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    draw();
  }

  function draw() {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const horizon = height * 0.5;
    const focal = Math.max(height, width * 0.55) * 0.95;
    const cx = width * 0.62;

    // Stars above the horizon.
    for (const s of stars) {
      ctx.fillStyle = `rgba(226, 232, 245, ${s.a})`;
      ctx.fillRect(s.x * width, s.y * horizon * 0.96, s.s, s.s);
    }

    // Horizon glow.
    const glow = ctx.createLinearGradient(0, horizon - 60, 0, horizon + 40);
    glow.addColorStop(0, "rgba(46, 107, 255, 0)");
    glow.addColorStop(0.6, "rgba(46, 107, 255, 0.10)");
    glow.addColorStop(1, "rgba(46, 107, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, horizon - 60, width, 100);

    ctx.lineCap = "round";
    const sorted = [...rows].sort((a, b) => b.z - a.z);
    for (const row of sorted) {
      const z = row.z;
      const y = horizon + (CAMERA_HEIGHT / z) * focal;
      if (y > height + 20) continue;
      const depth = 1 - z / Z_FAR;
      const fadeNear = Math.min(1, (z - Z_NEAR) / 1.6);
      const alpha = Math.max(0, depth ** 1.6 * fadeNear);
      const thickness = Math.min(5, Math.max(0.6, (0.07 / z) * focal * 0.18));

      for (const seg of row.segments) {
        const x0 = cx + (seg.x0 / z) * focal * 0.32;
        const x1 = cx + (seg.x1 / z) * focal * 0.32;
        if (x1 < -10 || x0 > width + 10) continue;
        if (seg.blue) {
          ctx.strokeStyle = `rgba(46, 107, 255, ${Math.min(1, alpha * 0.45)})`;
          ctx.lineWidth = thickness * 3.2;
          ctx.beginPath();
          ctx.moveTo(x0, y);
          ctx.lineTo(x1, y);
          ctx.stroke();
          ctx.strokeStyle = `rgba(150, 182, 255, ${Math.min(1, alpha * 1.25)})`;
        } else {
          ctx.strokeStyle = `rgba(200, 210, 228, ${alpha * 0.32})`;
        }
        ctx.lineWidth = thickness;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
      }
    }
  }

  function tick(now: number) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    for (const row of rows) {
      row.z -= SPEED * dt;
      if (row.z < Z_NEAR) {
        row.z += Z_FAR - Z_NEAR;
        row.segments = makeSegments(Math.random);
      }
    }
    draw();
    frame = requestAnimationFrame(tick);
  }

  function start() {
    if (reduce || running || !visible || document.hidden) return;
    running = true;
    last = 0;
    frame = requestAnimationFrame(tick);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(frame);
  }

  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  ro?.observe(canvas);
  const io =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => {
          visible = Boolean(entry?.isIntersecting);
          if (visible) start();
          else stop();
        })
      : null;
  io?.observe(canvas);
  const onVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener("visibilitychange", onVisibility);

  resize();
  start();

  return () => {
    stop();
    ro?.disconnect();
    io?.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
