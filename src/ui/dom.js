const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function $(id) {
  return document.getElementById(id);
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ESC_MAP[char]);
}

function escAttr(value) {
  return String(value).replace(/[&<>"']/g, (char) => ESC_MAP[char]);
}

export { $, esc, escAttr };
