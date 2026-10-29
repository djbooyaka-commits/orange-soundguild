plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.orangesoundguild.remote"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.orangesoundguild.remote"
        // Android 11+ is required: screenshots come from the accessibility service.
        minSdk = 30
        targetSdk = 34
        versionCode = 10
        versionName = "2.8"
        buildConfigField("String", "SERVER_URL", "\"https://orangesoundguild.com\"")
    }

    buildFeatures { buildConfig = true }

    signingConfigs {
        if (!System.getenv("OSG_KEYSTORE").isNullOrBlank()) {
            create("stableRelease") {
                storeFile = file(System.getenv("OSG_KEYSTORE"))
                storePassword = System.getenv("OSG_STORE_PASSWORD")
                keyAlias = System.getenv("OSG_KEY_ALIAS")
                keyPassword = System.getenv("OSG_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // CI reuses a cached fallback key, or a durable key supplied in GitHub secrets.
            signingConfig = signingConfigs.findByName("stableRelease") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core:1.13.1")
    implementation("io.getstream:stream-webrtc-android:1.1.3")
    testImplementation("junit:junit:4.13.2")
}
