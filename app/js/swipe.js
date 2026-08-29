// Horizontal swipe detection via pointer events. Pure DOM wiring, no state.
// Pair with `touch-action: pan-y` on the surface so vertical scroll survives.

// Attach to `root`; `selector` picks the swiped element per gesture (null =
// root itself is the surface). Fires onLeft/onRight once per gesture, with
// the swiped element. A gesture that turns into a swipe suppresses the
// click that would otherwise follow it.
export function attachSwipe(root, selector, { onLeft, onRight, threshold = 60 } = {}) {
  let x0 = 0;
  let y0 = 0;
  let el = null;
  let horiz = false;

  const reset = () => {
    if (el) {
      el.style.transform = "";
      el.classList.remove("swipe-left", "swipe-right");
    }
    el = null;
    horiz = false;
  };

  root.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.buttons !== 1) return;
    el = selector ? e.target.closest(selector) : root;
    if (el && selector && !root.contains(el)) el = null;
    x0 = e.clientX;
    y0 = e.clientY;
    horiz = false;
  });

  root.addEventListener("pointermove", (e) => {
    if (!el) return;
    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    if (!horiz) {
      if (Math.abs(dx) < 12) return; // ignore jitter until intent is clear
      if (Math.abs(dx) < Math.abs(dy) * 1.5) {
        el = null; // vertical intent: let the browser scroll
        return;
      }
      horiz = true;
    }
    el.style.transform = `translateX(${dx}px)`;
    el.classList.toggle("swipe-right", dx > 0);
    el.classList.toggle("swipe-left", dx < 0);
  });

  const end = (e) => {
    if (!el) return;
    const dx = e.clientX - x0;
    const target = el;
    const swiped = horiz;
    reset();
    if (!swiped) return;
    suppressNextClick(root);
    if (dx <= -threshold) onLeft?.(target);
    else if (dx >= threshold) onRight?.(target);
  };
  root.addEventListener("pointerup", end);
  root.addEventListener("pointercancel", reset);
}

function suppressNextClick(root) {
  root.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true, once: true },
  );
}
