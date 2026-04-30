import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TOKEN_HEADER = "x-admin-token";

function checkToken(token: string | undefined | null) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) throw new Error("Server is not configured (missing admin token).");
  if (!token || token !== expected) throw new Error("Invalid admin token.");
}

async function geolocate(ip: string | null) {
  if (!ip || ip === "127.0.0.1" || ip === "::1") return null;
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      headers: { "User-Agent": "videy/1.0" },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      country_name?: string;
      country_code?: string;
      city?: string;
      region?: string;
      error?: boolean;
    };
    if (j.error) return null;
    return {
      country: j.country_name || null,
      country_code: j.country_code || null,
      city: j.city || null,
      region: j.region || null,
    };
  } catch {
    return null;
  }
}

export const verifyAdminToken = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1).max(512) }).parse)
  .handler(async ({ data }) => {
    checkToken(data.token);
    return { ok: true };
  });

export const createUploadUrl = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token: z.string().min(1).max(512),
      filename: z.string().min(1).max(255),
      contentType: z.string().min(1).max(100),
      sizeBytes: z.number().int().positive().max(524288000),
    }).parse
  )
  .handler(async ({ data }) => {
    checkToken(data.token);
    const ext = data.filename.includes(".") ? data.filename.split(".").pop() : "mp4";
    const id = crypto.randomUUID();
    const path = `${id}.${ext}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from("videos")
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message || "Failed to create upload URL");
    return { videoId: id, path, uploadUrl: signed.signedUrl, uploadToken: signed.token };
  });

export const finalizeUpload = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token: z.string().min(1).max(512),
      path: z.string().min(1).max(512),
      title: z.string().max(255).optional(),
      contentType: z.string().max(100),
      sizeBytes: z.number().int().positive(),
    }).parse
  )
  .handler(async ({ data }) => {
    checkToken(data.token);
    const { data: row, error } = await supabaseAdmin
      .from("videos")
      .insert({
        title: data.title || null,
        storage_path: data.path,
        content_type: data.contentType,
        size_bytes: data.sizeBytes,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    const { data: pub } = supabaseAdmin.storage.from("videos").getPublicUrl(data.path);
    return { id: row.id, url: pub.publicUrl };
  });

export const listVideos = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1).max(512) }).parse)
  .handler(async ({ data }) => {
    checkToken(data.token);
    const { data: rows, error } = await supabaseAdmin
      .from("videos")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    // Aggregate event counts per video
    const ids = rows.map((r) => r.id);
    const counts = new Map<string, { views: number; shares: number }>();
    if (ids.length) {
      const { data: events } = await supabaseAdmin
        .from("video_events")
        .select("video_id, event_type")
        .in("video_id", ids);
      for (const e of events || []) {
        const c = counts.get(e.video_id) || { views: 0, shares: 0 };
        if (e.event_type === "view") c.views++;
        else if (e.event_type === "share") c.shares++;
        counts.set(e.video_id, c);
      }
    }

    return rows.map((r) => {
      const { data: pub } = supabaseAdmin.storage.from("videos").getPublicUrl(r.storage_path);
      const c = counts.get(r.id) || { views: 0, shares: 0 };
      return { ...r, url: pub.publicUrl, views: c.views, shares: c.shares };
    });
  });

export const deleteVideo = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1).max(512), id: z.string().uuid() }).parse)
  .handler(async ({ data }) => {
    checkToken(data.token);
    const { data: row, error: fetchErr } = await supabaseAdmin
      .from("videos").select("storage_path").eq("id", data.id).single();
    if (fetchErr) throw new Error(fetchErr.message);
    await supabaseAdmin.storage.from("videos").remove([row.storage_path]);
    const { error } = await supabaseAdmin.from("videos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getVideo = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("videos").select("*").eq("id", data.id).single();
    if (error || !row) throw new Error("Video not found");
    const { data: pub } = supabaseAdmin.storage.from("videos").getPublicUrl(row.storage_path);
    return { ...row, url: pub.publicUrl };
  });

// --- Analytics tracking ---

export const trackEvent = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      videoId: z.string().uuid(),
      eventType: z.enum(["view", "share"]),
    }).parse
  )
  .handler(async ({ data }) => {
    const ip = getRequestIP({ xForwardedFor: true });
    const referrer = getRequestHeader("referer") || null;
    const userAgent = getRequestHeader("user-agent") || null;
    const geo = await geolocate(ip);

    await supabaseAdmin.from("video_events").insert({
      video_id: data.videoId,
      event_type: data.eventType,
      country: geo?.country || null,
      country_code: geo?.country_code || null,
      city: geo?.city || null,
      region: geo?.region || null,
      referrer: referrer ? referrer.slice(0, 500) : null,
      user_agent: userAgent ? userAgent.slice(0, 500) : null,
    });
    return { ok: true };
  });

// --- Analytics dashboard ---

export const getVideoAnalytics = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1).max(512), id: z.string().uuid() }).parse)
  .handler(async ({ data }) => {
    checkToken(data.token);

    const { data: events, error } = await supabaseAdmin
      .from("video_events")
      .select("event_type, country, country_code, city, created_at, referrer")
      .eq("video_id", data.id)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);

    let views = 0;
    let shares = 0;
    const countryMap = new Map<string, { country: string; code: string | null; views: number }>();
    const cityMap = new Map<string, { city: string; country: string; views: number }>();
    const referrerMap = new Map<string, number>();
    // Last 14 days bucket
    const dayMap = new Map<string, { views: number; shares: number }>();
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      dayMap.set(d.toISOString().slice(0, 10), { views: 0, shares: 0 });
    }

    for (const e of events) {
      if (e.event_type === "view") views++;
      else if (e.event_type === "share") shares++;

      if (e.event_type === "view") {
        const key = e.country_code || e.country || "Unknown";
        const cur = countryMap.get(key) || {
          country: e.country || "Unknown",
          code: e.country_code,
          views: 0,
        };
        cur.views++;
        countryMap.set(key, cur);

        if (e.city) {
          const ck = `${e.city}|${e.country || ""}`;
          const c = cityMap.get(ck) || { city: e.city, country: e.country || "", views: 0 };
          c.views++;
          cityMap.set(ck, c);
        }
      }

      if (e.event_type === "share" && e.referrer) {
        try {
          const host = new URL(e.referrer).hostname;
          referrerMap.set(host, (referrerMap.get(host) || 0) + 1);
        } catch {
          /* ignore */
        }
      }

      const day = new Date(e.created_at).toISOString().slice(0, 10);
      const bucket = dayMap.get(day);
      if (bucket) {
        if (e.event_type === "view") bucket.views++;
        else if (e.event_type === "share") bucket.shares++;
      }
    }

    return {
      totals: { views, shares },
      countries: [...countryMap.values()].sort((a, b) => b.views - a.views).slice(0, 20),
      cities: [...cityMap.values()].sort((a, b) => b.views - a.views).slice(0, 10),
      referrers: [...referrerMap.entries()]
        .map(([host, count]) => ({ host, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      timeline: [...dayMap.entries()].map(([date, v]) => ({ date, ...v })),
    };
  });
