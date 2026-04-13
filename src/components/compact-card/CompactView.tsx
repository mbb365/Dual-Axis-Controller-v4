interface CompactViewProps {
    isDarkMode: boolean;
    lightName: string;
    isOn: boolean;
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
        >
            <button
                type="button"
                className={`dual-card__icon-shell dual-card__icon-button ${isOn ? 'is-on' : 'is-off'}`}
                aria-label={`${isOn ? 'Turn off' : 'Turn on'} ${lightName}`}
                aria-pressed={isOn}
                onPointerDown={onIconPointerDown}
                onPointerUp={(event) => event.stopPropagation()}
                onClick={onIconClick}
            >
                <ha-icon icon="mdi:power" className="dual-card__icon" />
            </button>
            <div className="dual-card__compact-main">
                <div className="dual-card__content">
                    <div className="dual-card__title">{lightName}</div>
                    <div className="dual-card__subtitle">{statusText}</div>
                </div>
            </div>
        </div>
    );
}
