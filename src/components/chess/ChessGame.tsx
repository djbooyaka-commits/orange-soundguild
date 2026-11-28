import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Copy, RotateCw, BookOpen, Bot, Users, Flag, RefreshCw } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { chessAction } from '@/lib/api/chess.functions';
import { mySide, type Room } from '@/lib/chess/rooms';
import { applyMove, botMove, destinations, newGame, royalHome, SIDES, square, valid, xy, type Game, type Kind, type Side } from '@/lib/chess/engine';
import { ChessPiece } from './Piece';
export function ChessGame({invite}:{invite:string}) {
 const {user,session}=useAuth();const queryClient=useQueryClient();const action=useServerFn(chessAction);
 const [solo,setSolo]=useState<Game>(newGame);const [soloStarted,setSoloStarted]=useState(false);
 const [roomId,setRoomId]=useState<string|null>(null);const [code,setCode]=useState(invite.toUpperCase());
 const [selected,setSelected]=useState<number|null>(null);const [view,setView]=useState<Side>(0);
 const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);const [promotion,setPromotion]=useState<Kind>('Q');
 const roomQuery=useQuery({queryKey:['chess-room',roomId,user?.id],queryFn:()=>action({data:{action:'read',id:roomId ?? ''}}),enabled:!!roomId && !!user,staleTime:10000,retry:1});
 const room=roomQuery.data;const game=room?.state ?? solo;
 const ownSide=room && user ? mySide(room,user.id) : 0;
 const playing=room ? room.started : soloStarted;
 const canMove=playing && !busy && game.winner===null && ownSide===game.turn;
 const targets=selected===null ? [] : destinations(game,selected);
 useEffect(()=>{setSelected(null);},[game.turn,game.log.length,roomId]);
 useEffect(()=>{
  if(roomId || !soloStarted || solo.winner!==null || solo.turn===0) return;
  const timer=setTimeout(()=>{const move=botMove(solo);if(move) setSolo(applyMove(solo,move));},450);
  return ()=>clearTimeout(timer);
 },[solo,soloStarted,roomId]);
 useEffect(()=>{
  if(!roomId || !session) return;
  let disposed=false;let channel:ReturnType<typeof supabase.channel>|null=null;let wasSubscribed=false;
  const refresh=()=>queryClient.invalidateQueries({queryKey:['chess-room',roomId]});
  void supabase.realtime.setAuth(session.access_token).then(()=>{
   if(disposed) return;
   channel=supabase.channel(`chess:${roomId}`,{config:{private:true}}).on('broadcast',{event:'changed'},()=>{void refresh();}).subscribe(status=>{
    if(status==='SUBSCRIBED') {
     const state=queryClient.getQueryState(['chess-room',roomId,user?.id]);
     if(wasSubscribed || (!state?.fetchStatus.includes('fetching') && Date.now()-(state?.dataUpdatedAt ?? 0)>10000)) void refresh();
     wasSubscribed=true;
    }
   });
  }).catch(()=>setNotice('Live connection interrupted. Use Refresh to reconnect.'));
  const onFocus=()=>{void refresh();};window.addEventListener('focus',onFocus);
  return ()=>{disposed=true;window.removeEventListener('focus',onFocus);if(channel) void supabase.removeChannel(channel);};
 },[roomId,session?.access_token,queryClient,user?.id]);
 async function send(data:Parameters<typeof action>[0]['data']) {
  setBusy(true);setNotice('');
  try {
   const result=await action({data});setRoomId(result.id);
   queryClient.setQueryData(['chess-room',result.id,user?.id],result);
   if(!roomId && user) setView(mySide(result,user.id) ?? 0);
   const url=new URL(window.location.href);url.searchParams.set('room',result.code);window.history.replaceState(null,'',url);
  } catch(e){setNotice(e instanceof Error ? e.message : 'Could not update the game.');if(roomId) void roomQuery.refetch();}
  finally{setBusy(false);}
 }
 function click(n:number) {
  if(!canMove)return;
  const p=game.board[n];
  if(selected!==null && targets.includes(n)) {
   if(room) void send({action:'move',id:room.id,from:selected,to:n,promotion:promotion as 'Q'|'R'|'B'|'N'});
   else setSolo(applyMove(game,{from:selected,to:n,promotion}));
   setSelected(null);
  } else setSelected(p?.side===ownSide ? n : null);
 }
 function startSolo(){setRoomId(null);setSolo(newGame());setSoloStarted(true);setView(0);setNotice('');setSelected(null);const url=new URL(window.location.href);url.searchParams.delete('room');window.history.replaceState(null,'',url);}
 const status=game.winner!==null ? `${SIDES[game.winner]} wins` : !playing ? (room ? 'Waiting for the host' : 'Four armies. One battlefield.') : `${SIDES[game.turn]} to move${game.turn!==ownSide && !room ? ' · Bot thinking' : ''}`;
 return <><Navbar/><main className="chess-page mx-auto max-w-7xl px-3 py-6 sm:px-6">
  <header className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Orange Sound Guild · Games</p><h1 className="mt-1 font-serif text-4xl font-bold">4-Way Chess</h1></div><div className="flex gap-2">
   <Button variant="outline" size="icon" title="Rotate board" aria-label="Rotate board" onClick={()=>setView(((view+1)%4) as Side)}><RotateCw className="h-4 w-4"/></Button>
   <Dialog><DialogTrigger asChild><Button variant="outline"><BookOpen className="mr-2 h-4 w-4"/>Rules</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Four-way royal chess</DialogTitle></DialogHeader><ul className="space-y-3 text-sm leading-relaxed"><li>Four armies play clockwise: Red, Blue, Gold, Green, across five joined 8×8 boards.</li><li>Free-for-all: capture a king to eliminate its army. The last king wins. Kings may enter danger; this is king-capture chess, not checkmate chess.</li><li>Pieces move normally across connected squares. Pawns head toward the opposite edge, where they promote to your chosen piece. Castling and en passant are not used.</li><li><strong>Royal pawn:</strong> after each army’s 10th, 20th, 30th… move, if its own king and queen are on their original squares, one pawn appears on the first empty square of its original pawn row. No empty square or either royal away means no reward that time; rewards do not accumulate. Returning royals qualify again. New pawns move one square, not two.</li><li>Immobile armies skip their turn. Online rooms start with bots in unfilled seats.</li></ul></DialogContent></Dialog>
  </div></header>
  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
   <section className="min-w-0"><div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b pb-3"><h2 className={`font-semibold chess-side-${game.turn}`}>{status}</h2><span className="text-xs text-muted-foreground">{room ? `Room ${room.code}` : 'Solo · 3 bots'}</span></div>
   <div className="chess-board-scroll"><div className={`chess-board chess-view-${view}`} role="group" aria-label="Four-player chess board">
    {Array.from({length:576},(_,n)=>{const [x,y]=xy(n);if(!valid(x,y))return <div key={n} className="chess-void"/>;const p=game.board[n];return <Button key={n} variant="ghost" className={`chess-square ${(x+y)%2 ? 'chess-dark':'chess-light'} ${selected===n ? 'chess-selected':''} ${targets.includes(n) ? 'chess-target':''}`} aria-label={`${square(n)}${p ? ` ${SIDES[p.side]} ${p.kind}`:''}`} aria-pressed={selected===n} onClick={()=>click(n)}><span className={`chess-man chess-side-${p?.side ?? 0}`}>{p && <ChessPiece kind={p.kind}/>}</span>{targets.includes(n) && !p && <span className="chess-dot"/>}</Button>;})}
   </div></div><p className="mt-3 text-center text-xs text-muted-foreground">{SIDES[view]} kingdom</p>
   </section>
   <aside className="min-w-0 space-y-6">
    <section><h2 className="mb-3 font-serif text-xl font-semibold">The table</h2><div className="space-y-2">{SIDES.map((name,i)=>{const seat=room?.seats[i];return <div key={name} className={`chess-seat chess-side-${i} ${game.turn===i && playing ? 'chess-seat-active':''}`}><div className="flex items-center justify-between gap-2"><strong>{name}</strong><span className="text-xs text-muted-foreground">{room ? (seat?.bot ? 'Bot' : seat ? (seat.userId===user?.id ? 'You':'Player'):'Open seat') : i===0 ? 'You':'Bot'}</span></div><div className="mt-1 flex items-center justify-between text-xs text-muted-foreground"><span>{game.alive.includes(i as Side) ? `${game.moves[i] ?? 0} moves`:'Eliminated'}</span><span>{royalHome(game,i as Side) ? `Royal pawn in ${10-((game.moves[i] ?? 0)%10)}`:'Royals away'}</span></div>{room && !room.started && room.host_id===user?.id && !seat?.userId && <Button size="sm" variant="ghost" className="mt-1 h-7 text-xs" disabled={busy} onClick={()=>void send({action:'bot',id:room.id,seat:i})}><Bot className="mr-1 h-3 w-3"/>{seat?.bot?'Open seat':'Add bot'}</Button>}</div>;})}</div></section>
    <section className="space-y-3 border-t pt-4"><Button className="w-full" onClick={startSolo}><Bot className="mr-2 h-4 w-4"/>{soloStarted ? 'New solo game':'Play vs bots'}</Button>
     {room ? <><div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={()=>{void navigator.clipboard.writeText(`${window.location.origin}/games/4-way-chess?room=${room.code}`).then(()=>setNotice('Invite link copied.')).catch(()=>setNotice(`Room code: ${room.code}`));}}><Copy className="mr-2 h-4 w-4"/>Invite</Button><Button variant="outline" size="icon" aria-label="Refresh room" title="Refresh room" onClick={()=>void roomQuery.refetch()}><RefreshCw className="h-4 w-4"/></Button></div>{!room.started && room.host_id===user?.id && <Button className="w-full" disabled={busy} onClick={()=>void send({action:'start',id:room.id})}>Start game</Button>}{room.started && ownSide!==null && game.alive.includes(ownSide) && game.winner===null && <Button variant="outline" className="w-full" disabled={busy} onClick={()=>{if(window.confirm('Resign and remove your army?'))void send({action:'resign',id:room.id});}}><Flag className="mr-2 h-4 w-4"/>Resign</Button>}</> : <><Button variant="outline" className="w-full" disabled={busy || !user} onClick={()=>void send({action:'create'})}><Users className="mr-2 h-4 w-4"/>Create online room</Button><div className="flex gap-2"><Input aria-label="Room code" placeholder="Room code" maxLength={8} value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/><Button variant="secondary" disabled={busy || !user || code.length!==8} onClick={()=>void send({action:'join',code})}>Join</Button></div>{!user && <p className="text-sm text-muted-foreground">Sign in to play online.</p>}</>}
     {busy && <p className="text-sm text-muted-foreground">Updating room…</p>}{(notice || roomQuery.error) && <p role="status" className="text-sm text-primary">{notice || roomQuery.error?.message}</p>}
     <label className="block text-xs text-muted-foreground" htmlFor="chess-promotion">Pawn promotion</label><select id="chess-promotion" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={promotion} onChange={e=>setPromotion(e.target.value as Kind)}><option value="Q">Queen</option><option value="R">Rook</option><option value="B">Bishop</option><option value="N">Knight</option></select>
    </section>
    <section className="border-t pt-4"><h2 className="mb-3 font-serif text-xl font-semibold">Moves</h2><ol className="max-h-56 space-y-2 overflow-y-auto text-xs text-muted-foreground" aria-label="Move history">{[...game.log].reverse().map((line,i)=><li key={`${game.log.length-i}-${line}`}>{line}</li>)}</ol>{!game.log.length && <p className="text-sm text-muted-foreground">No moves yet</p>}</section>
   </aside>
  </div>
 </main></>;
}
