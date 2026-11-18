/*
 * Mobile menu for the nav's mode buttons. On narrow screens the buttons
 * collapse into a Menu dropdown; a tap outside, Escape, or choosing a
 * mode closes it. A dot on the Menu button shows when any mode is on.
 */
(function () {
  'use strict';

  var menu = document.querySelector('.site-nav__menu');
  var modes = document.querySelector('.site-nav__modes');
  if (!menu || !modes) return;

  function setOpen(open) {
    modes.classList.toggle('is-open', open);
    menu.setAttribute('aria-expanded', String(open));
  }

  menu.addEventListener('click', function (e) {
    e.stopPropagation();
    setOpen(!modes.classList.contains('is-open'));
  });

  // choosing a mode closes the menu, except the Alarm button, whose panel
  // opens beside it and reads better with the menu gone too
  modes.addEventListener('click', function (e) {
    if (e.target.closest('button')) setTimeout(function () { setOpen(false); }, 0);
  });

  window.addEventListener('pointerdown', function (e) {
    if (!modes.classList.contains('is-open')) return;
    if (modes.contains(e.target) || e.target === menu) return;
    setOpen(false);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setOpen(false);
  });

  // reflect active modes on the collapsed button
  function reflect() {
    var active = modes.querySelector('.site-nav__mode[aria-pressed="true"], .site-nav__mode.is-armed');
    menu.classList.toggle('has-active', !!active);
  }
  new MutationObserver(reflect).observe(modes, { subtree: true, attributes: true, attributeFilter: ['aria-pressed', 'class'] });
  reflect();
})();
