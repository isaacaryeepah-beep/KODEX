import 'dart:io';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

class MeetingRoomScreen extends StatefulWidget {
  final String meetingId;
  final String title;
  final String token;

  const MeetingRoomScreen({
    super.key,
    required this.meetingId,
    required this.title,
    required this.token,
  });

  @override
  State<MeetingRoomScreen> createState() => _MeetingRoomScreenState();
}

class _MeetingRoomScreenState extends State<MeetingRoomScreen> {
  late final WebViewController _controller;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _init();
  }

  void _init() {
    final encodedTitle = Uri.encodeComponent(widget.title);
    // dikly_auth is stream-room.html's purpose-built cross-origin token
    // handoff — the page copies it into localStorage itself before its auth
    // check runs. More reliable than only injecting localStorage from
    // onPageStarted, which can race the page's own scripts on some Android
    // WebView versions; the injection below stays as a fallback.
    final url = 'https://dikly.sbs/stream-room.html'
        '?meetingId=${widget.meetingId}&title=$encodedTitle'
        '&dikly_auth=${Uri.encodeComponent(widget.token)}';
    // Escape token for safe embedding in a JS string literal
    final safeToken = widget.token.replaceAll(r'\', r'\\').replaceAll('"', r'\"');

    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF080B12))
      ..setNavigationDelegate(NavigationDelegate(
        onPageStarted: (_) async {
          // Inject Dikly JWT before the page's own scripts run
          await _controller.runJavaScript(
            'localStorage.setItem("token", "$safeToken");',
          );
        },
        onPageFinished: (_) {
          if (mounted) setState(() => _loading = false);
        },
        onWebResourceError: (error) {
          debugPrint('[MeetingRoom] WebView error: ${error.description}');
        },
      ))
      ..loadRequest(Uri.parse(url));

    // Android: allow media autoplay and grant camera/mic permissions
    if (Platform.isAndroid) {
      final android = _controller.platform as AndroidWebViewController;
      android.setMediaPlaybackRequiresUserGesture(false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      onPopInvokedWithResult: (didPop, _) async {
        if (!didPop) return;
        await _controller.runJavaScript(
          'if (typeof leaveCall === "function") leaveCall();',
        );
      },
      child: Scaffold(
        backgroundColor: const Color(0xFF080B12),
        body: Stack(
          children: [
            WebViewWidget(controller: _controller),
            if (_loading)
              const Center(
                child: CircularProgressIndicator(color: Color(0xFF4F6EF7)),
              ),
          ],
        ),
      ),
    );
  }
}
