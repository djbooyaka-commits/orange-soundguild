import { createFileRoute } from '@tanstack/react-router';
import { ChessGame } from '@/components/chess/ChessGame';
export const Route=createFileRoute('/games/4-way-chess')({
 validateSearch:(s:Record<string,unknown>):{room?:string}=>typeof s['room']==='string' ? {room:s['room']} : {},
 head:()=>({meta:[{title:'4-Way Chess — Orange Sound Guild'},{name:'description',content:'Play four-player cross-board chess against bots or friends online, with a unique royal pawn rule.'},{property:'og:title',content:'4-Way Chess — Orange Sound Guild'},{property:'og:description',content:'Four armies, one battlefield. Play with friends or bots and grow your army with royal pawns.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),
 component:ChessPage,
});
function ChessPage(){const {room}=Route.useSearch();return <ChessGame invite={room ?? ''}/>;}
