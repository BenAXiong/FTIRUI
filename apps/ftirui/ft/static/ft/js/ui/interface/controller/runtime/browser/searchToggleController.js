export function createBrowserSearchToggleController({
  root,
  toggle,
  container,
  input
} = {}) {
  if (!root || !toggle || !container || !input) return null;

  let isActive = false;

  const setActive = (next) => {
    if (isActive === next) return;
    isActive = next;
    root.classList.toggle('is-searching', isActive);
    container.hidden = !isActive;
    toggle.setAttribute('aria-expanded', isActive ? 'true' : 'false');
    if (isActive) {
      input.focus();
    }
  };

  const handleToggleClick = (event) => {
    event.preventDefault();
    if (isActive) {
      input.focus();
      return;
    }
    setActive(true);
  };

  const handleDocumentPointer = (event) => {
    if (!isActive) return;
    const target = event.target;
    if (container.contains(target) || toggle.contains(target)) return;
    setActive(false);
  };

  toggle.addEventListener('click', handleToggleClick);
  document.addEventListener('pointerdown', handleDocumentPointer, true);

  setActive(false);

  return {
    teardown() {
      toggle.removeEventListener('click', handleToggleClick);
      document.removeEventListener('pointerdown', handleDocumentPointer, true);
    }
  };
}
