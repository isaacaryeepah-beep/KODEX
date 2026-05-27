import 'dart:convert';
import 'package:hive_flutter/hive_flutter.dart';

// TTL per cache key in seconds
const _ttl = {
  'me':             86400, // 24h
  'timetable':      86400, // 24h
  'courses':        21600, // 6h
  'announcements':   3600, // 1h
  'sessions':        1800, // 30m
  'meetings':        1800, // 30m
  'messages':         900, // 15m
  'assignments':     3600, // 1h
  'quizzes':         3600, // 1h
  'gradebook':       3600, // 1h
  'reports':         3600, // 1h
  'shifts':          3600, // 1h
  'leave_requests':  1800, // 30m
  'timesheets':      1800, // 30m
  'expenses':        1800, // 30m
  'hod_overview':    1800, // 30m
  'subscription':   86400, // 24h
  'performance':     3600, // 1h
  'cached_user':  2592000, // 30 days — offline login
};

const int _defaultTtl = 1800; // 30m fallback

class CacheService {
  static const _boxName = 'dikly_cache';
  static const _metaBox = 'dikly_meta';
  static late Box _box;
  static late Box _meta;

  static Future<void> init() async {
    await Hive.initFlutter();
    _box  = await Hive.openBox(_boxName);
    _meta = await Hive.openBox(_metaBox);
  }

  static Future<void> set(String key, dynamic value) async {
    await _box.put(key, jsonEncode(value));
    await _meta.put('${key}_ts', DateTime.now().millisecondsSinceEpoch);
  }

  static T? get<T>(String key) {
    final raw = _box.get(key);
    if (raw == null) return null;
    final ts = _meta.get('${key}_ts') as int?;
    if (ts != null) {
      final age = (DateTime.now().millisecondsSinceEpoch - ts) ~/ 1000;
      final maxAge = _ttl[_keyBase(key)] ?? _defaultTtl;
      if (age > maxAge) return null; // stale
    }
    try {
      return jsonDecode(raw) as T;
    } catch (_) {
      return null;
    }
  }

  static Future<void> remove(String key) async {
    await _box.delete(key);
    await _meta.delete('${key}_ts');
  }

  static Future<void> clearAll() async {
    await _box.clear();
    await _meta.clear();
  }

  // Pending write queue
  static Future<void> enqueueWrite(Map<String, dynamic> op) async {
    final existing = (_meta.get('write_queue') as String?) ?? '[]';
    final list = (jsonDecode(existing) as List).cast<Map<String, dynamic>>();
    list.add({...op, 'queuedAt': DateTime.now().toIso8601String()});
    await _meta.put('write_queue', jsonEncode(list));
  }

  static List<Map<String, dynamic>> getPendingWrites() {
    final raw = _meta.get('write_queue') as String?;
    if (raw == null) return [];
    return (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
  }

  static Future<void> clearPendingWrites() async {
    await _meta.put('write_queue', '[]');
  }

  static String _keyBase(String key) => key.split(':').first;
}
