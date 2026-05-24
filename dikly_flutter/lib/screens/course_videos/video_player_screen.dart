import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../core/theme.dart';

class VideoPlayerScreen extends StatefulWidget {
  final String url;
  final String title;

  const VideoPlayerScreen({super.key, required this.url, required this.title});

  @override
  State<VideoPlayerScreen> createState() => _VideoPlayerScreenState();
}

class _VideoPlayerScreenState extends State<VideoPlayerScreen> {
  late final WebViewController _controller;
  bool _loading = true;
  bool _isFullscreen = false;

  @override
  void initState() {
    super.initState();
    _initController();
  }

  void _initController() {
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.black)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (_) => setState(() => _loading = false),
          onWebResourceError: (error) {
            debugPrint('WebView error: ${error.description}');
          },
        ),
      )
      ..loadRequest(Uri.parse(_buildEmbedUrl(widget.url)));
  }

  String _buildEmbedUrl(String url) {
    // Already an embed URL
    if (url.contains('/embed/') || url.contains('player.vimeo')) return url;

    // Jitsi meetings
    if (url.contains('meet.jit.si') || url.contains('8x8.vc')) return url;

    // YouTube
    final ytRegex = RegExp(
        r'(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})');
    final ytMatch = ytRegex.firstMatch(url);
    if (ytMatch != null) {
      return 'https://www.youtube.com/embed/${ytMatch.group(1)}?autoplay=1&rel=0';
    }

    // Vimeo
    final vimeoRegex = RegExp(r'vimeo\.com\/(\d+)');
    final vimeoMatch = vimeoRegex.firstMatch(url);
    if (vimeoMatch != null) {
      return 'https://player.vimeo.com/video/${vimeoMatch.group(1)}?autoplay=1';
    }

    return url;
  }

  void _toggleFullscreen() {
    setState(() => _isFullscreen = !_isFullscreen);
    if (_isFullscreen) {
      SystemChrome.setPreferredOrientations([DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight]);
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    } else {
      SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp, DeviceOrientation.portraitDown]);
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    }
  }

  @override
  void dispose() {
    if (_isFullscreen) {
      SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp, DeviceOrientation.portraitDown]);
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_isFullscreen) {
      return Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          children: [
            WebViewWidget(controller: _controller),
            if (_loading)
              const Center(child: CircularProgressIndicator(color: Colors.white)),
            Positioned(
              top: 16,
              right: 16,
              child: IconButton(
                icon: const Icon(Icons.fullscreen_exit_rounded, color: Colors.white),
                onPressed: _toggleFullscreen,
              ),
            ),
          ],
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(
          widget.title,
          style: const TextStyle(color: Colors.white, fontSize: 16),
          overflow: TextOverflow.ellipsis,
        ),
        leading: BackButton(
          color: Colors.white,
          onPressed: () => context.pop(),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.fullscreen_rounded, color: Colors.white),
            onPressed: _toggleFullscreen,
          ),
        ],
      ),
      body: Column(
        children: [
          // Video area (16:9 aspect ratio)
          AspectRatio(
            aspectRatio: 16 / 9,
            child: Stack(
              children: [
                WebViewWidget(controller: _controller),
                if (_loading)
                  const Center(
                    child: CircularProgressIndicator(color: DiklyColors.primary),
                  ),
              ],
            ),
          ),
          // Info
          Expanded(
            child: Container(
              color: DiklyColors.background,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Text(
                    widget.title,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(Icons.link_rounded, size: 14, color: DiklyColors.textSecondary),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          widget.url,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: DiklyColors.primary.withOpacity(0.08),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: DiklyColors.primary.withOpacity(0.2)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.info_outline_rounded, size: 16, color: DiklyColors.primary),
                        const SizedBox(width: 8),
                        const Expanded(
                          child: Text(
                            'Tap fullscreen for a better viewing experience',
                            style: TextStyle(fontSize: 12, color: DiklyColors.primary),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.fullscreen_rounded, color: DiklyColors.primary),
                          onPressed: _toggleFullscreen,
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
