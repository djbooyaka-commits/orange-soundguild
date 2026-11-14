import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { conversionPatch, isValidMp3Target, isWavPath, mp3PathFor } from "@/lib/media-optimize";

type Ctx = { supabase: { rpc: (fn: string, args: unknown) => PromiseLike<{ data: unknown }> }; userId: string };

async function assertAdmin(context: Ctx) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Admins only");
}

export const listWavTracks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("tracks")
      .select("id, title, user_id, audio_url, download_lossless_url")
      .ilike("audio_url", "%.wav%")
      .order("created_at", { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);
    const rows = (data ?? []).filter((r) => isWavPath(r.audio_url));
    const ownerIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const names = new Map<string, string>();
    if (ownerIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, username")
        .in("id", ownerIds);
      (profs ?? []).forEach((p) => names.set(p.id, p.username || "Unknown"));
    }
    return {
      tracks: rows.map((r) => ({
        id: r.id,
        title: r.title,
        artist: names.get(r.user_id) ?? "Unknown",
        hasOriginal: !!r.download_lossless_url,
      })),
    };
  });

export const prepareWavConversion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ trackId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t } = await supabaseAdmin
      .from("tracks")
      .select("id, user_id, audio_url")
      .eq("id", data.trackId)
      .maybeSingle();
    if (!t) throw new Error("Track not found");
    if (!isWavPath(t.audio_url)) throw new Error("This track is no longer a WAV file");
    const { data: dl } = await supabaseAdmin.storage.from("audio").createSignedUrl(t.audio_url, 60 * 60);
    if (!dl?.signedUrl) throw new Error("Could not open the WAV file");
    const mp3Path = mp3PathFor(t.user_id, t.audio_url, Date.now());
    const { data: up, error } = await supabaseAdmin.storage.from("audio").createSignedUploadUrl(mp3Path);
    if (error || !up) throw new Error("Could not prepare the MP3 upload");
    return { downloadUrl: dl.signedUrl, wavPath: t.audio_url, mp3Path, uploadToken: up.token };
  });

export const finalizeWavConversion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ trackId: z.string().uuid(), wavPath: z.string().min(1).max(500), mp3Path: z.string().min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t } = await supabaseAdmin
      .from("tracks")
      .select("id, user_id, audio_url, download_lossless_url")
      .eq("id", data.trackId)
      .maybeSingle();
    if (!t) throw new Error("Track not found");
    if (t.audio_url !== data.wavPath) throw new Error("The track's audio changed while converting");
    if (!isValidMp3Target(t.user_id, data.mp3Path)) throw new Error("Invalid MP3 location");

    // Confirm the MP3 really landed in storage before pointing the track at it.
    const [folder, name] = data.mp3Path.split("/");
    const { data: found } = await supabaseAdmin.storage.from("audio").list(folder, { search: name, limit: 5 });
    const obj = found?.find((f) => f.name === name);
    if (!obj) throw new Error("MP3 upload not found");

    const patch = conversionPatch(t.audio_url, data.mp3Path, t.download_lossless_url);
    const { error } = await supabaseAdmin
      .from("tracks")
      .update(patch)
      .eq("id", t.id)
      .eq("audio_url", data.wavPath);
    if (error) throw new Error(error.message);
    return { ok: true, keptOriginal: patch.download_lossless_url };
  });
