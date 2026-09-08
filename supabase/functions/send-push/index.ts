import { createClient } from "jsr:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface SendPushRequest {
  recipient_user_id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: SendPushRequest;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { recipient_user_id, title, body, data } = payload;
  if (!recipient_user_id || !title || !body) {
    return new Response(
      JSON.stringify({
        error: "recipient_user_id, title and body are required",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: tokenRows, error: fetchError } = await supabase
    .from("push_tokens")
    .select("token")
    .eq("user_id", recipient_user_id);

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const tokens = (tokenRows ?? []).map((row) => row.token as string);
  if (tokens.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const messages = tokens.map((token) => ({
    to: token,
    title,
    body,
    data: data ?? {},
    sound: "default",
  }));

  const expoResponse = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    body: JSON.stringify(messages),
  });

  const expoResult = await expoResponse.json();
  const tickets: ExpoPushTicket[] = expoResult.data ?? [];

  const staleTokens: string[] = [];
  let sent = 0;

  tickets.forEach((ticket, index) => {
    if (ticket.status === "ok") {
      sent += 1;
      return;
    }
    if (ticket.details?.error === "DeviceNotRegistered") {
      staleTokens.push(tokens[index]);
    }
  });

  if (staleTokens.length > 0) {
    await supabase.from("push_tokens").delete().in("token", staleTokens);
  }

  return new Response(JSON.stringify({ sent }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
