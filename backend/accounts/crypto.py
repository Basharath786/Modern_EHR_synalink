"""Compatible with the Java UserUtility: AES/CBC/PKCS5Padding, fixed IV.
The AES key was extracted once from cobalt.jks into keystore/aes_key.hex so no
Java-keystore library (which needs a C++ compiler on Windows) is required."""
import base64
from functools import lru_cache
from pathlib import Path

from Crypto.Cipher import AES
from django.conf import settings


@lru_cache(maxsize=1)
def _key() -> bytes:
    path = Path(settings.AES_KEY_FILE)
    return bytes.fromhex(path.read_text().strip())


def _cipher():
    return AES.new(_key(), AES.MODE_CBC, settings.LEGACY_AES_IV.encode())


def encrypt_password(plain: str) -> str:
    data = plain.encode()
    pad = 16 - len(data) % 16
    return base64.b64encode(_cipher().encrypt(data + bytes([pad]) * pad)).decode()


def decrypt_password(stored: str) -> str:
    raw = _cipher().decrypt(base64.b64decode(stored))
    return raw[: -raw[-1]].decode()
