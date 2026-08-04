// Preset trading-themed avatars users can pick in the auth dropdown menu.
// Each entry stores its own icon color (tint), circle background (bg), and
// border so the badges stay legible without depending on CSS color-mix().

const AVATARS = [
  { key: "bull", name: "Bull", tint: "#2fe0a3", bg: "#10291f", border: "#1f7a55",
    svg: '<path d="M6.2 7.2c-1.6-.6-2.6-2.1-2.2-3.9 1.7.2 3.1 1.4 3.6 3.1z" fill="currentColor"/><path d="M17.8 7.2c1.6-.6 2.6-2.1 2.2-3.9-1.7.2-3.1 1.4-3.6 3.1z" fill="currentColor"/><path d="M12 5.2c3.4 0 5.8 2.5 5.8 5.8 0 1.9-.9 3-1.6 4.3-.6 1.1-.9 2.3-4.2 2.3s-3.6-1.2-4.2-2.3c-.7-1.3-1.6-2.4-1.6-4.3 0-3.3 2.4-5.8 5.8-5.8z" fill="currentColor"/><circle cx="9.8" cy="11.2" r="1" fill="{bg}"/><circle cx="14.2" cy="11.2" r="1" fill="{bg}"/><ellipse cx="12" cy="15" rx="2.6" ry="1.6" fill="{bg}"/><circle cx="11" cy="15" r="0.4" fill="currentColor"/><circle cx="13" cy="15" r="0.4" fill="currentColor"/>' },
  { key: "bear", name: "Bear", tint: "#ff8064", bg: "#2e150f", border: "#b8492f",
    svg: '<circle cx="7.3" cy="7" r="2.6" fill="currentColor"/><circle cx="16.7" cy="7" r="2.6" fill="currentColor"/><circle cx="12" cy="12.5" r="7" fill="currentColor"/><circle cx="9.6" cy="11.5" r="1" fill="{bg}"/><circle cx="14.4" cy="11.5" r="1" fill="{bg}"/><ellipse cx="12" cy="15" rx="2.8" ry="2" fill="{bg}"/><circle cx="12" cy="14.4" r="0.5" fill="currentColor"/>' },
  { key: "rocket", name: "Rocket", tint: "#ffab52", bg: "#2e1d0a", border: "#c17a26",
    svg: '<path d="M12 2.5c2.7 2.2 4.3 5.8 4.3 9.3 0 1.9-.6 3.6-1 4.5H8.7c-.4-.9-1-2.6-1-4.5 0-3.5 1.6-7.1 4.3-9.3z" fill="currentColor"/><circle cx="12" cy="10" r="1.7" fill="{bg}"/><path d="M8.7 13l-3 3.2 1 .6 2.6-2.4z" fill="currentColor"/><path d="M15.3 13l3 3.2-1 .6-2.6-2.4z" fill="currentColor"/><path d="M10 18.3h4l-.8 3.2a1.4 1.4 0 0 1-2.4 0z" fill="currentColor" opacity="0.85"/>' },
  { key: "candles", name: "Candles", tint: "#45d8e6", bg: "#0e2a2e", border: "#1f8c96",
    svg: '<rect x="5.6" y="4" width="1" height="16" rx="0.5" fill="currentColor"/><rect x="4" y="9" width="4" height="5" rx="1" fill="{bg}" stroke="currentColor" stroke-width="1.3"/><rect x="11.5" y="2" width="1" height="20" rx="0.5" fill="currentColor"/><rect x="9.8" y="6" width="4.4" height="10" rx="1" fill="currentColor"/><rect x="18.4" y="6" width="1" height="14" rx="0.5" fill="currentColor"/><rect x="16.8" y="10" width="4" height="5" rx="1" fill="{bg}" stroke="currentColor" stroke-width="1.3"/>' },
  { key: "diamond", name: "Diamond", tint: "#aab8ff", bg: "#171b36", border: "#4c58ad",
    svg: '<path d="M6.5 9.2L12 3l5.5 6.2L12 21z" fill="currentColor"/><path d="M6.5 9.2h11" stroke="{bg}" stroke-width="1"/><path d="M9.3 9.2L12 3" stroke="{bg}" stroke-width="1"/><path d="M14.7 9.2L12 3" stroke="{bg}" stroke-width="1"/><path d="M9 6.5l1.6-2" stroke="#ffffff" stroke-width="1" opacity="0.35" stroke-linecap="round"/>' },
  { key: "owl", name: "Owl", tint: "#b6a0ff", bg: "#201a38", border: "#6e50c9",
    svg: '<path d="M8 5.5l1.6 2.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M16 5.5l-1.6 2.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12 6.2c3.6 0 6 2.8 6 6.6 0 4-2.4 8-6 8s-6-4-6-8c0-3.8 2.4-6.6 6-6.6z" fill="currentColor"/><circle cx="9.4" cy="12" r="2.2" fill="{bg}"/><circle cx="14.6" cy="12" r="2.2" fill="{bg}"/><circle cx="9.4" cy="12" r="0.9" fill="currentColor"/><circle cx="14.6" cy="12" r="0.9" fill="currentColor"/><path d="M11 14.6l1 1.4 1-1.4z" fill="{bg}"/>' },
  { key: "fox", name: "Fox", tint: "#ffcf5e", bg: "#2e2409", border: "#bf8e28",
    svg: '<path d="M6.5 5l2.6 4.6-4-1z" fill="currentColor"/><path d="M17.5 5l-2.6 4.6 4-1z" fill="currentColor"/><path d="M12 8c2.4 0 4.3 2 4.3 5 0 3.6-2.1 7.3-4.3 7.3S7.7 16.6 7.7 13c0-3 1.9-5 4.3-5z" fill="currentColor"/><circle cx="10.2" cy="12.4" r="0.9" fill="{bg}"/><circle cx="13.8" cy="12.4" r="0.9" fill="{bg}"/><path d="M12 15.5l1.6 2.1h-3.2z" fill="{bg}"/>' },
  { key: "whale", name: "Whale", tint: "#6fb6ff", bg: "#0f2036", border: "#2f72b3",
    svg: '<path d="M2.5 13.5c1.8-4 6.4-6.6 11-6.6 5 0 9 3 9 6.3 0 2.3-2.1 4-4.6 4H8c-3.1 0-5.5-1.5-5.5-3.7z" fill="currentColor"/><path d="M20 10c1.3.5 2.5 1.7 2.7 3.3-1.4.2-3-.3-3.9-1.3z" fill="currentColor"/><path d="M13 4.5c.2-1 .9-1.8 1.7-2.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="7.6" cy="11.6" r="0.9" fill="{bg}"/><path d="M6 15.6c1.6.6 3.4.9 5.2.9" stroke="{bg}" stroke-width="1" stroke-linecap="round"/>' },
  { key: "vault", name: "Vault", tint: "#dcc48a", bg: "#2a2413", border: "#93794a",
    svg: '<rect x="3.5" y="3.5" width="17" height="17" rx="3.5" fill="currentColor"/><circle cx="12" cy="12" r="4.6" fill="{bg}"/><circle cx="12" cy="12" r="1" fill="currentColor"/><rect x="11.3" y="7.3" width="1.4" height="3" rx="0.7" fill="currentColor"/><rect x="15.5" y="5.3" width="2.4" height="1.4" rx="0.7" fill="currentColor" transform="rotate(45 16.7 6)"/>' },
  { key: "piggy", name: "Piggy", tint: "#ff9dc4", bg: "#301722", border: "#bb5580",
    svg: '<path d="M3.4 12c-1.2-.3-1.9.4-1.7 1.5.9-.2 1.6-.7 1.7-1.5z" fill="currentColor"/><ellipse cx="10.6" cy="13" rx="7.6" ry="5.4" fill="currentColor"/><path d="M7 7.6c-.4-1.4.2-2.6 1.5-3.2.4 1.4 0 2.7-1.5 3.2z" fill="currentColor"/><ellipse cx="17.4" cy="12.6" rx="2.4" ry="1.9" fill="{bg}"/><circle cx="16.7" cy="12.6" r="0.4" fill="currentColor"/><circle cx="18.1" cy="12.6" r="0.4" fill="currentColor"/><circle cx="12.4" cy="10.6" r="0.8" fill="{bg}"/><rect x="7" y="17.8" width="1.6" height="2.6" rx="0.6" fill="currentColor"/><rect x="13" y="17.8" width="1.6" height="2.6" rx="0.6" fill="currentColor"/>' },
  { key: "unicorn", name: "Unicorn", tint: "#dd8dff", bg: "#29123a", border: "#9a4fcb",
    svg: '<path d="M6.5 20.5V13c0-4 3-7.6 7-7.6 1.1 0 2 .2 2.9.7l-1 1.7c-.6-.3-1.2-.4-1.9-.4-2.8 0-5 2.6-5 5.6v7.5z" fill="currentColor"/><path d="M12.6 6.4L14 2l1.4 4.4z" fill="currentColor"/><path d="M14 2v4.4" stroke="{bg}" stroke-width="0.8"/><path d="M9.6 8.3c1.6.2 2.8 1.2 3.3 2.7-1.7 0-3-.9-3.3-2.7z" fill="currentColor" opacity="0.6"/><path d="M8.4 11.6c1.5.3 2.6 1.4 3 2.8-1.6.1-2.8-.9-3-2.8z" fill="currentColor" opacity="0.6"/><circle cx="10.7" cy="10.4" r="0.8" fill="{bg}"/>' },
  { key: "compass", name: "Compass", tint: "#56ecc0", bg: "#0e2925", border: "#299b7c",
    svg: '<circle cx="12" cy="12" r="9" fill="currentColor"/><circle cx="12" cy="12" r="7.2" fill="{bg}"/><path d="M12 6.5l2 5.5-2 5.5-2-5.5z" fill="currentColor"/><path d="M12 6.5l2 5.5-2 1.2z" fill="currentColor" opacity="0.55"/><circle cx="12" cy="12" r="1" fill="currentColor"/><rect x="11.5" y="3.4" width="1" height="1.8" rx="0.5" fill="currentColor"/><rect x="11.5" y="18.8" width="1" height="1.8" rx="0.5" fill="currentColor"/><rect x="3.4" y="11.5" width="1.8" height="1" rx="0.5" fill="currentColor"/><rect x="18.8" y="11.5" width="1.8" height="1" rx="0.5" fill="currentColor"/>' },
];

function avatarByKey(key){
  return AVATARS.find(a => a.key === key) || null;
}

// Returns an inline <svg> string for the given avatar, with {bg} cutouts
// resolved to that avatar's own background color.
function avatarSvgMarkup(avatar){
  return `<svg viewBox="0 0 24 24">${avatar.svg.split('{bg}').join(avatar.bg)}</svg>`;
}

// Returns a ready-to-insert <span class="avatar-icon"> for the given avatar
// key, or null if the key doesn't match a known preset (e.g. none chosen yet).
function avatarIconHtml(key, extraClass){
  const a = avatarByKey(key);
  if(!a) return null;
  const cls = extraClass ? `avatar-icon ${extraClass}` : 'avatar-icon';
  return `<span class="${cls}" style="--tint:${a.tint};--bg:${a.bg};--border:${a.border};" title="${a.name}">${avatarSvgMarkup(a)}</span>`;
}
