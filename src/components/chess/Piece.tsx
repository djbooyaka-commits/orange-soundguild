import type { Kind } from '@/lib/chess/engine';
// Custom, sharply outlined chessmen remain legible on the unusually large board.
export function ChessPiece({kind}:{kind:Kind}) {
 return <svg viewBox="0 0 40 44" aria-hidden="true" className="chess-piece"><g fill="currentColor" stroke="var(--chess-piece-outline)" strokeWidth="1.4" strokeLinejoin="round">
 {kind==='P' && <><circle cx="20" cy="12" r="6"/><path d="M16 18h8l2 12H14z"/></>}
 {kind==='R' && <path d="M10 7h5v5h3V7h4v5h3V7h5v12l-5 3v10H15V22l-5-3z"/>}
 {kind==='N' && <><path d="M12 32l1-12-6 3-1-6L18 7l1-4 8 8 3 21z"/><circle cx="17" cy="14" r="1.5" fill="var(--chess-piece-outline)"/></>}
 {kind==='B' && <><path d="M20 4c-12 10-12 17-3 20l-4 8h14l-4-8c9-3 9-10-3-20z"/><path d="M23 10l-5 7" fill="none"/></>}
 {kind==='Q' && <><path d="M9 11l7 7 4-10 4 10 7-7-5 21H14z"/><circle cx="9" cy="9" r="2.5"/><circle cx="20" cy="6" r="2.5"/><circle cx="31" cy="9" r="2.5"/></>}
 {kind==='K' && <><path d="M18 3h4v5h5v4h-5v5h-4v-5h-5V8h5z"/><path d="M12 19q8-7 16 0l-4 13h-8z"/></>}
 <path d="M12 32h16v4H12zM9 37h22v4H9z"/></g></svg>;
}
