/*
 * Keyboard shortcuts and the help overlay.
 *
 * Single letters, no modifiers. Shortcuts are ignored while typing in a
 * field (the alarm panel's inputs) or when a modifier key is held. Mode
 * toggles go through their nav buttons so the state lives in one place;
 * camera and lore actions go through the clock instance.
 *
 * Classic script: expects the page's clock on window.__endurance.
 */
(function () {
  'use strict';

  var help = document.getElementById('help');
  var helpButton = document.getElementById('help-toggle');
  var helpClose = help && help.querySelector('[data-close]');

  function clock() { return window.__endurance; }
  function click(id) { var el = document.getElementById(id); if (el && !el.hidden && !el.disabled) el.click(); }

  function setHelp(open) {
    if (!help) return;
    help.hidden = !open;
    if (helpButton) helpButton.setAttribute('aria-expanded', String(open));
    if (open) {
      var first = help.querySelector('[data-close]');
      if (first) first.focus({ preventScroll: true });
    }
  }
  function helpOpen() { return help && !help.hidden; }

  function toggleFullscreen() {
    var doc = document;
    if (doc.fullscreenElement) { if (doc.exitFullscreen) doc.exitFullscreen().catch(function () {}); return; }
    var el = doc.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(function () {});
  }

  function resetView() {
    var c = clock();
    if (!c) return;
    if (c.isTouring && c.isTouring()) c.stopTour();
    else if (c.frameCamera) c.frameCamera();
    if (c.lore && c.lore.isOpen()) c.lore.close();
  }

  var actions = {
    m: function () { click('miller-toggle'); },
    w: function () { click('murph-toggle'); },
    a: function () { click('alarm-toggle'); },
    t: function () { click('tick-toggle'); },
    c: function () { var c = clock(); if (!c) return; if (c.isTouring()) c.stopTour(); else c.startTour(); },
    l: function () {
      var c = clock(); if (!c || !c.lore) return;
      if (c.lore.isOpen()) c.lore.close();
      else c.lore.open({ type: 'module', index: c.ship.activeIndex() });
    },
    r: resetView,
    f: toggleFullscreen,
    h: function () { setHelp(!helpOpen()); },
    '?': function () { setHelp(!helpOpen()); }
  };

  function typing(target) {
    if (!target) return false;
    var tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (helpOpen()) { setHelp(false); e.preventDefault(); }
      return;   // other overlays handle Escape themselves
    }
    if (typing(e.target)) return;
    var key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    var action = actions[key];
    if (!action) return;
    e.preventDefault();
    action();
  });

  if (helpButton) helpButton.addEventListener('click', function () { setHelp(!helpOpen()); });
  if (helpClose) helpClose.addEventListener('click', function () { setHelp(false); });
  if (help) help.addEventListener('pointerdown', function (e) { if (e.target === help) setHelp(false); });

  window.Shortcuts = { setHelp: setHelp, isHelpOpen: helpOpen, actions: actions };
})();
