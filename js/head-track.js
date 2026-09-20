// ============================================================
// Jaydon — Digital Media page
// Head-bone cursor tracking for the <model-viewer> 3D model.
//
// IMPORTANT: <model-viewer> has no official public API for posing
// bones. This reaches into its internal Three.js scene via
// reflection (scanning own-property symbols for something that
// looks like a scene graph). This is inherently fragile and can
// break on a future @google/model-viewer version bump — if the
// console shows the "couldn't find head bone" warning below, this
// is the first place to look.
//
// Performance: this used to run requestAnimationFrame forever, the
// entire time the page was open, forcing a full WebGL re-render every
// single frame (via the exposure-nudge hack below) regardless of
// whether the model was on-screen or the mouse had moved recently —
// a real cost on weaker/integrated GPUs. Now it only runs while the
// model is actually in the viewport (IntersectionObserver) AND either
// still catching up to the cursor or recently moved — once it's
// settled and idle, the loop stops entirely instead of rendering an
// unchanging frame 60 times a second. A mousemove (or the model
// scrolling back into view) restarts it.
//
// Also: the follow-speed used to be a flat per-FRAME lerp (currentYaw
// += (target - current) * DAMPING), which is frame-RATE dependent —
// on a machine rendering fewer frames per second, each step is the
// same fraction of the remaining distance, but there are fewer steps
// per second of real time, so the head visibly takes longer to catch
// up. Converted to a per-SECOND exponential decay (using elapsed time
// between frames, not a frame count) so the catch-up speed is the
// same in real time regardless of frame rate — tuned to match DAMPING's
// original feel at a 60fps baseline.
// ============================================================

(function () {
  "use strict";

  const modelViewer = document.getElementById("dmModel");
  if (!modelViewer) return;

  const MAX_YAW_DEG = 22; // left/right
  const MAX_PITCH_DEG = 12; // up/down
  // per-frame-at-60fps follow speed — converted to a rate below, not used
  // directly as a multiplier. Was 0.08 (~0.6s to catch up), which read as
  // lag; 0.18 lands in ~0.25s and still eases rather than snapping.
  const DAMPING = 0.18;
  // continuous decay rate (per second) that reproduces DAMPING's feel at 60fps:
  // solves (1 - RATE_PER_SEC-equivalent step)^(1/60s) = (1 - DAMPING) per 1/60s frame
  const DECAY_RATE = -Math.log(1 - DAMPING) * 60;
  const SETTLE_EPS = 0.0005; // radians — close enough to target to call it "settled"
  const IDLE_MS = 250; // stop rendering this long after the cursor stops moving AND we've settled

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return; // static rest pose — no cursor-driven motion at all

  /* ---- cursor position is recorded from the moment this file runs ----

     initHeadTracking() below does not run until <model-viewer> fires its
     load event, and that is deliberately late: the element's bundle is not
     even requested until the hero's title animation finishes (see the
     deferral script at the bottom of digital-media.html). Until then the
     visitor is looking at the poster image, which cannot track anything.

     The bug this fixes is what happened AFTER that wait. targetYaw and
     targetPitch were only ever written inside the mousemove handler, and
     that handler was installed inside initHeadTracking — so the model
     could finish loading with the cursor sitting somewhere well off to
     one side and the head would stay in its neutral rest pose, looking
     straight ahead, until the visitor happened to move the mouse AGAIN.
     Arriving on the page, watching the head ignore a stationary cursor,
     and then seeing it snap to attention on the next twitch is exactly
     the "it takes a second before it follows" symptom.

     So the listener moves out here, where it is attached while the page
     is still parsing, and it only records coordinates. initHeadTracking
     picks up whatever the cursor was already doing the moment it is
     ready — see aimAtPointer() and its call at the end of that function. */
  let pointerX = null;
  let pointerY = null;
  let onPointerMove = null;

  window.addEventListener(
    "mousemove",
    (e) => {
      pointerX = e.clientX;
      pointerY = e.clientY;
      if (onPointerMove) onPointerMove();
    },
    { passive: true }
  );

  function findHeadBone(el) {
    const visited = new Set();

    function search(obj, depth) {
      if (!obj || typeof obj !== "object" || visited.has(obj) || depth > 8) return null;
      visited.add(obj);

      if (obj.isBone && typeof obj.name === "string" && obj.name.toLowerCase() === "head") {
        return obj;
      }
      if (Array.isArray(obj.children)) {
        for (const child of obj.children) {
          const found = search(child, depth + 1);
          if (found) return found;
        }
      }
      return null;
    }

    const symbols = Object.getOwnPropertySymbols(el);
    for (const sym of symbols) {
      let val;
      try {
        val = el[sym];
      } catch (e) {
        continue;
      }
      if (val && typeof val === "object" && Array.isArray(val.children)) {
        const found = search(val, 0);
        if (found) return found;
      }
    }
    return null;
  }

  function initHeadTracking() {
    const headBone = findHeadBone(modelViewer);

    if (!headBone) {
      console.warn(
        "[head-track] Couldn't find a bone named \"head\" inside <model-viewer>'s internal scene. " +
        "This relies on undocumented internals of @google/model-viewer and can break on a version " +
        "update — head-cursor-tracking is disabled, everything else on the page still works."
      );
      return;
    }

    console.info("[head-track] Found head bone — cursor tracking active.", headBone);

    const Quaternion = headBone.quaternion.constructor;
    const Vector3 = headBone.position.constructor;
    const restQuaternion = headBone.quaternion.clone();
    const xAxis = new Vector3(1, 0, 0);
    const yAxis = new Vector3(0, 1, 0);
    // reused every frame instead of allocated fresh — the old version did
    // `new Quaternion()` twice per frame, forever
    const qYaw = new Quaternion();
    const qPitch = new Quaternion();

    let targetYaw = 0;
    let targetPitch = 0;
    let currentYaw = 0;
    let currentPitch = 0;
    let exposureNudge = false;

    let isVisible = false;
    let running = false;
    let lastFrameTime = null;
    let lastMoveTime = 0;

    const trackZone = document.querySelector(".dm-hero__track-zone");
    const media = document.querySelector(".dm-hero__media");

    function applyPose() {
      qYaw.setFromAxisAngle(yAxis, currentYaw);
      qPitch.setFromAxisAngle(xAxis, currentPitch);
      headBone.quaternion.copy(restQuaternion).multiply(qYaw.multiply(qPitch));

      // <model-viewer> has no public "requestRender" API — nudging a real
      // reactive attribute by an imperceptible epsilon reliably forces it
      // to redraw. Only called on frames that actually changed the pose
      // (see tick below), not unconditionally every frame anymore.
      exposureNudge = !exposureNudge;
      modelViewer.exposure = exposureNudge ? 0.9500001 : 0.95;
    }

    function ensureRunning() {
      if (running || !isVisible) return;
      running = true;
      lastFrameTime = null;
      requestAnimationFrame(tick);
    }

    function tick(now) {
      if (!isVisible) {
        running = false;
        return; // model scrolled off-screen — stop rendering until it's back
      }

      const dt = lastFrameTime === null ? 1 / 60 : Math.min((now - lastFrameTime) / 1000, 1 / 15);
      lastFrameTime = now;

      const factor = 1 - Math.exp(-DECAY_RATE * dt);
      currentYaw += (targetYaw - currentYaw) * factor;
      currentPitch += (targetPitch - currentPitch) * factor;

      const settled =
        Math.abs(targetYaw - currentYaw) < SETTLE_EPS &&
        Math.abs(targetPitch - currentPitch) < SETTLE_EPS;
      const recentlyMoved = now - lastMoveTime < IDLE_MS;

      if (settled && !recentlyMoved) {
        // snap exactly to target, render that final frame, then stop the
        // loop entirely instead of rendering an unchanging pose forever
        currentYaw = targetYaw;
        currentPitch = targetPitch;
        applyPose();
        running = false;
        return;
      }

      applyPose();
      requestAnimationFrame(tick);
    }

    /* Reads the stored pointer rather than an event object, so the same
       code serves a live mousemove and the catch-up call at the end of
       this function. No-ops until the cursor has been somewhere: with no
       reading to aim at, the rest pose is the right pose. */
    function aimAtPointer() {
      if (pointerX === null) return;

      /* The head turns about the character's own centre (the track zone),
         but full turn is reached at the edge of the whole hero (clipped to
         the window), not at the edge of the zone. Normalising against the
         zone's half-width alone saturated the moment the cursor left it:
         the zone is the right 42% of the hero, so across the entire left
         side — the title and buttons, where the cursor usually is — the
         head sat pinned at full left and ignored every movement until the
         cursor crossed back in. That dead band was the "pause before it
         follows". Measuring each side to its own edge keeps the mapping
         continuous everywhere, lopsided as the two sides are. */
      const zone = (trackZone || modelViewer).getBoundingClientRect();
      const bounds = (media || modelViewer).getBoundingClientRect();
      const cx = zone.left + zone.width / 2;
      const cy = zone.top + zone.height / 2;

      const left = Math.max(bounds.left, 0);
      const right = Math.min(bounds.right, window.innerWidth);
      const top = Math.max(bounds.top, 0);
      const bottom = Math.min(bounds.bottom, window.innerHeight);

      const spanX = pointerX < cx ? cx - left : right - cx;
      const spanY = pointerY < cy ? cy - top : bottom - cy;
      const clamp = (v) => Math.max(-1, Math.min(1, v));

      const nx = spanX > 0 ? clamp((pointerX - cx) / spanX) : 0;
      const ny = spanY > 0 ? clamp((pointerY - cy) / spanY) : 0;

      targetYaw = nx * (MAX_YAW_DEG * Math.PI / 180);
      targetPitch = ny * (MAX_PITCH_DEG * Math.PI / 180);
      lastMoveTime = performance.now();
      ensureRunning();
    }

    onPointerMove = aimAtPointer;

    if (media && "IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          isVisible = entries[0].isIntersecting;
          if (isVisible) ensureRunning();
        },
        { threshold: 0 }
      );
      io.observe(media);
    } else {
      // no IntersectionObserver support (very old browser) — fall back to
      // always-visible rather than a tracking effect that never starts
      isVisible = true;
    }

    /* Catch up to wherever the cursor already is. Safe to call before the
       observer above has reported in: ensureRunning() declines to start a
       loop while isVisible is still false, and the observer's own callback
       calls it again once the model is on screen — by which point these
       targets are already set, so the head animates straight to them. */
    aimAtPointer();
  }

  if (modelViewer.loaded) {
    initHeadTracking();
  } else {
    modelViewer.addEventListener("load", initHeadTracking, { once: true });
  }
})();
