plugins {
    id("com.android.application")
}

android {
    namespace = "io.github.aodi3622pixel.shadowing"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.aodi3622pixel.shadowing"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "1.2"
    }

    // 固定的调试签名：在任何电脑或 GitHub Actions 上打的包都能直接覆盖安装，不丢阅读进度
    signingConfigs {
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // 应用界面就是网页版：docs/ 原样打包进 assets
    sourceSets {
        getByName("main") {
            assets.srcDir("../../docs")
        }
    }
}
