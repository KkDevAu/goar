(function (global) {
  "use strict";

  const EASE = "out(3)";
  const EASE_IN = "in(2)";
  let started = false;

  function reduced() {
    try {
      return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (_) {
      return false;
    }
  }

  function api() {
    const a = global.anime;
    if (!a) return null;
    return {
      animate: a.animate || a,
      timeline: a.createTimeline || a.timeline,
      stagger: a.stagger,
    };
  }

  function splitWords(el) {
    if (!el || el.dataset.split === "1") return el ? [...el.querySelectorAll(".gw")] : [];
    const text = el.textContent || "";
    el.textContent = "";
    const words = text.split(/(\s+)/);
    words.forEach((w) => {
      if (!w) return;
      if (/^\s+$/.test(w)) {
        el.appendChild(document.createTextNode(w));
        return;
      }
      const s = document.createElement("span");
      s.className = "gw";
      s.textContent = w;
      el.appendChild(s);
    });
    el.dataset.split = "1";
    return [...el.querySelectorAll(".gw")];
  }

  function studioOpen() {
    if (started) return;
    started = true;
    const A = api();
    const mark = document.querySelector("#setup .goar-mark");
    const bar = document.getElementById("bootPhase");
    if (reduced() || !A) {
      if (mark) mark.style.opacity = "1";
      if (bar) bar.style.opacity = "1";
      return;
    }
    if (mark) {
      mark.style.opacity = "0";
      A.animate(mark, {
        opacity: [0, 1],
        scale: [0.92, 1],
        y: [10, 0],
        filter: ["blur(10px)", "blur(0px)"],
        duration: 1100,
        ease: EASE,
        delay: 180,
      });
    }
    if (bar) {
      bar.style.opacity = "0";
      A.animate(bar, {
        opacity: [0, 1],
        y: [8, 0],
        duration: 700,
        delay: 720,
        ease: EASE,
      });
    }
  }

  function toCred() {
    const A = api();
    const bp = document.getElementById("bootPhase");
    const cp = document.getElementById("credPhase");
    if (!cp) return;
    const run = () => {
      if (bp) {
        bp.hidden = true;
        bp.style.display = "none";
      }
      cp.hidden = false;
      cp.classList.add("on");
    };
    if (reduced() || !A) {
      run();
      return;
    }
    if (bp && !bp.hidden) {
      A.animate(bp, {
        opacity: [1, 0],
        y: [0, -10],
        filter: ["blur(0px)", "blur(4px)"],
        duration: 380,
        ease: EASE_IN,
        onComplete: run,
      });
    } else run();
    requestAnimationFrame(() => {
      const bits = cp.querySelectorAll("label, select, input, .hint, #credGo, #credStatus");
      bits.forEach((n) => { n.style.opacity = "0"; });
      if (A.stagger) {
        A.animate(bits, {
          opacity: [0, 1],
          y: [14, 0],
          filter: ["blur(5px)", "blur(0px)"],
          duration: 520,
          delay: A.stagger(70, { start: 120 }),
          ease: EASE,
        });
      }
    });
  }

  function leaveSetup(then) {
    const setup = document.getElementById("setup");
    const A = api();
    const done = () => { if (typeof then === "function") then(); };
    if (!setup || reduced() || !A) {
      if (setup) {
        setup.classList.add("hide");
        setup.classList.remove("open");
      }
      done();
      return;
    }
    A.animate(setup, {
      opacity: [1, 0],
      filter: ["blur(0px)", "blur(8px)"],
      scale: [1, 0.985],
      duration: 560,
      ease: EASE_IN,
      onComplete: () => {
        setup.classList.add("hide");
        setup.classList.remove("open");
        setup.style.opacity = "";
        setup.style.filter = "";
        setup.style.transform = "";
        done();
      },
    });
  }

  function enterStage() {
    const A = api();
    const welcome = document.getElementById("welcome");
    const composer = document.querySelector("#input-wrap .input-box");
    const rail = document.getElementById("side-rail");
    if (reduced() || !A) return;
    if (rail) {
      A.animate(rail, { opacity: [0, 1], x: [-8, 0], duration: 500, ease: EASE });
    }
    if (welcome && welcome.classList.contains("on")) {
      const mark = welcome.querySelector(".goar-mark");
      const title = welcome.querySelector(".w-title");
      const sub = welcome.querySelector(".w-sub");
      const chips = welcome.querySelectorAll(".w-chip");
      if (mark) {
        A.animate(mark, {
          opacity: [0, 1],
          scale: [0.9, 1],
          filter: ["blur(8px)", "blur(0px)"],
          duration: 800,
          ease: EASE,
        });
      }
      if (title) {
        const words = splitWords(title);
        A.animate(words.length ? words : title, {
          opacity: [0, 1],
          y: [12, 0],
          filter: ["blur(6px)", "blur(0px)"],
          duration: 640,
          delay: words.length && A.stagger ? A.stagger(80, { start: 180 }) : 180,
          ease: EASE,
        });
      }
      if (sub) {
        A.animate(sub, { opacity: [0, 1], y: [8, 0], duration: 500, delay: 420, ease: EASE });
      }
      if (chips.length) {
        A.animate(chips, {
          opacity: [0, 1],
          y: [8, 0],
          duration: 440,
          delay: A.stagger ? A.stagger(60, { start: 520 }) : 520,
          ease: EASE,
        });
      }
    }
    if (composer) {
      A.animate(composer, {
        opacity: [0, 1],
        y: [18, 0],
        duration: 620,
        delay: 280,
        ease: EASE,
      });
    }
  }

  function enterMsg(el) {
    if (!el || reduced()) return;
    const A = api();
    if (!A) return;
    A.animate(el, {
      opacity: [0, 1],
      y: [10, 0],
      filter: ["blur(4px)", "blur(0px)"],
      duration: 360,
      ease: EASE,
    });
  }

  function leaveWelcome() {
    const w = document.getElementById("welcome");
    if (!w || w.classList.contains("hide")) return;
    const A = api();
    const hide = () => {
      w.classList.add("hide");
      w.classList.remove("show", "on");
      w.style.display = "none";
    };
    if (reduced() || !A) {
      hide();
      return;
    }
    A.animate(w, {
      opacity: [1, 0],
      y: [-8, -16],
      filter: ["blur(0px)", "blur(6px)"],
      duration: 280,
      ease: EASE_IN,
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
    reduced,
  };
  boot();
})(typeof window !== "undefined" ? window : globalThis);
