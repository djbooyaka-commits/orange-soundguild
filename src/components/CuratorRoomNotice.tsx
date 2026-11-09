import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getCuratorRoomNotice,
  setCuratorRoomNotice,
  type CuratorRoomScope,
} from "@/lib/api/curator-room-notice.functions";
import { CuratorNoticeBox } from "@/components/PlaylistCuratorNotice";

/** "Message from the Curator" banner for Spotify team rooms and OSG Artists rooms. */
export function CuratorRoomNotice({ scope, roomKey }: { scope: CuratorRoomScope; roomKey: string }) {
  const getFn = useServerFn(getCuratorRoomNotice);
  const setFn = useServerFn(setCuratorRoomNotice);
  const [state, setState] = useState<{ notice: string | null; isOwner: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    setState(null);
    getFn({ data: { scope, roomKey } })
      .then((r) => alive && setState(r))
      .catch(() => alive && setState({ notice: null, isOwner: false }));
    return () => {
      alive = false;
    };
  }, [scope, roomKey, getFn]);

  if (!state) return null;
  return (
    <CuratorNoticeBox
      resetKey={`${scope}:${roomKey}`}
      notice={state.notice}
      isOwner={state.isOwner}
      onSave={(text) => setFn({ data: { scope, roomKey, notice: text } })}
    />
  );
}
