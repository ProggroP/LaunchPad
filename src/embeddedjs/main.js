import Poco from "commodetto/Poco";
import Messages from "pebble/message";
import Button from "pebble/button";
import Touch from "embedded:sensor/Touch/pebble";
import Timer from "timer";

const render = new Poco(screen);

const fontTitle  = new render.Font("Gothic-Bold", 18);
const fontBody   = new render.Font("Gothic-Bold", 14);
const fontHeader = new render.Font("Gothic-Bold", 18);

const BG     = render.makeColor(0,   0,   0);
const FG     = render.makeColor(255, 255, 255);
const DIM    = render.makeColor(136, 136, 136);
const ACCENT = render.makeColor(255, 107,  53);
const GOOD   = render.makeColor( 76, 175,  80);
const BAD    = render.makeColor(244,  67,  54);

function statusColor(abbrev) {
  if (abbrev === "Go")  return GOOD;
  if (abbrev === "TBC") return ACCENT;
  if (abbrev === "TBD") return DIM;
  if (!abbrev)          return DIM;
  return BAD;
}

const launches = [];
let expectedTotal = 0;
let errorMsg = null;
let scrollOffset = 0;

const ROW_H    = 54;
const LIST_TOP = 30;

// Movement below this is treated as a tap, so a slightly shaky finger
// doesn't nudge the list.
const DRAG_DEADZONE = 4;

// If the phone hasn't sent anything by then, say so instead of showing
// "Fetching…" forever.
const LOAD_TIMEOUT = 12000;

function cx(text, font) {
  return (render.width - render.getTextWidth(text, font)) >> 1;
}

function maxScrollOffset() {
  return Math.max(0, launches.length * ROW_H - (render.height - LIST_TOP));
}

function draw() {
  const W = render.width;
  const H = render.height;

  render.begin();
  render.fillRectangle(BG, 0, 0, W, H);

  const headerText = errorMsg         ? "Launchpad"        :
                     launches.length === 0 ? "Loading…"    :
                     "Next launches";
  render.drawText(headerText, fontHeader, ACCENT, cx(headerText, fontHeader), 4);
  render.fillRectangle(DIM, 24, 26, W - 48, 1);

  if (errorMsg) {
    render.drawText(errorMsg, fontBody, DIM, cx(errorMsg, fontBody), (H >> 1) - 7);
    render.end();
    return;
  }

  if (launches.length === 0) {
    const txt = "Fetching\nlaunches…";
    render.drawText("Fetching", fontBody, DIM, cx("Fetching", fontBody), (H >> 1) - 14);
    render.drawText("launches…", fontBody, DIM, cx("launches…", fontBody), (H >> 1) + 2);
    render.end();
    return;
  }

  for (let i = 0; i < launches.length; i++) {
    const y0 = LIST_TOP + i * ROW_H - scrollOffset;
    if (y0 + ROW_H < LIST_TOP) continue;
    if (y0 > H) break;

    const L = launches[i];

    const statusLine = `${L.status || "—"}  ·  ${L.when}`;
    if (y0 + 2  >= LIST_TOP) render.drawText(L.name,     fontTitle, FG,  cx(L.name, fontTitle),    y0 + 2);
    if (y0 + 22 >= LIST_TOP) render.drawText(L.provider, fontBody,  DIM, cx(L.provider, fontBody), y0 + 22);
    if (y0 + 38 >= LIST_TOP) render.drawText(statusLine, fontBody,  statusColor(L.status),         cx(statusLine, fontBody), y0 + 38);

    if (i < launches.length - 1) {
      render.fillRectangle(DIM, 24, y0 + ROW_H - 1, W - 48, 1);
    }
  }

  render.end();
}

// ---- Scroll buttons -----------------------------------------------

new Button({
  types: ["up", "down"],
  onPush(down, type) {
    if (!down) return;
    if (type === "up") {
      if (scrollOffset <= 0) return;
      scrollOffset -= ROW_H;
    } else {
      if (scrollOffset >= maxScrollOffset()) return;
      scrollOffset += ROW_H;
    }
    draw();
  }
});

// ---- Scroll by swipe ----------------------------------------------
//
// The list follows the finger directly: swipe up to reveal later
// entries, down to go back. sample() gives us one point per event and
// an empty array on liftoff, so we track the gesture ourselves.

let dragStartY      = -1;   // -1 = no finger down
let dragStartOffset = 0;
let dragging        = false;

new Touch({
  onSample() {
    const points = this.sample();
    if (points === undefined) return;

    if (points.length === 0) {          // liftoff
      dragStartY = -1;
      dragging   = false;
      return;
    }

    const y = points[0].y;

    if (dragStartY < 0) {               // touchdown
      dragStartY      = y;
      dragStartOffset = scrollOffset;
      dragging        = false;
      return;
    }

    const dy = y - dragStartY;
    if (!dragging) {
      if (Math.abs(dy) < DRAG_DEADZONE) return;
      dragging = true;
    }

    // Finger moves down -> content moves down -> offset shrinks.
    let next = dragStartOffset - dy;
    if (next < 0) next = 0;
    const max = maxScrollOffset();
    if (next > max) next = max;

    if (next !== scrollOffset) {
      scrollOffset = next;
      draw();
    }
  }
});

// ---- Load timeout -------------------------------------------------
//
// Without PebbleKit JS on the other end nothing ever arrives, not even
// an error, so "Fetching…" would sit there for good. Say something.

let loadTimer;

function cancelLoadTimeout() {
  if (loadTimer !== undefined) {
    Timer.clear(loadTimer);
    loadTimer = undefined;
  }
}

loadTimer = Timer.set(() => {
  loadTimer = undefined;
  if (launches.length === 0 && !errorMsg) {
    errorMsg = "No phone connection";
    draw();
  }
}, LOAD_TIMEOUT);

// ---- AppMessage ---------------------------------------------------

const messages = new Messages({
  input: 256,
  output: 64,
  keys: ["dummy", "idx", "name", "provider", "status", "when", "total", "error"],
  onReadable() {
    const msg = messages.read();

    // Anything at all means the phone is alive — even an error.
    cancelLoadTimeout();

    const err = msg.get("error");
    if (err !== undefined) {
      errorMsg = err;
      draw();
      return;
    }

    const total = msg.get("total");
    if (total !== undefined) {
      expectedTotal = total;
      launches.length = 0;
      scrollOffset = 0;   // reset scroll on fresh batch
      errorMsg = null;
    }

    const idx = msg.get("idx");
    if (idx !== undefined) {
      launches[idx] = {
        name:     msg.get("name")     || "(unnamed)",
        provider: msg.get("provider") || "",
        status:   msg.get("status")   || "",
        when:     msg.get("when")     || "TBD",
      };
    }

    draw();
  }
});

draw();
