(function () {
  'use strict';
  let accepted = null;
  let pending = null;
  const dialog = document.createElement('dialog');
  dialog.className = 'frea-age-dialog';
  dialog.setAttribute('aria-label', '年齡確認 / 年齢確認 / Age verification');
  dialog.innerHTML = `<div class="frea-age-copy">
    <p lang="ja">当ストアはアルコールを販売しております。アルコール類の販売には年齢制限があり、20歳未満の購入や飲酒は法律で禁止されています。あなたは20歳以上ですか？</p>
    <p lang="zh-Hant">本商店販售酒類商品。酒類販售設有年齡限制，依日本法律，未滿 20 歲者禁止購買及飲酒。請問您是否已滿 20 歲？</p>
    <p lang="en">This store sells alcoholic beverages. Age restrictions apply: under Japanese law, purchasing or drinking alcohol is prohibited for anyone under 20. Are you 20 years of age or older?</p>
    </div><div class="frea-age-actions">
    <button type="button" data-age="yes"><span lang="ja">はい</span><span>是，我已滿 20 歲</span><span lang="en">Yes, I am 20 or older</span></button>
    <button type="button" data-age="no" autofocus><span lang="ja">いいえ</span><span>否，返回首頁</span><span lang="en">No, return to home</span></button>
    </div>`;
  document.body.append(dialog);
  function close() { dialog.close(); document.documentElement.classList.remove('frea-age-open'); }
  function decline() { pending = null; accepted = null; close(); location.hash = 'home'; }
  dialog.querySelector('[data-age="yes"]').onclick = () => {
    const next = pending;
    accepted = next?.id || null;
    pending = null;
    close();
    if (next) next.resume();
    document.querySelector('#homeMain h1')?.focus();
  };
  dialog.querySelector('[data-age="no"]').onclick = decline;
  dialog.addEventListener('cancel', event => { event.preventDefault(); decline(); });
  window.FreaAgeGate = {
    check(category, resume) {
      if (!category || !/微醺/.test(category.name)) {
        accepted = null; pending = null;
        if (dialog.open) close();
        return true;
      }
      if (accepted === category.id) return true;
      pending = { id: category.id, resume };
      document.getElementById('homeMain').innerHTML = '';
      if (!dialog.open) { dialog.showModal(); document.documentElement.classList.add('frea-age-open'); }
      return false;
    }
  };
})();
