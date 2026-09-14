import { supabase } from "./_lib/supabase.js";

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
  try {
    const params = event.queryStringParameters || {};
    const stream = params.stream;

    if (!stream) {
      return {
        statusCode: 400,
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
        body: JSON.stringify({ success: false, error: canalErr.message }),
      };
    }

    if (!canal || !canal.tvg_id) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          error: "Canal não encontrado ou sem EPG",
        }),
      };
    }

    // 2) Busca programação no cache
    const { data: epg, error: epgErr } = await supabase
      .from("epg_cache")
      .select("programs")
      .eq("tvg_id", canal.tvg_id)
      .maybeSingle();

    if (epgErr) {
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, error: epgErr.message }),
      };
    }

    if (!epg || !epg.programs || epg.programs.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          error: "Sem programação disponível",
        }),
      };
    }

    const { atual, proximo } = findCurrentAndNext(epg.programs);

    if (!atual && !proximo) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          error: "Nenhum programa disponível no momento",
        }),
      };
    }

    return {
      statusCode: 200,
      headers: {
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
      body: JSON.stringify({ success: false, error: String(err) }),
    };
  }
};
