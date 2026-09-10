(() => {
  const apply = () => {
    if (!/\/brand-kinto\.html$/.test(location.pathname)) return;

    document.title = "餐桌與咖啡器物｜fréa";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = "fréa 精選餐桌器物與咖啡用品，從餐桌到一杯咖啡，挑選真正會被每天使用的日常器物。";

    const wordmark = document.querySelector(".brand-wordmark");
    const origin = document.querySelector(".brand-origin");
    const lead = document.querySelector(".brand-lead");
    if (wordmark) wordmark.textContent = "餐桌與咖啡器物";
    if (origin) origin.textContent = "TABLEWARE & COFFEE TOOLS";
    if (lead) lead.innerHTML = "讓好用的器物與日常的美感，<br>自然融入每一天。";

    const hero = document.querySelector(".brand-feature .brand-hero img");
    if (hero) {
      hero.src = "assets/tableware_coffee_page.jpg?v=20260911-0137";
      hero.alt = "餐桌與咖啡器物生活選品";
    }

    const story = document.querySelector(".brand-feature .brand-story");
    if (story) {
      const kicker = story.querySelector(":scope > .brand-kicker");
      if (kicker) kicker.textContent = "DAILY OBJECTS";
      const h1 = story.querySelector("h1");
      if (h1) h1.innerHTML = "從餐桌到一杯咖啡，<br>選擇真正會被每天使用的器物。";
      const paragraphs = story.querySelectorAll(":scope > div > p");
      if (paragraphs[0]) paragraphs[0].textContent = "fréa 選擇的不只是外型好看的器物，更重視握感、重量、收納、清潔與長期使用的舒適度。";
      if (paragraphs[1]) paragraphs[1].textContent = "從餐桌、飲水到咖啡時光，我們挑選能自然進入生活、不需要刻意裝飾，也能越用越順手的日常用品。";
      const selection = story.querySelector('div[style*="border-top"]');
      if (selection) {
        const title = selection.querySelector("h2");
        const text = selection.querySelector("p");
        if (title) title.textContent = "我們挑選的日常器物";
        if (text) text.textContent = "從杯、盤、碗與餐具，到濾杯、分享壺、咖啡杯與手沖用品，fréa 以日常使用感為核心，不侷限於單一品牌，挑選兼具實用、質感與長久陪伴價值的器物。";
      }
    }

    const values = document.querySelector(".brand-values");
    if (values) {
      values.setAttribute("aria-label", "餐桌與咖啡器物選品特色");
      const cards = values.querySelectorAll(".brand-value");
      const data = [
        ["01 / TABLEWARE", "餐桌器物", "杯、盤、碗、餐具與日常小器物，重視手感、收納、清潔與每天使用的舒適度。"],
        ["02 / COFFEE TOOLS", "咖啡器具", "從濾杯、分享壺到咖啡杯與手沖用品，讓沖煮與飲用都更自然從容。"],
        ["03 / EVERYDAY", "真正會被使用的選品", "不侷限於單一品牌，以實用、美感與長期使用價值作為 fréa 的選物標準。"]
      ];
      cards.forEach((card, i) => {
        if (!data[i]) return;
        const span = card.querySelector("span");
        const h2 = card.querySelector("h2");
        const p = card.querySelector("p");
        if (span) span.textContent = data[i][0];
        if (h2) h2.textContent = data[i][1];
        if (p) p.textContent = data[i][2];
      });
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply, { once: true });
  else apply();
})();
