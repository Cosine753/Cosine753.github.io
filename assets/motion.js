(() => {
  document.documentElement.classList.add("motion");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const header = document.getElementById("topbar");
  const iris = document.getElementById("iris");
  const navLinks = [...document.querySelectorAll(".site-header nav a[href^='#']")];
  const sections = navLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  const onScroll = () => {
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 12);
    const y = window.scrollY + window.innerHeight * 0.28;
    let current = sections[0];
    sections.forEach((section) => {
      if (section.offsetTop <= y) current = section;
    });
    navLinks.forEach((link) => {
      link.classList.toggle("is-on", current && link.getAttribute("href") === `#${current.id}`);
    });
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
    { threshold: 0.14, rootMargin: "0px 0px -6% 0px" },
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  if (!iris) return;
  let tx = 0;
  let ty = 0;
  let x = 0;
  let y = 0;
  const setTarget = (nx, ny) => {
    tx = nx;
    ty = ny;
  };
  const tick = () => {
    x += (tx - x) * 0.12;
    y += (ty - y) * 0.12;
    iris.style.setProperty("--mx", `${x * 24}px`);
    iris.style.setProperty("--my", `${y * 18}px`);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  iris.addEventListener("pointermove", (event) => {
    const box = iris.getBoundingClientRect();
    setTarget((event.clientX - box.left) / box.width - 0.5, (event.clientY - box.top) / box.height - 0.5);
  });
  iris.addEventListener("pointerleave", () => setTarget(0, 0));
  window.addEventListener(
    "pointermove",
    (event) => {
      if (event.target.closest && event.target.closest(".iris")) return;
      setTarget(event.clientX / window.innerWidth - 0.5, event.clientY / window.innerHeight - 0.5);
    },
    { passive: true },
  );
})();
