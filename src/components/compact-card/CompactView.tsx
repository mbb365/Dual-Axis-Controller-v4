interface CompactViewProps {
    isDarkMode: boolean;
    lightName: string;
    isOn: boolean;
    compactBackground: string;
    iconBackground: string;
    iconForeground: string;
    statusText: string;
    onPointerDown: () => void;
    onPointerUp: () => void;
    onPointerLeave: () => void;
    onPointerCancel: () => void;
    onClick: () => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
    onIconPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
    onIconClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
    hasTapAction: boolean;
}

export function CompactView({
    isDarkMode,
    lightName,
    isOn,
    compactBackground,
    iconBackground,
    iconForeground,
    statusText,
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    onClick,
    onKeyDown,
    onIconPointerDown,
    onIconClick,
    hasTapAction,
}: CompactViewProps) {
    return (
        <div
            className={`dual-card dual-card--compact${isDarkMode ? ' dual-card--theme-dark' : ''}`}
            role={hasTapAction ? 'button' : undefined}
            tabIndex={hasTapAction ? 0 : -1}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
            onPointerCancel={onPointerCancel}
            onClick={onClick}
            onKeyDown={onKeyDown}
            style={{
                background: compactBackground,
                color: 'var(--primary-text-color, #111827)',
            }}
        >
            <button
                type="button"
                className="dual-card__icon-shell dual-card__icon-button"
                aria-label={`${isOn ? 'Turn off' : 'Turn on'} ${lightName}`}
                aria-pressed={isOn}
                onPointerDown={onIconPointerDown}
                onPointerUp={(event) => event.stopPropagation()}
                onClick={onIconClick}
                style={{
                    background: iconBackground,
                    color: iconForeground,
                }}
            >
                <ha-icon icon="mdi:power" className="dual-card__icon" />
            </button>
            <div className="dual-card__content">
                <div className="dual-card__title">{lightName}</div>
                <div className="dual-card__subtitle">{statusText}</div>
            </div>
        </div>
    );
}
