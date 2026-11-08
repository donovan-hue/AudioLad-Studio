/**
 * Set de iconos SVG propio (trazo 1.7, 24×24, currentColor).
 * Sin emojis: la UI usa estos iconos de forma consistente.
 */

export type IconName =
  | 'home'
  | 'search'
  | 'library'
  | 'deck'
  | 'queue'
  | 'sampler'
  | 'recorder'
  | 'history'
  | 'link'
  | 'import'
  | 'settings'
  | 'help'
  | 'play'
  | 'pause'
  | 'stop'
  | 'bell'
  | 'command'
  | 'menu'
  | 'close'
  | 'plus'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'volume'
  | 'heart'
  | 'heartFilled'
  | 'music'
  | 'more'
  | 'trash'
  | 'save'
  | 'edit'
  | 'refresh'
  | 'check'
  | 'shuffle'
  | 'repeat'
  | 'skipBack'
  | 'skipForward'
  | 'timer'
  | 'eq'
  | 'volumeOff'
  | 'sliders'
  | 'sun'
  | 'moon'
  | 'arrowUp'
  | 'arrowDown'
  | 'external'
  | 'disc'
  | 'mic'
  | 'waveform'
  | 'clock'
  | 'download'
  | 'upload'
  | 'list'
  | 'sparkles'
  | 'folder'
  | 'headphones';

const PATHS: Record<IconName, string> = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  library: '<path d="M4 4v16"/><path d="M8 4v16"/><path d="m12 5 8 14"/><path d="M12.5 4.5 20 18"/>',
  deck: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="12" r="2.5"/><circle cx="15" cy="12" r="2.5"/><path d="M9 16.5h6"/>',
  queue: '<path d="M4 6h10"/><path d="M4 12h10"/><path d="M4 18h7"/><path d="m16 14 5 3-5 3z"/>',
  sampler: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h2M14 9h2M8 15h2M14 15h2"/>',
  recorder: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>',
  import: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-.9.7-1.5 1.2-1.5 2.5"/><path d="M12 17h.01"/>',
  play: '<path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" stroke="none"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/>',
  command: '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevronLeft: '<path d="m15 5-7 7 7 7"/>',
  chevronRight: '<path d="m9 5 7 7-7 7"/>',
  chevronDown: '<path d="m5 9 7 7 7-7"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15 9a4 4 0 0 1 0 6"/><path d="M17.5 6.5a8 8 0 0 1 0 11"/>',
  heart: '<path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z"/>',
  heartFilled: '<path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z" fill="currentColor"/>',
  music: '<circle cx="7" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><path d="M10 18V6l11-2v12"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3"/><rect x="8" y="13" width="8" height="8"/>',
  edit: '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="m14 6 4 4"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2 6"/><path d="M20 4v7h-7"/>',
  check: '<path d="m5 12 5 5L20 6"/>',
  shuffle: '<path d="M4 6h3l10 12h3"/><path d="M17 15v3h3"/><path d="M4 18h3l3-3.6"/><path d="M13 8.6 15 6h5"/><path d="M17 3l3 3-3 3"/>',
  repeat: '<path d="m17 3 4 4-4 4"/><path d="M3 11V9a2 2 0 0 1 2-2h16"/><path d="m7 21-4-4 4-4"/><path d="M21 13v2a2 2 0 0 1-2 2H3"/>',
  skipBack: '<path d="M19 5v14L8 12z" fill="currentColor" stroke="none"/><path d="M5 5v14"/>',
  skipForward: '<path d="M5 5v14l11-7z" fill="currentColor" stroke="none"/><path d="M19 5v14"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5"/><path d="M9 2h6"/>',
  eq: '<path d="M5 21V10M5 6V3M12 21v-7M12 10V3M19 21v-4M19 13V3"/><circle cx="5" cy="8" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="15" r="2"/>',
  volumeOff: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6M21 9l-5 6"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
  arrowUp: '<path d="M12 20V4"/><path d="m6 10 6-6 6 6"/>',
  arrowDown: '<path d="M12 4v16"/><path d="m6 14 6 6 6-6"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/>',
  disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3v3M21 12h-3M12 21v-3M3 12h3"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3M9 21h6"/>',
  waveform: '<path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10M21 12h-1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>',
  upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M4 3h16"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  sparkles: '<path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18 16.5 19 19l2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h3v6H5a1 1 0 0 1-1-1z"/><path d="M20 14h-3v6h2a1 1 0 0 0 1-1z"/>',
};

export function icon(name: IconName, size = 18): string {
  return `<svg class="icon icon-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
}

export function iconLabel(name: IconName, label: string, size = 18): string {
  return `${icon(name, size)}<span>${label}</span>`;
}
