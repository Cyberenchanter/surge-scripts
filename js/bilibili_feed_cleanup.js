(function () {
  "use strict";

  // Toggle any of these off to keep that category in the feed.
  var REMOVE_ADS = true; // goto "ad": banner ads and sponsored videos alike
  var REMOVE_LIVE = true; // goto "live": live room cards
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
  var changed = false;

  // Every commercial card — the plain 广告 banner and the sponsored video that
  // otherwise mimics a normal recommendation — arrives as goto "ad" with
  // business_info.is_ad set. The two differ only in business_info.card_type
  // (0 vs 82), so goto alone covers both.
  function isAd(item) {
    if (item.goto === "ad") {
      return true;
    }
    var business = item.business_info;
    return !!(business && typeof business === "object" && (business.is_ad || business.is_ad_loc));
  }

  // Live rooms come through as goto "live" (see live_<roomid> entries in the
  // request's last_showlist). room_info is not used as a signal: an ordinary
  // video card can carry it when its uploader happens to be streaming.
  function isLive(item) {
    return item.goto === "live";
  }

  function shouldRemove(item) {
    if (!item || typeof item !== "object") {
      return false;
    }
    if (REMOVE_ADS && isAd(item)) {
      return true;
    }
    return REMOVE_LIVE && isLive(item);
  }

  if (Array.isArray(data.item)) {
    var kept = data.item.filter(function (item) {
      return !shouldRemove(item);
    });
    if (kept.length !== data.item.length) {
      data.item = kept;
      changed = true;
    }
  }

  // The promo "floor" strips (bangumi/course/live plugs rendered as
  // .floor-single-card on the web) ride along outside the item list. Neither
  // sample response carried one, so this is inference from the field names and
  // wants a live check.
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

  if (!changed) {
    $done({});
    return;
  }

  $done({ body: JSON.stringify(payload) });
})();
