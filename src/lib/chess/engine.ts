// The 320-square royal-pawn variant cannot be represented by an 8×8 chess engine.
export type Side = 0 | 1 | 2 | 3;
export type Kind = 'P' | 'R' | 'N' | 'B' | 'Q' | 'K';
export type Piece = { side: Side; kind: Kind; moved: boolean };
export type Move = { from: number; to: number; promotion?: Kind };
export type Game = { board: Record<string, Piece>; turn: Side; moves: number[]; alive: Side[]; log: string[]; winner: Side | null };
export const SIDES = ['Red', 'Blue', 'Gold', 'Green'];
export const key = (x: number, y: number) => y * 24 + x;
export const xy = (n: number) => [n % 24, Math.floor(n / 24)] as const;
export const valid = (x: number, y: number) => x >= 0 && x < 24 && y >= 0 && y < 24 && ((x >= 8 && x < 16) || (y >= 8 && y < 16));
export function home(side: Side, file: number, rank = 0): number {
 if (side === 0) return key(8 + file, 23 - rank);
 if (side === 1) return key(rank, 8 + file);
 if (side === 2) return key(15 - file, rank);
 return key(23 - rank, 15 - file);
}
export function newGame(): Game {
 const board: Game['board'] = {};
 const order: Kind[] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
 for (const side of [0, 1, 2, 3] as Side[]) for (let f = 0; f < 8; f++) {
  const kind = order[f];
  if (kind) board[home(side, f)] = { side, kind, moved: false };
  board[home(side, f, 1)] = { side, kind: 'P', moved: false };
 }
 return { board, turn: 0, moves: [0, 0, 0, 0], alive: [0, 1, 2, 3], log: [], winner: null };
}
const dirs = [[0,-1],[1,0],[0,1],[-1,0]] as const;
const diagonals = [[1,1],[1,-1],[-1,1],[-1,-1]] as const;
export function destinations(game: Game, from: number): number[] {
 const p = game.board[from]; if (!p || !game.alive.includes(p.side)) return [];
 const [x,y] = xy(from); const result: number[] = [];
 const add = (a: number,b: number) => {
  if (!valid(a,b)) return false;
  const q = game.board[key(a,b)];
  if (q?.side === p.side) return false;
  result.push(key(a,b)); return !q;
 };
 if (p.kind === 'P') {
  const d = dirs[p.side]; if (!d) return [];
  const [dx,dy] = d;
  if (valid(x+dx,y+dy) && !game.board[key(x+dx,y+dy)]) {
   result.push(key(x+dx,y+dy));
   if (!p.moved && valid(x+dx*2,y+dy*2) && !game.board[key(x+dx*2,y+dy*2)]) result.push(key(x+dx*2,y+dy*2));
  }
  for (const s of [-1,1]) {
   const a = x+dx+(dy ? s : 0), b = y+dy+(dx ? s : 0);
   const target = game.board[key(a,b)];
   if (valid(a,b) && target && target.side !== p.side) result.push(key(a,b));
  }
 } else if (p.kind === 'N') {
  for (const [dx,dy] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]) if (dx !== undefined && dy !== undefined) add(x+dx,y+dy);
 } else {
  const rays = p.kind === 'B' ? diagonals : p.kind === 'R' ? dirs : [...dirs,...diagonals];
  for (const [dx,dy] of rays) for (let i=1; i <= (p.kind === 'K' ? 1 : 23); i++) if (!add(x+dx*i,y+dy*i)) break;
 }
 return result;
}
export function royalHome(game: Game, side: Side): boolean {
 const k = game.board[home(side,4)], q = game.board[home(side,3)];
 return k?.side === side && k.kind === 'K' && q?.side === side && q.kind === 'Q';
}
export function spawnPawn(game: Game, side: Side): number | null {
 if (!royalHome(game,side) || !game.moves[side] || (game.moves[side] ?? 0) % 10 !== 0) return null;
 for (let f=0;f<8;f++) {
  const pos=home(side,f,1);
  if (!game.board[pos]) { game.board[pos]={side,kind:'P',moved:true}; return pos; }
 }
 return null;
}
export function applyMove(game: Game, move: Move): Game {
 const piece = game.board[move.from];
 if (game.winner !== null || !piece || piece.side !== game.turn || !destinations(game,move.from).includes(move.to)) throw new Error('That move is not allowed.');
 const next: Game = structuredClone(game);
 const captured = next.board[move.to]; delete next.board[move.from];
 const [x,y] = xy(move.to);
 const promotes = piece.kind === 'P' && (piece.side === 0 ? y === 0 : piece.side === 1 ? x === 23 : piece.side === 2 ? y === 23 : x === 0);
 next.board[move.to] = { ...piece, moved:true, kind: promotes ? (['Q','R','B','N'].includes(move.promotion ?? '') ? move.promotion ?? 'Q' : 'Q') : piece.kind };
 let note = `${SIDES[piece.side]} ${piece.kind} ${square(move.from)} → ${square(move.to)}`;
 if (captured) note += ` × ${SIDES[captured.side]} ${captured.kind}`;
 if (captured?.kind === 'K') {
  next.alive = next.alive.filter(s=>s!==captured.side);
  for (const [pos,p] of Object.entries(next.board)) if(p.side === captured.side) delete next.board[pos];
 }
 next.moves[piece.side] = (next.moves[piece.side] ?? 0)+1;
 const spawned = spawnPawn(next,piece.side);
 if (spawned !== null) note += ` · Royal pawn at ${square(spawned)}`;
 next.log = [...next.log,note].slice(-100);
 if(next.alive.length===1) next.winner=next.alive[0] ?? null;
 // Immobile armies skip a turn; no conventional checkmate in king-capture chess.
 for(let i=1;i<=4;i++) {
  const s=((piece.side+i)%4) as Side;
  if(next.alive.includes(s) && Object.entries(next.board).some(([n,p])=>p.side===s && destinations(next,Number(n)).length)) {next.turn=s;break;}
 }
 return next;
}
export const square = (n:number) => { const [x,y]=xy(n); return `${String.fromCharCode(97+x)}${24-y}`; };
export function botMove(game: Game): Move | null {
 const values: Record<Kind,number>={P:1,N:3,B:3,R:5,Q:9,K:1000};
 let best: Move|null=null, score=-Infinity;
 for(const [pos,p] of Object.entries(game.board)) if(p.side===game.turn) for(const to of destinations(game,Number(pos))) {
  const target=game.board[to]; const [x,y]=xy(to);
  let v=(target ? values[target.kind]*20 : 0)+(12-Math.abs(x-11.5)-Math.abs(y-11.5))*0.2+Math.random()*0.5;
  const board={...game.board};delete board[pos];board[to]=p;
  const projected={...game,board};
  if(Object.entries(board).some(([n,q])=>q.side!==p.side && destinations(projected,Number(n)).includes(to))) v-=values[p.kind]*8;
  if(v>score){score=v;best={from:Number(pos),to};}
 }
 return best;
}
