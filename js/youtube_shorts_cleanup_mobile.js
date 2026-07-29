(function () {
  "use strict";

  // The iOS app asks for x-goog-api-format-version 2, so browse and search come
  // back as application/x-protobuf rather than JSON. There is no public schema
  // for it, but the response only has to be edited, not understood: the feed is
  // a repeated field of sections, and dropping the Shorts ones means rewriting
  // that field and fixing the length prefix of every message above it. Every
  // other byte is copied through untouched, so unknown fields survive intact.

  // Field numbers below are InnerTube extension numbers, read off the captured
  // responses. They are the wire equivalent of the renderer names the desktop
  // filter matches on.
  var SECTION_LIST = 49399797; // sectionListRenderer, holds the feed
  var SHORTS_SHELF = 51845067; // the dedicated Shorts shelf on home and search
  var SECTION_CONTENTS = 1; // sectionListRenderer's repeated section field

  // Element template names. The app renders through the Elements framework and
  // names the template inline, which is the clearest Shorts signal in the whole
  // payload.
  var SHORTS_TEMPLATES = ["shorts_video_cell", "shorts_lockup", "shorts_grid_shelf_footer"];
  // Weaker markers, only used to confirm a shelf that already looks like Shorts.
  var SHORTS_HINTS = SHORTS_TEMPLATES.concat(["shorts-shelf-item-", "FEshorts", "youtube_shorts_24"]);
  // Length-prefixed "SHORTS": the thumbnail overlay style, and the only marker
  // on a Shorts carousel that ships as a plain horizontal shelf.
  var SHORTS_OVERLAY = "SHORTS";

  var bytes = $response.bodyBytes;

  // Needs binary-body-mode=true on the script line; without it Surge hands over
  // a string and the payload is already mangled.
  if (!bytes || typeof bytes.length !== "number" || !bytes.length) {
    $done({});
    return;
  }

  // --- byte helpers ---

  function seq(text) {
    var out = new Array(text.length);
    for (var i = 0; i < text.length; i++) {
      out[i] = text.charCodeAt(i) & 0xff;
    }
    return out;
  }

  function find(buf, needle, from, to) {
    var last = to - needle.length;
    for (var i = from; i <= last; i++) {
      var j = 0;
      while (j < needle.length && buf[i + j] === needle[j]) {
        j++;
      }
      if (j === needle.length) {
        return i;
      }
    }
    return -1;
  }

  function has(buf, needle, from, to) {
    return find(buf, needle, from, to) !== -1;
  }

  function countOf(buf, needle, from, to) {
    var n = 0;
    var at = from;
    while (true) {
      at = find(buf, needle, at, to);
      if (at === -1) {
        return n;
      }
      n++;
      at += needle.length;
    }
  }

  function readVarint(buf, pos, end) {
    var result = 0;
    var shift = 1;
    while (pos < end) {
      var b = buf[pos++];
      result += (b & 0x7f) * shift;
      if (!(b & 0x80)) {
        return [result, pos];
      }
      shift *= 128;
      // Lengths and field keys both stay well inside this; anything longer is a
      // malformed parse rather than a real field.
      if (shift > 72057594037927936) {
        return null;
      }
    }
    return null;
  }

  function writeVarint(value) {
    var out = [];
    do {
      var b = value % 128;
      value = Math.floor(value / 128);
      out.push(value ? b | 0x80 : b);
    } while (value);
    return out;
  }

  // One level of a message: field number, wire type, where the key starts, and
  // where the value sits. Returns null on anything malformed, which is what
  // keeps the tag scan below from acting on a false positive.
  function parseFields(buf, start, end) {
    var fields = [];
    var pos = start;
    while (pos < end) {
      var keyStart = pos;
      var key = readVarint(buf, pos, end);
      if (!key) {
        return null;
      }
      var fieldNo = Math.floor(key[0] / 8);
      var wireType = key[0] % 8;
      pos = key[1];
      if (!fieldNo) {
        return null;
      }
      var valueStart = pos;
      if (wireType === 0) {
        var v = readVarint(buf, pos, end);
        if (!v) {
          return null;
        }
        pos = v[1];
      } else if (wireType === 1) {
        pos += 8;
      } else if (wireType === 5) {
        pos += 4;
      } else if (wireType === 2) {
        var len = readVarint(buf, pos, end);
        if (!len) {
          return null;
        }
        valueStart = len[1];
        pos = valueStart + len[0];
      } else {
        return null;
      }
      if (pos > end) {
        return null;
      }
      fields.push({ no: fieldNo, wire: wireType, keyStart: keyStart, start: valueStart, end: pos });
    }
    return fields;
  }

  // --- locating the feed ---

  // Scanning for the sectionListRenderer key rather than walking a fixed path:
  // browse nests it six levels down under the tab renderer and search only two,
  // and a continuation is a third shape again. A tag match is only accepted
  // once its length prefix and body both parse, which no captured response
  // produced more than one of.
  function locateSectionList() {
    var tag = writeVarint(SECTION_LIST * 8 + 2);
    var at = 0;
    while (true) {
      at = find(bytes, tag, at, bytes.length);
      if (at === -1) {
        return null;
      }
      var len = readVarint(bytes, at + tag.length, bytes.length);
      if (len && len[0] > 0 && len[1] + len[0] <= bytes.length) {
        var start = len[1];
        var end = start + len[0];
        var fields = parseFields(bytes, start, end);
        if (fields && fields.length) {
          var sections = 0;
          for (var i = 0; i < fields.length; i++) {
            if (fields[i].no === SECTION_CONTENTS && fields[i].wire === 2) {
              sections++;
            }
          }
          if (sections > 1) {
            return { start: start, end: end };
          }
        }
      }
      at += tag.length;
    }
  }

  // Walk down from the root following whichever field contains the target, so
  // every ancestor whose length prefix has to be rewritten is known without
  // hardcoding the path.
  function ancestorsOf(target) {
    var chain = [];
    var start = 0;
    var end = bytes.length;
    while (true) {
      var fields = parseFields(bytes, start, end);
      if (!fields) {
        return null;
      }
      var hit = null;
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (f.wire === 2 && f.start <= target && target < f.end) {
          hit = f;
          break;
        }
      }
      if (!hit) {
        return null;
      }
      chain.push({ start: start, end: end, keyStart: hit.keyStart, valueStart: hit.start, valueEnd: hit.end });
      if (hit.start === target) {
        return chain;
      }
      start = hit.start;
      end = hit.end;
    }
  }

  // --- recognising a Shorts section ---

  // Every video the section shows, by the id in its thumbnail URL. Used only to
  // ask whether a section is entirely Shorts.
  function videoIds(start, end) {
    var marker = VIDEO_NEEDLE;
    var ids = {};
    var count = 0;
    var at = start;
    while (true) {
      at = find(bytes, marker, at, end);
      if (at === -1) {
        return count;
      }
      at += marker.length;
      if (at + 11 <= end) {
        var id = "";
        for (var i = 0; i < 11; i++) {
          id += String.fromCharCode(bytes[at + i]);
        }
        if (!Object.prototype.hasOwnProperty.call(ids, id)) {
          ids[id] = true;
          count++;
        }
      }
    }
  }

  // Encoded once: isShortsSection runs for every section of every feed page.
  var TEMPLATE_NEEDLES = SHORTS_TEMPLATES.map(seq);
  var HINT_NEEDLES = SHORTS_HINTS.map(seq);
  var OVERLAY_NEEDLE = seq(String.fromCharCode(SHORTS_OVERLAY.length) + SHORTS_OVERLAY);
  var VIDEO_NEEDLE = seq("/vi/");

  function isShortsSection(start, end) {
    // The Elements template name is unambiguous on its own.
    for (var i = 0; i < TEMPLATE_NEEDLES.length; i++) {
      if (has(bytes, TEMPLATE_NEEDLES[i], start, end)) {
        return true;
      }
    }

    var fields = parseFields(bytes, start, end);

    // The dedicated shelf renderer, confirmed by a Shorts marker so that a
    // future non-Shorts use of the same shelf is not swept up with it.
    if (fields) {
      for (var f = 0; f < fields.length; f++) {
        if (fields[f].no === SHORTS_SHELF) {
          for (var h = 0; h < HINT_NEEDLES.length; h++) {
            if (has(bytes, HINT_NEEDLES[h], start, end)) {
              return true;
            }
          }
        }
      }
    }

    // A Shorts carousel dressed as an ordinary horizontal shelf: no template
    // name, but every card carries the SHORTS thumbnail overlay. Requiring the
    // overlay to cover every video in the section is what stops an ordinary
    // shelf losing its neighbours over a single Short.
    var overlays = countOf(bytes, OVERLAY_NEEDLE, start, end);
    if (!overlays) {
      return false;
    }
    var videos = videoIds(start, end);
    return videos > 0 && overlays >= videos;
  }

  // --- rewriting ---

  function concat(parts, total) {
    var out = new Uint8Array(total);
    var at = 0;
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (part instanceof Uint8Array) {
        out.set(part, at);
        at += part.length;
      } else {
        for (var j = 0; j < part.length; j++) {
          out[at++] = part[j];
        }
      }
    }
    return out;
  }

  function slice(start, end) {
    return bytes.subarray(start, end);
  }

  var located = locateSectionList();
  if (!located) {
    $done({});
    return;
  }

  var sectionFields = parseFields(bytes, located.start, located.end);
  if (!sectionFields) {
    $done({});
    return;
  }

  var kept = [];
  var keptLength = 0;
  var dropped = 0;
  for (var s = 0; s < sectionFields.length; s++) {
    var field = sectionFields[s];
    if (
      field.no === SECTION_CONTENTS &&
      field.wire === 2 &&
      isShortsSection(field.start, field.end)
    ) {
      dropped++;
      continue;
    }
    // Copied whole, from its key byte to the end of its value, so untouched
    // sections keep their exact original encoding.
    var part = slice(field.keyStart, field.end);
    kept.push(part);
    keptLength += part.length;
  }

  if (!dropped) {
    $done({});
    return;
  }

  var rebuilt = concat(kept, keptLength);

  // Back up the tree: each ancestor keeps its own bytes either side of the
  // child, and gets a fresh length prefix for the shrunken child.
  var chain = ancestorsOf(located.start);
  if (!chain) {
    $done({});
    return;
  }

  for (var c = chain.length - 1; c >= 0; c--) {
    var level = chain[c];
    var head = slice(level.start, level.keyStart);
    // keyStart..valueStart spans the key varint and the old length varint
    // together, so the key has to be re-read rather than sliced off.
    var keyEnd = readVarint(bytes, level.keyStart, level.valueStart)[1];
    var key = slice(level.keyStart, keyEnd);
    var length = writeVarint(rebuilt.length);
    var tail = slice(level.valueEnd, level.end);
    var total = head.length + key.length + length.length + rebuilt.length + tail.length;
    rebuilt = concat([head, key, length, rebuilt, tail], total);
  }

  $done({ bodyBytes: rebuilt });
})();
