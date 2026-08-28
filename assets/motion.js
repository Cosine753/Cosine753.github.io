(() => {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const header = document.getElementById("topbar");
  const iris = document.getElementById("iris");

  const onScroll = () => {
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 12);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  if (reduce) {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.16, rootMargin: "0px 0px -8% 0px" },
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  if (!iris) return;
  const setGaze = (x, y) => {
    iris.style.setProperty("--mx", `${x * 22}px`);
    iris.style.setProperty("--my", `${y * 16}px`);
  };
  iris.addEventListener("pointermove", (event) => {
    const box = iris.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    setGaze(x, y);
  });
  iris.addEventListener("pointerleave", () => setGaze(0, 0));
  window.addEventListener(
    "pointermove",
    (event) => {
      if (event.target.closest && event.target.closest(".iris")) return;
      const x = event.clientX / window.innerWidth - 0.5;
      const y = event.clientY / window.innerHeight - 0.5;
      setGaze(x * 0.45, y * 0.35);
    },
    { passive: true },
  );
})();
