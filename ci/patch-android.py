"""Adds what Health Connect needs to the Android project that `npx cap add android` creates in CI.
Safe to run more than once. Only touches the generated android/ folder."""
import re
import sys
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'android')

# 1) Health Connect needs Android 8.0+ (minSdk 26)
vg = root / 'variables.gradle'
text = vg.read_text()
text2 = re.sub(r'minSdkVersion\s*=\s*\d+', 'minSdkVersion = 26', text)
vg.write_text(text2)
print('minSdk ->', re.search(r'minSdkVersion\s*=\s*\d+', text2).group(0))

# 2) Manifest: rationale screen (Android 13 and lower) + permission usage alias (Android 14+) + queries
mf = root / 'app' / 'src' / 'main' / 'AndroidManifest.xml'
m = mf.read_text()

if 'ACTION_SHOW_PERMISSIONS_RATIONALE' not in m:
    m = re.sub(
        r'(<activity[^>]*android:name="\.MainActivity"[\s\S]*?)(</activity>)',
        lambda x: x.group(1)
        + '    <intent-filter>\n                <action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" />\n            </intent-filter>\n        '
        + x.group(2),
        m,
        count=1,
    )

if 'ViewPermissionUsageActivity' not in m:
    alias = '''
        <activity-alias
            android:name="ViewPermissionUsageActivity"
            android:exported="true"
            android:targetActivity=".MainActivity"
            android:permission="android.permission.START_VIEW_PERMISSION_USAGE">
            <intent-filter>
                <action android:name="android.intent.action.VIEW_PERMISSION_USAGE" />
                <category android:name="android.intent.category.HEALTH_PERMISSIONS" />
            </intent-filter>
        </activity-alias>
'''
    m = m.replace('</application>', alias + '    </application>', 1)

if 'com.google.android.apps.healthdata' not in m:
    q = '''    <queries>
        <package android:name="com.google.android.apps.healthdata" />
    </queries>
'''
    m = m.replace('<application', q + '\n    <application', 1)

perms = ['READ_STEPS', 'READ_HEART_RATE', 'READ_SLEEP', 'READ_DISTANCE', 'READ_TOTAL_CALORIES_BURNED', 'READ_ACTIVE_CALORIES_BURNED']
for p in perms:
    tag = f'<uses-permission android:name="android.permission.health.{p}" />'
    if tag not in m:
        m = m.replace('</manifest>', f'    {tag}\n</manifest>', 1)

mf.write_text(m)
print('manifest patched:', 'ViewPermissionUsageActivity' in m, 'ACTION_SHOW_PERMISSIONS_RATIONALE' in m)
