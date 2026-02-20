(function () {
  const FLAG = "__DRVALUE_WITHFORCE_WIDGET__";
  const VERSION = "2026/02/12:stable";

  if (window[FLAG]?.teardown) {
    try {
      window[FLAG].teardown();
    } catch (e) {
      console.warn("[widget] old teardown error:", e);
    }
  }
  window[FLAG] = { version: VERSION };

  var cfg = window.MyChatbotWidget || {};
  var botUrl = cfg.url || "https://workspace.growxd.com/withforce/chat/home";

  var allowedOrigins = Array.isArray(cfg.allowedOrigins)
    ? cfg.allowedOrigins
    : [];
  var botOrigin = "*";
  try {
    botOrigin = new URL(botUrl).origin;
  } catch (_) {
    botOrigin = "*";
  }
  if (botOrigin !== "*" && !allowedOrigins.includes(botOrigin)) {
    allowedOrigins.unshift(botOrigin);
  }

  var anchor = {
    x: (cfg.anchor && cfg.anchor.x) || "right",
    y: (cfg.anchor && cfg.anchor.y) || "bottom",
  };
  var offset = {
    x: cfg.offset && cfg.offset.x != null ? cfg.offset.x : "1.1rem",
    y: cfg.offset && cfg.offset.y != null ? cfg.offset.y : "4rem",
  };

  function getDefaultDesktopHeight() {
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;
    var h = vh - 150;
    var minH = 480;
    var maxH = Math.max(minH, vh - 40);
    return Math.max(minH, Math.min(h, maxH));
  }

  var baseSize = {
    width: cfg.size && cfg.size.width != null ? cfg.size.width : 600,
    height:
      cfg.size && cfg.size.height != null
        ? cfg.size.height
        : getDefaultDesktopHeight(),
  };

  var isExpanded = false;
  var currentSize = getResponsiveSize();

  window[FLAG].setPosition = function (next) {
    if (next && next.anchor) anchor = Object.assign({}, anchor, next.anchor);
    if (next && next.offset) offset = Object.assign({}, offset, next.offset);
    if (next && next.size) baseSize = Object.assign({}, baseSize, next.size);
    updateWidgetSize();
    updateWidgetPosition();
  };

  var btn, overlay, frameEl, mobClose, iframeEl;
  var swallowNextBtnClick = false;
  var isOpen = false;

  function isMobile() {
    return window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
  }

  function getResponsiveSize() {
    var w = window.innerWidth || document.documentElement.clientWidth || 0;
    var h = window.innerHeight || document.documentElement.clientHeight || 0;
    var isMob = w <= 768;
    var isSmallMob = w <= 480;

    if (isSmallMob) {
      return {
        width: Math.min(w - 40, 400),
        height: Math.min(h * 0.8, 600),
      };
    } else if (isMob) {
      return {
        width: Math.min(w - 60, 450),
        height: Math.min(h * 0.75, 650),
      };
    } else {
      return baseSize;
    }
  }

  function injectStyles() {
    if (document.getElementById("mycbw-style")) return;
    var style = document.createElement("style");
    style.id = "mycbw-style";
    style.textContent = `
      @keyframes mycbw-pop {
        0%   { transform: translateY(16px) scale(.92); opacity: 0; }
        60%  { transform: translateY(-4px) scale(1.03); opacity: 1; }
        100% { transform: translateY(0) scale(1); opacity: 1; }
      }

      .mycbw-btn {
        position: fixed; width: 60px; height: 60px; border-radius: 50%;
        background: linear-gradient(116deg, #05A3E7 20%, #1b64b8 85%);
        color: #fff; display: flex; align-items: center; justify-content: center;
        cursor: pointer; z-index: 10000000; box-shadow: 0 4px 12px rgba(0,0,0,.2);
        font-size: 24px; font-family: Arial, sans-serif;
        animation: mycbw-pop 520ms cubic-bezier(.2,.75,.2,1);
        transition: transform 220ms ease, box-shadow 220ms ease;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        user-select: none;
      }
      .mycbw-btn:hover { transform: translateY(-2px) scale(1.04); }
      .mycbw-btn:active { transform: translateY(0) scale(.98); }

      @media (max-width: 768px) {
        .mycbw-btn {
          margin-bottom: env(safe-area-inset-bottom);
          margin-right: env(safe-area-inset-right);
          margin-left: env(safe-area-inset-left);
        }
      }

      .mycbw-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.0);
        opacity: 0; visibility: hidden; pointer-events: none;
        z-index: 2147483645; transition: opacity 220ms ease;
      }
      .mycbw-overlay.open { opacity: 1; visibility: visible; pointer-events: auto; }

      .mycbw-frame-wrap {
        position: fixed;
        z-index: 2147483646;
        opacity: 0; transform: translateY(12px) scale(.98);
        visibility: hidden; pointer-events: none;
        transition: opacity 260ms cubic-bezier(.2,.75,.2,1), transform 260ms cubic-bezier(.2,.75,.2,1);
        will-change: opacity, transform;
        box-sizing: border-box;
      }
      .mycbw-frame-wrap.open {
        opacity: 1; transform: translateY(0) scale(1);
        visibility: visible; pointer-events: auto;
      }
      .mycbw-frame-wrap.closing {
        opacity: 0; transform: translateY(12px) scale(.98);
        visibility: visible; pointer-events: none;
      }

      .mycbw-frame {
        width: 100%; height: 100%;
        border: 1px solid #ddd; border-radius: 16px; background: #fff; overflow: hidden;
        box-shadow: 0 14px 40px rgba(0,0,0,.28);
        display: block;
      }

      .mycbw-btn .mycbw-btn-close { display: none; }
      .mycbw-btn.open .mycbw-btn-close { display: flex !important; }

      @media (max-width: 768px) {
        .mycbw-frame-wrap {
          inset: 0 !important;
          width: 100vw !important;
          height: 100dvh !important;
          max-height: -webkit-fill-available !important;
          transform: translateY(0) scale(1);
        }
        .mycbw-frame {
          border-radius: 0 !important; border: 0 !important;
          box-shadow: none !important;
        }
        .mycbw-mob-close.open { display: block !important; }
      }

      .mycbw-mob-close {
        position: fixed;
        top: calc(12px + env(safe-area-inset-top));
        right: calc(12px + env(safe-area-inset-right));
        width: 40px; height: 40px; border: 0; border-radius: 9999px;
        background: rgba(0,0,0,.55); color: #fff; font-size: 26px; line-height: 40px; text-align: center;
        z-index: 2147483647; display: none; cursor: pointer;
        box-shadow: 0 6px 18px rgba(0,0,0,.25);
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
      }
      .mycbw-mob-close:active { transform: scale(.96); }

      .mycbw-expand-toggle {
        position: fixed;
        width: 40px; height: 40px; border: 0; border-radius: 9999px;
        background: rgba(0,0,0,.55); color: #fff;
        font-size: 0;
        display: none;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 2147483647;
        box-shadow: 0 6px 18px rgba(0,0,0,.25);
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        padding: 0;
        backdrop-filter: blur(4px);
      }
      .mycbw-expand-toggle svg { width: 24px; height: 24px; }

      @media (max-width: 768px) {
        .mycbw-expand-toggle { display: none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function toCssLen(v) {
    if (typeof v === "number") return v + "px";
    if (typeof v === "string") return v;
    return null;
  }

  function applyYWithLift(base, liftPx) {
    if (typeof base === "number") return base + liftPx + "px";
    if (typeof base === "string")
      return "calc(" + base + " + " + liftPx + "px)";
    return liftPx + "px";
  }

  function applyPositionTo(el, extra) {
    if (!el) return;
    extra = extra || { yLift: 0 };
    el.style.left = el.style.right = el.style.top = el.style.bottom = "";

    var xCss = toCssLen(offset.x);
    if (anchor.x === "left") el.style.left = xCss || "20px";
    else el.style.right = xCss || "20px";

    var lift = extra.yLift || 0;
    var yCss = applyYWithLift(offset.y, lift);
    if (anchor.y === "top") el.style.top = yCss;
    else el.style.bottom = yCss;
  }

  function updateWidgetPosition() {
    applyPositionTo(btn, { yLift: 0 });
    var lift = isExpanded ? 100 : 70;
    applyPositionTo(frameEl, { yLift: lift });
  }

  function updateWidgetSize() {
    var base = getResponsiveSize();
    if (isMobile()) {
      isExpanded = false;
      currentSize = base;
    } else {
      if (isExpanded) {
        var viewportH =
          window.innerHeight || document.documentElement.clientHeight || 0;
        var expandedHeight = Math.max(240, viewportH - (30 + 100));

        var expandedWidth = base.width + 200;
        var maxViewportW =
          (window.innerWidth || document.documentElement.clientWidth || 0) - 40;
        if (maxViewportW > 0)
          expandedWidth = Math.min(expandedWidth, maxViewportW);

        currentSize = { width: expandedWidth, height: expandedHeight };
      } else {
        currentSize = base;
      }
    }
    if (frameEl) {
      frameEl.style.width = currentSize.width + "px";
      frameEl.style.height = currentSize.height + "px";
    }
  }

  function getSession() {
    var m = document.cookie.match(/(?:^|;\s*)PHPSESSID=([^;]+)/);
    return m ? m[1] : null;
  }

  function sendSession(extra) {
    extra = extra || {};
    if (!frameWindow()) return;
    var session = getSession();
    frameWindow().postMessage(
      {
        type: "SET_SESSION",
        phpsessid: session,
        mode: "chat-user-mode",
        ...extra,
      },
      botOrigin === "*" ? "*" : botOrigin
    );
  }

  function frameWindow() {
    return iframeEl && iframeEl.contentWindow ? iframeEl.contentWindow : null;
  }

  function hardResetIframeToHome() {
    if (!iframeEl) return;
    try {
      var cur = new URL(iframeEl.src, location.href).href;
      var home = new URL(botUrl, location.href).href;
      if (cur === home) {
        iframeEl.src = "about:blank";
        setTimeout(function () {
          iframeEl.src = botUrl;
        }, 0);
      } else {
        iframeEl.src = botUrl;
      }
    } catch (_) {
      iframeEl.src = "about:blank";
      setTimeout(function () {
        iframeEl.src = botUrl;
      }, 0);
    }
  }

  var heartbeatId = null;
  var heartbeatStarted = false;

  function startHeartbeat() {
    if (heartbeatStarted) return;
    heartbeatStarted = true;
    if (!heartbeatId) {
      heartbeatId = setInterval(function () {
        sendSession();
      }, 10000);
      window[FLAG]._hb = heartbeatId;
    }
  }

  function stopHeartbeat() {
    if (heartbeatId) {
      clearInterval(heartbeatId);
      heartbeatId = null;
    }
    heartbeatStarted = false;
  }

  function lockScrollMobile() {
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    document.body.style.height = "100%";
  }

  function unlockScrollMobile() {
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    document.body.style.position = "";
    document.body.style.width = "";
    document.body.style.height = "";
  }

  function openPanel() {
    if (isOpen) return;
    hardResetIframeToHome();
    isOpen = true;

    btn.classList.add("open");
    btn.setAttribute("aria-expanded", "true");
    overlay.classList.add("open");
    frameEl.classList.remove("closing");
    frameEl.classList.add("open");

    if (isMobile()) {
      lockScrollMobile();
      mobClose.classList.add("open");
      mobClose.style.display = "block";
    } else {
      mobClose.classList.remove("open");
      mobClose.style.display = "none";
    }

    sendSession({ modal: true });
    startHeartbeat();
  }

  function closePanel() {
    if (!isOpen) return;
    isOpen = false;

    btn.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");

    isExpanded = false;
    updateWidgetSize();

    unlockScrollMobile();
    mobClose.classList.remove("open");
    mobClose.style.display = "none";

    frameEl.classList.add("closing");

    var done = false;
    var finish = function () {
      if (done) return;
      done = true;
      frameEl.classList.remove("open");
      frameEl.classList.remove("closing");
      overlay.classList.remove("open");
      frameEl.removeEventListener("transitionend", onEnd);
      hardResetIframeToHome();
    };

    var onEnd = function (ev) {
      if (ev && ev.target !== frameEl) return;
      finish();
    };

    frameEl.addEventListener("transitionend", onEnd);
    setTimeout(finish, 450);
  }

  window[FLAG].open = function () {
    openPanel();
  };
  window[FLAG].close = function () {
    closePanel();
  };
  window[FLAG].toggle = function () {
    isOpen ? closePanel() : openPanel();
  };

  function fetchWidgetPosition() {
    if (typeof cfg.fetchPosition !== "function") return;

    Promise.resolve()
      .then(function () {
        return cfg.fetchPosition();
      })
      .then(function (res) {
        if (!res) return;
        if (res.anchor) anchor = Object.assign({}, anchor, res.anchor);
        if (res.offset) offset = Object.assign({}, offset, res.offset);
        if (res.size) baseSize = Object.assign({}, baseSize, res.size);
        updateWidgetSize();
        updateWidgetPosition();
      })
      .catch(function (e) {
        console.warn("[widget] fetchPosition error:", e);
      });
  }

  function run() {
    injectStyles();

    btn = document.createElement("div");
    btn.className = "mycbw-btn";
    btn.setAttribute("role", "button");
    btn.setAttribute("tabindex", "0");
    btn.setAttribute("aria-expanded", "false");

    btn.innerHTML = `
      <svg style="position:relative; top:-5px;" width="40" height="40" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bodyGrad" x1="6" y1="10" x2="26" y2="29" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#F2FFD8" stop-opacity="0.98"/>
            <stop offset="40%" stop-color="#BFEA6B" stop-opacity="0.98"/>
            <stop offset="100%" stop-color="#90c31f" stop-opacity="0.98"/>
          </linearGradient>

          <linearGradient id="headGrad" x1="12" y1="1" x2="18" y2="8" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#D9FF7A"/>
            <stop offset="100%" stop-color="#90c31f"/>
          </linearGradient>

          <linearGradient id="shineGrad" x1="8" y1="12" x2="22" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
          </linearGradient>
        </defs>

        <path fill-rule="evenodd" clip-rule="evenodd" d="M15 5C15.3315 5 15.6495 5.1317 15.8839 5.36612C16.1183 5.60054 16.25 5.91848 16.25 6.25V11.25C16.25 11.5815 16.1183 11.8995 15.8839 12.1339C15.6495 12.3683 15.3315 12.5 15 12.5C14.6685 12.5 14.3505 12.3683 14.1161 12.1339C13.8817 11.8995 13.75 11.5815 13.75 11.25V6.25C13.75 5.91848 13.8817 5.60054 14.1161 5.36612C14.3505 5.1317 14.6685 5 15 5Z" fill="url(#bodyGrad)"/>

        <path d="M15 1.25C14.1712 1.25 13.3763 1.57924 12.7903 2.16529C12.2042 2.75134 11.875 3.5462 11.875 4.375C11.875 5.2038 12.2042 5.99866 12.7903 6.58471C13.3763 7.17076 14.1712 7.5 15 7.5C15.8288 7.5 16.6237 7.17076 17.2097 6.58471C17.7958 5.99866 18.125 5.2038 18.125 4.375C18.125 3.5462 17.7958 2.75134 17.2097 2.16529C16.6237 1.57924 15.8288 1.25 15 1.25Z" fill="url(#headGrad)"/>

        <path d="M15 29.0625C18.6994 29.0625 21.3669 28.9619 23.1294 28.8581C25.1594 28.7394 26.8031 27.2281 26.9756 25.1581C27.0894 23.7912 27.1875 21.885 27.1875 19.375C27.1875 16.865 27.0894 14.9587 26.975 13.5919C26.8031 11.5219 25.1594 10.0106 23.1294 9.89187C21.3669 9.78812 18.6994 9.6875 15 9.6875C11.3006 9.6875 8.63312 9.78812 6.87063 9.89187C4.84063 10.0106 3.19688 11.5219 3.02438 13.5919C2.91063 14.9587 2.8125 16.8644 2.8125 19.375C2.8125 21.8856 2.91063 23.7913 3.025 25.1588C3.19688 27.2281 4.84063 28.7394 6.87063 28.8587C8.63312 28.9619 11.3006 29.0625 15 29.0625Z" fill="url(#bodyGrad)"/>

        <path fill-rule="evenodd" clip-rule="evenodd" d="M11.875 16.25C11.875 15.9185 11.7433 15.6005 11.5089 15.3661C11.2745 15.1317 10.9565 15 10.625 15C10.2935 15 9.97554 15.1317 9.74112 15.3661C9.5067 15.6005 9.375 15.9185 9.375 16.25V16.875C9.375 17.2065 9.5067 17.5245 9.74112 17.7589C9.97554 17.9933 10.2935 18.125 10.625 18.125C10.9565 18.125 11.2745 17.9933 11.5089 17.7589C11.7433 17.5245 11.875 17.2065 11.875 16.875V16.25ZM19.375 15C19.0435 15 18.7255 15.1317 18.4911 15.3661C18.2567 15.6005 18.125 15.9185 18.125 16.25V16.875C18.125 17.2065 18.2567 17.5245 18.4911 17.7589C18.7255 17.9933 19.0435 18.125 19.375 18.125C19.7065 18.125 20.0245 17.9933 20.2589 17.7589C20.4933 17.5245 20.625 17.2065 20.625 16.875V16.25C20.625 15.9185 20.4933 15.6005 20.2589 15.3661C20.0245 15.1317 19.7065 15 19.375 15ZM10.3925 21.5906C10.9963 21.0219 11.6831 21.2738 12.2419 21.7088C12.3356 21.7819 12.4962 21.8937 12.7262 22.01C13.1806 22.2406 13.925 22.5 15 22.5C16.075 22.5 16.8194 22.2406 17.2738 22.01C17.4445 21.9253 17.6067 21.8244 17.7581 21.7088C18.3169 21.2738 19.0037 21.0212 19.6075 21.59C20.1269 22.0806 20.1106 22.9125 19.615 23.4025L19.54 23.475C19.4787 23.5306 19.3962 23.6012 19.2931 23.6819C19.0155 23.8957 18.7181 24.0826 18.405 24.24C17.6269 24.6344 16.4969 25 15 25C13.5031 25 12.3731 24.6344 11.595 24.24C11.2819 24.0826 10.9845 23.8957 10.7069 23.6819C10.622 23.6163 10.5399 23.5472 10.4606 23.475C9.92812 22.9863 9.82375 22.1269 10.3925 21.5906Z" fill="#FFFFFF"/>

        <path d="M7.4 12.4C8.6 11.3 10.8 10.6 15 10.6C19.2 10.6 22.4 10.9 24.0 11.2C22.2 11.7 19.3 12.2 15.6 12.6C11.6 13.0 9.2 13.0 7.4 12.4Z" fill="url(#shineGrad)"/>
      </svg>
    `;
    document.body.appendChild(btn);

    var btnClose = document.createElement("div");
    btnClose.className = "mycbw-btn-close";
    btnClose.innerHTML = "&times;";
    Object.assign(btnClose.style, {
      position: "absolute",
      top: "0",
      right: "0",
      width: "20px",
      height: "20px",
      borderRadius: "6px",
      background: "linear-gradient(116deg, #05A3E7 20%, #1b64b8 90%)",
      color: "white",
      fontSize: "20px",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 2px 6px rgba(0,0,0,.2)",
      cursor: "pointer",
    });
    btnClose.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      e.stopPropagation();
      swallowNextBtnClick = true;
      closePanel();
    });
    btn.appendChild(btnClose);

    mobClose = document.createElement("button");
    mobClose.className = "mycbw-mob-close";
    mobClose.setAttribute("aria-label", "닫기");
    mobClose.innerHTML = "&times;";
    mobClose.addEventListener("pointerup", function (e) {
      e.preventDefault();
      e.stopPropagation();
      closePanel();
    });
    mobClose.style.display = "none";
    document.body.appendChild(mobClose);

    overlay = document.createElement("div");
    overlay.className = "mycbw-overlay";
    overlay.addEventListener("pointerup", function (e) {
      e.preventDefault();
      closePanel();
    });
    document.body.appendChild(overlay);

    frameEl = document.createElement("div");
    frameEl.className = "mycbw-frame-wrap";

    iframeEl = document.createElement("iframe");
    iframeEl.className = "mycbw-frame";
    iframeEl.setAttribute(
      "allow",
      "clipboard-read; clipboard-write; microphone; camera"
    );
    iframeEl.src = botUrl;

    frameEl.appendChild(iframeEl);
    document.body.appendChild(frameEl);

    updateWidgetSize();
    updateWidgetPosition();

    fetchWidgetPosition();

    btn.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        isOpen ? closePanel() : openPanel();
      }
    });

    btn.addEventListener("pointerup", function (e) {
      if (swallowNextBtnClick) {
        swallowNextBtnClick = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      isOpen ? closePanel() : openPanel();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closePanel();
    });

    window.addEventListener("message", function (e) {
      var d = e.data;

      if (botOrigin !== "*") {
        var ok = allowedOrigins.includes(e.origin);
        if (!ok) return;
      }

      if (d && d.type === "WIDGET_READY") {
        if (heartbeatStarted) sendSession();
      }

      if (d && d.type === "WIDGET_CONFIG" && d.payload) {
        if (d.payload.anchor)
          anchor = Object.assign({}, anchor, d.payload.anchor);
        if (d.payload.offset)
          offset = Object.assign({}, offset, d.payload.offset);
        if (d.payload.size) {
          baseSize = Object.assign({}, baseSize, d.payload.size);
          updateWidgetSize();
        }
        updateWidgetPosition();
      }
    });

    var resizeTimeout;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(function () {
        updateWidgetSize();
        updateWidgetPosition();
        if (isOpen && isMobile()) {
          lockScrollMobile();
          mobClose.classList.add("open");
          mobClose.style.display = "block";
        } else {
          unlockScrollMobile();
          mobClose.classList.remove("open");
          mobClose.style.display = "none";
        }
      }, 200);
    });

    window.addEventListener("beforeunload", function () {
      stopHeartbeat();
    });

    iframeEl.addEventListener("load", function () {});
  }

  window[FLAG].teardown = function () {
    try {
      clearInterval(window[FLAG]._hb);
    } catch (_) {}
    try {
      unlockScrollMobile();
    } catch (_) {}
    try {
      btn && btn.remove();
    } catch (_) {}
    try {
      overlay && overlay.remove();
    } catch (_) {}
    try {
      frameEl && frameEl.remove();
    } catch (_) {}
    try {
      document.querySelector(".mycbw-mob-close") &&
        document.querySelector(".mycbw-mob-close").remove();
    } catch (_) {}
    try {
      document.getElementById("mycbw-style") &&
        document.getElementById("mycbw-style").remove();
    } catch (_) {}
    try {
      stopHeartbeat();
    } catch (_) {}
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
})();
