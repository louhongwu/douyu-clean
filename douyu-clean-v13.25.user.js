// ==UserScript==
// @name         斗鱼去广告 + 自动网页全屏 (性能优化版)
// @namespace    douyu-adblock
// @version      13.25
// @description  ①纯净直播：白名单式去广告，只留主画面+弹幕栏，广告一网打尽；②深色护眼背景，夜间看播不刺眼；③真实数据面板：活跃/弹幕/礼物/贵宾/粉丝一眼看全，旧房间号自动识别；④自动网页全屏(可开关)，进房即享大屏；⑤可拖动齿轮按钮+设置面板自动收起，清爽不挡画面
// @author       LH
// @match        https://www.douyu.com/*
// @match        https://douyu.com/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @connect       www.doseeing.com
// @connect       pcapi.douyucdn.cn
// @connect       greasyfork.org
// @connect       update.greasyfork.org
// @noframes
// @license      MIT
// @updateURL     https://update.greasyfork.org/scripts/581908/%E6%96%97%E9%B1%BC%E5%8E%BB%E5%B9%BF%E5%91%8A%20%2B%20%E8%87%AA%E5%8A%A8%E7%BD%91%E9%A1%B5%E5%85%A8%E5%B1%8F%20%28%E6%80%A7%E8%83%BD%E4%BC%98%E5%8C%96%E7%89%88%29.meta.js
// @downloadURL   https://update.greasyfork.org/scripts/581908/%E6%96%97%E9%B1%BC%E5%8E%BB%E5%B9%BF%E5%91%8A%20%2B%20%E8%87%AA%E5%8A%A8%E7%BD%91%E9%A1%B5%E5%85%A8%E5%B1%8F%20%28%E6%80%A7%E8%83%BD%E4%BC%98%E5%8C%96%E7%89%88%29.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ========== 设置存储 ==========
  // 开关状态存 localStorage，刷新后保持；document-start 阶段读取，异常时回退默认值
  var SETTINGS_KEY = 'douyu-clean-settings';
  // autoFull 默认关：白名单清理已让主画面占满，且斗鱼网页全屏会收起弹幕栏，与「保留弹幕栏」冲突
  var DEFAULT_SETTINGS = { removeAd: true, darkBg: true, autoFull: false, autoRedPacket: false, autoBox: false, autoReclaim: true, viewportLock: false };

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
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* 隐私模式等场景忽略 */ }
  }

  // ========== 样式管理 ==========
  // 每个功能独立 <style>，开关切换时增删，避免重复注入
  var STYLE_PREFIX = 'douyu-clean-';

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

  // ========== 白名单清理规则（直播间） ==========
  // 原则：只保留「直播主画面(#js-player-main 视频区+控制条)」和「弹幕栏(弹幕列表+聊天输入)」，
  // 其余结构(左侧导航/顶部菜单/主播信息条/榜单/活动/悬浮条/浮层)一律视为广告隐藏。
  // id 来自 2026-08 实测；.ChatRank 是榜单专属容器(与弹幕平级)，隐藏它不会误伤弹幕。
  // 注意：不能隐藏 .layout-Player-asideMainTop —— 运行时它同时包含榜单和弹幕列表！
  var AD_RULES = [
    // ---- 结构性非核心区域（白名单外 = 广告） ----
    'aside, footer, #js-super-menu, #js-room-top-banner',
    '.wm-general,.wm-general-wrapper,.wm-general-bgblur', // 活动页大横幅容器(含主播推荐)，固定高度会把播放器顶出视口，白名单外一律隐藏
    '#js-player-asideTopSuspension',
    '#js-player-rank, #js-player-rankAll, .ChatRank, .ChatRank-rankWraper, .ChatTabContainer',
    '#js-room-activity, #js-room-snapbar, #webmActKefuWeidget',
    '#js-bottom-left, #webm-site-room-player-bottom',
    '#js-player-guessgame, #js-layout-fixed-right, #__hyad, #bc2',
    '#js-player-main [class*="title__"]',
    '.snapbar__TUgkE, .bottom__7ykqJ',
    // ---- 精确广告类名（DouyuEx 2026 实测） ----
    '.ScreenBannerAd,.XinghaiAd,.CustomGroupGuide,.FudaiGiftToolBarTips,.UserInfo-tryEnterHiddenLead,.BargainingKit,.AnchorPocketTips,.FishShopTip,.FollowGuide,.FollowGuide-FadeOut',
    '#js-bottom-right-cloudGame,.CloudGameLink,.RoomText-icon-horn,.RoomText-list,.Search-ad,.RedEnvelopAd,.noHandlerAd-0566b9,.PcDiversion,.DropMenuList-ad,.DropPane-ad,.WXTipsBox',
    '.igl_bg-b0724a,.closure-ab91fb,.VideoAboveVivoAd,.css-widgetWrapper-EdVVC,.watermark-442a18',
    '.MatchSystemChatRoomEntry-roomTabs,.FansMedalDialog-normal,.GameLauncher,.recommendAD-54569e,.recommendApp-0e23eb,.Title-ad,.Bottom-ad,.SignBarrage,.corner-ad-495ade,.SignBaseComponent-sign-ad,.SuperFansBubble',
    '.PlayerToolbar-signCont,#js-widget,.Frawdroom,.HeaderGif-right,.HeaderGif-left,.liveos-workspace',
    '.IconCardAd,.IconCardAdCard,.IconCardAdBoundsBox,.CloseVideoPlayerAd',
    '.room-top-banner-box,.LadderNav,.bacpCommonKeFu,.werbungContainer__2sv7h,.Search-Panel-Advert,.luckBag-wrap',
    '.BattleShipTips,.LastLiveTime,.recommendView-3e8b62,.TurntableLottery-actTips,.feedback-e27241,.FansMedalEnter-maxFlag,.GuessGameMiniPanelB-wrapper,.ZoomTip',
    '.PlayerToolbar-couponInfo,.AroundStarsActTips-actTips,.AroundStarsMoonBoxTips,.AroundStarsPlanetTips,.InteractPlayWithEnter-enterTips1',
    '.SharePanel,.CommonShareToolkit,.mask1-63237a,.mask2-a8df6e,.panel1-1484c9,.panel2-5ece0e',
    'img[src*="sta-op.douyucdn.cn"]',
    // ---- 哈希类名稳定前缀兜底：斗鱼改版导致精确类名失效时仍可命中(仅广告语义，避免误伤) ----
    '[class*="recommendAD-"],[class*="recommendApp-"],[class*="corner-ad-"],[class*="noHandlerAd-"]',
    '[class*="watermark-"],[class*="werbungContainer"],[class*="sign-ad"],[class*="ScreenBannerAd"]',
    '[class*="XinghaiAd"],[class*="Search-ad"],[class*="IconCardAd"],[class*="advert__"]'
  ].join(',') + '{display:none !important;}';

  // 非直播间页面：只隐藏明确广告，不破坏首页导航
  var LIGHT_RULES = [
    '.Search-Panel-Advert',
    '[class*="advert__"]',
    '#__hyad',
    '.CloseVideoPlayerAd,.IconCardAdBoundsBox,.IconCardAd,.IconCardAdCard',
    '.luckBag-wrap',
    'img[src*="sta-op.douyucdn.cn"]'
  ].join(',') + '{display:none !important;}';

  // ========== 深色背景 ==========
  function darkStyle() {
    return [
      'html,body{background:#1a1a1a !important;}',
      '#js-player-main{background:#000 !important;}'
    ].join('');
  }

  // ========== 应用样式（按当前设置） ==========
  var currentSettings = loadSettings();

  function isRoomPage() {
    var path = location.pathname;
    return /^\/(\d+)/.test(path) || /\/topic\//.test(path);
  }

  // ========== 自定义隐藏规则 ==========
  // 斗鱼改版导致内置规则失效时，用户可在 ⚙ 面板补充选择器，存 localStorage 随样式注入
  var CUSTOM_RULES_KEY = 'douyu-clean-custom-rules';

  function loadCustomRules() {
    try { return localStorage.getItem(CUSTOM_RULES_KEY) || ''; } catch (e) { return ''; }
  }

  function saveCustomRules(text) {
    try { localStorage.setItem(CUSTOM_RULES_KEY, text || ''); } catch (e) { /* 隐私模式忽略 */ }
  }

  function customRulesCss() {
    var lines = loadCustomRules().split('\n').map(function (s) { return s.trim(); })
      .filter(function (s) { return s && s.indexOf('{') < 0 && s.indexOf('}') < 0; });
    if (!lines.length) return '';
    return lines.join(',') + '{display:none !important;}';
  }

  // ========== 拾取元素（可视化点选加规则） ==========
  // 不会写 CSS 选择器的用户，点「🎯 拾取元素」后直接点漏掉的广告：
  // 左键=加入规则并隐藏，Shift+左键=选父级(点中 img 想藏整个广告块时用)，Esc/右键=结束。
  // 自动生成稳定选择器(优先 id → 类名 → 路径兜底)，去重后写入自定义规则并立即生效。
  var pickerActive = false;
  function createElementPicker(panelBox, textarea, btn) {
    var tooltip = null;
    var banner = null;
    var cur = null;
    var panelWasOpen = false;

    function cleanupUI() {
      if (tooltip) { try { tooltip.remove(); } catch (e) { /* 忽略 */ } tooltip = null; }
      if (banner) { try { banner.remove(); } catch (e) { /* 忽略 */ } banner = null; }
      if (cur) { try { cur.classList.remove('dc-pick-highlight'); } catch (e) { /* 忽略 */ } cur = null; }
      removeStyle('picker');
    }

    // 播放器/弹幕栏/助手自身禁止点选，防止误藏核心功能
    function isProtected(el) {
      var n = el;
      while (n && n !== document.body) {
        if (n.id === 'js-player-main' || n.id === 'js-player-asideMain' ||
            n.id === 'douyu-clean-panel' || n.id === 'douyu-clean-fab') return true;
        var c = (typeof n.className === 'string') ? n.className : '';
        if (c.indexOf('layout-Player-aside') >= 0) return true;
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
      // 无 id 无类名：完整路径兜底(最多 6 层)
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
      if (cur) { try { cur.classList.remove('dc-pick-highlight'); } catch (err) { /* 忽略 */ } }
      cur = el;
      try { cur.classList.add('dc-pick-highlight'); } catch (err) { /* 忽略 */ }
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
        showToast('不能选择播放器/弹幕栏/助手面板，请点广告元素', true);
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
      if (cur) { try { cur.classList.remove('dc-pick-highlight'); } catch (err) { /* 忽略 */ } cur = null; }
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
      setStyle('picker', '.dc-pick-highlight{outline:2px dashed #22c55e !important;outline-offset:-2px;cursor:crosshair !important;}');
      tooltip = document.createElement('div');
      tooltip.id = 'douyu-clean-pick-tip';
      tooltip.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;background:rgba(0,0,0,.85);color:#4ade80;border:1px solid #4ade80;border-radius:6px;font:11px/1.5 sans-serif;padding:3px 8px;max-width:320px;display:none;';
      banner = document.createElement('div');
      banner.id = 'douyu-clean-pick-bar';
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
  }  // ========== 视口锁定（实验性，⚙ 开关控制） ==========
  // 播放器 + 弹幕栏 fixed 钉死视口，页面不可滚动；文档流里的任何新广告都被裁出视口，
  // 从布局上彻底免疫斗鱼后续新增的广告活动。网页全屏覆盖时自动让播放器占满、弹幕栏隐藏。
  function viewportLockCss() {
    return [
      'html,body{overflow:hidden!important;height:100vh!important;}',
      'html.dc-locked #js-player-main{position:fixed!important;top:0!important;left:0!important;' +
        'width:calc(100vw - var(--dc-aside-w,380px))!important;height:100vh!important;z-index:1000!important;}',
      'html.dc-locked #js-player-asideMain{position:fixed!important;top:0!important;right:0!important;' +
        'width:var(--dc-aside-w,380px)!important;height:100vh!important;z-index:1000!important;}',
      'html.dc-locked.dc-locked-fullscreen #js-player-main{width:100vw!important;}',
      'html.dc-locked.dc-locked-fullscreen #js-player-asideMain{display:none!important;}'
    ].join('');
  }

  // 弹幕栏宽度实时测量：视口锁定按实际宽度排布，适配不同直播间
  function syncAsideWidthVar() {
    var aside = document.getElementById('js-player-asideMain');
    if (!aside) return;
    var w = Math.round(aside.getBoundingClientRect().width);
    if (w >= 240 && w <= 700) {
      try { document.documentElement.style.setProperty('--dc-aside-w', w + 'px'); } catch (e) { /* 忽略 */ }
    }
  }

  // ========== 布局级自动兜底（默认开，⚙ 开关控制） ==========
  // 原理：不依赖类名。只要检测到「把播放器顶出视口顶部的大块占位容器」，就自动隐藏。
  // 斗鱼以后上线任何新广告活动(新容器/新类名)都能被回收，画面永远在顶部，不用再等补规则。
  // 安全边界：只处理完全位于播放器上方、宽度过半屏、高度>=300px 的可见块，绝不碰播放器祖先链。
  var reclaimTimer = null;
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
          // 只有自身宽过半屏/高>=300 的容器才可能包含目标大块，小块不再深入，避免每轮全树强制重排
          if (depth < 8 && (r.width >= minW || r.height >= 300)) walk(el, depth + 1);
          continue;
        }
        var cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
        // 排除播放器祖先链(隐藏祖先会把播放器一起藏掉)
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

  var reclaimFirstTimer = null;
  function tickReclaim() {
    // 页面加载中不扫描：getBoundingClientRect 会强制重排，与斗鱼首屏渲染抢主线程是进房卡顿主因之一
    if (document.readyState !== 'complete') return;
    var player = document.getElementById('js-player-main');
    if (!player) return;
    var pr = player.getBoundingClientRect();
    if (pr.top <= 150) return; // 画面已在视口上部，不打扰
    scanAndHideHogs(player);
  }

  function startLayoutReclaimer() {
    if (reclaimTimer) return;
    reclaimTimer = setInterval(tickReclaim, 2000);
    // 首扫延迟 10 秒：等页面加载完成、布局稳定后再做全树扫描，避免进房瞬间强制重排卡顿
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

  function applyStyles() {
    if (isRoomPage()) {
      if (currentSettings.removeAd) setStyle('ad', AD_RULES);
      else removeStyle('ad');
      if (currentSettings.darkBg) setStyle('dark', darkStyle());
      else removeStyle('dark');
      if (currentSettings.viewportLock) setStyle('lock', viewportLockCss());
      else removeStyle('lock');
      try { document.documentElement.classList.toggle('dc-locked', currentSettings.viewportLock); } catch (e) { /* 忽略 */ }
    } else {
      if (currentSettings.removeAd) setStyle('light', LIGHT_RULES);
      else removeStyle('light');
      removeStyle('lock');
      try { document.documentElement.classList.remove('dc-locked'); } catch (e) { /* 忽略 */ }
    }
    // 自定义规则独立注入，可随时增删，不依赖内置规则开关
    var custom = customRulesCss();
    if (custom) setStyle('custom', custom);
    else removeStyle('custom');
    // 布局兜底按开关启停；弹幕栏宽度跟随实际布局
    if (isRoomPage() && currentSettings.autoReclaim) startLayoutReclaimer();
    else stopLayoutReclaimer();
    syncAsideWidthVar();
  }

  // ========== 空容器回收 ==========
  // 旧版斗鱼广告容器 id 以 bc 开头；只回收「空容器」，避免误伤有内容的正常模块。
  // 只处理新增节点 + 60 秒后断开：弹幕/礼物高频改 DOM，全量轮询会长期空转
  var emptyKillerObserver = null;
  var emptyKillerTimer = null;
  var emptyKillerDelayTimer = null;
  var emptyKillerDebounce = null;
  function startEmptyContainerKiller() {
    function isBcEmpty(el) {
      return /^bc/.test(el.id) && !el.firstElementChild && !el.textContent.trim();
    }
    function hideNode(el) {
      el.style.setProperty('display', 'none', 'important');
    }
    function scanAll() {
      document.querySelectorAll('[id^="bc"]').forEach(function (el) {
        if (isBcEmpty(el)) hideNode(el);
      });
    }
    function flushDebounce() {
      emptyKillerDebounce = null;
      scanAll();
    }

    if (!emptyKillerObserver) {
      // 回调节流 300ms：斗鱼弹幕/礼物高频改 DOM，合并成低频全量扫描；
      // 不再对每个新增节点做子树查询(进房 React 渲染海量节点时那是主线程阻塞大户)
      emptyKillerObserver = new MutationObserver(function () {
        if (emptyKillerDebounce) return;
        emptyKillerDebounce = setTimeout(flushDebounce, 300);
      });
    }
    if (emptyKillerDelayTimer) clearTimeout(emptyKillerDelayTimer);
    // 延迟 6 秒 observe：避开 React 首屏渲染窗口(0-6 秒)，空容器先由下方 scanAll 存量扫描兜底
    emptyKillerDelayTimer = setTimeout(function () {
      emptyKillerDelayTimer = null;
      try { emptyKillerObserver.observe(document.body, { childList: true, subtree: true }); } catch (e) { /* 忽略 */ }
    }, 6000);
    scanAll(); // 启动先扫存量(单次全量查询，进房瞬间一次可接受)
    // 60 秒后断开观察降频为每 60 秒全量扫描：长期稳定去广告，同时避免高频回调空转
    if (emptyKillerTimer) clearInterval(emptyKillerTimer);
    emptyKillerTimer = setInterval(function () {
      try { emptyKillerObserver.disconnect(); } catch (e) { /* 忽略 */ }
      scanAll();
    }, 60000);
  }

  function stopEmptyContainerKiller() {
    if (emptyKillerObserver) { try { emptyKillerObserver.disconnect(); } catch (e) { /* 忽略 */ } }
    if (emptyKillerTimer) { clearInterval(emptyKillerTimer); emptyKillerTimer = null; }
    if (emptyKillerDelayTimer) { clearTimeout(emptyKillerDelayTimer); emptyKillerDelayTimer = null; }
    if (emptyKillerDebounce) { clearTimeout(emptyKillerDebounce); emptyKillerDebounce = null; }
  }

  // ========== 自动网页全屏 ==========
  // 不用合成键盘事件(React 会忽略非可信事件)，改为点击真实按钮。
  // div.wfs-2a8e83 是当前斗鱼「网页全屏」按钮类名，.icon-c8be96 为图标兜底；
  // 均为哈希类名，斗鱼改版后需同步更新(失效时可在 ⚙ 面板自定义规则兜底)。
  // 优先 MutationObserver：按钮一出现立即点击并断开，避免空转；轮询仅兜底(3 秒×40 次封顶)。
  var fullscreenTimer = null;
  var fullscreenRetries = 0;
  var fullscreenDelay = null;
  var fullscreenObserver = null;

  function tryFullscreenClick() {
    var btn = document.querySelector('div.wfs-2a8e83');
    if (btn) {
      stopAutoFullscreen();
      try { btn.click(); } catch (e) { /* 忽略 */ }
      return;
    }
    var icons = document.querySelectorAll('.icon-c8be96');
    if (icons.length >= 2) {
      stopAutoFullscreen();
      try { icons[icons.length - 2].click(); } catch (e) { /* 忽略 */ }
    }
    // 语义兜底：哈希类名随前端版本更新失效时，在播放器内按 title 找「网页全屏」按钮
    var playerEl = document.getElementById('js-player-main');
    if (playerEl) {
      var titleBtns = playerEl.querySelectorAll('[title*="全屏"]:not([title*="退出"])');
      if (titleBtns.length) {
        stopAutoFullscreen();
        try { titleBtns[titleBtns.length - 1].click(); } catch (e) { /* 忽略 */ }
      }
    }
  }

  // 自动全屏延迟 4 秒启动：等斗鱼自动切最高画质/缓冲完成再点全屏，
  // 避免进房瞬间两个重操作叠加造成的卡顿
  function startAutoFullscreen() {
    if (fullscreenTimer || fullscreenDelay || fullscreenObserver) return; // 已在排队/执行，避免重复启动
    fullscreenRetries = 0;
    fullscreenDelay = setTimeout(function () {
      fullscreenDelay = null;
      try {
        var target = document.getElementById('js-player-main') || document.body;
        fullscreenObserver = new MutationObserver(function () { tryFullscreenClick(); });
        fullscreenObserver.observe(target, { childList: true, subtree: true });
      } catch (e) { /* 观察失败退回轮询 */ }
      tryFullscreenClick();
      fullscreenTimer = setInterval(function () {
        fullscreenRetries++;
        if (fullscreenRetries > 40) { stopAutoFullscreen(); return; }
        tryFullscreenClick();
      }, 3000);
    }, 4000);
  }

  function stopAutoFullscreen() {
    if (fullscreenTimer) { clearInterval(fullscreenTimer); fullscreenTimer = null; }
    if (fullscreenDelay) { clearTimeout(fullscreenDelay); fullscreenDelay = null; }
    if (fullscreenObserver) {
      try { fullscreenObserver.disconnect(); } catch (e) { /* 忽略 */ }
      fullscreenObserver = null;
    }
  }

  // ========== 通用工具 ==========
  function getRoomId() {
    var m = location.pathname.match(/^\/(\d+)/);
    return m ? m[1] : null;
  }

  function formatNum(n) {
    var v = Number(n);
    if (isNaN(v)) return '--';
    if (v >= 10000) return (v / 10000).toFixed(1) + '万';
    return String(v);
  }

  function formatMoney(v) {
    if (isNaN(v)) return '--';
    if (v >= 10000) return (v / 10000).toFixed(1) + '万';
    if (v >= 1000) return (v / 1000).toFixed(1) + '千';
    return v.toFixed(0);
  }

  var toastEl = null;
  var toastTimer = null;
  // 单例 toast：新消息替换旧消息，避免红包/宝箱/兜底同时触发时多个提示叠屏
  function showToast(msg, isError) {
    try {
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.style.cssText = [
          'position:fixed;top:45%;left:50%;transform:translate(-50%,-50%);',
          'z-index:2147483647;pointer-events:none;',
          'background:rgba(0,0,0,.88);color:#fff;padding:10px 20px;border-radius:8px;',
          'font:13px/1.6 "Microsoft YaHei",sans-serif;max-width:70vw;',
          'box-shadow:0 4px 16px rgba(0,0,0,.4);'
        ].join('');
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

  // ========== 直播间数据（人数/弹幕人数/礼物价值） ==========
  // 数据源为 DouyuEx 同款第三方统计接口，字段含义：active.uv=今日活跃、chat.uv=弹幕人数、
  // gift.all.price=礼物总价值(分)、gift.paid.price=鱼翅礼物价值(分)。
  // 第三方服务可能失效：失败时保留上次数值，首次失败显示 --（不编造数据）。
  var roomDataTimer = null;
  var roomDataSoonTimer = null;   // 进房 3 秒补拉
  var roomDataRetryTimer = null;  // 失败 15 秒重试
  var lastRoomData = null;
  var lastFanOfficial = null;
  var lastShowTime = null;   // 官方开播时间戳(秒)，未开播为 null
  var lastShowStatus = null; // 官方直播状态 "1"=直播中

  // ========== 真实房间号解析 ==========
  // 主播换过房间号时(如 39939→2421040)，第三方统计与官方接口只认新房号：
  // 旧房号页面能看，但 aggr 返回全 0、h5room 只有 online。通过页面标题提取主播名，
  // 调 doseeing 搜索接口拿真实房号；结果缓存到 sessionStorage，刷新页面免重复解析。
  var realRid = null;
  var resolvingRid = false;
  var RID_CACHE_PREFIX = 'douyu-clean-real-rid-';

  // 数据请求统一用真实房号；未解析时回退当前 URL 房号
  function getEffectiveRid() {
    return realRid || getRoomId();
  }

  function loadRealRidCache() {
    try {
      var rid = getRoomId();
      if (!rid || realRid) return;
      var cached = sessionStorage.getItem(RID_CACHE_PREFIX + rid);
      if (cached) realRid = cached;
    } catch (e) { /* 隐私模式等场景忽略 */ }
  }

  // 只在「未解析过 + 当前房号确实查不到」时触发；防重入，失败静默回退原房号
  // 解析完成统一处理：记录真实房号、缓存结果、换房号时刷新全部数据
  function finishResolveRid(uid) {
    resolvingRid = false;
    if (!uid) return; // 两个数据源都失败则保留原房号，不编造
    var rid = getRoomId();
    try {
      realRid = String(uid); // uid 与当前房号相同也记录，避免反复触发解析
      if (rid) sessionStorage.setItem(RID_CACHE_PREFIX + rid, realRid);
    } catch (e) { /* 忽略 */ }
    if (rid && uid !== rid) {
      showToast('已识别真实房间号 ' + uid + '，正在刷新数据…');
      // 用新房号立即重拉全部数据
      fetchOfficialRoomInfo();
      fetchRoomData();
      stopNobleWatch(); // 换真实房号后重建贵宾通道
      startNobleWatch();
    }
  }

  // 兜底源：斗鱼官方搜索页 HTML(doseeing 失效/无结果时启用，2026-08 实测可解析真实房号)
  function extractRidFromSearchHtml(html, nickname) {
    // 带登录态时搜索页 JSON 是双重转义形态("nickName\":\"三酒OuO\")，两种形态都兼容
    var needles = [
      '"nickName":"' + nickname + '"',
      '"nickName\\":\\"' + nickname + '\\"'
    ];
    for (var i = 0; i < needles.length; i++) {
      var idx = String(html).indexOf(needles[i]);
      if (idx < 0) continue;
      var seg = String(html).slice(idx, idx + 500);
      // 兼容无转义("rid":)与 JSON 转义(\\"rid\\":)两种形态
      var m = seg.match(/\\?"rid\\?":(\d+)/);
      if (m) return m[1];
    }
    return null;
  }

  function resolveViaDouyuSearch(nickname) {
    try {
      // 8 秒超时兜底：搜索页响应慢/卡住时也要结束解析，避免 resolvingRid 一直占用
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timeoutTimer = null;
      if (controller) {
        timeoutTimer = setTimeout(function () { try { controller.abort(); } catch (e2) { /* 忽略 */ } }, 8000);
      }
      fetch('https://www.douyu.com/search?kw=' + encodeURIComponent(nickname), {
        credentials: 'include',
        signal: controller ? controller.signal : undefined
      })
        .then(function (r) { return r.text(); })
        .then(function (html) {
          finishResolveRid(extractRidFromSearchHtml(html, nickname));
        })
        .catch(function () { finishResolveRid(null); })
        .then(function () { if (timeoutTimer) clearTimeout(timeoutTimer); });
    } catch (e) { finishResolveRid(null); }
  }

  // 从斗鱼页面标题提取主播名。标题格式：{直播间标题}_{主播名}直播_{主播名}直播_{主播名}{分类}直播_{主播名}斗鱼直播。
  // 关键：第一段是主播可自定义的直播间标题(如「影之刃零预售」)，不是主播名！
  // 优先最后一段去掉「斗鱼直播」；兜底第二段去掉「直播」；再兜底第一段(老逻辑)。
  function extractNicknameFromTitle(title) {
    var parts = String(title || '').split('_');
    if (parts.length > 1) {
      var last = parts[parts.length - 1] || '';
      if (/斗鱼直播$/.test(last)) return last.replace(/斗鱼直播$/, '');
      var second = parts[1] || '';
      if (/直播$/.test(second)) return second.replace(/直播$/, '');
    }
    return (parts[0] || '').replace(/直播$/, '');
  }

  function tryResolveRealRid() {
    if (resolvingRid || realRid) return;
    var rid = getRoomId();
    if (!rid) return;
    // 页面标题第一段是主播可改的直播间标题，主播名要从尾段/第二段提取(主播改标题也不影响解析)
    var nickname = '';
    try {
      nickname = extractNicknameFromTitle(document.title);
    } catch (e) { /* 忽略 */ }
    if (!nickname) return;
    resolvingRid = true;
    var fallback = function () { resolveViaDouyuSearch(nickname); };
    if (typeof GM_xmlhttpRequest === 'undefined') { fallback(); return; }
    GM_xmlhttpRequest({
      method: 'GET',
      url: 'https://www.doseeing.com/api/suggest_all?type=room&nickname=' + encodeURIComponent(nickname),
      responseType: 'json',
      timeout: 8000,
      onload: function (res) {
        try {
          var rooms = res.response && res.response.suggest && res.response.suggest.room;
          if (rooms && rooms.length) {
            // 模糊匹配按优先级挑：精确同名 → 互相包含(如搜索「yyf」命中「yyfyyf」) → 首个结果
            var pick = null;
            for (var i = 0; i < rooms.length; i++) {
              if (rooms[i].nickname === nickname) { pick = rooms[i]; break; }
            }
            if (!pick) {
              for (var j = 0; j < rooms.length; j++) {
                var rn = rooms[j].nickname;
                if (rn && (rn.indexOf(nickname) >= 0 || nickname.indexOf(rn) >= 0)) { pick = rooms[j]; break; }
              }
            }
            if (!pick) pick = rooms[0];
            if (pick && pick.user_id) {
              finishResolveRid(String(pick.user_id));
              return;
            }
          }
        } catch (e) { /* 落空走兜底 */ }
        fallback();
      },
      onerror: fallback,   // doseeing 异常 → 官方搜索页兜底
      ontimeout: fallback
    });
  }

  // 已播时长：基于官方 show_time 实时推算，心跳每 2 秒刷新，不额外发请求
  function updateLiveDuration() {
    var el = document.getElementById('dci-live');
    if (!el) return;
    var txt = '--';
    if (lastShowTime && lastShowStatus === '1') {
      var sec = Math.floor(Date.now() / 1000) - lastShowTime;
      if (sec > 0 && sec < 86400 * 30) {
        var h = Math.floor(sec / 3600);
        var m = Math.floor((sec % 3600) / 60);
        txt = h > 0 ? h + '时' + m + '分' : (m > 0 ? m + '分' : '刚刚');
      }
    }
    el.textContent = txt;
    if (el.parentNode) el.parentNode.title = INFO_TITLES['dci-live'] + ':' + txt;
  }

  // 官方房间信息接口（同源，无需 GM 权限）：fans=粉丝总数、show_time=开播时间戳
  // 注意：主播换过房间号时官方接口对旧房号不返回房间信息，绝不显示「房间已关闭」，
  // 而是触发真实房间号解析(页面标题取主播名 → doseeing 搜索)，解析成功后自动重拉数据。
  var h5roomAbort = null; // 进行中的官方房间请求，便于取消过期请求

  function fetchOfficialRoomInfo() {
    var rid = getEffectiveRid();
    if (!rid || document.hidden) return; // 后台标签页不拉数据
    if (h5roomAbort) { try { h5roomAbort.abort(); } catch (e) { /* 忽略 */ } h5roomAbort = null; }
    var ctrl = null;
    try { ctrl = new AbortController(); h5roomAbort = ctrl; } catch (e) { /* 环境不支持则无取消 */ }
    try {
      fetch('https://www.douyu.com/swf_api/h5room/' + rid, {
        credentials: 'include',
        signal: ctrl ? ctrl.signal : undefined
      })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          h5roomAbort = null;
          var d = j && j.data;
          if (d && d.fans) {
            lastFanOfficial = d.fans;
            setText('dci-fan', formatNum(d.fans));
          }
          if (d && (d.show_time !== undefined || d.show_status !== undefined)) {
            lastShowTime = d.show_time ? Number(d.show_time) : null;
            lastShowStatus = d.show_status !== undefined ? String(d.show_status) : null;
            updateLiveDuration();
          }
          var hasRoomInfo = !!(d && (d.fans || d.show_status || d.room_name || d.nickname));
          if (!hasRoomInfo) tryResolveRealRid(); // 旧房号特征：接口只有 online
        })
        .catch(function () { h5roomAbort = null; /* 失败保留旧值，由 doseeing 兜底 */ });
    } catch (e) { /* 忽略 */ }
  }

  function buildRoomInfoBar() {
    if (document.getElementById('douyu-clean-info')) return;
    var bar = document.createElement('div');
    bar.id = 'douyu-clean-info';
    // 插在弹幕栏顶部，与聊天内容对齐；背景条拉高、文字贴底部：
    // 竖屏直播间弹幕栏偏上超出视口时，文字随之下移进入视口(遮挡部分聊天内容可接受)
    bar.style.cssText = [
      'display:flex;align-items:flex-end;gap:8px;',
      'height:88px;padding:0 8px 6px;box-sizing:border-box;',
      'background:rgba(20,20,22,.92);color:#ddd;',
      'font:11px/1.6 "Microsoft YaHei",sans-serif;user-select:none;',
      'border-bottom:1px solid #2a2a2d;white-space:nowrap;flex-shrink:0;'
    ].join('');
    bar.innerHTML =
      '<span title="今日累计活跃人数:--">👥 <b id="dci-view" style="color:#ff8c00">--</b></span>' +
      '<span title="本场已播时长:--">⏱️ <b id="dci-live" style="color:#9ad1ff">--</b></span>' +
      '<span title="今日弹幕人数:--">💬 <b id="dci-danmu" style="color:#58a6ff">--</b></span>' +
      '<span title="今日礼物总价值:--">🎁 <b id="dci-gift" style="color:#f5b042">--</b></span>' +
      '<span title="当前在线贵宾:--">👑 <b id="dci-noble" style="color:#c792ea">--</b></span>' +
      '<span title="当前粉丝总数:--">⭐ <b id="dci-fan" style="color:#7ee787">--</b></span>' +
      '<span id="dci-refresh" title="手动刷新数据" style="margin-left:auto;cursor:pointer;color:#888;flex-shrink:0;padding:0 5px;font-size:14px;line-height:1">↻</span>';
    var asideMain = document.getElementById('js-player-asideMain');
    if (asideMain) asideMain.insertBefore(bar, asideMain.firstChild);
    else document.body.appendChild(bar); // 弹幕栏未渲染时先挂 body，心跳归位
    // 手动刷新兜底：5 分钟周期外随时点一下立即拉取，带旋转反馈
    setStyle('refresh-anim',
      '@keyframes douyu-clean-refresh-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}' +
      '#dci-refresh.spinning{animation:douyu-clean-refresh-spin .6s linear 1;color:#ff8c00;}');
    var refreshBtn = bar.querySelector('#dci-refresh');
    refreshBtn.addEventListener('click', function () {
      fetchRoomData(); // 立即刷新活跃/弹幕/礼物/粉丝(含官方粉丝)
      refreshBtn.classList.remove('spinning');
      void refreshBtn.offsetWidth; // 强制重排以重启动画
      refreshBtn.classList.add('spinning');
    });
    refreshBtn.addEventListener('animationend', function () {
      refreshBtn.classList.remove('spinning'); // 动画结束恢复原色
    });
  }

  // 信息条悬浮说明(DouyuEx 同款风格：默认只显示图标+数字，鼠标放上去才显示完整说明+当前值)
  var INFO_TITLES = {
    'dci-view': '今日累计活跃人数',
    'dci-live': '本场已播时长',
    'dci-danmu': '今日弹幕人数',
    'dci-gift': '今日礼物总价值(元)',
    'dci-noble': '当前在线贵宾(贵族)人数',
    'dci-fan': '当前粉丝总数'
  };
  function refreshInfoTitles() {
    var keys = ['dci-view', 'dci-live', 'dci-danmu', 'dci-gift', 'dci-noble', 'dci-fan'];
    for (var i = 0; i < keys.length; i++) {
      var b = document.getElementById(keys[i]);
      if (b && b.parentNode) b.parentNode.title = INFO_TITLES[keys[i]] + ':' + b.textContent;
    }
  }

  function updateRoomInfoBar() {
    if (!lastRoomData) return;
    var set = function (id, txt) {
      var el = document.getElementById(id);
      if (el) el.textContent = txt;
    };
    set('dci-view', formatNum(lastRoomData['active.uv']));
    set('dci-danmu', formatNum(lastRoomData['chat.uv']));
    var total = Number(lastRoomData['gift.all.price'] || 0) / 100;
    set('dci-gift', total > 0 ? '¥' + formatMoney(total) : '0');
    if (!lastFanOfficial) set('dci-fan', formatNum(lastRoomData['end.fan']));
    refreshInfoTitles();
  }

  var roomDataXhr = null;      // 当前进行中的 doseeing 请求(新请求前取消旧请求)
  var lastRoomDataFetch = 0;   // 最近一次成功拉取时间戳(可见性补拉用)

  function fetchRoomData() {
    if (document.hidden) return; // 后台标签页不拉数据，切回前台由 visibilitychange 补拉
    fetchOfficialRoomInfo(); // 官方粉丝数随周期一起刷新
    var rid = getEffectiveRid();
    if (!rid || typeof GM_xmlhttpRequest === 'undefined') return;
    if (roomDataXhr) { try { roomDataXhr.abort(); } catch (e) { /* 忽略 */ } roomDataXhr = null; }
    var payload = window.btoa('rid=' + rid + '&dt=0').split('').reverse().join('');
    roomDataXhr = GM_xmlhttpRequest({
      method: 'POST',
      url: 'https://www.doseeing.com/xeee/room/aggr',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Origin': 'https://www.doseeing.com',
        'Referer': 'https://www.doseeing.com/room/' + rid
      },
      data: JSON.stringify({ m: payload }),
      responseType: 'json',
      timeout: 8000,
      onload: function (res) {
        roomDataXhr = null;
        try {
          // 兼容两种返回结构：{data:{...}} 或直接 {...}
          var resp = res.response;
          var d = resp && resp.data ? resp.data : resp;
          if (d && d['active.uv'] !== undefined) {
            lastRoomData = d;
            lastRoomDataFetch = Date.now();
            roomDataRetries = 0;
            updateRoomInfoBar();
            // 弹幕/礼物为 0 = 数据源未收录该房号(主播换房特征)，尝试解析真实房号；
            // 解析失败自动回退原房号，无副作用
            if (!realRid && d['chat.uv'] === 0 && Number(d['gift.all.price'] || 0) === 0) {
              tryResolveRealRid();
            }
          } else {
            scheduleRoomDataRetry(); // 200 但内容异常(错误页/风控)：快速重试，不等 5 分钟周期
          }
        } catch (e) { scheduleRoomDataRetry(); }
      },
      onerror: function () { roomDataXhr = null; scheduleRoomDataRetry(); }, // 失败快速重试，避免等满一个周期
      ontimeout: function () { roomDataXhr = null; scheduleRoomDataRetry(); }
    });
  }

  // 刷新策略：立即拉取；失败 15 秒快速重试(最多4次)；成功后按 60 秒周期刷新；
  // 页面首屏渲染后 3 秒再补一次，覆盖 SPA 切房/接口偶发慢的情况
  var roomDataRetries = 0;
  function startRoomData() {
    buildRoomInfoBar();
    loadRealRidCache(); // 刷新页面时恢复已解析的真实房号，跳过重复解析
    fetchOfficialRoomInfo();
    fetchRoomData();
    if (roomDataTimer) clearInterval(roomDataTimer);
    roomDataTimer = setInterval(fetchRoomData, 300000); // 每 5 分钟刷新
    if (roomDataSoonTimer) clearTimeout(roomDataSoonTimer);
    roomDataSoonTimer = setTimeout(function () { roomDataSoonTimer = null; fetchRoomData(); }, 3000);
  }

  function scheduleRoomDataRetry() {
    if (roomDataRetries >= 4) { roomDataRetries = 0; return; }
    roomDataRetries++;
    if (roomDataRetryTimer) clearTimeout(roomDataRetryTimer);
    roomDataRetryTimer = setTimeout(function () { roomDataRetryTimer = null; fetchRoomData(); }, 15000);
  }

  // 切回前台且数据超过 30 秒未更新时立即补拉，避免后台期间错过数据
  document.addEventListener('visibilitychange', function () {
    try {
      if (!document.hidden && isRoomPage() && Date.now() - lastRoomDataFetch > 30000) {
        fetchRoomData();
      }
    } catch (e) { /* 忽略 */ }
  });

  // ========== 贵宾数（斗鱼弹幕协议，未登录实时推送） ==========
  // 协议与 DouyuEx 同款：wss://danmuproxy.douyu.com:8502~8505，loginreq+joingroup 后
  // 服务端推送 oni(在线信息) 消息，vn@= 即当前在线贵宾数；40 秒 mrkl 心跳，断线指数退避重连。
  var nobleSocket = null;
  var nobleTimer = null;
  var nobleReconnectCount = 0;
  var nobleHiddenRetry = false; // 后台标签页断线：暂停退避计时，恢复可见后立即重连
  var nobleStopped = false;     // 主动停止标记：切房/停用时关闭 socket 不触发自动重连

  function startNobleWatch() {
    nobleStopped = false;
    var WS = (typeof unsafeWindow !== 'undefined' && unsafeWindow.WebSocket) || window.WebSocket;
    if (!WS || nobleSocket) return;
    try {
      var port = 8502 + Math.floor(Math.random() * 4);
      nobleSocket = new WS('wss://danmuproxy.douyu.com:' + port);
    } catch (e) { nobleSocket = null; return; }
    nobleSocket.onopen = function () {
      nobleReconnectCount = 0;
      nobleHiddenRetry = false;
      var rid = getEffectiveRid();
      if (rid) {
        try {
          nobleSocket.send(douyuPacket('type@=loginreq/roomid@=' + rid));
          nobleSocket.send(douyuPacket('type@=joingroup/rid@=' + rid + '/gid@=-9999/'));
        } catch (e) { /* 忽略 */ }
      }
      if (nobleTimer) clearInterval(nobleTimer);
      nobleTimer = setInterval(function () {
        try {
          if (nobleSocket && nobleSocket.readyState === 1) nobleSocket.send(douyuPacket('type@=mrkl/'));
        } catch (e) { /* 忽略 */ }
      }, 40000);
    };
    nobleSocket.onmessage = function (e) {
      try {
        if (typeof e.data === 'string') { handleNobleText(e.data); return; }
        var data = e.data;
        // 大直播间每秒大量弹幕消息：TextDecoder 只解码含 oni 的消息，避免频繁 new FileReader
        var decode = function (buf) {
          try {
            var txt = '';
            if (typeof TextDecoder !== 'undefined') txt = new TextDecoder().decode(buf);
            if (txt.indexOf('type@=oni') < 0) return; // 非贵宾消息：直接丢弃
            handleNobleText(txt);
          } catch (err) { /* 解析失败忽略 */ }
        };
        if (data && typeof data.arrayBuffer === 'function') {
          data.arrayBuffer().then(decode).catch(function () { /* 忽略 */ });
        } else if (typeof FileReader !== 'undefined') {
          var fr = new FileReader();
          fr.onload = function () { try { handleNobleText(String(fr.result || '')); } catch (err) { /* 忽略 */ } };
          try { fr.readAsText(data); } catch (err) { /* 忽略 */ }
        }
      } catch (err) { /* 忽略 */ }
    };
    nobleSocket.onclose = nobleSocket.onerror = function () {
      // 旧连接的迟到回调：全局引用已指向新连接时直接忽略，防止引用错乱/重复重连
      if (nobleSocket !== this) return;
      clearInterval(nobleTimer); nobleTimer = null;
      nobleSocket = null;
      if (nobleStopped) return; // 主动关闭(切房/停用)：不触发重连
      // 无限重连：指数退避 3 秒起步、封顶 60 秒，网络波动后也能自动恢复；
      // 后台标签页不空转退避计时，恢复可见后由 visibilitychange 立即重连
      nobleReconnectCount++;
      if (document.hidden) { nobleHiddenRetry = true; return; }
      var delay = Math.min(3000 * Math.pow(1.5, nobleReconnectCount - 1), 60000);
      setTimeout(startNobleWatch, delay);
    };
  }

  // 主动停止贵宾通道：切房/停用时调用，关闭后不触发自动重连
  function stopNobleWatch() {
    nobleStopped = true;
    nobleHiddenRetry = false;
    if (nobleTimer) { clearInterval(nobleTimer); nobleTimer = null; }
    if (nobleSocket) {
      try { nobleSocket.close(); } catch (e) { /* 忽略 */ }
      nobleSocket = null;
    }
    nobleReconnectCount = 0;
  }

  // 断网恢复后立即重连贵宾通道，不等退避计时
  window.addEventListener('online', function () {
    try {
      if (!nobleSocket && isRoomPage()) {
        nobleReconnectCount = 0;
        startNobleWatch();
      }
    } catch (e) { /* 忽略 */ }
  });

  // 后台标签页恢复可见：立即重连此前暂停的贵宾通道
  document.addEventListener('visibilitychange', function () {
    try {
      if (!document.hidden && nobleHiddenRetry && !nobleSocket && isRoomPage()) {
        nobleHiddenRetry = false;
        nobleReconnectCount = 0;
        startNobleWatch();
      }
    } catch (e) { /* 忽略 */ }
  });

  // 贵宾消息解析：oni 消息里 vn@= 即当前在线贵宾数
  function handleNobleText(msg) {
    try {
      String(msg || '').split('\0').forEach(function (seg) {
        if (!seg || seg.length < 12) return;
        if (/type@=oni/.test(seg)) {
          var m = seg.match(/vn@=(\d+)/);
          if (m) {
            setText('dci-noble', formatNum(Number(m[1])));
            refreshInfoTitles();
          }
        }
      });
    } catch (err) { /* 解析失败忽略 */ }
  }

  // 斗鱼弹幕协议封包（MSG_TYPE=689，与 DouyuEx 同款字节布局）
  function douyuPacket(str) {
    var len = 0;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 128) len++; else if (c < 2048) len += 2; else len += 3;
    }
    var buf = new Uint8Array(len + 13);
    var lengthWord = new Uint32Array([len + 9]);
    buf.set(new Uint8Array(lengthWord.buffer), 0);
    buf.set(new Uint8Array(lengthWord.buffer), 4);
    var typeWord = new Uint32Array([689]);
    buf.set(new Uint8Array(typeWord.buffer), 8);
    for (var i = 0, j = 12; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code < 128) buf[j++] = code;
      else if (code < 2048) { buf[j++] = 0xC0 | (code >> 6); buf[j++] = 0x80 | (code & 63); }
      else { buf[j++] = 0xE0 | (code >> 12); buf[j++] = 0x80 | ((code >> 6) & 63); buf[j++] = 0x80 | (code & 63); }
    }
    return buf;
  }

  function setText(id, txt) {
    var el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  // ========== 信息条定位（IntersectionObserver 优先，心跳兜底） ==========
  var asideObserver = null;
  var asideObserverTarget = null;

  // 位置同步：全屏覆盖→隐藏信息条；弹幕栏出视口→固定到视口右下(避开视频区)；进入视口→贴回弹幕栏顶部
  function syncInfoBarPos(asideVisible) {
    var bar = document.getElementById('douyu-clean-info');
    if (!bar) return;
    var pm = document.getElementById('js-player-main');
    var covering = false;
    if (pm) {
      var pr = pm.getBoundingClientRect();
      covering = pr.left <= 2 && pr.top <= 2 &&
        pr.right >= window.innerWidth - 2 && pr.bottom >= window.innerHeight - 2;
    }
    // 视口锁定模式联动：全屏覆盖时播放器占满、弹幕栏隐藏
    try { document.documentElement.classList.toggle('dc-locked-fullscreen', covering); } catch (e) { /* 忽略 */ }
    if (covering) {
      if (bar.style.display !== 'none') bar.style.display = 'none';
      return;
    }
    if (bar.style.display === 'none') bar.style.display = 'flex';
    // 以弹幕栏本身可见性为准(避免 fixed 后自身可见导致的抖动循环)，
    // 弹幕栏在视口外 → 信息条临时固定右下角；弹幕栏进入视口 → 自动贴回
    if (!asideVisible && bar.style.position !== 'fixed') {
      bar.style.position = 'fixed';
      bar.style.left = 'auto';
      bar.style.right = '10px';
      bar.style.top = 'auto';
      bar.style.bottom = '10px';
      bar.style.zIndex = '2147483646';
    } else if (asideVisible && bar.style.position === 'fixed') {
      bar.style.position = '';
      bar.style.left = '';
      bar.style.right = '';
      bar.style.top = '';
      bar.style.bottom = '';
      bar.style.zIndex = '';
      var aside = document.getElementById('js-player-asideMain');
      if (aside && bar.parentNode !== aside) aside.insertBefore(bar, aside.firstChild);
    }
  }

  // IntersectionObserver 观察弹幕栏可见性，只在状态变化时触发定位(替代每 2 秒全量轮询)
  var asideObserverRetries = 0;
  function startAsideObserver() {
    if (typeof IntersectionObserver === 'undefined') return; // 老环境退回心跳轮询
    var aside = document.getElementById('js-player-asideMain');
    if (!aside) {
      if (asideObserverRetries < 30) { asideObserverRetries++; setTimeout(startAsideObserver, 2000); }
      return;
    }
    if (asideObserver && asideObserverTarget === aside) return;
    if (asideObserver) { try { asideObserver.disconnect(); } catch (e) { /* 忽略 */ } asideObserver = null; }
    try {
      asideObserver = new IntersectionObserver(function (entries) {
        try {
          var bar = document.getElementById('douyu-clean-info');
          if (!bar) return;
          for (var i = 0; i < entries.length; i++) {
            syncInfoBarPos(entries[i].isIntersecting);
          }
        } catch (e) { reportError('信息条定位', e); }
      }, { threshold: 0 });
      asideObserver.observe(aside);
      asideObserverTarget = aside;
    } catch (e) { asideObserver = null; /* 失败退回心跳轮询 */ }
  }

  // ========== 融合功能：弹幕无限收藏 ==========
  // 斗鱼官方云收藏有 50 条上限；超出后自动转存本地，实现无限收藏。
  // 通过钩住 XHR responseText 无感拦截收藏接口；收藏数据独立存本地，不与 DouyuEx 混用。
  var COLLECT_STORE_KEY = 'douyu-clean-danmaku-collect';

  function getLocalCollect() {
    try {
      var v = JSON.parse(localStorage.getItem(COLLECT_STORE_KEY));
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  function saveLocalCollect(list) {
    try { localStorage.setItem(COLLECT_STORE_KEY, JSON.stringify(list)); } catch (e) { /* 隐私模式忽略 */ }
  }

  // 收藏接口钩子：add 超限转本地、query 注入本地、del 同步删本地
  function hookDanmakuCollect() {
    var XHR = (typeof unsafeWindow !== 'undefined' && unsafeWindow.XMLHttpRequest) || window.XMLHttpRequest;
    if (!XHR || XHR.__dcCollectHooked) return;
    XHR.__dcCollectHooked = true;
    var origOpen = XHR.prototype.open;
    var origSend = XHR.prototype.send;
    if (origOpen) {
      XHR.prototype.open = function (method, url) {
        try { this.__dcUrl = String(url || ''); } catch (e) { /* 忽略 */ }
        return origOpen.apply(this, arguments);
      };
    }
    if (origSend) {
      XHR.prototype.send = function (body) {
        try { this.__dcBody = body; } catch (e) { /* 忽略 */ }
        return origSend.apply(this, arguments);
      };
    }
    var origDesc = Object.getOwnPropertyDescriptor(XHR.prototype, 'responseText');
    if (!origDesc || !origDesc.get) return;
    Object.defineProperty(XHR.prototype, 'responseText', {
      configurable: true,
      get: function () {
        var txt = origDesc.get.call(this);
        try {
          if (!txt || !this.__dcUrl || this.__dcUrl.indexOf('bulletscreen/') < 0) return txt;
          var url = this.__dcUrl;
          var obj = JSON.parse(txt);
          if (url.indexOf('bulletscreen/query') >= 0 && obj && obj.data && obj.data.list) {
            // 本地收藏注入官方列表顶部(type=2 与 DouyuEx 同款标记，页面按该类型渲染)
            var local = getLocalCollect().map(function (item) {
              return { content: item.content, type: 2, id: item.id };
            });
            if (local.length) obj.data.list.unshift.apply(obj.data.list, local);
            return JSON.stringify(obj);
          }
          if (url.indexOf('bulletscreen/add') >= 0 && obj && obj.error !== 0) {
            // 云收藏失败(上限/其他原因)：已登录才转存本地；未登录保留官方错误提示，不谎报成功
            var body = this.__dcBody;
            var content = '';
            try { content = new URLSearchParams(String(body || '')).get('content') || ''; } catch (e1) { /* 忽略 */ }
            if (!content) { try { content = (JSON.parse(String(body || '{}')) || {}).content || ''; } catch (e2) { /* 忽略 */ } }
            if (content && isLoggedIn()) {
              var list = getLocalCollect();
              list.unshift({ content: content, id: Date.now() });
              if (list.length > 500) list.length = 500;
              saveLocalCollect(list);
              obj.msg = '收藏未成功(官方收藏失败)，已转存本地(斗鱼助手无限收藏)';
              // 双击收藏按钮触发页面重查列表，让刚转存的本地收藏立即显示
              var tip = document.querySelector('.ChatBarrageCollect-tip');
              if (tip) {
                tip.click();
                setTimeout(function () { try { tip.click(); } catch (e3) { /* 忽略 */ } }, 300);
              }
              return JSON.stringify(obj);
            }
          }
          if (url.indexOf('bulletscreen/del') >= 0 && obj && obj.error === 0) {
            var id = null;
            try { id = new URLSearchParams(String(this.__dcBody || '')).get('id'); } catch (e4) { /* 忽略 */ }
            if (id === null || id === undefined) { try { id = (JSON.parse(String(this.__dcBody || '{}')) || {}).id; } catch (e5) { /* 忽略 */ } }
            if (id !== null && id !== undefined) {
              saveLocalCollect(getLocalCollect().filter(function (item) { return String(item.id) !== String(id); }));
            }
          }
        } catch (e6) { /* 解析失败原样返回 */ }
        return txt;
      }
    });
  }

  // 收藏弹窗搜索框：弹窗出现后自动在标题栏注入搜索框，按文本过滤收藏项
  // 用 MutationObserver 监听弹窗出现（替代 1.5 秒轮询）；注入幂等：已有输入框则跳过
  var collectSearchObserver = null;
  var collectSearchDebounce = null;
  function injectCollectSearch() {
    var title = document.querySelector('.ChatBarrageCollectPop-title');
    if (!title || document.getElementById('dc-collect-search')) return;
    var input = document.createElement('input');
    input.id = 'dc-collect-search';
    input.placeholder = '搜索弹幕';
    input.style.cssText = 'margin-left:6px;width:96px;border:1px solid #555;border-radius:4px;' +
      'background:#222;color:#eee;font-size:12px;padding:1px 6px;outline:none;vertical-align:middle;';
    title.appendChild(input);
    input.addEventListener('input', function () {
      var kw = input.value.trim();
      var content = document.querySelector('.ChatBarrageCollectPop-barrageContent');
      if (!content) return;
      var items = content.children;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.classList && it.classList.contains('empty-txt')) continue;
        if (!kw || (it.textContent || '').indexOf(kw) >= 0) it.style.display = '';
        else it.style.display = 'none';
      }
    });
  }

  function startCollectSearch() {
    if (collectSearchObserver) return;
    try {
      // debounce 500ms：进房 React 海量渲染会高频触发 body 级 observer，
      // 合并成低频检查，避免每次 DOM 变化都同步全文档 querySelector(进房卡顿主因之一)
      collectSearchObserver = new MutationObserver(function () {
        if (collectSearchDebounce) return;
        collectSearchDebounce = setTimeout(function () {
          collectSearchDebounce = null;
          try { injectCollectSearch(); } catch (e) { /* 弹窗未出现时忽略 */ }
        }, 500);
      });
      collectSearchObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch (e) { /* 观察失败：忽略 */ }
    try { injectCollectSearch(); } catch (e) { /* 忽略 */ }
  }

  // ========== 融合功能：图片弹幕（与 DouyuEx 标记互通） ==========
  // 机制：发送方把图片地址压缩成 [DouyuEx图片<base36路径>.<扩展名>] 文本标记发出；
  // 接收方在弹幕列表渲染时还原为 <img>。需双方都装支持该标记的脚本才可见，且需登录。
  var IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

  function isValidImageExt(name) {
    var n = String(name || '').toLowerCase();
    for (var i = 0; i < IMAGE_EXTENSIONS.length; i++) {
      if (n === IMAGE_EXTENSIONS[i]) return true;
    }
    return false;
  }

  function compressImageUrl(text) {
    try {
      if (typeof BigInt !== 'function') return String(text);
      return BigInt(text).toString(36);
    } catch (e) { return String(text); }
  }

  function decompressImageUrl(base36Str) {
    try {
      if (typeof BigInt !== 'function') return String(base36Str);
      var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      var s = String(base36Str).toUpperCase();
      var decimal = BigInt(0);
      var mult = BigInt(1);
      for (var i = s.length - 1; i >= 0; i--) {
        var idx = chars.indexOf(s[i]);
        if (idx < 0) return String(base36Str);
        decimal += BigInt(idx) * mult;
        mult *= BigInt(36);
      }
      return decimal.toString();
    } catch (e) { return String(base36Str); }
  }

  // 把压缩标记还原为图片 HTML；无法解析时返回空串(调用方回退原文)
  function imageDanmakuHtml(mark) {
    var split = String(mark || '').split('.');
    if (split.length < 2 || !isValidImageExt('.' + split[1])) return '';
    var url = decompressImageUrl(split[0]);
    if (!/^\d+$/.test(url)) return '';
    var thumb = 'https://img.douyucdn.cn/data/yuba/weibo/' +
      url.slice(0, 4) + '/' + url.slice(4, 6) + '/' + url.slice(6, 8) + '/' + url +
      '.200x0.' + split[1];
    var full = thumb.replace('.200x0.', '.');
    return '<a href="' + full + '" target="_blank" rel="noopener"><img class="ex-image-danmaku" src="' + thumb +
      '" alt="图片弹幕" loading="lazy" style="max-height:96px;vertical-align:middle;border-radius:4px;margin:0 2px"></a>';
  }

  // 从图片地址生成压缩标记（DouyuEx 同款格式）
  function imageDanmakuFromImgSrc(src) {
    try {
      var s = String(src || '');
      // 只处理斗鱼图床的图片弹幕；输入框里的表情等其他图片不做转换
      if (s.indexOf('img.douyucdn.cn/data/yuba/weibo') < 0) return '';
      var parts = s.split('/');
      var file = parts[parts.length - 1] || '';
      var seg = file.split('.');
      if (seg.length < 3) return '';
      return '[DouyuEx图片' + compressImageUrl(seg[0]) + '.' + seg[2] + ']';
    } catch (e) { return ''; }
  }

  // 渲染：扫描弹幕列表新增节点中的图片标记，替换为 <img>
  var imageDanmakuObserver = null;
  function renderImageDanmakuIn(root) {
    if (!root || root.nodeType !== 1) return;
    var walker = document.createTreeWalker(root, 4 /* SHOW_TEXT */, null);
    var targets = [];
    while (walker.nextNode()) {
      var t = walker.currentNode;
      if (t.nodeValue && t.nodeValue.indexOf('[DouyuEx图片') >= 0) targets.push(t);
    }
    for (var i = 0; i < targets.length; i++) {
      var textNode = targets[i];
      var html = textNode.nodeValue.replace(/\[DouyuEx图片([^\]]+)\]/g, function (m, s) {
        var imgHtml = imageDanmakuHtml(s);
        return imgHtml || m;
      });
      if (html === textNode.nodeValue) continue;
      var span = document.createElement('span');
      span.innerHTML = html;
      textNode.parentNode.replaceChild(span, textNode);
    }
  }

  var imageRenderRetries = 0;
  function startImageDanmakuRender() {
    if (imageDanmakuObserver) return;
    var list = document.getElementById('js-barrage-list');
    if (!list) {
      if (imageRenderRetries < 30) { imageRenderRetries++; setTimeout(startImageDanmakuRender, 2000); }
      return;
    }
    imageDanmakuObserver = new MutationObserver(function (muts) {
      // 处理期间断开，避免替换自身触发的回调造成循环
      try { imageDanmakuObserver.disconnect(); } catch (e) { /* 忽略 */ }
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          if (added[j] && added[j].nodeType === 1) renderImageDanmakuIn(added[j]);
        }
      }
      try { imageDanmakuObserver.observe(list, { childList: true, subtree: true }); } catch (e) { /* 忽略 */ }
    });
    try { imageDanmakuObserver.observe(list, { childList: true, subtree: true }); } catch (e) { /* 忽略 */ }
    renderImageDanmakuIn(list); // 处理页面已有弹幕
  }

  // 发送侧：输入区出现 <img> 时自动压缩为文本标记，随弹幕发出(双方装脚本互认)
  var imageSendObserver = null;
  var imageSendRetries = 0;
  function startImageDanmakuSend() {
    if (imageSendObserver) return;
    var box = document.querySelector('.ChatSend-box');
    if (!box) {
      // 目标元素长期不存在(特殊模板/改版)：最多重试 30 次，避免永久空转
      if (imageSendRetries < 30) { imageSendRetries++; setTimeout(startImageDanmakuSend, 3000); }
      return;
    }
    imageSendObserver = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (!node || node.nodeType !== 1) continue;
          var imgs = node.querySelectorAll ? node.querySelectorAll('img') : [];
          for (var k = 0; k < imgs.length; k++) {
            var mark = imageDanmakuFromImgSrc(imgs[k].src);
            if (!mark) continue;
            var span = document.createElement('span');
            span.textContent = mark;
            imgs[k].parentNode.replaceChild(span, imgs[k]);
            showToast('图片已转为图片弹幕标记，发送后装脚本的用户可见');
          }
        }
      }
    });
    try { imageSendObserver.observe(box, { childList: true, subtree: true }); } catch (e) { /* 忽略 */ }
  }

  // ========== 融合功能：自动抢礼物红包（默认关闭） ==========
  // 轮询房间礼物红包列表，新红包在开抢前 2 秒连抢 3 次。需登录斗鱼账号。
  // 与 DouyuEx 不同：不设 6 级粉丝牌门槛。
  function isLoggedIn() {
    try { return !!document.cookie.match(/(?:^|; )acf_uid=([^;]+)/); } catch (e) { return false; }
  }

  var redPacketTimer = null;
  var redPacketSeen = null;

  function getCCN() {
    try {
      var m = document.cookie.match(/(?:^|; )acf_ccn=([^;]*)/);
      if (m && m[1]) return m[1];
      document.cookie = 'acf_ccn=1; path=/; domain=.douyu.com';
      return '1';
    } catch (e) { return '1'; }
  }

  function fetchRedPacketList() {
    var rid = getEffectiveRid();
    if (!rid) return;
    // seen 集合上限清理：挂机数天不会无限增长
    try { if (redPacketSeen && Object.keys(redPacketSeen).length > 500) redPacketSeen = {}; } catch (e) { /* 忽略 */ }
    fetch('https://www.douyu.com/japi/interactnc/web/propredpacket/getPrpList?type_id=1&room_id=' + rid, { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (ret) {
        var list = ret && ret.data && ret.data.list;
        if (!list || !list.length) return;
        for (var i = 0; i < list.length; i++) {
          // IIFE 捕获 rpid：多个红包同时入列时不互相覆盖(经典 var 闭包问题)
          (function (rpid, to) {
            if (!rpid || redPacketSeen[rpid]) return;
            redPacketSeen[rpid] = true;
            if (to < 0) to = 0;
            showToast('检测到礼物红包，开抢时自动出手');
            setTimeout(function () {
              grabRedPacket(rpid, 0);
              grabRedPacket(rpid, 0);
              grabRedPacket(rpid, 0);
            }, to);
          })(list[i].activityid, (Number(list[i].startTime) - Math.floor(Date.now() / 1000)) * 1000 - 2000); // 提前 2 秒
        }
      })
      .catch(function () { /* 网络异常静默，下轮重试 */ });
  }

  function grabRedPacket(rpid, attempt) {
    if (attempt >= 5) return; // 单红包最多 5 次(含重试)，未到点时不会无限递归刷请求
    var rid = getEffectiveRid(); // 开抢前记录房间，回调时已切房则放弃
    fetch('https://www.douyu.com/japi/interactnc/web/propredpacket/grab_prp', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'activityid=' + rpid + '&ctn=' + getCCN()
    })
      .then(function (r) { return r.json(); })
      .then(function (ret) {
        if (rid !== getEffectiveRid()) return; // 已切房：放弃该红包
        var d = ret && ret.data;
        if (d && d.isSuc == 2) setTimeout(function () { grabRedPacket(rpid, attempt + 1); }, 800); // 未到点，稍后再试
      })
      .catch(function () { /* 忽略 */ });
  }

  function startRedPacketWatch() {
    if (redPacketTimer) return;
    if (!isLoggedIn()) {
      showToast('自动抢礼物红包需要先登录斗鱼账号', true);
      return false;
    }
    redPacketSeen = {};
    fetchRedPacketList();
    redPacketTimer = setInterval(fetchRedPacketList, 60000); // 每 60 秒轮询一次
    showToast('自动抢礼物红包已开启(需登录斗鱼账号)');
    return true;
  }

  function stopRedPacketWatch() {
    if (redPacketTimer) { clearInterval(redPacketTimer); redPacketTimer = null; }
  }

  // ========== 融合功能：半自动抢宝箱（默认关闭，实验性） ==========
  // 依赖页面 socketProxy 推送宝箱开箱时间(tslist)，到点调官方接口领取；
  // 页面结构变动可能导致监听失效，故标注实验性。触发验证码时给出提示。
  var boxWatchStarted = false;
  var boxRetryTimer = null;
  var boxSeen = null;
  var boxUnsubscribe = null; // tslist 订阅的退订句柄，stopBoxWatch 时真正解除订阅

  function getDyToken() {
    var names = ['acf_uid', 'acf_biz', 'acf_stk', 'acf_ct', 'acf_ltkid'];
    var parts = [];
    for (var i = 0; i < names.length; i++) {
      try {
        var m = document.cookie.match(new RegExp('(?:^|; )' + names[i] + '=([^;]*)'));
        parts.push(m && m[1] ? m[1] : '');
      } catch (e) { parts.push(''); }
    }
    return parts.join('_');
  }

  function grabTreasure(rpid) {
    var rid = getEffectiveRid();
    var hasUid = isLoggedIn();
    if (!rid || !hasUid) {
      showToast('抢宝箱需要先登录斗鱼账号', true);
      return;
    }
    var deviceId = '';
    try {
      var d = document.cookie.match(/(?:^|; )dy_did=([^;]*)/);
      deviceId = d && d[1] ? d[1] : '';
    } catch (e) { /* 忽略 */ }
    GM_xmlhttpRequest({
      method: 'POST',
      url: 'https://pcapi.douyucdn.cn/h5nc/member/getRedPacket?token=' + encodeURIComponent(getDyToken()),
      data: 'room_id=' + rid + '&package_room_id=' + rid + '&device_id=' + deviceId + '&packerid=' + rpid + '&version=1',
      responseType: 'json',
      timeout: 10000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      onload: function (response) {
        try {
          var ret = response.response;
          var d = ret && ret.data;
          if (!d) return;
          if (d.code == -1 && d.validate && d.validate != '0') {
            showToast('宝箱触发验证码，请手动完成验证', true);
            return;
          }
          var msg = '';
          if (d.prop_id === undefined || d.prop_id === '') msg = '鱼丸x' + d.silver;
          else msg = d.prop_name + 'x' + d.prop_count;
          if (msg) showToast('【宝箱】获得' + msg);
        } catch (e) { /* 解析失败忽略 */ }
      },
      onerror: function () { /* 失败静默，等下一个 */ },
      ontimeout: function () { /* 超时静默 */ }
    });
  }

  function registerTsList() {
    var sp = (typeof unsafeWindow !== 'undefined' && unsafeWindow.socketProxy) || window.socketProxy;
    if (!sp || !sp.socketStream || !sp.socketStream.subscribe) return false;
    var cb = function (data) {
      var list = data && data.list;
      if (!list || !list.length) return;
      try { if (boxSeen && Object.keys(boxSeen).length > 500) boxSeen = {}; } catch (e) { /* 忽略 */ }
      for (var i = 0; i < list.length; i++) {
        // IIFE 捕获 item：多个宝箱并行推送时不互相覆盖(经典 var 闭包问题)
        (function (item) {
          var rpid = item && item.rpid;
          if (!rpid || boxSeen[rpid]) return;
          boxSeen[rpid] = true;
          var delay = (Number(item.ot) - Math.floor(Date.now() / 1000)) * 1000;
          if (delay < 0) delay = 0;
          setTimeout(function () { grabTreasure(rpid); }, delay);
        })(list[i]);
      }
    };
    // subscribe 可能返回退订函数或退订对象，保存下来供 stopBoxWatch 解除订阅
    boxUnsubscribe = sp.socketStream.subscribe('tslist', cb) || null;
    return true;
  }

  function startBoxWatch() {
    if (boxWatchStarted) return;
    if (!isLoggedIn()) {
      showToast('半自动抢宝箱需要先登录斗鱼账号', true);
      return false;
    }
    boxWatchStarted = true;
    boxSeen = {};
    if (registerTsList()) {
      showToast('宝箱监听已就绪(实验性)');
      return true;
    }
    // socketProxy 未就绪时每 15 秒重试
    boxRetryTimer = setInterval(function () {
      if (registerTsList()) {
        clearInterval(boxRetryTimer);
        boxRetryTimer = null;
        showToast('宝箱监听已就绪(实验性)');
      }
    }, 15000);
    return true;
  }

  function stopBoxWatch() {
    boxWatchStarted = false;
    if (boxRetryTimer) { clearInterval(boxRetryTimer); boxRetryTimer = null; }
    if (boxUnsubscribe) {
      try {
        if (typeof boxUnsubscribe === 'function') boxUnsubscribe();
        else if (typeof boxUnsubscribe.unsubscribe === 'function') boxUnsubscribe.unsubscribe();
      } catch (e) { /* 忽略 */ }
      boxUnsubscribe = null;
    }
  }

  // ========== 融合功能：检查更新（GreasyFork） ==========
  // 发布到 GreasyFork 后把 UPDATE_META_URL 换成真实地址；
  // 从 GreasyFork 安装的用户会经 @updateURL 自动更新；拖文件安装的用户可点面板按钮手动检查。
  var UPDATE_META_URL = 'https://update.greasyfork.org/scripts/581908/%E6%96%97%E9%B1%BC%E5%8E%BB%E5%B9%BF%E5%91%8A%20%2B%20%E8%87%AA%E5%8A%A8%E7%BD%91%E9%A1%B5%E5%85%A8%E5%B1%8F%20%28%E6%80%A7%E8%83%BD%E4%BC%98%E5%8C%96%E7%89%88%29.meta.js'

  function compareVersion(a, b) {
    var pa = String(a).split('.').map(function (x) { return Number(x) || 0; });
    var pb = String(b).split('.').map(function (x) { return Number(x) || 0; });
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var x = pa[i] || 0, y = pb[i] || 0;
      if (x > y) return 1;
      if (x < y) return -1;
    }
    return 0;
  }

  function checkForUpdate(isManual) {
    if (!UPDATE_META_URL || UPDATE_META_URL.indexOf('/000000/') >= 0) {
      if (isManual) showToast('脚本发布到 GreasyFork 后，把头部 updateURL 换成真实地址即可检查更新', true);
      return;
    }
    if (typeof GM_xmlhttpRequest === 'undefined') {
      if (isManual) showToast('当前环境不支持检查更新', true);
      return;
    }
    // 双通道：主源 meta.js 拿版本号；失败(网络/内容异常)自动切 GreasyFork 脚本页备用源。
    // 注意正则必须用单反斜杠 \s(空白符)，写成 \\s 会匹配字面反斜杠导致永远取不到版本号。
    var pageTried = false;
    var finish = function (msg) { if (isManual) showToast(msg, true); };
    var onVersion = function (latest) {
      if (!latest) return false;
      if (compareVersion(latest, SCRIPT_VERSION) > 0) {
        showToast('发现新版本 v' + latest + '，请到 GreasyFork 更新', true);
      } else if (isManual) {
        showToast('当前已是最新版本 v' + SCRIPT_VERSION);
      }
      return true;
    };
    var fallbackToPage = function () {
      if (pageTried) return;
      pageTried = true;
      // 备用源：GreasyFork 脚本页安装按钮带 data-script-version（greasyfork.org 已授权）
      GM_xmlhttpRequest({
        method: 'GET',
        url: 'https://greasyfork.org/zh-CN/scripts/581908?t=' + Date.now(),
        timeout: 10000,
        onload: function (res) {
          try {
            var m = String(res.responseText || '').match(/data-script-version="([\d.]+)"/);
            if (m && onVersion(m[1])) return;
            finish('检查更新失败：更新地址返回异常，请确认脚本已发布到 GreasyFork');
          } catch (e) { finish('检查更新失败'); }
        },
        onerror: function () { finish('检查更新失败：网络异常'); },
        ontimeout: function () { finish('检查更新失败：超时'); }
      });
    };
    GM_xmlhttpRequest({
      method: 'GET',
      url: UPDATE_META_URL + '?t=' + Date.now(),
      timeout: 10000,
      onload: function (res) {
        try {
          if (res.status && res.status !== 200) { fallbackToPage(); return; }
          var m = String(res.responseText || '').match(/@version\s*([\d.]+)/);
          if (m && onVersion(m[1])) return;
          fallbackToPage(); // 返回 200 但内容异常(如被劫持/错误页)：切备用源
        } catch (e) { fallbackToPage(); }
      },
      onerror: fallbackToPage,
      ontimeout: fallbackToPage
    });
  }

  // ========== 更新说明（⚙ 面板「更新说明」按钮展示） ==========
  // 与 GreasyFork 发布说明保持同步，只保留近期主要版本
  var CHANGELOG = [
    { version: '13.25', text: '进房卡顿优化：空容器回收延迟 6 秒启动并把观察回调节流合并(不再逐节点子树查询)；收藏搜索观察器 500ms 防抖(不再每次 DOM 变化都全文档查询)；布局兜底首扫延迟 10 秒且页面加载中不扫描——三处同步主线程阻塞点全部让出首屏渲染窗口，打开直播间不再卡一下。' },
    { version: '13.24', text: '修复部分直播间数据全为 --：斗鱼标题第一段是直播间标题而非主播名，主播改标题后真实房号解析失效；昵称改从标题尾段/第二段提取，suggest 结果按精确/包含匹配；数据接口 200 但内容异常也快速重试；贵宾通道改用 TextDecoder 并防新旧连接竞态；面板窄窗不溢出；弹幕/礼物缺失即触发房号解析；多项性能与健壮性优化。' },
    { version: '13.23', text: '新增「拾取元素」：自定义规则区点「🎯 拾取元素」后，直接点漏掉的广告即可自动生成选择器并立即隐藏(左键=加入规则，Shift+左键=选父级，Esc/右键=结束)，不会写 CSS 也能自定义去广告。' },
    { version: '13.22', text: '抗改版双保险：①布局级自动兜底(默认开)：不再依赖类名，自动回收把画面顶出视口的大块广告容器，斗鱼以后出新广告也能自动处理；②视口锁定(实验性，开关控制)：播放器+弹幕栏钉死视口、页面不可滚动，从布局上彻底免疫新增广告；两者均可随时在 ⚙ 面板开关。' },
    { version: '13.21', text: '修复活动直播间(如 51111)画面被顶出视口：补回白名单重构时遗漏的 wm-general 大横幅容器规则，活动页大横幅+主播推荐不再把播放器推到一屏以下。' },
    { version: '13.20', text: '信息条改版(学 DouyuEx)：6 项数据图标+数字显示，鼠标悬浮才显示完整说明(含当前值)；自定义隐藏规则新增小白教程。' },
    { version: '13.19', text: '新增「更新说明」版块：⚙ 面板一键查看最近版本更新内容。' },
    { version: '13.18', text: '修复「检查更新失败：未获取到版本信息」：版本号正则写错已改正；补上 update.greasyfork.org 跨域授权；检查更新升级双通道(meta.js 失败自动改用脚本页 data-script-version 兜底)，错误提示区分地址异常/网络异常/超时。' },
    { version: '13.17', text: '稳定性版：统一 SPA 切房生命周期，切房销毁全部定时器/WebSocket/订阅并清空旧房状态，不再串房显示旧数据；修复红包/宝箱 var 闭包(多红包互相覆盖)；红包最多重试 5 次+切房放弃；宝箱关闭真正解除订阅；贵宾通道支持主动停止；空容器回收 60 秒后降频持续去广告。' },
    { version: '13.16', text: '健壮性大修：抢红包/抢宝箱未登录直接提示并回弹开关；贵宾通道后台暂停重连、切回前台恢复；自动全屏加语义兜底(类名失效也能找到全屏按钮)；房号解析加 8 秒超时；收藏搜索改 MutationObserver；图片弹幕懒加载。' },
    { version: '13.15', text: '接入 GreasyFork 真实更新地址，老用户可直接检查更新。' },
    { version: '13.13', text: '融合 DouyuEx 功能：弹幕无限收藏+搜索、图片弹幕、自动抢红包、半自动抢宝箱、已播时长、检查更新；新增 ⚙ 面板开关。' }
  ];

  // 更新说明浮层：居中弹窗展示版本日志，点击任意处或 12 秒后自动关闭
  function showChangelog() {
    var old = document.getElementById('douyu-clean-changelog');
    if (old) { try { old.remove(); } catch (e) { /* 忽略 */ } }
    var overlay = document.createElement('div');
    overlay.id = 'douyu-clean-changelog';
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
  var PANEL_ID = 'douyu-clean-panel';
  var FAB_POS_KEY = 'douyu-clean-fab-pos';
  var PANEL_AUTO_CLOSE_MS = 5000; // 面板打开后 5 秒不操作自动关闭
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
  var SWITCHES = [
    { key: 'removeAd', label: '去广告(白名单清理)' },
    { key: 'darkBg', label: '深色背景' },
    { key: 'autoFull', label: '自动网页全屏' },
    { key: 'autoRedPacket', label: '自动抢礼物红包' },
    { key: 'autoBox', label: '半自动抢宝箱(实验性)' },
    { key: 'autoReclaim', label: '布局兜底(自动回收遮挡画面的大块广告)' },
    { key: 'viewportLock', label: '视口锁定(播放器+弹幕栏钉死视口，实验性)' }
  ];

  function buildPanel() {
    if (document.getElementById(PANEL_ID)) return; // 幂等：已存在则不重复创建
    var box = document.createElement('div');
    box.id = PANEL_ID;
    box.style.cssText = [
      'position:fixed;z-index:2147483647;',
      'font:12px/1.8 "Microsoft YaHei",sans-serif;color:#eee;',
      'background:rgba(20,20,22,.95);border:1px solid #333;border-radius:8px;',
      'padding:6px 10px;box-shadow:0 4px 16px rgba(0,0,0,.5);display:none;'
    ].join('');
    box.innerHTML =
      '<div style="cursor:default;font-weight:700;margin-bottom:4px;user-select:none">斗鱼助手</div>' +
      SWITCHES.map(function (s) {
        return '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap">' +
          '<input type="checkbox" data-key="' + s.key + '"' + (currentSettings[s.key] ? ' checked' : '') + '>' +
          s.label + '</label>';
      }).join('') +
      '<div id="douyu-clean-sign-btn" title="斗鱼官方已下线直播间签到功能" style="margin-top:4px;padding:3px 8px;text-align:center;cursor:not-allowed;' +
      'background:#555;color:#bbb;border-radius:6px;user-select:none">签到(官方已下线)</div>' +
      '<div id="douyu-clean-update-btn" title="检查 GreasyFork 上是否有新版本" style="margin-top:4px;padding:3px 8px;text-align:center;cursor:pointer;' +
      'background:#1a4d8f;color:#fff;border-radius:6px;user-select:none">检查更新</div>' +
      '<div id="douyu-clean-changelog-btn" title="查看最近版本更新说明" style="margin-top:4px;padding:3px 8px;text-align:center;cursor:pointer;' +
      'background:#5a4a1a;color:#ffd;border-radius:6px;user-select:none">更新说明</div>' +
      '<div style="margin-top:6px;border-top:1px solid #333;padding-top:5px">' +
      '<div id="douyu-clean-rules-help" style="font-size:11px;color:#aaa;line-height:1.7;margin-bottom:4px;max-width:270px;user-select:none">' +
      '自定义隐藏规则(小白教程)：<br>' +
      '· 不会写选择器？点「🎯 拾取元素」→ 直接点漏掉的广告 → 自动生成规则并立即隐藏；Shift+点击选整个广告块。<br>' +
      '· 怎么找广告代码：在广告上点右键 →「检查」，看它 class / id 是什么。<br>' +
      '· 按类名写：<span style="color:#58a6ff">.ad-banner</span>　按ID写：<span style="color:#58a6ff">#js-ad-xxx</span><br>' +
      '· 模糊匹配(推荐，斗鱼改版也不怕)：<span style="color:#58a6ff">[class*="advert"]</span><br>' +
      '· 每行写一条，点「应用」立即生效；清空再点「应用」恢复默认。<br>' +
      '· 误伤了正常功能？删掉对应行再点「应用」即可。<br>' +
      '</div>' +
      '<textarea id="douyu-clean-custom-rules" placeholder="每行一条CSS选择器&#10;如：.abc123 / #xyz / [class*=advert]" style="width:100%;height:52px;resize:none;box-sizing:border-box;background:#222;color:#eee;border:1px solid #444;border-radius:4px;font:11px/1.5 sans-serif;padding:3px 5px;outline:none"></textarea>' +
      '<div style="display:flex;gap:4px;margin-top:3px">' +
      '<button id="douyu-clean-pick-btn" title="点选漏掉的广告，自动生成隐藏规则(左键=加入，Shift+左键=选父级，Esc=结束)" style="flex:1;background:#1d5c33;color:#c6ffd9;border:1px solid #2e8b4f;border-radius:4px;cursor:pointer;font:11px/1.6 sans-serif;padding:2px 0">🎯 拾取元素</button>' +
      '<button id="douyu-clean-custom-apply" title="把下面的选择器全部应用并立即生效" style="flex:1;background:#333;color:#eee;border:1px solid #555;border-radius:4px;cursor:pointer;font:11px/1.6 sans-serif;padding:2px 0">应用规则</button>' +
      '</div>' +
      '</div>';

    box.addEventListener('change', function (e) {
      var input = e.target;
      if (!input.dataset || !input.dataset.key) return;
      currentSettings[input.dataset.key] = input.checked;
      saveSettings(currentSettings);
      applyStyles();
      if (input.dataset.key === 'autoFull') {
        if (input.checked) startAutoFullscreen();
        else stopAutoFullscreen();
      } else if (input.dataset.key === 'autoRedPacket') {
        if (input.checked && !startRedPacketWatch()) {
          // 未登录：回弹开关并撤销已保存设置，避免下次进房静默空转
          input.checked = false;
          currentSettings.autoRedPacket = false;
          saveSettings(currentSettings);
        } else if (!input.checked) {
          stopRedPacketWatch();
        }
      } else if (input.dataset.key === 'autoBox') {
        if (input.checked && !startBoxWatch()) {
          input.checked = false;
          currentSettings.autoBox = false;
          saveSettings(currentSettings);
        } else if (!input.checked) {
          stopBoxWatch();
        }
      }
      armPanelAutoClose(box); // 操作后重新计时
    });

    box.querySelector('#douyu-clean-sign-btn').addEventListener('click', function () {
      showToast('斗鱼官方已下线直播间签到功能(接口返回：功能已下线)', true);
    });

    box.querySelector('#douyu-clean-update-btn').addEventListener('click', function () {
      checkForUpdate(true);
    });

    box.querySelector('#douyu-clean-changelog-btn').addEventListener('click', function () {
      showChangelog();
      armPanelAutoClose(box); // 弹层期间重新计时，面板不抢先收起
    });

    // 自定义隐藏规则：打开面板时回填已保存内容，应用后立即注入样式
    var customTextarea = box.querySelector('#douyu-clean-custom-rules');
    if (customTextarea) customTextarea.value = loadCustomRules();
    var customApply = box.querySelector('#douyu-clean-custom-apply');
    if (customApply) {
      customApply.addEventListener('click', function () {
        saveCustomRules(customTextarea ? customTextarea.value : '');
        applyStyles();
        showToast('自定义规则已应用');
      });
    }
    // 拾取元素：点选漏掉的广告自动生成规则
    var pickBtn = box.querySelector('#douyu-clean-pick-btn');
    var picker = createElementPicker(box, customTextarea, pickBtn);
    if (pickBtn) {
      pickBtn.addEventListener('click', function () {
        picker.start();
        armPanelAutoClose(box); // 面板可能恢复显示，重新计时
      });
    }


    box.addEventListener('mouseenter', disarmPanelAutoClose);
    box.addEventListener('mouseleave', function () {
      // 鼠标移开面板立即关闭（不再等 5 秒）
      disarmPanelAutoClose();
      box.style.display = 'none';
    });

    // 齿轮动画：旋转 12s/圈 + 橙色呼吸光晕；悬停加速；拖动时暂停(见 onDragMove/onDragEnd)
    setStyle('fab-anim', [
      '@keyframes douyu-clean-fab-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
      '@keyframes douyu-clean-fab-pulse{0%,100%{box-shadow:0 0 4px rgba(255,140,0,.35)}50%{box-shadow:0 0 14px rgba(255,140,0,.9)}}',
      '#douyu-clean-fab:hover{animation-duration:2s,1s !important;}'
    ].join(''));
    var toggle = document.createElement('div');
    toggle.id = 'douyu-clean-fab';
    toggle.innerHTML = '<svg viewBox="0 0 24 24" style="width:16px;height:16px;display:block;margin:5px auto"><path fill="#ff8c00" d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94zM12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>';
    toggle.style.cssText = [
      'position:fixed;top:60px;right:10px;z-index:2147483647;',
      'width:28px;height:28px;border-radius:50%;text-align:center;',
      'background:rgba(20,20,22,.85);cursor:grab;',
      'user-select:none;border:1px solid #ff8c00;',
      'animation:douyu-clean-fab-spin 12s linear infinite,douyu-clean-fab-pulse 3s ease-in-out infinite;'
    ].join('');
    toggle.title = '斗鱼助手设置（可拖动）';

    // 恢复上次保存的按钮位置
    function loadFabPos() {
      try {
        var raw = localStorage.getItem(FAB_POS_KEY);
        if (!raw) return null;
        var pos = JSON.parse(raw);
        if (typeof pos.left === 'number' && typeof pos.top === 'number') return pos;
      } catch (e) { /* 忽略损坏数据 */ }
      return null;
    }
    var savedPos = loadFabPos();
    if (savedPos) {
      toggle.style.right = 'auto';
      toggle.style.left = savedPos.left + 'px';
      toggle.style.top = savedPos.top + 'px';
    }

    // 面板跟随按钮定位（按钮下方）
    function updatePanelPos() {
      var r = toggle.getBoundingClientRect();
      box.style.right = 'auto';
      // 用面板实测宽度 clamp，窄窗口下面板也不会伸出视口右缘
      var bw = box.offsetWidth || 220;
      box.style.left = Math.max(4, Math.min(r.left, window.innerWidth - bw - 8)) + 'px';
      box.style.top = (r.bottom + 8) + 'px';
    }

    // 拖拽移动（超过 5px 视为拖动，否则仍是点击）
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
          } catch (e) { /* 隐私模式忽略 */ }
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
      box.style.display = willOpen ? 'block' : 'none'; // 先显示再定位：offsetWidth 才能取到面板真实宽度
      if (willOpen) armPanelAutoClose(box);
      updatePanelPos();
    });

    document.body.appendChild(toggle);
    document.body.appendChild(box);
  }

  // ========== 启动 ==========
  // 调试接口：页面控制台执行 JSON.stringify(unsafeWindow.__douyuClean) 可查看运行状态与错误
  var SCRIPT_VERSION = '13.25';
  var debugState = { version: SCRIPT_VERSION, settings: currentSettings, errors: [], heartbeat: 0 };
  try { unsafeWindow.__douyuClean = debugState; } catch (e) { /* 无 unsafeWindow 时忽略 */ }
  try { console.log('[斗鱼纯净助手] v' + SCRIPT_VERSION + ' 启动', location.href); } catch (e) { /* 忽略 */ }

  // 错误提示：右下角红条 + 控制台分组输出；点「忽略」后本次会话不再提示同模块错误
  var ignoredErrorSteps = {};
  function reportError(step, e) {
    if (ignoredErrorSteps[step]) return;
    var msg = step + ': ' + (e && e.message ? e.message : String(e));
    try {
      debugState.errors.push(msg);
      if (debugState.errors.length > 50) debugState.errors.shift(); // 调试列表上限，防长期运行无限增长
    } catch (err) { /* 忽略 */ }
    try {
      console.groupCollapsed('[斗鱼纯净助手] ' + step);
      console.error(msg, e);
      console.groupEnd();
    } catch (err) { /* 忽略 */ }
    try {
      var box = document.getElementById('douyu-clean-error');
      if (!box) {
        box = document.createElement('div');
        box.id = 'douyu-clean-error';
        box.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:2147483647;max-width:60vw;background:rgba(180,30,30,.92);color:#fff;padding:8px 12px;border-radius:8px;font:12px/1.6 sans-serif;';
        document.body.appendChild(box);
      }
      box.innerHTML = '斗鱼助手错误: ' + msg.replace(/</g, '&lt;') +
        ' <a id="dc-err-ignore" style="margin-left:6px;color:#ffd;cursor:pointer;text-decoration:underline">忽略</a>';
      var ignoreBtn = box.querySelector('#dc-err-ignore');
      if (ignoreBtn) {
        ignoreBtn.addEventListener('click', function () {
          ignoredErrorSteps[step] = true;
          try { box.remove(); } catch (e2) { /* 忽略 */ }
        });
      }
    } catch (err) { /* 页面未就绪时忽略 */ }
  }

  try { hookDanmakuCollect(); } catch (e) { /* 收藏钩子失败不影响其他功能 */ }
  applyStyles(); // document-start 阶段立即注入基础样式

  // ========== 房间生命周期（SPA 切房统一清理） ==========
  // 切房时旧房间的定时器/WebSocket/订阅/XHR 必须全部销毁并清空状态，
  // 否则新房间会继续显示旧房数据、旧房号、旧贵宾数(GPT 审查 P0 项)。
  function disposeRoomState() {
    // 数据请求与定时器
    if (roomDataXhr) { try { roomDataXhr.abort(); } catch (e) { /* 忽略 */ } roomDataXhr = null; }
    if (h5roomAbort) { try { h5roomAbort.abort(); } catch (e) { /* 忽略 */ } h5roomAbort = null; }
    if (roomDataTimer) { clearInterval(roomDataTimer); roomDataTimer = null; }
    if (roomDataSoonTimer) { clearTimeout(roomDataSoonTimer); roomDataSoonTimer = null; }
    if (roomDataRetryTimer) { clearTimeout(roomDataRetryTimer); roomDataRetryTimer = null; }
    roomDataRetries = 0;
    lastRoomDataFetch = 0;
    // 房间状态(数据/真实房号/已播时长)全部清空，绝不带到新房间
    lastRoomData = null;
    lastFanOfficial = null;
    lastShowTime = null;
    lastShowStatus = null;
    realRid = null;
    resolvingRid = false;
    // 房间级功能：贵宾通道、红包、宝箱、全屏、图片弹幕渲染、空容器回收
    stopNobleWatch();
    stopRedPacketWatch();
    redPacketSeen = null;
    stopBoxWatch();
    boxSeen = null;
    stopAutoFullscreen();
    if (imageDanmakuObserver) {
      try { imageDanmakuObserver.disconnect(); } catch (e) { /* 忽略 */ }
      imageDanmakuObserver = null;
    }
    stopEmptyContainerKiller();
    stopLayoutReclaimer();
    if (asideObserver) {
      try { asideObserver.disconnect(); } catch (e) { /* 忽略 */ }
      asideObserver = null;
      asideObserverTarget = null;
    }
    // 信息条数据复位为 --，新房间数据到达前不显示旧值
    ['dci-view', 'dci-live', 'dci-danmu', 'dci-gift', 'dci-noble', 'dci-fan'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = '--';
    });
    refreshInfoTitles();
  }

  // 进入新房间：按当前设置重建房间级功能(disposeRoomState 之后调用)
  function bootRoomFeatures() {
    try { startEmptyContainerKiller(); } catch (e) { reportError('空容器回收', e); }
    try { if (currentSettings.autoFull) startAutoFullscreen(); } catch (e) { reportError('自动全屏', e); }
    try { startRoomData(); } catch (e) { reportError('直播数据', e); }
    try { startNobleWatch(); } catch (e) { reportError('贵宾数', e); }
    try { startImageDanmakuRender(); } catch (e) { reportError('图片弹幕', e); }
    try { if (currentSettings.autoRedPacket) startRedPacketWatch(); } catch (e) { reportError('自动红包', e); }
    try { if (currentSettings.autoBox) startBoxWatch(); } catch (e) { reportError('自动宝箱', e); }
    try { startAsideObserver(); } catch (e) { reportError('信息条观察', e); }
  }

  function initRoom() {
    try { if (!isRoomPage()) return; } catch (e) { return; } // 非直播间仅保留轻量去广告样式
    try { buildPanel(); } catch (e) { reportError('设置面板', e); }
    try { bootRoomFeatures(); } catch (e) { reportError('房间功能', e); }
    try { startCollectSearch(); } catch (e) { reportError('收藏搜索', e); }
    try { startImageDanmakuSend(); } catch (e) { reportError('图片弹幕发送', e); }
    try { detectConflictScripts(); } catch (e) { /* 检测失败不影响使用 */ }
    try { setTimeout(function () { checkForUpdate(false); }, 8000); } catch (e) { reportError('检查更新', e); }
  }

  // 检测同类脚本：同时运行时可能样式冲突，给出共存提示
  function detectConflictScripts() {
    var found = [];
    try {
      if (localStorage.getItem('ExSave_DanmakuCollect') !== null ||
          document.querySelector('.ex-panel, #ex-panel, #extool_panel')) found.push('DouyuEx');
    } catch (e) { /* 忽略 */ }
    if (found.length) {
      setTimeout(function () {
        showToast('检测到 ' + found.join('、') + ' 与本脚本同时运行：去广告可共存，若样式异常可在 ⚙ 面板关闭本脚本的去广告/深色背景');
      }, 6000);
    }
  }

  // 心跳自愈：每 5 秒低频兜底(面板/信息条缺失重建、位置同步)；
  // 即时性工作由 MutationObserver/IntersectionObserver 负责，避免高频全量检查
  var lastHref = location.href;
  setInterval(function () {
    try {
      if (!isRoomPage()) return;
      debugState.heartbeat++;
      // SPA 切房：统一销毁旧房资源并重建，避免旧房数据/房号/贵宾数污染新房
      if (location.href !== lastHref) {
        lastHref = location.href;
        disposeRoomState();
        bootRoomFeatures();
        if (!document.getElementById(PANEL_ID)) buildPanel();
        var b2 = document.getElementById('douyu-clean-info');
        if (b2) {
          var a2 = document.getElementById('js-player-asideMain');
          if (a2 && b2.parentNode !== a2) a2.insertBefore(b2, a2.firstChild);
        }
      }
      if (!document.getElementById(PANEL_ID)) buildPanel();
      var bar = document.getElementById('douyu-clean-info');
      if (!bar) {
        buildRoomInfoBar();
        if (!roomDataTimer) startRoomData();
        return;
      }
      // 归位：信息条必须贴住弹幕栏(SPA 切换/模板重建后自动贴回聊天栏顶部)
      var aside = document.getElementById('js-player-asideMain');
      if (aside && bar.parentNode !== aside) aside.insertBefore(bar, aside.firstChild);
      // 位置同步：以弹幕栏可见性为准；全屏覆盖时隐藏(心跳兜底，IO 负责即时响应)
      var ar = aside ? aside.getBoundingClientRect() : null;
      syncInfoBarPos(!!ar && ar.bottom > 0 && ar.top < window.innerHeight);
      // 已播时长跟随心跳实时刷新(基于官方开播时间戳推算，不额外发请求)
      try { updateLiveDuration(); } catch (e) { /* 忽略 */ }
      // IO 观察目标被 SPA 重建后重新观察
      if (asideObserverTarget !== document.getElementById('js-player-asideMain')) startAsideObserver();
      // 弹幕栏宽度可能随直播间变化，视口锁定按实时宽度排布
      syncAsideWidthVar();
    } catch (e) { reportError('心跳', e); }
  }, 5000);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRoom);
  } else {
    initRoom();
  }
})();
