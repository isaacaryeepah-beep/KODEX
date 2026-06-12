class User {
  final String id;
  final String name;
  final String email;
  final String role;
  final String? portalMode;
  final String? avatar;
  final String? phone;
  final String? department;
  final String? company;
  final String? institutionCode;
  final String? indexNumber;
  final bool isClassRep;
  final bool isApproved;
  final DateTime? createdAt;

  const User({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    this.portalMode,
    this.avatar,
    this.phone,
    this.department,
    this.company,
    this.institutionCode,
    this.indexNumber,
    this.isClassRep = false,
    this.isApproved = true,
    this.createdAt,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['_id']?.toString() ?? json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? json['fullName']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      role: json['role']?.toString() ?? json['loginRole']?.toString() ?? 'student',
      portalMode: json['portalMode']?.toString(),
      avatar: json['avatar']?.toString() ?? json['profilePicture']?.toString(),
      phone: json['phone']?.toString(),
      department: json['department']?.toString(),
      company: (json['company'] is Map ? json['company']['name'] : json['company'])?.toString(),
      institutionCode: json['institutionCode']?.toString() ??
          (json['company'] is Map ? json['company']['institutionCode'] ?? json['company']['code'] : null)?.toString(),
      indexNumber: json['indexNumber']?.toString(),
      isClassRep: json['isClassRep'] == true,
      isApproved: json['isApproved'] != false,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'role': role,
        'portalMode': portalMode,
        'avatar': avatar,
        'phone': phone,
        'department': department,
        'company': company,
        'indexNumber': indexNumber,
        'isClassRep': isClassRep,
        'isApproved': isApproved,
        if (createdAt != null) 'createdAt': createdAt!.toIso8601String(),
      };

  bool get isStudent => role == 'student';
  bool get isLecturer => role == 'lecturer';
  bool get isManager => role == 'manager';
  bool get isAdmin => role == 'admin';
  bool get isHod => role == 'hod';
  bool get isEmployee => role == 'employee';
  bool get isAcademic => portalMode == 'academic';
  bool get isCorporate => portalMode == 'corporate';

  User copyWith({
    String? id,
    String? name,
    String? email,
    String? role,
    String? portalMode,
    String? avatar,
    String? phone,
    String? department,
    DateTime? createdAt,
  }) {
    return User(
      id: id ?? this.id,
      name: name ?? this.name,
      email: email ?? this.email,
      role: role ?? this.role,
      portalMode: portalMode ?? this.portalMode,
      avatar: avatar ?? this.avatar,
      phone: phone ?? this.phone,
      department: department ?? this.department,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}
