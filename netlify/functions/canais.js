import { supabase } from "./_lib/supabase.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const PAGE_SIZE = 1000;

// Categorias PERMITIDAS (Desporto, Novelas, Infantil, Regionais/Jornalismo)
const CATEGORIAS_PERMITIDAS = [
  "globo", "record", "sbt", "band", "redetv", "aberto", "regional",
  "esporte", "sportv", "espn", "premiere", "combate", "luta", "futebol",
  "novela", "infantil", "criança", "cartoon", "disney", "gloob", 
  "noticia", "jornal", "notícias"
];

// Palavras que indicam VOD (Filmes/Séries/Doramas) que devem ser BLOQUEADOS
const PALAVRAS_VOD = [
  "serie", "série", "filme", "movie", "dorama", "anime", "desenho", 
  "temporada", "episodio", "episódio", "documentario", "documentário"
];

function isVOD(canal) {
  const group = (canal.group || "").toLowerCase();
  const name = (canal.name || "").toLowerCase();

  // Padrões de nome de episódio (ex: S02 E06, 1x05, T3 EP4)
  if (/\bS\d+\s*E\d+\b/i.test(name)) return true;
  if (/\bT\d+\s*EP?\d+\b/i.test(name)) return true;
  if (/\b\d{1,2}x\d{1,2}\b/.test(name)) return true;
  if (/temporada\s*\d+/i.test(name)) return true;

  // Se o nome ou grupo tiver palavras de VOD
  for (const p of PALAVRAS_VOD) {
    if (group.includes(p) || name.includes(p)) return true;
  }

  return false;
}

function isCategoriaPermitida(canal) {
  const group = (canal.group || "").toLowerCase();
  const name = (canal.name || "").toLowerCase();
  const texto = group + " " + name;

  for (const cat of CATEGORIAS_PERMITIDAS) {
    if (texto.includes(cat)) return true;
  }
  return false;
}

async function fetchAllChannels() {
  const all = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("channels_online")
      .select("name, logo, group_title, stream, tvg_id, resolution")
      .range(offset, offset + PAGE_SIZE - 1);

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
    const rows = await fetchAllChannels();

    // Aplica os filtros (VOD e Categorias)
    const canaisFiltrados = rows.filter((c) => {
      // 1. Bloqueia filmes/séries/doramas
      if (isVOD(c)) return false;
      
      // 2. Só deixa passar as categorias permitidas
      if (!isCategoriaPermitida(c)) return false;

      return true;
    });

    // Ordena por grupo, depois por nome
    canaisFiltrados.sort((a, b) => {
      const gA = (a.group_title || "").localeCompare(b.group_title || "");
      if (gA !== 0) return gA;
      return (a.name || "").localeCompare(b.name || "");
    });

    const canais = canaisFiltrados.map((c) => ({
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
