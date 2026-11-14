# 构建 Android APK（可选）

Web 版是主形态。只有在需要独立 APK 时才需要这些步骤。

## 环境

- Node.js 18+
- JDK 17
- Android SDK（platform 33+、build-tools）
- Gradle（可用 Android Studio 自带）

## 步骤

```powershell
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap init "暗夜酒馆" com.example.tavern --web-dir=www
```

把以下文件放进 `www/`：

- `index.html`
- `worlds-index.js`
- `worlds_data/`（你自己有权使用的书，可选）

```powershell
npx cap add android
npx cap sync
```

在 `capacitor.config.json` 中按需设置：

```json
{
  "server": {
    "androidScheme": "http",
    "cleartext": true
  },
  "android": {
    "allowMixedContent": true
  }
}
```

如果 AI 接口是局域网 HTTP，确保 `AndroidManifest.xml` 允许明文流量：

```xml
<application android:usesCleartextTraffic="true" ...>
```

构建：

```powershell
cd android
./gradlew assembleDebug
```

产物在 `android/app/build/outputs/apk/debug/`。

## 注意

- APK 内如果打包了书，只限个人使用；不要公开分发含版权文本的安装包。
- 原生 HTTP 走 `CapacitorHttp`，用于绕过 WebView 的 CORS；Web 版直接用 `fetch`。
- 公开部署或分发前，请自行处理密钥、权限、内容审核与隐私说明。
