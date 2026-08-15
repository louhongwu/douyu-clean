// ==UserScript==
// @name         虎牙纯净直播 | 去广告·深色·拾取元素
// @namespace    huya-clean
// @version      0.18
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
    // 直播间下方热门推荐区块(J_hot，占一屏高度)
    '.hot-wrap',
    // 分类面包屑条(房间头上方 29px，非核心)与房间头(主播信息条，隐藏后播放器填满聊天区全高)
    '.match-top, .room-hd-l, #J_roomHeader',
    // 主播自设组件(头条/视频嵌入等)
    '#matchComponent1, #matchComponent3, #matchComponent6, #matchComponent7',
    '.diy-video-embed',
    '#room-hd-banner, .room-hd-banner, .room-hd-r',
    '#sidebarBanner, .sidebar-banner, .sidebar-banner-link',
    '.game-sold-comp',
    '[class*="roomBannerInfo"], [class*="bannerItem--"], [class*="bannerList--"], [class*="bannerTitle--"]',
    'a[href*="huya.com/gg/"], a[href*="hd.huya.com"]'
  ].join(',') + '{display:none !important;}';

  // 布局补偿规则：主区从导航下方开始；房间头保留原高度(与聊天区顶部对齐)，
  // 播放器 flex 自动填满「房间头到聊天区底部」的剩余高度(播放器内的礼物栏随播放器底边对齐聊天区底部)；
  // 视频 object-fit:cover 铺满裁剪：无黑边不拉伸，上下边缘裁掉少量画面
  var LAYOUT_FIX_RULES = [
    // 左侧导航标签栏(mod-sidebar 50px)必须保留：#J_mainWrap 恢复原生 50px 左 padding 给它让位；
    // 顶部 60px 是给顶部导航留的位置，同样保留
    '#J_mainWrap{margin:0!important;padding:60px 0 0 50px!important;width:100vw!important;max-width:none!important;}',
    '#main_col,#J_mainRoom,.main-room{margin:0!important;padding:0!important;max-width:none!important;}',
    '.room-wrap,.room-core,.match-room{height:calc(100vh - 60px)!important;max-width:none!important;margin:0!important;padding:0!important;}',
    // 播放区：左缘与导航栏保持 20px 间隙，右缘给聊天区(340)与间隙(10)让位；
    // 房间头已隐藏，播放器 flex 填满整个聊天区高度(顶=聊天区顶，底=聊天区底)
    '.room-core-l{height:100%!important;display:flex!important;flex-direction:column!important;width:calc(100vw - 420px)!important;margin:0 0 0 20px!important;}',
    '.room-player-wrap{flex:1 1 auto!important;height:auto!important;min-height:0!important;}',
    '#J_playerMain,#J_playerMain .player-wrap,#J_playerMain .player-video{height:100%!important;}',
    // 视频区域占播放器上部、底部留 60px 给礼物栏；contain 完整显示不裁切：
    // 画面保持原生比例不过大，视频内容在区域内居中(上下留深色边)，礼物栏与聊天区底边对齐
    '#J_playerMain video{width:100%!important;height:calc(100% - 60px)!important;object-fit:contain!important;}',
    // 礼物栏钉到播放器底部(视口内)，层级提到视频之上，图标不再跑到屏幕外
    '#player-gift-wrap{position:absolute!important;left:0!important;right:0!important;bottom:0!important;height:60px!important;z-index:20!important;}',
    // 控制条(礼物栏背景条)钉到底边：实测它 44px 高悬在礼物栏中间，底边比聊天区底高 16px
    '#player-ctrl-wrap{position:absolute!important;left:0!important;right:0!important;bottom:0!important;top:auto!important;height:44px!important;z-index:21!important;max-width:100%!important;}',
    '.room-player-gift-placeholder{z-index:10!important;}',
    '.room-core-r{height:100%!important;margin:0!important;}'
  ].join('');

  // 背景清除规则：元素自身带背景广告图、但里面装着播放器/正常内容时不能隐藏整块，
  // 改为清掉背景图保留内容。实测 #J_mainRoom 的背景图即主播推广广告(zts.msstatic.com)。
  var BG_CLEAR_RULES = '#J_mainRoom, .main-room, .match-room, .room-wrap' +
    '{background:none !important;background-image:none !important;}';

  function darkStyle() {
    return 'html,body{background:#141416 !important;}' +
      '.room-core-l,.room-player-wrap,.room-core-r{background:#141416 !important;}';
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

  // 保护白名单：播放器/聊天区/房间头/导航/助手自身绝不回收
  function isCoreArea(el) {
    var n = el;
    while (n && n !== document.body) {
      if (n.id === 'J_playerMain' || n.id === 'J_roomHeader' ||
          n.id === 'huya-clean-fab' || n.id === 'huya-clean-panel') return true;
      var c = (typeof n.className === 'string') ? n.className : '';
      if (c.indexOf('room-core-r') >= 0 || c.indexOf('duya-header') >= 0 ||
          c.indexOf('room-player') >= 0 || c.indexOf('room-hd') >= 0) return true;
      n = n.parentElement;
    }
    return false;
  }

  // 以聊天区高度为基准：完全位于聊天区上方或下方的大块内容一律视为广告，自动隐藏。
  // 不管斗鱼式类名怎么变、什么新组件上线，只要超出聊天区范围就被回收。
  function scanAndHideHogs(aside) {
    var aR = aside.getBoundingClientRect();
    var found = [];
    var walk = function (root, depth) {
      if (depth > 8 || found.length > 20) return;
      var children = root.children;
      for (var i = 0; i < children.length; i++) {
        var el = children[i];
        if (el === aside || aside.contains(el) || isCoreArea(el)) continue;
        var r = el.getBoundingClientRect();
        var above = r.bottom < aR.top - 2 && r.height > 60;
        var below = r.top > aR.bottom + 2 && r.height > 60;
        if ((above || below) && r.width > 200) {
          var cs = getComputedStyle(el);
          if (cs.display !== 'none' && cs.visibility !== 'hidden' && cs.position !== 'fixed') {
            found.push(el);
            continue; // 命中即回收整块，不再深入
          }
        }
        // 只有宽>200 或高>60 的容器才可能包含目标块，小块不深入，避免全树强制重排
        if (depth < 8 && (r.width > 200 || r.height > 60)) walk(el, depth + 1);
      }
    };
    walk(document.body, 0);
    for (var j = 0; j < found.length; j++) {
      try {
        found[j].style.setProperty('display', 'none', 'important');
        reclaimCount++;
        if (reclaimCount <= 3) showToast('已自动回收聊天区外的广告内容');
      } catch (e) { /* 忽略 */ }
    }
  }

  function tickReclaim() {
    if (document.readyState !== 'complete') return;
    // 轻量触发：页面能滚出视口(说明有聊天区外内容)才做全树扫描，平时零开销
    if (document.documentElement.scrollHeight <= document.documentElement.clientHeight + 50) return;
    var aside = document.querySelector('.room-core-r');
    if (!aside) return;
    scanAndHideHogs(aside);
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
      // 顶部导航保留(切直播间等入口)，提升层级确保它在 fixed 播放器之上；
      // 房间头已由去广告规则默认隐藏，播放器与聊天区直接排在导航下方铺满
      'html.hc-locked .duya-header-wrap{z-index:1002!important;position:fixed!important;top:0!important;left:0!important;right:0!important;}',
      'html.hc-locked #J_playerMain{position:fixed!important;top:60px!important;left:0!important;' +
        'width:calc(100vw - var(--hc-aside-w,340px))!important;height:calc(100vh - 60px)!important;z-index:1000!important;}',
      'html.hc-locked .room-core-r{position:fixed!important;top:60px!important;right:0!important;' +
        'width:var(--hc-aside-w,340px)!important;height:calc(100vh - 60px)!important;z-index:1000!important;}'
    ].join('');
  }

  function syncAsideWidthVar() {
    var aside = document.querySelector('.room-core-r');
    if (aside) {
      var w = Math.round(aside.getBoundingClientRect().width);
      if (w >= 200 && w <= 700) {
        try { document.documentElement.style.setProperty('--hc-aside-w', w + 'px'); } catch (e) { /* 忽略 */ }
      }
    }
    // 房间头高度实时测量：视口锁定时播放器/聊天区排在房间头下方
    var hd = document.getElementById('J_roomHeader');
    if (hd) {
      var h = Math.round(hd.getBoundingClientRect().height);
      if (h >= 40 && h <= 140) {
        try { document.documentElement.style.setProperty('--hc-hd-h', h + 'px'); } catch (e) { /* 忽略 */ }
      }
    }
  }

  var currentSettings = loadSettings();
  function applyStyles() {
    if (!isRoomPage()) return;
    if (currentSettings.removeAd) {
      setStyle('ad', AD_RULES);
      setStyle('bgclear', BG_CLEAR_RULES);
      setStyle('layoutfix', LAYOUT_FIX_RULES);
    } else {
      removeStyle('ad');
      removeStyle('bgclear');
      removeStyle('layoutfix');
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

  // ========== 更新说明（⚙ 面板「更新说明」按钮展示） ==========
  var CHANGELOG = [
    { version: '0.18', text: '视频改 object-fit:contain：完整显示不裁切、画面不再被拉大，视频内容居中(上下深色边)，礼物栏与控制条固定贴底和聊天区底边对齐。' },
    { version: '0.17', text: '控制条(#player-ctrl-wrap，礼物栏背景条)钉到播放器底边：修复它 44px 高悬在栏中间、底边比聊天区底高 16px 的对齐问题。' },
    { version: '0.16', text: '最终对齐确认：礼物栏容器底部与聊天区底部完全平齐(图标留 8px 边距为虎牙原生设计)；最强逻辑：以聊天区高度为界，超出聊天区顶部/底部的任何内容一律视为广告自动回收。' },
    { version: '0.15', text: '修复礼物栏图标跑到屏幕外(实测礼物栏父级是 #videoContainer，随播放器拉高溢出)：礼物栏绝对定位钉到播放器底部并提到视频层之上，视频画面自动让出底部 60px。' },
    { version: '0.14', text: '房间头(room-hd-l/J_roomHeader)恢复隐藏，播放器自动填满整个聊天区高度(顶底与聊天区完全对齐)。' },
    { version: '0.13', text: '恢复左侧导航标签栏(50px)不被覆盖；播放器收窄(不再过大)并与导航栏保持间隙；右侧聊天区仍贴屏边；礼物栏占位层提升到视频层之上(修复被视频画面盖住)。' },
    { version: '0.12', text: '拉满两侧空白：主容器留白与左右 padding 清零，播放器区域占满聊天区以外的全部宽度，画面更大。' },
    { version: '0.11', text: '布局兜底升级为「聊天区基准」：以聊天区高度为唯一标尺，超出聊天区顶部/底部的任何大块内容一律自动回收(播放器/聊天区/房间头/导航有白名单保护)，新广告新组件无需再补规则；平时零开销，只有页面出现聊天区外内容时才扫描。' },
    { version: '0.10', text: '修正布局：恢复房间头(与聊天区顶部对齐，是布局一部分非广告)；播放器改为 flex 自动填满「房间头到聊天区底部」的剩余高度，播放器底边(含礼物栏)与聊天区底部对齐；隐藏分类面包屑条。' },
    { version: '0.9', text: '播放器与聊天区统一高度：播放器容器拉高到导航以下全高，视频 object-fit:cover 铺满裁剪(无黑边不拉伸，上下边缘裁掉少量画面)。' },
    { version: '0.8', text: '默认隐藏房间头与主播自设组件(matchComponent1/3/6/7、diy-video-embed)，新增布局补偿(隐藏后播放器垂直居中、聊天区拉满，画面不再偏上)；视口锁定保留顶部导航；齿轮恢复旋转(已正放，转起来不显歪)。' },
    { version: '0.7', text: '齿轮图标改静止正放(齿正对上下左右，只保留呼吸光晕，不再旋转到斜角度)；新增隐藏直播间下方热门推荐区块 .hot-wrap。' },
    { version: '0.6', text: '视口锁定修正：房间头(#J_roomHeader)不再隐藏，改为固定到视口顶部(内含切换直播间入口)，播放器与聊天区自动排在它下方；仅隐藏顶部导航。' },
    { version: '0.5', text: '新增「更新说明」版块：⚙ 面板一键查看最近版本更新内容。' },
    { version: '0.4', text: '视口锁定改进：锁定时自动隐藏顶部导航/房间头(挡住 fixed 播放器的三个元素)，播放器与聊天区从视口顶部铺满，纯观看模式，解锁全部恢复。' },
    { version: '0.3', text: '背景广告图只清图不伤内容：#J_mainRoom 等容器的背景推广图改为清背景保留元素(隐藏整个容器会连播放器一起没)；新增隐藏侧栏腾讯广告位组件；自定义规则支持 bg: 前缀(元素带背景广告但里面有正常内容时用)。' },
    { version: '0.2', text: '新增隐藏「主播自设背景推广图」(把播放器顶到一屏以下的大图)；移植斗鱼版双保险：布局兜底(默认开，画面被顶出视口自动回收大块广告) + 视口锁定(实验性，播放器+聊天区钉死视口)。' },
    { version: '0.1', text: '首发：去广告(主播位横幅/侧栏广告/游戏售卖组件) + 🎯拾取元素点选去广告 + 深色背景 + 可拖动齿轮面板。' }
  ];

  function showChangelog() {
    var old = document.getElementById('huya-clean-changelog');
    if (old) { try { old.remove(); } catch (e) { /* 忽略 */ } }
    var overlay = document.createElement('div');
    overlay.id = 'huya-clean-changelog';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);' +
      'display:flex;align-items:center;justify-content:center;';
    var card = document.createElement('div');
    card.style.cssText = 'background:rgba(24,24,28,.98);border:1px solid #444;border-radius:10px;' +
      'padding:14px 18px;max-width:min(540px,88vw);max-height:70vh;overflow:auto;' +
      'font:12px/1.8 "Microsoft YaHei",sans-serif;color:#ddd;box-shadow:0 8px 32px rgba(0,0,0,.6);';
    var html = '<div style="font-weight:700;font-size:13px;color:#fff;margin-bottom:8px">更新说明 ' +
      '<span style="font-weight:400;color:#888;font-size:11px">(点击任意处关闭)</span></div>';
    for (var i = 0; i < CHANGELOG.length; i++) {
      html += '<div style="margin-bottom:8px"><span style="color:#ffb454;font-weight:700">v' +
        CHANGELOG[i].version + '</span> ' + CHANGELOG[i].text + '</div>';
    }
    card.innerHTML = html;
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    var close = function () { try { overlay.remove(); } catch (e) { /* 忽略 */ } };
    overlay.addEventListener('click', close);
    setTimeout(close, 12000); // 12 秒无操作自动关，不挡画面
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
      '<div id="huya-clean-changelog-btn" title="查看最近版本更新说明" style="margin-top:4px;padding:3px 8px;text-align:center;cursor:pointer;background:#5a4a1a;color:#ffd;border-radius:6px;user-select:none">更新说明</div>' +
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

    box.querySelector('#huya-clean-changelog-btn').addEventListener('click', function () {
      showChangelog();
      armPanelAutoClose(box); // 弹层期间重新计时，面板不抢先收起
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
    // 齿轮旋转 + 正放：path 已旋转 22.5° 让齿正对上下左右，转起来角度正常不再显歪
    setStyle('fab-anim', [
      '@keyframes huya-clean-fab-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
      '@keyframes huya-clean-fab-pulse{0%,100%{box-shadow:0 0 4px rgba(255,140,0,.35)}50%{box-shadow:0 0 14px rgba(255,140,0,.9)}}',
      '#huya-clean-fab:hover{animation-duration:2s,1s !important;}'
    ].join(''));
    var toggle = document.createElement('div');
    toggle.id = 'huya-clean-fab';
    toggle.innerHTML = '<svg viewBox="0 0 24 24" style="width:16px;height:16px;display:block;margin:5px auto"><g transform="rotate(22.5 12 12)"><path fill="#ff8c00" d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94zM12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></g></svg>';
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
