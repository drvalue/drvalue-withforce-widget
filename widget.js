(function () {
  const FLAG = "__DRVALUE_WITHFORCE_WIDGET__";
  const VERSION = "2026/02/12:stable";

  // ===== 재실행 시 정리 =====
  if (window[FLAG]?.teardown) {
    try {
      window[FLAG].teardown();
    } catch (e) {
      console.warn("[widget] old teardown error:", e);
    }
  }
  window[FLAG] = { version: VERSION };

  // ===== 설정/기본값 =====
  var cfg = window.MyChatbotWidget || {};
  var botUrl = cfg.url || "https://workspace.growxd.com/withforce/chat/home";

  // postMessage 허용 origin (보안 필수)
  // - 기본: botUrl origin만 허용
  // - 어드민/별도 도메인에서 WIDGET_CONFIG를 보내야 하면 cfg.allowedOrigins에 추가
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

  // 위치 제어용 상태 (기본: 오른쪽-하단 20px)
  var anchor = {
    x: (cfg.anchor && cfg.anchor.x) || "right", // "left" | "right"
    y: (cfg.anchor && cfg.anchor.y) || "bottom", // "top" | "bottom"
  };
  var offset = {
    x: cfg.offset && cfg.offset.x != null ? cfg.offset.x : "1.1rem",
    y: cfg.offset && cfg.offset.y != null ? cfg.offset.y : "4rem",
  };

  // 버튼/패널 기본 크기램프
  function getDefaultDesktopHeight() {
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;
    var h = vh - 150;
    var minH = 480;
    var maxH = Math.max(minH, vh - 40);
    return Math.max(minH, Math.min(h, maxH));
  }

  var baseSize = {
    width: cfg.size && cfg.size.width != null ? cfg.size.width : 500,
    height:
      cfg.size && cfg.size.height != null
        ? cfg.size.height
        : getDefaultDesktopHeight(),
  };

  // 데스크톱 패널 확장 상태 및 크기
  var isExpanded = false;
  var currentSize = getResponsiveSize();

  // ===== 전역 노출 API (대시보드/콘솔에서 호출 가능) =====
  window[FLAG].setPosition = function (next) {
    if (next && next.anchor) anchor = Object.assign({}, anchor, next.anchor);
    if (next && next.offset) offset = Object.assign({}, offset, next.offset);
    if (next && next.size) baseSize = Object.assign({}, baseSize, next.size);
    updateWidgetSize();
    updateWidgetPosition();
  };

  // ===== DOM refs =====
  var btn, overlay, frameEl, mobClose, expandToggle;
  var swallowNextBtnClick = false;
  var isOpen = false;

  // ===== 유틸 =====
  function isMobile() {
    return window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
  }

  // 데스크톱/모바일 반응형 크기 계산
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

  // ===== 스타일 주입 =====
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
        background: linear-gradient(116deg, #D5D9EB -10%, #717BBC 50%, #3E4784 90%);
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

      /* overlay: 바깥 클릭 닫기용 (open일 때만 pointer-events 활성화) */
      .mycbw-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.0);
        opacity: 0; visibility: hidden; pointer-events: none;
        z-index: 2147483645; transition: opacity 220ms ease;
      }
      .mycbw-overlay.open { opacity: 1; visibility: visible; pointer-events: auto; }

      /* iframe wrapper (safe-area padding은 wrapper에서 처리) */
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
      .mycbw-btn.open .mycbw-btn-close { display: flex; }

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
        .mycbw-mob-close.open { display: block; }
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

  // ===== 위치 적용 =====
  function toCssLen(v) {
    // number -> "px"
    if (typeof v === "number") return v + "px";
    // string -> 그대로 (예: "10rem", "calc(100% - 5rem)")
    if (typeof v === "string") return v;
    return null;
  }

  function applyYWithLift(base, liftPx) {
    // base가 number면 더해서 px로
    if (typeof base === "number") return base + liftPx + "px";
    // base가 string이면 calc로 감싸서 더함 (liftPx는 항상 px)
    if (typeof base === "string")
      return "calc(" + base + " + " + liftPx + "px)";
    // base 없으면 lift만
    return liftPx + "px";
  }

  function applyPositionTo(el, extra) {
    if (!el) return;
    extra = extra || { yLift: 0 };
    el.style.left = el.style.right = el.style.top = el.style.bottom = "";

    // X축
    var xCss = toCssLen(offset.x);
    if (anchor.x === "left") el.style.left = xCss || "20px";
    else el.style.right = xCss || "20px";

    // Y축
    var lift = extra.yLift || 0; // px로만 취급
    var yCss = applyYWithLift(offset.y, lift);
    if (anchor.y === "top") el.style.top = yCss;
    else el.style.bottom = yCss;
  }

  // 데스크탑 패널 우측 상단 확장/축소 버튼 위치
  function updateExpandTogglePosition() {
    if (!expandToggle || !frameWrapIsOpen()) return;

    // 모바일은 숨김 유지
    if (isMobile()) {
      expandToggle.style.display = "none";
      return;
    }

    // 패널(frameEl) 위치 기준으로 "패널 안쪽 우측 상단"에 붙이기
    var rect = frameEl.getBoundingClientRect();

    var inset = -5; // 패널 안쪽 여백(px)
    var top = rect.top + inset;
    var right =
      (window.innerWidth || document.documentElement.clientWidth || 0) -
      rect.right +
      inset;

    expandToggle.style.position = "fixed";
    expandToggle.style.top = top + "px";
    expandToggle.style.right = right + "px";
    expandToggle.style.left = "auto";
    expandToggle.style.bottom = "auto";

    expandToggle.style.display = isOpen ? "flex" : "none";
  }

  function frameWrapIsOpen() {
    return frameEl && frameEl.classList && frameEl.classList.contains("open");
  }

  function updateWidgetPosition() {
    applyPositionTo(btn, { yLift: 0 });

    // yLift는 "항상 px 숫자"로만 다룬다.
    // offset.y가 string이면 보정 계산(100 - offset.y)을 못하므로 그냥 70/100 고정 보정만 적용
    var lift = isExpanded ? 100 : 70;
    applyPositionTo(frameEl, { yLift: lift });

    updateExpandTogglePosition();
  }

  // ===== 크기 반영 =====
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
    updateExpandTogglePosition();
  }

  // ===== 세션/하트비트 =====
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
    var iframe =
      frameEl && frameEl.querySelector && frameEl.querySelector("iframe");
    return iframe && iframe.contentWindow ? iframe.contentWindow : null;
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

  // ===== 열기/닫기 =====
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
    isOpen = true;

    btn.classList.add("open");
    btn.setAttribute("aria-expanded", "true");
    overlay.classList.add("open");
    frameEl.classList.remove("closing");
    frameEl.classList.add("open");

    if (!isMobile() && expandToggle) {
      expandToggle.style.display = "flex";
      updateExpandTogglePosition();
    }
    if (isMobile()) {
      lockScrollMobile();
      mobClose.classList.add("open");
    }

    sendSession({ modal: true });
    startHeartbeat();
  }

  function closePanel() {
    if (!isOpen) return;
    isOpen = false;

    btn.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");

    // 확장 초기화
    isExpanded = false;
    updateWidgetSize();

    // 모바일 스크롤 리셋
    unlockScrollMobile();
    mobClose.classList.remove("open");

    // 닫힘 애니메이션
    frameEl.classList.add("closing");

    if (expandToggle) expandToggle.style.display = "none";

    // transitionend 누락 대비 fallback
    var done = false;
    var finish = function () {
      if (done) return;
      done = true;
      frameEl.classList.remove("open");
      frameEl.classList.remove("closing");
      overlay.classList.remove("open");
      frameEl.removeEventListener("transitionend", onEnd);
    };

    var onEnd = function (ev) {
      if (ev && ev.target !== frameEl) return;
      finish();
    };

    frameEl.addEventListener("transitionend", onEnd);
    setTimeout(finish, 450);
  }

  // ===== 원격 설정(fetch) (선택) =====
  function fetchWidgetPosition() {
    // 사용자가 구현 안 했으면 조용히 무시
    if (typeof cfg.fetchPosition !== "function") return;

    Promise.resolve()
      .then(function () {
        return cfg.fetchPosition(); // { anchor, offset, size } 리턴 기대
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

  // ===== 메인 런 =====
  function run() {
    injectStyles();

    // 버튼
    btn = document.createElement("div");
    btn.className = "mycbw-btn";
    btn.setAttribute("role", "button");
    btn.setAttribute("tabindex", "0");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = `
      <svg width="45" height="50" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="iconGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#FFFAEB" />
            <stop offset="100%" stop-color="#FDB022" />
          </linearGradient>
        </defs>
        <path d="M41.3059 24.9773C40.1508 16.4013 32.6091 10.2066 24.0547 10.6452C24.1859 10.381 
            24.3266 10.122 24.4777 9.86898C24.9059 10.122 25.3677 10.311 25.8503 10.4328C27.747 10.9612 
            29.7291 9.92855 30.3835 8.07141C30.7003 7.0483 31.012 5.22224 31.8191 4.44261L33.0278 3.09055C33.2298 
            2.85916 33.2056 2.50776 32.9742 2.30573C32.8896 2.23234 32.7852 2.18572 32.6738 2.17277C32.3837 2.14255 
            25.5516 1.46825 23.4132 4.34677C22.4887 5.4804 22.5767 7.62073 23.6394 9.12647C23.3157 9.64882 23.0308 10.1945 
            22.7865 10.7583C13.9438 11.8798 7.54243 19.8411 8.41091 28.7711C8.61292 30.8518 9.20773 32.8747 10.1634 34.7336C10.3136 
            35.0401 10.3455 35.3915 10.2515 35.7204L8.67162 41.651C8.46616 42.4186 8.92198 43.2077 9.69031 
            43.4132C9.93376 43.4779 10.1902 43.4779 10.4336 43.4132L16.3627 41.8323C16.6916 41.7382 17.043 41.7693 17.3503 
            41.9204C19.6855 43.1248 22.2754 43.7516 24.9033 43.7499C25.6388 43.7499 26.3735 43.7016 27.103 43.6057C36.1684 42.384 42.5283 
            34.0446 41.3068 24.9773H41.3059ZM19.5983 23.387C18.3466 23.387 17.3313 22.3717 17.3313 21.1197C17.3313 19.8678 18.3466 18.8525 
            19.5983 18.8525C20.8501 18.8525 21.8654 19.8678 21.8654 21.1197C21.8654 22.3717 20.8501 23.387 19.5983 23.387ZM24.3396 4.99604C25.5637 
            3.34697 29.2595 3.113 31.4902 3.18897L31.037 3.69578C30.0718 4.64896 29.73 6.5061 29.3613 7.76232C29.3001 7.97903 29.1956 8.1802 29.0549 
            8.35547C27.7996 9.90697 26.225 9.52967 25.1252 8.93911C26.0774 7.59482 27.3585 6.51646 28.846 5.80848C29.13 5.69797 29.2716 5.37765 
            29.1611 5.0936C29.0506 4.80955 28.7303 4.66795 28.4463 4.77933C26.8198 5.52788 25.4118 6.6805 24.356 8.12667C24.343 8.0999 24.3266 8.07573 
            24.3154 8.04896C23.7724 6.74957 23.781 5.7515 24.3413 4.9969L24.3396 4.99604ZM30.4914 24.5197C30.4249 24.6838 29.7913 26.1317 
            27.0995 26.389C24.4078 26.6463 23.5117 25.3451 23.4176 25.1958C23.333 25.0602 23.3053 24.8962 23.3416 24.7408C23.3779 24.5854 
            23.4737 24.4498 23.6092 24.3652C23.7448 24.2806 23.9088 24.253 24.0642 24.2892C24.2196 24.3255 24.3551 24.4213 24.4397 24.5569C24.4552 
            24.5776 25.0423 25.3754 26.9847 25.1889C28.9271 25.0032 29.3527 24.1088 29.37 24.0717C29.4347 23.9275 29.5521 23.8144 29.6989 
            23.7557C29.8448 23.6969 30.0088 23.6961 30.1547 23.7557C30.2997 23.8135 30.4163 23.9257 30.4793 24.0691C30.5423 24.2124 30.5466 24.3738 
            30.4914 24.5197ZM30.1789 22.0919C28.9271 22.0919 27.9119 21.0766 27.9119 19.8247C27.9119 18.5728 28.9271 17.5574 30.1789 17.5574C31.4307 
            17.5574 32.4459 18.5728 32.4459 19.8247C32.4459 21.0766 31.4307 22.0919 30.1789 22.0919Z"
          fill="url(#iconGradient)"
        />
      </svg>`;
    document.body.appendChild(btn);

    // 버튼 내부 클로즈(작은 X)
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
      background: "linear-gradient(116deg, #717BBC 50%, #3E4784 90%)",
      color: "white",
      fontSize: "20px",
      display: "flex",
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

    // 모바일 상단 닫기 버튼
    mobClose = document.createElement("button");
    mobClose.className = "mycbw-mob-close";
    mobClose.setAttribute("aria-label", "닫기");
    mobClose.innerHTML = "&times;";
    mobClose.addEventListener("pointerup", function (e) {
      e.preventDefault();
      e.stopPropagation();
      closePanel();
    });
    document.body.appendChild(mobClose);

    // 데스크탑 패널 우측 상단 확장/축소 버튼
    var fullscreenIcon =
      '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M10.1465 13.1465C10.3417 12.9512 10.6583 12.9512 10.8535 13.1465C11.0488 13.3417 11.0488 13.6583 10.8535 13.8535L7.70703 17H10.5C10.7761 17 11 17.2239 11 17.5C11 17.7761 10.7761 18 10.5 18H6.5C6.22386 18 6 17.7761 6 17.5V13.5C6 13.2239 6.22386 13 6.5 13C6.77614 13 7 13.2239 7 13.5V16.293L10.1465 13.1465ZM17.5 6C17.7761 6 18 6.22386 18 6.5V10.5C18 10.7761 17.7761 11 17.5 11C17.2239 11 17 10.7761 17 10.5V7.70703L13.8535 10.8535C13.6583 11.0488 13.3417 11.0488 13.1465 10.8535C12.9512 10.6583 12.9512 10.3417 13.1465 10.1465L16.293 7H13.5C13.2239 7 13 6.77614 13 6.5C13 6.22386 13.2239 6 13.5 6H17.5Z" fill="#FFFFFF"/></svg>';
    var fullscreenExitIcon =
      '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M10.5 13C10.7761 13 11 13.2239 11 13.5V17.5C11 17.7761 10.7761 18 10.5 18C10.2239 18 10 17.7761 10 17.5V14.707L6.85352 17.8535C6.65825 18.0488 6.34175 18.0488 6.14648 17.8535C5.95122 17.6583 5.95122 17.3417 6.14648 17.1465L9.29297 14H6.5C6.22386 14 6 13.7761 6 13.5C6 13.2239 6.22386 13 6.5 13H10.5ZM17.1465 6.14648C17.3417 5.95122 17.6583 5.95122 17.8535 6.14648C18.0488 6.34175 18.0488 6.65825 17.8535 6.85352L14.707 10H17.5C17.7761 10 18 10.2239 18 10.5C18 10.7761 17.7761 11 17.5 11H13.5C13.2239 11 13 10.7761 13 10.5V6.5C13 6.22386 13.2239 6 13.5 6C13.7761 6 14 6.22386 14 6.5V9.29297L17.1465 6.14648Z" fill="#FFFFFF"/></svg>';

    expandToggle = document.createElement("button");
    expandToggle.className = "mycbw-expand-toggle";
    expandToggle.setAttribute("aria-label", "확대");
    expandToggle.innerHTML = fullscreenIcon;
    expandToggle.addEventListener("pointerup", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (isMobile()) return;
      isExpanded = !isExpanded;
      updateWidgetSize();
      expandToggle.setAttribute("aria-label", isExpanded ? "축소" : "확대");
      expandToggle.innerHTML = isExpanded ? fullscreenExitIcon : fullscreenIcon;
      updateExpandTogglePosition();
    });
    document.body.appendChild(expandToggle);

    // 오버레이 (바깥 클릭 닫기)
    overlay = document.createElement("div");
    overlay.className = "mycbw-overlay";
    overlay.addEventListener("pointerup", function (e) {
      // 패널 외 클릭 닫기: 원치 않으면 이 핸들러 제거
      e.preventDefault();
      closePanel();
    });
    document.body.appendChild(overlay);

    // 패널 wrapper
    frameEl = document.createElement("div");
    frameEl.className = "mycbw-frame-wrap";

    // 실제 iframe
    var iframe = document.createElement("iframe");
    iframe.className = "mycbw-frame";
    iframe.setAttribute(
      "allow",
      "clipboard-read; clipboard-write; microphone; camera"
    );
    iframe.src = botUrl;

    frameEl.appendChild(iframe);
    document.body.appendChild(frameEl);

    // 최초 크기/위치 적용
    updateWidgetSize();
    updateWidgetPosition();

    // API에서 위치 정보 가져오기 (선택)
    fetchWidgetPosition();

    // 키보드 접근성
    btn.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        isOpen ? closePanel() : openPanel();
      }
    });

    // 클릭/터치 통합: pointerup 하나로 처리
    btn.addEventListener("pointerup", function (e) {
      // 내부 X에서 닫고 나서 다음 클릭 삼키기
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

    // postMessage 수신 (보안: allowlist 기반)
    window.addEventListener("message", function (e) {
      var d = e.data;

      // allowlist 체크
      // - botOrigin("*")이면 어쩔 수 없이 허용 범위 넓어짐. 운영에선 botUrl 정상 URL 권장.
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

    // 리사이즈: 크기 + 위치 재적용
    var resizeTimeout;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(function () {
        updateWidgetSize();
        updateWidgetPosition();
        if (expandToggle) {
          if (isOpen && !isMobile()) {
            expandToggle.style.display = "flex";
            updateExpandTogglePosition();
          } else {
            expandToggle.style.display = "none";
          }
        }
        if (isOpen && isMobile()) {
          lockScrollMobile();
          mobClose.classList.add("open");
        } else {
          unlockScrollMobile();
          mobClose.classList.remove("open");
        }
      }, 200);
    });

    // 페이지 이탈 시 하트비트 정리
    window.addEventListener("beforeunload", function () {
      stopHeartbeat();
    });

    // iframe 로드: 필요하면 여기에서 WIDGET_READY 기다리기 전 sendSession도 가능
    iframe.addEventListener("load", function () {
      // no-op
    });
  }

  // teardown
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
      expandToggle && expandToggle.remove();
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
