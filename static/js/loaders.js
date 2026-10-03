/** Bounded GLB fetch with real byte progress and actionable failures. */
export async function fetchBinaryAsset(url, onProgress = () => {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Asset ${url} returned HTTP ${response.status}.`);
    const total = Number(response.headers.get("content-length")) || 0;
    if (!response.body?.getReader) {
      const buffer = await response.arrayBuffer();
      onProgress(1);
      return buffer;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let loaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      if (total > 0) onProgress(Math.min(loaded / total, 0.99));
    }
    const buffer = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    onProgress(1);
    return buffer.buffer;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Asset ${url} timed out after ${timeoutMs / 1000}s. Check the model path and connection.`);
    throw error;
  } finally { clearTimeout(timeout); }
}
