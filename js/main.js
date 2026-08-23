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

  /* ---------- homepage hero grid — extend to the true page top ----------
     .hero__grid--homepage lives at the body level (see index.html) so it
     isn't clipped by .hero's own overflow: hidden or pushed down by the
     nav-wrap's layout space. Its top/left/right are pinned via CSS, but
     its height has to reach from the true page top through the bottom
     of .hero — a distance that depends on the nav's height (varies by
     breakpoint) and .hero's own height (varies with content), so it's
     computed here rather than in CSS. */
  const homepageHeroGrid = document.querySelector(".hero__grid--homepage");
  const hero = document.querySelector(".hero");

  if (homepageHeroGrid && hero) {
    const sizeHomepageHeroGrid = () => {
      const heroBottom = hero.getBoundingClientRect().bottom + window.scrollY;
      homepageHeroGrid.style.height = `${heroBottom}px`;
    };

    sizeHomepageHeroGrid();
    window.addEventListener("resize", sizeHomepageHeroGrid);
    window.addEventListener("load", sizeHomepageHeroGrid);
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

  if (revealEls.length) {
    if (prefersReduced || !("IntersectionObserver" in window)) {
      revealEls.forEach((el) => el.classList.add("is-visible"));
    } else {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
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
