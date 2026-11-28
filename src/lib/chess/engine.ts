// The 320-square royal-pawn variant cannot be represented by an 8×8 chess engine.
export type Side = 0 | 1 | 2 | 3;
export type Kind = 'P' | 'R' | 'N' | 'B' | 'Q' | 'K';
export type Piece = { side: Side; kind: Kind; moved: boolean; advanced?: boolean };
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
export const pawnRank = (side: Side, pos: number): number => {
 const [x,y]=xy(pos);
 return side===0 ? 24-y : side===1 ? x+1 : side===2 ? y+1 : 24-x;
};
export const advancedPawn = (piece: Piece, pos: number): boolean => piece.kind==='P' && (piece.advanced===true || pawnRank(piece.side,pos)>=9);
function pseudoDestinations(game: Game, from: number, attacks=false): number[] {
 const p = game.board[from]; if (!p || !game.alive.includes(p.side)) return [];
 const [x,y] = xy(from); const result: number[] = [];
 const add = (a: number,b: number) => {
  if (!valid(a,b)) return false;
  const q = game.board[key(a,b)];
  if (q?.side === p.side) return false;
  result.push(key(a,b)); return !q;
 };
 if (advancedPawn(p,from)) {
  for(const [dx,dy] of [...dirs,...diagonals]) add(x+dx,y+dy);
 } else if (p.kind === 'P') {
  const d = dirs[p.side]; if (!d) return [];
  const [dx,dy] = d;
  if (!attacks && valid(x+dx,y+dy) && !game.board[key(x+dx,y+dy)]) {
   result.push(key(x+dx,y+dy));
   if (!p.moved && valid(x+dx*2,y+dy*2) && !game.board[key(x+dx*2,y+dy*2)]) result.push(key(x+dx*2,y+dy*2));
  }
  for (const s of [-1,1]) {
   const a = x+dx+(dy ? s : 0), b = y+dy+(dx ? s : 0);
   const target = game.board[key(a,b)];
   if (valid(a,b) && (attacks || (target && target.side !== p.side))) result.push(key(a,b));
  }
 } else if (p.kind === 'N') {
  for (const [dx,dy] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]) if (dx !== undefined && dy !== undefined) add(x+dx,y+dy);
 } else {
  const rays = p.kind === 'B' ? diagonals : p.kind === 'R' ? dirs : [...dirs,...diagonals];
  for (const [dx,dy] of rays) for (let i=1; i <= (p.kind === 'K' ? 1 : 23); i++) if (!add(x+dx*i,y+dy*i)) break;
 }
 return result;
}
export function inCheck(game: Game, side: Side): boolean {
 const king=Object.entries(game.board).find(([,p])=>p.side===side && p.kind==='K');
 if(!king) return true;
 return Object.entries(game.board).some(([pos,p])=>p.side!==side && game.alive.includes(p.side) && pseudoDestinations(game,Number(pos),true).includes(Number(king[0])));
}
function movedGame(game: Game, move: Move): Game {
 const piece=game.board[move.from];
 if(!piece) throw new Error('Choose a piece.');
 const next: Game={...game,board:{...game.board},moves:[...game.moves]};
 delete next.board[move.from];
 const [x,y]=xy(move.to);
 const promotes=piece.kind==='P' && (piece.side===0 ? y===0 : piece.side===1 ? x===23 : piece.side===2 ? y===23 : x===0);
 const advanced=advancedPawn(piece,move.from) || (piece.kind==='P' && pawnRank(piece.side,move.to)>=9);
 next.board[move.to]={...piece,moved:true,...(advanced ? {advanced:true} : {}),kind:promotes ? (['Q','R','B','N'].includes(move.promotion ?? '') ? move.promotion ?? 'Q' : 'Q') : piece.kind};
 next.moves[piece.side]=(next.moves[piece.side] ?? 0)+1;
 spawnPawn(next,piece.side);
 return next;
}
export function destinations(game: Game, from: number): number[] {
 const piece=game.board[from];
 if(!piece || game.winner!==null) return [];
 return pseudoDestinations(game,from).filter(to=>game.board[to]?.kind!=='K' && !inCheck(movedGame(game,{from,to}),piece.side));
}
export function hasLegalMove(game: Game, side: Side): boolean {
 return Object.entries(game.board).some(([pos,p])=>p.side===side && destinations(game,Number(pos)).length>0);
}
export function advanceTurn(game: Game, after: Side): void {
 for(let i=1;i<=4;i++) {
  if(game.alive.length===1) {game.winner=game.alive[0] ?? null;return;}
  const side=((after+i)%4) as Side;
  if(!game.alive.includes(side)) continue;
  if(hasLegalMove(game,side)) {game.turn=side;return;}
  if(inCheck(game,side)) {
   game.alive=game.alive.filter(s=>s!==side);
   for(const [pos,p] of Object.entries(game.board)) if(p.side===side) delete game.board[pos];
   game.log=[...game.log,`${SIDES[side]} checkmated · Army eliminated`].slice(-100);
  }
 }
 if(game.alive.length===1) game.winner=game.alive[0] ?? null;
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
 const next = movedGame(game,move);
 const captured = game.board[move.to];
 let note = `${SIDES[piece.side]} ${piece.kind} ${square(move.from)} → ${square(move.to)}`;
 if (captured) note += ` × ${SIDES[captured.side]} ${captured.kind}`;
 const spawned=Object.keys(next.board).map(Number).find(pos=>pos!==move.to && (pos===move.from || !game.board[pos]) && next.board[pos]?.kind==='P') ?? null;
 if (spawned !== null) note += ` · Royal pawn at ${square(spawned)}`;
 next.log = [...next.log,note].slice(-100);
 if(next.alive.length===1) next.winner=next.alive[0] ?? null;
 advanceTurn(next,piece.side);
 if(next.winner===null && inCheck(next,next.turn)) next.log=[...next.log,`${SIDES[next.turn]} is in check`].slice(-100);
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
  if(Object.entries(board).some(([n,q])=>q.side!==p.side && pseudoDestinations(projected,Number(n),true).includes(to))) v-=values[p.kind]*8;
  if(v>score){score=v;best={from:Number(pos),to};}
 }
 return best;
}
