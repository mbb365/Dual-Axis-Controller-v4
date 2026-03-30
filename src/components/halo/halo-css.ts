export const HALO_CSS = `
.halo {
    container-type: inline-size;
}

.halo__pad-shell {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    box-sizing: border-box;
    overflow: visible;
    --halo-pad-inset: 4px;
    --halo-pad-border-width: 6px;
    --halo-overlay-inset: calc(var(--halo-pad-inset) + var(--halo-pad-border-width));
}

.halo__pad {
    position: absolute;
    inset: var(--halo-pad-inset);
    border-radius: 18px;
    overflow: hidden;
    background-color: rgba(245, 247, 250, 0.96);
    cursor: crosshair;
    touch-action: none;
    border: var(--halo-pad-border-width) solid rgba(183, 192, 203, 0.9);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.72),
        0 2px 8px rgba(15, 23, 42, 0.06);
    transition:
        border-radius 340ms cubic-bezier(0.22, 0.68, 0.2, 1),
        transform 340ms cubic-bezier(0.22, 0.68, 0.2, 1),
        border-color 340ms cubic-bezier(0.22, 0.68, 0.2, 1),
        box-shadow 340ms cubic-bezier(0.22, 0.68, 0.2, 1);
}

.halo__overlay {
    position: absolute;
    inset: var(--halo-overlay-inset);
    border-radius: 18px;
    overflow: visible;
    pointer-events: none;
}

.halo__pad::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
        linear-gradient(rgba(99, 115, 148, 0.3) 1px, transparent 1px),
        linear-gradient(90deg, rgba(99, 115, 148, 0.3) 1px, transparent 1px);
    background-size: 24px 24px;
    background-position: center center;
    opacity: 0.9;
    -webkit-mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.38) 26%, rgba(0, 0, 0, 0.94) 60%, rgba(0, 0, 0, 1) 100%);
    mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.38) 26%, rgba(0, 0, 0, 0.94) 60%, rgba(0, 0, 0, 1) 100%);
    pointer-events: none;
    transition:
        opacity 280ms ease,
        -webkit-mask-image 340ms cubic-bezier(0.22, 0.68, 0.2, 1),
        mask-image 340ms cubic-bezier(0.22, 0.68, 0.2, 1);
}

.halo__pad::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(145deg, rgba(255, 255, 255, 0.1) 0%, rgba(240, 244, 249, 0.06) 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
    pointer-events: none;
}

.halo__pulse {
    position: absolute;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
    pointer-events: none;
    z-index: 1;
}

.halo__pulse::before,
.halo__pulse::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    border-radius: 999px;
    transform: translate(-50%, -50%);
    pointer-events: none;
}

.halo__pulse::before {
    width: 96px;
    height: 96px;
    background:
        radial-gradient(circle, color-mix(in srgb, var(--halo-pulse-color) 36%, white 64%) 0%, color-mix(in srgb, var(--halo-pulse-color) 21%, white 79%) 24%, rgba(255, 255, 255, 0.09) 52%, rgba(255, 255, 255, 0) 100%);
    opacity: 0;
    filter: blur(13px);
    animation: halo-bloom 820ms cubic-bezier(0.16, 0.72, 0.2, 1) forwards;
}

.halo__pulse::after {
    width: 24px;
    height: 24px;
    border: 1.5px solid color-mix(in srgb, var(--halo-pulse-color) 44%, white 56%);
    box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.28),
        0 0 20px color-mix(in srgb, var(--halo-pulse-color) 24%, transparent 76%);
    opacity: 0;
    animation: halo-ripple 980ms cubic-bezier(0.18, 0.72, 0.2, 1) forwards;
}

@keyframes halo-bloom {
    0% {
        opacity: 0.68;
        transform: translate(-50%, -50%) scale(0.32);
    }

    38% {
        opacity: 0.4;
        transform: translate(-50%, -50%) scale(0.88);
    }

    100% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(1.16);
    }
}

@keyframes halo-ripple {
    0% {
        opacity: 0.44;
        transform: translate(-50%, -50%) scale(0.56);
    }

    46% {
        opacity: 0.22;
        transform: translate(-50%, -50%) scale(1.74);
    }

    100% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(2.84);
    }
}

@keyframes halo-indicator-handoff {
    0% {
        transform: translate(-50%, -50%) scale(0.82);
    }

    62% {
        transform: translate(-50%, -50%) scale(1.08);
    }

    100% {
        transform: translate(-50%, -50%) scale(1);
    }
}

@keyframes halo-indicator-ghost {
    0% {
        opacity: 0.92;
        transform: translate(-50%, -50%) scale(1);
    }

    100% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.88);
    }
}

.halo__pad.is-off {
    cursor: pointer;
    border-color: rgba(124, 58, 237, 0.12);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.58),
        inset 0 0 0 1px rgba(255, 255, 255, 0.08),
        inset 0 0 80px rgba(168, 85, 247, 0.18),
        0 2px 8px rgba(15, 23, 42, 0.06);
}

.halo__pad.is-disco {
    cursor: pointer;
}

.halo__indicator {
    position: absolute;
    width: 27px;
    height: 27px;
    border-radius: 999px;
    transform: translate(-50%, -50%);
    border: 3px solid rgba(255, 255, 255, 0.98);
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.2);
    pointer-events: none;
    z-index: 3;
    transition:
        left 340ms cubic-bezier(0.22, 0.68, 0.2, 1),
        top 340ms cubic-bezier(0.22, 0.68, 0.2, 1),
        box-shadow 220ms ease;
}

.halo__indicator.is-live {
    transition: box-shadow 220ms ease;
}

.halo__indicator.is-handoff {
    transition: box-shadow 220ms ease;
    animation: halo-indicator-handoff 260ms cubic-bezier(0.18, 0.72, 0.2, 1);
}

.halo__indicator-ghost {
    position: absolute;
    width: 27px;
    height: 27px;
    border-radius: 999px;
    transform: translate(-50%, -50%);
    border: 3px solid rgba(255, 255, 255, 0.84);
    pointer-events: none;
    z-index: 2;
    animation: halo-indicator-ghost 240ms ease forwards;
}

.halo__group-indicator {
    appearance: none;
    -webkit-appearance: none;
    padding: 0;
    position: absolute;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    transform: translate(-50%, -50%);
    border: 2px solid rgba(255, 255, 255, 0.84);
    box-shadow:
        0 0 0 1px rgba(15, 23, 42, 0.08),
        0 8px 16px rgba(15, 23, 42, 0.12);
    pointer-events: auto;
    z-index: 2;
    opacity: 0.88;
    cursor: grab;
    background: transparent;
    transition:
        left 280ms cubic-bezier(0.22, 0.68, 0.2, 1),
        top 280ms cubic-bezier(0.22, 0.68, 0.2, 1),
        transform 220ms ease,
        opacity 220ms ease,
        box-shadow 220ms ease;
}

.halo__group-indicator:focus-visible {
    outline: 2px solid rgba(59, 130, 246, 0.9);
    outline-offset: 2px;
}

.halo__group-indicator.is-active {
    width: 22px;
    height: 22px;
    opacity: 0.96;
    border-color: rgba(255, 255, 255, 0.94);
    box-shadow:
        0 0 0 1px rgba(15, 23, 42, 0.1),
        0 10px 18px rgba(15, 23, 42, 0.16);
}

.halo__group-indicator.is-off {
    background: rgba(203, 213, 225, 0.42) !important;
    border-color: rgba(255, 255, 255, 0.72);
    opacity: 0.68;
    box-shadow:
        0 0 0 1px rgba(15, 23, 42, 0.05),
        0 6px 12px rgba(15, 23, 42, 0.08);
}

.halo__disco-overlay {
    position: absolute;
    inset: 0;
    z-index: 4;
    border-radius: 18px;
    overflow: hidden;
    display: grid;
    place-items: center;
    padding: 22px;
    pointer-events: none;
}

.halo__disco-overlay::before,
.halo__disco-overlay::after {
    content: '';
    position: absolute;
    inset: -18%;
    pointer-events: none;
}

.halo__disco-overlay::before {
    background:
        conic-gradient(from 0deg, rgba(255, 82, 82, 0.82), rgba(255, 193, 7, 0.8), rgba(94, 234, 212, 0.78), rgba(96, 165, 250, 0.82), rgba(244, 114, 182, 0.82), rgba(255, 82, 82, 0.82));
    filter: blur(28px) saturate(130%);
    opacity: 0.88;
    animation: halo-disco-spin 8s linear infinite, halo-disco-breathe 2.2s ease-in-out infinite alternate;
}

.halo__disco-overlay::after {
    inset: 0;
    background:
        radial-gradient(circle at 50% 24%, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.08) 18%, rgba(255, 255, 255, 0) 48%),
        linear-gradient(180deg, rgba(11, 18, 32, 0.18) 0%, rgba(11, 18, 32, 0.3) 100%);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
}

.halo__disco-message {
    position: relative;
    z-index: 1;
    max-width: 84%;
    padding: 0;
    border-radius: 0;
    background: transparent;
    border: 0;
    box-shadow: none;
    color: #f8fafc;
    text-align: center;
}

.halo__disco-title {
    display: block;
    margin-bottom: 8px;
    font-size: 0.98rem;
    font-weight: 700;
    letter-spacing: 0.08em;
}

.halo__disco-copy {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.45;
    font-weight: 500;
    color: rgba(248, 250, 252, 0.96);
}

@keyframes halo-disco-spin {
    from {
        transform: rotate(0deg) scale(1);
    }

    to {
        transform: rotate(360deg) scale(1.06);
    }
}

@keyframes halo-disco-breathe {
    from {
        opacity: 0.72;
        filter: blur(24px) saturate(120%);
    }

    to {
        opacity: 0.96;
        filter: blur(34px) saturate(138%);
    }
}

@container (max-width: 420px) {
    .halo__pad-shell {
        --halo-pad-inset: 3px;
        --halo-pad-border-width: 6px;
        --halo-overlay-inset: calc(var(--halo-pad-inset) + var(--halo-pad-border-width));
    }

    .halo__indicator {
        width: 23px;
        height: 23px;
        border-width: 3px;
    }

    .halo__indicator-ghost {
        width: 23px;
        height: 23px;
        border-width: 3px;
    }

    .halo__group-indicator {
        width: 16px;
        height: 16px;
    }

    .halo__group-indicator.is-active {
        width: 20px;
        height: 20px;
    }

    .halo__disco-message {
        max-width: 90%;
        padding: 16px 16px;
    }

    .halo__disco-title {
        font-size: 0.9rem;
    }

    .halo__disco-copy {
        font-size: 0.8rem;
    }
}

@media (prefers-color-scheme: dark) {
    .halo__pad {
        background-color: rgba(26, 31, 38, 0.96);
        border-color: rgba(148, 163, 184, 0.26);
        box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.08),
            0 2px 8px rgba(0, 0, 0, 0.14);
    }

    .halo__pad::before {
        opacity: 0.18;
    }

    .halo__pad::after {
        background: linear-gradient(145deg, rgba(255, 255, 255, 0.02) 0%, rgba(240, 244, 249, 0.012) 100%);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    }

    .halo__pad.is-off {
        border-color: rgba(124, 58, 237, 0.08);
        box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.07),
            inset 0 0 42px rgba(168, 85, 247, 0.08),
            0 2px 8px rgba(0, 0, 0, 0.14);
    }

    .halo__group-indicator {
        border-color: rgba(255, 255, 255, 0.58);
        box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.06),
            0 8px 16px rgba(0, 0, 0, 0.18);
    }

    .halo__group-indicator.is-active {
        border-color: rgba(255, 255, 255, 0.74);
        box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.08),
            0 10px 20px rgba(0, 0, 0, 0.22);
    }

    .halo__group-indicator.is-off {
        background: rgba(100, 116, 139, 0.32) !important;
        border-color: rgba(255, 255, 255, 0.44);
        box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.04),
            0 6px 12px rgba(0, 0, 0, 0.16);
    }

    .halo__pulse::before {
        opacity: 0;
        filter: blur(9px);
    }

    .halo__pulse::after {
        box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.12),
            0 0 12px color-mix(in srgb, var(--halo-pulse-color) 12%, transparent 88%);
    }
}
`;
