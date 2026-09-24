#!/usr/bin/env tjs
import { dlopen, JSCallback, types, bufferToPointer, read } from 'tjs:ffi';
import path from 'tjs:path';
import { PluginAPI, EventEmitter, loadPlugins } from './plugin-api-tjs.js';

// ── UTF-16LE helpers ──────────────────────────────────────────────────────────
function encodeWide(str) {
  const buf = new Uint8Array((str.length + 1) * 2);
  const view = new DataView(buf.buffer);
  for (let i = 0; i < str.length; i++) view.setUint16(i * 2, str.charCodeAt(i), true);
  return buf;
}

function decodeWide(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let s = '';
  for (let i = 0; i + 1 < buf.byteLength; i += 2) {
    const c = view.getUint16(i, true);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

// Convert a NativePointer to a BigInt (via its hex string representation)
const ptrToBigInt = (nptr) => nptr === null ? 0n : BigInt(nptr.toString());
// Convert NativePointer to a JS number for use as u64/i64 arguments
const ptrToNum = (nptr) => nptr === null ? 0 : Number(ptrToBigInt(nptr));

// Wrap a raw integer address (number or bigint) as a NativePointer for memory reads.
// Stores the address in a temporary buffer, then chases the pointer.
function addrToPtr(addr) {
  const ptrBuf = new Uint8Array(8);
  new DataView(ptrBuf.buffer).setBigUint64(0, BigInt(addr), true);
  return read.ptr(bufferToPointer(ptrBuf), 0);
}


const CS_HREDRAW          = 0x0002;
const CS_VREDRAW          = 0x0001;
const WS_OVERLAPPEDWINDOW = 0x00CF0000;
const WS_CLIPCHILDREN     = 0x02000000;
const WS_CHILD            = 0x40000000;
const WS_VISIBLE          = 0x10000000;
const WS_VSCROLL          = 0x00200000;
const WS_HSCROLL          = 0x00100000;
const SW_SHOW             = 5;
const SW_SHOWMAXIMIZED    = 3;
const PM_REMOVE           = 0x0001;
const WM_CREATE           = 0x0001;
const WM_DESTROY          = 0x0002;
const WM_SIZE             = 0x0005;
const WM_SETFOCUS         = 0x0007;
const WM_CLOSE            = 0x0010;
const WM_QUIT             = 0x0012;
const WM_COMMAND          = 0x0111;
const WM_NOTIFY           = 0x004E;
const CW_USEDEFAULT       = 0x8000_0000;
const IDC_ARROW           = 32512;
const MF_STRING           = 0x0000;
const MF_POPUP            = 0x0010;
const MF_SEPARATOR        = 0x0800;
const MF_GRAYED           = 0x0001;
const MF_CHECKED          = 0x0008;
const MF_UNCHECKED        = 0x0000;
const MF_BYCOMMAND        = 0x0000;

// MSG layout (x64: 48 bytes)
const MSG_SIZE           = 48;
const MSG_MESSAGE_OFFSET = 8;

// DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4 as pointer-sized integer
const DPI_V2 = -4n;

// ── Menu command IDs ─────────────────────────────────────────────────────────
const CMD_NEW        = 100;
const CMD_OPEN       = 101;
const CMD_SAVE       = 102;
const CMD_SAVE_AS    = 103;
const CMD_CLOSE      = 104;
const CMD_FONT_INC   = 105;
const CMD_FONT_DEC   = 106;
const CMD_FONT_FACE  = 107;
const CMD_WRAP       = 108;
const CMD_DETECT_LANG = 109;
const CMD_GOTO_PAIR   = 110;
const CMD_PLUGIN_BASE = 400;
const CMD_THEME_BASE  = 201;

// ── Accelerator constants ────────────────────────────────────────────────────
const FVIRTKEY  = 0x01;
const FCONTROL  = 0x08;
const FALT      = 0x10;
const ACCEL_SIZE = 6;

const VK_N        = 0x4E;
const VK_O        = 0x4F;
const VK_S        = 0x53;
const VK_LEFT     = 0x25;
const VK_OEM_PLUS = 0xBB;
const VK_OEM_MINUS = 0xBD;
const VK_ADD      = 0x6B;
const VK_SUBTRACT = 0x6D;

// ── Scintilla messages ───────────────────────────────────────────────────────
const SCI_SETTEXT         = 2181;
const SCI_GETTEXT         = 2182;
const SCI_GETTEXTLENGTH   = 2183;
const SCI_SETCODEPAGE     = 2037;
const SCI_SETSCROLLWIDTH         = 2274;
const SCI_SETSCROLLWIDTHTRACKING = 2516;
const SCI_SETMARGINTYPEN      = 2240;
const SCI_SETMARGINWIDTHN     = 2242;
const SCI_SETMARGINSENSITIVEN = 2246;
const SCI_SETMARGINMASKN      = 2244;
const SCI_MARKERDEFINE        = 2040;
const SCI_MARKERSETFORE       = 2041;
const SCI_MARKERSETBACK       = 2042;
const SCI_SETPROPERTY         = 4004;
const SCI_TOGGLEFOLD          = 2231;
const SCI_GETFOLDLEVEL        = 2223;
const SCI_LINEFROMPOSITION    = 2166;
const SCI_POSITIONFROMLINE    = 2167;
const SCI_GETLINEINDENTATION  = 2127;
const SCI_INSERTTEXT          = 2003;
const SCI_GETCURRENTPOS       = 2008;
const SCI_SCROLLCARET         = 2169;
const SCI_GETUSETABS          = 2125;
const SCI_GETTABWIDTH         = 2121;
const SCI_SETSEL              = 2160;
const SCI_GETCHARAT           = 2007;
const SCI_DELETERANGE         = 2645;
const SCI_BRACEHIGHLIGHT      = 2351;
const SCI_BRACEBADLIGHT       = 2352;
const SCI_BRACEMATCH          = 2353;
const STYLE_BRACELIGHT        = 34;
const STYLE_BRACEBAD          = 35;
const SCI_SETFOLDFLAGS        = 2233;
const SCI_SETAUTOMATICFOLD    = 4221;
const SC_MARGIN_NUMBER        = 1;
const SC_MARGIN_SYMBOL        = 0;
const SC_MASK_FOLDERS         = 0xFE000000;
const SC_FOLDLEVELHEADERFLAG  = 0x2000;
const SC_AUTOMATICFOLD_SHOW   = 1;
const SC_AUTOMATICFOLD_CLICK  = 2;
const MARKER_FOLDEREND        = 25;
const MARKER_FOLDEROPENMID    = 26;
const MARKER_FOLDERMIDTAIL    = 27;
const MARKER_FOLDERTAIL       = 28;
const MARKER_FOLDERSUB        = 29;
const MARKER_FOLDER           = 30;
const MARKER_FOLDEROPEN       = 31;
const SC_MARK_ARROW           = 2;
const SC_MARK_ARROWDOWN       = 6;
const SC_MARK_EMPTY           = 5;
const SC_MARK_VLINE           = 9;
const SC_MARK_LCORNER         = 10;
const SC_MARK_TCORNER         = 11;
const SC_MARK_BOXPLUS         = 12;
const SC_MARK_BOXPLUSCONNECTED  = 13;
const SC_MARK_BOXMINUS        = 14;
const SC_MARK_BOXMINUSCONNECTED = 15;
const SCI_STYLESETSIZE    = 2055;
const SCI_STYLESETFONT    = 2056;
const SCI_STYLESETBOLD    = 2053;
const SCI_TEXTWIDTH       = 2276;
const SCI_SETSAVEPOINT        = 2014;
const SCI_EMPTYUNDOBUFFER     = 2175;
const SCI_SETUNDOSELECTION    = 2763;
const SCI_SETILEXER       = 4033;
const SCI_SETKEYWORDS     = 4005;
const SCI_SETWRAPMODE     = 2268;
const SC_WRAP_NONE        = 0;
const SC_WRAP_WORD        = 1;
const SCI_STYLESETFORE    = 2051;
const SCI_STYLESETBACK    = 2052;
const SCI_STYLESETEOLFILLED = 2057;
const SCI_SETCARETLINEVISIBLE = 2097;
const SCI_SETCARETLINEBACK    = 2098;
const SCI_COLOURISE       = 4003;
const SCI_STYLECLEARALL   = 2050;
const SC_CP_UTF8          = 65001;
const STYLE_DEFAULT       = 32;
const STYLE_LINENUMBER    = 33;

const SCE_C_DEFAULT        = 0;
const SCE_C_COMMENT        = 1;
const SCE_C_COMMENTLINE    = 2;
const SCE_C_COMMENTDOC     = 3;
const SCE_C_NUMBER         = 4;
const SCE_C_WORD           = 5;
const SCE_C_STRING         = 6;
const SCE_C_CHARACTER      = 7;
const SCE_C_UUID           = 8;
const SCE_C_PREPROCESSOR   = 9;
const SCE_C_OPERATOR       = 10;
const SCE_C_IDENTIFIER     = 11;
const SCE_C_STRINGEOL      = 12;
const SCE_C_VERBATIM       = 13;
const SCE_C_REGEX          = 14;
const SCE_C_COMMENTLINEDOC = 15;
const SCE_C_WORD2          = 16;
const SCE_C_COMMENTDOCKEYWORD = 17;
const SCE_C_GLOBALCLASS    = 19;
const SCE_C_TEMPLATESTRING = 20;

const SCN_SAVEPOINTREACHED = 2002;
const SCN_SAVEPOINTLEFT    = 2003;
const SCN_MARGINCLICK      = 2010;
const SCN_UPDATEUI         = 2007;
const SCN_MODIFIED         = 2008;
const SCN_CHARADDED        = 2001;
const SC_MOD_INSERTTEXT    = 0x01;
const SC_MOD_DELETETEXT    = 0x02;
const SC_PERFORMED_USER    = 0x10;
const SC_PERFORMED_UNDO    = 0x20;
const SC_PERFORMED_REDO    = 0x40;

// ── JS/TS keyword sets ────────────────────────────────────────────────────────
const JS_KEYWORDS1 =
  'break case catch class const continue debugger default delete do else ' +
  'export extends false finally for from function get if import in instanceof ' +
  'let new null of package private protected public return set static super ' +
  'switch this throw true try typeof undefined var void while with yield ' +
  'async await enum declare abstract readonly type interface satisfies keyof ' +
  'infer never unknown any';

const JS_KEYWORDS2 =
  'Array Boolean Date Error Function JSON Map Math Number Object Promise ' +
  'RegExp Set String Symbol WeakMap WeakSet WeakRef console process Bun ' +
  'globalThis undefined NaN Infinity parseInt parseFloat isNaN isFinite ' +
  'setTimeout setInterval clearTimeout clearInterval fetch URL URLSearchParams ' +
  'Buffer Uint8Array Int32Array Float64Array Promise';

// ── Language detection ────────────────────────────────────────────────────────
const EXT_LEXER = {
  '.js':   'cpp', '.mjs': 'cpp', '.cjs': 'cpp',
  '.jsx':  'cpp', '.ts':  'cpp', '.tsx': 'cpp',
  '.mts':  'cpp', '.cts': 'cpp',
  '.c':    'cpp', '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp',
  '.h':    'cpp', '.hpp': 'cpp', '.hh': 'cpp',
  '.py':   'python',
  '.json': 'json', '.jsonc': 'json',
  '.md':   'markdown',
  '.css':  'css',
  '.html': 'hypertext', '.htm': 'hypertext',
  '.xml':  'xml',
  '.sh':   'bash', '.bash': 'bash',
  '.bat':  'batch', '.cmd': 'batch',
  '.sql':  'sql',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.lua':  'lua',
  '.rb':   'ruby',
  '.rs':   'rust',
};

function lexerForPath(filePath) {
  if (!filePath) return null;
  const dot = filePath.lastIndexOf('.');
  if (dot < 0) return null;
  return EXT_LEXER[filePath.slice(dot).toLowerCase()] ?? null;
}

function detectLexerFromContent(hwnd) {
  const totalLen = sciSend(hwnd, SCI_GETTEXTLENGTH, 0, 0);
  if (totalLen === 0) return null;
  const len = Math.min(totalLen, 2048);
  const buf = new Uint8Array(len + 1);
  sciSend(hwnd, SCI_GETTEXT, len + 1, buf);
  const text = new TextDecoder().decode(buf.subarray(0, len));
  const firstLine = text.slice(0, text.indexOf('\n') + 1 || 200);

  // Shebang
  if (firstLine.startsWith('#!')) {
    if (/python/.test(firstLine))    return 'python';
    if (/ruby|ruby/.test(firstLine)) return 'ruby';
    if (/node|bun|deno/.test(firstLine)) return 'cpp';
    if (/bash|sh/.test(firstLine))   return 'bash';
    if (/lua/.test(firstLine))       return 'lua';
  }
  // XML/HTML
  if (/^\s*<(!DOCTYPE\s+html|html[\s>])/i.test(text)) return 'hypertext';
  if (/^\s*<\?xml/i.test(text))  return 'xml';
  // JSON — don't try to parse (may be truncated); just check structural markers
  if (/^\s*[\[{]/.test(text) && /[:,]\s*[\n\r{}\[\]"]/.test(text)) return 'json';
  // Python
  if (/^(import |from |def |class |if __name__|async def )/m.test(text) &&
      !/{|}|;$/.test(text.slice(0, 300)))            return 'python';
  // JS/TS
  if (/(^|\n)(import |export |const |let |var |function |class |=>)/.test(text) &&
      /(;|=>|\bconst\b|\blet\b)/.test(text))         return 'cpp';
  // C/C++
  if (/#include\s*[<"]/.test(text))                  return 'cpp';
  // CSS
  if (/[a-z-]+\s*:\s*[^;{]+;/.test(text) && /{/.test(text) && !/</.test(text)) return 'css';
  // YAML
  if (/^---\s*$/m.test(text) || /^[a-zA-Z_][a-zA-Z0-9_]*:\s+\S/m.test(text)) return 'yaml';
  // Shell
  if (/^(if |for |while |case |function |echo |export |set -)/m.test(text)) return 'bash';
  // SQL
  if (/\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i.test(text)) return 'sql';
  // Lua
  if (/^(local |function |require\()/m.test(text) && /--/.test(text)) return 'lua';

  return null;
}

// COLORREF is 0x00BBGGRR
const rgb = (r, g, b) => r | (g << 8) | (b << 16);

// ── Theme definitions ─────────────────────────────────────────────────────────
const THEMES = {
  'Light (Default)': {
    bg:          rgb(255, 255, 255),
    fg:          rgb(0,   0,   0),
    linenoFg:    rgb(130, 130, 150),
    linoBg:      rgb(240, 240, 245),
    caretLineBg: rgb(232, 248, 232),
    comment:     rgb(0,   128,  0),
    string:      rgb(163,  21,  21),
    keyword:     rgb(0,    0,  255),
    number:      rgb(9,   134, 88),
    type:        rgb(38,  127, 153),
    func:        rgb(121,  94,  38),
    operator:    rgb(0,   0,   0),
    preproc:     rgb(155, 0,   173),
    regex:       rgb(215, 58,  73),
    globalcls:   rgb(38,  127, 153),
    braceLight:  rgb(0,   100, 200),
    braceLightBg:rgb(210, 235, 255),
    braceBad:    rgb(200,   0,   0),
    braceBadBg:  rgb(255, 210, 210),
  },
  'Dark (Dracula)': {
    bg:          rgb(40,  42,  54),
    fg:          rgb(248, 248, 242),
    linenoFg:    rgb(100, 110, 130),
    linoBg:      rgb(34,  36,  46),
    caretLineBg: rgb(48,  56,  44),
    comment:     rgb(98,  114, 164),
    string:      rgb(241, 250, 140),
    keyword:     rgb(139, 233, 253),
    number:      rgb(189, 147, 249),
    type:        rgb(139, 233, 253),
    func:        rgb(80,  250, 123),
    operator:    rgb(255, 121, 198),
    preproc:     rgb(255, 121, 198),
    regex:       rgb(255, 184, 108),
    globalcls:   rgb(80,  250, 123),
    braceLight:  rgb(80,  250, 123),
    braceLightBg:rgb(50,  65,  50),
    braceBad:    rgb(255, 85,  85),
    braceBadBg:  rgb(70,  40,  40),
  },
  'Dark (One Dark)': {
    bg:          rgb(40,  44,  52),
    fg:          rgb(171, 178, 191),
    linenoFg:    rgb(90,  99,  116),
    linoBg:      rgb(33,  37,  43),
    caretLineBg: rgb(44,  56,  44),
    comment:     rgb(92,  99,  112),
    string:      rgb(152, 195, 121),
    keyword:     rgb(198, 120, 221),
    number:      rgb(209, 154, 102),
    type:        rgb(229, 192, 123),
    func:        rgb(97,  175, 239),
    operator:    rgb(171, 178, 191),
    preproc:     rgb(224,  108, 117),
    regex:       rgb(86,  182, 194),
    globalcls:   rgb(229, 192, 123),
    braceLight:  rgb(97,  175, 239),
    braceLightBg:rgb(44,  56,  68),
    braceBad:    rgb(224, 108, 117),
    braceBadBg:  rgb(60,  40,  44),
  },
  'Solarized Light': {
    bg:          rgb(253, 246, 227),
    fg:          rgb(101, 123, 131),
    linenoFg:    rgb(147, 161, 161),
    linoBg:      rgb(238, 232, 213),
    caretLineBg: rgb(235, 245, 220),
    comment:     rgb(147, 161, 161),
    string:      rgb(42,  161, 152),
    keyword:     rgb(133, 153,   0),
    number:      rgb(211, 54,  130),
    type:        rgb(181, 137,   0),
    func:        rgb(38,  139, 210),
    operator:    rgb(101, 123, 131),
    preproc:     rgb(203,  75,  22),
    regex:       rgb(42,  161, 152),
    globalcls:   rgb(181, 137,   0),
    braceLight:  rgb(38,  139, 210),
    braceLightBg:rgb(230, 240, 250),
    braceBad:    rgb(203,  75,  22),
    braceBadBg:  rgb(255, 230, 215),
  },
};

const THEME_NAMES = Object.keys(THEMES);
let activeTheme = THEME_NAMES[0];
let fontSize = 11;
let fontFace = 'Consolas';
let fontBold  = false;
let wordWrap  = false;

let fontBuf = new TextEncoder().encode(fontFace + '\0');
function rebuildFontBuf() {
  fontBuf = new TextEncoder().encode(fontFace + '\0');
}

// ── Profiling (--profile flag) ────────────────────────────────────────────────
const _exeBasenameEarly = path.basename(tjs.args[0]).toLowerCase();
const _isCompiledEarly  = !_exeBasenameEarly.includes('tjs');
const PROFILE = tjs.args.slice(_isCompiledEarly ? 1 : 3).includes('--profile');
const _profStart0 = PROFILE ? performance.now() : 0;
let _profLast0 = _profStart0;
function prof(label) {
  if (!PROFILE) return;
  const now = performance.now();
  console.log(`[profile] ${label}: +${(now - _profLast0).toFixed(1)}ms  total=${(now - _profStart0).toFixed(1)}ms`);
  _profLast0 = now;
}

// ── config.ini read/write ─────────────────────────────────────────────────────
const APP_DIR = (() => {
  const fromMeta = path.dirname(import.meta.url.replace(/^file:\/\//i, ''));
  // In a compiled exe, import.meta.url is just the bundle filename (no directory).
  // Fall back to the exe's own directory in that case.
  return (fromMeta === '.' || fromMeta === '') ? path.dirname(tjs.exePath) : fromMeta;
})();
const CONFIG_PATH = path.join(APP_DIR, 'config.ini');

async function loadConfig() {
  try {
    const raw  = await tjs.readFile(CONFIG_PATH);
    const text = new TextDecoder().decode(raw);
    const mt = text.match(/^theme\s*=\s*(.+)$/im);
    if (mt) { const name = mt[1].trim(); if (THEMES[name]) activeTheme = name; }
    const mf = text.match(/^fontsize\s*=\s*(\d+)$/im);
    if (mf) { const size = parseInt(mf[1], 10); if (size >= 6 && size <= 72) fontSize = size; }
    const mff = text.match(/^fontface\s*=\s*(.+)$/im);
    if (mff) { const face = mff[1].trim(); if (face.length > 0 && face.length <= 31) { fontFace = face; rebuildFontBuf(); } }
    const mfb = text.match(/^fontbold\s*=\s*(.+)$/im);
    if (mfb) fontBold = mfb[1].trim() === 'true';
    const mw = text.match(/^wordwrap\s*=\s*(.+)$/im);
    if (mw) wordWrap = mw[1].trim() === 'true';
  } catch {}
}

async function saveConfig() {
  const text = `[editor]\ntheme=${activeTheme}\nfontsize=${fontSize}\nfontface=${fontFace}\nfontbold=${fontBold}\nwordwrap=${wordWrap}\n`;
  await tjs.writeFile(CONFIG_PATH, new TextEncoder().encode(text));
}

// ── DLL bindings ──────────────────────────────────────────────────────────────
const _user32 = dlopen('user32.dll', {
  LoadCursorW:                   { args: ['ptr', 'ptr'],                                                              returns: 'ptr' },
  SetProcessDpiAwarenessContext: { args: ['i64'],                                                              returns: 'u32' },
  RegisterClassExW:              { args: ['ptr'],                                                              returns: 'u16' },
  CreateWindowExW:               { args: ['u32', 'ptr', 'ptr', 'u32', 'i32', 'i32', 'i32', 'i32', 'ptr', 'ptr', 'ptr', 'ptr'], returns: 'ptr' },
  ShowWindow:                    { args: ['ptr', 'i32'],                                                       returns: 'u32' },
  UpdateWindow:                  { args: ['ptr'],                                                              returns: 'u32' },
  SetWindowTextW:                { args: ['ptr', 'ptr'],                                                       returns: 'u32' },
  GetMenu:                       { args: ['ptr'],                                                              returns: 'ptr' },
  GetSubMenu:                    { args: ['ptr', 'i32'],                                                       returns: 'ptr' },
  CreateMenu:                    { args: [],                                                                   returns: 'ptr' },
  CreatePopupMenu:               { args: [],                                                                   returns: 'ptr' },
  AppendMenuW:                   { args: ['ptr', 'u32', 'u64', 'ptr'],                                         returns: 'u32' },
  InsertMenuW:                   { args: ['ptr', 'u32', 'u32', 'u64', 'ptr'],                                  returns: 'u32' },
  DeleteMenu:                    { args: ['ptr', 'u32', 'u32'],                                                returns: 'u32' },
  DrawMenuBar:                   { args: ['ptr'],                                                              returns: 'u32' },
  SetMenu:                       { args: ['ptr', 'ptr'],                                                       returns: 'u32' },
  CheckMenuItem:                 { args: ['ptr', 'u32', 'u32'],                                                returns: 'u32' },
  CreateAcceleratorTableW:       { args: ['ptr', 'i32'],                                                       returns: 'ptr' },
  TranslateAcceleratorW:         { args: ['ptr', 'ptr', 'ptr'],                                                returns: 'i32' },
  SetFocus:                      { args: ['ptr'],                                                              returns: 'ptr' },
  SendMessageW:                  { args: ['ptr', 'u32', 'ptr', 'ptr'],                                         returns: 'ptr' },
  PostMessageW:                  { args: ['ptr', 'u32', 'ptr', 'ptr'],                                         returns: 'u32' },
  MessageBoxW:                   { args: ['ptr', 'ptr', 'ptr', 'u32'],                                         returns: 'i32' },
  DefWindowProcW:                { args: ['ptr', 'u32', 'ptr', 'i64'],                                         returns: 'i64' },
  DestroyWindow:                 { args: ['ptr'],                                                              returns: 'u32' },
  PostQuitMessage:               { args: ['i32'],                                                              returns: 'void' },
  MoveWindow:                    { args: ['ptr', 'i32', 'i32', 'i32', 'i32', 'u32'],                           returns: 'u32' },
  GetClientRect:                 { args: ['ptr', 'ptr'],                                                       returns: 'u32' },
  PeekMessageW:                  { args: ['ptr', 'ptr', 'u32', 'u32', 'u32'],                                  returns: 'u32' },
  TranslateMessage:              { args: ['ptr'],                                                              returns: 'u32' },
  DispatchMessageW:              { args: ['ptr'],                                                              returns: 'i64' },
});
const User32 = _user32.symbols;

const _kernel32 = dlopen('kernel32.dll', {
  LoadLibraryW: { args: ['ptr'], returns: 'ptr' },
});
const Kernel32 = _kernel32.symbols;

const _comdlg32 = dlopen('comdlg32.dll', {
  GetOpenFileNameW: { args: ['ptr'], returns: 'u32' },
  GetSaveFileNameW: { args: ['ptr'], returns: 'u32' },
  ChooseFontW:      { args: ['ptr'], returns: 'u32' },
});
const Comdlg32 = _comdlg32.symbols;

// ── WNDCLASSEXW packer (80 bytes on x64) ─────────────────────────────────────
function packWndClassEx(wndProcAddr, classNameBuf, style, hbrBackground = 0n) {
  const buf  = new Uint8Array(80);
  const view = new DataView(buf.buffer);
  view.setUint32(0, 80, true);                                           // cbSize
  view.setUint32(4, style, true);                                        // style
  view.setBigUint64(8, ptrToBigInt(wndProcAddr), true);                         // lpfnWndProc
  view.setInt32(16, 0, true);                                            // cbClsExtra
  view.setInt32(20, 0, true);                                            // cbWndExtra
  view.setBigUint64(24, 0n, true);                                       // hInstance
  view.setBigUint64(32, 0n, true);                                       // hIcon
  view.setBigUint64(40, 0n, true);                                       // hCursor — filled after
  view.setBigUint64(48, hbrBackground, true);                            // hbrBackground
  view.setBigUint64(56, 0n, true);                                       // lpszMenuName
  view.setBigUint64(64, ptrToBigInt(bufferToPointer(classNameBuf)), true);      // lpszClassName
  view.setBigUint64(72, 0n, true);                                       // hIconSm
  return buf;
}

// ── App state ─────────────────────────────────────────────────────────────────
let hMainWnd    = null;
let hSciWnd     = null;
let running     = true;
let currentPath = null;
let isDirty     = false;
let _undoRedoPending = false;

// ── sciSend helper ────────────────────────────────────────────────────────────
// Sends a Scintilla message. wParam/lParam can be: number, bigint, Uint8Array, NativePointer.
// SendMessageW is declared 'ptr','ptr' for wParam/lParam to avoid u64/i64 number issues.
const toPtr = (v) => {
  if (v instanceof Uint8Array) return bufferToPointer(v);
  if (v && typeof v === 'object' && typeof v.toString === 'function' && v.toString().startsWith('0x')) return v; // NativePointer
  return addrToPtr(typeof v === 'bigint' ? v : BigInt(v));
};
const sciSend = (hwnd, msg, wParam, lParam = 0) =>
  ptrToNum(User32.SendMessageW(hwnd, msg, toPtr(wParam), toPtr(lParam)));

// ── Plugin system ─────────────────────────────────────────────────────────────
const pluginEmitter = new EventEmitter();
let   pluginAPIs    = [];

function makePluginAPI(pluginName) {
  const api = new PluginAPI();
  api._pluginName = pluginName ?? '';
  api._rawSend = (msg, wParam = 0, lParam = 0) => sciSend(hSciWnd, msg, wParam, lParam);
  api._emitter = pluginEmitter;
  api._hMain   = () => hMainWnd;
  api._state   = {
    get currentPath() { return currentPath; },
    get isDirty()     { return isDirty; },
    get activeTheme() { return activeTheme; },
    get fontSize()    { return fontSize; },
  };
  return api;
}

let _changeTimer = null;
function emitChange() {
  if (_changeTimer) clearTimeout(_changeTimer);
  _changeTimer = setTimeout(() => { _changeTimer = null; pluginEmitter.emit('change'); }, 150);
}

// ── Enable Per-Monitor DPI awareness ─────────────────────────────────────────
User32.SetProcessDpiAwarenessContext(-4); // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2

// ── Load Scintilla.dll and Lexilla.dll ────────────────────────────────────────
const scintillaDllBuf = encodeWide(path.join(APP_DIR, 'Scintilla.dll'));
const hScintilla = Kernel32.LoadLibraryW(scintillaDllBuf);
if (!hScintilla) {
  console.error('Failed to load Scintilla.dll');
  tjs.exit(1);
}

const _lexilla = dlopen(path.join(APP_DIR, 'Lexilla.dll'), {
  CreateLexer: { args: ['string'], returns: 'ptr' },
});

// ── Apply theme + lexer to Scintilla window ───────────────────────────────────
function applyWordWrap(hwnd, hWin) {
  sciSend(hwnd, SCI_SETWRAPMODE, wordWrap ? SC_WRAP_WORD : SC_WRAP_NONE, 0);
  const hMenuBar = User32.GetMenu(hWin || hMainWnd);
  if (!hMenuBar) return;
  const hViewMenu = User32.GetSubMenu(hMenuBar, 1);
  if (!hViewMenu) return;
  User32.CheckMenuItem(hViewMenu, CMD_WRAP, MF_BYCOMMAND | (wordWrap ? MF_CHECKED : MF_UNCHECKED));
}

function cmdGotoPair() {
  const OPEN  = new Set([40, 91, 123]); // ( [ {
  const CLOSE = new Set([41, 93, 125]); // ) ] }
  const PAIRS = { 40:41, 91:93, 123:125, 41:40, 93:91, 125:123 };
  const QUOTES = new Set([34, 39, 96]); // " ' `

  const pos = sciSend(hSciWnd, SCI_GETCURRENTPOS, 0, 0);
  const totalLen = sciSend(hSciWnd, SCI_GETTEXTLENGTH, 0, 0);

  const buf = new Uint8Array(totalLen + 1);
  sciSend(hSciWnd, SCI_GETTEXT, totalLen + 1, buf);

  // Find brace at or just before cursor
  let bracePos = -1, braceCode = 0;
  if (pos > 0) {
    const ch = buf[pos - 1];
    if (OPEN.has(ch) || CLOSE.has(ch)) { bracePos = pos - 1; braceCode = ch; }
  }
  if (bracePos < 0 && pos < totalLen) {
    const ch = buf[pos];
    if (OPEN.has(ch) || CLOSE.has(ch)) { bracePos = pos; braceCode = ch; }
  }
  if (bracePos < 0) return;

  // Build inString map by scanning forward from start
  const inString = new Uint8Array(totalLen);
  let inStr = 0;
  for (let i = 0; i < totalLen; i++) {
    const c = buf[i];
    if (inStr) {
      inString[i] = 1;
      if (c === 92) { i++; if (i < totalLen) inString[i] = 1; continue; } // backslash escape
      if (c === inStr) inStr = 0;
    } else if (QUOTES.has(c)) {
      inStr = c;
    }
  }

  const partner = PAIRS[braceCode];
  const forward = OPEN.has(braceCode);
  let depth = 0;

  if (forward) {
    for (let i = bracePos; i < totalLen; i++) {
      if (inString[i]) continue;
      const c = buf[i];
      if (c === braceCode) depth++;
      else if (c === partner && --depth === 0) {
        sciSend(hSciWnd, SCI_SETSEL, i, i);
        sciSend(hSciWnd, SCI_SCROLLCARET, 0, 0);
        return;
      }
    }
  } else {
    for (let i = bracePos; i >= 0; i--) {
      if (inString[i]) continue;
      const c = buf[i];
      if (c === braceCode) depth++;
      else if (c === partner && --depth === 0) {
        sciSend(hSciWnd, SCI_SETSEL, i, i);
        sciSend(hSciWnd, SCI_SCROLLCARET, 0, 0);
        return;
      }
    }
  }
}

function cmdToggleWrap() {
  wordWrap = !wordWrap;
  applyWordWrap(hSciWnd);
  saveConfig().catch(console.error);
}

function applyFoldMarkerColors(hwnd) {
  const t  = THEMES[activeTheme];
  sciSend(hwnd, SCI_MARKERDEFINE, MARKER_FOLDER,        SC_MARK_BOXPLUS);
  sciSend(hwnd, SCI_MARKERDEFINE, MARKER_FOLDEROPEN,    SC_MARK_BOXMINUS);
  sciSend(hwnd, SCI_MARKERDEFINE, MARKER_FOLDERSUB,     SC_MARK_VLINE);
  sciSend(hwnd, SCI_MARKERDEFINE, MARKER_FOLDERTAIL,    SC_MARK_LCORNER);
  sciSend(hwnd, SCI_MARKERDEFINE, MARKER_FOLDEREND,     SC_MARK_BOXPLUSCONNECTED);
  sciSend(hwnd, SCI_MARKERDEFINE, MARKER_FOLDEROPENMID, SC_MARK_BOXMINUSCONNECTED);
  sciSend(hwnd, SCI_MARKERDEFINE, MARKER_FOLDERMIDTAIL, SC_MARK_TCORNER);
  for (const m of [MARKER_FOLDER, MARKER_FOLDEROPEN, MARKER_FOLDERSUB,
      MARKER_FOLDERTAIL, MARKER_FOLDEREND, MARKER_FOLDEROPENMID, MARKER_FOLDERMIDTAIL]) {
    sciSend(hwnd, SCI_MARKERSETFORE, m, t.linoBg);
    sciSend(hwnd, SCI_MARKERSETBACK, m, t.linenoFg);
  }
}

function applyThemeStyles(hwnd) {
  const t = THEMES[activeTheme];
  sciSend(hwnd, SCI_STYLESETFONT, STYLE_DEFAULT, fontBuf);
  sciSend(hwnd, SCI_STYLESETSIZE, STYLE_DEFAULT, fontSize);
  sciSend(hwnd, SCI_STYLESETBOLD, STYLE_DEFAULT, fontBold ? 1 : 0);
  sciSend(hwnd, SCI_STYLESETFORE, STYLE_DEFAULT, t.fg);
  sciSend(hwnd, SCI_STYLESETBACK, STYLE_DEFAULT, t.bg);
  sciSend(hwnd, SCI_STYLECLEARALL, 0, 0);
  sciSend(hwnd, SCI_STYLESETFORE, STYLE_LINENUMBER, t.linenoFg);
  sciSend(hwnd, SCI_STYLESETBACK, STYLE_LINENUMBER, t.linoBg);
  sciSend(hwnd, SCI_SETCARETLINEBACK, t.caretLineBg, 0);
  sciSend(hwnd, SCI_SETCARETLINEVISIBLE, 1, 0);
  sciSend(hwnd, SCI_STYLESETFORE, STYLE_BRACELIGHT, t.braceLight);
  sciSend(hwnd, SCI_STYLESETBACK, STYLE_BRACELIGHT, t.braceLightBg);
  sciSend(hwnd, SCI_STYLESETBOLD, STYLE_BRACELIGHT, 1);
  sciSend(hwnd, SCI_STYLESETFORE, STYLE_BRACEBAD,   t.braceBad);
  sciSend(hwnd, SCI_STYLESETBACK, STYLE_BRACEBAD,   t.braceBadBg);
  sciSend(hwnd, SCI_STYLESETBOLD, STYLE_BRACEBAD,   1);
  applyFoldMarkerColors(hwnd);
}

function updateBraceHighlight(hwnd) {
  const BRACES = new Set(['(',')','{','}','[',']']);
  const pos = sciSend(hwnd, SCI_GETCURRENTPOS, 0, 0);
  let bracePos = -1;
  if (pos > 0) {
    const chBefore = sciSend(hwnd, SCI_GETCHARAT, pos - 1, 0);
    if (BRACES.has(String.fromCharCode(chBefore))) bracePos = pos - 1;
  }
  if (bracePos < 0) {
    const chAt = sciSend(hwnd, SCI_GETCHARAT, pos, 0);
    if (BRACES.has(String.fromCharCode(chAt))) bracePos = pos;
  }
  if (bracePos >= 0) {
    const match = sciSend(hwnd, SCI_BRACEMATCH, bracePos, 1);
    if (match >= 0) {
      sciSend(hwnd, SCI_BRACEHIGHLIGHT, bracePos, match);
    } else {
      sciSend(hwnd, SCI_BRACEBADLIGHT, bracePos, 0);
    }
  } else {
    sciSend(hwnd, SCI_BRACEHIGHLIGHT, -1, -1);
  }
}

function applyCppStyles(hwnd) {
  const t = THEMES[activeTheme];
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_COMMENT,        t.comment);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_COMMENTLINE,    t.comment);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_COMMENTDOC,     t.comment);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_COMMENTLINEDOC, t.comment);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_STRING,         t.string);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_CHARACTER,      t.string);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_TEMPLATESTRING, t.string);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_VERBATIM,       t.string);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_STRINGEOL,      t.preproc);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_NUMBER,         t.number);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_WORD,           t.keyword);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_WORD2,          t.func);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_PREPROCESSOR,   t.preproc);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_OPERATOR,       t.operator);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_REGEX,          t.regex);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_GLOBALCLASS,    t.globalcls);
}

const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10 MB

function applyLexer(hwnd, filePath) {
  const docLen = sciSend(hwnd, SCI_GETTEXTLENGTH, 0, 0);
  const isLarge = docLen >= LARGE_FILE_THRESHOLD;

  const name = lexerForPath(filePath) ?? detectLexerFromContent(hwnd);
  const lexerPtr = _lexilla.symbols.CreateLexer(name ?? 'null');
  sciSend(hwnd, SCI_SETILEXER, 0, ptrToNum(lexerPtr));

  const foldKey    = new TextEncoder().encode('fold\0');
  const foldVal    = new TextEncoder().encode('1\0');
  const compactKey = new TextEncoder().encode('fold.compact\0');
  const compactVal = new TextEncoder().encode('0\0');
  sciSend(hwnd, SCI_SETPROPERTY, foldKey,    foldVal);
  sciSend(hwnd, SCI_SETPROPERTY, compactKey, compactVal);

  applyThemeStyles(hwnd);
  if (name === 'cpp') {
    applyCppStyles(hwnd);
    const kw1Buf = new TextEncoder().encode(JS_KEYWORDS1 + '\0');
    const kw2Buf = new TextEncoder().encode(JS_KEYWORDS2 + '\0');
    sciSend(hwnd, SCI_SETKEYWORDS, 0, kw1Buf);
    sciSend(hwnd, SCI_SETKEYWORDS, 1, kw2Buf);
  }

  if (isLarge) {
    console.log(`[editor] large file (${(docLen/1024/1024).toFixed(1)} MB) — syntax highlight deferred`);
  } else {
    sciSend(hwnd, SCI_COLOURISE, 0, -1);
  }
}

function setFontSize(hwnd, delta) {
  fontSize = Math.max(6, Math.min(72, fontSize + delta));
  applyLexer(hwnd, currentPath);
}

// ── Font face dialog (ChooseFontW) ────────────────────────────────────────────
const LOGFONTW_SIZE    = 92;
const LF_FACENAME_OFF  = 28;
const CHOOSEFONTW_SIZE = 104;
const CF_SCREENFONTS         = 0x00000001;
const CF_INITTOLOGFONTSTRUCT = 0x00000040;
const CF_TTONLY              = 0x00040000;
const CF_LIMITSIZE           = 0x00002000;

function cmdFontFace(hwnd) {
  const logFont = new Uint8Array(LOGFONTW_SIZE);
  const lfView  = new DataView(logFont.buffer);
  lfView.setInt32(0, -fontSize, true);               // lfHeight
  lfView.setInt32(16, fontBold ? 700 : 400, true);   // lfWeight
  // lfFaceName as UTF-16LE at offset 28
  for (let i = 0; i < fontFace.length && i < 31; i++)
    lfView.setUint16(LF_FACENAME_OFF + i * 2, fontFace.charCodeAt(i), true);

  const cf   = new Uint8Array(CHOOSEFONTW_SIZE);
  const view = new DataView(cf.buffer);
  view.setUint32(0, CHOOSEFONTW_SIZE, true);                           // lStructSize
  view.setBigUint64(8, ptrToBigInt(hwnd), true);                              // hwndOwner
  view.setBigUint64(24, ptrToBigInt(bufferToPointer(logFont)), true);         // lpLogFont
  view.setUint32(36, CF_SCREENFONTS | CF_INITTOLOGFONTSTRUCT | CF_TTONLY, true); // Flags

  if (!Comdlg32.ChooseFontW(cf)) return;

  const faceBuf = logFont.subarray(LF_FACENAME_OFF, LF_FACENAME_OFF + 64);
  const face = decodeWide(faceBuf);
  const ptSize = view.getInt32(32, true); // iPointSize in tenths of a point
  const newSize = Math.max(6, Math.min(72, Math.round(ptSize / 10)));
  const weight = lfView.getInt32(16, true);

  fontFace = face || fontFace;
  fontSize = newSize;
  fontBold  = weight >= 600;
  rebuildFontBuf();
  applyLexer(hwnd, currentPath);
}

// ── OPENFILENAMEW helpers ─────────────────────────────────────────────────────
const OPENFILENAMEW_SIZE = 152;
const PATH_BUF_CHARS     = 1024;
const TITLE_BUF_CHARS    = 260;
const ALL_FILTER         = encodeWide('All Files (*.*)\0*.*\0');

function packOFN(ownerHwnd, fileBuf, fileTitleBuf, titleBuf, initialDirBuf, flags, filterBuf) {
  const ofn  = new Uint8Array(OPENFILENAMEW_SIZE);
  const view = new DataView(ofn.buffer);
  view.setUint32(0x00, OPENFILENAMEW_SIZE, true);
  view.setBigUint64(0x08, ptrToBigInt(ownerHwnd), true);
  view.setBigUint64(0x18, ptrToBigInt(bufferToPointer(filterBuf)), true);
  view.setUint32(0x2c, 1, true);
  view.setBigUint64(0x30, ptrToBigInt(bufferToPointer(fileBuf)), true);
  view.setUint32(0x38, PATH_BUF_CHARS, true);
  view.setBigUint64(0x40, ptrToBigInt(bufferToPointer(fileTitleBuf)), true);
  view.setUint32(0x48, TITLE_BUF_CHARS, true);
  if (initialDirBuf) view.setBigUint64(0x50, ptrToBigInt(bufferToPointer(initialDirBuf)), true);
  view.setBigUint64(0x58, ptrToBigInt(bufferToPointer(titleBuf)), true);
  view.setUint32(0x60, flags, true);
  return ofn;
}

function showOpenDialog(ownerHwnd) {
  const fileBuf      = new Uint8Array(PATH_BUF_CHARS * 2);
  const fileTitleBuf = new Uint8Array(TITLE_BUF_CHARS * 2);
  const titleBuf     = encodeWide('Open File');
  const dirBuf       = encodeWide(tjs.cwd);
  const OFN_EXPLORER      = 0x0008_0000;
  const OFN_FILEMUSTEXIST = 0x0000_1000;
  const OFN_PATHMUSTEXIST = 0x0000_0800;
  const OFN_HIDEREADONLY  = 0x0000_0004;
  const ofn = packOFN(ownerHwnd, fileBuf, fileTitleBuf, titleBuf, dirBuf,
    OFN_EXPLORER | OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_HIDEREADONLY, ALL_FILTER);
  if (!Comdlg32.GetOpenFileNameW(ofn)) return null;
  return decodeWide(fileBuf);
}

function showSaveAsDialog(ownerHwnd, curPath) {
  const fileBuf      = new Uint8Array(PATH_BUF_CHARS * 2);
  const fileTitleBuf = new Uint8Array(TITLE_BUF_CHARS * 2);
  const titleBuf     = encodeWide('Save As');
  const dirStr       = curPath
    ? curPath.replace(/[\\/][^\\/]+$/, '') || tjs.cwd
    : tjs.cwd;
  const dirBuf = encodeWide(dirStr);
  if (curPath) {
    const curWide = encodeWide(curPath);
    fileBuf.set(curWide.subarray(0, Math.min(curWide.length, fileBuf.length)));
  }
  const OFN_EXPLORER        = 0x0008_0000;
  const OFN_OVERWRITEPROMPT = 0x0000_0002;
  const OFN_HIDEREADONLY    = 0x0000_0004;
  const OFN_PATHMUSTEXIST   = 0x0000_0800;
  const ofn = packOFN(ownerHwnd, fileBuf, fileTitleBuf, titleBuf, dirBuf,
    OFN_EXPLORER | OFN_OVERWRITEPROMPT | OFN_HIDEREADONLY | OFN_PATHMUSTEXIST, ALL_FILTER);
  if (!Comdlg32.GetSaveFileNameW(ofn)) return null;
  return decodeWide(fileBuf);
}

// ── Title helper ──────────────────────────────────────────────────────────────
function refreshTitle() {
  const name  = currentPath ?? 'Untitled';
  const dirty = isDirty ? ' *' : '';
  const buf   = encodeWide(`TjsSciEditor - ${name}${dirty}`);
  User32.SetWindowTextW(hMainWnd, buf);
}

// ── Get text from Scintilla ───────────────────────────────────────────────────
function getSciText() {
  const len = sciSend(hSciWnd, SCI_GETTEXTLENGTH, 0, 0);
  const buf = new Uint8Array(len + 1);
  sciSend(hSciWnd, SCI_GETTEXT, len + 1, buf);
  return new TextDecoder().decode(buf.subarray(0, len));
}

// ── File operations ───────────────────────────────────────────────────────────
async function cmdNew() {
  if (isDirty) {
    const MB_YESNOCANCEL = 3, MB_ICONQUESTION = 0x20;
    const titleBuf = encodeWide('Unsaved Changes');
    const textBuf  = encodeWide('Save changes before creating a new file?');
    const r = User32.MessageBoxW(hMainWnd, textBuf, titleBuf, MB_YESNOCANCEL | MB_ICONQUESTION);
    if (r === 2) return;
    if (r === 6) await cmdSave();
  }
  sciSend(hSciWnd, SCI_SETTEXT, 0, new TextEncoder().encode('\0'));
  applyLexer(hSciWnd, null);
  sciSend(hSciWnd, SCI_SETSAVEPOINT, 0, 0);
  sciSend(hSciWnd, SCI_EMPTYUNDOBUFFER, 0, 0);
  currentPath = null;
  isDirty = false;
  refreshTitle();
  pluginEmitter.emit('open', null);
}

// Detect encoding from BOM. Returns { encoding, bomLen } or null for UTF-8/no-BOM.
function detectBomEncoding(bytes) {
  if (bytes[0] === 0xFF && bytes[1] === 0xFE && bytes[2] === 0x00 && bytes[3] === 0x00)
    return { encoding: 'utf-32le', bomLen: 4 };
  if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0xFE && bytes[3] === 0xFF)
    return { encoding: 'utf-32be', bomLen: 4 };
  if (bytes[0] === 0xFF && bytes[1] === 0xFE)
    return { encoding: 'utf-16le', bomLen: 2 };
  if (bytes[0] === 0xFE && bytes[1] === 0xFF)
    return { encoding: 'utf-16be', bomLen: 2 };
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF)
    return { encoding: 'utf-8-bom', bomLen: 3 };
  return null;
}

async function cmdOpenPath(filePath) {
  try {
    prof('cmdOpenPath: start');
    const raw  = await tjs.readFile(filePath);
    prof('cmdOpenPath: readFile');

    let fileBytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    const bom = detectBomEncoding(fileBytes);

    if (bom && bom.encoding !== 'utf-8-bom') {
      const MB_YESNO = 0x04, MB_ICONWARNING = 0x30, IDYES = 6;
      const titleBuf = encodeWide('Encoding Warning');
      const textBuf  = encodeWide(
        `"${filePath}"\n\nFile appears to be ${bom.encoding.toUpperCase()} (BOM detected).\n` +
        `Scintilla only supports UTF-8.\n\nConvert to UTF-8 and open?`
      );
      const r = User32.MessageBoxW(hMainWnd, textBuf, titleBuf, MB_YESNO | MB_ICONWARNING);
      if (r !== IDYES) return;
      const stripped = fileBytes.subarray(bom.bomLen);
      const text = new TextDecoder(bom.encoding).decode(stripped);
      fileBytes = new TextEncoder().encode(text);
      prof('cmdOpenPath: encoding conversion');
    } else if (bom && bom.encoding === 'utf-8-bom') {
      fileBytes = fileBytes.subarray(3);
    }

    // Append NUL byte directly — avoids TextDecoder+TextEncoder round-trip
    const buf = new Uint8Array(fileBytes.byteLength + 1);
    buf.set(fileBytes);
    prof('cmdOpenPath: build buf');
    sciSend(hSciWnd, SCI_SETTEXT, 0, buf);
    prof('cmdOpenPath: SCI_SETTEXT');
    applyLexer(hSciWnd, filePath);
    prof('cmdOpenPath: applyLexer');
    sciSend(hSciWnd, SCI_SETSAVEPOINT, 0, 0);
    sciSend(hSciWnd, SCI_EMPTYUNDOBUFFER, 0, 0);
    currentPath = filePath;
    isDirty = false;
    refreshTitle();
    pluginEmitter.emit('open', filePath);
  } catch (e) {
    console.error('Open failed:', e.message);
  }
}

async function cmdOpen() {
  const filePath = showOpenDialog(hMainWnd);
  if (!filePath) return;
  await cmdOpenPath(filePath);
}

async function cmdSave() {
  if (!currentPath) { await cmdSaveAs(); return; }
  try {
    await tjs.writeFile(currentPath, new TextEncoder().encode(getSciText()));
    sciSend(hSciWnd, SCI_SETSAVEPOINT, 0, 0);
    isDirty = false;
    refreshTitle();
    pluginEmitter.emit('save', currentPath);
  } catch (e) {
    console.error('Save failed:', e.message);
  }
}

async function cmdSaveAs() {
  const filePath = showSaveAsDialog(hMainWnd, currentPath);
  if (!filePath) return;
  try {
    await tjs.writeFile(filePath, new TextEncoder().encode(getSciText()));
    sciSend(hSciWnd, SCI_SETSAVEPOINT, 0, 0);
    currentPath = filePath;
    isDirty = false;
    refreshTitle();
    pluginEmitter.emit('save', currentPath);
  } catch (e) {
    console.error('Save As failed:', e.message);
  }
}

function promptSaveIfDirty() {
  if (!isDirty) return true;
  const name   = currentPath ?? 'Untitled';
  const textBuf = encodeWide(`"${name}" has unsaved changes.\nDo you want to save before closing?`);
  const capBuf  = encodeWide('TjsSciEditor');
  const MB_YESNOCANCEL  = 0x00000003;
  const MB_ICONQUESTION = 0x00000020;
  const result = User32.MessageBoxW(hMainWnd, textBuf, capBuf, MB_YESNOCANCEL | MB_ICONQUESTION);
  if (result === 6) { cmdSave().catch(console.error); return !isDirty; }
  if (result === 7) return true;
  return false;
}

// ── Build accelerator table ───────────────────────────────────────────────────
function buildAccelTable() {
  const staticEntries = [
    [FVIRTKEY | FCONTROL,        VK_N,          CMD_NEW],
    [FVIRTKEY | FCONTROL,        VK_O,          CMD_OPEN],
    [FVIRTKEY | FCONTROL,        VK_S,          CMD_SAVE],
    [FVIRTKEY | FCONTROL | 0x04, VK_S,          CMD_SAVE_AS],
    [FVIRTKEY | FCONTROL,        VK_OEM_PLUS,   CMD_FONT_INC],
    [FVIRTKEY | FCONTROL,        VK_ADD,        CMD_FONT_INC],
    [FVIRTKEY | FCONTROL,        VK_OEM_MINUS,  CMD_FONT_DEC],
    [FVIRTKEY | FCONTROL,        VK_SUBTRACT,   CMD_FONT_DEC],
    [FVIRTKEY | FALT,            VK_LEFT,       CMD_GOTO_PAIR],
  ];

  const pluginEntries = [];
  let cmdIndex = 0;
  for (const api of pluginAPIs) {
    for (const item of api._menuItems) {
      if (item.shortcut) {
        const accel = parseShortcut(item.shortcut);
        if (accel) pluginEntries.push([accel.fVirt, accel.key, CMD_PLUGIN_BASE + cmdIndex]);
      }
      cmdIndex++;
    }
  }

  const entries = [...staticEntries, ...pluginEntries];
  const buf = new Uint8Array(ACCEL_SIZE * entries.length);
  entries.forEach(([virt, key, cmd], i) => {
    buf[i * ACCEL_SIZE]     = virt;
    new DataView(buf.buffer).setUint16(i * ACCEL_SIZE + 2, key, true);
    new DataView(buf.buffer).setUint16(i * ACCEL_SIZE + 4, cmd, true);
  });
  return User32.CreateAcceleratorTableW(buf, entries.length);
}

function parseShortcut(shortcut) {
  const parts = shortcut.split('+').map(s => s.trim().toLowerCase());
  let fVirt = FVIRTKEY;
  if (parts.includes('ctrl'))  fVirt |= FCONTROL;
  if (parts.includes('shift')) fVirt |= 0x04;
  if (parts.includes('alt'))   fVirt |= 0x10;
  const keyPart = parts[parts.length - 1];
  let key = 0;
  if (keyPart.length === 1) {
    key = keyPart.toUpperCase().charCodeAt(0);
  } else if (keyPart === '=') {
    key = 0xBB;
  } else if (keyPart === '-') {
    key = 0xBD;
  } else {
    return null;
  }
  return { fVirt, key };
}

// ── Build menu bar ────────────────────────────────────────────────────────────
const _menuLabels = [];
function menuLabel(text) {
  const buf = encodeWide(text);
  _menuLabels.push(buf);
  return buf;
}

function buildMenuBar(hwnd) {
  const hMenuBar   = User32.CreateMenu();
  const hFileMenu  = User32.CreatePopupMenu();
  const hViewMenu  = User32.CreatePopupMenu();
  const hThemeMenu = User32.CreatePopupMenu();

  User32.AppendMenuW(hFileMenu, MF_STRING,    CMD_NEW,     menuLabel('&New\tCtrl+N'));
  User32.AppendMenuW(hFileMenu, MF_STRING,    CMD_OPEN,    menuLabel('&Open...\tCtrl+O'));
  User32.AppendMenuW(hFileMenu, MF_SEPARATOR, 0,           null);
  User32.AppendMenuW(hFileMenu, MF_STRING,    CMD_SAVE,    menuLabel('&Save\tCtrl+S'));
  User32.AppendMenuW(hFileMenu, MF_STRING,    CMD_SAVE_AS, menuLabel('Save &As...\tCtrl+Shift+S'));
  User32.AppendMenuW(hFileMenu, MF_SEPARATOR, 0,           null);
  User32.AppendMenuW(hFileMenu, MF_STRING,    CMD_CLOSE,   menuLabel('&Close'));

  for (let i = 0; i < THEME_NAMES.length; i++) {
    User32.AppendMenuW(hThemeMenu, MF_STRING, CMD_THEME_BASE + i, menuLabel(THEME_NAMES[i]));
  }

  User32.AppendMenuW(hViewMenu, MF_STRING,    CMD_FONT_FACE,       menuLabel('&Font...'));
  User32.AppendMenuW(hViewMenu, MF_SEPARATOR, 0,                   null);
  User32.AppendMenuW(hViewMenu, MF_STRING,    CMD_WRAP,            menuLabel('&Word Wrap'));
  User32.AppendMenuW(hViewMenu, MF_STRING,    CMD_DETECT_LANG,     menuLabel('&Detect Format'));
  User32.AppendMenuW(hViewMenu, MF_STRING,    CMD_GOTO_PAIR,       menuLabel('&Goto Pair\tAlt+Left'));
  User32.AppendMenuW(hViewMenu, MF_SEPARATOR, 0,                   null);
  User32.AppendMenuW(hViewMenu, MF_POPUP,     ptrToNum(hThemeMenu),    menuLabel('&Theme'));

  User32.AppendMenuW(hMenuBar, MF_POPUP, ptrToNum(hFileMenu),  menuLabel('&File'));
  User32.AppendMenuW(hMenuBar, MF_POPUP, ptrToNum(hViewMenu),  menuLabel('&View'));
  User32.SetMenu(hwnd, hMenuBar);
}

function updateThemeCheckmarks() {
  const hMenu = User32.GetMenu(hMainWnd);
  if (!hMenu) return;
  for (let i = 0; i < THEME_NAMES.length; i++) {
    const flag = THEME_NAMES[i] === activeTheme ? MF_BYCOMMAND | MF_CHECKED : MF_BYCOMMAND | MF_UNCHECKED;
    User32.CheckMenuItem(hMenu, CMD_THEME_BASE + i, flag);
  }
}

// ── Plugin menu helpers ───────────────────────────────────────────────────────
let _allPluginMenuItems = [];

function rebuildPluginsMenu() {
  _allPluginMenuItems = pluginAPIs.flatMap(api => api._menuItems);
  if (_allPluginMenuItems.length === 0) return;

  const hMenuBar = User32.GetMenu(hMainWnd);
  if (!hMenuBar) return;

  const hPlugMenu = User32.CreatePopupMenu();
  let globalIndex = 0;
  let letterCode  = 97;
  const nextLetter = () => letterCode <= 122 ? String.fromCharCode(letterCode++) : '';

  for (const api of pluginAPIs) {
    if (api._menuItems.length === 0) continue;
    const pluginTitle = api._pluginName.replace(/[_-]/g, ' ');
    const letter = nextLetter();
    const accessPrefix = letter ? `&${letter} ` : '';

    if (api._menuItems.length === 1) {
      const item = api._menuItems[0];
      const label = item.shortcut
        ? `${accessPrefix}${pluginTitle}\t${item.shortcut}`
        : `${accessPrefix}${pluginTitle}`;
      User32.AppendMenuW(hPlugMenu, MF_STRING, CMD_PLUGIN_BASE + globalIndex, menuLabel(label));
      globalIndex++;
    } else {
      const hSub = User32.CreatePopupMenu();
      for (const item of api._menuItems) {
        const label = item.shortcut ? `${item.label}\t${item.shortcut}` : item.label;
        User32.AppendMenuW(hSub, MF_STRING, CMD_PLUGIN_BASE + globalIndex, menuLabel(label));
        globalIndex++;
      }
      User32.AppendMenuW(hPlugMenu, MF_POPUP, ptrToNum(hSub), menuLabel(`${accessPrefix}${pluginTitle}`));
    }
  }

  const MF_BYPOSITION = 0x00000400;
  User32.DeleteMenu(hMenuBar, 2, MF_BYPOSITION);
  User32.InsertMenuW(hMenuBar, 2, MF_BYPOSITION | MF_POPUP, ptrToNum(hPlugMenu), menuLabel('&Plugins'));
  User32.DrawMenuBar(hMainWnd);
}

function dispatchPluginMenuItem(index) {
  const item = _allPluginMenuItems[index];
  if (item) try { item.fn(); } catch (e) { console.error('[plugin menu]', e.message); }
}

// ── Scintilla child: create + configure ──────────────────────────────────────
const sciClassBuf = encodeWide('Scintilla');

function createScintillaEditor(parentHwnd) {
  hSciWnd = User32.CreateWindowExW(
    0, sciClassBuf, null,
    WS_CHILD | WS_VISIBLE | WS_VSCROLL | WS_HSCROLL,
    0, 0, 100, 100,
    parentHwnd, null, null, null,
  );
  if (!hSciWnd) throw new Error('CreateWindowExW(Scintilla) failed');

  sciSend(hSciWnd, SCI_SETCODEPAGE, SC_CP_UTF8, 0);
  sciSend(hSciWnd, SCI_SETUNDOSELECTION, 1, 0);
  applyThemeStyles(hSciWnd);

  sciSend(hSciWnd, SCI_SETMARGINTYPEN, 0, SC_MARGIN_NUMBER);
  const rulerBuf = new TextEncoder().encode('9999\0');
  const rulerWidth = sciSend(hSciWnd, SCI_TEXTWIDTH, STYLE_LINENUMBER, rulerBuf);
  sciSend(hSciWnd, SCI_SETMARGINWIDTHN, 0, rulerWidth + 4);

  setupFolding(hSciWnd);
  sciSend(hSciWnd, SCI_SETSCROLLWIDTH, 1, 0);
  sciSend(hSciWnd, SCI_SETSCROLLWIDTHTRACKING, 1, 0);
  sciSend(hSciWnd, SCI_SETWRAPMODE, wordWrap ? SC_WRAP_WORD : SC_WRAP_NONE, 0);

  User32.SetFocus(hSciWnd);
}

function setupFolding(hwnd) {
  sciSend(hwnd, SCI_SETMARGINTYPEN,      2, SC_MARGIN_SYMBOL);
  sciSend(hwnd, SCI_SETMARGINWIDTHN,     2, 14);
  sciSend(hwnd, SCI_SETMARGINSENSITIVEN, 2, 1);
  sciSend(hwnd, SCI_SETMARGINMASKN,      2, SC_MASK_FOLDERS);
  sciSend(hwnd, SCI_SETFOLDFLAGS,        16, 0);
  sciSend(hwnd, SCI_SETAUTOMATICFOLD,    SC_AUTOMATICFOLD_SHOW | SC_AUTOMATICFOLD_CLICK, 0);
  applyFoldMarkerColors(hwnd);
}

function layoutEditor(parentHwnd) {
  if (!hSciWnd) return;
  const rect = new Uint8Array(16);
  if (!User32.GetClientRect(parentHwnd, rect)) return;
  const view   = new DataView(rect.buffer);
  const width  = view.getInt32(8, true)  - view.getInt32(0, true);
  const height = view.getInt32(12, true) - view.getInt32(4, true);
  User32.MoveWindow(hSciWnd, 0, 0, width, height, true);
}

// ── WndProc ───────────────────────────────────────────────────────────────────
const wndProc = new JSCallback(
  types.sint64,
  [types.pointer, types.uint32, types.pointer, types.sint64],
  (hWnd, msg, wParam, lParam) => {
    // hWnd: NativePointer, msg: number, wParam: NativePointer (ptr avoids u64 sign issues),
    // lParam: number (i64 — Windows user-mode addresses fit in JS safe integer)
    const wParamN = ptrToNum(wParam);
    switch (msg) {
      case WM_CREATE:
        createScintillaEditor(hWnd);
        buildMenuBar(hWnd);
        applyWordWrap(hSciWnd, hWnd);
        return 0;

      case WM_SIZE:
        layoutEditor(hWnd);
        return 0;

      case WM_SETFOCUS:
        if (hSciWnd) User32.SetFocus(hSciWnd);
        return 0;

      case WM_COMMAND: {
        const cmdId = wParamN & 0xffff;
        switch (cmdId) {
          case CMD_NEW:      cmdNew().catch(console.error);    break;
          case CMD_OPEN:     cmdOpen().catch(console.error);   break;
          case CMD_SAVE:     cmdSave().catch(console.error);   break;
          case CMD_SAVE_AS:  cmdSaveAs().catch(console.error); break;
          case CMD_FONT_INC: setFontSize(hSciWnd, +1);        break;
          case CMD_FONT_DEC: setFontSize(hSciWnd, -1);        break;
          case CMD_FONT_FACE: cmdFontFace(hMainWnd);           break;
          case CMD_WRAP:        cmdToggleWrap();                  break;
          case CMD_DETECT_LANG: applyLexer(hSciWnd, currentPath); break;
          case CMD_GOTO_PAIR:   cmdGotoPair();                    break;
          case CMD_CLOSE:
            if (promptSaveIfDirty()) User32.DestroyWindow(hWnd);
            break;
          default:
            if (cmdId >= CMD_THEME_BASE && cmdId < CMD_THEME_BASE + THEME_NAMES.length) {
              activeTheme = THEME_NAMES[cmdId - CMD_THEME_BASE];
              saveConfig().catch(console.error);
              applyLexer(hSciWnd, currentPath);
              updateThemeCheckmarks();
            } else if (cmdId >= CMD_PLUGIN_BASE && cmdId < CMD_PLUGIN_BASE + 200) {
              dispatchPluginMenuItem(cmdId - CMD_PLUGIN_BASE);
            }
            break;
        }
        return 0;
      }

      case WM_NOTIFY: {
        // NMHDR on x64: hwndFrom(8)+idFrom(8)+code(4) → code at offset 16
        const lptr = addrToPtr(lParam);
        const code = read.i32(lptr, 16);
        if (code === SCN_SAVEPOINTLEFT) {
          isDirty = true;
          refreshTitle();
        } else if (code === SCN_SAVEPOINTREACHED) {
          isDirty = false;
          refreshTitle();
        } else if (code === SCN_MODIFIED) {
          const modType = read.i32(lptr, 40);
          if (modType & (SC_MOD_INSERTTEXT | SC_MOD_DELETETEXT)) {
            if (modType & (SC_PERFORMED_UNDO | SC_PERFORMED_REDO)) {
              _undoRedoPending = true;
            } else {
              emitChange();
            }
          }
        } else if (code === SCN_UPDATEUI) {
          if (_undoRedoPending) {
            _undoRedoPending = false;
            const pos = sciSend(hSciWnd, SCI_GETCURRENTPOS, 0, 0);
            sciSend(hSciWnd, SCI_SETSEL, pos, pos);
            emitChange();
          }
          updateBraceHighlight(hSciWnd);
          pluginEmitter.emit('cursorMove');
        } else if (code === SCN_CHARADDED) {
          const ch = read.i32(lptr, 32); // SCNotification.ch at offset 32 on x64

          // Auto-indent: on newline, copy leading whitespace from the previous line
          if (ch === 10) { // LF only — avoids double-fire on \r\n
            const pos  = sciSend(hSciWnd, SCI_GETCURRENTPOS, 0, 0);
            const line = sciSend(hSciWnd, SCI_LINEFROMPOSITION, pos, 0);
            const prevLine = line - 1;
            if (prevLine >= 0) {
              const useTabs = sciSend(hSciWnd, SCI_GETUSETABS, 0, 0);
              const tabWidth = sciSend(hSciWnd, SCI_GETTABWIDTH, 0, 0) || 4;
              const indent = sciSend(hSciWnd, SCI_GETLINEINDENTATION, prevLine, 0);
              if (indent > 0) {
                const indentStr = useTabs
                  ? '\t'.repeat(Math.floor(indent / tabWidth)) + ' '.repeat(indent % tabWidth)
                  : ' '.repeat(indent);
                const insBuf = new TextEncoder().encode(indentStr + '\0');
                sciSend(hSciWnd, SCI_INSERTTEXT, pos, insBuf);
                sciSend(hSciWnd, SCI_SETSEL, pos + indentStr.length, pos + indentStr.length);
              }
            }
          }

          // Auto bracket/quote completion
          const PAIRS = { 40: 41, 91: 93, 123: 125, 34: 34, 39: 39, 96: 96 };
          // ( → ) , [ → ] , { → } , " → " , ' → ' , ` → `
          const closing = PAIRS[ch];
          let pairInserted = false;
          if (closing !== undefined) {
            const pos = sciSend(hSciWnd, SCI_GETCURRENTPOS, 0, 0);
            const nextCh = sciSend(hSciWnd, SCI_GETCHARAT, pos, 0);
            // Don't insert if next char is alphanumeric (likely mid-word)
            const nextIsAlnum = (nextCh >= 48 && nextCh <= 57) ||
                                (nextCh >= 65 && nextCh <= 90) ||
                                (nextCh >= 97 && nextCh <= 122);
            if (!nextIsAlnum) {
              const closeBuf = new TextEncoder().encode(String.fromCharCode(closing) + '\0');
              sciSend(hSciWnd, SCI_INSERTTEXT, pos, closeBuf);
              sciSend(hSciWnd, SCI_SETSEL, pos, pos); // keep caret before closing char
              pairInserted = true;
            }
          }

          // Skip over closing bracket/quote if user types it when it's already there
          const CLOSERS = new Set([41, 93, 125, 34, 39, 96]); // ) ] } " ' `
          if (!pairInserted && CLOSERS.has(ch)) {
            const pos = sciSend(hSciWnd, SCI_GETCURRENTPOS, 0, 0);
            const nextCh = sciSend(hSciWnd, SCI_GETCHARAT, pos, 0);
            if (nextCh === ch) {
              // Delete the just-typed char and skip over the existing one
              sciSend(hSciWnd, SCI_DELETERANGE, pos - 1, 1);
              sciSend(hSciWnd, SCI_SETSEL, pos, pos);
            }
          }
        } else if (code === SCN_MARGINCLICK) {
          const margin   = read.i32(lptr, 112);
          const position = read.i64(lptr, 24);
          const line     = sciSend(hSciWnd, SCI_LINEFROMPOSITION, position, 0);
          if (margin === 2) sciSend(hSciWnd, SCI_TOGGLEFOLD, line, 0);
        }
        return 0;
      }

      case WM_CLOSE:
        if (!promptSaveIfDirty()) return 0;
        pluginEmitter.emit('close', currentPath);
        User32.DestroyWindow(hWnd);
        return 0;

      case WM_DESTROY:
        saveConfig().catch(console.error);
        User32.PostQuitMessage(0);
        return 0;

      default:
        return Number(User32.DefWindowProcW(hWnd, msg, wParam, lParam));
    }
  },
);

// ── Register window class ─────────────────────────────────────────────────────
const classNameBuf = encodeWide('TjsScintillaEditor');
const hCursor      = User32.LoadCursorW(null, addrToPtr(IDC_ARROW));

const wndClassBuf = packWndClassEx(
  wndProc.addr,
  classNameBuf,
  CS_HREDRAW | CS_VREDRAW,
  6n, // (HBRUSH)(COLOR_WINDOW + 1)
);
// Write hCursor at offset 40
new DataView(wndClassBuf.buffer).setBigUint64(40, ptrToBigInt(hCursor), true);

const atom = User32.RegisterClassExW(wndClassBuf);
if (!atom) {
  console.error('RegisterClassExW failed');
  wndProc.close?.();
  tjs.exit(1);
}

// ── Create main window ────────────────────────────────────────────────────────
const titleBuf = encodeWide('Tjs Scintilla Editor');

hMainWnd = User32.CreateWindowExW(
  0,
  classNameBuf,
  titleBuf,
  WS_OVERLAPPEDWINDOW | WS_CLIPCHILDREN,
  CW_USEDEFAULT, CW_USEDEFAULT,
  900, 650,
  null, null, null,
  null,
);

if (!hMainWnd) {
  console.error('CreateWindowExW failed');
  wndProc.close?.();
  tjs.exit(1);
}

User32.ShowWindow(hMainWnd, SW_SHOWMAXIMIZED);
User32.UpdateWindow(hMainWnd);
prof('ShowWindow');

updateThemeCheckmarks();

// Load config and open file (both async, done before pump starts)
await loadConfig(); prof('loadConfig');
applyLexer(hSciWnd, currentPath); prof('applyLexer(initial)'); // re-apply now that config font/theme is loaded

// tjs.args layout differs between interpreted and compiled:
//   interpreted: [tjs.exe, "run", "script.js", ...userArgs]  → user args start at index 3
//   compiled exe: [editor.exe, ...userArgs]                  → user args start at index 1
const _exeBasename = path.basename(tjs.args[0]).toLowerCase();
const isCompiled = !_exeBasename.includes('tjs');
const _userArgs = tjs.args.slice(isCompiled ? 1 : 3).filter(a => a !== '--profile');
const argFile = _userArgs[0];

if (argFile) await cmdOpenPath(argFile);

// Load plugins
pluginAPIs = await loadPlugins(path.join(APP_DIR, 'plugins'), makePluginAPI);
prof('loadPlugins');
rebuildPluginsMenu();

const hAccel = buildAccelTable();
if (PROFILE) console.log(`[profile] ── ready ── total=${(performance.now() - _profStart0).toFixed(1)}ms`);
console.log('Editor running. Close the window to exit.');

// ── Non-blocking PeekMessage pump ────────────────────────────────────────────
const msgBuf = new Uint8Array(MSG_SIZE);
const msgView = new DataView(msgBuf.buffer);

while (running) {
  while (User32.PeekMessageW(msgBuf, null, 0, 0, PM_REMOVE)) {
    if (msgView.getUint32(MSG_MESSAGE_OFFSET, true) === WM_QUIT) {
      running = false;
      break;
    }
    if (hAccel && User32.TranslateAcceleratorW(hMainWnd, hAccel, msgBuf)) {
      continue;
    }
    User32.TranslateMessage(msgBuf);
    User32.DispatchMessageW(msgBuf);
  }
  if (running) await new Promise(r => setTimeout(r, 1));
}

wndProc.close?.();
console.log('Editor closed.');
