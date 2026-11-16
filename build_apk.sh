#!/bin/bash
set -o pipefail
cd /mnt/d/coco/酒馆/apk/android || exit 1
SRC=/mnt/d/coco/酒馆
for d in "$SRC/apk/android/app/src/main/assets/public" "$SRC/apk/www"; do
  mkdir -p "$d/js" "$d/vendor" "$d/models"
  cp "$SRC/index.html" "$d/index.html"
  cp "$SRC/styles.css" "$d/styles.css"
  cp "$SRC"/js/*.js "$d/js/"
  cp "$SRC"/vendor/* "$d/vendor/"
  rm -rf "$d/models"
  cp -r "$SRC/models" "$d/models"
done
export ANDROID_HOME=/root/.buildozer/android/platform/android-sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
export JAVA_HOME=$(dirname $(dirname $(readlink -f $(which java))))
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > local.properties
GRADLE=/root/.gradle/wrapper/dists/gradle-8.14.3-all/7fvb7t3ecf8950ol7d3cng34eu/gradle-8.14.3/bin/gradle
echo "JAVA_HOME=$JAVA_HOME"
echo "GRADLE=$GRADLE"
echo "=== gradle start $(date) ==="
"$GRADLE" assembleDebug --no-daemon --console=plain --stacktrace 2>&1
code=$?
echo "=== gradle exit=$code $(date) ==="
if [ $code -eq 0 ]; then
  apk=$(find app/build/outputs/apk -name '*.apk' | head -1)
  echo "APK=$apk"
  if [ -n "$apk" ]; then cp "$apk" /mnt/d/coco/酒馆/暗夜酒馆-debug.apk; ls -lh /mnt/d/coco/酒馆/暗夜酒馆-debug.apk; fi
fi
