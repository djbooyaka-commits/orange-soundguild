import type { Game, Side } from './engine';
export type Seat = { userId: string | null; name: string; bot: boolean } | null;
export type Room = { id:string; code:string; host_id:string; members:string[]; seats:Seat[]; state:Game; started:boolean; revision:number };
export function authorizeMove(room: Room, userId: string) {
 const seat=room.seats[room.state.turn];
 if(!room.started || !seat || seat.bot || seat.userId!==userId) throw new Error('It is not your turn.');
}
export function authorizeHost(room: Room,userId:string) {
 if(room.host_id!==userId) throw new Error('Only the host can change the lobby.');
}
export function mySide(room:Room,userId:string):Side|null {
 const index=room.seats.findIndex(s=>s?.userId===userId);
 return index<0 ? null : index as Side;
}
