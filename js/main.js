// ============================================================
// Jaydon — Portfolio
// Mobile nav toggle, scroll-reveal, project filtering, theme toggle
// ============================================================

(function () {
  "use strict";

  /* ---------- light/dark mode toggle ----------
     The saved preference is already applied to <html data-theme> by
     the inline script in <head> (before first paint, to avoid a
     flash of the wrong theme) — this just wires up the button to
     flip it and persist the choice. All the actual color-swapping is
     CSS. That attribute now selects a full token palette in style.css
     (html[data-theme="light"]), not the old invert(1) filter. */
  /* ---------- custom cursor ----------
     A 38px ring (styled in style.css) that follows the pointer with a
     little lag and smears in the direction of travel.

     The smear is a stretch, not a blur. filter: blur() strong enough to
     read as speed would erase a 1px stroke outright, so the ring is
     elongated along its own velocity vector and thinned across it — the
     shape a circle actually takes when it moves faster than a frame — and
     only a light blur is layered on top of that.

     Two positions are tracked deliberately. `tx/ty` is where the pointer
     genuinely is; `x/y` is the ring, which eases toward it. The gap
     between them IS the velocity the smear is derived from, so the lag
     that makes the ring feel weighty is the same quantity that drives the
     blur — one behaviour, not two that have to be kept in sync. */
  /* ---------- back to top (case studies) ----------
     The anchor itself needs no JS — href="#top" plus the page's
     scroll-behavior: smooth already does the navigation, and it keeps
     working if this script never runs. All this adds is the reveal, so
     the control is not sitting on the first screen pointing at where the
     visitor already is.

     Threshold is a viewport height rather than a fixed pixel count: "you
     have scrolled past roughly one screen" means the same thing on a
     phone and a 1440p monitor, where a flat 600px would not.

     Passive listener and no work beyond a class toggle — this runs on
     every scroll event, alongside the eased-wheel rAF loop above, so it
     deliberately reads scrollY and does nothing else. */
  const backToTop = document.querySelector(".cs-top");
  if (backToTop) {
    const syncBackToTop = () => {
      backToTop.classList.toggle(
        "is-visible",
        window.scrollY > window.innerHeight * 0.9
      );
    };
    syncBackToTop();
    window.addEventListener("scroll", syncBackToTop, { passive: true });
    window.addEventListener("resize", syncBackToTop);
  }

  const finePointer = window.matchMedia("(pointer: fine)");
  if (finePointer.matches) {
    const ring = document.createElement("div");
    ring.className = "cursor-ring";
    ring.setAttribute("aria-hidden", "true");
    document.body.appendChild(ring);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const EASE = reduced ? 1 : 0.2;   /* 1 = pinned to the pointer, no lag and so no smear */
    const RADIUS = 19;                /* half of the 38px box — the ring is positioned by its centre */

    let tx = 0, ty = 0, x = 0, y = 0, px = 0, py = 0, live = false, raf = 0;

    const loop = () => {
      x += (tx - x) * EASE;
      y += (ty - y) * EASE;

      const vx = x - px, vy = y - py;
      px = x; py = y;

      let transform = `translate3d(${x - RADIUS}px, ${y - RADIUS}px, 0)`;

      if (!reduced) {
        const speed = Math.hypot(vx, vy);
        /* 1 at rest, capped so a fast flick across a wide monitor cannot
           stretch the ring into a line */
        const stretch = Math.min(1 + speed * 0.028, 1.85);
        /* thinning across the direction of travel preserves the ring's
           area, which is what stops the smear reading as "it got bigger" */
        const squash = 1 / (1 + (stretch - 1) * 0.55);
        const angle = Math.atan2(vy, vx);
        transform += ` rotate(${angle}rad) scale(${stretch}, ${squash})`;
        ring.style.filter = `blur(${Math.min(speed * 0.16, 2.6)}px)`;
      }

      ring.style.transform = transform;

      /* the loop stops once the ring has caught up — no rAF ticking
         forever behind a still mouse */
      if (Math.abs(tx - x) > 0.1 || Math.abs(ty - y) > 0.1) {
        raf = requestAnimationFrame(loop);
      } else {
        raf = 0;
        if (!reduced) ring.style.filter = "blur(0px)";
      }
    };

    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

    window.addEventListener("pointermove", (e) => {
      tx = e.clientX; ty = e.clientY;
      if (!live) {
        /* jump to the first known position rather than sliding in from
           0,0, then fade in */
        live = true;
        x = tx; y = ty; px = tx; py = ty;
        ring.classList.add("is-live");
      }
      /* grows over anything clickable, standing in for the system
         pointer this replaces */
      const hot = e.target instanceof Element &&
        e.target.closest('a, button, [role="button"], input, textarea, select, summary');
      ring.classList.toggle("is-hot", !!hot);
      kick();
    }, { passive: true });

    /* the ring would otherwise hang at the last known edge position when
       the pointer leaves the window entirely */
    document.addEventListener("pointerleave", () => ring.classList.remove("is-live"));
    document.addEventListener("pointerenter", () => { if (live) ring.classList.add("is-live"); });
  }

  const themeToggle = document.getElementById("themeToggle");

  if (themeToggle) {
    themeToggle.setAttribute(
      "aria-pressed",
      String(document.documentElement.dataset.theme === "light")
    );

    themeToggle.addEventListener("click", () => {
      const goingLight = document.documentElement.dataset.theme !== "light";

      if (goingLight) {
        document.documentElement.dataset.theme = "light";
      } else {
        delete document.documentElement.dataset.theme;
      }

      localStorage.setItem("theme", goingLight ? "light" : "dark");
      themeToggle.setAttribute("aria-pressed", String(goingLight));
    });
  }

  /* ---------- smooth (eased) wheel scrolling, sitewide ----------
     CSS's `scroll-behavior: smooth` (see style.css) only smooths
     scrolling that's already programmatic — anchor links, .scrollTo()
     calls — it does nothing for ordinary mouse-wheel/trackpad scrolling,
     which still jumps in the browser's normal stepped increments. This
     is what actually smooths THAT: on every wheel tick, instead of
     letting the browser move the page immediately, it nudges a target
     scroll position and then eases the real scroll position toward that
     target a little more each animation frame (lerp — linear
     interpolation) — the classic "buttery"/momentum scroll feel used by
     libraries like Lenis (confirmed on kynejang.com, the reference site
     asked for here, via its `lenis-*` class names) rather than an
     off-the-shelf library, both to avoid a new dependency and because
     the effect itself is a short, well-known technique, not something
     that needs a library for a single global listener.

     Deliberately still uses the real window.scrollTo (not a transformed
     wrapper element, the OTHER common way to build this) — the whole
     site leans on position: sticky (.hero, .case-studies__side), which
     only tracks the page's ACTUAL scroll position; a transform-based
     version would decouple the two and break every sticky element
     that's been tuned so far. { behavior: "instant" } on each frame's
     scrollTo is required, not just a style choice — without it, the
     page's own scroll-behavior: smooth would try to additionally
     animate every one of these already-animated per-frame calls,
     compounding into visible lag instead of one smooth motion. */
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (!prefersReducedMotion) {
    const EASE = 0.18; // lower = smoother/slower catch-up, higher = snappier — was 0.09, which read as "heavy"/laggy (each frame only closed 9% of the remaining distance to the target); doubled so the page catches up to the cursor's input noticeably faster while keeping a touch of the eased feel, not raw stepped wheel ticks
    const LINE_HEIGHT = 40; // px per "line" — normalizes deltaMode: 1 wheel events (Firefox, some mice)

    let targetY = window.scrollY;
    let currentY = window.scrollY;
    let animating = false;

    const maxScrollY = () =>
      document.documentElement.scrollHeight - window.innerHeight;

    const tick = () => {
      currentY += (targetY - currentY) * EASE;
      const settled = Math.abs(targetY - currentY) < 0.5;
      if (settled) currentY = targetY;

      window.scrollTo({ top: currentY, left: 0, behavior: "instant" });

      if (settled) {
        animating = false;
      } else {
        requestAnimationFrame(tick);
      }
    };

    window.addEventListener(
      "wheel",
      (e) => {
        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= LINE_HEIGHT;
        else if (e.deltaMode === 2) delta *= window.innerHeight;

        // taking over the page's own scroll only — an element with its
        // own overflow (a scrollable code block, a modal) should still
        // wheel-scroll natively instead of fighting this
        if (e.target.closest("[data-native-scroll]")) return;

        e.preventDefault();
        targetY = Math.min(Math.max(targetY + delta, 0), maxScrollY());

        if (!animating) {
          animating = true;
          requestAnimationFrame(tick);
        }
      },
      { passive: false }
    );

    // keeps targetY in sync with scrolling this listener didn't cause
    // itself (keyboard, scrollbar drag, an anchor-link jump) — otherwise
    // the next wheel tick would yank the page back to a stale target
    window.addEventListener("scroll", () => {
      if (!animating) {
        targetY = window.scrollY;
        currentY = window.scrollY;
      }
    });
  }

  /* ---------- heroes: fit the space below the nav, never crop ----------
     Three separate heroes have the same blind spot: .hero (homepage),
     .cs-hero (case studies) and .dm-hero (Play). Every fluid value in all
     three is vw-driven, so none of them can see viewport HEIGHT at all. A
     2560×1440 monitor and a 1920×1080 laptop land within a few hundred px
     of each other in width but nearly 600px apart in available height,
     and the design was calibrated on the taller one — so on the laptop
     the bottom of each hero fell past the fold (or got clipped outright
     by .hero/.dm-hero's overflow: hidden).

     The nav is measured once here for all three. It used to be read as
     .hero's own offsetTop, which is correct — nav-wrap sits in normal
     flow directly above it — but homepage-only: .cs-hero and .dm-hero are
     different class tokens, so that entire block was a no-op on every
     other page. Reading .nav-wrap directly is what makes this shared.

     Why this is in JS at all: --hero-fit depends on the hero's natural
     (unshrunk) content height, and that height depends on --hero-fit.
     calc() can't express a fixed point, and a container query can't
     either — cqh would be reading the very height being solved for. The
     old CSS sidestepped it with a hard-coded 1070px natural-height
     constant that had to be re-swept across widths by hand whenever
     anything inside the hero changed; measuring the live page instead
     retires both the constant and the sweep. */
  const navWrap = document.querySelector(".nav-wrap");

  /* .nav-wrap is position: absolute now — a layer over the page rather
     than a block in flow — so `main` pays back the space it stopped
     occupying via padding-top: var(--nav-h). That variable has to come
     from the real measured bar, because the bar's height is a stack of
     clamps against --nav-fit and is not expressible in CSS on its own.
     Kept in sync here so one resize handler drives both this and the
     hero solving below. */
  const syncNavHeight = () => {
    const navHeight = navWrap ? navWrap.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty("--nav-h", `${navHeight}px`);
    return navHeight;
  };

  const availableBelowNav = () => {
    const navHeight = navWrap ? navWrap.getBoundingClientRect().height : 0;
    return Math.max(window.innerHeight - navHeight, 0);
  };

  /* The problem this whole block exists for is the wide-but-short window.
     In portrait the page is expected to scroll and shrinking type to force
     a hero into one screenful just makes it hard to read — a phone was
     rendering the case-study title at 52px instead of 78px that way, which
     breaks the stylesheet's own rule that width-driven behaviour (phones,
     tablets) stays exactly as it was. So portrait gets no proportional
     shrink, only the safety net where a hero would otherwise be clipped
     outright. */
  const isLandscape = () => window.innerWidth > window.innerHeight;

  /* The share of the space below the nav the hero's content is allowed to
     occupy. The two heroes need different values, for a structural reason
     rather than a taste one:

     .hero's designed trailing space is .hero__intro's 4th grid row, a 1fr
     spacer that sits OUTSIDE the measured natural height (natural is the
     title-to-paragraph stack plus the hero's own padding). Solving for
     "content exactly fills the available height" would therefore squeeze
     that spacer to nothing and change how the reference display renders.
     0.831 is measured off that display — 960px of content in 1155px of
     available height — and makes the slack scale WITH the hero, so a
     short window shows the same composition instead of a tighter one. It
     also lands --hero-fit at exactly 1 there, i.e. unchanged.

     .cs-hero was on a fill of 1 until the meta band became bottom-aligned
     (.cs-hero__meta, margin-top: auto). A fill of 1 asks solveFit to
     shrink the content until it EXACTLY fills the available height, which
     leaves auto exactly zero slack to distribute — so the moment a window
     was short enough to push fit below 1, every bit of air between the
     tags and the band vanished at once and the composition collapsed
     upward. Measured on Faculty of Environment: at 2560x1272 the gap was
     302px (24% of the viewport, fit 1, 206px of slack); at 1673x750 it
     was 76px (10%, fit 0.856, zero slack). Same page, same layout, two
     completely different compositions.

     0.85 reserves 15% of the available height as guaranteed slack at
     every viewport height, so auto always has something to distribute and
     the gap stays proportional: that same page now reads 23.7% and 21.9%
     at those two sizes.

     This is NOT a return to the old 0.783, which was wrong for a
     different reason — back then the gap above the band was a fixed
     10-21rem, so reserving headroom shrank every hero to Aira's
     proportions whether or not it needed it. With the band bottom-aligned
     the reserve is absorbed by auto rather than by scaling, so a hero
     that already fits is left alone: Aira and Ground FX still solve to
     fit 1 at 1673x750 and are not scaled down at all. Only a hero that
     genuinely overflows — Faculty of Environment's two-line title — pays
     for it, which is the actual requirement. */
  const HERO_FILL = 0.831;
  const CS_HERO_FILL = 0.85;

  /* Not every part of a hero actually takes the multiplier: the case-study
     tag pills, meta column and CTA buttons are plain text at a fixed size,
     so their height is the same at any --hero-fit. That makes the rendered
     height affine in the fit — rigid + elastic × fit — not proportional to
     it, and a single sample would read the whole thing as elastic and
     under-shrink. (Solving off one sample put the case-study buttons ~30px
     BELOW the fold on a 1524×671 laptop, which is the bug this is fixing.)

     Two samples separate the two parts exactly, no iteration needed:
       h(1)   = rigid + elastic
       h(0.5) = rigid + elastic / 2
     so rigid = 2·h(0.5) − h(1) and elastic = 2·(h(1) − h(0.5)).

     MIN_FIT is the backstop for a window so short that even the rigid part
     alone overruns it — the fit would go to zero or negative and collapse
     the title entirely. .cs-hero has no overflow: hidden (deliberately —
     its background grid breaks out to full viewport width), so past that
     floor the hero just runs long and stays scrollable, which is a better
     failure than an invisible title. */
  const MIN_FIT = 0.25;

  const solveFit = (element, measureHeight, fill) => {
    const target = availableBelowNav() * fill;

    element.style.setProperty("--hero-fit", "1");
    const atFull = measureHeight();
    element.style.setProperty("--hero-fit", "0.5");
    const atHalf = measureHeight();

    const rigid = 2 * atHalf - atFull;
    const elastic = 2 * (atFull - atHalf);

    const fit = elastic > 0 ? (target - rigid) / elastic : 1;
    element.style.setProperty(
      "--hero-fit",
      `${Math.max(MIN_FIT, Math.min(1, fit))}`
    );
  };

  /* .hero__grid--homepage lives at the body level (see index.html) so it
     isn't clipped by .hero's own overflow: hidden or pushed down by the
     nav-wrap's layout space. Its top/left/right are pinned via CSS, but
     its height has to reach from the true page top through the bottom of
     .hero — computed here, and after the hero itself since it reads
     .hero's rendered bottom edge. */
  const hero = document.querySelector(".hero");
  const homepageHeroGrid = document.querySelector(".hero__grid--homepage");
  const heroTitle = hero && hero.querySelector(".hero__title");
  const heroDesc = hero && hero.querySelector(".hero__desc");

  const sizeHomepageHero = () => {
    if (!hero) return;

    hero.style.height = `${availableBelowNav()}px`;

    if (heroTitle && heroDesc) {
      /* .hero__intro's trailing 1fr row soaks up whatever slack is left,
         so measuring .hero__intro would just report "however much room
         there was", not "however much the content needs". The title's top
         edge through the paragraph's bottom edge is the real stack, gaps
         included; the hero's own padding is the rest of the budget.

         offsetTop/offsetHeight rather than getBoundingClientRect because
         both of these elements are .reveal, i.e. translateY(24px) easing
         to 0 over 0.7s. Rects would fold that animation into the
         measurement, and since the two can be at different points in it,
         the stack would measure short by up to 24px. Offsets report the
         layout box and ignore transforms; both elements share
         .hero__intro as their offsetParent, so the difference is exact. */
      const measureStack = () => {
        const style = getComputedStyle(hero);
        return (
          heroDesc.offsetTop +
          heroDesc.offsetHeight -
          heroTitle.offsetTop +
          parseFloat(style.paddingTop) +
          parseFloat(style.paddingBottom)
        );
      };

      // .hero clips (overflow: hidden), so portrait still gets a fit —
      // just a fill of 1, which shrinks only far enough to avoid cropping
      // rather than also reserving the trailing spacer's share
      solveFit(hero, measureStack, isLandscape() ? HERO_FILL : 1);
    }

    if (homepageHeroGrid) {
      const heroBottom = hero.getBoundingClientRect().bottom + window.scrollY;
      homepageHeroGrid.style.height = `${heroBottom}px`;
    }
  };

  /* .cs-hero has no height of its own — it's a normal-flow section — so
     its own rendered height IS the measurement, no stack-summing needed.
     It's also the hero with the most rigid content (title, tags, meta),
     so it leans hardest on solveFit's two-sample split. Its dominant
     contributor is the margin-top above .cs-hero__meta — a pure-vw
     10–21rem gap that used to hold full desktop size on a short window
     and push the hero's last row a couple of hundred pixels below the
     fold. (.cs-hero__actions owned that margin until the jump links
     moved out of the hero into their own .cs-jump section; the meta
     band inherited both the gap and the y-position.) */
  const csHero = document.querySelector(".cs-hero");

  const sizeCaseStudyHero = () => {
    if (!csHero) return;
    // nothing clips here, so portrait can simply run long and scroll the
    // way it always has
    if (!isLandscape()) {
      csHero.style.setProperty("--hero-fit", "1");
      csHero.style.minHeight = "";
      return;
    }

    /* Two steps, and the order matters.

       solveFit models height as linear in --hero-fit (it samples at 1 and
       0.5 and solves). A min-height would clamp one or both samples and
       break that linearity, handing back a nonsense fit — so the floor is
       cleared first and the hero is measured at its natural content
       height. */
    csHero.style.minHeight = "";
    solveFit(csHero, () => csHero.getBoundingClientRect().height, CS_HERO_FILL);

    /* Then fill the screen. solveFit clamps at Math.min(1, fit), so it can
       shrink a hero that overflows but never stretch one that comes up
       short — a one-line title (Aira, Ground FX) sat at fit: 1 and ended
       well above the fold, letting the .cs-jump links show on the first
       screen while a two-line title (Faculty of Environment) filled it.
       This floor closes that gap without scaling type UP: the extra
       height is absorbed by .cs-hero__meta's margin-top: auto, which
       parks the band on the hero's bottom edge in every case. */
    csHero.style.minHeight = `${availableBelowNav()}px`;
  };

  /* The Play hero is a fixed 2540×1266 canvas scaled by a single
     transform (see .dm-hero__stage) — deliberately, so the composition
     never reflows piece by piece. That scale was width-only, which meant
     the section's height was always viewport width × 0.4984 regardless of
     how short the window was. Giving the scale a second arm keeps the
     one-transform contract intact while letting height constrain it too.

     The height arm measures against the canvas's CONTENT height, not the
     full 1266: the rest is empty background below the last thing that
     renders, and letting that spill past the fold is exactly what the
     reference display already does. Fitting all 1266 would shrink the
     Play hero there too. Derived from the live layout rather than
     hard-coded so it can't drift out of sync with the composition.

     .dm-hero__content is the anchor (the block wrapping the title and
     paragraph) rather than any one child, so this keeps working as
     things are added to or removed from the hero — it was measured off
     the CTA buttons until those were dropped, at which point a missing
     element would have disabled the height fit for the whole page. */
  const dmHero = document.querySelector(".dm-hero");
  const dmStage = dmHero && dmHero.querySelector(".dm-hero__stage");
  const dmContent = dmHero && dmHero.querySelector(".dm-hero__content");
  const STAGE_WIDTH = 2540;
  const STAGE_HEIGHT = 1266;
  // last value actually written to --stage-fit — see the write below for
  // why re-writing an unchanged one is worth avoiding
  let lastStageFit = -1;

  /* Same role as HERO_FILL above: the share of the space below the nav
     that the canvas's content is allowed to occupy, measured off the
     reference display where the layout is already right. This was
     effectively 1 — "shrink only far enough not to overflow" — which is
     why the fit sat dormant at 1 and let the paragraph run down to the
     bottom edge on a short window while leaving a third of the monitor
     empty. Solving against the monitor's own ratio instead keeps that
     display at exactly 1 and makes every shorter one match it. */
  const DM_HERO_FILL = 0.71;

  const sizePlayHero = () => {
    if (!dmHero || !dmStage || !dmContent) return;

    /* --stage-scale is left entirely alone (pure CSS, width-driven). All
       this touches is --stage-fit, the second factor that multiplies the
       transform without the type dividing it back out — see the stage's
       own comment for why shrinking --stage-scale instead makes the
       canvas grow rather than shrink. Because the canvas geometry is
       fixed with respect to --stage-fit, the rendered height is exactly
       linear in it and one measurement inverts it. */
    /* .dm-hero's own width would be self-reinforcing: an over-large scale
       overflows the stage, which widens the page, which widens .dm-hero,
       which stops the width arm ever pulling back. Clamping to the
       viewport breaks that loop, and still honours a narrower wrapper. */
    const frameWidth = Math.min(
      dmHero.clientWidth,
      document.documentElement.clientWidth
    );

    /* Measured with offsetTop/offsetHeight, not getBoundingClientRect:
       those report the untransformed layout box, so they're already in
       canvas units AND they ignore the .reveal entry animation's own
       transform, which would otherwise have the content still mid-flight
       when this runs. Walking the offsetParent chain because
       .dm-hero__row is positioned, so it — not the stage — is the
       content's offsetParent. */
    let canvasBottom = 0;
    let node = dmContent;
    while (node && node !== dmStage) {
      canvasBottom += node.offsetTop;
      node = node.offsetParent;
    }
    /* The walk already lands at the stage's own top edge — its 170px top
       padding is inside those offsets, not on top of them. The bottom
       padding is added deliberately though: it's the canvas's designed
       breathing room under the content, and counting it is what keeps the
       last line off the very bottom edge of the viewport. */
    canvasBottom +=
      dmContent.offsetHeight +
      (parseFloat(getComputedStyle(dmStage).paddingBottom) || 0);

    // matches .dm-hero__stage's own calc(100cqw / 2540px) exactly
    const stageScale = frameWidth / STAGE_WIDTH;
    const renderedBottom = canvasBottom * stageScale;

    const fit =
      renderedBottom > 0
        ? Math.min(1, (availableBelowNav() * DM_HERO_FILL) / renderedBottom)
        : 1;

    /* Writing --stage-fit is not a free style update: it feeds
       --model-render-scale, and so .dm-hero__model's width/height, which
       is the box <model-viewer> sizes its WebGL drawing buffer from. Every
       change therefore reallocates that buffer (plus its MSAA/depth
       attachments and model-viewer's second presentation canvas) and
       forces a full re-render, synchronously, on the main thread.

       sizeHeroes() runs four or more times during an ordinary load —
       inline, document.fonts.ready, window.load, and once per nav
       ResizeObserver notification — and on a window at or above the
       canvas's own 2.006 aspect ratio (the 2560x1440 reference display)
       every one of those solves is clamped to exactly 1, so the buffer is
       never resized and none of this is visible. Below that ratio the fit
       is a real number that moves between solves, and each move was
       another reallocation. Skipping writes that don't change the
       rendered size is what keeps that to the times it's genuinely
       needed; 0.001 of fit is well under a pixel of model box at any
       viewport this runs at. */
    if (Math.abs(fit - lastStageFit) > 0.001) {
      lastStageFit = fit;
      dmStage.style.setProperty("--stage-fit", `${fit}`);
    }

    /* 1266 canvas units at the combined scale — the canvas's own aspect,
       so the section's box still frames the composition it contains —
       PLUS the nav band this hero reclaims. .dm-hero is pulled up by
       margin-top: -var(--nav-h) and .dm-hero__stage pushed back down by
       the same amount, so the canvas still starts one nav-height into the
       section; without adding that height back here the box would end one
       nav-height early and .dm-hero's overflow: hidden would slice the
       bottom off the character — a hard horizontal cut straight through
       the shoulders, instead of the mask's fade into the page. */
    dmHero.style.height = `${STAGE_HEIGHT * stageScale * fit + syncNavHeight()}px`;
  };

  if (hero || csHero || dmHero) {
    const sizeHeroes = () => {
      /* first: the nav's height feeds main's padding, which moves every
         hero's top edge. Solving a hero against a stale offset would be
         solving against the previous window. */
      syncNavHeight();
      sizeHomepageHero();
      sizeCaseStudyHero();
      sizePlayHero();
    };

    /* Several of the triggers below routinely fire in the SAME frame as
       each other — the webfont landing resolves document.fonts.ready and
       reflows the nav (waking its ResizeObserver) at once, and on a warm
       load window.load follows a frame or two later. Each full pass
       forces layout on three heroes and can resize the Play page's WebGL
       buffer, so running one per event meant doing that work three or
       four times over in a few milliseconds. Coalescing onto a single
       animation frame collapses a burst into one solve, and gives a
       resize drag one pass per frame instead of one per event. The first
       call stays synchronous so the heroes are sized before first paint
       rather than a frame after it. */
    let pending = 0;
    const scheduleSizeHeroes = () => {
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        sizeHeroes();
      });
    };

    sizeHeroes();
    window.addEventListener("resize", scheduleSizeHeroes);
    // the laptop video and the 3D model settle after this fires
    window.addEventListener("load", scheduleSizeHeroes);

    /* FS Mondwest swapping in is the big one. Every hero here is measured
       through a title set in it, and the fallback serif's metrics are
       different enough that solving before the swap lands the Play page's
       buttons ~90px below the fold and then leaves them there — `load`
       does NOT wait for a webfont. */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(scheduleSizeHeroes);
    }

    // the nav reflows on its own schedule too — a font swap, or the
    // hamburger dropdown opening — and none of that raises a window
    // resize event, so the listeners above would miss it
    if (navWrap && "ResizeObserver" in window) {
      new ResizeObserver(scheduleSizeHeroes).observe(navWrap);
    }

    /* scramble-text.js pins its title's height for the 1.5s it animates,
       so a solve landing mid-animation measures the resolved layout
       rather than a line-count that random glyphs happened to produce
       (see the comment there). It fires this when it releases the pin —
       worth a final solve because the height it pinned was whatever the
       title measured when the animation STARTED, which on a cold load can
       still be the pre-swap fallback font. */
    document.addEventListener("scramble:done", scheduleSizeHeroes);
  }

  /* ---------- homepage case studies: sticky sidebar, centered in the
     viewport ----------
     .case-studies__side is CSS position: sticky + height: 100vh with its
     content flex-centered inside, so once pinned it sits at the
     viewport's vertical middle instead of hugging the top edge (see
     .case-studies__side). --side-max-h caps that 100vh box at
     .project-grid's real rendered height — measured here since pure CSS
     can't know it — so a short card list / tall viewport can't stretch
     the sidebar (and the row around it) taller than the list itself.

     The sidebar's own CSS margin-top (a small fixed value) is what keeps
     it near the top of the section — it needs to already be visible the
     moment you scroll into the section, not pushed down out of view
     while waiting to pin, so this only measures the height cap and
     leaves that margin alone. */
  const projectGrid = document.querySelector(".project-grid");
  const caseStudiesSide = document.querySelector(".case-studies__side");
  const desktopLayout = window.matchMedia("(min-width: 901px)");

  if (projectGrid && caseStudiesSide) {
    const syncCaseStudiesSticky = () => {
      if (!desktopLayout.matches) {
        // mobile stacks this column statically — let its own CSS
        // (height: auto) take over instead
        caseStudiesSide.style.removeProperty("--side-max-h");
        return;
      }

      const gridHeight = projectGrid.getBoundingClientRect().height;
      caseStudiesSide.style.setProperty("--side-max-h", `${gridHeight}px`);
    };

    syncCaseStudiesSticky();
    window.addEventListener("resize", syncCaseStudiesSticky);
    window.addEventListener("load", syncCaseStudiesSticky);
  }

  /* ---------- mobile nav toggle ---------- */
  const navToggle = document.getElementById("navToggle");
  const navLinks = document.getElementById("navLinks");

  if (navToggle && navLinks) {
    navToggle.addEventListener("click", () => {
      const isOpen = navLinks.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
    });

    navLinks.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        navLinks.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- scroll reveal ---------- */
  const revealEls = document.querySelectorAll(".reveal");
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // a project card's image flip-in (rotateY(-15deg) -> 0deg, see the CSS
  // comment on .project-card__media.is-flipping-in) is meant to start on
  // the exact same frame as the card's own opacity fade — it used to run
  // off a second, separate IntersectionObserver with an extra artificial
  // delay tacked on to keep it from finishing invisibly fast, but two
  // independent observers (even with matching threshold/rootMargin) can
  // still land in different callback batches, so the two animations
  // visibly drifted apart. Called from inside the same reveal callback
  // below instead, so both trigger in the same synchronous tick.
  const startCardFlip = (card) => {
    const media = card.querySelector(".project-card__media.is-flipping-in");
    if (!media) return;

    media.classList.replace("is-flipping-in", "is-flipped-in");

    // once the rotateY(-15deg) -> rotateY(0deg) animation lands, drop the
    // class entirely so the element falls back to .project-card__media's
    // plain (fast) hover-tilt transition for every mousemove from here on
    // — see that same CSS comment for why this can't just stay on
    // .reveal/.is-visible, which never gets removed once added
    const onTransitionEnd = (event) => {
      if (event.propertyName !== "transform") return;
      media.classList.remove("is-flipped-in");
      media.removeEventListener("transitionend", onTransitionEnd);
    };

    media.addEventListener("transitionend", onTransitionEnd);
  };

  if (revealEls.length) {
    if (prefersReduced || !("IntersectionObserver" in window)) {
      revealEls.forEach((el) => {
        el.classList.add("is-visible");
        el.querySelectorAll(".project-card__media.is-flipping-in").forEach((media) =>
          media.classList.remove("is-flipping-in")
        );
      });
    } else {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              startCardFlip(entry.target);
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
      );

      revealEls.forEach((el) => observer.observe(el));
    }
  }

  /* ---------- lazy-load in-view videos ----------
     Case-study demo videos use data-src instead of src, so nothing
     downloads until the clip is actually about to be seen. A poster
     image (see markup) fills the space in the meantime. Once loaded,
     the clip also pauses when scrolled out of view and resumes when
     scrolled back in, so only what's on screen is ever decoding. */
  const lazyVideos = document.querySelectorAll("video[data-src]");

  if (lazyVideos.length) {
    if (!("IntersectionObserver" in window)) {
      lazyVideos.forEach((video) => {
        video.src = video.dataset.src;
        video.load();
        video.play().catch(() => {});
      });
    } else {
      const videoObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const video = entry.target;

            if (entry.isIntersecting) {
              if (!video.src) {
                video.src = video.dataset.src;
                video.load();
              }
              video.play().catch(() => {});
            } else {
              video.pause();
            }
          });
        },
        { rootMargin: "200px 0px" }
      );

      lazyVideos.forEach((video) => videoObserver.observe(video));
    }
  }

  /* ---------- project filtering ---------- */
  const filterPills = document.querySelectorAll(".filter-pill");
  const projectCards = document.querySelectorAll(".project-card");

  if (filterPills.length && projectCards.length) {
    filterPills.forEach((pill) => {
      pill.addEventListener("click", () => {
        filterPills.forEach((p) => p.classList.remove("is-active"));
        pill.classList.add("is-active");

        const filter = pill.dataset.filter;

        projectCards.forEach((card) => {
          // a card can belong to more than one category (comma-separated,
          // e.g. Ground FX is both "marketing" and "event-coordination")
          const categories = card.dataset.category.split(",").map((c) => c.trim());
          const match = filter === "all" || categories.includes(filter);
          card.style.display = match ? "" : "none";
        });
      });
    });
  }

  /* ---------- project card image tilt ----------
     Replaces the old translateY-lift/image-zoom hover with a
     mouse-tracked 3D tilt — scoped to .project-card__media itself
     (listeners live on the media box, not the whole card link), so it
     never touches the tag row/title/paragraph below it. The rotate is
     applied to .project-card__media, not the img inside it — that way
     the rounded corners tilt as one rigid object along with the
     picture, instead of the image swimming around inside a flat,
     static rounded window (which also used to let the placeholder
     background show through at the edges). The CSS transition on
     .project-card__media stays on for every frame here (never toggled
     off) — that constant easing is what makes the tilt glide in/out
     instead of snapping straight to the cursor's angle the instant the
     pointer enters. Reuses prefersReduced from the scroll-reveal block
     above to skip the tilt entirely for reduced-motion users, leaving
     the image static.

     Guarded against the entrance flip above: is-flipping-in/
     is-flipped-in both set .project-card__media's own inline transform
     via that 1.1s CSS transition, and inline style always wins over a
     CSS rule — so if the cursor happened to already be sitting on a
     card (or wanders onto one) while its flip is still running,
     mouseenter/mousemove writing a new inline transform on every event
     would hijack the in-flight animation toward the tiny hover-tilt
     angle instead of letting it finish its sweep to rotateY(0deg),
     which reads as the card jerking to a stop mid-flip. Skipping tilt
     application while either class is present leaves the flip's own
     transition alone to finish untouched; hover resumes normally the
     moment the classes are stripped (see startCardFlip above). */
  const mapRange = (value, minA, maxA, minB, maxB) =>
    minB + ((value - minA) * (maxB - minB)) / (maxA - minA);

  if (!prefersReduced) {
    document.querySelectorAll(".project-card__media").forEach((media) => {
      const isFlipping = () =>
        media.classList.contains("is-flipping-in") || media.classList.contains("is-flipped-in");

      const applyTilt = (clientX, clientY) => {
        const rect = media.getBoundingClientRect();
        const rotateY = mapRange(clientX - rect.left, 0, rect.width, -10, 10);
        const rotateX = mapRange(clientY - rect.top, 0, rect.height, 10, -10);

        media.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      };

      media.addEventListener("mouseenter", (event) => {
        if (isFlipping()) return;
        applyTilt(event.clientX, event.clientY);
      });

      media.addEventListener("mousemove", (event) => {
        if (isFlipping()) return;
        applyTilt(event.clientX, event.clientY);
      });

      media.addEventListener("mouseleave", () => {
        media.style.transform = "";
      });
    });
  }

  /* ---------- digital media: motion design tag filter ----------
     Same click-a-pill-to-filter interaction as the homepage's case-study
     filters above, but a tile here can carry more than one tag (data-tags,
     comma-separated) since a single video can demonstrate several skills
     at once — so this can't reuse that block's exact-match logic and gets
     its own small handler instead. */
  document.querySelectorAll("[data-media-filter-group]").forEach((group) => {
    const pills = group.querySelectorAll("[data-media-filter]");
    const section = group.closest("section");
    // grid items are either a bare .cs-square (placeholder tiles) or a
    // .dm-media-item wrapper around a .cs-square + its title/tag caption —
    // select every direct child either way, then find the tagged square
    // inside each one when it's time to read its tags.
    const tiles = section ? section.querySelectorAll(".dm-media-grid > *") : [];
    if (!pills.length || !tiles.length) return;

    pills.forEach((pill) => {
      pill.addEventListener("click", () => {
        pills.forEach((p) => p.classList.remove("is-active"));
        pill.classList.add("is-active");

        const filter = pill.dataset.mediaFilter;

        tiles.forEach((tile) => {
          const square = tile.matches(".cs-square") ? tile : tile.querySelector(".cs-square");
          const tags = (square?.dataset.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
          const match = filter === "all" || tags.includes(filter);
          tile.style.display = match ? "" : "none";
        });
      });
    });
  });

  /* ---------- click-to-play video tiles (e.g. Marketing: Social media campaigns) ----------
     Each [data-yt-id] tile starts as a plain thumbnail + play button; nothing YouTube-
     related loads until it's clicked, at which point the thumbnail is swapped for a
     real embedded player so the video plays inline instead of opening a new tab. */
  document.querySelectorAll(".cs-video-tile[data-yt-id]").forEach((tile) => {
    const trigger = tile.querySelector(".cs-video-tile__trigger");
    if (!trigger) return;

    trigger.addEventListener("click", () => {
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube-nocookie.com/embed/${tile.dataset.ytId}?autoplay=1&rel=0`;
      iframe.title = trigger.getAttribute("aria-label") || "YouTube video";
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;
      tile.replaceChildren(iframe);
    });
  });

  /* ---------- toggle panel groups (e.g. Process: Final prototype / Rough draft, Design
     validation: Option A / Option B) ----------
     A [data-cs-toggle] pill group switches every matching [data-cs-toggle-panel] found
     anywhere in its parent, matched by [data-cs-toggle-target] — not just the toggle's
     next sibling, so one Option A/B click can drive both the screenshot frame AND a
     separate set of quote panels living alongside it. */
  document.querySelectorAll("[data-cs-toggle]").forEach((group) => {
    const buttons = group.querySelectorAll("[data-cs-toggle-target]");
    const scope = group.parentElement;
    if (!scope) return;

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.csToggleTarget;
        buttons.forEach((b) => b.classList.toggle("is-active", b === btn));
        scope.querySelectorAll("[data-cs-toggle-panel]").forEach((panel) => {
          panel.classList.toggle("is-active", panel.dataset.csTogglePanel === target);
        });
      });
    });
  });
})();
