(function () {
  "use strict";

  // Toggle any of these off to keep that category.
  var REMOVE_ADS = true; // ads and sponsored videos, on every endpoint below
  var REMOVE_LIVE = true; // live room cards in the homepage feed
  var REMOVE_FLOOR = true; // data.floor_info / data.business_card promo strips

  var body = $response.body;

  if (typeof body !== "string" || !body) {
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

  if (!payload || payload.code !== 0 || !payload.data) {
    $done({});
    return;
  }

  var data = payload.data;

  // Both endpoints are fed by the same ad system and even agree on card_type
  // (0 for a plain banner, 82 for a sponsored video), but they wrap it
  // differently: the homepage feed marks the item itself, search nests an
  // ad payload under biz_data and encodes the kind in the type string.
  // Hence one dispatcher per response shape rather than one per URL.

  // --- homepage feed: /x/web-interface/wbi/index/top/feed/rcmd ---

  // The plain 广告 banner and the sponsored video that mimics an ordinary
  // recommendation both arrive as goto "ad" with business_info.is_ad set.
  function isFeedAd(item) {
    if (item.goto === "ad") {
      return true;
    }
    var business = item.business_info;
    return !!(business && typeof business === "object" && (business.is_ad || business.is_ad_loc));
  }

  // Live rooms come through as goto "live" (see the live_<roomid> entries in
  // the request's last_showlist). room_info is deliberately not used as a
  // signal: an ordinary video card can carry it when its uploader is streaming.
  function isFeedLive(item) {
    return item.goto === "live";
  }

  function cleanFeed() {
    if (!Array.isArray(data.item)) {
      return false;
    }
    var changed = false;
    var kept = data.item.filter(function (item) {
      if (!item || typeof item !== "object") {
        return true;
      }
      if (REMOVE_ADS && isFeedAd(item)) {
        return false;
      }
      return !(REMOVE_LIVE && isFeedLive(item));
    });
    if (kept.length !== data.item.length) {
      data.item = kept;
      changed = true;
    }

    // The promo "floor" strips (bangumi/course/live plugs rendered as
    // .floor-single-card on the web) ride along outside the item list. No
    // sample response has carried one, so this is inference from the field
    // names and still wants a live check.
    if (REMOVE_FLOOR) {
      if (data.floor_info) {
        data.floor_info = null;
        changed = true;
      }
      if (data.business_card) {
        data.business_card = null;
        changed = true;
      }
    }
    return changed;
  }

  // --- search: /x/web-interface/wbi/search/all/v2 ---

  // Search names the ad in the type string: "video_ad_82" for a sponsored
  // video, "picture_ad_0" for a banner, "brand_ad" for the whole top module.
  // Underscore-delimited so ordinary types are never caught by substring luck.
  function isAdType(type) {
    return typeof type === "string" && /(?:^|_)ad(?:_|$)/.test(type);
  }

  function isSearchAd(entry) {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    if (isAdType(entry.type)) {
      return true;
    }
    // Every ad entry also nests its creative under biz_data; ordinary results
    // leave the field null.
    return !!(entry.biz_data && typeof entry.biz_data === "object");
  }

  function filterSearchEntries(list) {
    var kept = list.filter(function (entry) {
      return !isSearchAd(entry);
    });
    return kept.length === list.length ? null : kept;
  }

  function cleanSearch() {
    if (!REMOVE_ADS || !Array.isArray(data.result)) {
      return false;
    }
    var changed = false;

    // /search/type returns data.result as a flat list of results. Unverified —
    // no sample captured yet — but it costs one branch to stay correct if the
    // module is ever pointed at that endpoint.
    var flat = filterSearchEntries(data.result);
    if (flat) {
      data.result = flat;
      return true;
    }

    for (var i = 0; i < data.result.length; i++) {
      var module = data.result[i];
      if (!module || typeof module !== "object" || !Array.isArray(module.data)) {
        continue;
      }
      // A module that exists only to carry ads (brand_ad) is emptied rather
      // than dropped: every idle module in a normal response already ships as
      // data: [], so that is a shape the page is guaranteed to handle.
      if (isAdType(module.result_type)) {
        if (module.data.length) {
          module.data = [];
          changed = true;
        }
        continue;
      }
      var kept = filterSearchEntries(module.data);
      if (kept) {
        module.data = kept;
        changed = true;
      }
    }
    return changed;
  }

  // Both run: a response is only ever one shape, and the other pass bails on
  // its first type check. Assigned separately so neither is short-circuited.
  var feedChanged = cleanFeed();
  var searchChanged = cleanSearch();
  var changed = feedChanged || searchChanged;

  if (!changed) {
    $done({});
    return;
  }

  $done({ body: JSON.stringify(payload) });
})();
