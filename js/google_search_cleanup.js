(function () {
  "use strict";

  var body = $response.body;
  var requestUrl = $request.url || "";

  // Leave Google Images, News, and local-result pages untouched.
  if (
    typeof body !== "string" ||
    !body ||
    /[?&]tbm=(?:isch|nws|lcl)(?:[&#]|$)/i.test(requestUrl) ||
    body.indexOf('id="surge-google-search-cleanup"') !== -1
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

  // Reuse Google's nonce so the injected style and script satisfy its CSP.
  var nonceMatch = body.match(/<(?:script|style)\b[^>]*\bnonce\s*=\s*(["'])([^"']+)\1/i);
  var nonce = nonceMatch ? nonceMatch[2] : "";
  var nonceAttribute = nonce
    ? ' nonce="' + nonce.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;") + '"'
    : "";

  var hiddenSelectors = [
    "#tads",
    "#tvcap",
    '[data-text-ad="1"]',
    '[role="region"][aria-label="Ads"]',
    ".GUyUUb[data-vcap=\"1\"]",
    "#Odp5De",
    '[data-attrid="SGE"]',
    '[data-attrid="AIOverview"]'
  ];

  var style =
    '<style id="surge-google-search-cleanup"' +
    nonceAttribute +
    ">" +
    hiddenSelectors.join(",") +
    "{display:none!important}" +
    "</style>";

  // Google can append results after the initial response. This page-side observer
  // removes both initial and dynamically inserted ad/AI Overview containers.
  var pageScript = [
    "(function(){",
    '"use strict";',
    "var selectors=" + JSON.stringify(hiddenSelectors) + ";",
    "var selector=selectors.join(',');",
    "var adContainers='#tads,#tvcap,[data-text-ad=\"1\"],[role=\"region\"][aria-label=\"Ads\"],.GUyUUb[data-vcap=\"1\"],.uEierd,.Yu2Dnd,.PLy5Wb';",
    "var adLabels={ad:1,ads:1,sponsored:1,'sponsored results':1};",
    "function removeMatches(root){",
    "if(root.nodeType===1&&root.matches(selector)){root.remove();return;}",
    "var matches=root.querySelectorAll?root.querySelectorAll(selector):[];",
    "for(var i=0;i<matches.length;i++){matches[i].remove();}",
    "}",
    "function removeLabelledAds(root){",
    "var labels=root.querySelectorAll?root.querySelectorAll('span,div'):[];",
    "for(var i=0;i<labels.length;i++){",
    "var text=(labels[i].textContent||'').trim().toLowerCase();",
    "if(text.length<=24&&adLabels[text]){",
    "var container=labels[i].closest(adContainers);",
    "(container||labels[i]).remove();",
    "}",
    "}",
    "}",
    "function removeAiHeadings(root){",
    "var headings=root.querySelectorAll?root.querySelectorAll('[role=\"heading\"],h1,h2,h3'):[];",
    "for(var i=0;i<headings.length;i++){",
    "if((headings[i].textContent||'').trim().toLowerCase()==='ai overview'){",
    "var container=headings[i].closest('#Odp5De,[data-attrid=\"SGE\"],[data-attrid=\"AIOverview\"],.Kevs9');",
    "(container||headings[i]).remove();",
    "}",
    "}",
    "}",
    "function clean(root){removeMatches(root);removeLabelledAds(root);removeAiHeadings(root);}",
    "function cleanDocument(){clean(document);}",
    "cleanDocument();",
    "if(document.documentElement){",
    "var queued=false;",
    "new MutationObserver(function(){",
    "if(!queued){queued=true;setTimeout(function(){queued=false;cleanDocument();},50);}",
    "}).observe(document.documentElement,{childList:true,subtree:true});",
    "}",
    "})();"
  ].join("");

  var script =
    '<script id="surge-google-search-cleanup-runtime"' +
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
