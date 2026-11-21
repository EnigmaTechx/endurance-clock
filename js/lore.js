/*
 * Module lore on tap.
 *
 * Tap or click a module and a card appears beside it with its name, the
 * hour it marks and a line or two about its role on the ship. The hub
 * and the Ranger have cards too. Hovering a module on desktop lifts it a
 * little. Escape or a tap elsewhere closes the card; with a card open the
 * arrow keys step round the ring.
 *
 * The module roles follow the ship's production design in broad strokes:
 * four permanent modules at the spokes, four engine modules, four landing
 * modules for the Rangers and Landers. The names given to the four
 * permanent modules are this clock's reading of that layout, not canon.
 */
import * as THREE from 'three';

const ROLE_OF = (i) => (i % 3 === 0 ? 'command' : i % 2 === 0 ? 'engine' : 'landing');

const COMMAND = {
  0: { name: 'Bridge', text: 'Flight deck and control. The ring spins at 5.6 rpm to give the crew gravity; from here the Endurance is flown, docked and, after Mann, saved.' },
  3: { name: 'Medical & labs', text: 'Medical bay and the science modules. Romilly spent his twenty-three years here, waiting, while the others were down on Miller’s planet.' },
  6: { name: 'Habitation & cryo', text: 'Living quarters and the cryo beds the crew slept in for the two-year coast out to Saturn and the wormhole.' },
  9: { name: 'Stores & systems', text: 'Supplies, life support and the population bomb: the frozen embryos of Plan B, riding along in case Plan A failed.' }
};

export const LORE = {
  modules: Array.from({ length: 12 }, (_, i) => {
    const hour = i === 0 ? 12 : i;
    const role = ROLE_OF(i);
    if (role === 'command') {
      return { hour, role, name: COMMAND[i].name, kind: 'Permanent module', text: COMMAND[i].text + ' One of four permanent modules, where a spoke meets the ring.' };
    }
    if (role === 'engine') {
      return { hour, role, name: 'Engine module', kind: 'Propulsion', text: 'One of four modules carrying the main engines on the ring’s far side. They fire together along the spin axis for the big burns, like the slingshot round Gargantua that cost the crew fifty-one years on Earth.' };
    }
    const lander = i === 5 || i === 11;
    return {
      hour, role, name: 'Landing module', kind: 'Hangar & fuel',
      text: (lander ? 'A Lander is berthed on this one. ' : '') + 'Berth and fuel for the Rangers and Landers. The craft dock on the inner end, facing the hub, which is where the hour’s Ranger ties up.'
    };
  }),
  hub: { name: 'Central hub', kind: 'Docking port', text: 'The axial docking port. After Mann’s airlock blew the ring into a spin, Cooper matched its rotation with the Ranger and docked here. The four spokes carry crew between the hub and the permanent modules.' },
  ranger: { name: 'Ranger', kind: 'Single-stage ship', text: 'The sleek lander that can reach orbit on its own. Here it rides on the hour: it undocks twenty-four seconds early, crosses above the ring and berths on the next module as the hour turns.' }
};

export function createLore(ctx) {
  const { container, canvas, camera, ship, ranger, overlay } = ctx;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const anchor = new THREE.Vector3();

  // ---- card ----
  const card = document.createElement('div');
  card.className = 'ec3d__lore';
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-live', 'polite');
  card.innerHTML = '<div class="ec3d__lore-kind"></div><div class="ec3d__lore-name"></div><div class="ec3d__lore-hour"></div><p class="ec3d__lore-text"></p>';
  (overlay || container).appendChild(card);
  const el = {
    kind: card.querySelector('.ec3d__lore-kind'),
    name: card.querySelector('.ec3d__lore-name'),
    hour: card.querySelector('.ec3d__lore-hour'),
    text: card.querySelector('.ec3d__lore-text')
  };

  const state = { open: null, hover: -1 };   // open: { type: 'module'|'hub'|'ranger', index }

  function pickables() {
    const list = [];
    ship.modules.forEach((m, i) => m.holder.traverse((o) => { if (o.isMesh) { o.userData.lore = { type: 'module', index: i }; list.push(o); } }));
    const hub = ship.getHub && ship.getHub();
    if (hub) hub.traverse((o) => { if (o.isMesh) { o.userData.lore = { type: 'hub', index: -1 }; list.push(o); } });
    if (ranger && ranger.group.visible) ranger.group.traverse((o) => { if (o.isMesh) { o.userData.lore = { type: 'ranger', index: -1 }; list.push(o); } });
    return list;
  }

  function hitAt(clientX, clientY) {
    const box = container.getBoundingClientRect();
    ndc.set(((clientX - box.left) / box.width) * 2 - 1, -((clientY - box.top) / box.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickables(), false);
    return hits.length ? hits[0].object.userData.lore : null;
  }

  function entryFor(target) {
    if (!target) return null;
    if (target.type === 'module') return LORE.modules[target.index];
    if (target.type === 'hub') return LORE.hub;
    return LORE.ranger;
  }

  function open(target) {
    const entry = entryFor(target);
    if (!entry) return close();
    state.open = target;
    el.kind.textContent = entry.kind;
    el.name.textContent = entry.name;
    el.hour.textContent = target.type === 'module'
      ? 'Marks ' + entry.hour + ' o’clock' + (isActive(target.index) ? ' · the current hour' : '')
      : '';
    el.hour.hidden = !el.hour.textContent;
    el.text.textContent = entry.text;
    card.hidden = false;
    container.classList.add('ec3d--lore-open');
    if (ctx.onOpen) ctx.onOpen(target, entry);
  }

  function close() {
    if (!state.open) return;
    state.open = null;
    card.hidden = true;
    container.classList.remove('ec3d--lore-open');
    if (ctx.onClose) ctx.onClose();
  }

  function isActive(i) {
    return ship.activeIndex ? ship.activeIndex() === i : false;
  }

  function step(delta) {
    if (!state.open) return;
    const i = state.open.type === 'module' ? state.open.index : 0;
    open({ type: 'module', index: ((i + delta) % 12 + 12) % 12 });
  }

  // ---- anchors: where the card points at ----
  function anchorFor(target, out) {
    if (target.type === 'module') {
      const m = ship.modules[target.index];
      m.glow.getWorldPosition(out);
    } else if (target.type === 'hub') {
      out.set(0, 0, ship.dims.topZ);
      ship.group.localToWorld(out);
    } else {
      ranger.group.getWorldPosition(out);
    }
    return out;
  }

  /** Per frame: keep the card beside its subject and keep the hover lift. */
  function update() {
    if (!state.open) return;
    anchorFor(state.open, anchor).project(camera);
    const w = container.clientWidth, h = container.clientHeight;
    const px = (anchor.x + 1) / 2 * w;
    const py = (1 - anchor.y) / 2 * h;
    const cw = card.offsetWidth || 260, ch = card.offsetHeight || 120;
    const margin = 12, gap = 18;
    let left = px + gap;
    if (left + cw > w - margin) left = px - gap - cw;
    left = Math.max(margin, Math.min(w - margin - cw, left));
    let top = py - ch / 2;
    top = Math.max(margin, Math.min(h - margin - ch, top));
    card.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
    const onRight = left > px;
    card.classList.toggle('is-left', !onRight);
    // behind the camera or off-screen: hide rather than pin to an edge
    card.style.opacity = anchor.z < 1 && anchor.z > -1 ? '' : '0';
  }

  // ---- input ----
  const press = { x: 0, y: 0, id: -1, moved: false };
  const onDown = (e) => { press.x = e.clientX; press.y = e.clientY; press.id = e.pointerId; press.moved = false; };
  const onMove = (e) => {
    if (press.id === e.pointerId && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) press.moved = true;
    if (e.pointerType === 'mouse' && !press.moved) {
      const hit = hitAt(e.clientX, e.clientY);
      state.hover = hit && hit.type === 'module' ? hit.index : -1;
      canvas.classList.toggle('ec3d__canvas--hover', !!hit);
    }
  };
  const onUp = (e) => {
    if (press.id !== e.pointerId) return;
    press.id = -1;
    if (press.moved) return;
    const hit = hitAt(e.clientX, e.clientY);
    if (hit) open(hit); else close();
  };
  const onKey = (e) => {
    if (!state.open) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', () => { state.hover = -1; canvas.classList.remove('ec3d__canvas--hover'); });
  document.addEventListener('keydown', onKey);

  return {
    update,
    open, close, step,
    hoverIndex: () => state.hover,
    isOpen: () => !!state.open,
    current: () => state.open,
    destroy() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      document.removeEventListener('keydown', onKey);
      card.remove();
    }
  };
}
