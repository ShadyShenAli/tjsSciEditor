# TjsSciEditor

A lightweight Win32 text editor built with [txiki.js](https://github.com/saghul/txiki.js) (tjs) FFI and [Scintilla](https://www.scintilla.org/), written entirely in JavaScript. No Electron, no Node.js — just tjs calling Win32 APIs directly.

Originally written for [Bun](https://bun.sh); ported to tjs. See [Bun → tjs Port](#bun--tjs-port) for the full story.

## Features

<div-h2>

- Syntax highlighting via Scintilla/Lexilla for 20+ languages
- Code folding with box-style fold markers
- Line numbers and margin
- Multiple themes (Light, Dracula, One Dark, Solarized Light)
- Configurable font face and size
- Word wrap toggle
- Plugin system with event hooks and menu extension
- Compiles to a standalone `dist/editor.exe` via `tjs compile`

</div-h2>

## Requirements

<div-h2>

- [txiki.js](https://github.com/saghul/txiki.js) (`tjs.exe`) in `%PATH%`
- `Scintilla.dll` and `Lexilla.dll` in the project root (from the [Scintilla release](https://www.scintilla.org/ScintillaDownload.html))

</div-h2>

## Usage

<div-h2>

```sh
# Open a file
tjs.exe run editor-tjs.js path\to\file.js

# Open with no file (blank document)
tjs.exe run editor-tjs.js
```

### Build a standalone distribution

```bat
build.bat
```

Output in `dist\`:

```
dist\
  editor.exe       standalone executable (tjs runtime embedded)
  Scintilla.dll
  Lexilla.dll
  plugins\         bundled plugins (drop additional .js files here)
```

`editor.exe` can be run directly — no tjs installation required.

</div-h2>

## Keyboard Shortcuts

<div-h2>

| Shortcut | Action |
|---|---|
| `Ctrl+N` | New file |
| `Ctrl+O` | Open file |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save As |
| `Ctrl++` / `Ctrl+-` | Increase / decrease font size |

</div-h2>

## Supported Languages

<div-h2>

JavaScript, TypeScript, JSX/TSX, C, C++, Python, JSON, Markdown, CSS, HTML, XML, Bash, Batch, SQL, YAML, Lua, Ruby, Rust

</div-h2>

## Themes

<div-h2>

- Light (Default)
- Dark (Dracula)
- Dark (One Dark)
- Solarized Light

Switch via **View → Theme**.

</div-h2>

## Configuration

<div-h2>

Settings are persisted in `config.ini` next to the executable:

```ini
[editor]
theme=Dark (Dracula)
fontsize=13
fontface=Cascadia Code
fontbold=false
wordwrap=false
```

</div-h2>

## Project Structure

<div-h2>

```
editor-tjs.js      Main editor — Win32 window, Scintilla setup, menu, event loop
plugin-api-tjs.js  Plugin host — PluginAPI class, EventEmitter, plugin loader
plugins/           Drop .js files here — loaded automatically on startup
build.bat          Build script: bundle → compile → copy to dist/
docs/
  design.md        Architecture decisions, known issues, bug history
  plugin-guide.md  Plugin authoring reference
```

</div-h2>

## Plugins

<div-h2>

Drop a `.js` file in the `plugins/` folder. It is loaded automatically at startup.

```js
export default function(api) {
  api.addMenuItem('Insert Date', () => {
    api.sci.replaceSelection(new Date().toISOString());
  });
}
```

See [docs/plugin-guide.md](docs/plugin-guide.md) for the full API reference.

### Bundled plugins

| Plugin | Description |
|---|---|
| `word-count.js` | Shows line / word / character count |
| `json_formatter.js` | Stringify, Compact, and To JSONL operations on JSON |
| `selection-highlight.js` | Highlights all occurrences of the current selection |
| `search.js` | Find and replace |
| `hello.js` | Minimal example plugin |

</div-h2>

## Bun → tjs Port

<div-h2>

The editor was originally written for [Bun](https://bun.sh) (`editor.js` / `plugin-api.js`). The tjs port (`editor-tjs.js` / `plugin-api-tjs.js`) keeps all functionality identical but replaces every runtime-specific API. This section documents the differences and the bugs encountered during porting.

### FFI API differences

<div-h3>

| Concern | Bun (`bun:ffi`) | tjs (`tjs:ffi`) |
|---|---|---|
| Import | `import { dlopen, JSCallback, ptr } from 'bun:ffi'` | `import { dlopen, JSCallback, types, bufferToPointer, read } from 'tjs:ffi'` |
| Pointer from buffer | `ptr(buf)` → `BigInt` | `bufferToPointer(buf)` → `NativePointer` |
| Read pointer address | pointer is the BigInt itself | `BigInt(nativePtr.toString())` (`.toString()` returns `"0x…"`) |
| Create pointer from integer | `createPointer(addr)` | not available — use `addrToPtr()` workaround (see below) |
| u64/i64 return values | `BigInt` | `number` (JS number, not BigInt) |
| u64/i64 function arguments | accepts `BigInt` | **rejects BigInt** — must pass `number` |
| `JSCallback` constructor | `new JSCallback(fn, { args, returns })` | `new JSCallback(returnType, [argTypes], fn)` — types first, function last |
| `JSCallback` address | `.ptr` | `.addr` |
| `bool_u32` FFI type | supported | **not supported** — use `'u32'` instead |
| File I/O | `readFileSync` / `writeFileSync` | `await tjs.readFile` / `await tjs.writeFile` (async) |
| Directory listing | `readdirSync(dir)` → `string[]` | `await tjs.readDir(dir)` → `AsyncIterableIterator` |
| Args | `process.argv[2]` | `tjs.args[3]` (index 0=tjs.exe, 1="run", 2=script, 3=first user arg) |
| `import.meta.url` format | `file:///C:\path` | `file://C:\path` (two slashes, not three) |
| Dynamic `import()` of file | `import('file:///C:/...')` | `import('C:/...')` — plain path, no `file://` URL |
| Buffer | `Buffer.alloc(n)` / `Buffer.from(s,'utf8')` | `new Uint8Array(n)` / `new TextEncoder().encode(s)` |
| UTF-16LE string | `Buffer.from(s+'\0','utf16le')` | manual `DataView` encode loop (`setUint16` per char) |

</div-h3>

### Issues and fixes

<div-h3>

#### `createPointer` not available

`createPointer` does not exist in tjs v26.6.0. Required to turn an integer address (e.g. an `lParam` carrying a struct pointer) into a dereferenceable `NativePointer`.

**Fix:** `addrToPtr(addr)` — writes the address into a `Uint8Array` as a little-endian 64-bit value, then uses `read.ptr()` to chase it:

```js
function addrToPtr(addr) {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, BigInt(addr), true);
  return read.ptr(bufferToPointer(buf), 0);
}
```

---

#### `'bool_u32'` FFI type rejected

`dlopen` threw `TypeError: Unknown FFI type: 'bool_u32'` for any function declared with that return type.

**Fix:** Replace all `'bool_u32'` with `'u32'` in every `dlopen` binding.

---

#### u64/i64 FFI args reject BigInt and large numbers

tjs `u64`/`i64`-typed function arguments do **not** accept `BigInt` values. They also throw `RangeError: invalid array index` when passed a plain JS number that exceeds a safe range (e.g. a 48-bit pointer address).

Affected functions: any `dlopen` binding with `'u64'` or `'i64'` arg types — including `SendMessageW(wParam, lParam)`, `DefWindowProcW(wParam, lParam)`.

**Fix:** Declare Win32 handle/pointer-sized parameters as `'ptr'` instead of `'u64'`/`'i64'`. Pass values via `addrToPtr()`. For `SendMessageW` specifically, a `toPtr()` helper normalises all input types (number, bigint, `Uint8Array`, `NativePointer`) to a `NativePointer`:

```js
const toPtr = (v) => {
  if (v instanceof Uint8Array) return bufferToPointer(v);
  if (v?.toString().startsWith('0x')) return v;           // already NativePointer
  return addrToPtr(typeof v === 'bigint' ? v : BigInt(v));
};
```

---

#### WndProc `wParam` sign-extension crash

Declaring `wParam` as `types.uint64` in the `JSCallback` caused Windows HANDLEs (e.g. `HDC` in `WM_ERASEBKGND`) to arrive as negative numbers due to sign extension, which then crashed `DefWindowProcW`.

**Fix:** Declare `wParam` as `types.pointer` so it arrives as a `NativePointer`, then extract a number with `ptrToNum(wParam)` only when needed (e.g. `WM_COMMAND` low word). Pass the raw `NativePointer` through to `DefWindowProcW`.

---

#### `tjs.readDir` is async, returns `AsyncIterableIterator`

`tjs.readDir(dir)` returns a `Promise<DirHandle>` where the handle is an `AsyncIterableIterator`, not an array. Calling it like `readdirSync` produced `undefined`.

**Fix:**
```js
const dirHandle = await tjs.readDir(dir);
for await (const entry of dirHandle) {
  // entry.name, entry.isFile
}
```

---

#### Dynamic `import()` does not accept `file://` URLs

`import('file:///C:/path/to/plugin.js')` threw `ReferenceError: could not load '…'`. tjs resolves module specifiers as filesystem paths, not URLs.

**Fix:** Use plain forward-slash paths: `import('C:/path/to/plugin.js')`.

---

#### Config font not applied on startup

The original Bun code called `loadConfig()` synchronously before the window was created, so font variables (`fontFace`, `fontSize`, `fontBold`) were set before `WM_CREATE` → `applyThemeStyles`. In the tjs port `loadConfig()` is async and was called after `ShowWindow`, so the editor opened with the default font and the config values were loaded but never re-applied.

**Fix:** Call `applyLexer(hSciWnd, currentPath)` immediately after `await loadConfig()`:

```js
await loadConfig();
applyLexer(hSciWnd, currentPath); // re-apply config font/theme to live window
```

</div-h3>

</div-h2>

## Architecture Notes

<div-h2>

- All Win32 calls go through tjs FFI (`tjs:ffi`) — no native addons
- Scintilla is embedded as a DLL; its window class is registered as a side effect of `LoadLibraryW`
- SCNotification structs are read directly from `lParam` via `read.i32` / `read.i64` at known x64 offsets
- Plugin events (`open`, `save`, `change`, `cursorMove`) are dispatched through a shared `EventEmitter`

See [docs/design.md](docs/design.md) for full technical details.

</div-h2>

<style>
  * {
    margin-top : 5px !important;
    margin-bottom: 2px !important;
  }

  h1 {
    text-align: center;
  }
  div-h2, div-h3, div-h4{
    display: block;
    margin-left: 20px;
  }

  h3:before {
    content: "§ " !important;
    display: inline !important;
  }

  h4:before {
    content: "§§ " !important;
    display: inline !important;
  }

  details {
  border-left: 5px solid #DDD;
  padding-left: 10px;
  }
</style>
