/*
 * Digital readout and accessible label. Locale-aware hours and minutes,
 * seconds and AM/PM set apart, date and timezone on a second line.
 */
export function createReadout(root, options) {
  options = options || {};
  const locale = options.locale || undefined;
  const hour12 = typeof options.hour12 === 'boolean' ? options.hour12 : undefined;

  const hm = root.querySelector('.ec-hm');
  const sec = root.querySelector('.ec-seconds');
  const period = root.querySelector('.ec-period');
  const meta = root.querySelector('.clock3d__meta');

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

  return {
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
        meta.textContent = '';
        meta.appendChild(document.createTextNode(dateFmt.format(now)));
        const sep = document.createElement('span');
        sep.className = 'ec-sep';
        sep.textContent = '·';
        meta.appendChild(sep);
        meta.appendChild(document.createTextNode(zoneName(now) + ' local'));
        root.setAttribute('aria-label', 'Endurance clock. ' + ariaFmt.format(now));
      }
    }
  };
}
