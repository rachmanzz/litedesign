# @rahmantech/litedesign

Grid, gap, dan alignment ala Figma di halaman web asli — plus jembatan MCP
supaya agent bisa membaca dan memperbaiki layout.

## Pasang

```bash
npm i -g @rahmantech/litedesign
litedesign setup
```

`setup` menyalin extension ke `~/.litedesign/extension` dan mencetak langkah
terakhir yang harus kamu lakukan manual: buka `chrome://extensions`, aktifkan
Developer mode, lalu **Load unpacked** ke folder tersebut.

Chrome tidak mengizinkan pemasangan extension secara programatik. Itu satu-
satunya langkah manual.

## Pakai

```bash
litedesign extension path     # cetak folder untuk Load unpacked
litedesign extension update   # salin ulang setelah upgrade
litedesign doctor             # cek node, extension, dan port
litedesign mcp                # MCP server (stdio)
```

## Daftarkan ke MCP client

```json
{
  "mcpServers": {
    "litedesign": {
      "command": "litedesign",
      "args": ["mcp"]
    }
  }
}
```

## Tanpa Playwright

Server berjalan dengan dua driver. Kalau `playwright-core` tidak terpasang,
agent akan meminta kamu membuka halaman dan mengaktifkan extension. Itu bukan
error — itu jalur normalnya.

## Status

v0.1.0 — kerangka. Measurement core masih node + rect; gap, alignment, dan rule
engine menyusul di M1.
