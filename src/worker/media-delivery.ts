type ByteRange = { offset: number; length: number };
type StoredMediaOptions = {
  contentType: string;
  downloadFilename?: string;
  imageOnly?: boolean;
};

function hasBody(object: R2Object): object is R2ObjectBody {
  return "body" in object && object.body !== undefined;
}

// Multiple/unknown/malformed ranges are ignored; a valid but unsatisfiable
// single byte range gets 416. Only the selected bytes are requested from R2.
function parseByteRange(value: string, size: number): ByteRange | "unsatisfiable" | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const total = BigInt(size);
  if (total === 0n) return "unsatisfiable";
  if (!match[1]) {
    const suffix = BigInt(match[2]);
    if (suffix === 0n) return "unsatisfiable";
    const length = suffix > total ? total : suffix;
    return { offset: Number(total - length), length: Number(length) };
  }
  const start = BigInt(match[1]);
  const requestedEnd = match[2] ? BigInt(match[2]) : total - 1n;
  if (start >= total || requestedEnd < start) return "unsatisfiable";
  const end = requestedEnd >= total ? total - 1n : requestedEnd;
  return { offset: Number(start), length: Number(end - start + 1n) };
}

function matchesEtag(value: string, etag: string, weak: boolean): boolean {
  return value.split(",").some((item) => {
    const candidate = item.trim();
    return candidate === "*" || (weak ? candidate.replace(/^W\//, "") : candidate) === etag;
  });
}

function modifiedAt(object: R2Object): number {
  return Math.floor(object.uploaded.getTime() / 1000) * 1000;
}

function preconditionStatus(request: Request, object: R2Object): 304 | 412 | null {
  const ifMatch = request.headers.get("If-Match");
  if (ifMatch && !matchesEtag(ifMatch, object.httpEtag, false)) return 412;
  const ifUnmodifiedSince = request.headers.get("If-Unmodified-Since");
  if (!ifMatch && ifUnmodifiedSince && modifiedAt(object) > Date.parse(ifUnmodifiedSince)) return 412;
  const ifNoneMatch = request.headers.get("If-None-Match");
  if (ifNoneMatch) return matchesEtag(ifNoneMatch, object.httpEtag, true) ? 304 : null;
  const ifModifiedSince = request.headers.get("If-Modified-Since");
  return ifModifiedSince && modifiedAt(object) <= Date.parse(ifModifiedSince) ? 304 : null;
}

function allowsRange(request: Request, object: R2Object): boolean {
  const ifRange = request.headers.get("If-Range");
  if (!ifRange) return true;
  // If-Range requires a strong validator; dates match Last-Modified exactly.
  return ifRange === object.httpEtag || Date.parse(ifRange) === modifiedAt(object);
}

function objectHeaders(object: R2Object, options: StoredMediaOptions): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", options.contentType);
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("ETag", object.httpEtag);
  headers.set("Last-Modified", object.uploaded.toUTCString());
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Length", String(object.size));
  headers.set("X-Content-Type-Options", "nosniff");
  if (options.downloadFilename) {
    const filename = encodeURIComponent(options.downloadFilename).replace(
      /[!'()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    headers.set("Content-Disposition", `attachment; filename*=UTF-8''${filename}`);
  }
  return headers;
}

/** Caller must authenticate and resolve the media record before accessing R2. */
export async function serveStoredMedia(
  request: Request,
  bucket: R2Bucket,
  objectKey: string,
  options: StoredMediaOptions,
): Promise<Response | null> {
  const head = request.method === "HEAD";
  const rangeHeader = head ? null : request.headers.get("Range");
  const needsMetadata =
    head ||
    Boolean(rangeHeader) ||
    ["If-Match", "If-None-Match", "If-Modified-Since", "If-Unmodified-Since"].some((name) => request.headers.has(name));
  const object = needsMetadata ? await bucket.head(objectKey) : await bucket.get(objectKey);
  if (!object) return null;
  if (options.imageOnly && object.httpMetadata?.contentType?.startsWith("video/")) {
    if (hasBody(object)) await object.body.cancel();
    return null;
  }
  const headers = objectHeaders(object, options);
  const status = preconditionStatus(request, object);
  if (status) {
    if (status === 304) headers.delete("Content-Length");
    else headers.set("Content-Length", "0");
    return new Response(null, { status, headers });
  }
  if (head) return new Response(null, { headers });

  const range = rangeHeader && allowsRange(request, object) ? parseByteRange(rangeHeader, object.size) : null;
  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${object.size}`);
    headers.set("Content-Length", "0");
    return new Response(null, { status: 416, headers });
  }
  const stored = hasBody(object)
    ? object
    : await bucket.get(objectKey, {
        onlyIf: { etagMatches: object.etag },
        ...(range ? { range } : {}),
      });
  if (!stored) return null;
  // A concurrent overwrite must never combine old range headers with new bytes.
  if (!hasBody(stored)) {
    return new Response(null, { status: 503, headers: { "Cache-Control": "private, no-store", "Retry-After": "1" } });
  }
  if (range) {
    headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
    headers.set("Content-Length", String(range.length));
  }
  return new Response(stored.body, { status: range ? 206 : 200, headers });
}

const placeholder = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img" aria-label="プレビュー画像がありません"><rect width="640" height="360" fill="#e9e7e3"/><g fill="none" stroke="#96948f" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><rect x="272" y="140" width="96" height="80" rx="8"/><circle cx="299" cy="164" r="7"/><path d="m280 210 25-25 18 15 19-28 18 38"/></g></svg>`;

export function missingMediaPreview(request: Request): Response {
  return new Response(request.method === "HEAD" ? null : placeholder, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Length": String(new TextEncoder().encode(placeholder).byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
