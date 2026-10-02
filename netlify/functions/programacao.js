import { supabase } from "./_lib/supabase.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const RENDER_BASE = "https://iptv-apis.onrender.com";

function findCurrentAndNext(programs) {
  const now = new Date();
  const sorted = [...programs].sort(
    (a, b) => new Date(a.inicio) - new Date(b.inicio)
  );

  let atual = null;
  let proximo = null;

  for (let i = 0; i < sorted.length; i++) {
    const inicio = new Date(sorted[i].inicio);
    const fim = new Date(sorted[i].fim);

    if (inicio <= now && now <= fim) {
      atual = sorted[i];
      if (i + 1 < sorted.length) proximo = sorted[i + 1];
      break;
    }
    if (inicio > now) {
      proximo = sorted[i];
      break;
    }
  }

  return { atual, proximo };
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  try {
    const params = event.queryStringParameters || {};
    const stream = params.stream;

    if (!stream) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Parâmetro 'stream' obrigatório" }),
      };
    }

    const decodedStream = decodeURIComponent(stream);

    // 1) Busca o canal pelo stream pra pegar o tvg_id
    const { data: canal, error: canalErr } = await supabase
      .from("channels_online")
      .select("tvg_id, name")
      .eq("stream", decodedStream)
      .maybeSingle();

    if (canalErr) {
      return {
        statusCode: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: canalErr.message }),
      };
    }

    if (!canal || !canal.tvg_id) {
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "Canal não encontrado ou sem EPG",
        }),
      };
    }

    // 2) Verifica cache local (rápido)
    const { data: epg } = await supabase
      .from("epg_cache")
      .select("programs, updated_at")
      .eq("tvg_id", canal.tvg_id)
      .maybeSingle();

    let programs = null;

    if (epg && epg.programs && epg.programs.length > 0) {
      // Cache fresco? (menos de 6h)
      const updatedAt = epg.updated_at ? new Date(epg.updated_at).getTime() : 0;
      const age = Date.now() - updatedAt;
      if (age < 6 * 60 * 60 * 1000) {
        programs = epg.programs;
      }
    }

    // 3) Se não tem cache ou está velho, chama o Render sob demanda
    if (!programs) {
      try {
        const r = await fetch(
          `${RENDER_BASE}/epg/on-demand?tvg_id=${encodeURIComponent(canal.tvg_id)}`,
          { signal: AbortSignal.timeout(15000) }
        );
        const data = await r.json();
        if (data.ok && data.atual) {
          // O Render já devolve atual/proximo direto
          return {
            statusCode: 200,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            body: JSON.stringify({
              success: true,
              atual: data.atual,
              proximo: data.proximo,
            }),
          };
        }
      } catch (e) {
        console.warn("Render timeout/erro:", e.message);
      }

      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "EPG ainda não disponível. Tente novamente em instantes.",
        }),
      };
    }

    // 4) Tem cache fresco, calcula
    const { atual, proximo } = findCurrentAndNext(programs);

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=120",
      },
      body: JSON.stringify({
        success: true,
        atual: atual
          ? { titulo: atual.titulo, inicio: atual.inicio, fim: atual.fim }
          : null,
        proximo: proximo
          ? { titulo: proximo.titulo, inicio: proximo.inicio, fim: proximo.fim }
          : null,
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
