export function onDocumentReady(callback: () => void): void {
  const check = () => {
    if (document.readyState === "loading") return;
    callback();
    document.removeEventListener("DOMContentLoaded", check);
  };

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", check);
    check();
  }
}
