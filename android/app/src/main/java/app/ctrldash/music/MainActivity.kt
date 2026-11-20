package app.ctrldash.music

import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.ApplicationInfo
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.window.OnBackInvokedDispatcher
import androidx.webkit.WebViewAssetLoader

// The Google TV app: the TV app of dist/androidtv in a WebView. Its files
// are served from the app's assets at an https address of their own, so
// that the page has storage and can read the bucket like the web app does.
// The arrows and OK go to the page as they come. Back, the media keys and
// the channel keys go to it as key events named by the web's key values
// (src/platform/androidtv.js), as the WebView wouldn't pass them all on.
class MainActivity : Activity() {
    private lateinit var webView: WebView

    private val assets by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    // what the page exits with (tv.js)
    inner class Bridge {
        @JavascriptInterface
        fun exit() = runOnUiThread { finish() }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // the page can be inspected in Chrome's chrome://inspect on a computer
        WebView.setWebContentsDebuggingEnabled(applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0)
        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            // the next track starts without a key press
            settings.mediaPlaybackRequiresUserGesture = false
            // the page's viewport is 1920 pixels wide, scaled to the screen
            settings.useWideViewPort = true
            settings.loadWithOverviewMode = true
            settings.allowFileAccess = false
            // a bucket on the home network may be served over plain http,
            // as the Samsung TV app allows too; the app's own files aren't
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            // the page shows the focus itself
            defaultFocusHighlightEnabled = false
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    assets.shouldInterceptRequest(request.url)

                // the app stays on its page
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) =
                    request.url.host != WebViewAssetLoader.DEFAULT_DOMAIN
            }
            addJavascriptInterface(Bridge(), "AndroidTv")
        }
        setContentView(webView)
        webView.requestFocus()
        if (savedInstanceState == null) {
            webView.loadUrl("https://${WebViewAssetLoader.DEFAULT_DOMAIN}/index.html")
        } else {
            webView.restoreState(savedInstanceState)
        }
        // From Android 13, Back comes as a callback instead of a key
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) {
                sendKey("GoBack")
            }
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val name = KEYS[event.keyCode] ?: return super.dispatchKeyEvent(event)
        if (event.action == KeyEvent.ACTION_DOWN) sendKey(name)
        return true
    }

    // to the focused element, as the remote's other keys go
    private fun sendKey(name: String) {
        webView.evaluateJavascript(
            "(document.activeElement || document.body).dispatchEvent(" +
                "new KeyboardEvent('keydown', {key: '$name', bubbles: true, cancelable: true}))",
            null,
        )
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    // The music plays on under the screensaver: the WebView isn't paused
    // when the activity is. It stops when the app is closed.
    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        // Android's key codes, and their names in the page
        private val KEYS = mapOf(
            KeyEvent.KEYCODE_BACK to "GoBack",
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE to "MediaPlayPause",
            KeyEvent.KEYCODE_MEDIA_PLAY to "MediaPlay",
            KeyEvent.KEYCODE_MEDIA_PAUSE to "MediaPause",
            KeyEvent.KEYCODE_MEDIA_STOP to "MediaStop",
            KeyEvent.KEYCODE_MEDIA_PREVIOUS to "MediaTrackPrevious",
            KeyEvent.KEYCODE_MEDIA_NEXT to "MediaTrackNext",
            KeyEvent.KEYCODE_MEDIA_REWIND to "MediaRewind",
            KeyEvent.KEYCODE_MEDIA_FAST_FORWARD to "MediaFastForward",
            KeyEvent.KEYCODE_CHANNEL_UP to "ChannelUp",
            KeyEvent.KEYCODE_CHANNEL_DOWN to "ChannelDown",
        )
    }
}
