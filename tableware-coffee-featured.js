(() => {
  const apply = async () => {
    const img = document.querySelector('a[aria-label="餐桌與咖啡器物"] img');
    if (!img) return;
    try {
      const res = await fetch('assets/featured_tableware_coffee.svg?v=20260911-2', { cache: 'no-store' });
      if (!res.ok) return;
      const svg = await res.text();
      const match = svg.match(/href=["'](data:image\/jpeg;base64,[^"']+)["']/i);
      if (match && match[1]) img.src = match[1];
    } catch (_) {}
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true });
  else apply();
})();
