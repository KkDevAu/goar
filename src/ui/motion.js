(function (global) {
  "use strict";

  const SETTLE = "out(4)";
  const LEAVE = "in(2)";
  let started = false;
  let barTween = null;

  function reduced() {
    try {
      return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (_) {
      return false;
    }
  }

  function api() {
    const a = global.anime;
    if (!a || typeof a.animate !== "function") return null;
    return a;
  }

  function kill(targets) {
    const a = api();
    if (!a || !targets) return;
    try {
      if (typeof a.remove === "function") a.remove(targets);
      else if (a.engine && a.engine.cancel) a.engine.cancel(targets);
    } catch (_) {}
  }

  function studioOpen() {
    if (started) return;
    started = true;
    const a = api();
    const mark = document.querySelector("#setup .goar-mark");
    const line = document.getElementById("studio-line");
    const bar = document.getElementById("bootPhase");
    if (reduced() || !a) {
      if (mark) mark.style.opacity = "1";
      if (line) line.style.transform = "scaleX(1)";
      if (bar) bar.style.opacity = "1";
      return;
    }
    if (mark) {
      mark.style.opacity = "0";
      mark.style.filter = "blur(8px)";
    }
    if (line) {
      line.style.transform = "scaleX(0)";
      line.style.opacity = "0";
    }
    if (bar) bar.style.opacity = "0";

    const tl = typeof a.createTimeline === "function"
      ? a.createTimeline({ defaults: { ease: SETTLE } })
      : null;

    const g = {
      opacity: [0, 1],
      scale: [0.97, 1],
      y: [6, 0],
      filter: ["blur(8px)", "blur(0px)"],
      duration: 920,
    };
    const hair = {
      scaleX: [0, 1],
      opacity: [0, 0.45],
      duration: 640,
    };
    const meta = {
      opacity: [0, 1],
      y: [4, 0],
      duration: 480,
    };

    if (tl) {
      if (mark) tl.add(mark, g, 160);
      if (line) tl.add(line, hair, 780);
      if (bar) tl.add(bar, meta, 980);
    } else {
      if (mark) a.animate(mark, Object.assign({ delay: 160, ease: SETTLE }, g));
      if (line) a.animate(line, Object.assign({ delay: 780, ease: SETTLE }, hair));
      if (bar) a.animate(bar, Object.assign({ delay: 980, ease: SETTLE }, meta));
    }
  }

  function progress(pct) {
    const fill = document.getElementById("barFill");
    if (!fill) return;
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    if (reduced() || !api()) {
      fill.style.width = p + "%";
      return;
    }
    const a = api();
    try { if (barTween && barTween.pause) barTween.pause(); } catch (_) {}
    barTween = a.animate(fill, {
      width: p + "%",
      duration: 280,
      ease: SETTLE,
      composition: "blend",
    });
  }

  function toCred() {
    const a = api();
    const bp = document.getElementById("bootPhase");
    const line = document.getElementById("studio-line");
    const cp = document.getElementById("credPhase");
    if (!cp) return;
    const show = () => {
      if (bp) {
        bp.hidden = true;
        bp.style.display = "none";
      }
      if (line) line.style.display = "none";
      cp.hidden = false;
      cp.classList.add("on");
    };
    if (reduced() || !a) {
      show();
      return;
    }
    const leaving = [bp, line].filter(Boolean);
    if (leaving.length) {
      a.animate(leaving, {
        opacity: [1, 0],
        y: [0, -6],
        duration: 280,
        ease: LEAVE,
        onComplete: show,
      });
    } else show();

    requestAnimationFrame(() => {
      const bits = [...cp.querySelectorAll(".hint, label, select, input, #credGo")];
      bits.forEach((n) => { n.style.opacity = "0"; });
      a.animate(bits, {
        opacity: [0, 1],
        y: [8, 0],
        duration: 420,
        delay: a.stagger ? a.stagger(45, { start: 80 }) : 80,
        ease: SETTLE,
      });
    });
  }

  function leaveSetup(then) {
    const setup = document.getElementById("setup");
    const a = api();
    const done = () => { if (typeof then === "function") then(); };
    if (!setup || reduced() || !a) {
      if (setup) {
        setup.classList.add("hide");
        setup.classList.remove("open");
      }
      done();
      return;
    }
    a.animate(setup, {
      opacity: [1, 0],
      duration: 420,
      ease: LEAVE,
      onComplete: () => {
        setup.classList.add("hide");
        setup.classList.remove("open");
        setup.style.opacity = "";
        done();
      },
    });
  }

  function enterStage() {
    const a = api();
    if (reduced() || !a) return;
    const welcome = document.getElementById("welcome");
    const composer = document.querySelector("#input-wrap .input-box");
    const rail = document.getElementById("side-rail");

    if (rail) a.animate(rail, { opacity: [0, 1], duration: 360, ease: SETTLE });

    if (welcome && welcome.classList.contains("on")) {
      const mark = welcome.querySelector(".goar-mark");
      const title = welcome.querySelector(".w-title");
      const sub = welcome.querySelector(".w-sub");
      const chips = welcome.querySelector(".w-chips");
      const tl = typeof a.createTimeline === "function"
        ? a.createTimeline({ defaults: { ease: SETTLE } })
        : null;
      if (mark) {
        const g = { opacity: [0, 1], scale: [0.97, 1], y: [6, 0], filter: ["blur(6px)", "blur(0px)"], duration: 720 };
        if (tl) tl.add(mark, g, 40);
        else a.animate(mark, Object.assign({ delay: 40, ease: SETTLE }, g));
      }
      if (title) {
        const t = { opacity: [0, 1], y: [6, 0], duration: 520 };
        if (tl) tl.add(title, t, 280);
        else a.animate(title, Object.assign({ delay: 280, ease: SETTLE }, t));
      }
      if (sub) {
        const s = { opacity: [0, 1], duration: 400 };
        if (tl) tl.add(sub, s, 460);
        else a.animate(sub, Object.assign({ delay: 460, ease: SETTLE }, s));
      }
      if (chips) {
        const c = { opacity: [0, 1], y: [4, 0], duration: 400 };
        if (tl) tl.add(chips, c, 560);
        else a.animate(chips, Object.assign({ delay: 560, ease: SETTLE }, c));
      }
    }
    if (composer) {
      a.animate(composer, {
        opacity: [0, 1],
        y: [10, 0],
        duration: 480,
        delay: 200,
        ease: SETTLE,
      });
    }
  }

  function enterMsg(el) {
    if (!el || reduced()) return;
    const a = api();
    if (!a) return;
    a.animate(el, {
      opacity: [0, 1],
      y: [5, 0],
      duration: 240,
      ease: SETTLE,
    });
  }

  function leaveWelcome() {
    const w = document.getElementById("welcome");
    if (!w || w.classList.contains("hide")) return;
    const a = api();
    const hide = () => {
      w.classList.add("hide");
      w.classList.remove("show", "on");
      w.style.display = "none";
    };
    if (reduced() || !a) {
      hide();
      return;
    }
    a.animate(w, {
      opacity: [1, 0],
      y: [0, -6],
      duration: 220,
      ease: LEAVE,
      onComplete: hide,
    });
  }

  function boot() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", studioOpen, { once: true });
    } else {
      studioOpen();
    }
  }

  global.goarMotion = {
    studioOpen,
    toCred,
    leaveSetup,
    enterStage,
    enterMsg,
    leaveWelcome,
    progress,
    reduced,
  };
  boot();
})(typeof window !== "undefined" ? window : globalThis);
