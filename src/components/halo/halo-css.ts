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
    --halo-pad-inset: 0px;
    --halo-pad-border-width: 0px;
    --halo-overlay-inset: 0px;
}

.halo__pad-shell.is-borderless-style {
    --halo-pad-inset: 0px;
    --halo-pad-border-width: 0px;
    --halo-overlay-inset: 0px;
}

.halo__pad {
    position: absolute;
    inset: var(--halo-pad-inset);
    border-radius: 18px;
    overflow: hidden;
    background-color: rgba(245, 247, 250, 0.96);
    cursor: crosshair;
    touch-action: none;
    border: 0;
    box-shadow: none;
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

.halo__pad.is-style-pixel::before {
    content: none;
}

.halo__pad.is-style-pixel,
.halo__pad.is-style-pixel + .halo__overlay {
    border-radius: 0;
}

.halo__pad.is-style-pixel {
    border: 0;
    background: transparent;
}

.halo__pad.is-style-matrix::before {
    content: none;
}

.halo__pad.is-style-matrix {
    border: 0;
    background: transparent;
    overflow: visible;
}

.halo__pad.is-style-plotter::before {
    background-image:
        linear-gradient(rgba(99, 115, 148, 0.3) 1px, transparent 1px),
        linear-gradient(90deg, rgba(99, 115, 148, 0.3) 1px, transparent 1px);
    background-size: 24px 24px;
}

.halo__pad::after {
    content: '';
    position: absolute;
    inset: 0;
    background: none;
    box-shadow: none;
    pointer-events: none;
}

.halo__matrix-surface {
    position: absolute;
    inset: -6px;
    display: grid;
    grid-template-columns: repeat(32, minmax(0, 1fr));
    grid-template-rows: repeat(32, minmax(0, 1fr));
    padding: 0;
    gap: 1px;
    pointer-events: none;
}

.halo__pixel-surface {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: repeat(10, minmax(0, 1fr));
    grid-template-rows: repeat(10, minmax(0, 1fr));
    padding: 0;
    gap: 4px;
    pointer-events: auto;
}

.halo__pixel-cell-wrap {
    appearance: none;
    -webkit-appearance: none;
    border: 0;
    background: transparent;
    padding: 0;
    display: grid;
    place-items: center;
    cursor: pointer;
}

.halo__pixel-cell {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 6px;
}

.halo__pixel-cell-center-dot {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 26%;
    height: 26%;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow:
        0 0 0 1px rgba(15, 23, 42, 0.08),
        0 0 8px rgba(255, 255, 255, 0.42);
    transform: translate(-50%, -50%);
    pointer-events: none;
}

.halo__pixel-cell-wrap:focus-visible {
    outline: 2px solid rgba(59, 130, 246, 0.88);
    outline-offset: 2px;
}

.halo__matrix-node-wrap {
    display: grid;
    place-items: center;
}

.halo__matrix-node {
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 999px;
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
        inset 0 0 80px rgba(168, 85, 247, 0.18);
}

.halo__pad.is-style-matrix.is-off {
    border-color: transparent;
    box-shadow: none;
    background: transparent;
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
        background 220ms ease,
        box-shadow 220ms ease;
}

.halo__indicator.is-group-relative,
.halo__indicator-ghost.is-group-relative {
    width: 22px;
    height: 22px;
    border: 4px solid rgba(210, 255, 251, 0.98);
    border-radius: 8px;
    background: transparent;
    box-shadow:
        0 0 0 1px rgba(15, 23, 42, 0.08),
        0 0 14px rgba(72, 244, 230, 0.24),
        0 8px 18px rgba(15, 23, 42, 0.18);
}

.halo__indicator.is-group-relative::after,
.halo__indicator-ghost.is-group-relative::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 6px;
    height: 6px;
    border-radius: 1px;
    background: rgba(210, 255, 251, 0.98);
    transform: translate(-50%, -50%);
    box-shadow:
        -16px -16px 0 rgba(210, 255, 251, 0.98),
        16px -16px 0 rgba(210, 255, 251, 0.98),
        -16px 16px 0 rgba(210, 255, 251, 0.98),
        16px 16px 0 rgba(210, 255, 251, 0.98);
}

.halo__indicator.is-live {
    transition: box-shadow 220ms ease;
}

.halo__indicator--formation {
    appearance: none;
    -webkit-appearance: none;
    padding: 0;
    z-index: 2;
    opacity: 0.88;
    pointer-events: auto;
    cursor: grab;
}

.halo__indicator--formation:focus-visible {
    outline: 2px solid rgba(59, 130, 246, 0.9);
    outline-offset: 2px;
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

.halo__indicator-ghost.is-group-relative {
    opacity: 0.3;
    box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.08),
        0 0 8px rgba(72, 244, 230, 0.14);
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
        background 220ms ease,
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

.halo__group-indicator.is-muted {
    cursor: default;
    opacity: 0.38;
    filter: grayscale(1);
    box-shadow:
        0 0 0 1px rgba(15, 23, 42, 0.04),
        0 4px 8px rgba(15, 23, 42, 0.06);
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

.halo__disco-overlay--matrix::before {
    content: none;
}

.halo__disco-overlay::after {
    content: none;
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
    color: rgba(15, 23, 42, 0.92);
    text-align: center;
}

.halo__disco-overlay--matrix .halo__disco-message {
    text-shadow: 0 1px 10px rgba(255, 255, 255, 0.28);
}

.halo__disco-title {
    display: block;
    margin-bottom: 12px;
    font-size: 1.3rem;
    font-weight: 800;
    letter-spacing: 0.1em;
}

.halo__disco-copy {
    margin: 0;
    font-size: 1rem;
    line-height: 1.55;
    font-weight: 700;
    color: rgba(15, 23, 42, 0.88);
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
        --halo-pad-inset: 0px;
        --halo-pad-border-width: 0px;
        --halo-overlay-inset: 0px;
    }

    .halo__pad-shell.is-borderless-style {
        --halo-pad-inset: 0px;
        --halo-pad-border-width: 0px;
        --halo-overlay-inset: 0px;
    }

    .halo__indicator {
        width: 23px;
        height: 23px;
        border-width: 3px;
    }

    .halo__indicator.is-group-relative,
    .halo__indicator-ghost.is-group-relative {
        width: 19px;
        height: 19px;
        border-width: 3px;
        border-radius: 7px;
    }

    .halo__indicator.is-group-relative::after,
    .halo__indicator-ghost.is-group-relative::after {
        width: 5px;
        height: 5px;
        box-shadow:
            -13px -13px 0 rgba(210, 255, 251, 0.98),
            13px -13px 0 rgba(210, 255, 251, 0.98),
            -13px 13px 0 rgba(210, 255, 251, 0.98),
            13px 13px 0 rgba(210, 255, 251, 0.98);
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
        font-size: 1.08rem;
    }

    .halo__disco-copy {
        font-size: 0.92rem;
    }
}

@media (prefers-color-scheme: dark) {
    .halo__disco-message {
        color: #f8fafc;
    }

    .halo__disco-overlay--matrix .halo__disco-message {
        text-shadow: 0 1px 10px rgba(15, 23, 42, 0.4);
    }

    .halo__disco-copy {
        color: rgba(248, 250, 252, 0.96);
    }

    .halo__pad {
        background-color: rgba(26, 31, 38, 0.96);
        box-shadow: none;
    }

    .halo__pad::before {
        opacity: 0.18;
    }

    .halo__pad::after {
        background: none;
        box-shadow: none;
    }

    .halo__pad.is-off {
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

    .halo__group-indicator.is-muted {
        box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.03),
            0 4px 8px rgba(0, 0, 0, 0.1);
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
