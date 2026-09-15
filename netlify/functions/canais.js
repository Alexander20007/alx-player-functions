import { supabase } from "./_lib/supabase.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const PAGE_SIZE = 1000; // Limite do Supabase por query

async function fetchAllChannels(groupFilter) {
  const all = [];
  let offset = 0;

  while (true) {
    let query = supabase
      .from("channels_online")
      .select("name, logo, group_title, stream, tvg_id, resolution")
      .order("group_title", { ascending: true })
      .order("name", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (groupFilter) {
      query = query.eq("group_title", groupFilter);
    }

    const { data, error } = await query;

    if (error) throw error;
    if (!data || data.length === 0) break;

    all.push(...data);
    if (data.length < PAGE_SIZE) break;

    offset += PAGE_SIZE;
  }

  return all;
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  try {
    const params = event.queryStringParameters || {};
    const group = params.group || null;

    const rows = await fetchAllChannels(group);

    const canais = rows.map((c) => ({
      name: c.name,
      logo: c.logo || "",
      group: c.group_title || "Sem grupo",
      stream: c.stream,
    }));

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=120",
      },
      body: JSON.stringify({
        success: true,
        total: canais.length,
        canais,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: String(err) }),
    };
  }
};
