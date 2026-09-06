// ============================================================
// Jaydon — Portfolio
// Decrypt/scramble-in effect for page titles. Vanilla JS port of the
// "DecryptText" interaction (random glyphs → staggered per-character
// lock-in with an accent flash) — no framework, no build step, so it
// drops straight into this static site. Applies to any element marked
// `data-scramble`; runs once, when the element first scrolls into view.
// On a multi-word title only the LAST word scrambles - the words before
// it are in place from the first frame - and the duration is derived from
// how many characters are actually animating, so titles resolve in
// ~0.3-0.8s rather than a flat 1.5s.
// ============================================================

(function () {
  "use strict";

  const targets = document.querySelectorAll("[data-scramble]");
  if (!targets.length) return;

  const GLYPHS = "#%&@$?!*+=/{}[]<>~^";
  /* Pace is now per-character rather than per-title. DURATION used to be
     the flat total for every title, which meant a long one and a short
     one resolved in the same 1.5s at completely different speeds; with
     only a last word animating, a 2-letter one like "FX" would have
     crawled through two glyphs over a second and a half.

     PER_CHAR sets the actual rhythm and the other two only bound it:
     MIN_DURATION so the shortest words ("me", "FX") still register as an
     effect rather than a flicker, DURATION as a ceiling nothing currently
     reaches (it would take a 15-character word). Resolved times across
     the site: "me"/"FX"/"WANG"/"Aira" 420ms, "Museum" 600ms, "c*nnect!"
     800ms, "environment" 1100ms.

     Both values were raised ~40% from 70/320 — the effect was reading as
     over before it had registered, particularly on the short words that
     were sitting on the floor. Raising PER_CHAR alone would not have
     fixed those: at 2-4 characters they never reach n * PER_CHAR, so the
     floor is the only number that moves them, and the two have to go up
     together to keep the pacing continuous across word lengths. */
  const PER_CHAR = 100; // ms per scrambled character — sets the pace
  const MIN_DURATION = 420; // ms — floor, so 2-letter words still read as an effect
  const DURATION = 1500; // ms — ceiling for an unusually long word
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

    /* ---- pin the resolved height for the duration of the animation ----
       The glyph substitution below swaps every character for one of
       GLYPHS, which are not the same width as the letters they stand in
       for — so the title can WRAP TO A DIFFERENT NUMBER OF LINES while
       it resolves. Measured on the Play hero at 1920x1080: "Jaydon's
       Digital Museum" is 3 lines / 1052px resolved, but 2 lines / 701px
       mid-scramble.

       That 351px swing is not cosmetic, because this title is a measured
       element. main.js's sizePlayHero() sums .dm-hero__content's height
       to solve --stage-fit, and --stage-fit feeds .dm-hero__model's
       width/height, which is what <model-viewer> sizes its WebGL drawing
       buffer from. window.load fires ~600ms into the page — i.e. squarely
       inside this 1500ms animation — so the hero was being solved against
       a title made of random glyphs, and the resulting fit (0.94 instead
       of 0.69) resized the drawing buffer from 0.88M to 1.61M pixels in
       the middle of the load. That reallocation plus its forced re-render
       is the ~1s freeze that stalled this very animation, the head
       tracking, and everything else on the main thread.

       Locking the height makes this element's layout contribution
       constant across the animation, so a measurement taken at any point
       during it agrees with the final one. offsetHeight, not
       getBoundingClientRect(): on the Play page this title lives inside
       .dm-hero__stage's transform: scale(), and a rect would report the
       scaled size rather than the canvas-unit layout box main.js
       actually measures. */
    const lockedHeight = el.offsetHeight;
    if (lockedHeight) el.style.height = lockedHeight + "px";

    /* ---- suppress the title's glow for the duration ----
       Every title this runs on carries a filter: drop-shadow() glow (see
       .hero__title in style.css). A filter is not a paint the browser can
       reuse: it renders the element into an offscreen buffer and runs a
       blur over it, and it has to redo that whenever the element's
       content changes. This loop rewrites a character roughly every 45ms
       per span, so for the full 1500ms the entire title — a box that is
       ~1500x1050 canvas units on the Play hero — was being re-rasterised
       and re-blurred on nearly every frame, right at the moment the 3D
       model is also loading and the reveals are running.

       Dropping the glow while the glyphs are still flickering costs
       almost nothing visually — it fades back in as the text resolves,
       which reads as part of the effect — and gives those frames back to
       everything else competing for them. */
    el.classList.add("is-scrambling");

    const release = () => {
      el.classList.remove("is-scrambling");
      el.style.height = "";
      /* If this ran before the webfont swapped, the height pinned above
         was the fallback's — so hand whoever measures this element a
         chance to re-solve now that the real text and the real font are
         both in place. main.js listens for this on the Play hero. */
      el.dispatchEvent(new CustomEvent("scramble:done", { bubbles: true }));
    };

    /* ---- only the last word animates ----
       Everything before the final space is written back as a plain text
       node and is simply there from the first frame; only the last word
       becomes per-character spans. Splitting on the LAST space rather
       than tokenising means a title with any number of words needs no
       special handling, and a single-word title falls out of the same
       code path with an empty lead.

       Built with DOM nodes instead of the innerHTML template this used
       to use: the lead is page copy going straight back into the
       document, and `<` or `&` in a future title would otherwise be
       parsed as markup rather than shown. */
    const lastSpace = text.lastIndexOf(" ");
    const lead = lastSpace === -1 ? "" : text.slice(0, lastSpace + 1);
    const tail = lastSpace === -1 ? text : text.slice(lastSpace + 1);

    el.textContent = "";
    if (lead) el.appendChild(document.createTextNode(lead));

    Array.from(tail).forEach((ch) => {
      const span = document.createElement("span");
      span.className = "scramble-char";
      span.dataset.final = ch;
      span.setAttribute("aria-hidden", "true");
      span.textContent = ch;
      el.appendChild(span);
    });

    const spans = Array.from(el.querySelectorAll(".scramble-char"));
    const n = spans.length;
    // unreachable for any real title (`text` is non-empty and trimmed, so
    // at least one non-space char exists) — but bailing here without
    // releasing would strand the pinned height above permanently
    if (n === 0) {
      release();
      return;
    }

    /* Length-derived duration, evenly staggered — so every title resolves
       at the same per-character speed instead of the same total time.

       lockAt is (i + 1) * stagger, not i * stagger. The old form locked
       character 0 at elapsed 0, so the first letter of every title never
       actually scrambled — invisible in a 23-character title, but half
       the word in "FX". Now every character gets at least one stagger
       step of flicker, and the last one lands exactly on `duration`. */
    const duration = Math.min(DURATION, Math.max(MIN_DURATION, n * PER_CHAR));
    const stagger = duration / n;
    const lockAt = spans.map((_, i) => (i + 1) * stagger);
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
      else release();
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
