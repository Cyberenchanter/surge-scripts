(function () {
  "use strict";

  // Toggle either off to keep that category.
  var REMOVE_SHELVES = true; // the "Shorts" shelf/carousel as a whole
  var REMOVE_ITEMS = true; // individual Shorts cards sitting in a normal feed

  var body = $response.body;

  if (typeof body !== "string" || !body) {
    $done({});
    return;
  }

  // A home or search page with no Shorts on it is common, and parsing plus
  // re-serialising a few megabytes of InnerTube JSON is by far the expensive
  // part of this script. Every Shorts surface names itself in at least one of
  // these, so a substring test on the raw body settles it for free.
  if (
    body.indexOf("shortsLockupViewModel") === -1 &&
    body.indexOf("reelWatchEndpoint") === -1 &&
    body.indexOf("reelItemRenderer") === -1 &&
    body.indexOf("reelShelfRenderer") === -1
  ) {
    $done({});
    return;
  }

  var payload;
  try {
    payload = JSON.parse(body);
  } catch (error) {
    $done({});
    return;
  }

  if (!payload || typeof payload !== "object") {
    $done({});
    return;
  }

  var changed = false;

  // --- recognising a Short ---

  // Desktop currently ships Shorts as shortsLockupViewModel and routes the tap
  // through onTap.innertubeCommand; the older reelItemRenderer put the same
  // endpoint under navigationEndpoint. Both are checked because the renderer
  // names have already been renamed once and the endpoint has not.
  function reelEndpoint(renderer) {
    if (!renderer || typeof renderer !== "object") {
      return false;
    }
    if (renderer.navigationEndpoint && renderer.navigationEndpoint.reelWatchEndpoint) {
      return true;
    }
    return !!(
      renderer.onTap &&
      renderer.onTap.innertubeCommand &&
      renderer.onTap.innertubeCommand.reelWatchEndpoint
    );
  }

  // Grid entries wrap their payload one level down; everything else is the
  // renderer itself.
  function unwrap(entry) {
    if (entry.richItemRenderer && entry.richItemRenderer.content) {
      return entry.richItemRenderer.content;
    }
    return entry;
  }

  function isShortsCard(entry) {
    var content = unwrap(entry);
    if (content.shortsLockupViewModel || content.reelItemRenderer) {
      return true;
    }
    // A Short served through an ordinary video renderer. Not present in any
    // captured response, but the endpoint check costs nothing and it is the
    // shape that would slip past a renderer-name test.
    return (
      reelEndpoint(content.videoRenderer) ||
      reelEndpoint(content.lockupViewModel) ||
      reelEndpoint(content.compactVideoRenderer)
    );
  }

  // The brand icon is the one label that is neither localised nor renamed:
  // home carries it as richShelfRenderer.icon.iconType, search as a
  // clientResource image on the grid shelf header.
  function shelfIconIsShorts(shelf) {
    if (shelf.icon && typeof shelf.icon.iconType === "string" && shelf.icon.iconType.indexOf("SHORTS") !== -1) {
      return true;
    }
    var header = shelf.header && shelf.header.sectionHeaderViewModel;
    var accessory = header && header.leadingAccessory;
    var sources = accessory && accessory.image && accessory.image.sources;
    if (!Array.isArray(sources)) {
      return false;
    }
    return sources.some(function (source) {
      var name = source && source.clientResource && source.clientResource.imageName;
      return typeof name === "string" && name.indexOf("SHORTS") !== -1;
    });
  }

  // Fallback for a shelf that loses its icon: every card it holds is a Short.
  // A mixed shelf deliberately fails this and is thinned card by card instead,
  // so a normal shelf is never dropped for containing one Short.
  function shelfContentsAreShorts(shelf) {
    var items = shelf.contents || shelf.items;
    if (!Array.isArray(items) || !items.length) {
      return false;
    }
    return items.every(function (item) {
      return item && typeof item === "object" && isShortsCard(item);
    });
  }

  function isShortsShelf(entry) {
    var host = entry;
    if (entry.richSectionRenderer && entry.richSectionRenderer.content) {
      host = entry.richSectionRenderer.content;
    }
    // Dedicated Shorts container, no further test needed.
    if (host.reelShelfRenderer) {
      return true;
    }
    var shelf = host.richShelfRenderer || host.gridShelfViewModel || host.shelfRenderer;
    if (!shelf || typeof shelf !== "object") {
      return false;
    }
    return shelfIconIsShorts(shelf) || shelfContentsAreShorts(shelf);
  }

  function isShortsEntry(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return false;
    }
    if (REMOVE_SHELVES && isShortsShelf(entry)) {
      return true;
    }
    return REMOVE_ITEMS && isShortsCard(entry);
  }

  // --- rewriting ---

  // Filtering every array rather than walking the handful of paths seen in the
  // captures: the same items arrive under twoColumnBrowseResultsRenderer on a
  // first load, appendContinuationItemsAction on scroll, and
  // reloadContinuationItemsCommand behind a search chip, and the response is
  // already parsed either way. isShortsEntry only ever inspects the top of an
  // entry, so nothing is dropped for merely containing a Short deeper down.
  function walk(node) {
    if (Array.isArray(node)) {
      var kept = [];
      var dropped = false;
      for (var i = 0; i < node.length; i++) {
        if (isShortsEntry(node[i])) {
          dropped = true;
          continue;
        }
        walk(node[i]);
        kept.push(node[i]);
      }
      if (dropped) {
        // In place: the array is reachable from paths this walk has already
        // passed through, so replacing the binding is not an option.
        node.length = 0;
        for (var j = 0; j < kept.length; j++) {
          node.push(kept[j]);
        }
        changed = true;
      }
      return;
    }
    if (node && typeof node === "object") {
      var keys = Object.keys(node);
      for (var k = 0; k < keys.length; k++) {
        walk(node[keys[k]]);
      }
    }
  }

  walk(payload);

  if (!changed) {
    $done({});
    return;
  }

  // The entity payloads the dropped cards referenced are left in
  // frameworkUpdates. They are keyed lookups, and nothing renders them once
  // the view models pointing at them are gone.
  $done({ body: JSON.stringify(payload) });
})();
