import { seasonOn } from "./season";

/**
 * The script that sets <html data-season> before first paint (app/layout.tsx).
 *
 * Without it the static page renders in the classic palette and React switches
 * it after hydration — a green flash, then a fade, every time the app opens.
 *
 * Built from `seasonOn` itself rather than a copy of its date rules, so the
 * first frame and every later one are decided by the same function. That works
 * because `seasonOn` is self-contained: it references nothing outside its body.
 */
export const SEASON_BOOT_SCRIPT = `try{var s=(${seasonOn.toString()})(new Date());if(s)document.documentElement.dataset.season=s}catch(e){}`;
