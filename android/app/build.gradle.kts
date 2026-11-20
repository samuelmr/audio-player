plugins {
    id("com.android.application")
}

android {
    namespace = "app.ctrldash.music"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.ctrldash.music"
        // Android 8, the oldest of the Android TV devices still sold
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    // the TV app, built by npm run build:androidtv
    sourceSets {
        getByName("main") {
            assets.directories.add("../../dist/androidtv")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.18.0")
}
