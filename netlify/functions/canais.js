import { supabase } from "./_lib/supabase.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const PAGE_SIZE = 1000;

/**
 * Detecta se o canal é VOD (série, filme, anime, episódio).
 * Usa padrões de grupo e de nome para identificar.
 */
function isVOD(canal) {
  const group = (canal.group || "").toLowerCase().trim();
  const name = (canal.name || "").toLowerCase().trim();

  // 1) Grupos que começam com "Serie", "Série", "Filme", "Movie", etc.
  //    Ignora "Canais | NOVELAS" (esse é canal ao vivo)
  if (/^(serie|série|filme|movie|novela|show|anime|animes|documentario|documentário)\s*\|/i.test(group)) {
    return true;
  }

  // 2) Nomes que parecem episódios: "S02 E06", "S2E1", "T3 EP4"
  if (/\bS\d+\s*E\d+\b/i.test(name)) return true;
  if (/\bT\d+\s*EP?\d+\b/i.test(name)) return true;

  // 3) Nomes tipo "2x05" (temporada x episódio)
  if (/\b\d{1,2}x\d{1,2}\b/.test(name)) return true;

  // 4) Nomes com "temporada N"
  if (/temporada\s*\d+/i.test(name)) return true;

  return false;
}

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
    const incluirVOD = params.vod === "true"; // ?vod=true pra incluir séries/filmes

    const rows = await fetchAllChannels(group);

    // Filtra VOD (a não ser que o usuário peça explicitamente)
    const filtered = incluirVOD ? rows : rows.filter((c) => !isVOD(c));

    const canais = filtered.map((c) => ({
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
        total_bruto: rows.length,
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
