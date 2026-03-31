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
                    background: `rgba(15, 23, 42, ${Math.max(0.1, 0.2 - popupDragOffset / 900)})`,
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
                    width: isMobilePopupViewport ? '100%' : 'min(100%, 560px)',
                    maxWidth: '100%',
                    height: isMobilePopupViewport ? `calc(100dvh - ${mobilePopupTopInset})` : undefined,
                    maxHeight: isMobilePopupViewport
                        ? `calc(100dvh - ${mobilePopupTopInset})`
                        : 'calc(100dvh - max(24px, min(48px, 8vw)))',
                    background:
                        'linear-gradient(180deg, color-mix(in srgb, var(--ha-card-background, var(--card-background-color, #ffffff)) 82%, white 18%) 0%, color-mix(in srgb, var(--ha-card-background, var(--card-background-color, #ffffff)) 76%, transparent 24%) 100%)',
                    borderRadius: isMobilePopupViewport ? '24px 24px 0 0' : '24px',
                    boxShadow:
                        '0 24px 64px rgba(15, 23, 42, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.18)',
                    border: '1px solid color-mix(in srgb, var(--divider-color, rgba(0, 0, 0, 0.08)) 38%, white 62%)',
                    borderBottom: isMobilePopupViewport
                        ? '0'
                        : '1px solid color-mix(in srgb, var(--divider-color, rgba(0, 0, 0, 0.08)) 38%, white 62%)',
                    padding: isMobilePopupViewport ? '12px 12px 0' : '16px 20px',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    overflowY: isMobilePopupViewport ? 'hidden' : 'auto',
                    overscrollBehavior: 'contain',
                    WebkitOverflowScrolling: 'touch',
                    backdropFilter: 'blur(24px) saturate(160%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(160%)',
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
