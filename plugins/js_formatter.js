#!/c/TEMP/bun/bin/bun.exe
export default function(api) {
  api.addMenuItem('Format JS/TS (oxfmt)', 'Alt+Shift+F', async () => {
    const sel = api.sci.getSelText();
    const hasSelection = sel.length > 0;
    const text = hasSelection ? sel : api.sci.getText();

    const tmpDir  = tjs.cwd + '/tmp';
    try { await tjs.stat(tmpDir); } catch { await tjs.makeDir(tmpDir); }
    const tmpFile = tmpDir + '/oxfmt_tmp.js';

    await tjs.writeFile(tmpFile, new TextEncoder().encode(text));

    try {
      const proc = tjs.spawn(['oxfmt', '--write', tmpFile], { stdout: 'pipe', stderr: 'pipe' });
      const errChunks = [];
      if (proc.stderr) for await (const chunk of proc.stderr) errChunks.push(chunk);
      const status = await proc.wait();
      if (status.exit_status !== 0) {
        const msg = errChunks.length ? new TextDecoder().decode(errChunks[0]) : '(no output)';
        api.alert('oxfmt failed (exit ' + status.exit_status + '):\n' + msg.slice(0, 300));
        return;
      }

      const formatted = new TextDecoder().decode(await tjs.readFile(tmpFile));

      if (hasSelection) {
        api.sci.replaceSelection(formatted);
      } else {
        const pos = api.sci.getCursorPos();
        api.sci.setText(formatted);
        api.sci.setSelection(Math.min(pos, formatted.length), Math.min(pos, formatted.length));
      }
    } catch (e) {
      api.alert('oxfmt error: ' + e.message);
    } finally {
      await tjs.remove(tmpFile).catch(() => {});
    }
  });
}
