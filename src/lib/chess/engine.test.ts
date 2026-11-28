import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMove, destinations, home, key, newGame, spawnPawn, valid, type Side } from './engine';
import { authorizeHost, authorizeMove, type Room } from './rooms';
describe('four-way chess',()=>{
 test('five 8×8 boards have 320 squares and four complete armies',()=>{let count=0;for(let x=0;x<24;x++)for(let y=0;y<24;y++)if(valid(x,y))count++;assert.equal(count,320);assert.equal(Object.keys(newGame().board).length,64);});
 test('each army receives one pawn on its tenth own move with royals home',()=>{for(const s of [0,1,2,3] as Side[]){const g=newGame();delete g.board[home(s,0,1)];g.moves[s]=10;assert.equal(spawnPawn(g,s),home(s,0,1));assert.equal(g.board[home(s,0,1)]?.kind,'P');assert.equal(Object.values(g.board).filter(p=>p.side===s && p.kind==='P').length,8);}});
 test('nine moves cannot create a pawn',()=>{const g=newGame();delete g.board[home(0,0,1)];g.moves[0]=9;assert.equal(spawnPawn(g,0),null);});
 test('queen away prevents royal pawn creation',()=>{const g=newGame();delete g.board[home(0,0,1)];delete g.board[home(0,3)];g.moves[0]=10;assert.equal(spawnPawn(g,0),null);});
 test('king away prevents royal pawn creation',()=>{const g=newGame();delete g.board[home(0,0,1)];delete g.board[home(0,4)];g.moves[0]=10;assert.equal(spawnPawn(g,0),null);});
 test('full pawn row produces no reward',()=>{const g=newGame();g.moves[0]=10;assert.equal(spawnPawn(g,0),null);assert.equal(Object.keys(g.board).length,64);});
 test('actual tenth move spawns once and advances clockwise',()=>{const g=newGame();g.moves[0]=9;const n=applyMove(g,{from:home(0,0,1),to:home(0,0,2)});assert.equal(n.moves[0],10);assert.equal(n.board[home(0,0,1)]?.kind,'P');assert.equal(n.turn,1);assert.ok(n.log[0]?.includes('Royal pawn'));});
 test('rook cannot cross a missing corner',()=>{const g=newGame();g.board={};g.board[key(7,8)]={side:0,kind:'R',moved:true};assert.ok(!destinations(g,key(7,8)).includes(key(7,7)));});
 test('captured king eliminates its army',()=>{const g=newGame();g.board={};g.board[key(8,8)]={side:0,kind:'R',moved:true};g.board[key(8,9)]={side:1,kind:'K',moved:true};g.board[key(9,9)]={side:1,kind:'P',moved:true};const n=applyMove(g,{from:key(8,8),to:key(8,9)});assert.ok(!n.alive.includes(1));assert.equal(n.board[key(9,9)],undefined);});
 test('opponent cannot move another army',()=>{assert.throws(()=>applyMove(newGame(),{from:home(1,0,1),to:home(1,0,2)}));});
 test('online turn and host permissions reject strangers',()=>{const room:Room={id:'r',code:'ABCDEFGH',host_id:'host',members:['host'],seats:[{userId:'host',name:'Player',bot:false},null,null,null],state:newGame(),started:true,revision:0};assert.throws(()=>authorizeMove(room,'stranger'));assert.throws(()=>authorizeHost(room,'stranger'));assert.doesNotThrow(()=>authorizeMove(room,'host'));});
});
