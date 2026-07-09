import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authorization = req.headers.get("Authorization") ?? "";

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return json({ error: "No autorizado" }, 401);
  }

  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (profileError || profile?.role !== "admin") {
    return json({ error: "Solo un administrador puede modificar usuarios" }, 403);
  }

  const body = await req.json();
  const targetId = String(body.id ?? "").trim();
  if (!targetId) {
    return json({ error: "Falta el id del usuario" }, 400);
  }

  if (body.password) {
    const password = String(body.password);
    if (password.length < 6) {
      return json({ error: "La contrasena debe tener al menos 6 caracteres" }, 400);
    }
    const { error: passErr } = await adminClient.auth.admin.updateUserById(targetId, { password });
    if (passErr) {
      return json({ error: passErr.message }, 400);
    }
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.full_name === "string" && body.full_name.trim()) patch.full_name = body.full_name.trim();
  if (typeof body.role === "string") {
    patch.role = ["admin", "manager", "warehouse", "sales"].includes(body.role) ? body.role : "sales";
  }
  if (typeof body.active === "boolean") patch.active = body.active;

  if (Object.keys(patch).length > 0) {
    const { error: updErr } = await adminClient.from("profiles").update(patch).eq("id", targetId);
    if (updErr) {
      return json({ error: updErr.message }, 400);
    }
  }

  return json({ ok: true, id: targetId });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
