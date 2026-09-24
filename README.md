[[toc]]

# TjsSciEditor

A lightweight Win32 text editor built with [txiki.js](https://github.com/saghul/txiki.js) (tjs) FFI and [Scintilla](https://www.scintilla.org/), written entirely in JavaScript. No Electron, no Node.js — just tjs calling Win32 APIs directly.

Originally written for [Bun](https://bun.sh); ported to tjs. See [Bun → tjs Port](#bun--tjs-port) for the full story.

## Features

- Syntax highlighting via Scintilla/Lexilla for 20+ languages
- Code folding with box-style fold markers (lazy for files ≥ 10 MB)
- Paired bracket highlighting — matched pair coloured, unmatched shown in red
- Line numbers and margin
- Multiple themes (Light, Dracula, One Dark, Solarized Light)
- Configurable font face and size
- Word wrap toggle
- Plugin system with event hooks and menu extension
- Compiles to a standalone `dist/editor.exe` via `tjs compile`

## Requirements

- [txiki.js](https://github.com/saghul/txiki.js) (`tjs.exe`) in `%PATH%`
- `Scintilla.dll` and `Lexilla.dll` in the project root (from the [Scintilla release](https://www.scintilla.org/ScintillaDownload.html))

## Usage

```sh
# Open a file
tjs.exe run editor-tjs.js path\to\file.js

# Open with profiling output
tjs.exe run editor-tjs.js --profile path\to\file.js

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

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+N` | New file |
| `Ctrl+O` | Open file |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save As |
| `Ctrl++` / `Ctrl+-` | Increase / decrease font size |
| `Alt+Left` | Go to paired bracket |
| `Alt+Shift+F` | Format JS/TS (oxfmt) |

## Supported Languages

JavaScript, TypeScript, JSX/TSX, C, C++, Python, JSON, Markdown, CSS, HTML, XML, Bash, Batch, SQL, YAML, Lua, Ruby, Rust

## Themes

- Light (Default)
- Dark (Dracula)
- Dark (One Dark)
- Solarized Light

Switch via **View → Theme**.

## Configuration

Settings are persisted in `config.ini` next to the executable:

```ini
[editor]
theme=Dark (Dracula)
fontsize=13
fontface=Cascadia Code
fontbold=false
wordwrap=false
```

## Project Structure

```
editor-tjs.js      Main editor — Win32 window, Scintilla setup, menu, event loop
plugin-api-tjs.js  Plugin host — PluginAPI class, EventEmitter, plugin loader
plugins/           Drop .js files here — loaded automatically on startup
build.bat          Build script: bundle → compile → copy to dist/
docs/
  design.md        Architecture decisions, known issues, bug history
  plugin-guide.md  Plugin authoring reference
```

## Plugins

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
| `js_formatter.js` | Format JS/TS via `oxfmt` (`Alt+Shift+F`) |
| `selection-highlight.js` | Highlights all occurrences of the current selection |
| `search.js` | Find and replace |
| `hello.js` | Minimal example plugin |

## Bun → tjs Port

The editor was originally written for [Bun](https://bun.sh) (`editor.js` / `plugin-api.js`). The tjs port (`editor-tjs.js` / `plugin-api-tjs.js`) keeps all functionality identical but replaces every runtime-specific API. This section documents the differences and the bugs encountered during porting.

### FFI API differences

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

### Issues and fixes

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

## Architecture Notes

- All Win32 calls go through tjs FFI (`tjs:ffi`) — no native addons
- Scintilla is embedded as a DLL; its window class is registered as a side effect of `LoadLibraryW`
- SCNotification structs are read directly from `lParam` via `read.i32` / `read.i64` at known x64 offsets
- Plugin events (`open`, `save`, `change`, `cursorMove`) are dispatched through a shared `EventEmitter`

See [docs/design.md](docs/design.md) for full technical details.

## Changelog

### 2026-09-24

#### Large file performance

Opening large files (e.g. 100 MB+ HAR/JSON) is now significantly faster:

- **Avoid TextDecoder→TextEncoder round-trip** — raw file bytes are passed directly to `SCI_SETTEXT` by appending a NUL byte, saving ~1.9 s on a 134 MB file.
- **Deferred syntax highlighting for files ≥ 10 MB** — `SCI_COLOURISE(0,-1)` is skipped on open; Scintilla styles lazily as lines scroll into view. Folding works progressively as you scroll. Saves ~6 s on a 134 MB file.
- **`--profile` flag** — prints per-step timing to the console.

  ```
  editor.exe D:\large.json --profile
  ```

  Sample output:
  ```
  [profile] readFile:     +189ms  total=277ms
  [profile] build buf:     +22ms  total=299ms
  [profile] SCI_SETTEXT:  +223ms  total=522ms
  [profile] applyLexer:     +1ms  total=523ms   ← was 6175ms
  [profile] ── ready ──         total=533ms      ← was 8268ms
  ```

- **Encoding detection (BOM)** — on open, the first bytes are checked for UTF-16LE/BE, UTF-32LE/BE, and UTF-8 BOM. For non-UTF-8 encodings a warning dialog offers to convert to UTF-8 before loading; declining cancels the open. UTF-8 BOM is stripped silently.

### Post-bun-port features (2026-09)

#### Bracket matching
- Paired brackets `()[]{}` are highlighted as you move the cursor — matched pair shown in colour, unmatched bracket shown in red.
- **View → Goto Pair** `Alt+Left` — jump to the matching bracket. String-aware: brackets inside `"'`` ` are skipped. Uses a full-document text scan independent of Scintilla styling, so it works correctly on very long lines.

#### Language detection
- Content-based language detection when the file extension is unknown — detects JS/TS, Python, JSON, CSS, YAML, Shell, SQL, Lua, C/C++ via shebang and structural patterns.
- **View → Detect Format** — manually trigger detection on the current buffer.

#### Folding fix
- Code folding now actually works — `SCI_SETFOLDFLAGS` and `SCI_SETAUTOMATICFOLD` were defined as constants but never called; wired into `setupFolding()`.

#### Undo improvements
- `Ctrl+Z` no longer reverts past file load back to an empty buffer (`SCI_EMPTYUNDOBUFFER` called on open).
- Undo restores cursor position rather than jumping to end of document.

#### Plugin: JS/TS formatter
- **Plugins → JS/TS → Format JS/TS (oxfmt)** `Alt+Shift+F` — formats selected text or the full file using `oxfmt --write`. Writes to a temp file, runs oxfmt, reads result back, removes temp file.

#### Plugin: search cursor fix
- Clicking a search result scrolls to and places the cursor at the correct byte offset using `TextEncoder`-accurate positions.

#### Infrastructure
- Plugin folder resolves from the exe's own directory, not CWD — fixes `dist/editor.exe` loading plugins from the wrong location.
- `wndProc.close?.()` — safe no-op if the tjs version does not implement `JSCallback.close`.
