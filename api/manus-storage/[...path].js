"use strict";

const ALLOWED_ASSET_KEYS = new Set(["ethos-logo_194cfccc.jpeg", "kaito-mark_bfc88d67.png", "phantom-wallet_25796a99.png", "opera_803ecdcc.png", "opera-small_1fa074ba.png", "solana-mark-final_901eaff2.png"]);

function requestedAssetKey(req) {
  const rawPath = req.query?.path;
  if (Array.isArray(rawPath)) return rawPath.join("/");
  if (typeof rawPath === "string" && rawPath) return rawPath;

  const pathname = String(req.url ?? "").split("?")[0];
  const marker = "/manus-storage/";
  const markerIndex = pathname.indexOf(marker);
  return markerIndex === -1 ? "" : decodeURIComponent(pathname.slice(markerIndex + marker.length));
}

module.exports = async function storageProxy(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).end("Method not allowed");
    return;
  }

  const key = requestedAssetKey(req);
  if (!ALLOWED_ASSET_KEYS.has(key)) {
    res.status(404).end("Asset not found");
    return;
  }

  const forgeApiUrl = process.env.BUILT_IN_FORGE_API_URL;
  const forgeApiKey = process.env.BUILT_IN_FORGE_API_KEY;
  if (!forgeApiUrl || !forgeApiKey) {
    res.status(500).end("Storage proxy not configured");
    return;
  }

  try {
    const forgeUrl = new URL("v1/storage/presign/get", forgeApiUrl.replace(/\/+$/, "") + "/");
    forgeUrl.searchParams.set("path", key);
    const forgeResponse = await fetch(forgeUrl, { headers: { Authorization: `Bearer ${forgeApiKey}` } });
    if (!forgeResponse.ok) {
      res.status(502).end("Storage backend error");
      return;
    }

    const { url } = await forgeResponse.json();
    if (!url) {
      res.status(502).end("Storage backend returned no URL");
      return;
    }

    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
    res.redirect(307, url);
  } catch (error) {
    console.error("[StorageProxy] failed:", error);
    res.status(502).end("Storage proxy error");
  }
};
