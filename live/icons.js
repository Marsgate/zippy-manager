// Inline SVG icons for Hexy Hustle game objects and field elements.
// Colors come from CSS custom properties so each theme can restyle them.
(function() {
    const ALLIANCE_FILL = {
        red: 'var(--red)',
        blue: 'var(--blue)',
        none: 'var(--empty)'
    };

    function hexPoints(cx, cy, r) {
        const points = [];
        for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 3 * i;
            points.push((cx + r * Math.cos(angle)).toFixed(2) + ',' + (cy + r * Math.sin(angle) * 0.62).toFixed(2));
        }
        return points.join(' ');
    }

    function flatHexPath(cx, cy, r) {
        const points = [];
        for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 3 * i;
            points.push((cx + r * Math.cos(angle)).toFixed(2) + ' ' + (cy + r * Math.sin(angle)).toFixed(2));
        }
        return 'M' + points.join(' L') + ' Z';
    }

    let maskId = 0;

    // A hex slab seen at an angle: top face in `top` color, edge in `bottom` color.
    function hex({ top = 'red', bottom = 'blue', className = '' } = {}) {
        const topFill = ALLIANCE_FILL[top] || top;
        const bottomFill = ALLIANCE_FILL[bottom] || bottom;
        const id = 'hexhole' + (maskId++);
        const outer = (cy) => 'M' + hexPoints(50, cy, 46).replace(/ /g, ' L') + ' Z';
        const hole = 'M' + hexPoints(50, 32, 20).replace(/ /g, ' L') + ' Z';
        return `
<svg class="icon icon-hex ${className}" viewBox="0 0 100 76" aria-hidden="true">
  <defs><mask id="${id}"><rect width="100" height="76" fill="white"/><path d="${hole}" fill="black"/></mask></defs>
  <g mask="url(#${id})">
    <path d="${outer(41)}" fill="${bottomFill}" stroke="var(--ink)" stroke-width="4" stroke-linejoin="round"/>
    <path d="${outer(32)}" fill="${topFill}" stroke="var(--ink)" stroke-width="4" stroke-linejoin="round"/>
  </g>
  <path d="${hole}" fill="none" stroke="var(--ink)" stroke-width="4" stroke-linejoin="round"/>
</svg>`;
    }

    // Flat, top-down hex (used on the field map).
    function hexFlat({ color = 'red', className = '' } = {}) {
        const fill = ALLIANCE_FILL[color] || color;
        return `
<svg class="icon icon-hex-flat ${className}" viewBox="0 0 100 100" aria-hidden="true">
  <path d="${flatHexPath(50, 50, 44)} ${flatHexPath(50, 50, 17)}" fill="${fill}" fill-rule="evenodd"
        stroke="var(--ink)" stroke-width="5" stroke-linejoin="round"/>
</svg>`;
    }

    // Tower seen from the side, optionally with a hex hanging on its hook.
    function tower({ hex = null, className = '' } = {}) {
        const hexLayer = hex
            ? `<path d="${flatHexPath(50, 34, 30)} ${flatHexPath(50, 34, 11)}" fill="${ALLIANCE_FILL[hex] || hex}"
                 fill-rule="evenodd" stroke="var(--ink)" stroke-width="4" stroke-linejoin="round"/>`
            : '';
        return `
<svg class="icon icon-tower ${hex ? 'has-hex' : ''} ${className}" viewBox="0 0 100 130" aria-hidden="true">
  <path d="M30 122 L30 108 Q30 98 40 93 Q45 90 45 80 L45 30 L55 30 L55 80 Q55 90 60 93 Q70 98 70 108 L70 122 Z"
        fill="var(--element)" stroke="var(--ink)" stroke-width="4" stroke-linejoin="round"/>
  <path d="M34 32 L34 24 L50 24 L50 10 L64 10 L64 20 L58 20 L58 32 Z"
        fill="var(--element)" stroke="var(--ink)" stroke-width="4" stroke-linejoin="round"/>
  ${hexLayer}
  ${hex ? '<path d="M50 27 L50 10 L64 10 L64 20 L58 20 L58 27" fill="var(--element)" stroke="var(--ink)" stroke-width="4" stroke-linejoin="round"/>' : ''}
  <rect x="14" y="118" width="72" height="10" rx="2" fill="var(--wall)" stroke="var(--ink)" stroke-width="4"/>
</svg>`;
    }

    // A robot hanging from the bar (or parked on the floor when not hanging).
    function robot({ color = 'red', hanging = true, className = '' } = {}) {
        const fill = ALLIANCE_FILL[color] || color;
        const dy = hanging ? 0 : 30;
        const arm = hanging
            ? '<path d="M60 16 L60 40 M50 12 Q60 26 70 12" fill="none" stroke="var(--ink)" stroke-width="5" stroke-linecap="round"/>'
            : '<path d="M60 46 L60 70" fill="none" stroke="var(--ink)" stroke-width="5" stroke-linecap="round"/>';
        return `
<svg class="icon icon-robot ${hanging ? 'is-hanging' : 'is-parked'} ${className}" viewBox="0 0 120 124" aria-hidden="true">
  <rect x="4" y="6" width="112" height="10" rx="5" fill="var(--bar)" stroke="var(--ink)" stroke-width="4"/>
  <path d="M6 120 L114 120" stroke="var(--muted)" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 8"/>
  ${arm}
  <g transform="translate(0 ${dy})">
    <rect x="24" y="40" width="72" height="34" rx="8" fill="${fill}" stroke="var(--ink)" stroke-width="4"/>
    <rect x="36" y="48" width="48" height="12" rx="4" fill="var(--panel-inset)" stroke="var(--ink)" stroke-width="3"/>
    <circle cx="36" cy="78" r="10" fill="var(--wheel)" stroke="var(--ink)" stroke-width="4"/>
    <circle cx="84" cy="78" r="10" fill="var(--wheel)" stroke="var(--ink)" stroke-width="4"/>
  </g>
</svg>`;
    }

    function flag({ className = '' } = {}) {
        return `
<svg class="icon icon-flag ${className}" viewBox="0 0 100 100" aria-hidden="true">
  <path d="M24 92 L24 10" stroke="var(--ink)" stroke-width="7" stroke-linecap="round"/>
  <path d="M27 14 Q45 6 60 14 T88 16 L88 54 Q74 46 60 54 T27 52 Z" fill="var(--penalty)"
        stroke="var(--ink)" stroke-width="5" stroke-linejoin="round"/>
</svg>`;
    }

    function zone({ color = 'red', className = '' } = {}) {
        const fill = ALLIANCE_FILL[color] || color;
        return `
<svg class="icon icon-zone ${className}" viewBox="0 0 100 100" aria-hidden="true">
  <rect x="8" y="8" width="84" height="84" rx="4" fill="none" stroke="${fill}" stroke-width="8"/>
  <path d="${flatHexPath(50, 50, 26)} ${flatHexPath(50, 50, 10)}" fill="${fill}"
        fill-rule="evenodd" stroke="var(--ink)" stroke-width="4"/>
</svg>`;
    }

    window.Icons = { hex, hexFlat, tower, robot, flag, zone, flatHexPath };
})();
