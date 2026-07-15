export type WebSearchResult = {
  title: string
  url: string
  snippet: string
}

export type WebSearchResponse = {
  source: "tavily" | "duckduckgo" | "none"
  query: string
  results: WebSearchResult[]
}

type TavilyResult = { title?: string; url?: string; content?: string }

/**
 * Provider-agnostic live web search. Prefers Tavily when TAVILY_API_KEY is set
 * (clean LLM-oriented results), otherwise falls back to DuckDuckGo's keyless
 * HTML endpoint, which returns real general web results (unlike the Instant
 * Answer API, which only covers encyclopedic entities). Called from the
 * `web_search` chat tool, so it works with any LLM that supports tool calling.
 */
export async function searchWeb(
  query: string,
  maxResults = 6,
): Promise<WebSearchResponse> {
  const tavilyKey = process.env.TAVILY_API_KEY

  if (tavilyKey) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: tavilyKey,
          query,
          max_results: maxResults,
          search_depth: "basic",
        }),
      })
      if (res.ok) {
        const data = (await res.json()) as { results?: TavilyResult[] }
        const results = (data.results ?? [])
          .filter((r): r is Required<TavilyResult> => Boolean(r.url))
          .map((r) => ({
            title: r.title ?? r.url,
            url: r.url,
            snippet: r.content ?? "",
          }))
        if (results.length > 0) return { source: "tavily", query, results }
      }
    } catch {
      // fall through to DuckDuckGo
    }
  }

  try {
    const results = await searchDuckDuckGoHtml(query, maxResults)
    return {
      source: results.length > 0 ? "duckduckgo" : "none",
      query,
      results,
    }
  } catch {
    return { source: "none", query, results: [] }
  }
}

async function searchDuckDuckGoHtml(
  query: string,
  maxResults: number,
): Promise<WebSearchResult[]> {
  const res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
    body: new URLSearchParams({ q: query }).toString(),
  })
  if (!res.ok) return []

  const html = await res.text()
  const snippets: string[] = []
  const snippetRe =
    /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
  for (let m = snippetRe.exec(html); m; m = snippetRe.exec(html)) {
    snippets.push(stripHtml(m[1] ?? ""))
  }

  const results: WebSearchResult[] = []
  const linkRe =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  let index = 0
  for (
    let m = linkRe.exec(html);
    m && results.length < maxResults;
    m = linkRe.exec(html)
  ) {
    const url = decodeDuckDuckGoUrl(m[1] ?? "")
    const title = stripHtml(m[2] ?? "")
    if (url && title) {
      results.push({ title, url, snippet: snippets[index] ?? "" })
    }
    index++
  }
  return results
}

/** DuckDuckGo wraps result URLs as `//duckduckgo.com/l/?uddg=<encoded>&rut=…`. */
function decodeDuckDuckGoUrl(href: string): string | null {
  const wrapped = href.match(/[?&]uddg=([^&]+)/)
  if (wrapped?.[1]) {
    try {
      return decodeURIComponent(wrapped[1])
    } catch {
      return null
    }
  }
  if (href.startsWith("http")) return href
  if (href.startsWith("//")) return `https:${href}`
  return null
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}
