(() => {
  document.documentElement.classList.add("motion");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const header = document.getElementById("topbar");
  const iris = document.getElementById("iris");
  const nav = document.querySelector(".site-nav");
  const topButton = document.querySelector(".to-top");
  const skip = document.querySelector(".skip");
  const navLinks = [...document.querySelectorAll(".site-nav a[href^='#']")];
  const sections = navLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  const keepActiveNavVisible = () => {
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    const active = navLinks.find((link) => link.classList.contains("is-on"));
    const item = active?.closest("li") ?? active;
    if (!item) return;
    const margin = 12;
    const left = item.offsetLeft;
    const right = left + item.offsetWidth;
    const visibleLeft = nav.scrollLeft + margin;
    const visibleRight = nav.scrollLeft + nav.clientWidth - margin;
    if (left < visibleLeft) nav.scrollLeft = Math.max(0, left - margin);
    else if (right > visibleRight) nav.scrollLeft = Math.min(nav.scrollWidth - nav.clientWidth, right - nav.clientWidth + margin);
  };

  const updateScrollState = () => {
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 12);
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.max(0, Math.min(1, window.scrollY / maxScroll));
    document.documentElement.style.setProperty("--scroll-progress", progress.toFixed(4));
    const y = window.scrollY + window.innerHeight * 0.28;
    let current = sections[0];
    sections.forEach((section) => {
      if (section.offsetTop <= y) current = section;
    });
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
      current = sections[sections.length - 1] ?? current;
    }
    navLinks.forEach((link) => {
      const active = current && link.getAttribute("href") === `#${current.id}`;
      link.classList.toggle("is-on", active);
      if (active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
    keepActiveNavVisible();
    if (topButton) {
      const visible = window.scrollY > 320;
      topButton.classList.toggle("is-visible", visible);
      topButton.setAttribute("aria-hidden", String(!visible));
      topButton.tabIndex = visible ? 0 : -1;
    }
  };

  let scrollFrame = 0;
  const onScroll = () => {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = 0;
      updateScrollState();
    });
  };
  updateScrollState();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("hashchange", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  topButton?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  });
  skip?.addEventListener("click", (event) => {
    event.preventDefault();
    const target = document.getElementById("main");
    if (!target) return;
    history.replaceState(null, "", "#main");
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus();
    }
    updateScrollState();
  });

  const reveals = [...document.querySelectorAll(".reveal")];
  const revealAll = () => reveals.forEach((el) => el.classList.add("in"));

  if (reduce) {
    revealAll();
    return;
  }

  if ("IntersectionObserver" in window) {
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
    reveals.forEach((el) => io.observe(el));
  } else {
    // Older browsers should still show the content when the enhancement is unavailable.
    revealAll();
  }

  // Keep full-page captures and print previews useful even when no scrolling occurs.
  window.setTimeout(revealAll, 1500);

  if (!iris) return;
  let tx = 0;
  let ty = 0;
  let x = 0;
  let y = 0;
  let frame = 0;
  const setTarget = (nx, ny) => {
    tx = Math.max(-0.5, Math.min(0.5, nx));
    ty = Math.max(-0.5, Math.min(0.5, ny));
    if (!frame && !document.hidden) frame = window.requestAnimationFrame(tick);
  };
  const tick = () => {
    frame = 0;
    x += (tx - x) * 0.12;
    y += (ty - y) * 0.12;
    iris.style.setProperty("--mx", `${x * 24}px`);
    iris.style.setProperty("--my", `${y * 18}px`);
    if (Math.abs(tx - x) > 0.001 || Math.abs(ty - y) > 0.001) {
      frame = window.requestAnimationFrame(tick);
    }
  };

  iris.addEventListener("pointermove", (event) => {
    const box = iris.getBoundingClientRect();
    setTarget((event.clientX - box.left) / box.width - 0.5, (event.clientY - box.top) / box.height - 0.5);
  });
  iris.addEventListener("pointerleave", () => setTarget(0, 0));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    } else if (!document.hidden && (Math.abs(tx - x) > 0.001 || Math.abs(ty - y) > 0.001)) {
      frame = window.requestAnimationFrame(tick);
    }
  });
})();
