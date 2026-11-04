/**
 * DeepBoost Life — Google Sheet sync script
 *
 * Setup (each user does this in their OWN Google Sheet):
 * 1. Open a new Google Sheet → Extensions → Apps Script.
 * 2. Delete the sample code, paste this whole file, Save.
 * 3. (Optional, recommended) set SYNC_KEY below to any secret word.
 * 4. Deploy → New deployment → Type: Web app
 *      Execute as: Me
 *      Who has access: Anyone
 *    → Deploy → allow permissions → copy the Web app URL (ends with /exec).
 * 5. In the app: Settings → Google Sheet Sync → paste URL (+ same sync key) → Test → Save.
 */

const SYNC_KEY = ''; // e.g. 'deep-2026-secret'. Leave empty to skip the check.

function doGet() {
  return json_({ ok: true, app: 'DeepBoost Life', time: new Date().toISOString() });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (SYNC_KEY && body.key !== SYNC_KEY) {
      return json_({ ok: false, error: 'Invalid sync key' });
    }
    if (body.action === 'ping') {
      return json_({ ok: true, sheet: SpreadsheetApp.getActiveSpreadsheet().getName() });
    }
    if (body.action === 'replace') {
      const headers = body.headers || [];
      const rows = body.rows || [];
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sh = ss.getSheetByName(body.sheet) || ss.insertSheet(body.sheet);
      sh.clearContents();
      if (headers.length) {
        const values = [headers].concat(rows);
        sh.getRange(1, 1, values.length, headers.length).setValues(values);
        sh.setFrozenRows(1);
      }
      return json_({ ok: true, written: rows.length });
    }
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
