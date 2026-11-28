/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import { applyMove, destinations, home, key, newGame, spawnPawn, valid, type Side } from './engine';
import { authorizeHost, authorizeMove, type Room } from './rooms';
describe('four-way chess',()=>{
 test('five 8×8 boards have 320 squares and four complete armies',()=>{let count=0;for(let x=0;x<24;x++)for(let y=0;y<24;y++)if(valid(x,y))count++;expect(count).toBe(320);expect(Object.keys(newGame().board)).toHaveLength(64);});
 test('each army receives one pawn on its tenth own move with royals home',()=>{for(const s of [0,1,2,3] as Side[]){const g=newGame();delete g.board[home(s,0,1)];g.moves[s]=10;expect(spawnPawn(g,s)).toBe(home(s,0,1));expect(g.board[home(s,0,1)]?.kind).toBe('P');expect(Object.values(g.board).filter(p=>p.side===s && p.kind==='P')).toHaveLength(8);}});
 test('nine moves cannot create a pawn',()=>{const g=newGame();delete g.board[home(0,0,1)];g.moves[0]=9;expect(spawnPawn(g,0)).toBeNull();});
 test('queen away prevents royal pawn creation',()=>{const g=newGame();delete g.board[home(0,0,1)];delete g.board[home(0,3)];g.moves[0]=10;expect(spawnPawn(g,0)).toBeNull();});
 test('king away prevents royal pawn creation',()=>{const g=newGame();delete g.board[home(0,0,1)];delete g.board[home(0,4)];g.moves[0]=10;expect(spawnPawn(g,0)).toBeNull();});
 test('full pawn row produces no reward',()=>{const g=newGame();g.moves[0]=10;expect(spawnPawn(g,0)).toBeNull();expect(Object.keys(g.board)).toHaveLength(64);});
 test('actual tenth move spawns once and advances clockwise',()=>{const g=newGame();g.moves[0]=9;const n=applyMove(g,{from:home(0,0,1),to:home(0,0,2)});expect(n.moves[0]).toBe(10);expect(n.board[home(0,0,1)]?.kind).toBe('P');expect(n.turn).toBe(1);expect(n.log[0]).toContain('Royal pawn');});
 test('rook cannot cross a missing corner',()=>{const g=newGame();g.board={};g.board[key(7,8)]={side:0,kind:'R',moved:true};expect(destinations(g,key(7,8))).not.toContain(key(7,7));});
 test('captured king eliminates its army',()=>{const g=newGame();g.board={};g.board[key(8,8)]={side:0,kind:'R',moved:true};g.board[key(8,9)]={side:1,kind:'K',moved:true};g.board[key(9,9)]={side:1,kind:'P',moved:true};const n=applyMove(g,{from:key(8,8),to:key(8,9)});expect(n.alive).not.toContain(1);expect(n.board[key(9,9)]).toBeUndefined();});
 test('opponent cannot move another army',()=>{expect(()=>applyMove(newGame(),{from:home(1,0,1),to:home(1,0,2)})).toThrow();});
 test('online turn and host permissions reject strangers',()=>{const room:Room={id:'r',code:'ABCDEFGH',host_id:'host',members:['host'],seats:[{userId:'host',name:'Player',bot:false},null,null,null],state:newGame(),started:true,revision:0};expect(()=>authorizeMove(room,'stranger')).toThrow();expect(()=>authorizeHost(room,'stranger')).toThrow();expect(()=>authorizeMove(room,'host')).not.toThrow();});
});
