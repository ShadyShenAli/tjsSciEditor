#!/usr/bin/env tjs

// editor-tjs.js
import { dlopen as dlopen2, JSCallback as JSCallback2, types as types2, bufferToPointer as bufferToPointer2, read as read2 } from "tjs:ffi";
import path2 from "tjs:path";

// plugin-api-tjs.js
import { dlopen, JSCallback, types, bufferToPointer, read } from "tjs:ffi";
import path from "tjs:path";
function encodeWide(str) {
  const buf = new Uint8Array((str.length + 1) * 2);
  const view = new DataView(buf.buffer);
  for (let i = 0; i < str.length; i++) view.setUint16(i * 2, str.charCodeAt(i), true);
  return buf;
}
function decodeWide(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let s = "";
  for (let i = 0; i + 1 < buf.byteLength; i += 2) {
    const c = view.getUint16(i, true);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}
var ptrToBigInt = (nptr) => nptr === null ? 0n : BigInt(nptr.toString());
var ptrToNum = (nptr) => nptr === null ? 0 : Number(ptrToBigInt(nptr));
function addrToPtr(addr) {
  const ptrBuf = new Uint8Array(8);
  new DataView(ptrBuf.buffer).setBigUint64(0, BigInt(addr), true);
  return read.ptr(bufferToPointer(ptrBuf), 0);
}
var toPtr = (v) => {
  if (v instanceof Uint8Array) return bufferToPointer(v);
  if (v && typeof v === "object" && typeof v.toString === "function" && v.toString().startsWith("0x")) return v;
  return addrToPtr(typeof v === "bigint" ? v : BigInt(v));
};
var _u32 = dlopen("user32.dll", {
  MessageBoxW: { args: ["ptr", "ptr", "ptr", "u32"], returns: "i32" },
  DialogBoxIndirectParamW: { args: ["ptr", "ptr", "ptr", "ptr", "ptr"], returns: "ptr" },
  EndDialog: { args: ["ptr", "ptr"], returns: "u32" },
  GetDlgItem: { args: ["ptr", "i32"], returns: "ptr" },
  GetDlgItemTextW: { args: ["ptr", "i32", "ptr", "i32"], returns: "u32" },
  SetDlgItemTextW: { args: ["ptr", "i32", "ptr"], returns: "u32" },
  GetWindowLongPtrW: { args: ["ptr", "i32"], returns: "ptr" },
  SetWindowLongPtrW: { args: ["ptr", "i32", "ptr"], returns: "ptr" },
  SetFocus: { args: ["ptr"], returns: "ptr" },
  CallWindowProcW: { args: ["ptr", "ptr", "u32", "ptr", "ptr"], returns: "ptr" },
  SendDlgItemMessageW: { args: ["ptr", "i32", "u32", "ptr", "ptr"], returns: "ptr" }
});
var User32 = _u32.symbols;
var EventEmitter = class {
  #handlers = /* @__PURE__ */ new Map();
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
      try {
        fn(...args);
      } catch (e) {
        console.error(`[plugin event ${event}]`, e.message);
      }
    }
  }
};
var SCI_GETTEXT = 2182;
var SCI_GETTEXTLENGTH = 2183;
var SCI_SETTEXT = 2181;
var SCI_GETCURRENTPOS = 2008;
var SCI_GETLINECOUNT = 2154;
var SCI_GETLINE = 2153;
var SCI_LINELENGTH = 2350;
var SCI_GOTOLINE = 2024;
var SCI_SETSEL = 2160;
var SCI_GETSELTEXT = 2161;
var SCI_REPLACESEL = 2170;
var SCI_APPENDTEXT = 2282;
var SCI_LINEFROMPOSITION = 2166;
var SCI_POSITIONFROMLINE = 2167;
var SCI_GETLINEENDPOSITION = 2136;
var SCI_GETSELECTIONSTART = 2143;
var SCI_GETSELECTIONEND = 2144;
var SCI_GETLINEINDENTATION = 2127;
var SCI_SETREADONLY = 2171;
var SCI_GETREADONLY = 2140;
var SCI_WORDSTARTPOSITION = 2266;
var SCI_WORDENDPOSITION = 2267;
var SCI_INDICSETSTYLE = 2080;
var SCI_INDICSETFORE = 2082;
var SCI_INDICSETALPHA = 2523;
var SCI_INDICSETUNDER = 2510;
var SCI_SETINDICATORCURRENT = 2500;
var SCI_INDICATORCLEARRANGE = 2505;
var SCI_INDICATORFILLRANGE = 2504;
var SCI_FINDTEXT = 2150;
var SCFIND_MATCHCASE = 4;
var SCFIND_WHOLEWORD = 2;
var SCFIND_REGEXP = 8388608;
function sciGetTextRange(rawSend, start, end) {
  const len = end - start + 1;
  const outBuf = new Uint8Array(len + 1);
  const rangeStruct = new Uint8Array(24);
  const view = new DataView(rangeStruct.buffer);
  view.setBigInt64(0, BigInt(start), true);
  view.setBigInt64(8, BigInt(end), true);
  view.setBigUint64(16, ptrToBigInt(bufferToPointer(outBuf)), true);
  rawSend(2162, 0, rangeStruct);
  return new TextDecoder().decode(outBuf).replace(/\0.*$/, "");
}
var DialogBuilder = class {
  #parts = [];
  #total = 0;
  w(v) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, v & 65535, true);
    this.#parts.push(b);
    this.#total += 2;
    return this;
  }
  dw(v) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v >>> 0, true);
    this.#parts.push(b);
    this.#total += 4;
    return this;
  }
  wide(str) {
    const b = encodeWide(str);
    this.#parts.push(b);
    this.#total += b.length;
    return this;
  }
  align4() {
    const r = this.#total % 4;
    if (r) {
      const pad = new Uint8Array(4 - r);
      this.#parts.push(pad);
      this.#total += 4 - r;
    }
    return this;
  }
  build() {
    const out = new Uint8Array(this.#total);
    let off = 0;
    for (const p of this.#parts) {
      out.set(p, off);
      off += p.length;
    }
    return out;
  }
};
var IDOK = 1;
var IDCANCEL = 2;
var ID_EDIT = 100;
var ID_LABEL = 101;
var DS_SETFONT = 64;
var DS_MODALFRAME = 128;
var DS_CENTER = 2048;
var WS_POPUP = 2147483648;
var WS_CAPTION = 12582912;
var WS_SYSMENU = 524288;
var WS_VISIBLE = 268435456;
var WS_CHILD = 1073741824;
var WS_TABSTOP = 65536;
var WS_BORDER = 8388608;
var WS_VSCROLL = 2097152;
var ES_AUTOHSCROLL = 128;
var BS_DEFPUSHBUTTON = 1;
var WM_INITDIALOG = 272;
var WM_COMMAND = 273;
var EN_CHANGE = 768;
var LB_RESETCONTENT = 388;
var LB_ADDSTRING = 384;
var LB_GETCURSEL = 392;
var LB_SETCURSEL = 390;
var LB_GETCOUNT = 395;
var LBS_NOTIFY = 1;
var LBS_NOINTEGRALHEIGHT = 256;
var LBN_DBLCLK = 2;
function addDlgItem(db, style, exStyle, x, y, cx, cy, id, classAtom, titleStr) {
  db.align4();
  db.dw(style).dw(exStyle);
  db.w(x).w(y).w(cx).w(cy).w(id);
  db.w(65535).w(classAtom);
  db.wide(titleStr);
  db.w(0);
}
function buildPromptDialog(message, defaultValue) {
  const dlgStyle = WS_POPUP | WS_CAPTION | WS_SYSMENU | DS_MODALFRAME | DS_CENTER | DS_SETFONT;
  const db = new DialogBuilder();
  db.dw(dlgStyle).dw(0);
  db.w(4);
  db.w(0).w(0).w(280).w(80);
  db.w(0).w(0).wide("Input");
  db.w(9).wide("MS Shell Dlg");
  db.align4();
  addDlgItem(db, WS_VISIBLE | WS_CHILD, 0, 7, 7, 266, 14, ID_LABEL, 130, message || "");
  addDlgItem(db, WS_VISIBLE | WS_CHILD | WS_BORDER | WS_TABSTOP | ES_AUTOHSCROLL, 0, 7, 24, 266, 14, ID_EDIT, 129, defaultValue || "");
  addDlgItem(db, WS_VISIBLE | WS_CHILD | WS_TABSTOP | BS_DEFPUSHBUTTON, 0, 126, 52, 70, 14, IDOK, 128, "OK");
  addDlgItem(db, WS_VISIBLE | WS_CHILD | WS_TABSTOP, 0, 203, 52, 70, 14, IDCANCEL, 128, "Cancel");
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
        const id = ptrToNum(wParam) & 65535;
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
    }
  );
  const dlgBuf = buildPromptDialog(message, defaultValue);
  User32.DialogBoxIndirectParamW(toPtr(0), dlgBuf, hParent, dlgProc.addr, toPtr(0));
  dlgProc.close();
  return result;
}
var ID_FILTER = 102;
var ID_LIST = 200;
function buildPickerDialog(title) {
  const dlgStyle = WS_POPUP | WS_CAPTION | WS_SYSMENU | DS_MODALFRAME | DS_CENTER | DS_SETFONT;
  const db = new DialogBuilder();
  db.dw(dlgStyle).dw(0);
  db.w(4);
  db.w(0).w(0).w(320).w(200);
  db.w(0).w(0).wide(title || "Pick");
  db.w(11).wide("MS Shell Dlg");
  db.align4();
  addDlgItem(db, WS_VISIBLE | WS_CHILD | WS_BORDER | WS_TABSTOP | ES_AUTOHSCROLL, 0, 7, 7, 306, 14, ID_FILTER, 129, "");
  const lbStyle = WS_VISIBLE | WS_CHILD | WS_BORDER | WS_TABSTOP | WS_VSCROLL | LBS_NOTIFY | LBS_NOINTEGRALHEIGHT;
  addDlgItem(db, lbStyle, 0, 7, 26, 306, 148, ID_LIST, 131, "");
  addDlgItem(db, WS_VISIBLE | WS_CHILD | WS_TABSTOP | BS_DEFPUSHBUTTON, 0, 166, 180, 70, 14, IDOK, 128, "OK");
  addDlgItem(db, WS_VISIBLE | WS_CHILD | WS_TABSTOP, 0, 243, 180, 70, 14, IDCANCEL, 128, "Cancel");
  return db.build();
}
function showPickerDialog(hParent, title, itemsOrFn, initialFilter = "") {
  const getItems = typeof itemsOrFn === "function" ? itemsOrFn : (filter) => {
    const q = filter.trim().toLowerCase();
    if (!q) return itemsOrFn.slice();
    return itemsOrFn.map((s) => ({ s, score: fuzzyMatch(s, q) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.s);
  };
  const initial = getItems(initialFilter);
  if (typeof itemsOrFn !== "function" && (!initial || initial.length === 0)) return null;
  let selected = null;
  let visibleItems = initial ? initial.slice() : [];
  const GWLP_WNDPROC = -4;
  const WM_KEYDOWN = 256;
  const VK_UP = 38;
  const VK_DOWN = 40;
  const VK_RETURN = 13;
  const VK_ESCAPE = 27;
  let origEditProc = null;
  let hDlgRef = null;
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
        const vk = ptrToNum(wParam) & 65535;
        if (vk === VK_DOWN) {
          moveSel(hDlgRef, 1);
          return 0;
        }
        if (vk === VK_UP) {
          moveSel(hDlgRef, -1);
          return 0;
        }
        if (vk === VK_RETURN) {
          confirmSelection(hDlgRef);
          return 0;
        }
        if (vk === VK_ESCAPE) {
          User32.EndDialog(hDlgRef, toPtr(0));
          return 0;
        }
      }
      if (origEditProc) return ptrToNum(User32.CallWindowProcW(origEditProc, hWnd, msg, wParam, lParam));
      return 0;
    }
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
        const id = ptrToNum(wParam) & 65535;
        const notif = ptrToNum(wParam) >> 16 & 65535;
        if (id === ID_FILTER && notif === EN_CHANGE) {
          const buf = new Uint8Array(2048);
          User32.GetDlgItemTextW(hDlg, ID_FILTER, buf, 1024);
          repopulate(hDlg, decodeWide(buf));
          return 1;
        }
        if (id === IDOK || id === ID_LIST && notif === LBN_DBLCLK) {
          confirmSelection(hDlg);
          return 1;
        }
        if (id === IDCANCEL) {
          User32.EndDialog(hDlg, toPtr(0));
          return 1;
        }
      }
      return 0;
    }
  );
  const dlgBuf = buildPickerDialog(title);
  User32.DialogBoxIndirectParamW(toPtr(0), dlgBuf, hParent, dlgProc.addr, toPtr(0));
  return selected;
}
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
  let cur = "";
  for (let i = 0; i < query.length; i++) {
    if (query[i] === "\\" && i + 1 < query.length) {
      i++;
      cur += query[i] === "*" ? "*" : query[i] === "\\" ? "\\" : query[i] === " " ? " " : query[i];
    } else if (query[i] === "*") {
      segments.push(cur);
      cur = "";
    } else {
      cur += query[i];
    }
  }
  segments.push(cur);
  return segments;
}
var PluginAPI = class {
  _rawSend = null;
  _emitter = null;
  _state = null;
  _hMain = () => null;
  _pluginName = "";
  _menuItems = [];
  get sci() {
    return this._sci;
  }
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
        const buf = new TextEncoder().encode(text + "\0");
        self._rawSend(SCI_SETTEXT, 0, buf);
      },
      getLine(n) {
        const len = Number(self._rawSend(SCI_LINELENGTH, n, 0));
        if (len <= 0) return "";
        const buf = new Uint8Array(len + 2);
        self._rawSend(SCI_GETLINE, n, buf);
        return new TextDecoder().decode(buf.subarray(0, len)).replace(/[\r\n]+$/, "");
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
        const buf = new TextEncoder().encode(text + "\0");
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
        const end = Number(self._rawSend(SCI_WORDENDPOSITION, pos, 1));
        return start < end ? sciGetTextRange(self._rawSend.bind(self), start, end - 1) : "";
      },
      findNext(needle, fromPos = 0, toPos = -1, flags = 0) {
        const docLen = Number(self._rawSend(SCI_GETTEXTLENGTH, 0, 0));
        const searchTo = toPos < 0 ? docLen : toPos;
        const needleBuf = new TextEncoder().encode(needle + "\0");
        const ttf = new Uint8Array(24);
        const ttfView = new DataView(ttf.buffer);
        ttfView.setInt32(0, fromPos, true);
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
      setIndicatorStyle(id, style) {
        self._rawSend(SCI_INDICSETSTYLE, id, style);
      },
      setIndicatorFore(id, color) {
        self._rawSend(SCI_INDICSETFORE, id, color);
      },
      setIndicatorAlpha(id, alpha) {
        self._rawSend(SCI_INDICSETALPHA, id, alpha);
      },
      setIndicatorUnder(id, under) {
        self._rawSend(SCI_INDICSETUNDER, id, under ? 1 : 0);
      },
      clearIndicator(id) {
        const docLen = Number(self._rawSend(SCI_GETTEXTLENGTH, 0, 0));
        self._rawSend(SCI_SETINDICATORCURRENT, id, 0);
        self._rawSend(SCI_INDICATORCLEARRANGE, 0, docLen);
      },
      fillIndicator(id, start, length) {
        self._rawSend(SCI_SETINDICATORCURRENT, id, 0);
        self._rawSend(SCI_INDICATORFILLRANGE, start, length);
      }
    };
    this.editor = {
      getCurrentPath: () => self._state?.currentPath ?? null,
      isDirty: () => self._state?.isDirty ?? false,
      getTheme: () => self._state?.activeTheme ?? "",
      getFontSize: () => self._state?.fontSize ?? 11
    };
    this.SCFIND = { MATCHCASE: SCFIND_MATCHCASE, WHOLEWORD: SCFIND_WHOLEWORD, REGEXP: SCFIND_REGEXP };
  }
  on(event, fn) {
    this._emitter?.on(event, fn);
  }
  off(event, fn) {
    this._emitter?.off(event, fn);
  }
  addMenuItem(label, shortcutOrFn, fn) {
    if (typeof shortcutOrFn === "function") {
      this._menuItems.push({ label, shortcut: null, fn: shortcutOrFn });
    } else {
      this._menuItems.push({ label, shortcut: shortcutOrFn ?? null, fn });
    }
  }
  alert(msg) {
    const textBuf = encodeWide(String(msg));
    const capBuf = encodeWide("TjsSciEditor");
    User32.MessageBoxW(this._hMain(), textBuf, capBuf, 64);
  }
  confirm(msg) {
    const textBuf = encodeWide(String(msg));
    const capBuf = encodeWide("TjsSciEditor");
    const result = User32.MessageBoxW(this._hMain(), textBuf, capBuf, 36);
    return result === 6;
  }
  prompt(msg, defaultValue = "") {
    return showPromptDialog(this._hMain(), msg, defaultValue);
  }
  showPickerDynamic(title, getItems, initialFilter = "") {
    return showPickerDialog(this._hMain(), title, getItems, initialFilter);
  }
};
async function loadPlugins(dir, makeAPI) {
  let files;
  try {
    const dirHandle = await tjs.readDir(dir);
    const entries = [];
    for await (const e of dirHandle) {
      if (e.name.endsWith(".js")) entries.push(e.name);
    }
    await dirHandle.close();
    files = entries.sort();
  } catch {
    return [];
  }
  const loaded = [];
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const fileUrl = fullPath.replace(/\\/g, "/");
    try {
      const mod = await import(fileUrl);
      const init = mod.default;
      if (typeof init !== "function") continue;
      const pluginName = file.replace(/\.js$/, "");
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

// editor-tjs.js
function encodeWide2(str) {
  const buf = new Uint8Array((str.length + 1) * 2);
  const view = new DataView(buf.buffer);
  for (let i = 0; i < str.length; i++) view.setUint16(i * 2, str.charCodeAt(i), true);
  return buf;
}
function decodeWide2(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let s = "";
  for (let i = 0; i + 1 < buf.byteLength; i += 2) {
    const c = view.getUint16(i, true);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}
var ptrToBigInt2 = (nptr) => nptr === null ? 0n : BigInt(nptr.toString());
var ptrToNum2 = (nptr) => nptr === null ? 0 : Number(ptrToBigInt2(nptr));
function addrToPtr2(addr) {
  const ptrBuf = new Uint8Array(8);
  new DataView(ptrBuf.buffer).setBigUint64(0, BigInt(addr), true);
  return read2.ptr(bufferToPointer2(ptrBuf), 0);
}
var CS_HREDRAW = 2;
var CS_VREDRAW = 1;
var WS_OVERLAPPEDWINDOW = 13565952;
var WS_CLIPCHILDREN = 33554432;
var WS_CHILD2 = 1073741824;
var WS_VISIBLE2 = 268435456;
var WS_VSCROLL2 = 2097152;
var WS_HSCROLL = 1048576;
var SW_SHOWMAXIMIZED = 3;
var PM_REMOVE = 1;
var WM_CREATE = 1;
var WM_DESTROY = 2;
var WM_SIZE = 5;
var WM_SETFOCUS = 7;
var WM_CLOSE = 16;
var WM_QUIT = 18;
var WM_COMMAND2 = 273;
var WM_NOTIFY = 78;
var CW_USEDEFAULT = 2147483648;
var IDC_ARROW = 32512;
var MF_STRING = 0;
var MF_POPUP = 16;
var MF_SEPARATOR = 2048;
var MF_CHECKED = 8;
var MF_UNCHECKED = 0;
var MF_BYCOMMAND = 0;
var MSG_SIZE = 48;
var MSG_MESSAGE_OFFSET = 8;
var CMD_NEW = 100;
var CMD_OPEN = 101;
var CMD_SAVE = 102;
var CMD_SAVE_AS = 103;
var CMD_CLOSE = 104;
var CMD_FONT_INC = 105;
var CMD_FONT_DEC = 106;
var CMD_FONT_FACE = 107;
var CMD_WRAP = 108;
var CMD_DETECT_LANG = 109;
var CMD_GOTO_PAIR = 110;
var CMD_PLUGIN_BASE = 400;
var CMD_THEME_BASE = 201;
var FVIRTKEY = 1;
var FCONTROL = 8;
var FALT = 16;
var ACCEL_SIZE = 6;
var VK_N = 78;
var VK_O = 79;
var VK_S = 83;
var VK_LEFT = 37;
var VK_OEM_PLUS = 187;
var VK_OEM_MINUS = 189;
var VK_ADD = 107;
var VK_SUBTRACT = 109;
var SCI_SETTEXT2 = 2181;
var SCI_GETTEXT2 = 2182;
var SCI_GETTEXTLENGTH2 = 2183;
var SCI_SETCODEPAGE = 2037;
var SCI_SETSCROLLWIDTH = 2274;
var SCI_SETSCROLLWIDTHTRACKING = 2516;
var SCI_SETMARGINTYPEN = 2240;
var SCI_SETMARGINWIDTHN = 2242;
var SCI_SETMARGINSENSITIVEN = 2246;
var SCI_SETMARGINMASKN = 2244;
var SCI_MARKERDEFINE = 2040;
var SCI_MARKERSETFORE = 2041;
var SCI_MARKERSETBACK = 2042;
var SCI_SETPROPERTY = 4004;
var SCI_TOGGLEFOLD = 2231;
var SCI_LINEFROMPOSITION2 = 2166;
var SCI_GETLINEINDENTATION2 = 2127;
var SCI_INSERTTEXT = 2003;
var SCI_GETCURRENTPOS2 = 2008;
var SCI_SCROLLCARET = 2169;
var SCI_GETUSETABS = 2125;
var SCI_GETTABWIDTH = 2121;
var SCI_SETSEL2 = 2160;
var SCI_GETCHARAT = 2007;
var SCI_DELETERANGE = 2645;
var SCI_BRACEHIGHLIGHT = 2351;
var SCI_BRACEBADLIGHT = 2352;
var SCI_BRACEMATCH = 2353;
var STYLE_BRACELIGHT = 34;
var STYLE_BRACEBAD = 35;
var SCI_SETFOLDFLAGS = 2233;
var SCI_SETAUTOMATICFOLD = 4221;
var SC_MARGIN_NUMBER = 1;
var SC_MARGIN_SYMBOL = 0;
var SC_MASK_FOLDERS = 4261412864;
var SC_AUTOMATICFOLD_SHOW = 1;
var SC_AUTOMATICFOLD_CLICK = 2;
var MARKER_FOLDEREND = 25;
var MARKER_FOLDEROPENMID = 26;
var MARKER_FOLDERMIDTAIL = 27;
var MARKER_FOLDERTAIL = 28;
var MARKER_FOLDERSUB = 29;
var MARKER_FOLDER = 30;
var MARKER_FOLDEROPEN = 31;
var SC_MARK_VLINE = 9;
var SC_MARK_LCORNER = 10;
var SC_MARK_TCORNER = 11;
var SC_MARK_BOXPLUS = 12;
var SC_MARK_BOXPLUSCONNECTED = 13;
var SC_MARK_BOXMINUS = 14;
var SC_MARK_BOXMINUSCONNECTED = 15;
var SCI_STYLESETSIZE = 2055;
var SCI_STYLESETFONT = 2056;
var SCI_STYLESETBOLD = 2053;
var SCI_TEXTWIDTH = 2276;
var SCI_SETSAVEPOINT = 2014;
var SCI_EMPTYUNDOBUFFER = 2175;
var SCI_SETUNDOSELECTION = 2763;
var SCI_SETILEXER = 4033;
var SCI_SETKEYWORDS = 4005;
var SCI_SETWRAPMODE = 2268;
var SC_WRAP_NONE = 0;
var SC_WRAP_WORD = 1;
var SCI_STYLESETFORE = 2051;
var SCI_STYLESETBACK = 2052;
var SCI_SETCARETLINEVISIBLE = 2097;
var SCI_SETCARETLINEBACK = 2098;
var SCI_COLOURISE = 4003;
var SCI_STYLECLEARALL = 2050;
var SC_CP_UTF8 = 65001;
var STYLE_DEFAULT = 32;
var STYLE_LINENUMBER = 33;
var SCE_C_COMMENT = 1;
var SCE_C_COMMENTLINE = 2;
var SCE_C_COMMENTDOC = 3;
var SCE_C_NUMBER = 4;
var SCE_C_WORD = 5;
var SCE_C_STRING = 6;
var SCE_C_CHARACTER = 7;
var SCE_C_PREPROCESSOR = 9;
var SCE_C_OPERATOR = 10;
var SCE_C_STRINGEOL = 12;
var SCE_C_VERBATIM = 13;
var SCE_C_REGEX = 14;
var SCE_C_COMMENTLINEDOC = 15;
var SCE_C_WORD2 = 16;
var SCE_C_GLOBALCLASS = 19;
var SCE_C_TEMPLATESTRING = 20;
var SCN_SAVEPOINTREACHED = 2002;
var SCN_SAVEPOINTLEFT = 2003;
var SCN_MARGINCLICK = 2010;
var SCN_UPDATEUI = 2007;
var SCN_MODIFIED = 2008;
var SCN_CHARADDED = 2001;
var SC_MOD_INSERTTEXT = 1;
var SC_MOD_DELETETEXT = 2;
var SC_PERFORMED_UNDO = 32;
var SC_PERFORMED_REDO = 64;
var JS_KEYWORDS1 = "break case catch class const continue debugger default delete do else export extends false finally for from function get if import in instanceof let new null of package private protected public return set static super switch this throw true try typeof undefined var void while with yield async await enum declare abstract readonly type interface satisfies keyof infer never unknown any";
var JS_KEYWORDS2 = "Array Boolean Date Error Function JSON Map Math Number Object Promise RegExp Set String Symbol WeakMap WeakSet WeakRef console process Bun globalThis undefined NaN Infinity parseInt parseFloat isNaN isFinite setTimeout setInterval clearTimeout clearInterval fetch URL URLSearchParams Buffer Uint8Array Int32Array Float64Array Promise";
var EXT_LEXER = {
  ".js": "cpp",
  ".mjs": "cpp",
  ".cjs": "cpp",
  ".jsx": "cpp",
  ".ts": "cpp",
  ".tsx": "cpp",
  ".mts": "cpp",
  ".cts": "cpp",
  ".c": "cpp",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".h": "cpp",
  ".hpp": "cpp",
  ".hh": "cpp",
  ".py": "python",
  ".json": "json",
  ".jsonc": "json",
  ".md": "markdown",
  ".css": "css",
  ".html": "hypertext",
  ".htm": "hypertext",
  ".xml": "xml",
  ".sh": "bash",
  ".bash": "bash",
  ".bat": "batch",
  ".cmd": "batch",
  ".sql": "sql",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".lua": "lua",
  ".rb": "ruby",
  ".rs": "rust"
};
function lexerForPath(filePath) {
  if (!filePath) return null;
  const dot = filePath.lastIndexOf(".");
  if (dot < 0) return null;
  return EXT_LEXER[filePath.slice(dot).toLowerCase()] ?? null;
}
function detectLexerFromContent(hwnd) {
  const totalLen = sciSend(hwnd, SCI_GETTEXTLENGTH2, 0, 0);
  if (totalLen === 0) return null;
  const len = Math.min(totalLen, 2048);
  const buf = new Uint8Array(len + 1);
  sciSend(hwnd, SCI_GETTEXT2, len + 1, buf);
  const text = new TextDecoder().decode(buf.subarray(0, len));
  const firstLine = text.slice(0, text.indexOf("\n") + 1 || 200);
  if (firstLine.startsWith("#!")) {
    if (/python/.test(firstLine)) return "python";
    if (/ruby|ruby/.test(firstLine)) return "ruby";
    if (/node|bun|deno/.test(firstLine)) return "cpp";
    if (/bash|sh/.test(firstLine)) return "bash";
    if (/lua/.test(firstLine)) return "lua";
  }
  if (/^\s*<(!DOCTYPE\s+html|html[\s>])/i.test(text)) return "hypertext";
  if (/^\s*<\?xml/i.test(text)) return "xml";
  if (/^\s*[\[{]/.test(text) && /[:,]\s*[\n\r{}\[\]"]/.test(text)) return "json";
  if (/^(import |from |def |class |if __name__|async def )/m.test(text) && !/{|}|;$/.test(text.slice(0, 300))) return "python";
  if (/(^|\n)(import |export |const |let |var |function |class |=>)/.test(text) && /(;|=>|\bconst\b|\blet\b)/.test(text)) return "cpp";
  if (/#include\s*[<"]/.test(text)) return "cpp";
  if (/[a-z-]+\s*:\s*[^;{]+;/.test(text) && /{/.test(text) && !/</.test(text)) return "css";
  if (/^---\s*$/m.test(text) || /^[a-zA-Z_][a-zA-Z0-9_]*:\s+\S/m.test(text)) return "yaml";
  if (/^(if |for |while |case |function |echo |export |set -)/m.test(text)) return "bash";
  if (/\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i.test(text)) return "sql";
  if (/^(local |function |require\()/m.test(text) && /--/.test(text)) return "lua";
  return null;
}
var rgb = (r, g, b) => r | g << 8 | b << 16;
var THEMES = {
  "Light (Default)": {
    bg: rgb(255, 255, 255),
    fg: rgb(0, 0, 0),
    linenoFg: rgb(130, 130, 150),
    linoBg: rgb(240, 240, 245),
    caretLineBg: rgb(232, 248, 232),
    comment: rgb(0, 128, 0),
    string: rgb(163, 21, 21),
    keyword: rgb(0, 0, 255),
    number: rgb(9, 134, 88),
    type: rgb(38, 127, 153),
    func: rgb(121, 94, 38),
    operator: rgb(0, 0, 0),
    preproc: rgb(155, 0, 173),
    regex: rgb(215, 58, 73),
    globalcls: rgb(38, 127, 153),
    braceLight: rgb(0, 100, 200),
    braceLightBg: rgb(210, 235, 255),
    braceBad: rgb(200, 0, 0),
    braceBadBg: rgb(255, 210, 210)
  },
  "Dark (Dracula)": {
    bg: rgb(40, 42, 54),
    fg: rgb(248, 248, 242),
    linenoFg: rgb(100, 110, 130),
    linoBg: rgb(34, 36, 46),
    caretLineBg: rgb(48, 56, 44),
    comment: rgb(98, 114, 164),
    string: rgb(241, 250, 140),
    keyword: rgb(139, 233, 253),
    number: rgb(189, 147, 249),
    type: rgb(139, 233, 253),
    func: rgb(80, 250, 123),
    operator: rgb(255, 121, 198),
    preproc: rgb(255, 121, 198),
    regex: rgb(255, 184, 108),
    globalcls: rgb(80, 250, 123),
    braceLight: rgb(80, 250, 123),
    braceLightBg: rgb(50, 65, 50),
    braceBad: rgb(255, 85, 85),
    braceBadBg: rgb(70, 40, 40)
  },
  "Dark (One Dark)": {
    bg: rgb(40, 44, 52),
    fg: rgb(171, 178, 191),
    linenoFg: rgb(90, 99, 116),
    linoBg: rgb(33, 37, 43),
    caretLineBg: rgb(44, 56, 44),
    comment: rgb(92, 99, 112),
    string: rgb(152, 195, 121),
    keyword: rgb(198, 120, 221),
    number: rgb(209, 154, 102),
    type: rgb(229, 192, 123),
    func: rgb(97, 175, 239),
    operator: rgb(171, 178, 191),
    preproc: rgb(224, 108, 117),
    regex: rgb(86, 182, 194),
    globalcls: rgb(229, 192, 123),
    braceLight: rgb(97, 175, 239),
    braceLightBg: rgb(44, 56, 68),
    braceBad: rgb(224, 108, 117),
    braceBadBg: rgb(60, 40, 44)
  },
  "Solarized Light": {
    bg: rgb(253, 246, 227),
    fg: rgb(101, 123, 131),
    linenoFg: rgb(147, 161, 161),
    linoBg: rgb(238, 232, 213),
    caretLineBg: rgb(235, 245, 220),
    comment: rgb(147, 161, 161),
    string: rgb(42, 161, 152),
    keyword: rgb(133, 153, 0),
    number: rgb(211, 54, 130),
    type: rgb(181, 137, 0),
    func: rgb(38, 139, 210),
    operator: rgb(101, 123, 131),
    preproc: rgb(203, 75, 22),
    regex: rgb(42, 161, 152),
    globalcls: rgb(181, 137, 0),
    braceLight: rgb(38, 139, 210),
    braceLightBg: rgb(230, 240, 250),
    braceBad: rgb(203, 75, 22),
    braceBadBg: rgb(255, 230, 215)
  }
};
var THEME_NAMES = Object.keys(THEMES);
var activeTheme = THEME_NAMES[0];
var fontSize = 11;
var fontFace = "Consolas";
var fontBold = false;
var wordWrap = false;
var fontBuf = new TextEncoder().encode(fontFace + "\0");
function rebuildFontBuf() {
  fontBuf = new TextEncoder().encode(fontFace + "\0");
}
var _exeBasenameEarly = path2.basename(tjs.args[0]).toLowerCase();
var _isCompiledEarly = !_exeBasenameEarly.includes("tjs");
var PROFILE = tjs.args.slice(_isCompiledEarly ? 1 : 3).includes("--profile");
var _profStart0 = PROFILE ? performance.now() : 0;
var _profLast0 = _profStart0;
function prof(label) {
  if (!PROFILE) return;
  const now = performance.now();
  console.log(`[profile] ${label}: +${(now - _profLast0).toFixed(1)}ms  total=${(now - _profStart0).toFixed(1)}ms`);
  _profLast0 = now;
}
var APP_DIR = (() => {
  const fromMeta = path2.dirname(import.meta.url.replace(/^file:\/\//i, ""));
  return fromMeta === "." || fromMeta === "" ? path2.dirname(tjs.exePath) : fromMeta;
})();
var CONFIG_PATH = path2.join(APP_DIR, "config.ini");
async function loadConfig() {
  try {
    const raw = await tjs.readFile(CONFIG_PATH);
    const text = new TextDecoder().decode(raw);
    const mt = text.match(/^theme\s*=\s*(.+)$/im);
    if (mt) {
      const name = mt[1].trim();
      if (THEMES[name]) activeTheme = name;
    }
    const mf = text.match(/^fontsize\s*=\s*(\d+)$/im);
    if (mf) {
      const size = parseInt(mf[1], 10);
      if (size >= 6 && size <= 72) fontSize = size;
    }
    const mff = text.match(/^fontface\s*=\s*(.+)$/im);
    if (mff) {
      const face = mff[1].trim();
      if (face.length > 0 && face.length <= 31) {
        fontFace = face;
        rebuildFontBuf();
      }
    }
    const mfb = text.match(/^fontbold\s*=\s*(.+)$/im);
    if (mfb) fontBold = mfb[1].trim() === "true";
    const mw = text.match(/^wordwrap\s*=\s*(.+)$/im);
    if (mw) wordWrap = mw[1].trim() === "true";
  } catch {
  }
}
async function saveConfig() {
  const text = `[editor]
theme=${activeTheme}
fontsize=${fontSize}
fontface=${fontFace}
fontbold=${fontBold}
wordwrap=${wordWrap}
`;
  await tjs.writeFile(CONFIG_PATH, new TextEncoder().encode(text));
}
var _user32 = dlopen2("user32.dll", {
  LoadCursorW: { args: ["ptr", "ptr"], returns: "ptr" },
  SetProcessDpiAwarenessContext: { args: ["i64"], returns: "u32" },
  RegisterClassExW: { args: ["ptr"], returns: "u16" },
  CreateWindowExW: { args: ["u32", "ptr", "ptr", "u32", "i32", "i32", "i32", "i32", "ptr", "ptr", "ptr", "ptr"], returns: "ptr" },
  ShowWindow: { args: ["ptr", "i32"], returns: "u32" },
  UpdateWindow: { args: ["ptr"], returns: "u32" },
  SetWindowTextW: { args: ["ptr", "ptr"], returns: "u32" },
  GetMenu: { args: ["ptr"], returns: "ptr" },
  GetSubMenu: { args: ["ptr", "i32"], returns: "ptr" },
  CreateMenu: { args: [], returns: "ptr" },
  CreatePopupMenu: { args: [], returns: "ptr" },
  AppendMenuW: { args: ["ptr", "u32", "u64", "ptr"], returns: "u32" },
  InsertMenuW: { args: ["ptr", "u32", "u32", "u64", "ptr"], returns: "u32" },
  DeleteMenu: { args: ["ptr", "u32", "u32"], returns: "u32" },
  DrawMenuBar: { args: ["ptr"], returns: "u32" },
  SetMenu: { args: ["ptr", "ptr"], returns: "u32" },
  CheckMenuItem: { args: ["ptr", "u32", "u32"], returns: "u32" },
  CreateAcceleratorTableW: { args: ["ptr", "i32"], returns: "ptr" },
  TranslateAcceleratorW: { args: ["ptr", "ptr", "ptr"], returns: "i32" },
  SetFocus: { args: ["ptr"], returns: "ptr" },
  SendMessageW: { args: ["ptr", "u32", "ptr", "ptr"], returns: "ptr" },
  PostMessageW: { args: ["ptr", "u32", "ptr", "ptr"], returns: "u32" },
  MessageBoxW: { args: ["ptr", "ptr", "ptr", "u32"], returns: "i32" },
  DefWindowProcW: { args: ["ptr", "u32", "ptr", "i64"], returns: "i64" },
  DestroyWindow: { args: ["ptr"], returns: "u32" },
  PostQuitMessage: { args: ["i32"], returns: "void" },
  MoveWindow: { args: ["ptr", "i32", "i32", "i32", "i32", "u32"], returns: "u32" },
  GetClientRect: { args: ["ptr", "ptr"], returns: "u32" },
  PeekMessageW: { args: ["ptr", "ptr", "u32", "u32", "u32"], returns: "u32" },
  TranslateMessage: { args: ["ptr"], returns: "u32" },
  DispatchMessageW: { args: ["ptr"], returns: "i64" }
});
var User322 = _user32.symbols;
var _kernel32 = dlopen2("kernel32.dll", {
  LoadLibraryW: { args: ["ptr"], returns: "ptr" }
});
var Kernel32 = _kernel32.symbols;
var _comdlg32 = dlopen2("comdlg32.dll", {
  GetOpenFileNameW: { args: ["ptr"], returns: "u32" },
  GetSaveFileNameW: { args: ["ptr"], returns: "u32" },
  ChooseFontW: { args: ["ptr"], returns: "u32" }
});
var Comdlg32 = _comdlg32.symbols;
function packWndClassEx(wndProcAddr, classNameBuf2, style, hbrBackground = 0n) {
  const buf = new Uint8Array(80);
  const view = new DataView(buf.buffer);
  view.setUint32(0, 80, true);
  view.setUint32(4, style, true);
  view.setBigUint64(8, ptrToBigInt2(wndProcAddr), true);
  view.setInt32(16, 0, true);
  view.setInt32(20, 0, true);
  view.setBigUint64(24, 0n, true);
  view.setBigUint64(32, 0n, true);
  view.setBigUint64(40, 0n, true);
  view.setBigUint64(48, hbrBackground, true);
  view.setBigUint64(56, 0n, true);
  view.setBigUint64(64, ptrToBigInt2(bufferToPointer2(classNameBuf2)), true);
  view.setBigUint64(72, 0n, true);
  return buf;
}
var hMainWnd = null;
var hSciWnd = null;
var running = true;
var currentPath = null;
var isDirty = false;
var _undoRedoPending = false;
var toPtr2 = (v) => {
  if (v instanceof Uint8Array) return bufferToPointer2(v);
  if (v && typeof v === "object" && typeof v.toString === "function" && v.toString().startsWith("0x")) return v;
  return addrToPtr2(typeof v === "bigint" ? v : BigInt(v));
};
var sciSend = (hwnd, msg, wParam, lParam = 0) => ptrToNum2(User322.SendMessageW(hwnd, msg, toPtr2(wParam), toPtr2(lParam)));
var pluginEmitter = new EventEmitter();
var pluginAPIs = [];
function makePluginAPI(pluginName) {
  const api = new PluginAPI();
  api._pluginName = pluginName ?? "";
  api._rawSend = (msg, wParam = 0, lParam = 0) => sciSend(hSciWnd, msg, wParam, lParam);
  api._emitter = pluginEmitter;
  api._hMain = () => hMainWnd;
  api._state = {
    get currentPath() {
      return currentPath;
    },
    get isDirty() {
      return isDirty;
    },
    get activeTheme() {
      return activeTheme;
    },
    get fontSize() {
      return fontSize;
    }
  };
  return api;
}
var _changeTimer = null;
function emitChange() {
  if (_changeTimer) clearTimeout(_changeTimer);
  _changeTimer = setTimeout(() => {
    _changeTimer = null;
    pluginEmitter.emit("change");
  }, 150);
}
User322.SetProcessDpiAwarenessContext(-4);
var scintillaDllBuf = encodeWide2(path2.join(APP_DIR, "Scintilla.dll"));
var hScintilla = Kernel32.LoadLibraryW(scintillaDllBuf);
if (!hScintilla) {
  console.error("Failed to load Scintilla.dll");
  tjs.exit(1);
}
var _lexilla = dlopen2(path2.join(APP_DIR, "Lexilla.dll"), {
  CreateLexer: { args: ["string"], returns: "ptr" }
});
function applyWordWrap(hwnd, hWin) {
  sciSend(hwnd, SCI_SETWRAPMODE, wordWrap ? SC_WRAP_WORD : SC_WRAP_NONE, 0);
  const hMenuBar = User322.GetMenu(hWin || hMainWnd);
  if (!hMenuBar) return;
  const hViewMenu = User322.GetSubMenu(hMenuBar, 1);
  if (!hViewMenu) return;
  User322.CheckMenuItem(hViewMenu, CMD_WRAP, MF_BYCOMMAND | (wordWrap ? MF_CHECKED : MF_UNCHECKED));
}
function cmdGotoPair() {
  const OPEN = /* @__PURE__ */ new Set([40, 91, 123]);
  const CLOSE = /* @__PURE__ */ new Set([41, 93, 125]);
  const PAIRS = { 40: 41, 91: 93, 123: 125, 41: 40, 93: 91, 125: 123 };
  const QUOTES = /* @__PURE__ */ new Set([34, 39, 96]);
  const pos = sciSend(hSciWnd, SCI_GETCURRENTPOS2, 0, 0);
  const totalLen = sciSend(hSciWnd, SCI_GETTEXTLENGTH2, 0, 0);
  const buf = new Uint8Array(totalLen + 1);
  sciSend(hSciWnd, SCI_GETTEXT2, totalLen + 1, buf);
  let bracePos = -1, braceCode = 0;
  if (pos > 0) {
    const ch = buf[pos - 1];
    if (OPEN.has(ch) || CLOSE.has(ch)) {
      bracePos = pos - 1;
      braceCode = ch;
    }
  }
  if (bracePos < 0 && pos < totalLen) {
    const ch = buf[pos];
    if (OPEN.has(ch) || CLOSE.has(ch)) {
      bracePos = pos;
      braceCode = ch;
    }
  }
  if (bracePos < 0) return;
  const inString = new Uint8Array(totalLen);
  let inStr = 0;
  for (let i = 0; i < totalLen; i++) {
    const c = buf[i];
    if (inStr) {
      inString[i] = 1;
      if (c === 92) {
        i++;
        if (i < totalLen) inString[i] = 1;
        continue;
      }
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
        sciSend(hSciWnd, SCI_SETSEL2, i, i);
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
        sciSend(hSciWnd, SCI_SETSEL2, i, i);
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
  const t = THEMES[activeTheme];
  sciSend(hwnd, SCI_MARKERDEFINE, MARKER_FOLDER, SC_MARK_BOXPLUS);
  sciSend(hwnd, SCI_MARKERDEFINE, MARKER_FOLDEROPEN, SC_MARK_BOXMINUS);
  sciSend(hwnd, SCI_MARKERDEFINE, MARKER_FOLDERSUB, SC_MARK_VLINE);
  sciSend(hwnd, SCI_MARKERDEFINE, MARKER_FOLDERTAIL, SC_MARK_LCORNER);
  sciSend(hwnd, SCI_MARKERDEFINE, MARKER_FOLDEREND, SC_MARK_BOXPLUSCONNECTED);
  sciSend(hwnd, SCI_MARKERDEFINE, MARKER_FOLDEROPENMID, SC_MARK_BOXMINUSCONNECTED);
  sciSend(hwnd, SCI_MARKERDEFINE, MARKER_FOLDERMIDTAIL, SC_MARK_TCORNER);
  for (const m of [
    MARKER_FOLDER,
    MARKER_FOLDEROPEN,
    MARKER_FOLDERSUB,
    MARKER_FOLDERTAIL,
    MARKER_FOLDEREND,
    MARKER_FOLDEROPENMID,
    MARKER_FOLDERMIDTAIL
  ]) {
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
  sciSend(hwnd, SCI_STYLESETFORE, STYLE_BRACEBAD, t.braceBad);
  sciSend(hwnd, SCI_STYLESETBACK, STYLE_BRACEBAD, t.braceBadBg);
  sciSend(hwnd, SCI_STYLESETBOLD, STYLE_BRACEBAD, 1);
  applyFoldMarkerColors(hwnd);
}
function updateBraceHighlight(hwnd) {
  const BRACES = /* @__PURE__ */ new Set(["(", ")", "{", "}", "[", "]"]);
  const pos = sciSend(hwnd, SCI_GETCURRENTPOS2, 0, 0);
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
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_COMMENT, t.comment);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_COMMENTLINE, t.comment);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_COMMENTDOC, t.comment);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_COMMENTLINEDOC, t.comment);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_STRING, t.string);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_CHARACTER, t.string);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_TEMPLATESTRING, t.string);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_VERBATIM, t.string);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_STRINGEOL, t.preproc);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_NUMBER, t.number);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_WORD, t.keyword);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_WORD2, t.func);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_PREPROCESSOR, t.preproc);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_OPERATOR, t.operator);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_REGEX, t.regex);
  sciSend(hwnd, SCI_STYLESETFORE, SCE_C_GLOBALCLASS, t.globalcls);
}
var LARGE_FILE_THRESHOLD = 10 * 1024 * 1024;
function applyLexer(hwnd, filePath) {
  const docLen = sciSend(hwnd, SCI_GETTEXTLENGTH2, 0, 0);
  const isLarge = docLen >= LARGE_FILE_THRESHOLD;
  const name = lexerForPath(filePath) ?? detectLexerFromContent(hwnd);
  const lexerPtr = _lexilla.symbols.CreateLexer(name ?? "null");
  sciSend(hwnd, SCI_SETILEXER, 0, ptrToNum2(lexerPtr));
  const foldKey = new TextEncoder().encode("fold\0");
  const foldVal = new TextEncoder().encode("1\0");
  const compactKey = new TextEncoder().encode("fold.compact\0");
  const compactVal = new TextEncoder().encode("0\0");
  sciSend(hwnd, SCI_SETPROPERTY, foldKey, foldVal);
  sciSend(hwnd, SCI_SETPROPERTY, compactKey, compactVal);
  applyThemeStyles(hwnd);
  if (name === "cpp") {
    applyCppStyles(hwnd);
    const kw1Buf = new TextEncoder().encode(JS_KEYWORDS1 + "\0");
    const kw2Buf = new TextEncoder().encode(JS_KEYWORDS2 + "\0");
    sciSend(hwnd, SCI_SETKEYWORDS, 0, kw1Buf);
    sciSend(hwnd, SCI_SETKEYWORDS, 1, kw2Buf);
  }
  if (isLarge) {
    console.log(`[editor] large file (${(docLen / 1024 / 1024).toFixed(1)} MB) \u2014 syntax highlight deferred`);
  } else {
    sciSend(hwnd, SCI_COLOURISE, 0, -1);
  }
}
function setFontSize(hwnd, delta) {
  fontSize = Math.max(6, Math.min(72, fontSize + delta));
  applyLexer(hwnd, currentPath);
}
var LOGFONTW_SIZE = 92;
var LF_FACENAME_OFF = 28;
var CHOOSEFONTW_SIZE = 104;
var CF_SCREENFONTS = 1;
var CF_INITTOLOGFONTSTRUCT = 64;
var CF_TTONLY = 262144;
function cmdFontFace(hwnd) {
  const logFont = new Uint8Array(LOGFONTW_SIZE);
  const lfView = new DataView(logFont.buffer);
  lfView.setInt32(0, -fontSize, true);
  lfView.setInt32(16, fontBold ? 700 : 400, true);
  for (let i = 0; i < fontFace.length && i < 31; i++)
    lfView.setUint16(LF_FACENAME_OFF + i * 2, fontFace.charCodeAt(i), true);
  const cf = new Uint8Array(CHOOSEFONTW_SIZE);
  const view = new DataView(cf.buffer);
  view.setUint32(0, CHOOSEFONTW_SIZE, true);
  view.setBigUint64(8, ptrToBigInt2(hwnd), true);
  view.setBigUint64(24, ptrToBigInt2(bufferToPointer2(logFont)), true);
  view.setUint32(36, CF_SCREENFONTS | CF_INITTOLOGFONTSTRUCT | CF_TTONLY, true);
  if (!Comdlg32.ChooseFontW(cf)) return;
  const faceBuf = logFont.subarray(LF_FACENAME_OFF, LF_FACENAME_OFF + 64);
  const face = decodeWide2(faceBuf);
  const ptSize = view.getInt32(32, true);
  const newSize = Math.max(6, Math.min(72, Math.round(ptSize / 10)));
  const weight = lfView.getInt32(16, true);
  fontFace = face || fontFace;
  fontSize = newSize;
  fontBold = weight >= 600;
  rebuildFontBuf();
  applyLexer(hwnd, currentPath);
}
var OPENFILENAMEW_SIZE = 152;
var PATH_BUF_CHARS = 1024;
var TITLE_BUF_CHARS = 260;
var ALL_FILTER = encodeWide2("All Files (*.*)\0*.*\0");
function packOFN(ownerHwnd, fileBuf, fileTitleBuf, titleBuf2, initialDirBuf, flags, filterBuf) {
  const ofn = new Uint8Array(OPENFILENAMEW_SIZE);
  const view = new DataView(ofn.buffer);
  view.setUint32(0, OPENFILENAMEW_SIZE, true);
  view.setBigUint64(8, ptrToBigInt2(ownerHwnd), true);
  view.setBigUint64(24, ptrToBigInt2(bufferToPointer2(filterBuf)), true);
  view.setUint32(44, 1, true);
  view.setBigUint64(48, ptrToBigInt2(bufferToPointer2(fileBuf)), true);
  view.setUint32(56, PATH_BUF_CHARS, true);
  view.setBigUint64(64, ptrToBigInt2(bufferToPointer2(fileTitleBuf)), true);
  view.setUint32(72, TITLE_BUF_CHARS, true);
  if (initialDirBuf) view.setBigUint64(80, ptrToBigInt2(bufferToPointer2(initialDirBuf)), true);
  view.setBigUint64(88, ptrToBigInt2(bufferToPointer2(titleBuf2)), true);
  view.setUint32(96, flags, true);
  return ofn;
}
function showOpenDialog(ownerHwnd) {
  const fileBuf = new Uint8Array(PATH_BUF_CHARS * 2);
  const fileTitleBuf = new Uint8Array(TITLE_BUF_CHARS * 2);
  const titleBuf2 = encodeWide2("Open File");
  const dirBuf = encodeWide2(tjs.cwd);
  const OFN_EXPLORER = 524288;
  const OFN_FILEMUSTEXIST = 4096;
  const OFN_PATHMUSTEXIST = 2048;
  const OFN_HIDEREADONLY = 4;
  const ofn = packOFN(
    ownerHwnd,
    fileBuf,
    fileTitleBuf,
    titleBuf2,
    dirBuf,
    OFN_EXPLORER | OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_HIDEREADONLY,
    ALL_FILTER
  );
  if (!Comdlg32.GetOpenFileNameW(ofn)) return null;
  return decodeWide2(fileBuf);
}
function showSaveAsDialog(ownerHwnd, curPath) {
  const fileBuf = new Uint8Array(PATH_BUF_CHARS * 2);
  const fileTitleBuf = new Uint8Array(TITLE_BUF_CHARS * 2);
  const titleBuf2 = encodeWide2("Save As");
  const dirStr = curPath ? curPath.replace(/[\\/][^\\/]+$/, "") || tjs.cwd : tjs.cwd;
  const dirBuf = encodeWide2(dirStr);
  if (curPath) {
    const curWide = encodeWide2(curPath);
    fileBuf.set(curWide.subarray(0, Math.min(curWide.length, fileBuf.length)));
  }
  const OFN_EXPLORER = 524288;
  const OFN_OVERWRITEPROMPT = 2;
  const OFN_HIDEREADONLY = 4;
  const OFN_PATHMUSTEXIST = 2048;
  const ofn = packOFN(
    ownerHwnd,
    fileBuf,
    fileTitleBuf,
    titleBuf2,
    dirBuf,
    OFN_EXPLORER | OFN_OVERWRITEPROMPT | OFN_HIDEREADONLY | OFN_PATHMUSTEXIST,
    ALL_FILTER
  );
  if (!Comdlg32.GetSaveFileNameW(ofn)) return null;
  return decodeWide2(fileBuf);
}
function refreshTitle() {
  const name = currentPath ?? "Untitled";
  const dirty = isDirty ? " *" : "";
  const buf = encodeWide2(`TjsSciEditor - ${name}${dirty}`);
  User322.SetWindowTextW(hMainWnd, buf);
}
function getSciText() {
  const len = sciSend(hSciWnd, SCI_GETTEXTLENGTH2, 0, 0);
  const buf = new Uint8Array(len + 1);
  sciSend(hSciWnd, SCI_GETTEXT2, len + 1, buf);
  return new TextDecoder().decode(buf.subarray(0, len));
}
async function cmdNew() {
  if (isDirty) {
    const MB_YESNOCANCEL = 3, MB_ICONQUESTION = 32;
    const titleBuf2 = encodeWide2("Unsaved Changes");
    const textBuf = encodeWide2("Save changes before creating a new file?");
    const r = User322.MessageBoxW(hMainWnd, textBuf, titleBuf2, MB_YESNOCANCEL | MB_ICONQUESTION);
    if (r === 2) return;
    if (r === 6) await cmdSave();
  }
  sciSend(hSciWnd, SCI_SETTEXT2, 0, new TextEncoder().encode("\0"));
  applyLexer(hSciWnd, null);
  sciSend(hSciWnd, SCI_SETSAVEPOINT, 0, 0);
  sciSend(hSciWnd, SCI_EMPTYUNDOBUFFER, 0, 0);
  currentPath = null;
  isDirty = false;
  refreshTitle();
  pluginEmitter.emit("open", null);
}
function detectBomEncoding(bytes) {
  if (bytes[0] === 255 && bytes[1] === 254 && bytes[2] === 0 && bytes[3] === 0)
    return { encoding: "utf-32le", bomLen: 4 };
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 254 && bytes[3] === 255)
    return { encoding: "utf-32be", bomLen: 4 };
  if (bytes[0] === 255 && bytes[1] === 254)
    return { encoding: "utf-16le", bomLen: 2 };
  if (bytes[0] === 254 && bytes[1] === 255)
    return { encoding: "utf-16be", bomLen: 2 };
  if (bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191)
    return { encoding: "utf-8-bom", bomLen: 3 };
  return null;
}
async function cmdOpenPath(filePath) {
  try {
    prof("cmdOpenPath: start");
    const raw = await tjs.readFile(filePath);
    prof("cmdOpenPath: readFile");
    let fileBytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    const bom = detectBomEncoding(fileBytes);
    if (bom && bom.encoding !== "utf-8-bom") {
      const MB_YESNO = 4, MB_ICONWARNING = 48, IDYES = 6;
      const titleBuf2 = encodeWide2("Encoding Warning");
      const textBuf = encodeWide2(
        `"${filePath}"

File appears to be ${bom.encoding.toUpperCase()} (BOM detected).
Scintilla only supports UTF-8.

Convert to UTF-8 and open?`
      );
      const r = User322.MessageBoxW(hMainWnd, textBuf, titleBuf2, MB_YESNO | MB_ICONWARNING);
      if (r !== IDYES) return;
      const stripped = fileBytes.subarray(bom.bomLen);
      const text = new TextDecoder(bom.encoding).decode(stripped);
      fileBytes = new TextEncoder().encode(text);
      prof("cmdOpenPath: encoding conversion");
    } else if (bom && bom.encoding === "utf-8-bom") {
      fileBytes = fileBytes.subarray(3);
    }
    const buf = new Uint8Array(fileBytes.byteLength + 1);
    buf.set(fileBytes);
    prof("cmdOpenPath: build buf");
    sciSend(hSciWnd, SCI_SETTEXT2, 0, buf);
    prof("cmdOpenPath: SCI_SETTEXT");
    applyLexer(hSciWnd, filePath);
    prof("cmdOpenPath: applyLexer");
    sciSend(hSciWnd, SCI_SETSAVEPOINT, 0, 0);
    sciSend(hSciWnd, SCI_EMPTYUNDOBUFFER, 0, 0);
    currentPath = filePath;
    isDirty = false;
    refreshTitle();
    pluginEmitter.emit("open", filePath);
  } catch (e) {
    console.error("Open failed:", e.message);
  }
}
async function cmdOpen() {
  const filePath = showOpenDialog(hMainWnd);
  if (!filePath) return;
  await cmdOpenPath(filePath);
}
async function cmdSave() {
  if (!currentPath) {
    await cmdSaveAs();
    return;
  }
  try {
    await tjs.writeFile(currentPath, new TextEncoder().encode(getSciText()));
    sciSend(hSciWnd, SCI_SETSAVEPOINT, 0, 0);
    isDirty = false;
    refreshTitle();
    pluginEmitter.emit("save", currentPath);
  } catch (e) {
    console.error("Save failed:", e.message);
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
    pluginEmitter.emit("save", currentPath);
  } catch (e) {
    console.error("Save As failed:", e.message);
  }
}
function promptSaveIfDirty() {
  if (!isDirty) return true;
  const name = currentPath ?? "Untitled";
  const textBuf = encodeWide2(`"${name}" has unsaved changes.
Do you want to save before closing?`);
  const capBuf = encodeWide2("TjsSciEditor");
  const MB_YESNOCANCEL = 3;
  const MB_ICONQUESTION = 32;
  const result = User322.MessageBoxW(hMainWnd, textBuf, capBuf, MB_YESNOCANCEL | MB_ICONQUESTION);
  if (result === 6) {
    cmdSave().catch(console.error);
    return !isDirty;
  }
  if (result === 7) return true;
  return false;
}
function buildAccelTable() {
  const staticEntries = [
    [FVIRTKEY | FCONTROL, VK_N, CMD_NEW],
    [FVIRTKEY | FCONTROL, VK_O, CMD_OPEN],
    [FVIRTKEY | FCONTROL, VK_S, CMD_SAVE],
    [FVIRTKEY | FCONTROL | 4, VK_S, CMD_SAVE_AS],
    [FVIRTKEY | FCONTROL, VK_OEM_PLUS, CMD_FONT_INC],
    [FVIRTKEY | FCONTROL, VK_ADD, CMD_FONT_INC],
    [FVIRTKEY | FCONTROL, VK_OEM_MINUS, CMD_FONT_DEC],
    [FVIRTKEY | FCONTROL, VK_SUBTRACT, CMD_FONT_DEC],
    [FVIRTKEY | FALT, VK_LEFT, CMD_GOTO_PAIR]
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
    buf[i * ACCEL_SIZE] = virt;
    new DataView(buf.buffer).setUint16(i * ACCEL_SIZE + 2, key, true);
    new DataView(buf.buffer).setUint16(i * ACCEL_SIZE + 4, cmd, true);
  });
  return User322.CreateAcceleratorTableW(buf, entries.length);
}
function parseShortcut(shortcut) {
  const parts = shortcut.split("+").map((s) => s.trim().toLowerCase());
  let fVirt = FVIRTKEY;
  if (parts.includes("ctrl")) fVirt |= FCONTROL;
  if (parts.includes("shift")) fVirt |= 4;
  if (parts.includes("alt")) fVirt |= 16;
  const keyPart = parts[parts.length - 1];
  let key = 0;
  if (keyPart.length === 1) {
    key = keyPart.toUpperCase().charCodeAt(0);
  } else if (keyPart === "=") {
    key = 187;
  } else if (keyPart === "-") {
    key = 189;
  } else {
    return null;
  }
  return { fVirt, key };
}
var _menuLabels = [];
function menuLabel(text) {
  const buf = encodeWide2(text);
  _menuLabels.push(buf);
  return buf;
}
function buildMenuBar(hwnd) {
  const hMenuBar = User322.CreateMenu();
  const hFileMenu = User322.CreatePopupMenu();
  const hViewMenu = User322.CreatePopupMenu();
  const hThemeMenu = User322.CreatePopupMenu();
  User322.AppendMenuW(hFileMenu, MF_STRING, CMD_NEW, menuLabel("&New	Ctrl+N"));
  User322.AppendMenuW(hFileMenu, MF_STRING, CMD_OPEN, menuLabel("&Open...	Ctrl+O"));
  User322.AppendMenuW(hFileMenu, MF_SEPARATOR, 0, null);
  User322.AppendMenuW(hFileMenu, MF_STRING, CMD_SAVE, menuLabel("&Save	Ctrl+S"));
  User322.AppendMenuW(hFileMenu, MF_STRING, CMD_SAVE_AS, menuLabel("Save &As...	Ctrl+Shift+S"));
  User322.AppendMenuW(hFileMenu, MF_SEPARATOR, 0, null);
  User322.AppendMenuW(hFileMenu, MF_STRING, CMD_CLOSE, menuLabel("&Close"));
  for (let i = 0; i < THEME_NAMES.length; i++) {
    User322.AppendMenuW(hThemeMenu, MF_STRING, CMD_THEME_BASE + i, menuLabel(THEME_NAMES[i]));
  }
  User322.AppendMenuW(hViewMenu, MF_STRING, CMD_FONT_FACE, menuLabel("&Font..."));
  User322.AppendMenuW(hViewMenu, MF_SEPARATOR, 0, null);
  User322.AppendMenuW(hViewMenu, MF_STRING, CMD_WRAP, menuLabel("&Word Wrap"));
  User322.AppendMenuW(hViewMenu, MF_STRING, CMD_DETECT_LANG, menuLabel("&Detect Format"));
  User322.AppendMenuW(hViewMenu, MF_STRING, CMD_GOTO_PAIR, menuLabel("&Goto Pair	Alt+Left"));
  User322.AppendMenuW(hViewMenu, MF_SEPARATOR, 0, null);
  User322.AppendMenuW(hViewMenu, MF_POPUP, ptrToNum2(hThemeMenu), menuLabel("&Theme"));
  User322.AppendMenuW(hMenuBar, MF_POPUP, ptrToNum2(hFileMenu), menuLabel("&File"));
  User322.AppendMenuW(hMenuBar, MF_POPUP, ptrToNum2(hViewMenu), menuLabel("&View"));
  User322.SetMenu(hwnd, hMenuBar);
}
function updateThemeCheckmarks() {
  const hMenu = User322.GetMenu(hMainWnd);
  if (!hMenu) return;
  for (let i = 0; i < THEME_NAMES.length; i++) {
    const flag = THEME_NAMES[i] === activeTheme ? MF_BYCOMMAND | MF_CHECKED : MF_BYCOMMAND | MF_UNCHECKED;
    User322.CheckMenuItem(hMenu, CMD_THEME_BASE + i, flag);
  }
}
var _allPluginMenuItems = [];
function rebuildPluginsMenu() {
  _allPluginMenuItems = pluginAPIs.flatMap((api) => api._menuItems);
  if (_allPluginMenuItems.length === 0) return;
  const hMenuBar = User322.GetMenu(hMainWnd);
  if (!hMenuBar) return;
  const hPlugMenu = User322.CreatePopupMenu();
  let globalIndex = 0;
  let letterCode = 97;
  const nextLetter = () => letterCode <= 122 ? String.fromCharCode(letterCode++) : "";
  for (const api of pluginAPIs) {
    if (api._menuItems.length === 0) continue;
    const pluginTitle = api._pluginName.replace(/[_-]/g, " ");
    const letter = nextLetter();
    const accessPrefix = letter ? `&${letter} ` : "";
    if (api._menuItems.length === 1) {
      const item = api._menuItems[0];
      const label = item.shortcut ? `${accessPrefix}${pluginTitle}	${item.shortcut}` : `${accessPrefix}${pluginTitle}`;
      User322.AppendMenuW(hPlugMenu, MF_STRING, CMD_PLUGIN_BASE + globalIndex, menuLabel(label));
      globalIndex++;
    } else {
      const hSub = User322.CreatePopupMenu();
      for (const item of api._menuItems) {
        const label = item.shortcut ? `${item.label}	${item.shortcut}` : item.label;
        User322.AppendMenuW(hSub, MF_STRING, CMD_PLUGIN_BASE + globalIndex, menuLabel(label));
        globalIndex++;
      }
      User322.AppendMenuW(hPlugMenu, MF_POPUP, ptrToNum2(hSub), menuLabel(`${accessPrefix}${pluginTitle}`));
    }
  }
  const MF_BYPOSITION = 1024;
  User322.DeleteMenu(hMenuBar, 2, MF_BYPOSITION);
  User322.InsertMenuW(hMenuBar, 2, MF_BYPOSITION | MF_POPUP, ptrToNum2(hPlugMenu), menuLabel("&Plugins"));
  User322.DrawMenuBar(hMainWnd);
}
function dispatchPluginMenuItem(index) {
  const item = _allPluginMenuItems[index];
  if (item) try {
    item.fn();
  } catch (e) {
    console.error("[plugin menu]", e.message);
  }
}
var sciClassBuf = encodeWide2("Scintilla");
function createScintillaEditor(parentHwnd) {
  hSciWnd = User322.CreateWindowExW(
    0,
    sciClassBuf,
    null,
    WS_CHILD2 | WS_VISIBLE2 | WS_VSCROLL2 | WS_HSCROLL,
    0,
    0,
    100,
    100,
    parentHwnd,
    null,
    null,
    null
  );
  if (!hSciWnd) throw new Error("CreateWindowExW(Scintilla) failed");
  sciSend(hSciWnd, SCI_SETCODEPAGE, SC_CP_UTF8, 0);
  sciSend(hSciWnd, SCI_SETUNDOSELECTION, 1, 0);
  applyThemeStyles(hSciWnd);
  sciSend(hSciWnd, SCI_SETMARGINTYPEN, 0, SC_MARGIN_NUMBER);
  const rulerBuf = new TextEncoder().encode("9999\0");
  const rulerWidth = sciSend(hSciWnd, SCI_TEXTWIDTH, STYLE_LINENUMBER, rulerBuf);
  sciSend(hSciWnd, SCI_SETMARGINWIDTHN, 0, rulerWidth + 4);
  setupFolding(hSciWnd);
  sciSend(hSciWnd, SCI_SETSCROLLWIDTH, 1, 0);
  sciSend(hSciWnd, SCI_SETSCROLLWIDTHTRACKING, 1, 0);
  sciSend(hSciWnd, SCI_SETWRAPMODE, wordWrap ? SC_WRAP_WORD : SC_WRAP_NONE, 0);
  User322.SetFocus(hSciWnd);
}
function setupFolding(hwnd) {
  sciSend(hwnd, SCI_SETMARGINTYPEN, 2, SC_MARGIN_SYMBOL);
  sciSend(hwnd, SCI_SETMARGINWIDTHN, 2, 14);
  sciSend(hwnd, SCI_SETMARGINSENSITIVEN, 2, 1);
  sciSend(hwnd, SCI_SETMARGINMASKN, 2, SC_MASK_FOLDERS);
  sciSend(hwnd, SCI_SETFOLDFLAGS, 16, 0);
  sciSend(hwnd, SCI_SETAUTOMATICFOLD, SC_AUTOMATICFOLD_SHOW | SC_AUTOMATICFOLD_CLICK, 0);
  applyFoldMarkerColors(hwnd);
}
function layoutEditor(parentHwnd) {
  if (!hSciWnd) return;
  const rect = new Uint8Array(16);
  if (!User322.GetClientRect(parentHwnd, rect)) return;
  const view = new DataView(rect.buffer);
  const width = view.getInt32(8, true) - view.getInt32(0, true);
  const height = view.getInt32(12, true) - view.getInt32(4, true);
  User322.MoveWindow(hSciWnd, 0, 0, width, height, true);
}
var wndProc = new JSCallback2(
  types2.sint64,
  [types2.pointer, types2.uint32, types2.pointer, types2.sint64],
  (hWnd, msg, wParam, lParam) => {
    const wParamN = ptrToNum2(wParam);
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
        if (hSciWnd) User322.SetFocus(hSciWnd);
        return 0;
      case WM_COMMAND2: {
        const cmdId = wParamN & 65535;
        switch (cmdId) {
          case CMD_NEW:
            cmdNew().catch(console.error);
            break;
          case CMD_OPEN:
            cmdOpen().catch(console.error);
            break;
          case CMD_SAVE:
            cmdSave().catch(console.error);
            break;
          case CMD_SAVE_AS:
            cmdSaveAs().catch(console.error);
            break;
          case CMD_FONT_INC:
            setFontSize(hSciWnd, 1);
            break;
          case CMD_FONT_DEC:
            setFontSize(hSciWnd, -1);
            break;
          case CMD_FONT_FACE:
            cmdFontFace(hMainWnd);
            break;
          case CMD_WRAP:
            cmdToggleWrap();
            break;
          case CMD_DETECT_LANG:
            applyLexer(hSciWnd, currentPath);
            break;
          case CMD_GOTO_PAIR:
            cmdGotoPair();
            break;
          case CMD_CLOSE:
            if (promptSaveIfDirty()) User322.DestroyWindow(hWnd);
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
        const lptr = addrToPtr2(lParam);
        const code = read2.i32(lptr, 16);
        if (code === SCN_SAVEPOINTLEFT) {
          isDirty = true;
          refreshTitle();
        } else if (code === SCN_SAVEPOINTREACHED) {
          isDirty = false;
          refreshTitle();
        } else if (code === SCN_MODIFIED) {
          const modType = read2.i32(lptr, 40);
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
            const pos = sciSend(hSciWnd, SCI_GETCURRENTPOS2, 0, 0);
            sciSend(hSciWnd, SCI_SETSEL2, pos, pos);
            emitChange();
          }
          updateBraceHighlight(hSciWnd);
          pluginEmitter.emit("cursorMove");
        } else if (code === SCN_CHARADDED) {
          const ch = read2.i32(lptr, 32);
          if (ch === 10) {
            const pos = sciSend(hSciWnd, SCI_GETCURRENTPOS2, 0, 0);
            const line = sciSend(hSciWnd, SCI_LINEFROMPOSITION2, pos, 0);
            const prevLine = line - 1;
            if (prevLine >= 0) {
              const useTabs = sciSend(hSciWnd, SCI_GETUSETABS, 0, 0);
              const tabWidth = sciSend(hSciWnd, SCI_GETTABWIDTH, 0, 0) || 4;
              const indent = sciSend(hSciWnd, SCI_GETLINEINDENTATION2, prevLine, 0);
              if (indent > 0) {
                const indentStr = useTabs ? "	".repeat(Math.floor(indent / tabWidth)) + " ".repeat(indent % tabWidth) : " ".repeat(indent);
                const insBuf = new TextEncoder().encode(indentStr + "\0");
                sciSend(hSciWnd, SCI_INSERTTEXT, pos, insBuf);
                sciSend(hSciWnd, SCI_SETSEL2, pos + indentStr.length, pos + indentStr.length);
              }
            }
          }
          const PAIRS = { 40: 41, 91: 93, 123: 125, 34: 34, 39: 39, 96: 96 };
          const closing = PAIRS[ch];
          let pairInserted = false;
          if (closing !== void 0) {
            const pos = sciSend(hSciWnd, SCI_GETCURRENTPOS2, 0, 0);
            const nextCh = sciSend(hSciWnd, SCI_GETCHARAT, pos, 0);
            const nextIsAlnum = nextCh >= 48 && nextCh <= 57 || nextCh >= 65 && nextCh <= 90 || nextCh >= 97 && nextCh <= 122;
            if (!nextIsAlnum) {
              const closeBuf = new TextEncoder().encode(String.fromCharCode(closing) + "\0");
              sciSend(hSciWnd, SCI_INSERTTEXT, pos, closeBuf);
              sciSend(hSciWnd, SCI_SETSEL2, pos, pos);
              pairInserted = true;
            }
          }
          const CLOSERS = /* @__PURE__ */ new Set([41, 93, 125, 34, 39, 96]);
          if (!pairInserted && CLOSERS.has(ch)) {
            const pos = sciSend(hSciWnd, SCI_GETCURRENTPOS2, 0, 0);
            const nextCh = sciSend(hSciWnd, SCI_GETCHARAT, pos, 0);
            if (nextCh === ch) {
              sciSend(hSciWnd, SCI_DELETERANGE, pos - 1, 1);
              sciSend(hSciWnd, SCI_SETSEL2, pos, pos);
            }
          }
        } else if (code === SCN_MARGINCLICK) {
          const margin = read2.i32(lptr, 112);
          const position = read2.i64(lptr, 24);
          const line = sciSend(hSciWnd, SCI_LINEFROMPOSITION2, position, 0);
          if (margin === 2) sciSend(hSciWnd, SCI_TOGGLEFOLD, line, 0);
        }
        return 0;
      }
      case WM_CLOSE:
        if (!promptSaveIfDirty()) return 0;
        pluginEmitter.emit("close", currentPath);
        User322.DestroyWindow(hWnd);
        return 0;
      case WM_DESTROY:
        saveConfig().catch(console.error);
        User322.PostQuitMessage(0);
        return 0;
      default:
        return Number(User322.DefWindowProcW(hWnd, msg, wParam, lParam));
    }
  }
);
var classNameBuf = encodeWide2("TjsScintillaEditor");
var hCursor = User322.LoadCursorW(null, addrToPtr2(IDC_ARROW));
var wndClassBuf = packWndClassEx(
  wndProc.addr,
  classNameBuf,
  CS_HREDRAW | CS_VREDRAW,
  6n
  // (HBRUSH)(COLOR_WINDOW + 1)
);
new DataView(wndClassBuf.buffer).setBigUint64(40, ptrToBigInt2(hCursor), true);
var atom = User322.RegisterClassExW(wndClassBuf);
if (!atom) {
  console.error("RegisterClassExW failed");
  wndProc.close?.();
  tjs.exit(1);
}
var titleBuf = encodeWide2("Tjs Scintilla Editor");
hMainWnd = User322.CreateWindowExW(
  0,
  classNameBuf,
  titleBuf,
  WS_OVERLAPPEDWINDOW | WS_CLIPCHILDREN,
  CW_USEDEFAULT,
  CW_USEDEFAULT,
  900,
  650,
  null,
  null,
  null,
  null
);
if (!hMainWnd) {
  console.error("CreateWindowExW failed");
  wndProc.close?.();
  tjs.exit(1);
}
User322.ShowWindow(hMainWnd, SW_SHOWMAXIMIZED);
User322.UpdateWindow(hMainWnd);
prof("ShowWindow");
updateThemeCheckmarks();
await loadConfig();
prof("loadConfig");
applyLexer(hSciWnd, currentPath);
prof("applyLexer(initial)");
var _exeBasename = path2.basename(tjs.args[0]).toLowerCase();
var isCompiled = !_exeBasename.includes("tjs");
var _userArgs = tjs.args.slice(isCompiled ? 1 : 3).filter((a) => a !== "--profile");
var argFile = _userArgs[0];
if (argFile) await cmdOpenPath(argFile);
pluginAPIs = await loadPlugins(path2.join(APP_DIR, "plugins"), makePluginAPI);
prof("loadPlugins");
rebuildPluginsMenu();
var hAccel = buildAccelTable();
if (PROFILE) console.log(`[profile] \u2500\u2500 ready \u2500\u2500 total=${(performance.now() - _profStart0).toFixed(1)}ms`);
console.log("Editor running. Close the window to exit.");
var msgBuf = new Uint8Array(MSG_SIZE);
var msgView = new DataView(msgBuf.buffer);
while (running) {
  while (User322.PeekMessageW(msgBuf, null, 0, 0, PM_REMOVE)) {
    if (msgView.getUint32(MSG_MESSAGE_OFFSET, true) === WM_QUIT) {
      running = false;
      break;
    }
    if (hAccel && User322.TranslateAcceleratorW(hMainWnd, hAccel, msgBuf)) {
      continue;
    }
    User322.TranslateMessage(msgBuf);
    User322.DispatchMessageW(msgBuf);
  }
  if (running) await new Promise((r) => setTimeout(r, 1));
}
wndProc.close?.();
console.log("Editor closed.");
