// ==UserScript==
// @name         虎牙纯净直播 | 去广告·深色·拾取元素
// @namespace    huya-clean
// @version      0.3
// @description  ①白名单式去广告：主播位横幅/侧栏广告/游戏售卖组件/主播背景广告图一键清除(只清图不伤直播内容)；②布局兜底(默认开)：画面被顶出视口自动回收大块广告，改版也不怕；③视口锁定(实验性)：播放器+聊天区钉死视口，广告再也推不动画面；④🎯拾取元素：直接点漏掉的广告自动生成规则；⑤深色背景+可拖动齿轮面板
// @author       LH
// @match        https://www.huya.com/*
// @run-at       document-start
// @grant        none
// @noframes
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // ========== 设置存储 ==========
  var SETTINGS_KEY = 'huya-clean-settings';
  var DEFAULT_SETTINGS = { removeAd: true, darkBg: true, autoReclaim: true, viewportLock: false };
  var CUSTOM_RULES_KEY = 'huya-clean-custom-rules';
  var STYLE_PREFIX = 'huya-clean-';

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return Object.assign({}, DEFAULT_SETTINGS);
      return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
    } catch (e) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }
  function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* 忽略 */ }
  }
  function loadCustomRules() {
    try { return localStorage.getItem(CUSTOM_RULES_KEY) || ''; } catch (e) { return ''; }
  }
  function saveCustomRules(text) {
    try { localStorage.setItem(CUSTOM_RULES_KEY, text || ''); } catch (e) { /* 忽略 */ }
  }
  function customRulesCss() {
    var lines = loadCustomRules().split('\n').map(function (s) { return s.trim(); })
      .filter(function (s) { return s && s.indexOf('{') < 0 && s.indexOf('}') < 0; });
    var hide = [];
    var bgClear = [];
    for (var i = 0; i < lines.length; i++) {
      // bg: 前缀 = 只清背景图不隐藏元素(元素含正常内容时用，如 bg:#J_mainRoom)
      if (/^bg:/i.test(lines[i])) bgClear.push(lines[i].slice(3).trim());
      else hide.push(lines[i]);
    }
    var out = '';
    if (hide.length) out += hide.join(',') + '{display:none !important;}';
    if (bgClear.length) out += bgClear.join(',') + '{background:none !important;background-image:none !important;}';
    return out;
  }
  function setStyle(id, cssText) {
    var el = document.getElementById(STYLE_PREFIX + id);
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_PREFIX + id;
      (document.head || document.documentElement).appendChild(el);
    }
    el.textContent = cssText;
  }
  function removeStyle(id) {
    var el = document.getElementById(STYLE_PREFIX + id);
    if (el) el.remove();
  }

  // ========== 去广告规则 ==========
  // 只隐藏广告节点本身，不碰页面布局(播放器/聊天区/主播内容)，画面位置不受影响。
  // #room-hd-banner 是播放器标题栏右侧的主播位轮播横幅(2026-08 实测「点亮进度」等推广)；
  // sidebar-banner 是右侧栏广告位；game-sold-comp 是游戏售卖组件；
  // 哈希类名前缀兜底(roomBannerInfo/bannerItem 等)防止虎牙改版失效。
  var AD_RULES = [
    // 主播自设背景图/头图组件(虎牙「主播头条图」：常为广告推广大图，且把播放器顶到一屏以下)
    '#matchComponent2, #J_spbg, .diy-toutu2',
    // 侧栏广告位组件(实测背景图为腾讯 pgdt.gtimg.cn 广告系统素材)
    'div.bg-img',
    '#room-hd-banner, .room-hd-banner, .room-hd-r',
    '#sidebarBanner, .sidebar-banner, .sidebar-banner-link',
    '.game-sold-comp',
    '[class*="roomBannerInfo"], [class*="bannerItem--"], [class*="bannerList--"], [class*="bannerTitle--"]',
    'a[href*="huya.com/gg/"], a[href*="hd.huya.com"]'
  ].join(',') + '{display:none !important;}';

  // 背景清除规则：元素自身带背景广告图、但里面装着播放器/正常内容时不能隐藏整块，
  // 改为清掉背景图保留内容。实测 #J_mainRoom 的背景图即主播推广广告(zts.msstatic.com)。
  var BG_CLEAR_RULES = '#J_mainRoom, .main-room, .match-room, .room-wrap' +
    '{background:none !important;background-image:none !important;}';

  function darkStyle() {
    return 'html,body{background:#141416 !important;}';
  }

  function isRoomPage() {
    var path = location.pathname;
    if (!/^\/[a-zA-Z0-9]+$/.test(path)) return false; // 仅 /房间名 形态
    var black = ['g', 'l', 'video', 'game', 'my', 'user', 'search', 'download', 'hot', 'rank'];
    var first = path.split('/')[1] || '';
    return black.indexOf(first) < 0;
  }

  // ========== 布局级自动兜底（默认开，⚙ 开关控制） ==========
  // 与斗鱼版同款思路：不依赖类名。检测到「把播放器顶出视口的大块占位容器」就自动隐藏。
  // 虎牙主播自设背景图(头条图)常把播放器推到一屏以下，此机制自动回收，未来新广告同理。
  var reclaimTimer = null;
  var reclaimFirstTimer = null;
  var reclaimCount = 0;

  function scanAndHideHogs(player) {
    var pr = player.getBoundingClientRect();
    var minW = window.innerWidth * 0.5;
    var found = [];
    var walk = function (root, depth) {
      if (depth > 8 || found.length > 20) return;
      var children = root.children;
      for (var i = 0; i < children.length; i++) {
        var el = children[i];
        if (el === player || player.contains(el)) continue;
        var r = el.getBoundingClientRect();
        if (r.width < minW || r.height < 300 || r.top >= pr.top || r.bottom <= 0 || r.bottom > pr.top + 1) {
          // 只有自身宽过半屏/高>=300 的容器才可能包含目标大块，小块不再深入，避免全树强制重排
          if (depth < 8 && (r.width >= minW || r.height >= 300)) walk(el, depth + 1);
          continue;
        }
        var cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
        var p2 = el.parentElement, isAncestor = false;
        while (p2 && p2 !== document.body) {
          if (p2 === player) { isAncestor = true; break; }
          p2 = p2.parentElement;
        }
        if (!isAncestor) found.push(el);
      }
    };
    walk(document.body, 0);
    for (var j = 0; j < found.length; j++) {
      try {
        found[j].style.setProperty('display', 'none', 'important');
        reclaimCount++;
        if (reclaimCount <= 3) showToast('已自动回收遮挡画面的广告容器，无需手动处理');
      } catch (e) { /* 忽略 */ }
    }
  }

  function tickReclaim() {
    // 页面加载中不扫描：getBoundingClientRect 会强制重排，与虎牙首屏渲染抢主线程是卡顿主因
    if (document.readyState !== 'complete') return;
    var player = document.getElementById('J_playerMain');
    if (!player) return;
    var pr = player.getBoundingClientRect();
    if (pr.top <= 150) return; // 画面已在视口上部，不打扰
    scanAndHideHogs(player);
  }

  function startLayoutReclaimer() {
    if (reclaimTimer) return;
    reclaimTimer = setInterval(tickReclaim, 2000);
    // 首扫延迟 10 秒：等页面加载完成、布局稳定后再做全树扫描，避免进房瞬间卡顿
    if (reclaimFirstTimer) clearTimeout(reclaimFirstTimer);
    reclaimFirstTimer = setTimeout(function () {
      reclaimFirstTimer = null;
      try { tickReclaim(); } catch (e) { /* 忽略 */ }
    }, 10000);
  }

  function stopLayoutReclaimer() {
    if (reclaimTimer) { clearInterval(reclaimTimer); reclaimTimer = null; }
    if (reclaimFirstTimer) { clearTimeout(reclaimFirstTimer); reclaimFirstTimer = null; }
  }

  // ========== 视口锁定（实验性，⚙ 开关控制） ==========
  // 播放器 + 聊天区 fixed 钉死视口(保留 60px 顶部导航)，页面不可滚动；
  // 文档流里的任何新广告/背景组件都被裁出视口，从布局上彻底免疫。
  function viewportLockCss() {
    return [
      'html.hc-locked,html.hc-locked body{overflow:hidden!important;height:100vh!important;}',
      'html.hc-locked #J_playerMain{position:fixed!important;top:60px!important;left:0!important;' +
        'width:calc(100vw - var(--hc-aside-w,340px))!important;height:calc(100vh - 60px)!important;z-index:1000!important;}',
      'html.hc-locked .room-core-r{position:fixed!important;top:60px!important;right:0!important;' +
        'width:var(--hc-aside-w,340px)!important;height:calc(100vh - 60px)!important;z-index:1000!important;}'
    ].join('');
  }

  function syncAsideWidthVar() {
    var aside = document.querySelector('.room-core-r');
    if (!aside) return;
    var w = Math.round(aside.getBoundingClientRect().width);
    if (w >= 200 && w <= 700) {
      try { document.documentElement.style.setProperty('--hc-aside-w', w + 'px'); } catch (e) { /* 忽略 */ }
    }
  }

  var currentSettings = loadSettings();
  function applyStyles() {
    if (!isRoomPage()) return;
    if (currentSettings.removeAd) {
      setStyle('ad', AD_RULES);
      setStyle('bgclear', BG_CLEAR_RULES);
    } else {
      removeStyle('ad');
      removeStyle('bgclear');
    }
    if (currentSettings.darkBg) setStyle('dark', darkStyle());
    else removeStyle('dark');
    if (currentSettings.viewportLock) setStyle('lock', viewportLockCss());
    else removeStyle('lock');
    try { document.documentElement.classList.toggle('hc-locked', currentSettings.viewportLock); } catch (e) { /* 忽略 */ }
    var custom = customRulesCss();
    if (custom) setStyle('custom', custom);
    else removeStyle('custom');
    if (currentSettings.autoReclaim) startLayoutReclaimer();
    else stopLayoutReclaimer();
    syncAsideWidthVar();
  }
  applyStyles();

  // ========== toast(单例) ==========
  var toastEl = null;
  var toastTimer = null;
  function showToast(msg, isError) {
    try {
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.style.cssText = 'position:fixed;top:45%;left:50%;transform:translate(-50%,-50%);z-index:2147483647;pointer-events:none;background:rgba(0,0,0,.88);color:#fff;padding:10px 20px;border-radius:8px;font:13px/1.6 "Microsoft YaHei",sans-serif;max-width:70vw;box-shadow:0 4px 16px rgba(0,0,0,.4);';
        document.body.appendChild(toastEl);
      }
      toastEl.textContent = msg;
      toastEl.style.color = isError ? '#ff8c8c' : '#fff';
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        toastTimer = null;
        if (toastEl) { try { toastEl.remove(); } catch (e) { /* 忽略 */ } toastEl = null; }
      }, 2600);
    } catch (e) { /* 忽略 */ }
  }

  // ========== 拾取元素（点选广告自动生成规则） ==========
  var pickerActive = false;
  function createElementPicker(panelBox, textarea, btn) {
    var tooltip = null;
    var banner = null;
    var cur = null;
    var panelWasOpen = false;

    function cleanupUI() {
      if (tooltip) { try { tooltip.remove(); } catch (e) { /* 忽略 */ } tooltip = null; }
      if (banner) { try { banner.remove(); } catch (e) { /* 忽略 */ } banner = null; }
      if (cur) { try { cur.classList.remove('hc-pick-highlight'); } catch (e) { /* 忽略 */ } cur = null; }
      removeStyle('picker');
    }

    // 播放器/聊天区/助手自身禁止点选
    function isProtected(el) {
      var n = el;
      while (n && n !== document.body) {
        if (n.id === 'J_playerMain' || n.id === 'huya-clean-panel' || n.id === 'huya-clean-fab') return true;
        var c = (typeof n.className === 'string') ? n.className : '';
        if (c.indexOf('room-core-r') >= 0 || c.indexOf('room-sidebar') >= 0 || c.indexOf('danmuwrap') >= 0) return true;
        n = n.parentElement;
      }
      return false;
    }

    function cssEscape(sel) {
      try { return CSS.escape(sel); } catch (e) { return sel; }
    }

    function buildSelector(el) {
      if (el.id) return '#' + cssEscape(el.id);
      var cls = (typeof el.className === 'string') ? el.className.trim() : '';
      var names = cls ? cls.split(/\s+/) : [];
      for (var i = 0; i < names.length; i++) {
        if (names[i] && /^[a-zA-Z]/.test(names[i])) return '.' + cssEscape(names[i]);
      }
      var tag = el.tagName.toLowerCase();
      if (names.length) return tag + '.' + cssEscape(names[0]);
      var parts = [];
      var node = el;
      while (node && node !== document.body && node !== document.documentElement && parts.length < 6) {
        var parent = node.parentElement;
        var seg = node.tagName.toLowerCase();
        if (parent) {
          var idx = 1;
          var child = parent.firstElementChild;
          while (child && child !== node) { idx++; child = child.nextElementSibling; }
          seg += ':nth-child(' + idx + ')';
        }
        parts.unshift(seg);
        node = parent;
      }
      return parts.join(' > ');
    }

    function onMove(e) {
      var el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el === document.body || el === document.documentElement || el === cur) return;
      if (cur) { try { cur.classList.remove('hc-pick-highlight'); } catch (err) { /* 忽略 */ } }
      cur = el;
      try { cur.classList.add('hc-pick-highlight'); } catch (err) { /* 忽略 */ }
      var r = cur.getBoundingClientRect();
      var label = cur.tagName.toLowerCase();
      if (cur.id) label += '#' + cur.id;
      var c = (typeof cur.className === 'string') ? cur.className.trim() : '';
      if (c) label += '.' + c.split(/\s+/).slice(0, 2).join('.');
      tooltip.style.display = 'block';
      tooltip.textContent = label + '  ' + Math.round(r.width) + 'x' + Math.round(r.height) + 'px';
      var x = e.clientX + 14;
      var y = e.clientY + 16;
      if (x + 260 > window.innerWidth) x = e.clientX - 270;
      if (y + 30 > window.innerHeight) y = e.clientY - 44;
      tooltip.style.left = x + 'px';
      tooltip.style.top = y + 'px';
    }

    function onPick(e) {
      e.preventDefault();
      e.stopPropagation();
      var el = cur || document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el === document.body || el === document.documentElement) return;
      var target = el;
      if (e.shiftKey) {
        var p = target.parentElement;
        if (p && p !== document.body && p !== document.documentElement) target = p;
      }
      if (isProtected(target)) {
        showToast('不能选择播放器/聊天区/助手面板，请点广告元素', true);
        return;
      }
      var sel = buildSelector(target);
      if (!sel) {
        showToast('无法生成选择器，请换一个元素点选', true);
        return;
      }
      var lines = (textarea.value || '').split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
      var dup = false;
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase() === sel.toLowerCase()) { dup = true; break; }
      }
      if (!dup) lines.push(sel);
      textarea.value = lines.join('\n');
      saveCustomRules(lines.join('\n'));
      applyStyles();
      try { target.style.setProperty('display', 'none', 'important'); } catch (err) { /* 忽略 */ }
      if (cur) { try { cur.classList.remove('hc-pick-highlight'); } catch (err) { /* 忽略 */ } cur = null; }
      var count = 0;
      try { count = document.querySelectorAll(sel).length; } catch (err) { /* 忽略 */ }
      showToast(dup ? '已存在，跳过：' + sel : '已加入规则：' + sel + (count > 1 ? '（匹配 ' + count + ' 个元素）' : ''));
    }

    function stop() {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onPick, true);
      document.removeEventListener('contextmenu', onEnd, true);
      document.removeEventListener('keydown', onKey, true);
      cleanupUI();
      pickerActive = false;
      if (btn) btn.textContent = '🎯 拾取元素';
      if (panelWasOpen) {
        panelBox.style.display = 'block';
        armPanelAutoClose(panelBox);
      }
    }

    function onEnd(e) {
      if (e.type === 'contextmenu') e.preventDefault();
      stop();
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        stop();
      }
    }

    function start() {
      if (pickerActive) { stop(); return; }
      pickerActive = true;
      panelWasOpen = panelBox.style.display !== 'none';
      panelBox.style.display = 'none';
      disarmPanelAutoClose();
      setStyle('picker', '.hc-pick-highlight{outline:2px dashed #22c55e !important;outline-offset:-2px;cursor:crosshair !important;}');
      tooltip = document.createElement('div');
      tooltip.id = 'huya-clean-pick-tip';
      tooltip.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;background:rgba(0,0,0,.85);color:#4ade80;border:1px solid #4ade80;border-radius:6px;font:11px/1.5 sans-serif;padding:3px 8px;max-width:320px;display:none;';
      banner = document.createElement('div');
      banner.id = 'huya-clean-pick-bar';
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483646;pointer-events:none;background:rgba(0,0,0,.9);color:#fff;border-bottom:1px solid #4ade80;font:12px/2 sans-serif;text-align:center;padding:3px 8px;';
      banner.textContent = '拾取模式：左键=加入规则并隐藏 ｜ Shift+左键=选父级 ｜ Esc 或右键=结束';
      document.body.appendChild(tooltip);
      document.body.appendChild(banner);
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('click', onPick, true);
      document.addEventListener('contextmenu', onEnd, true);
      document.addEventListener('keydown', onKey, true);
      if (btn) btn.textContent = '⏹ 结束拾取';
      showToast('拾取模式：直接点漏掉的广告，Esc 结束', false);
    }

    return { start: start, stop: stop };
  }

  // ========== 设置面板 ==========
  var PANEL_ID = 'huya-clean-panel';
  var FAB_POS_KEY = 'huya-clean-fab-pos';
  var PANEL_AUTO_CLOSE_MS = 5000;
  var panelTimer = null;
  function armPanelAutoClose(box) {
    if (panelTimer) clearTimeout(panelTimer);
    panelTimer = setTimeout(function () {
      panelTimer = null;
      box.style.display = 'none';
    }, PANEL_AUTO_CLOSE_MS);
  }
  function disarmPanelAutoClose() {
    if (panelTimer) { clearTimeout(panelTimer); panelTimer = null; }
  }

  function buildPanel() {
    if (document.getElementById(PANEL_ID)) return;
    var box = document.createElement('div');
    box.id = PANEL_ID;
    box.style.cssText = 'position:fixed;z-index:2147483647;font:12px/1.8 "Microsoft YaHei",sans-serif;color:#eee;background:rgba(20,20,22,.95);border:1px solid #333;border-radius:8px;padding:6px 10px;box-shadow:0 4px 16px rgba(0,0,0,.5);display:none;';
    box.innerHTML =
      '<div style="cursor:default;font-weight:700;margin-bottom:4px;user-select:none">虎牙助手</div>' +
      '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap">' +
      '<input type="checkbox" data-key="removeAd"' + (currentSettings.removeAd ? ' checked' : '') + '>去广告</label>' +
      '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap">' +
      '<input type="checkbox" data-key="darkBg"' + (currentSettings.darkBg ? ' checked' : '') + '>深色背景</label>' +
      '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap">' +
      '<input type="checkbox" data-key="autoReclaim"' + (currentSettings.autoReclaim ? ' checked' : '') + '>布局兜底(自动回收遮挡画面的大块广告)</label>' +
      '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap">' +
      '<input type="checkbox" data-key="viewportLock"' + (currentSettings.viewportLock ? ' checked' : '') + '>视口锁定(播放器+聊天区钉死视口，实验性)</label>' +
      '<div style="margin-top:6px;border-top:1px solid #333;padding-top:5px">' +
      '<div style="font-size:11px;color:#aaa;line-height:1.7;margin-bottom:4px;max-width:270px;user-select:none">' +
      '自定义隐藏规则(小白教程)：<br>' +
      '· 不会写选择器？点「🎯 拾取元素」→ 直接点漏掉的广告 → 自动生成规则并立即隐藏；Shift+点击选整个广告块。<br>' +
      '· 怎么找广告代码：在广告上点右键 →「检查」，看它 class / id 是什么。<br>' +
      '· 按类名写：<span style="color:#58a6ff">.ad-banner</span>　按ID写：<span style="color:#58a6ff">#gg-xxx</span><br>' +
      '· 模糊匹配(推荐，改版也不怕)：<span style="color:#58a6ff">[class*="advert"]</span><br>' +
      '· 每行写一条，点「应用」立即生效；清空再点「应用」恢复默认。<br>' +
      '· 元素带背景广告但里面有正常内容？写成 <span style="color:#58a6ff">bg:#J_mainRoom</span> 只清背景图不隐藏。<br>' +
      '</div>' +
      '<textarea id="huya-clean-custom-rules" placeholder="每行一条CSS选择器&#10;如：.abc123 / #xyz / [class*=advert]" style="width:100%;height:52px;resize:none;box-sizing:border-box;background:#222;color:#eee;border:1px solid #444;border-radius:4px;font:11px/1.5 sans-serif;padding:3px 5px;outline:none"></textarea>' +
      '<div style="display:flex;gap:4px;margin-top:3px">' +
      '<button id="huya-clean-pick-btn" title="点选漏掉的广告，自动生成隐藏规则(左键=加入，Shift+左键=选父级，Esc=结束)" style="flex:1;background:#1d5c33;color:#c6ffd9;border:1px solid #2e8b4f;border-radius:4px;cursor:pointer;font:11px/1.6 sans-serif;padding:2px 0">🎯 拾取元素</button>' +
      '<button id="huya-clean-custom-apply" title="把下面的选择器全部应用并立即生效" style="flex:1;background:#333;color:#eee;border:1px solid #555;border-radius:4px;cursor:pointer;font:11px/1.6 sans-serif;padding:2px 0">应用规则</button>' +
      '</div>' +
      '</div>';

    box.addEventListener('change', function (e) {
      var input = e.target;
      if (!input.dataset || !input.dataset.key) return;
      currentSettings[input.dataset.key] = input.checked;
      saveSettings(currentSettings);
      applyStyles();
      armPanelAutoClose(box);
    });

    var customTextarea = box.querySelector('#huya-clean-custom-rules');
    if (customTextarea) customTextarea.value = loadCustomRules();
    var customApply = box.querySelector('#huya-clean-custom-apply');
    if (customApply) {
      customApply.addEventListener('click', function () {
        saveCustomRules(customTextarea ? customTextarea.value : '');
        applyStyles();
        showToast('自定义规则已应用');
      });
    }
    var pickBtn = box.querySelector('#huya-clean-pick-btn');
    var picker = createElementPicker(box, customTextarea, pickBtn);
    if (pickBtn) {
      pickBtn.addEventListener('click', function () {
        picker.start();
        armPanelAutoClose(box);
      });
    }

    box.addEventListener('mouseenter', disarmPanelAutoClose);
    box.addEventListener('mouseleave', function () {
      disarmPanelAutoClose();
      box.style.display = 'none';
    });

    // 齿轮按钮
    setStyle('fab-anim', [
      '@keyframes huya-clean-fab-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
      '@keyframes huya-clean-fab-pulse{0%,100%{box-shadow:0 0 4px rgba(255,140,0,.35)}50%{box-shadow:0 0 14px rgba(255,140,0,.9)}}',
      '#huya-clean-fab:hover{animation-duration:2s,1s !important;}'
    ].join(''));
    var toggle = document.createElement('div');
    toggle.id = 'huya-clean-fab';
    toggle.innerHTML = '<svg viewBox="0 0 24 24" style="width:16px;height:16px;display:block;margin:5px auto"><path fill="#ff8c00" d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94zM12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>';
    toggle.style.cssText = 'position:fixed;top:60px;right:10px;z-index:2147483647;width:28px;height:28px;border-radius:50%;text-align:center;background:rgba(20,20,22,.85);cursor:grab;user-select:none;border:1px solid #ff8c00;animation:huya-clean-fab-spin 12s linear infinite,huya-clean-fab-pulse 3s ease-in-out infinite;';
    toggle.title = '虎牙助手设置（可拖动）';

    function loadFabPos() {
      try {
        var raw = localStorage.getItem(FAB_POS_KEY);
        if (!raw) return null;
        var pos = JSON.parse(raw);
        if (typeof pos.left === 'number' && typeof pos.top === 'number') return pos;
      } catch (e) { /* 忽略 */ }
      return null;
    }
    var savedPos = loadFabPos();
    if (savedPos) {
      toggle.style.right = 'auto';
      toggle.style.left = savedPos.left + 'px';
      toggle.style.top = savedPos.top + 'px';
    }

    function updatePanelPos() {
      var r = toggle.getBoundingClientRect();
      box.style.right = 'auto';
      var bw = box.offsetWidth || 220;
      box.style.left = Math.max(4, Math.min(r.left, window.innerWidth - bw - 8)) + 'px';
      box.style.top = (r.bottom + 8) + 'px';
    }

    var dragState = null;
    var suppressClick = false;
    function onDragMove(e) {
      if (!dragState) return;
      var dx = e.clientX - dragState.startX;
      var dy = e.clientY - dragState.startY;
      if (!dragState.moved && Math.abs(dx) + Math.abs(dy) > 5) dragState.moved = true;
      if (!dragState.moved) return;
      var left = Math.min(Math.max(0, dragState.startLeft + dx), window.innerWidth - 28);
      var top = Math.min(Math.max(0, dragState.startTop + dy), window.innerHeight - 28);
      toggle.style.right = 'auto';
      toggle.style.left = left + 'px';
      toggle.style.top = top + 'px';
      if (box.style.display !== 'none') updatePanelPos();
    }
    function onDragEnd() {
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', onDragEnd);
      toggle.style.cursor = 'grab';
      toggle.style.animationPlayState = 'running';
      if (dragState) {
        suppressClick = dragState.moved;
        if (dragState.moved) {
          try {
            var r = toggle.getBoundingClientRect();
            localStorage.setItem(FAB_POS_KEY, JSON.stringify({ left: Math.round(r.left), top: Math.round(r.top) }));
          } catch (e) { /* 忽略 */ }
        }
      }
      dragState = null;
    }
    toggle.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      var r = toggle.getBoundingClientRect();
      toggle.style.cursor = 'grabbing';
      toggle.style.animationPlayState = 'paused';
      dragState = { startX: e.clientX, startY: e.clientY, startLeft: r.left, startTop: r.top, moved: false };
      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragEnd);
    });
    toggle.addEventListener('click', function () {
      if (suppressClick) { suppressClick = false; return; }
      var willOpen = box.style.display === 'none';
      box.style.display = willOpen ? 'block' : 'none';
      if (willOpen) armPanelAutoClose(box);
      updatePanelPos();
    });

    document.body.appendChild(toggle);
    document.body.appendChild(box);
  }

  // ========== 启动 ==========
  function initRoom() {
    try { if (!isRoomPage()) return; } catch (e) { return; }
    try { buildPanel(); } catch (e) { /* 忽略 */ }
  }

  // 心跳：面板缺失时重建(SPA 切房后斗鱼式路由重建)，低频兜底
  setInterval(function () {
    try {
      if (!isRoomPage()) return;
      if (!document.getElementById(PANEL_ID)) buildPanel();
      syncAsideWidthVar(); // 聊天区宽度可能随直播间变化，视口锁定按实时宽度排布
    } catch (e) { /* 忽略 */ }
  }, 5000);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRoom);
  } else {
    initRoom();
  }
})();
