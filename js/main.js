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
     CSS (html[data-theme="light"] { filter: invert(1) ... }). */
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

  /* ---------- homepage hero: fit the viewport, never crop ----------
     .hero's CSS (container-type: size + the --hero-fit custom property)
     shrinks everything inside it — video, title, description, button,
     padding — together as one unit once the available height gets
     tight, using cqh (the container's own height) as the budget. That
     budget has to be the space ACTUALLY left below the nav, not the raw
     viewport (100vh alone would ignore the nav's own footprint and
     still crop the hero by however tall the nav is) — measured here,
     since nav-wrap sits in normal flow right above .hero, .hero's own
     offsetTop already IS the nav's rendered height, no separate lookup
     needed.

     .hero__grid--homepage lives at the body level (see index.html) so it
     isn't clipped by .hero's own overflow: hidden or pushed down by the
     nav-wrap's layout space. Its top/left/right are pinned via CSS, but
     its height has to reach from the true page top through the bottom
     of .hero — computed here too, and after the height above since it
     reads .hero's rendered bottom edge. */
  const hero = document.querySelector(".hero");
  const homepageHeroGrid = document.querySelector(".hero__grid--homepage");

  if (hero) {
    const sizeHero = () => {
      const available = window.innerHeight - hero.offsetTop;
      hero.style.height = `${Math.max(available, 0)}px`;
    };

    const sizeHomepageHeroGrid = () => {
      if (!homepageHeroGrid) return;
      const heroBottom = hero.getBoundingClientRect().bottom + window.scrollY;
      homepageHeroGrid.style.height = `${heroBottom}px`;
    };

    const sizeHomepage = () => {
      sizeHero();
      sizeHomepageHeroGrid();
    };

    sizeHomepage();
    window.addEventListener("resize", sizeHomepage);
    window.addEventListener("load", sizeHomepage);
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
