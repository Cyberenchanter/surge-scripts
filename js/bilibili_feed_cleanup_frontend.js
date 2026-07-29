(function () {
  "use strict";

  var body = $response.body;

  if (
    typeof body !== "string" ||
    !body ||
    body.indexOf('id="surge-bilibili-feed-cleanup"') !== -1
  ) {
    $done({});
    return;
  }

  var headers = $response.headers || {};
  var contentType = "";
  Object.keys(headers).some(function (name) {
    if (name.toLowerCase() === "content-type") {
      contentType = String(headers[name]);
      return true;
    }
    return false;
  });

  if (contentType && !/(?:text\/html|application\/xhtml\+xml)/i.test(contentType)) {
    $done({});
    return;
  }

  // Bilibili serves the homepage without a CSP nonce, but reuse one if it ever appears.
  var nonceMatch = body.match(/<(?:script|style)\b[^>]*\bnonce\s*=\s*(["'])([^"']+)\1/i);
  var nonce = nonceMatch ? nonceMatch[2] : "";
  var nonceAttribute = nonce
    ? ' nonce="' + nonce.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;") + '"'
    : "";

  // Promo "floor" cards (bangumi/anime, courses, live plugs) are always ads-by-another-name,
  // so they can be hidden by class alone. Everything else needs the page-side pass below.
  var hiddenSelectors = [".floor-single-card", "[data-surge-bili-ad]"];

  var style =
    '<style id="surge-bilibili-feed-cleanup"' +
    nonceAttribute +
    ">" +
    hiddenSelectors.join(",") +
    "{display:none!important}" +
    "</style>";

  // The feed is client-rendered and paginated, so ad cards keep arriving after the
  // document loads. Mark them with an attribute instead of removing the nodes: Vue
  // still owns this DOM and dropping its elements breaks later patches.
  var pageScript = [
    "(function(){",
    '"use strict";',
    // Outermost grid item, so hiding an inner card never leaves an empty wrapper cell.
    "var cardClasses=['feed-card','bili-feed-card','floor-single-card','bili-video-card','bili-live-card'];",
    "function outermostCard(el){",
    "var node=el,found=null;",
    "while(node&&node!==document.body){",
    "if(node.classList){",
    "for(var i=0;i<cardClasses.length;i++){",
    "if(node.classList.contains(cardClasses[i])){found=node;break;}",
    "}",
    "}",
    "node=node.parentElement;",
    "}",
    "return found;",
    "}",
    "function hide(el){",
    "var card=outermostCard(el);",
    // The top banner carousel is a different component that also links through
    // cm.bilibili.com; leave it alone.
    "if(!card||card.closest('.recommended-swipe'))return;",
    "if(!card.hasAttribute('data-surge-bili-ad')){card.setAttribute('data-surge-bili-ad','1');}",
    "}",
    // Every ad and sponsored card routes its links through the ad server, and only
    // sponsored cards carry data-target-url (the real destination behind the tracker).
    "var adLinks='a[href*=\"cm.bilibili.com\"],a[data-target-url]';",
    "function hideAdLinks(root){",
    "var links=root.querySelectorAll?root.querySelectorAll(adLinks):[];",
    "for(var i=0;i<links.length;i++){hide(links[i]);}",
    "}",
    // Plain ad cards show a 广告 badge where the duration normally sits.
    "function hideAdBadges(root){",
    "var badges=root.querySelectorAll?root.querySelectorAll('.bili-video-card__stats--text,.bili-video-card__info--ad,.bili-card-badge'):[];",
    "for(var i=0;i<badges.length;i++){",
    "var text=(badges[i].textContent||'').trim();",
    "if(text==='广告'||text==='廣告'||text==='Ad'){hide(badges[i]);}",
    "}",
    "}",
    // Sponsored videos look like ordinary video cards but swap the duration label for
    // a rocket icon in the stats bar.
    "function hideRocketCards(root){",
    "var icons=root.querySelectorAll?root.querySelectorAll('.bili-video-card__stats>svg.vui_icon'):[];",
    "for(var i=0;i<icons.length;i++){hide(icons[i]);}",
    "}",
    // Live rooms are a distinct component (bili-live-card) wrapped in the usual
    // bili-feed-card grid cell, so hide the wrapper and not just the inner card.
    "function hideLiveCards(root){",
    "var lives=root.querySelectorAll?root.querySelectorAll('.bili-live-card'):[];",
    "for(var i=0;i<lives.length;i++){hide(lives[i]);}",
    "}",
    "function hideFloorCards(root){",
    "var floors=root.querySelectorAll?root.querySelectorAll('.floor-single-card'):[];",
    "for(var i=0;i<floors.length;i++){",
    "if(!floors[i].hasAttribute('data-surge-bili-ad')){floors[i].setAttribute('data-surge-bili-ad','1');}",
    "}",
    "}",
    "function clean(){",
    "hideAdLinks(document);",
    "hideAdBadges(document);",
    "hideRocketCards(document);",
    "hideLiveCards(document);",
    "hideFloorCards(document);",
    "}",
    "clean();",
    "if(document.documentElement){",
    "var queued=false;",
    "new MutationObserver(function(){",
    "if(!queued){queued=true;setTimeout(function(){queued=false;clean();},50);}",
    "}).observe(document.documentElement,{childList:true,subtree:true});",
    "}",
    "})();"
  ].join("");

  var script =
    '<script id="surge-bilibili-feed-cleanup-runtime"' +
    nonceAttribute +
    ">" +
    pageScript +
    "<" +
    "/script>";
  var injection = style + script;

  if (/<\/head\s*>/i.test(body)) {
    body = body.replace(/<\/head\s*>/i, injection + "$&");
  } else if (/<body\b[^>]*>/i.test(body)) {
    body = body.replace(/<body\b[^>]*>/i, "$&" + injection);
  } else {
    $done({});
    return;
  }

  $done({ body: body });
})();
