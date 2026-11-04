/**
 * DeepBoost Life — Google Sheet sync script
 *
 * Each user puts this in their OWN Google Sheet (so data never mixes).
 *
 * 1. Open a new Google Sheet → Extensions → Apps Script.
 * 2. Delete the sample code, paste this whole file, then change SYNC_KEY below
 *    to any secret word (and type the same word in the app). Save.
 * 3. Deploy → New deployment → ⚙ Select type: Web app
 *      Description: DeepBoost sync
 *      Execute as: Me
 *      Who has access: Anyone
 *    → Deploy → Authorize access → choose your Google account →
 *      "Advanced" → "Go to … (unsafe)" → Allow   (this is your own script)
 * 4. Copy the Web app URL (ends with /exec).
 * 5. App → Settings → Google Sheet sync → paste URL + same sync key → Save → Sync now.
 *
 * If you edit this code later: Deploy → Manage deployments → ✏ Edit →
 * Version: New version → Deploy (the URL stays the same).
 */

const SYNC_KEY = 'change-this-secret-word';

function doGet() {
  return json_({ ok: true, app: 'DeepBoost Life', time: new Date().toISOString() });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (SYNC_KEY && body.key !== SYNC_KEY) {
      return json_({ ok: false, error: 'Invalid sync key. It must match SYNC_KEY in Apps Script.' });
    }
    if (body.action === 'ping') {
      return json_({ ok: true, sheet: SpreadsheetApp.getActiveSpreadsheet().getName() });
    }
    lock.waitLock(30000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (body.action === 'replace') {
      writeSheet_(ss, body.sheet, body.headers || [], body.rows || []);
      return json_({ ok: true, written: (body.rows || []).length });
    }
    if (body.action === 'replace_many') {
      let written = 0;
      (body.sheets || []).forEach(function (s) {
        writeSheet_(ss, s.sheet, s.headers || [], s.rows || []);
        written += (s.rows || []).length;
      });
      writeSummary_(ss, body.sheets || []);
      return json_({ ok: true, written: written });
    }
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try {
      lock.releaseLock();
    } catch (x) {}
  }
}

function writeSheet_(ss, name, headers, rows) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  if (!headers.length) return;
  const values = [headers].concat(rows);
  sh.getRange(1, 1, values.length, headers.length).setValues(values);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1E5B45').setFontColor('#FFFFFF');
}

function writeSummary_(ss, sheets) {
  const sh = ss.getSheetByName('Summary') || ss.insertSheet('Summary', 0);
  sh.clearContents();
  const rows = [['DeepBoost Life — last sync', new Date()], ['', ''], ['Sheet', 'Rows']];
  sheets.forEach(function (s) {
    rows.push([s.sheet, (s.rows || []).length]);
  });
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  sh.getRange(3, 1, 1, 2).setFontWeight('bold');
  sh.autoResizeColumns(1, 2);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
