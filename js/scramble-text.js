// ============================================================
// Jaydon — Portfolio
// Decrypt/scramble-in effect for page titles. Vanilla JS port of the
// "DecryptText" interaction (random glyphs → staggered per-character
// lock-in with an accent flash) — no framework, no build step, so it
// drops straight into this static site. Applies to any element marked
// `data-scramble`; runs once, over ~1.5s total, when the element first
// scrolls into view.
// ============================================================

(function () {
  "use strict";

  const targets = document.querySelectorAll("[data-scramble]");
  if (!targets.length) return;

  const GLYPHS = "#%&@$?!*+=/{}[]<>~^";
  const DURATION = 1500; // ms — total time for the whole title to resolve
  const CYCLE_SPEED = 45; // ms per glyph flicker, per character
  const FLASH_MS = 380; // accent flash duration on lock-in

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function scramble(el) {
    const text = el.textContent.trim();
    if (!text || el.dataset.scrambled === "done") return;
    el.dataset.scrambled = "done";

    if (prefersReduced) return; // real text is already in the DOM — nothing to do

    // Keep the real string available to assistive tech throughout the animation.
    el.setAttribute("aria-label", text);

    const chars = Array.from(text);
    el.innerHTML = chars
      .map((ch) =>
        ch === " "
          ? " "
          : `<span class="scramble-char" data-final="${ch}" aria-hidden="true">${ch}</span>`
      )
      .join("");

    const spans = Array.from(el.querySelectorAll(".scramble-char"));
    const n = spans.length;
    if (n === 0) return;

    // Even spread across the full duration regardless of title length, so
    // every title — short or long — finishes resolving at ~DURATION ms.
    const stagger = n > 1 ? DURATION / n : 0;
    const lockAt = spans.map((_, i) => i * stagger);
    const nextFlickerAt = new Array(n).fill(0);
    const locked = new Array(n).fill(false);

    const start = performance.now();
    let remaining = n;

    function frame(now) {
      const elapsed = now - start;
      for (let i = 0; i < n; i += 1) {
        if (locked[i]) continue;
        const span = spans[i];
        if (elapsed >= lockAt[i]) {
          span.textContent = span.dataset.final;
          span.classList.add("scramble-char--lock");
          locked[i] = true;
          remaining -= 1;
        } else if (elapsed >= nextFlickerAt[i]) {
          span.textContent = GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
          nextFlickerAt[i] = elapsed + CYCLE_SPEED + Math.random() * 30;
        }
      }
      if (remaining > 0) requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  if (prefersReduced || !("IntersectionObserver" in window)) {
    targets.forEach(scramble);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          scramble(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  targets.forEach((el) => observer.observe(el));
})();
