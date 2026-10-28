"""Shared helpers for files stored as BLOBs in the legacy tables."""
from django.http import HttpResponse
from rest_framework.response import Response

MAGIC = [(b"%PDF", "application/pdf", "pdf"), (b"\xff\xd8\xff", "image/jpeg", "jpg"), (b"\x89PNG\r\n\x1a\n", "image/png", "png")]


def sniff(data: bytes):
    for sig, ctype, ext in MAGIC:
        if data[: len(sig)] == sig:
            return ctype, ext
    return "application/octet-stream", "bin"


def strip_multipart(data):
    """The Java upload stored some past reports together with the multipart form header
    ('------WebKitFormBoundary... Content-Type: application/pdf'). Cut the real file out."""
    if not data:
        return data
    data = bytes(data)
    if sniff(data)[1] != "bin":
        return data
    for sig, _, _ in MAGIC:
        i = data.find(sig)
        if i != -1:
            body = data[i:]
            end = body.rfind(b"\r\n------")
            if end == -1:
                end = body.rfind(b"\n------")
            return body[:end] if end > 0 else body
    return data


def file_response(blob, name="file", download=False):
    if not blob:
        return Response({"status": "not_found"}, status=404)
    data = bytes(blob)
    ctype, ext = sniff(data)
    resp = HttpResponse(data, content_type=ctype)
    safe = "".join(ch for ch in str(name) if ch.isalnum() or ch in "-_ .")[:60] or "file"
    resp["Content-Disposition"] = f'{"attachment" if download else "inline"}; filename="{safe}.{ext}"'
    return resp


def read_upload(f, max_bytes, allowed=("pdf", "jpg", "png")):
    """Returns (bytes, error_response)."""
    if f is None:
        return None, Response({"status": "file_required"}, status=400)
    if f.size > max_bytes:
        return None, Response({"status": "file_too_large", "max_kb": max_bytes // 1024}, status=413)
    data = f.read()
    if sniff(data)[1] not in allowed:
        return None, Response({"status": "unsupported_file", "allowed": list(allowed)}, status=415)
    return data, None
