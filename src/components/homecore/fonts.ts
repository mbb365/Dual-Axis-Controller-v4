const FONT_LINK_ID = 'dual-axis-controller-homecore-fonts';
const FONT_URL =
    'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Inter:wght@400;500;600&display=swap';

/** Fonts declared inside a shadow root are ignored, so Geist and Inter are added to the page once. */
export function ensureHomeCoreFonts() {
    if (typeof document === 'undefined' || document.getElementById(FONT_LINK_ID)) return;
    const link = document.createElement('link');
    link.id = FONT_LINK_ID;
    link.rel = 'stylesheet';
    link.href = FONT_URL;
    document.head.appendChild(link);
}
