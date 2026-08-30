// Inline UI icons (stroke, currentColor). Masters and drawing rules live in
// app/assets/icons/ — tests/icons.test.js fails if the two drift apart.

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICON = {
  pick: svg(`<path d="M6 4h12v16l-6-6-6 6z"/>`),
  maybe: svg(`<path d="M6 9V4h5"/><path d="M18 9V4h-5"/><path d="M6 14v6l6-6 6 6v-6"/>`),
  avoid: svg(`<circle cx="12" cy="12" r="8"/><path d="M6.5 6.5l11 11"/>`),
  now: svg(`<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3.5 3.5"/>`),
  next: svg(`<path d="M4 5h16"/><path d="M12 9v6"/><path d="M9 12l3 3 3-3"/><path d="M4 19h16"/>`),
  schedule: svg(
    `<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M4 11h16"/>`,
  ),
  room: svg(`<path d="M12 21c4-5.5 6-8.5 6-11a6 6 0 10-12 0c0 2.5 2 5.5 6 11z"/><circle cx="12" cy="10" r="2"/>`),
  download: svg(`<path d="M12 4v9"/><path d="M8 9l4 4 4-4"/><path d="M5 17v3h14v-3"/>`),
};
