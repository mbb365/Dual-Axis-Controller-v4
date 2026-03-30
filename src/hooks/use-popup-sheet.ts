import { useCallback, useEffect, useRef, useState } from 'react';

export function usePopupSheet(
    isOpen: boolean,
    setIsOpen: (nextOpen: boolean) => void
) {
    const [popupDragOffset, setPopupDragOffset] = useState(0);
    const [isPopupDragging, setIsPopupDragging] = useState(false);
    const [isPopupClosing, setIsPopupClosing] = useState(false);
    const popupDragStartY = useRef<number | null>(null);
    const popupDragPointerId = useRef<number | null>(null);
    const popupDragLastY = useRef<number | null>(null);
    const popupDragLastAt = useRef<number | null>(null);
    const popupDragMoved = useRef(false);
    const popupCloseTimeout = useRef<number | null>(null);

    const isMobilePreviewRoute =
        typeof window !== 'undefined' &&
        (window.location.pathname.endsWith('/mobile.html') || window.location.pathname === '/mobile.html');
    const isMobilePopupViewport = typeof window !== 'undefined' ? isMobilePreviewRoute || window.innerWidth <= 640 : false;
    const mobilePopupTopInset = 'calc(env(safe-area-inset-top, 0px) + 56px)';

    const closePopup = useCallback(() => {
        setIsOpen(false);
        setPopupDragOffset(0);
        setIsPopupDragging(false);
        setIsPopupClosing(false);
        popupDragStartY.current = null;
        popupDragPointerId.current = null;
        popupDragLastY.current = null;
        popupDragLastAt.current = null;
        popupDragMoved.current = false;
        if (popupCloseTimeout.current) {
            window.clearTimeout(popupCloseTimeout.current);
            popupCloseTimeout.current = null;
        }
    }, [setIsOpen]);

    const animatePopupClose = useCallback((startingOffset: number) => {
        const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
        const targetOffset = Math.max(viewportHeight, startingOffset + 240);

        setIsPopupDragging(false);
        setIsPopupClosing(true);
        setPopupDragOffset(startingOffset);

        if (popupCloseTimeout.current) {
            window.clearTimeout(popupCloseTimeout.current);
        }

        window.requestAnimationFrame(() => {
            setPopupDragOffset(targetOffset);
        });

        popupCloseTimeout.current = window.setTimeout(() => {
            closePopup();
        }, 420);
    }, [closePopup]);

    const handlePopupDragStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!isMobilePopupViewport) return;

        if (popupCloseTimeout.current) {
            window.clearTimeout(popupCloseTimeout.current);
            popupCloseTimeout.current = null;
        }

        popupDragStartY.current = event.clientY;
        popupDragPointerId.current = event.pointerId;
        popupDragLastY.current = event.clientY;
        popupDragLastAt.current = performance.now();
        popupDragMoved.current = false;
        setIsPopupDragging(true);
        setIsPopupClosing(false);
        setPopupDragOffset(0);
        event.currentTarget.setPointerCapture(event.pointerId);
    }, [isMobilePopupViewport]);

    const handlePopupDragMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (popupDragPointerId.current !== event.pointerId || popupDragStartY.current == null) return;

        const nextOffset = Math.max(0, event.clientY - popupDragStartY.current);
        if (nextOffset > 6) {
            popupDragMoved.current = true;
        }
        popupDragLastY.current = event.clientY;
        popupDragLastAt.current = performance.now();
        setPopupDragOffset(nextOffset);
    }, []);

    const handlePopupDragEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (popupDragPointerId.current !== event.pointerId || popupDragStartY.current == null) return;

        const finalOffset = Math.max(0, event.clientY - popupDragStartY.current);
        const now = performance.now();
        const lastY = popupDragLastY.current ?? event.clientY;
        const lastAt = popupDragLastAt.current ?? now;
        const deltaY = event.clientY - lastY;
        const deltaTime = Math.max(1, now - lastAt);
        const velocityPxPerMs = deltaY / deltaTime;
        const shouldClose = finalOffset > 88 || velocityPxPerMs > 0.55;
        popupDragStartY.current = null;
        popupDragPointerId.current = null;
        popupDragLastY.current = null;
        popupDragLastAt.current = null;

        if (shouldClose) {
            animatePopupClose(finalOffset);
        } else {
            setIsPopupDragging(false);
            setIsPopupClosing(false);
            setPopupDragOffset(0);
        }

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }, [animatePopupClose]);

    const handlePopupHandleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        event.stopPropagation();
        if (!isMobilePopupViewport) return;

        if (popupDragMoved.current) {
            popupDragMoved.current = false;
            return;
        }

        animatePopupClose(Math.max(18, popupDragOffset));
    }, [animatePopupClose, isMobilePopupViewport, popupDragOffset]);

    useEffect(() => {
        if (!isOpen) {
            setPopupDragOffset(0);
            setIsPopupDragging(false);
            setIsPopupClosing(false);
            popupDragStartY.current = null;
            popupDragPointerId.current = null;
            popupDragLastY.current = null;
            popupDragLastAt.current = null;
            popupDragMoved.current = false;
            if (popupCloseTimeout.current) {
                window.clearTimeout(popupCloseTimeout.current);
                popupCloseTimeout.current = null;
            }
        }
    }, [isOpen]);

    useEffect(() => {
        return () => {
            if (popupCloseTimeout.current) {
                window.clearTimeout(popupCloseTimeout.current);
                popupCloseTimeout.current = null;
            }
        };
    }, []);

    return {
        closePopup,
        handlePopupDragEnd,
        handlePopupDragMove,
        handlePopupDragStart,
        handlePopupHandleClick,
        isMobilePopupViewport,
        isPopupClosing,
        isPopupDragging,
        mobilePopupTopInset,
        popupDragOffset,
    };
}
