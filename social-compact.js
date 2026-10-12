window.FreaCompact = {
  init() {
    const $ = id => document.getElementById(id);
    const settings = $('settings');
    const schedule = $('scheduleForm').parentElement;
    const styles = $('styleForm').parentElement;
    const products = $('settingsForm');
    const connections = $('connections').parentElement;
    const runtime = $('pipelineStatus').parentElement;
    runtime.classList.add('runtime-summary');
    const tabs = document.createElement('div');
    tabs.className = 'settings-tabs'; tabs.setAttribute('aria-label', '製作設定分類');
    const panels = [schedule, styles, products, connections];
    ['排程', '文案與圖片風格', '商品挑選', '串接狀態'].forEach((name, i) => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = name;
      button.setAttribute('aria-pressed', String(i === 0));
      button.onclick = () => {
        panels.forEach((panel, n) => panel.hidden = n !== i);
        [...tabs.children].forEach((b, n) => b.setAttribute('aria-pressed', String(n === i)));
      };
      panels[i].hidden = i !== 0; tabs.append(button);
    });
    runtime.after(tabs);
    const pickers = document.createElement('div'); pickers.className = 'product-picker-grid';
    $('preferredPicker').before(pickers); pickers.append($('preferredPicker'), $('excludedPicker'));
    products.querySelector('h2').textContent = '商品挑選';
    const drawer = (form, title) => {
      const dialog = document.createElement('dialog'); dialog.className = 'settings-drawer';
      const heading = document.createElement('div'); heading.className = 'dialog-head';
      const h = document.createElement('h2'); h.textContent = title; h.id = form.id + 'Heading';
      dialog.setAttribute('aria-labelledby', h.id);
      const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', '關閉編輯'); close.onclick = () => dialog.close();
      heading.append(h, close); dialog.append(heading, form);
      const status = document.createElement('p'); status.setAttribute('role', 'status'); dialog.append(status);
      new MutationObserver(() => { if (dialog.open) status.textContent = $('message').textContent; }).observe($('message'), {childList:true, subtree:true, characterData:true});
      document.body.append(dialog);
      return () => { status.textContent = ''; dialog.showModal(); };
    };
    const openSchedule = drawer($('scheduleForm'), '編輯製作排程');
    const add = document.createElement('button'); add.type = 'button'; add.className = 'primary'; add.textContent = '＋ 新增排程';
    add.onclick = () => { $('newSchedule').click(); openSchedule(); };
    schedule.querySelector('h2').after(add); schedule.classList.add('schedule-panel');
    $('scheduleList').addEventListener('click', ev => { if (ev.target.dataset.schedule) openSchedule(); });
    const openStyle = drawer($('styleForm'), '編輯文案與圖片風格');
    const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = '編輯選取風格'; edit.onclick = openStyle;
    $('styleList').after(edit);
    ['newStyle', 'copyStyle'].forEach(id => $(id).addEventListener('click', openStyle));
    const summary = document.createElement('div'); summary.className = 'style-summary'; styles.append(summary);
    const describe = () => {
      const s = window.FreaStudio.styles.find(s => s.id === $('styleList').value);
      summary.replaceChildren(); if (!s) return;
      [['文案風格', s.copy_rules], ['圖片風格', s.photo_rules]].forEach(([name, text]) => {
        const section = document.createElement('section'); const h = document.createElement('h3'); h.textContent = name;
        const p = document.createElement('p'); p.textContent = text; section.append(h, p); summary.append(section);
      });
    };
    $('styleList').addEventListener('change', describe);
    new MutationObserver(describe).observe($('styleList'), {childList:true}); describe();
    window.FreaStudio.paint();
  }
};
