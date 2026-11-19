/*
 * Digital readout and accessible label. Locale-aware hours and minutes,
 * seconds and AM/PM set apart, date and timezone on a second line.
 */
export function createReadout(root, options) {
  options = options || {};
  const locale = options.locale || undefined;
  const hour12 = typeof options.hour12 === 'boolean' ? options.hour12 : undefined;

  const meta = root.querySelector('.clock3d__meta');
  let hm, sec, period;
  function bind() {
    hm = root.querySelector('.ec-hm');
    sec = root.querySelector('.ec-seconds');
    period = root.querySelector('.ec-period');
  }
  bind();

  const timeFmt = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12 });
  const dateFmt = new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const zoneFmt = new Intl.DateTimeFormat(locale, { timeZoneName: 'short' });
  const ariaFmt = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', weekday: 'long', day: 'numeric', month: 'long' });

  let lastSecond = -1;
  let lastMinute = -1;

  function zoneName(d) {
    const parts = zoneFmt.formatToParts(d);
    for (const p of parts) if (p.type === 'timeZoneName') return p.value;
    return '';
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function renderMeta(now, dateLabel) {
    meta.textContent = '';
    if (dateLabel) meta.appendChild(document.createTextNode(dateLabel + ' '));
    meta.appendChild(document.createTextNode(dateFmt.format(now)));
    const sep = document.createElement('span');
    sep.className = 'ec-sep';
    sep.textContent = '·';
    meta.appendChild(sep);
    meta.appendChild(document.createTextNode(zoneName(now) + ' local'));
  }

  let lastMetaKey = '';

  return {
    /** Re-find the time spans after the time element was rebuilt; force a redraw. */
    reset() {
      bind();
      lastSecond = -1;
      lastMinute = -1;
      lastMetaKey = '';
    },
    /** Date line only, redrawn when the calendar day changes (used in Miller mode). */
    updateMeta(now, dateLabel) {
      const key = now.getFullYear() + '-' + now.getMonth() + '-' + now.getDate();
      if (key === lastMetaKey) return;
      lastMetaKey = key;
      renderMeta(now, dateLabel);
    },
    update(now) {
      const s = now.getSeconds();
      const m = now.getMinutes();
      if (s !== lastSecond) {
        lastSecond = s;
        let text = '';
        let dp = '';
        for (const part of timeFmt.formatToParts(now)) {
          if (part.type === 'dayPeriod') dp = part.value;
          else if (part.type === 'literal' && !/[:.]/.test(part.value)) continue;
          else text += part.value;
        }
        hm.textContent = text.trim();
        sec.textContent = pad2(s);
        period.textContent = dp;
      }
      if (m !== lastMinute) {
        lastMinute = m;
        renderMeta(now);
        root.setAttribute('aria-label', 'Endurance clock. ' + ariaFmt.format(now));
      }
    }
  };
}
