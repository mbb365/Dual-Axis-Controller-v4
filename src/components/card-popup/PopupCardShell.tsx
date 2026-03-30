interface PopupCardShellProps {
    isMobilePopupViewport: boolean;
    mobilePopupTopInset: string;
    popupDragOffset: number;
    isPopupDragging: boolean;
    isPopupClosing: boolean;
    onClose: () => void;
    onDragStart: (event: React.PointerEvent<HTMLDivElement>) => void;
    onDragMove: (event: React.PointerEvent<HTMLDivElement>) => void;
    onDragEnd: (event: React.PointerEvent<HTMLDivElement>) => void;
    onHandleClick: (event: React.MouseEvent<HTMLDivElement>) => void;
    children: React.ReactNode;
}

export function PopupCardShell({
    isMobilePopupViewport,
    mobilePopupTopInset,
    popupDragOffset,
    isPopupDragging,
    isPopupClosing,
    onClose,
    onDragStart,
    onDragMove,
    onDragEnd,
    onHandleClick,
    children,
}: PopupCardShellProps) {
    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: `rgba(15, 23, 42, ${Math.max(0.08, 0.18 - popupDragOffset / 900)})`,
                display: 'grid',
                alignItems: isMobilePopupViewport ? 'end' : 'center',
                justifyItems: 'center',
                padding: isMobilePopupViewport ? `${mobilePopupTopInset} 0 0` : 'max(12px, min(24px, 4vw))',
                boxSizing: 'border-box',
                zIndex: 1000,
            }}
        >
            <div
                onClick={(event) => event.stopPropagation()}
                style={{
                    width: isMobilePopupViewport ? '100%' : 'min(100%, 460px)',
                    maxWidth: '100%',
                    height: isMobilePopupViewport ? `calc(100dvh - ${mobilePopupTopInset})` : undefined,
                    maxHeight: isMobilePopupViewport
                        ? `calc(100dvh - ${mobilePopupTopInset})`
                        : 'calc(100dvh - max(24px, min(48px, 8vw)))',
                    background: 'var(--ha-card-background, var(--card-background-color, #ffffff))',
                    borderRadius: isMobilePopupViewport ? '18px 18px 0 0' : 'var(--ha-card-border-radius, 12px)',
                    boxShadow: 'var(--ha-card-box-shadow, 0 8px 24px rgba(15, 23, 42, 0.16))',
                    border: '1px solid var(--divider-color, rgba(0, 0, 0, 0.08))',
                    borderBottom: isMobilePopupViewport ? '0' : '1px solid var(--divider-color, rgba(0, 0, 0, 0.08))',
                    padding: isMobilePopupViewport ? '12px 12px 0' : '14px',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    overflowY: isMobilePopupViewport ? 'hidden' : 'auto',
                    overscrollBehavior: 'contain',
                    WebkitOverflowScrolling: 'touch',
                    transform: `translateY(${popupDragOffset}px)`,
                    transition: isPopupDragging
                        ? 'none'
                        : `transform ${isPopupClosing ? '0.42s cubic-bezier(0.22, 1, 0.36, 1)' : '0.22s ease'}, box-shadow 0.22s ease`,
                }}
            >
                <div
                    onPointerDown={onDragStart}
                    onPointerMove={onDragMove}
                    onPointerUp={onDragEnd}
                    onPointerCancel={onDragEnd}
                    onClick={onHandleClick}
                    style={{
                        display: isMobilePopupViewport ? 'flex' : 'none',
                        justifyContent: 'center',
                        alignItems: 'center',
                        minHeight: '22px',
                        margin: '-2px 0 8px',
                        touchAction: 'none',
                        cursor: 'grab',
                    }}
                    aria-label="Drag down to close"
                >
                    <div
                        style={{
                            width: '42px',
                            height: '5px',
                            borderRadius: '999px',
                            background: 'rgba(143, 154, 168, 0.55)',
                        }}
                    />
                </div>
                {children}
            </div>
        </div>
    );
}
