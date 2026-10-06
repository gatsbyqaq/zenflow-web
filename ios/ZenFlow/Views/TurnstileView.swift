import SwiftUI
import WebKit

/// Cloudflare Turnstile。站点密钥只允许 `gatsbyqaq.github.io`。
/// 先用 `loadHTMLString` + baseURL 加载官方组件；若组件报错，再打开该域名上的真实页面并注入同一个组件。
struct TurnstileView: UIViewRepresentable {
  var refreshID: Int
  var onToken: (String?) -> Void

  func makeCoordinator() -> Coordinator {
    Coordinator(onToken: onToken)
  }

  func makeUIView(context: Context) -> WKWebView {
    let config = WKWebViewConfiguration()
    let controller = WKUserContentController()
    controller.add(context.coordinator, name: "turnstile")
    config.userContentController = controller
    let web = WKWebView(frame: .zero, configuration: config)
    web.navigationDelegate = context.coordinator
    web.isOpaque = false
    web.backgroundColor = .clear
    web.scrollView.isScrollEnabled = false
    web.scrollView.bounces = false
    web.scrollView.backgroundColor = .clear
    return web
  }

  func updateUIView(_ webView: WKWebView, context: Context) {
    context.coordinator.onToken = onToken
    let scheme = webView.traitCollection.userInterfaceStyle == .dark ? "dark" : "light"
    let signature = "\(refreshID)-\(scheme)"
    guard context.coordinator.signature != signature else { return }
    context.coordinator.signature = signature
    context.coordinator.usedHostedFallback = false
    context.coordinator.scheme = scheme
    context.coordinator.loadInline(webView)
  }

  final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    var onToken: (String?) -> Void
    var signature = ""
    var scheme = "light"
    var usedHostedFallback = false

    init(onToken: @escaping (String?) -> Void) {
      self.onToken = onToken
    }

    func loadInline(_ webView: WKWebView) {
      webView.loadHTMLString(Self.inlineHTML(scheme: scheme), baseURL: AppConfig.turnstileBaseURL)
    }

    func loadHosted(_ webView: WKWebView) {
      webView.load(URLRequest(url: AppConfig.privacyURL))
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
      let body = message.body as? [String: Any]
      let type = body?["type"] as? String ?? ""
      if type == "token", let token = body?["token"] as? String, !token.isEmpty {
        DispatchQueue.main.async { self.onToken(token) }
      } else if type == "error", !usedHostedFallback {
        usedHostedFallback = true
        DispatchQueue.main.async { self.onToken(nil) }
        if let webView = message.webView {
          loadHosted(webView)
        }
      } else {
        DispatchQueue.main.async { self.onToken(nil) }
      }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
      guard usedHostedFallback || webView.url?.host == "gatsbyqaq.github.io" && webView.url?.path.contains("privacy") == true else { return }
      webView.evaluateJavaScript(Self.injectJS(scheme: scheme), completionHandler: nil)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
      if !usedHostedFallback {
        usedHostedFallback = true
        loadHosted(webView)
      }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
      if !usedHostedFallback {
        usedHostedFallback = true
        loadHosted(webView)
      }
    }

    static func inlineHTML(scheme: String) -> String {
      """
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <base href="https://gatsbyqaq.github.io/" />
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
        <style>
          html, body { margin: 0; padding: 0; background: transparent; }
          #box { width: 100%; min-height: 65px; border-radius: 8px; overflow: hidden; }
        </style>
      </head>
      <body>
        <div id="box"></div>
        <script>
          function post(payload) {
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.turnstile) {
              window.webkit.messageHandlers.turnstile.postMessage(payload);
            }
          }
          function mount() {
            if (!window.turnstile) { setTimeout(mount, 80); return; }
            turnstile.render('#box', {
              sitekey: '\(AppConfig.turnstileSiteKey)',
              theme: '\(scheme)',
              language: 'zh-cn',
              size: 'flexible',
              callback: function (token) { post({ type: 'token', token: token }); },
              'expired-callback': function () { post({ type: 'expire' }); },
              'error-callback': function () { post({ type: 'error' }); }
            });
          }
          mount();
        </script>
      </body>
      </html>
      """
    }

    static func injectJS(scheme: String) -> String {
      """
      (function () {
        if (window.__zfTurnstile) return;
        window.__zfTurnstile = true;
        document.body.innerHTML = '<div id="zfbox"></div>';
        document.body.style.cssText = 'margin:0;background:transparent;';
        var box = document.getElementById('zfbox');
        box.style.cssText = 'width:100%;min-height:65px;border-radius:8px;overflow:hidden;';
        function post(payload) {
          window.webkit.messageHandlers.turnstile.postMessage(payload);
        }
        function mount() {
          turnstile.render('#zfbox', {
            sitekey: '\(AppConfig.turnstileSiteKey)',
            theme: '\(scheme)',
            language: 'zh-cn',
            size: 'flexible',
            callback: function (token) { post({ type: 'token', token: token }); },
            'expired-callback': function () { post({ type: 'expire' }); },
            'error-callback': function () { post({ type: 'error' }); }
          });
        }
        var script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__zfMount&render=explicit';
        window.__zfMount = mount;
        script.onerror = function () { post({ type: 'error' }); };
        document.head.appendChild(script);
      })();
      """
    }
  }
}
