// HTML-escape all schedule-sourced text before innerHTML.

const MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => MAP[c]);
