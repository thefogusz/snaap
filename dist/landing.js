const logo = document.querySelector(".logo-play");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const menu = document.querySelector("#site-menu");
const menuToggle = document.querySelector(".menu-toggle");
menuToggle.hidden = false;
menuToggle.addEventListener("click", () => menu.showModal());
document
  .querySelector(".menu-close")
  .addEventListener("click", () => menu.close());
menu.addEventListener("click", (event) => {
  if (event.target === menu || event.target.closest("a")) menu.close();
});
let pointerFrame = 0;
logo.addEventListener("pointermove", (event) => {
  if (reducedMotion.matches || event.pointerType === "touch") return;
  cancelAnimationFrame(pointerFrame);
  pointerFrame = requestAnimationFrame(() => {
    const bounds = logo.getBoundingClientRect();
    logo.style.setProperty(
      "--y",
      `${((event.clientX - bounds.left) / bounds.width - 0.5) * 24}deg`,
    );
    logo.style.setProperty(
      "--x",
      `${((event.clientY - bounds.top) / bounds.height - 0.5) * -18}deg`,
    );
  });
});
logo.addEventListener("pointerleave", () => {
  cancelAnimationFrame(pointerFrame);
  logo.style.setProperty("--x", "0deg");
  logo.style.setProperty("--y", "0deg");
});
logo.addEventListener("click", () => {
  const expanded = logo.getAttribute("aria-pressed") !== "true";
  logo.setAttribute("aria-pressed", String(expanded));
  document.querySelector("#play-label").textContent = expanded
    ? "CLICK TO BRING IT TOGETHER"
    : "CLICK TO SNAAP";
});

const steps = [...document.querySelectorAll("[data-step]")];
const panels = [...document.querySelectorAll("[data-panel]")];
steps.forEach((step) =>
  step.addEventListener("click", () => {
    steps.forEach((item) => {
      const selected = item === step;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== step.dataset.step;
    });
    document.querySelector("#demo-count").textContent =
      `0${Number(step.dataset.step) + 1} / 03`;
  }),
);

if (!reducedMotion.matches && "IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.remove("pending");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12 },
  );
  document.querySelectorAll(".reveal").forEach((section) => {
    section.classList.add("pending");
    observer.observe(section);
  });
}
