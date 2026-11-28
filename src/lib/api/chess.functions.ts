import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { applyMove, botMove, newGame } from '@/lib/chess/engine';
import { authorizeHost, authorizeMove, type Room } from '@/lib/chess/rooms';
import type { Json } from '@/integrations/supabase/types';
const schema=z.object({action:z.enum(['create','join','read','start','bot','move','resign']),code:z.string().regex(/^[A-Z0-9]{8}$/).optional(),id:z.string().uuid().optional(),seat:z.number().int().min(0).max(3).optional(),from:z.number().int().min(0).max(575).optional(),to:z.number().int().min(0).max(575).optional(),promotion:z.enum(['Q','R','B','N']).optional()});
export const chessAction=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(schema).handler(async({data,context})=>{
 const userId=context.userId;
 if(data.action==='read') {
  if(!data.id) throw new Error('Room required.');
  const {data:row,error}=await context.supabase.from('four_way_chess_rooms').select('*').eq('id',data.id).single();
  if(error || !row) throw new Error('Room not found or you have not joined.');
  return row as unknown as Room;
 }
 // Privileged matchmaking/board writes: authenticated caller, then independent membership/seat checks before mutation.
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const name='Player';
 if(data.action==='create') {
  const seats=[{userId,name,bot:false},null,null,null];
  const code=crypto.randomUUID().replaceAll('-','').slice(0,8).toUpperCase();
  const {data:row,error}=await supabaseAdmin.from('four_way_chess_rooms').insert({code,host_id:userId,members:[userId],seats:seats as Json,state:newGame() as unknown as Json}).select('*').single();
  if(error || !row) throw new Error('Could not create room.');
  return row as unknown as Room;
 }
 if(data.action==='join' && !data.code) throw new Error('Enter the eight-character room code.');
 if(data.action!=='join' && !data.id) throw new Error('Room required.');
 const query=supabaseAdmin.from('four_way_chess_rooms').select('*');
 const {data:row,error}=await (data.action==='join' ? query.eq('code',data.code ?? '') : query.eq('id',data.id ?? '')).single();
 if(error || !row) throw new Error('Room not found.');
 const room=row as unknown as Room;
 if(data.action==='join') {
  if(room.members.includes(userId)) return room;
  if(room.started) throw new Error('This game has already started.');
  const index=room.seats.findIndex(s=>s===null);
  if(index<0) throw new Error('Room is full.');
  room.seats[index]={userId,name,bot:false};room.members.push(userId);
 } else {
  if(!room.members.includes(userId)) throw new Error('Join this room first.');
  if(data.action==='start' || data.action==='bot') {
   authorizeHost(room,userId);
   if(room.started) throw new Error('Game already started.');
   if(data.action==='bot') {
    if(data.seat===undefined || room.seats[data.seat]?.userId) throw new Error('Choose an empty or bot seat.');
    room.seats[data.seat]=room.seats[data.seat]?.bot ? null : {userId:null,name:'Bot',bot:true};
   } else {room.seats=room.seats.map(s=>s ?? {userId:null,name:'Bot',bot:true});room.started=true;}
  } else if(data.action==='move') {
   authorizeMove(room,userId);
   if(data.from===undefined || data.to===undefined) throw new Error('Choose a piece and destination.');
   room.state=applyMove(room.state,{from:data.from,to:data.to,...(data.promotion ? {promotion:data.promotion} : {})});
  } else if(data.action==='resign') {
   const side=room.seats.findIndex(s=>s?.userId===userId);
   if(!room.started || side<0 || !room.state.alive.includes(side as 0|1|2|3)) throw new Error('No active army to resign.');
   for(const [pos,p] of Object.entries(room.state.board)) if(p.side===side) delete room.state.board[pos];
   room.state.alive=room.state.alive.filter(s=>s!==side);
   room.state.log.push(`Player ${side+1} resigned`);
   if(room.state.alive.length===1) room.state.winner=room.state.alive[0] ?? null;
   if(room.state.turn===side) room.state.turn=room.state.alive.find(s=>s>side) ?? room.state.alive[0] ?? 0;
  }
 }
 // Bots advance on the authoritative server, never by accepting client board snapshots.
 for(let i=0;i<16 && room.started && room.state.winner===null && room.seats[room.state.turn]?.bot;i++) {
  const move=botMove(room.state);if(!move) break;room.state=applyMove(room.state,move);
 }
 const {data:saved,error:saveError}=await supabaseAdmin.from('four_way_chess_rooms').update({members:room.members,seats:room.seats as Json,state:room.state as unknown as Json,started:room.started,revision:room.revision+1,updated_at:new Date().toISOString()}).eq('id',room.id).eq('revision',room.revision).select('*').maybeSingle();
 if(saveError || !saved) throw new Error('Room changed. Refresh and try again.');
 return saved as unknown as Room;
});
