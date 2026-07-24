function getBrowserNavigator(): Navigator | null {
  const runtime = globalThis as typeof globalThis & {
    window?: Window;
    navigator?: Navigator;
  };
  if (typeof runtime.window === "undefined") return null;
  return runtime.navigator ?? null;
}

export function isIOS(): boolean {
  const navigator = getBrowserNavigator();
  if (!navigator) return false;

  return /iPhone/gi.test(navigator.platform) ||
    (/Mac/gi.test(navigator.platform) && navigator.maxTouchPoints > 0);
}

export function isAndroid(): boolean {
  const navigator = getBrowserNavigator();
  return navigator ? /Android/gi.test(navigator.userAgent) : false;
}

export function isMobile(): boolean {
  return isIOS() || isAndroid();
}
