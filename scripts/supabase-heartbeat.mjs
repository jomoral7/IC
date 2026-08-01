const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const minDays = Number(process.env.HEARTBEAT_MIN_DAYS ?? "6");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const headers = {
  apikey: serviceRoleKey,
  authorization: `Bearer ${serviceRoleKey}`,
  "content-type": "application/json",
};

const latestUrl =
  `${supabaseUrl}/rest/v1/system_heartbeats` +
  "?select=recorded_at&order=recorded_at.desc&limit=1";

const latestResponse = await fetch(latestUrl, { headers });

if (!latestResponse.ok) {
  const body = await latestResponse.text();
  throw new Error(`Unable to read heartbeat table: ${latestResponse.status} ${body}`);
}

const [latest] = await latestResponse.json();
const now = Date.now();

if (latest?.recorded_at) {
  const lastRecordedAt = new Date(latest.recorded_at).getTime();
  const ageDays = (now - lastRecordedAt) / 86_400_000;

  if (ageDays < minDays) {
    console.log(`Heartbeat skipped. Last record is ${ageDays.toFixed(2)} days old.`);
    process.exit(0);
  }
}

const insertResponse = await fetch(`${supabaseUrl}/rest/v1/system_heartbeats`, {
  method: "POST",
  headers: {
    ...headers,
    prefer: "return=representation",
  },
  body: JSON.stringify({
    source: "github-actions",
    note: "external maintenance heartbeat",
  }),
});

if (!insertResponse.ok) {
  const body = await insertResponse.text();
  throw new Error(`Unable to insert heartbeat: ${insertResponse.status} ${body}`);
}

const [inserted] = await insertResponse.json();
console.log(`Heartbeat recorded at ${inserted.recorded_at}.`);
