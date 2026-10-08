/*
 * Launchpad – PebbleKit JS
 *
 * Fetches upcoming launches from Launch Library 2, then sends them
 * to the watch as a series of small AppMessages — one per launch —
 * because Pebble's AppMessage channel can't carry a whole array in
 * one go.
 *
 * Message protocol:
 *   First message of a batch carries `total` = number of launches.
 *   Each message carries `idx` 0..N-1 plus fields for that launch.
 *   On error, sends `error` with a short string.
 */

var API_URL =
  "https://ll.thespacedevs.com/2.3.0/launches/upcoming/" +
  "?limit=10&mode=list&hide_recent_previous=true";

// ---- helpers ------------------------------------------------------

function formatWhen(iso) {
  if (!iso) return "TBD";
  var t = new Date(iso);
  var now = new Date();
  var diffMin = Math.round((t - now) / 60000);

  if (diffMin < 0)             return "now";
  if (diffMin < 60)            return "in " + diffMin + "m";
  if (diffMin < 60 * 24)       return "in " + Math.floor(diffMin / 60) + "h " + (diffMin % 60) + "m";
  if (diffMin < 60 * 24 * 7)   return "in " + Math.floor(diffMin / 60 / 24) + "d";

  var months = ["Jan","Feb","Mar","Apr","May","Jun",
                "Jul","Aug","Sep","Oct","Nov","Dec"];
  var day   = t.getDate();
  var month = months[t.getMonth()];
  var hh    = ("0" + t.getHours()).slice(-2);
  var mm    = ("0" + t.getMinutes()).slice(-2);
  return day + " " + month + " " + hh + ":" + mm;
}

function trim(s, max) {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// Launch names come as "Rocket | Mission". Split for compact display.
function splitName(name) {
  if (!name) return { provider: "", mission: "(unnamed)" };
  var i = name.indexOf(" | ");
  if (i < 0) return { provider: "", mission: name };
  return {
    provider: name.slice(0, i),
    mission:  name.slice(i + 3)
  };
}

// ---- AppMessage sending (sequential, one launch per message) ------
//
// Because Pebble drops messages if you fire them too fast, we send
// them one by one, waiting for the ACK of each before sending the
// next. Classic pattern.

function sendOne(payload, onDone, onFail) {
  Pebble.sendAppMessage(payload,
    function() { onDone(); },
    function(_, err) {
      console.log("send failed: " + (err && err.error));
      if (onFail) onFail(err);
    });
}

function sendLaunches(rows) {
  var i = 0;

  function next() {
    if (i >= rows.length) {
      console.log("all launches sent");
      return;
    }
    var r = rows[i];
    var payload = {
      idx:      i,
      name:     r.name,
      provider: r.provider,
      status:   r.status,
      when:     r.when
    };
    // The very first message also carries the total, so the watch
    // knows to clear its list and expect N entries.
    if (i === 0) payload.total = rows.length;
    i++;
    sendOne(payload, next, function() {
      // Retry once after a short delay
      setTimeout(function() { sendOne(payload, next); }, 500);
    });
  }

  next();
}

function sendError(message) {
  Pebble.sendAppMessage({ error: String(message).slice(0, 40) });
}

// ---- API fetch ----------------------------------------------------

function fetchLaunches() {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", API_URL, true);
  xhr.timeout = 15000;

  xhr.onload = function() {
    if (xhr.status < 200 || xhr.status >= 300) {
      console.log("HTTP " + xhr.status);
      sendError("HTTP " + xhr.status);
      return;
    }
    try {
      var data = JSON.parse(xhr.responseText);
      var results = data.results || [];
      var rows = results.map(function(r) {
        var parts = splitName(r.name);
        return {
          name:     trim(parts.mission, 28),
          provider: trim(parts.provider, 22),
          status:   (r.status && r.status.abbrev) || "",
          when:     formatWhen(r.net)
        };
      });
      console.log("fetched " + rows.length + " launches");
      sendLaunches(rows);
    } catch (e) {
      console.log("parse error: " + e);
      sendError("Parse error");
    }
  };

  xhr.onerror   = function() { console.log("network error"); sendError("Network"); };
  xhr.ontimeout = function() { console.log("timeout");       sendError("Timeout"); };
  xhr.send();
}

// ---- wire up ------------------------------------------------------

Pebble.addEventListener("ready", function() {
  console.log("Launchpad pkjs ready");
  fetchLaunches();
});