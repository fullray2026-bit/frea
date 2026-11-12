(() => {
  const positionKey = 'frea-cart-return-position';
  const list = document.getElementById('cartItems');
  function enhance() {
    let cart;
    try { cart = JSON.parse(window.FreaCartStorage.getItem('frea_demo_cart_v1') || '[]'); } catch { return; }
    list.querySelectorAll('[data-cart-id]').forEach(row => {
      const item = cart.find(item => item.id === row.dataset.cartId);
      if (!item) return;
      const slug = item.productId || String(item.id).split('::')[0];
      const href = (window.FreaProductPages?.[slug] || 'product.html?slug=' + encodeURIComponent(slug));
      const url = href + (href.includes('?') ? '&' : '?') + 'from=cart';
      ['.cart-image', '.cart-name'].forEach(selector => {
        const element = row.querySelector(selector);
        if (!element || element.querySelector('a')) return;
        const link = document.createElement('a');
        link.href = url;
        link.className = 'cart-product-link';
        while (element.firstChild) link.appendChild(element.firstChild);
        element.appendChild(link);
        link.addEventListener('click', () => {
          try { sessionStorage.setItem(positionKey, JSON.stringify({y: scrollY, at: Date.now()})); } catch {}
        });
      });
    });
  }
  new MutationObserver(enhance).observe(list, {childList: true});
  enhance();
  function restore() {
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(positionKey)); } catch {}
    if (!saved || Date.now() - saved.at > 3600000) return;
    const back = new URLSearchParams(location.search).get('from') === 'product';
    const navigation = performance.getEntriesByType('navigation')[0];
    if (!back && navigation?.type !== 'back_forward') return;
    requestAnimationFrame(() => requestAnimationFrame(() => scrollTo({top:saved.y,behavior:'instant'})));
  }
  window.addEventListener('pageshow', restore);
})();

