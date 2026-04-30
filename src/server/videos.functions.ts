import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TOKEN_HEADER = "x-admin-token";

function checkToken(token: string | undefined | null) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) throw new Error("Server is not configured (missing admin token).");
  if (!token || token !== expected) throw new Error("Invalid admin token.");
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

    return {
      videoId: id,
      path,
      uploadUrl: signed.signedUrl,
      uploadToken: signed.token,
    };
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

    return rows.map((r) => {
      const { data: pub } = supabaseAdmin.storage.from("videos").getPublicUrl(r.storage_path);
      return { ...r, url: pub.publicUrl };
    });
  });

export const deleteVideo = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token: z.string().min(1).max(512),
      id: z.string().uuid(),
    }).parse
  )
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
