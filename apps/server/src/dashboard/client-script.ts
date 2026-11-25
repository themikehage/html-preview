// SPDX-License-Identifier: MIT

/** The only client code: Escape closes the :target modal, copy buttons, nothing else. */
export const CLIENT_SCRIPT = `(() => {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && location.hash) {
      location.hash = "";
    }
  });
  document.addEventListener("click", async (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-copy]") : null;
    if (!button) return;
    const text = document.getElementById(button.getAttribute("data-copy"))?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Select and copy";
    }
  });
  window.addEventListener("hashchange", () => {
    const modal = location.hash ? document.querySelector(location.hash + ".modal") : null;
    modal?.querySelector("a.btn, button")?.focus();
  });
})();
`;
