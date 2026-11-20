// The Google TV app: an Android app that shows the TV app of
// dist/androidtv (npm run build:androidtv) in a WebView
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "CtrlMusic"
include(":app")
