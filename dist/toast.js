"use strict";

// One lifecycle for every transient notification, including replacement mid-fade.
window.SnaapToast = (() => {
  let dismissTimer;
  function show(message, align) {
    const notice = document.querySelector("#toast");
    clearTimeout(dismissTimer);
    notice.getAnimations().forEach((animation) => animation.cancel());
    notice.textContent = message;
    notice.hidden = false;
    align?.();
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduceMotion)
      notice.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 180,
        easing: "ease-out",
      });
    dismissTimer = setTimeout(() => {
      if (reduceMotion) {
        notice.hidden = true;
        return;
      }
      const exit = notice.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 220,
        easing: "ease-in",
        fill: "forwards",
      });
      exit.finished.then(() => {
        notice.hidden = true;
        exit.cancel();
      }).catch(() => {});
    }, message.length > 80 ? 3500 : 1800);
  }
  return { show };
})();
