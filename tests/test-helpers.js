// SpectraLab Test Helpers — shared across all test suites
// @ts-check
"use strict";

var testPassed = 0;
var testFailed = 0;
var testLog = [];
var testSummaryEl = null;
var testLogEl = null;

function initTests(summaryId, logId) {
  testSummaryEl = document.getElementById(summaryId || 'summary');
  testLogEl = document.getElementById(logId || 'log');
  testPassed = 0;
  testFailed = 0;
  testLog = [];
}

function section(name) {
  var line = '\n\u2550\u2550\u2550 ' + name + ' \u2550\u2550\u2550';
  testLog.push({ text: line, cls: 'section' });
  if (testLogEl) {
    var div = document.createElement('div');
    div.className = 'section';
    div.textContent = line;
    testLogEl.appendChild(div);
  }
}

function assert(condition, name, detail) {
  if (condition) {
    testPassed++;
    logResult('  \u2713 ' + name, 'pass');
  } else {
    testFailed++;
    logResult('  \u2717 ' + name + (detail ? ' \u2014 ' + detail : ''), 'fail');
  }
  updateSummary();
}

function assertEqual(actual, expected, name) {
  assert(actual === expected, name,
    'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

function assertNotEqual(actual, notExpected, name) {
  assert(actual !== notExpected, name,
    'expected NOT ' + JSON.stringify(notExpected) + ', got ' + JSON.stringify(actual));
}

function assertArrayEqual(a, b, name) {
  var ok = a.length === b.length;
  if (ok) {
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) { ok = false; break; }
    }
  }
  var detail = '';
  if (!ok) {
    detail = 'arrays differ (length ' + a.length + ' vs ' + b.length;
    if (a.length === b.length) {
      detail += ', first diff at ' + findFirstDiff(a, b);
    }
    detail += ')';
  }
  assert(ok, name, detail);
}

function findFirstDiff(a, b) {
  for (var i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return 'index ' + i + ': ' + (a[i] != null ? a[i] : '_') + ' vs ' + (b[i] != null ? b[i] : '_');
  }
  return '-1';
}

function assertNotNull(value, name) {
  assert(value !== null && value !== undefined, name,
    'expected non-null, got ' + String(value));
}

function assertTrue(value, name) {
  assert(value === true, name,
    'expected true, got ' + JSON.stringify(value));
}

function assertFalse(value, name) {
  assert(value === false, name,
    'expected false, got ' + JSON.stringify(value));
}

function assertGreater(actual, threshold, name) {
  assert(actual > threshold, name,
    'expected > ' + threshold + ', got ' + actual);
}

function assertLessOrEqual(actual, threshold, name) {
  assert(actual <= threshold, name,
    'expected <= ' + threshold + ', got ' + actual);
}

function logResult(text, cls) {
  testLog.push({ text: text, cls: cls });
  if (testLogEl) {
    var div = document.createElement('div');
    div.className = cls;
    div.textContent = text;
    testLogEl.appendChild(div);
  }
}

function updateSummary() {
  if (testSummaryEl) {
    testSummaryEl.textContent =
      'Passed: ' + testPassed + '  Failed: ' + testFailed +
      '  Total: ' + (testPassed + testFailed);
    testSummaryEl.className = testFailed > 0 ? 'summary-fail' : 'summary-pass';
  }
  // Notify parent aggregator via postMessage (works across file:// origins)
  if (window.parent && window.parent !== window) {
    try {
      window.parent.postMessage({
        type: 'spectralab-test-result',
        passed: testPassed,
        failed: testFailed,
        total: testPassed + testFailed
      }, '*');
    } catch (e) { /* ignore */ }
  }
}

// Load binary file as Uint8Array (returns Promise)
function loadTestFile(url) {
  return fetch(url).then(function(r) {
    if (!r.ok) throw new Error('Failed to load ' + url + ': ' + r.status);
    return r.arrayBuffer();
  }).then(function(buf) {
    return new Uint8Array(buf);
  });
}

// Helper: create Uint8Array from hex string
function hexToBytes(hex) {
  var bytes = new Uint8Array(hex.length / 2);
  for (var i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// Helper: generate synthetic SCR data (6912 bytes)
function makeSyntheticScr() {
  var data = new Uint8Array(6912);
  // Fill bitmap with a recognizable pattern
  for (var i = 0; i < 6144; i++) {
    data[i] = (i & 0xFF);
  }
  // Fill attrs with ink=7 paper=0 bright=0 flash=0 (0x07) alternating with ink=0 paper=7 (0x38)
  for (var i = 0; i < 768; i++) {
    data[6144 + i] = (i & 1) ? 0x38 : 0x07;
  }
  return data;
}

// Helper: generate random Uint8Array of given length
function makeRandomData(length) {
  var data = new Uint8Array(length);
  for (var i = 0; i < length; i++) {
    data[i] = Math.floor(Math.random() * 256);
  }
  return data;
}

// Helper: generate repetitive data (compresses well)
function makeRepetitiveData(length) {
  var data = new Uint8Array(length);
  for (var i = 0; i < length; i++) {
    data[i] = (i % 16);
  }
  return data;
}
