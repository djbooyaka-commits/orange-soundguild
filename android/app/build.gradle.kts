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
        versionCode = 6
        versionName = "2.4"
        buildConfigField("String", "SERVER_URL", "\"https://orangesoundguild.com\"")
    }

    buildFeatures { buildConfig = true }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Signed with the debug key so the APK installs without a keystore setup.
            signingConfig = signingConfigs.getByName("debug")
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
