(function () {
  "use strict";

  var body = $response.body;

  if (
    typeof body !== "string" ||
    !body ||
    body.indexOf('id="surge-youtube-shorts-cleanup"') !== -1
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

  // YouTube serves its inline scripts with a CSP nonce, so the injected script
  // has to carry the same one or it will not run.
  var nonceMatch = body.match(/<(?:script|style)\b[^>]*\bnonce\s*=\s*(["'])([^"']+)\1/i);
  var nonce = nonceMatch ? nonceMatch[2] : "";
  var nonceAttribute = nonce
    ? ' nonce="' + nonce.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;") + '"'
    : "";

  // Hidden by selector alone, before any script runs, so the first screen of
  // Shorts that ships inside ytInitialData never paints. The wrappers these
  // sit in are handled by the page script below, which is what stops an empty
  // grid cell or a shelf divider being left behind.
  var hiddenSelectors = [
    "ytd-rich-shelf-renderer[is-shorts]",
    "ytd-reel-shelf-renderer",
    "ytm-shorts-lockup-view-model",
    "ytm-shorts-lockup-view-model-v2",
    "[data-surge-yt-short]"
  ];

  var style =
    '<style id="surge-youtube-shorts-cleanup"' +
    nonceAttribute +
    ">" +
    hiddenSelectors.join(",") +
    "{display:none!important}" +
    "</style>";

  // The API filter already strips Shorts from every browse/search response, so
  // this pass exists for what the document itself carries: the first screen of
  // the home feed, which arrives server-side in ytInitialData rather than over
  // the API.
  var pageScript = [
    "(function(){",
    '"use strict";',
    // Set true to also drop the Shorts entry from the left guide and the
    // Shorts chip from the home/search filter bars. Off by default: those are
    // navigation, not videos.
    "var HIDE_NAV=false;",
    "var MARK='data-surge-yt-short';",
    "var shortsSelectors='ytm-shorts-lockup-view-model,ytm-shorts-lockup-view-model-v2,ytd-reel-shelf-renderer,ytd-rich-shelf-renderer[is-shorts],a[href^=\"/shorts/\"]';",
    "function holdsShorts(el){",
    "return !!el.querySelector('ytm-shorts-lockup-view-model,ytm-shorts-lockup-view-model-v2,ytd-reel-shelf-renderer,ytd-rich-shelf-renderer[is-shorts]');",
    "}",
    // Which ancestors may be hidden, and when. A shelf wrapper is only ever
    // taken when the shelf is a Shorts shelf outright, so a mixed or ordinary
    // shelf that happens to contain one Short loses that card and nothing else.
    "function acceptable(node){",
    "var tag=node.tagName?node.tagName.toLowerCase():'';",
    "if(tag==='ytd-rich-item-renderer'||tag==='ytd-video-renderer')return true;",
    "if(tag==='ytd-rich-shelf-renderer')return node.hasAttribute('is-shorts');",
    "if(tag==='ytd-reel-shelf-renderer')return true;",
    "if(tag==='grid-shelf-view-model')return holdsShorts(node);",
    "if(tag==='ytd-rich-section-renderer')return !!node.querySelector('ytd-rich-shelf-renderer[is-shorts],ytd-reel-shelf-renderer');",
    "return false;",
    "}",
    // Outermost acceptable ancestor: a Short inside the home Shorts shelf takes
    // the whole ytd-rich-section-renderer, a loose card in the grid takes only
    // its own ytd-rich-item-renderer.
    "function outermost(el){",
    "var node=el,found=null;",
    "while(node&&node!==document.body){",
    "if(node.nodeType===1&&acceptable(node))found=node;",
    "node=node.parentElement;",
    "}",
    "return found;",
    "}",
    // Marked, not removed: Polymer still owns this DOM and patches it on every
    // SPA navigation, so detaching its elements breaks the next render.
    "function hide(el){",
    "if(el&&!el.hasAttribute(MARK))el.setAttribute(MARK,'1');",
    "}",
    "function clean(){",
    "var found=document.querySelectorAll(shortsSelectors);",
    "for(var i=0;i<found.length;i++){hide(outermost(found[i]));}",
    "if(HIDE_NAV){",
    "var nav=document.querySelectorAll('ytd-guide-entry-renderer a[href=\"/shorts\"],ytd-mini-guide-entry-renderer a[href=\"/shorts\"]');",
    "for(var j=0;j<nav.length;j++){hide(nav[j].closest('ytd-guide-entry-renderer,ytd-mini-guide-entry-renderer'));}",
    "}",
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
    '<script id="surge-youtube-shorts-cleanup-runtime"' +
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
