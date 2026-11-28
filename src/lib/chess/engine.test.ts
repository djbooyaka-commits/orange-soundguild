import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { advancedPawn, applyMove, botMove, destinations, home, inCheck, key, newGame, pawnRank, spawnPawn, valid, type Game, type Side } from './engine';
import { authorizeHost, authorizeMove, type Room } from './rooms';
describe('four-way chess',()=>{
 test('five 8×8 boards have 320 squares and four complete armies',()=>{let count=0;for(let x=0;x<24;x++)for(let y=0;y<24;y++)if(valid(x,y))count++;assert.equal(count,320);assert.equal(Object.keys(newGame().board).length,64);});
 test('each army receives one pawn on its tenth own move with royals home',()=>{for(const s of [0,1,2,3] as Side[]){const g=newGame();delete g.board[home(s,0,1)];g.moves[s]=10;assert.equal(spawnPawn(g,s),home(s,0,1));assert.equal(g.board[home(s,0,1)]?.kind,'P');assert.equal(Object.values(g.board).filter(p=>p.side===s && p.kind==='P').length,8);}});
 test('nine moves cannot create a pawn',()=>{const g=newGame();delete g.board[home(0,0,1)];g.moves[0]=9;assert.equal(spawnPawn(g,0),null);});
 test('queen away prevents royal pawn creation',()=>{const g=newGame();delete g.board[home(0,0,1)];delete g.board[home(0,3)];g.moves[0]=10;assert.equal(spawnPawn(g,0),null);});
 test('king away prevents royal pawn creation',()=>{const g=newGame();delete g.board[home(0,0,1)];delete g.board[home(0,4)];g.moves[0]=10;assert.equal(spawnPawn(g,0),null);});
 test('full pawn row produces no reward',()=>{const g=newGame();g.moves[0]=10;assert.equal(spawnPawn(g,0),null);assert.equal(Object.keys(g.board).length,64);});
 test('actual tenth move spawns once and advances clockwise',()=>{const g=newGame();g.moves[0]=9;const n=applyMove(g,{from:home(0,0,1),to:home(0,0,2)});assert.equal(n.moves[0],10);assert.equal(n.board[home(0,0,1)]?.kind,'P');assert.equal(n.turn,1);assert.ok(n.log[0]?.includes('Royal pawn'));});
 test('rook cannot cross a missing corner',()=>{const g=newGame();g.board[key(7,8)]={side:0,kind:'R',moved:true};assert.ok(!destinations(g,key(7,8)).includes(key(7,7)));});
 test('kings cannot be captured',()=>{const g=newGame();g.board[key(8,8)]={side:0,kind:'R',moved:true};g.board[key(8,9)]={side:1,kind:'K',moved:true};assert.throws(()=>applyMove(g,{from:key(8,8),to:key(8,9)}));});
 test('opponent cannot move another army',()=>{assert.throws(()=>applyMove(newGame(),{from:home(1,0,1),to:home(1,0,2)}));});
 test('online turn and host permissions reject strangers',()=>{const room:Room={id:'r',code:'ABCDEFGH',host_id:'host',members:['host'],seats:[{userId:'host',name:'Player',bot:false},null,null,null],state:newGame(),started:true,revision:0};assert.throws(()=>authorizeMove(room,'stranger'));assert.throws(()=>authorizeHost(room,'stranger'));assert.doesNotThrow(()=>authorizeMove(room,'host'));});
});
function position(): Game {
 const g=newGame();g.board={};g.alive=[0,1];
 g.board[key(12,20)]={side:0,kind:'K',moved:true};
 g.board[key(8,8)]={side:1,kind:'K',moved:true};
 return g;
}
describe('check and ninth-rank pawns',()=>{
 test('check forces a response and bots choose a safe response',()=>{
  const g=position();g.board[key(12,15)]={side:1,kind:'R',moved:true};g.board[key(9,20)]={side:0,kind:'R',moved:true};
  assert.equal(inCheck(g,0),true);
  assert.throws(()=>applyMove(g,{from:key(9,20),to:key(9,19)}));
  const move=botMove(g);assert.ok(move);assert.equal(inCheck(applyMove(g,move),0),false);
 });
 test('blocking a check and capturing its attacker are legal',()=>{
  const g=position();g.board[key(12,15)]={side:1,kind:'R',moved:true};g.board[key(9,18)]={side:0,kind:'R',moved:true};
  assert.equal(inCheck(applyMove(g,{from:key(9,18),to:key(12,18)}),0),false);
  g.board[key(9,15)]={side:0,kind:'R',moved:true};
  assert.equal(inCheck(applyMove(g,{from:key(9,15),to:key(12,15)}),0),false);
 });
 test('pinned pieces cannot expose their king and kings cannot enter attack',()=>{
  const g=position();g.board[key(12,15)]={side:1,kind:'R',moved:true};g.board[key(12,18)]={side:0,kind:'R',moved:true};
  assert.ok(!destinations(g,key(12,18)).includes(key(13,18)));
  delete g.board[key(12,18)];
  assert.ok(!destinations(g,key(12,20)).includes(key(12,19)));
 });
 test('ordinary pawn diagonals attack empty squares but forward squares do not',()=>{
  const g=position();g.board={};g.board[key(9,6)]={side:0,kind:'K',moved:true};g.board[key(8,0)]={side:1,kind:'K',moved:true};g.board[key(9,5)]={side:2,kind:'P',moved:true};g.alive=[0,1,2];
  assert.equal(inCheck(g,0),false);
  assert.ok(!destinations(g,key(9,6)).includes(key(10,6)));
 });
 test('checkmate eliminates the army rather than capturing its king',()=>{
  const g=position();g.board={};g.board[key(8,0)]={side:1,kind:'K',moved:true};g.board[key(10,2)]={side:0,kind:'K',moved:true};g.board[key(9,2)]={side:0,kind:'Q',moved:true};
  const n=applyMove(g,{from:key(9,2),to:key(9,1)});
  assert.deepEqual(n.alive,[0]);assert.equal(n.winner,0);assert.equal(n.board[key(8,0)],undefined);
  assert.ok(n.log.some(line=>line.includes('Blue checkmated')));
 });
 test('ninth rank upgrades pawns for all four orientations with eight adjacent moves',()=>{
  for(const side of [0,1,2,3] as Side[]) {
   const g=newGame();const from=home(side,3,7),to=home(side,3,8);
   g.board[from]={side,kind:'P',moved:true};g.turn=side;
   assert.equal(pawnRank(side,from),8);assert.equal(pawnRank(side,to),9);
   assert.equal(advancedPawn(g.board[from],from),false);
   const n=applyMove(g,{from,to});const p=n.board[to];assert.ok(p);assert.equal(p.advanced,true);
   assert.equal(destinations(n,to).length,8);
   n.turn=side;const retreat=applyMove(n,{from:to,to:from});assert.equal(retreat.board[from]?.advanced,true);assert.equal(destinations(retreat,from).length,8);
  }
 });
 test('upgraded pawns capture sideways but cannot land on allies or jump',()=>{
  const g=position();g.board[key(12,15)]={side:0,kind:'P',moved:true,advanced:true};g.board[key(13,15)]={side:1,kind:'R',moved:true};g.board[key(11,15)]={side:0,kind:'R',moved:true};
  const targets=destinations(g,key(12,15));assert.ok(targets.includes(key(13,15)));assert.ok(!targets.includes(key(11,15)));assert.ok(!targets.includes(key(12,13)));
  assert.equal(applyMove(g,{from:key(12,15),to:key(13,15)}).board[key(13,15)]?.side,0);
 });
});
