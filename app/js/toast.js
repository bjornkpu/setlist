// Single transient toast with optional action. textContent only — no markup.

export function showToast(message, { actionLabel = "", onAction = null, duration = 6000 } = {}) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  const span = document.createElement("span");
  span.textContent = message;
  el.appendChild(span);
  if (actionLabel) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = actionLabel;
    btn.addEventListener("click", () => {
      el.remove();
      onAction?.();
    });
    el.appendChild(btn);
  }
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
}
