import { supabase } from "./_lib/supabase.js";

export const handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const group = params.group || null;
    const page = parseInt(params.page || "1", 10);
    const perPage = Math.min(parseInt(params.per_page || "500", 10), 500);

    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    let query = supabase
      .from("channels_online")
      .select("name, logo, group_title, stream, tvg_id, resolution")
      .order("group_title", { ascending: true })
      .order("name", { ascending: true })
      .range(from, to);

    if (group) {
      query = query.eq("group_title", group);
    }

    const { data, error, count } = await query;

    if (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, error: error.message }),
      };
    }

    const canais = (data || []).map((c) => ({
      name: c.name,
      logo: c.logo || "",
      group: c.group_title || "Sem grupo",
      stream: c.stream,
    }));

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
      body: JSON.stringify({
        success: true,
        total: canais.length,
        total_geral: count,
        page,
        per_page: perPage,
        canais,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: String(err) }),
    };
  }
};
