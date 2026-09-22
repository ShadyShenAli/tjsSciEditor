#!/usr/bin/env tjs
import { dlopen, JSCallback, types, bufferToPointer, read } from 'tjs:ffi';
import path from 'tjs:path';

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

const ptrToBigInt = (nptr) => nptr === null ? 0n : BigInt(nptr.toString());
const ptrToNum    = (nptr) => nptr === null ? 0  : Number(ptrToBigInt(nptr));

function addrToPtr(addr) {
  const ptrBuf = new Uint8Array(8);
  new DataView(ptrBuf.buffer).setBigUint64(0, BigInt(addr), true);
  return read.ptr(bufferToPointer(ptrBuf), 0);
}
const toPtr = (v) => {
  if (v instanceof Uint8Array) return bufferToPointer(v);
  if (v && typeof v === 'object' && typeof v.toString === 'function' && v.toString().startsWith('0x')) return v;
  return addrToPtr(typeof v === 'bigint' ? v : BigInt(v));
};

// ── user32.dll bindings needed by plugin dialogs ──────────────────────────────
const _u32 = dlopen('user32.dll', {
  MessageBoxW:              { args: ['ptr', 'ptr', 'ptr', 'u32'],              returns: 'i32' },
  DialogBoxIndirectParamW:  { args: ['ptr', 'ptr', 'ptr', 'ptr', 'ptr'],       returns: 'ptr' },
  EndDialog:                { args: ['ptr', 'ptr'],                             returns: 'u32' },
  GetDlgItem:               { args: ['ptr', 'i32'],                             returns: 'ptr' },
  GetDlgItemTextW:          { args: ['ptr', 'i32', 'ptr', 'i32'],               returns: 'u32' },
  SetDlgItemTextW:          { args: ['ptr', 'i32', 'ptr'],                      returns: 'u32' },
  GetWindowLongPtrW:        { args: ['ptr', 'i32'],                             returns: 'ptr' },
  SetWindowLongPtrW:        { args: ['ptr', 'i32', 'ptr'],                      returns: 'ptr' },
  SetFocus:                 { args: ['ptr'],                                    returns: 'ptr' },
  CallWindowProcW:          { args: ['ptr', 'ptr', 'u32', 'ptr', 'ptr'],        returns: 'ptr' },
  SendDlgItemMessageW:      { args: ['ptr', 'i32', 'u32', 'ptr', 'ptr'],        returns: 'ptr' },
});
const User32 = _u32.symbols;

// ── EventEmitter ──────────────────────────────────────────────────────────────
export class EventEmitter {
  #handlers = new Map();

  on(event, fn) {
    if (!this.#handlers.has(event)) this.#handlers.set(event, []);
    this.#handlers.get(event).push(fn);
  }

  off(event, fn) {
    const arr = this.#handlers.get(event);
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i !== -1) arr.splice(i, 1);
  }

  emit(event, ...args) {
    const arr = this.#handlers.get(event);
    if (!arr) return;
    for (const fn of arr.slice()) {
      try { fn(...args); } catch (e) { console.error(`[plugin event ${event}]`, e.message); }
    }
  }
}

// ── Scintilla message numbers used by the API ─────────────────────────────────
const SCI_GETTEXT         = 2182;
const SCI_GETTEXTLENGTH   = 2183;
const SCI_SETTEXT         = 2181;
const SCI_GETCURRENTPOS   = 2008;
const SCI_GETLINECOUNT    = 2154;
const SCI_GETLINE         = 2153;
const SCI_LINELENGTH      = 2350;
const SCI_GOTOLINE        = 2024;
const SCI_SETSEL          = 2160;
const SCI_GETSELTEXT      = 2161;
const SCI_REPLACESEL      = 2170;
const SCI_APPENDTEXT      = 2282;
const SCI_LINEFROMPOSITION   = 2166;
const SCI_POSITIONFROMLINE   = 2167;
const SCI_GETLINEENDPOSITION = 2136;
const SCI_GETSELECTIONSTART  = 2143;
const SCI_GETSELECTIONEND    = 2144;
const SCI_GETLINEINDENTATION = 2127;
const SCI_SETREADONLY        = 2171;
const SCI_GETREADONLY        = 2140;
const SCI_WORDSTARTPOSITION  = 2266;
const SCI_WORDENDPOSITION    = 2267;
const SCI_INDICSETSTYLE      = 2080;
const SCI_INDICSETFORE       = 2082;
const SCI_INDICSETALPHA      = 2523;
const SCI_INDICSETUNDER      = 2510;
const SCI_SETINDICATORCURRENT = 2500;
const SCI_INDICATORCLEARRANGE = 2505;
const SCI_INDICATORFILLRANGE  = 2504;
const SCI_FINDTEXT           = 2150;
const SCFIND_MATCHCASE       = 0x4;
const SCFIND_WHOLEWORD       = 0x2;
const SCFIND_REGEXP          = 0x800000;

// SCI_GETTEXTRANGE: Sci_TextRange struct {min(8), max(8), buf(8)} = 24 bytes
function sciGetTextRange(rawSend, start, end) {
  const len = end - start + 1;
  const outBuf = new Uint8Array(len + 1);
  const rangeStruct = new Uint8Array(24);
  const view = new DataView(rangeStruct.buffer);
  view.setBigInt64(0, BigInt(start), true);
  view.setBigInt64(8, BigInt(end), true);
  view.setBigUint64(16, ptrToBigInt(bufferToPointer(outBuf)), true);
  rawSend(2162, 0, rangeStruct); // SCI_GETTEXTRANGE = 2162
  return new TextDecoder().decode(outBuf).replace(/\0.*$/, '');
}

// ── Dialog builder utilities ──────────────────────────────────────────────────
// Builds a flat Uint8Array from a series of word/dword/utf16 parts (WORD-aligned)
class DialogBuilder {
  #parts = [];
  #total = 0;

  w(v) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, v & 0xFFFF, true);
    this.#parts.push(b); this.#total += 2;
    return this;
  }
  dw(v) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v >>> 0, true);
    this.#parts.push(b); this.#total += 4;
    return this;
  }
  wide(str) {
    const b = encodeWide(str); // includes NUL terminator
    this.#parts.push(b); this.#total += b.length;
    return this;
  }
  align4() {
    const r = this.#total % 4;
    if (r) { const pad = new Uint8Array(4 - r); this.#parts.push(pad); this.#total += 4 - r; }
    return this;
  }
  build() {
    const out = new Uint8Array(this.#total);
    let off = 0;
    for (const p of this.#parts) { out.set(p, off); off += p.length; }
    return out;
  }
}

// ── Prompt dialog (DLGTEMPLATE packed in Uint8Array) ─────────────────────────
const IDOK     = 1;
const IDCANCEL = 2;
const ID_EDIT  = 100;
const ID_LABEL = 101;

const DS_SETFONT    = 0x40;
const DS_MODALFRAME = 0x80;
const DS_CENTER     = 0x0800;
const WS_POPUP      = 0x80000000;
const WS_CAPTION    = 0x00C00000;
const WS_SYSMENU    = 0x00080000;
const WS_VISIBLE    = 0x10000000;
const WS_CHILD      = 0x40000000;
const WS_TABSTOP    = 0x00010000;
const WS_BORDER     = 0x00800000;
const WS_VSCROLL    = 0x00200000;
const ES_AUTOHSCROLL = 0x0080;
const BS_DEFPUSHBUTTON = 0x01;
const WM_INITDIALOG = 0x0110;
const WM_COMMAND    = 0x0111;
const EN_CHANGE     = 0x0300;
const LB_RESETCONTENT = 0x0184;
const LB_ADDSTRING    = 0x0180;
const LB_GETCURSEL    = 0x0188;
const LB_SETCURSEL    = 0x0186;
const LB_GETCOUNT     = 0x018B;
const LBS_NOTIFY      = 0x0001;
const LBS_NOINTEGRALHEIGHT = 0x0100;
const LBN_DBLCLK      = 2;

function addDlgItem(db, style, exStyle, x, y, cx, cy, id, classAtom, titleStr) {
  db.align4();
  db.dw(style).dw(exStyle);
  db.w(x).w(y).w(cx).w(cy).w(id);
  db.w(0xFFFF).w(classAtom); // class as atom
  db.wide(titleStr);
  db.w(0); // no creation data
}

function buildPromptDialog(message, defaultValue) {
  const dlgStyle = WS_POPUP | WS_CAPTION | WS_SYSMENU | DS_MODALFRAME | DS_CENTER | DS_SETFONT;
  const db = new DialogBuilder();
  db.dw(dlgStyle).dw(0); // style, exStyle
  db.w(4);                // cDlgItems
  db.w(0).w(0).w(280).w(80); // x y cx cy
  db.w(0).w(0).wide('Input'); // menu, class, title
  db.w(9).wide('MS Shell Dlg'); // DS_SETFONT: point size, face
  db.align4();
  // STATIC label — atom 0x0082
  addDlgItem(db, WS_VISIBLE | WS_CHILD, 0, 7, 7, 266, 14, ID_LABEL, 0x0082, message || '');
  // EDIT — atom 0x0081
  addDlgItem(db, WS_VISIBLE | WS_CHILD | WS_BORDER | WS_TABSTOP | ES_AUTOHSCROLL, 0, 7, 24, 266, 14, ID_EDIT, 0x0081, defaultValue || '');
  // OK button — atom 0x0080
  addDlgItem(db, WS_VISIBLE | WS_CHILD | WS_TABSTOP | BS_DEFPUSHBUTTON, 0, 126, 52, 70, 14, IDOK, 0x0080, 'OK');
  // Cancel button — atom 0x0080
  addDlgItem(db, WS_VISIBLE | WS_CHILD | WS_TABSTOP, 0, 203, 52, 70, 14, IDCANCEL, 0x0080, 'Cancel');
  return db.build();
}

function showPromptDialog(hParent, message, defaultValue) {
  let result = null;

  const dlgProc = new JSCallback(
    types.sint64,
    [types.pointer, types.uint32, types.pointer, types.pointer],
    (hDlg, msg, wParam) => {
      if (msg === WM_INITDIALOG) return 1;
      if (msg === WM_COMMAND) {
        const id = ptrToNum(wParam) & 0xffff;
        if (id === IDOK) {
          const buf = new Uint8Array(2048);
          User32.GetDlgItemTextW(hDlg, ID_EDIT, buf, 1024);
          result = decodeWide(buf);
          User32.EndDialog(hDlg, toPtr(1));
          return 1;
        }
        if (id === IDCANCEL) {
          User32.EndDialog(hDlg, toPtr(0));
          return 1;
        }
      }
      return 0;
    },
  );

  const dlgBuf = buildPromptDialog(message, defaultValue);
  User32.DialogBoxIndirectParamW(toPtr(0), dlgBuf, hParent, dlgProc.addr, toPtr(0));
  dlgProc.close();
  return result;
}

// ── Picker dialog ─────────────────────────────────────────────────────────────
const ID_FILTER = 102;
const ID_LIST   = 200;

function buildPickerDialog(title) {
  const dlgStyle = WS_POPUP | WS_CAPTION | WS_SYSMENU | DS_MODALFRAME | DS_CENTER | DS_SETFONT;
  const db = new DialogBuilder();
  db.dw(dlgStyle).dw(0);
  db.w(4); // cDlgItems
  db.w(0).w(0).w(320).w(200);
  db.w(0).w(0).wide(title || 'Pick');
  db.w(11).wide('MS Shell Dlg');
  db.align4();
  // Filter EDIT (0x0081)
  addDlgItem(db, WS_VISIBLE | WS_CHILD | WS_BORDER | WS_TABSTOP | ES_AUTOHSCROLL, 0, 7, 7, 306, 14, ID_FILTER, 0x0081, '');
  // LISTBOX (0x0083)
  const lbStyle = WS_VISIBLE | WS_CHILD | WS_BORDER | WS_TABSTOP | WS_VSCROLL | LBS_NOTIFY | LBS_NOINTEGRALHEIGHT;
  addDlgItem(db, lbStyle, 0, 7, 26, 306, 148, ID_LIST, 0x0083, '');
  // OK button (0x0080)
  addDlgItem(db, WS_VISIBLE | WS_CHILD | WS_TABSTOP | BS_DEFPUSHBUTTON, 0, 166, 180, 70, 14, IDOK, 0x0080, 'OK');
  // Cancel button (0x0080)
  addDlgItem(db, WS_VISIBLE | WS_CHILD | WS_TABSTOP, 0, 243, 180, 70, 14, IDCANCEL, 0x0080, 'Cancel');
  return db.build();
}

function showPickerDialog(hParent, title, itemsOrFn, initialFilter = '') {
  const getItems = typeof itemsOrFn === 'function'
    ? itemsOrFn
    : (filter) => {
        const q = filter.trim().toLowerCase();
        if (!q) return itemsOrFn.slice();
        return itemsOrFn
          .map(s => ({ s, score: fuzzyMatch(s, q) }))
          .filter(x => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .map(x => x.s);
      };

  const initial = getItems(initialFilter);
  if (typeof itemsOrFn !== 'function' && (!initial || initial.length === 0)) return null;
  let selected     = null;
  let visibleItems = initial ? initial.slice() : [];

  const GWLP_WNDPROC = -4;
  const WM_KEYDOWN   = 0x0100;
  const VK_UP        = 0x26;
  const VK_DOWN      = 0x28;
  const VK_RETURN    = 0x0D;
  const VK_ESCAPE    = 0x1B;
  let origEditProc = null;
  let hDlgRef      = null;

  const repopulate = (hDlg, filter) => {
    visibleItems = getItems(filter);
    User32.SendDlgItemMessageW(hDlg, ID_LIST, LB_RESETCONTENT, toPtr(0), toPtr(0));
    const strBufs = [];
    for (const s of visibleItems) {
      const buf = encodeWide(s);
      strBufs.push(buf);
      User32.SendDlgItemMessageW(hDlg, ID_LIST, LB_ADDSTRING, toPtr(0), bufferToPointer(buf));
    }
    if (visibleItems.length > 0)
      User32.SendDlgItemMessageW(hDlg, ID_LIST, LB_SETCURSEL, toPtr(0), toPtr(0));
  };

  const confirmSelection = (hDlg) => {
    const idx = ptrToNum(User32.SendDlgItemMessageW(hDlg, ID_LIST, LB_GETCURSEL, toPtr(0), toPtr(0)));
    if (idx >= 0 && idx < visibleItems.length) selected = visibleItems[idx];
    User32.EndDialog(hDlg, toPtr(1));
  };

  const moveSel = (hDlg, delta) => {
    const count = ptrToNum(User32.SendDlgItemMessageW(hDlg, ID_LIST, LB_GETCOUNT, toPtr(0), toPtr(0)));
    if (count <= 0) return;
    const cur = ptrToNum(User32.SendDlgItemMessageW(hDlg, ID_LIST, LB_GETCURSEL, toPtr(0), toPtr(0)));
    const next = Math.max(0, Math.min(count - 1, (cur < 0 ? 0 : cur) + delta));
    User32.SendDlgItemMessageW(hDlg, ID_LIST, LB_SETCURSEL, toPtr(next), toPtr(0));
  };

  const editSubProc = new JSCallback(
    types.sint64,
    [types.pointer, types.uint32, types.pointer, types.pointer],
    (hWnd, msg, wParam, lParam) => {
      if (msg === WM_KEYDOWN) {
        const vk = ptrToNum(wParam) & 0xffff;
        if (vk === VK_DOWN)   { moveSel(hDlgRef, +1); return 0; }
        if (vk === VK_UP)     { moveSel(hDlgRef, -1); return 0; }
        if (vk === VK_RETURN) { confirmSelection(hDlgRef); return 0; }
        if (vk === VK_ESCAPE) { User32.EndDialog(hDlgRef, toPtr(0)); return 0; }
      }
      if (origEditProc) return ptrToNum(User32.CallWindowProcW(origEditProc, hWnd, msg, wParam, lParam));
      return 0;
    },
  );

  const dlgProc = new JSCallback(
    types.sint64,
    [types.pointer, types.uint32, types.pointer, types.pointer],
    (hDlg, msg, wParam) => {
      if (msg === WM_INITDIALOG) {
        hDlgRef = hDlg;
        const hEdit = User32.GetDlgItem(hDlg, ID_FILTER);
        origEditProc = User32.GetWindowLongPtrW(hEdit, GWLP_WNDPROC);
        User32.SetWindowLongPtrW(hEdit, GWLP_WNDPROC, editSubProc.addr);
        if (initialFilter) {
          const initBuf = encodeWide(initialFilter);
          User32.SetDlgItemTextW(hDlg, ID_FILTER, initBuf);
        }
        repopulate(hDlg, initialFilter);
        User32.SetFocus(hEdit);
        return 0;
      }
      if (msg === WM_COMMAND) {
        const id    = ptrToNum(wParam) & 0xffff;
        const notif = (ptrToNum(wParam) >> 16) & 0xffff;
        if (id === ID_FILTER && notif === EN_CHANGE) {
          const buf = new Uint8Array(2048);
          User32.GetDlgItemTextW(hDlg, ID_FILTER, buf, 1024);
          repopulate(hDlg, decodeWide(buf));
          return 1;
        }
        if (id === IDOK || (id === ID_LIST && notif === LBN_DBLCLK)) {
          confirmSelection(hDlg);
          return 1;
        }
        if (id === IDCANCEL) { User32.EndDialog(hDlg, toPtr(0)); return 1; }
      }
      return 0;
    },
  );

  const dlgBuf = buildPickerDialog(title);
  User32.DialogBoxIndirectParamW(toPtr(0), dlgBuf, hParent, dlgProc.addr, toPtr(0));
  return selected;
}

// ── Fuzzy match ───────────────────────────────────────────────────────────────
function fuzzyMatch(text, query) {
  const t = text.toLowerCase();
  const segments = parseSegments(query);
  if (segments.length === 0) return 1;
  if (segments.length === 1) {
    const needle = segments[0].toLowerCase();
    if (needle.length === 0) return 1;
    const idx = t.indexOf(needle);
    if (idx < 0) return 0;
    return needle.length * 100 - idx;
  }
  let pos = 0;
  let score = 0;
  for (const seg of segments) {
    if (seg.length === 0) continue;
    const needle = seg.toLowerCase();
    const idx = t.indexOf(needle, pos);
    if (idx < 0) return 0;
    score += needle.length * 100 - (idx - pos);
    pos = idx + needle.length;
  }
  return score > 0 ? score : 1;
}

function parseSegments(query) {
  const segments = [];
  let cur = '';
  for (let i = 0; i < query.length; i++) {
    if (query[i] === '\\' && i + 1 < query.length) {
      i++;
      cur += query[i] === '*'  ? '*'
           : query[i] === '\\' ? '\\'
           : query[i] === ' '  ? ' '
           : query[i];
    } else if (query[i] === '*') {
      segments.push(cur); cur = '';
    } else {
      cur += query[i];
    }
  }
  segments.push(cur);
  return segments;
}

// ── PluginAPI ─────────────────────────────────────────────────────────────────
export class PluginAPI {
  _rawSend    = null;
  _emitter    = null;
  _state      = null;
  _hMain      = () => null;
  _pluginName = '';
  _menuItems  = [];

  get sci() { return this._sci; }

  constructor() {
    const self = this;
    this._sci = {
      send(msg, wParam = 0, lParam = 0) {
        return self._rawSend(msg, wParam, lParam);
      },
      getText() {
        const len = Number(self._rawSend(SCI_GETTEXTLENGTH, 0, 0));
        const buf = new Uint8Array(len + 1);
        self._rawSend(SCI_GETTEXT, len + 1, buf);
        return new TextDecoder().decode(buf.subarray(0, len));
      },
      setText(text) {
        const buf = new TextEncoder().encode(text + '\0');
        self._rawSend(SCI_SETTEXT, 0, buf);
      },
      getLine(n) {
        const len = Number(self._rawSend(SCI_LINELENGTH, n, 0));
        if (len <= 0) return '';
        const buf = new Uint8Array(len + 2);
        self._rawSend(SCI_GETLINE, n, buf);
        return new TextDecoder().decode(buf.subarray(0, len)).replace(/[\r\n]+$/, '');
      },
      getLineCount() {
        return Number(self._rawSend(SCI_GETLINECOUNT, 0, 0));
      },
      gotoLine(n) {
        self._rawSend(SCI_GOTOLINE, n, 0);
      },
      getCursorPos() {
        return Number(self._rawSend(SCI_GETCURRENTPOS, 0, 0));
      },
      setSelection(start, end) {
        self._rawSend(SCI_SETSEL, start, end);
      },
      getSelText() {
        const len = Number(self._rawSend(SCI_GETSELTEXT, 0, 0));
        const buf = new Uint8Array(len + 1);
        self._rawSend(SCI_GETSELTEXT, 0, buf);
        return new TextDecoder().decode(buf.subarray(0, len));
      },
      replaceSelection(text) {
        const buf = new TextEncoder().encode(text + '\0');
        self._rawSend(SCI_REPLACESEL, 0, buf);
      },
      appendText(text) {
        const buf = new TextEncoder().encode(text);
        self._rawSend(SCI_APPENDTEXT, buf.length, buf);
      },
      getTextRange(start, end) {
        return sciGetTextRange(self._rawSend.bind(self), start, end);
      },
      lineFromPosition(pos) {
        return Number(self._rawSend(SCI_LINEFROMPOSITION, pos, 0));
      },
      positionFromLine(line) {
        return Number(self._rawSend(SCI_POSITIONFROMLINE, line, 0));
      },
      getLineEndPosition(line) {
        return Number(self._rawSend(SCI_GETLINEENDPOSITION, line, 0));
      },
      getSelectionStart() {
        return Number(self._rawSend(SCI_GETSELECTIONSTART, 0, 0));
      },
      getSelectionEnd() {
        return Number(self._rawSend(SCI_GETSELECTIONEND, 0, 0));
      },
      getLineIndentation(line) {
        return Number(self._rawSend(SCI_GETLINEINDENTATION, line, 0));
      },
      getTextLength() {
        return Number(self._rawSend(SCI_GETTEXTLENGTH, 0, 0));
      },
      getReadOnly() {
        return Number(self._rawSend(SCI_GETREADONLY, 0, 0)) !== 0;
      },
      setReadOnly(flag) {
        self._rawSend(SCI_SETREADONLY, flag ? 1 : 0, 0);
      },
      getWordAt(pos) {
        const start = Number(self._rawSend(SCI_WORDSTARTPOSITION, pos, 1));
        const end   = Number(self._rawSend(SCI_WORDENDPOSITION,   pos, 1));
        return start < end ? sciGetTextRange(self._rawSend.bind(self), start, end - 1) : '';
      },
      findNext(needle, fromPos = 0, toPos = -1, flags = 0) {
        const docLen   = Number(self._rawSend(SCI_GETTEXTLENGTH, 0, 0));
        const searchTo = toPos < 0 ? docLen : toPos;
        const needleBuf = new TextEncoder().encode(needle + '\0');
        const ttf = new Uint8Array(24);
        const ttfView = new DataView(ttf.buffer);
        ttfView.setInt32(0, fromPos,  true);
        ttfView.setInt32(4, searchTo, true);
        ttfView.setBigInt64(8, ptrToBigInt(bufferToPointer(needleBuf)), true);
        const found = Number(self._rawSend(SCI_FINDTEXT, flags, ttf));
        if (found < 0) return null;
        return { start: found, end: ttfView.getInt32(20, true) };
      },
      findAll(needle, flags = 0) {
        const docLen = Number(self._rawSend(SCI_GETTEXTLENGTH, 0, 0));
        const results = [];
        let pos = 0;
        while (pos < docLen) {
          const m = self._sci.findNext(needle, pos, docLen, flags);
          if (!m || m.end <= m.start) break;
          results.push(m);
          pos = m.end;
        }
        return results;
      },
      setIndicatorStyle(id, style) { self._rawSend(SCI_INDICSETSTYLE, id, style); },
      setIndicatorFore(id, color)  { self._rawSend(SCI_INDICSETFORE,  id, color); },
      setIndicatorAlpha(id, alpha) { self._rawSend(SCI_INDICSETALPHA, id, alpha); },
      setIndicatorUnder(id, under) { self._rawSend(SCI_INDICSETUNDER, id, under ? 1 : 0); },
      clearIndicator(id) {
        const docLen = Number(self._rawSend(SCI_GETTEXTLENGTH, 0, 0));
        self._rawSend(SCI_SETINDICATORCURRENT, id, 0);
        self._rawSend(SCI_INDICATORCLEARRANGE, 0, docLen);
      },
      fillIndicator(id, start, length) {
        self._rawSend(SCI_SETINDICATORCURRENT, id, 0);
        self._rawSend(SCI_INDICATORFILLRANGE, start, length);
      },
    };

    this.editor = {
      getCurrentPath: () => self._state?.currentPath ?? null,
      isDirty:        () => self._state?.isDirty ?? false,
      getTheme:       () => self._state?.activeTheme ?? '',
      getFontSize:    () => self._state?.fontSize ?? 11,
    };

    this.SCFIND = { MATCHCASE: SCFIND_MATCHCASE, WHOLEWORD: SCFIND_WHOLEWORD, REGEXP: SCFIND_REGEXP };
  }

  on(event, fn)  { this._emitter?.on(event, fn); }
  off(event, fn) { this._emitter?.off(event, fn); }

  addMenuItem(label, shortcutOrFn, fn) {
    if (typeof shortcutOrFn === 'function') {
      this._menuItems.push({ label, shortcut: null, fn: shortcutOrFn });
    } else {
      this._menuItems.push({ label, shortcut: shortcutOrFn ?? null, fn });
    }
  }

  alert(msg) {
    const textBuf = encodeWide(String(msg));
    const capBuf  = encodeWide('TjsSciEditor');
    User32.MessageBoxW(this._hMain(), textBuf, capBuf, 0x00000040); // MB_ICONINFORMATION
  }

  confirm(msg) {
    const textBuf = encodeWide(String(msg));
    const capBuf  = encodeWide('TjsSciEditor');
    const result  = User32.MessageBoxW(this._hMain(), textBuf, capBuf, 0x00000024); // MB_YESNO|MB_ICONQUESTION
    return result === 6; // IDYES
  }

  prompt(msg, defaultValue = '') {
    return showPromptDialog(this._hMain(), msg, defaultValue);
  }

  showPickerDynamic(title, getItems, initialFilter = '') {
    return showPickerDialog(this._hMain(), title, getItems, initialFilter);
  }
}

// ── Plugin loader ─────────────────────────────────────────────────────────────
export async function loadPlugins(dir, makeAPI) {
  let files;
  try {
    const dirHandle = await tjs.readDir(dir);
    const entries = [];
    for await (const e of dirHandle) {
      if (e.name.endsWith('.js')) entries.push(e.name);
    }
    await dirHandle.close();
    files = entries.sort();
  } catch {
    return [];
  }

  const loaded = [];
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const fileUrl  = fullPath.replace(/\\/g, '/');
    try {
      const mod  = await import(fileUrl);
      const init = mod.default;
      if (typeof init !== 'function') continue;
      const pluginName = file.replace(/\.js$/, '');
      const api = makeAPI(pluginName);
      await init(api);
      loaded.push(api);
      console.log(`[plugin] loaded ${file}`);
    } catch (e) {
      console.error(`[plugin] ${file} failed:`, e.message);
    }
  }
  return loaded;
}
