"""Deterministic PNG fixtures; no external files or imaging packages required."""
import struct
import zlib


def write_png(path, width, height):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    compressor = zlib.compressobj(1)
    encoded = bytearray()
    for y in range(height):
        row = bytes(value for x in range(width) for value in ((x // 16) % 256, (y // 16) % 256, ((x+y) // 32) % 256))
        encoded.extend(compressor.compress(b'\0' + row))
    encoded.extend(compressor.flush())
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', bytes(encoded)) + chunk(b'IEND', b''))
