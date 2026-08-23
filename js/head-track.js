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
// ============================================================

(function () {
  "use strict";

  const modelViewer = document.getElementById("dmModel");
  if (!modelViewer) return;

  const MAX_YAW_DEG = 22; // left/right
  const MAX_PITCH_DEG = 12; // up/down
  const DAMPING = 0.08; // lerp factor per frame — lower = smoother/slower follow

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

    let targetYaw = 0;
    let targetPitch = 0;
    let currentYaw = 0;
    let currentPitch = 0;
    let exposureNudge = false;

    const stage = document.querySelector(".dm-hero__track-zone") || document.querySelector(".dm-hero__media");

    window.addEventListener("mousemove", (e) => {
      const rect = (stage || modelViewer).getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const nx = Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width / 2)));
      const ny = Math.max(-1, Math.min(1, (e.clientY - cy) / (rect.height / 2)));

      targetYaw = nx * (MAX_YAW_DEG * Math.PI / 180);
      targetPitch = ny * (MAX_PITCH_DEG * Math.PI / 180);
    });

    function tick() {
      currentYaw += (targetYaw - currentYaw) * DAMPING;
      currentPitch += (targetPitch - currentPitch) * DAMPING;

      const qYaw = new Quaternion().setFromAxisAngle(yAxis, currentYaw);
      const qPitch = new Quaternion().setFromAxisAngle(xAxis, currentPitch);
      const offset = qYaw.multiply(qPitch);

      headBone.quaternion.copy(restQuaternion).multiply(offset);

      // <model-viewer> has no public "requestRender" API — nudging a real
      // reactive attribute by an imperceptible epsilon reliably forces it
      // to redraw every frame since exposure changes are always re-rendered.
      exposureNudge = !exposureNudge;
      modelViewer.exposure = exposureNudge ? 0.9500001 : 0.95;

      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  if (modelViewer.loaded) {
    initHeadTracking();
  } else {
    modelViewer.addEventListener("load", initHeadTracking, { once: true });
  }
})();
