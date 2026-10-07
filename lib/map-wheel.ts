// Native, non-passive listener: React's delegated wheel listener cannot
// reliably cancel browser scrolling. Only capture the wheel after activation.
export function bindMapWheel(node: HTMLElement, zoom: (direction:number)=>void, onActive: (active:boolean)=>void) {
  let active = false;
  let lastZoom = -Infinity;
  const document = node.ownerDocument;
  const setActive = (next:boolean) => {
    if (active === next) return;
    active = next;
    lastZoom = -Infinity;
    onActive(next);
  };
  const activate = () => setActive(true);
  const deactivate = () => setActive(false);
  const outside = (event:Event) => {
    if (!node.contains(event.target as Node)) deactivate();
  };
  const keydown = (event:KeyboardEvent) => {
    if (event.key === "Escape") deactivate();
    if (event.key === "Enter" && event.target === node) activate();
  };
  const wheel = (event:WheelEvent) => {
    if (!active) return;
    // Always cancel, including at the zoom limits and during throttling.
    event.preventDefault();
    event.stopPropagation();
    if (!event.deltaY || event.timeStamp-lastZoom < 140) return;
    lastZoom = event.timeStamp;
    zoom(event.deltaY < 0 ? 1 : -1);
  };
  node.addEventListener("pointerdown", activate, true);
  node.addEventListener("keydown", keydown);
  node.addEventListener("wheel", wheel, {passive:false});
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("focusin", outside, true);
  document.defaultView?.addEventListener("blur", deactivate);
  return () => {
    node.removeEventListener("pointerdown", activate, true);
    node.removeEventListener("keydown", keydown);
    node.removeEventListener("wheel", wheel);
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("focusin", outside, true);
    document.defaultView?.removeEventListener("blur", deactivate);
  };
}
