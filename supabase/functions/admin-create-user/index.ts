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
    return json({ error: "Solo un administrador puede crear usuarios" }, 403);
  }

  const body = await req.json();
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const fullName = String(body.full_name ?? username).trim();
  const role = body.role === "admin" ? "admin" : body.role === "manager" ? "manager" : body.role === "warehouse" ? "warehouse" : "sales";

  if (!username || !password) {
    return json({ error: "Usuario y contrasena son requeridos" }, 400);
  }

  const email = username.includes("@") ? username : `${username}@inversionesdelcaribe.com`;
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, full_name: fullName },
  });

  if (createError) {
    return json({ error: createError.message }, 400);
  }

  const { error: profileInsertError } = await adminClient.from("profiles").upsert({
    id: created.user.id,
    full_name: fullName,
    username,
    role,
    active: true,
  });

  if (profileInsertError) {
    return json({ error: profileInsertError.message }, 400);
  }

  return json({ id: created.user.id, username, full_name: fullName, role });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
